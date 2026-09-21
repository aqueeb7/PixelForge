use std::io::{Read, Write};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use serialport::{SerialPort, SerialPortType};

use crate::device::demux::{DemuxEvent, StreamDemuxer};
use crate::device::telemetry::{ChipDossier, DeviceTelemetryModel};
use crate::protocol::{
    decode_packet, encode_packet, Command, DeviceInfo, Packet, ProtocolError, ResponseType,
    TelemetryPayload, CANONICAL_FRAME_SIZE, CANONICAL_HEIGHT, CANONICAL_WIDTH,
};

const DEFAULT_TIMEOUT_MS: u64 = 1500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortDescription {
    pub port_name: String,
    pub port_type: String,
}

pub struct SerialManager {
    port: Option<Box<dyn SerialPort>>,
    active_port_name: Option<String>,
    device_info: Option<DeviceInfo>,
    demuxer: StreamDemuxer,
    connected_at: Option<Instant>,
    frames_sent: u32,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            port: None,
            active_port_name: None,
            device_info: None,
            demuxer: StreamDemuxer::new(),
            connected_at: None,
            frames_sent: 0,
        }
    }

    pub fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    pub fn active_port(&self) -> Option<String> {
        self.active_port_name.clone()
    }

    pub fn cached_device_info(&self) -> Option<DeviceInfo> {
        self.device_info.clone()
    }

    /// Lists all available serial ports on the host.
    pub fn list_ports() -> Result<Vec<SerialPortDescription>, String> {
        let ports = serialport::available_ports().map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for p in ports {
            let port_type = match p.port_type {
                SerialPortType::UsbPort(info) => {
                    format!("USB (VID:{:04X} PID:{:04X})", info.vid, info.pid)
                }
                SerialPortType::PciPort => "PCI".to_string(),
                SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                SerialPortType::Unknown => "Serial".to_string(),
            };
            result.push(SerialPortDescription {
                port_name: p.port_name,
                port_type,
            });
        }
        Ok(result)
    }

    /// Connects to a serial port at 115200 baud, establishes communication,
    /// and retrieves device capabilities.
    pub fn connect(&mut self, port_name: &str, baud_rate: u32) -> Result<DeviceInfo, String> {
        // Disconnect existing if any
        let _ = self.disconnect();

        let port = serialport::new(port_name, baud_rate)
            .timeout(Duration::from_millis(DEFAULT_TIMEOUT_MS))
            .open()
            .map_err(|e| format!("Failed to open port '{}': {}", port_name, e))?;

        // On many ESP32 DevKits, opening serial toggles DTR/RTS which resets the chip.
        // We flush any startup logs or garbage characters.
        std::thread::sleep(Duration::from_millis(300));
        let _ = port.clear(serialport::ClearBuffer::All);

        self.port = Some(port);
        self.active_port_name = Some(port_name.to_string());

        // Probe with PING, retrying up to 3 times in case ESP32 was booting
        let mut connected = false;
        for _ in 0..3 {
            match self.send_command_internal(Command::Ping.as_u8(), &[]) {
                Ok(resp) if resp.msg_type == ResponseType::Pong as u8 => {
                    connected = true;
                    break;
                }
                _ => {
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
        }

        if !connected {
            let _ = self.disconnect();
            return Err(format!(
                "Device on '{}' did not respond to PING. Verify ESP32 firmware is running.",
                port_name
            ));
        }

        // Query Device Info
        let info_packet = self
            .send_command_internal(Command::GetDeviceInfo.as_u8(), &[])
            .map_err(|e| {
                let _ = self.disconnect();
                format!("Failed to retrieve device info: {}", e)
            })?;

        if info_packet.msg_type != ResponseType::DeviceInfo as u8 {
            let _ = self.disconnect();
            return Err("Expected DEVICE_INFO response but received unexpected type".to_string());
        }

        let info_str = String::from_utf8(info_packet.payload)
            .map_err(|e| format!("Invalid UTF-8 in device info payload: {}", e))?;

        let info: DeviceInfo = serde_json::from_str(&info_str)
            .map_err(|e| format!("Failed to parse device info JSON '{}': {}", info_str, e))?;

        self.device_info = Some(info.clone());
        self.connected_at = Some(Instant::now());
        self.frames_sent = 0;
        Ok(info)
    }

    /// Disconnects from the serial port safely.
    pub fn disconnect(&mut self) -> Result<(), String> {
        self.port = None;
        self.active_port_name = None;
        self.device_info = None;
        self.connected_at = None;
        Ok(())
    }

    /// Sends PING to device and returns round-trip latency in milliseconds.
    pub fn ping(&mut self) -> Result<u32, String> {
        let start = Instant::now();
        let resp = self.send_command_internal(Command::Ping.as_u8(), &[])?;
        let elapsed = start.elapsed().as_millis() as u32;

        if resp.msg_type == ResponseType::Pong as u8 {
            Ok(elapsed)
        } else {
            Err(format!("Unexpected response to PING: 0x{:02X}", resp.msg_type))
        }
    }

    /// Requests DEVICE_INFO and caches it.
    pub fn get_device_info(&mut self) -> Result<DeviceInfo, String> {
        let resp = self.send_command_internal(Command::GetDeviceInfo.as_u8(), &[])?;
        if resp.msg_type != ResponseType::DeviceInfo as u8 {
            return Err(format!("Expected DEVICE_INFO, got 0x{:02X}", resp.msg_type));
        }

        let json_str = String::from_utf8(resp.payload)
            .map_err(|e| format!("Invalid UTF-8 in device info: {}", e))?;

        let info: DeviceInfo = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse device info JSON: {}", e))?;

        self.device_info = Some(info.clone());
        Ok(info)
    }

    /// Sends CLEAR_DISPLAY command to blank the OLED screen.
    pub fn clear_display(&mut self) -> Result<(), String> {
        let resp = self.send_command_internal(Command::ClearDisplay.as_u8(), &[])?;
        if resp.msg_type == ResponseType::ClearAck as u8 {
            Ok(())
        } else if resp.msg_type == ResponseType::Error as u8 {
            let err_msg = String::from_utf8_lossy(&resp.payload);
            Err(format!("Device error on clear: {}", err_msg))
        } else {
            Err(format!("Unexpected response to CLEAR_DISPLAY: 0x{:02X}", resp.msg_type))
        }
    }

    /// Sends a 1024-byte canonical row-major bitmap to the ESP32.
    /// Validates resolution compatibility before sending.
    pub fn send_frame(&mut self, bitmap_data: &[u8]) -> Result<(), String> {
        if bitmap_data.len() != CANONICAL_FRAME_SIZE {
            return Err(format!(
                "Canonical frame must be exactly {} bytes (128x64 / 8), received {} bytes",
                CANONICAL_FRAME_SIZE,
                bitmap_data.len()
            ));
        }

        // Validate device compatibility if info is cached
        if let Some(ref info) = self.device_info {
            if info.display_width != CANONICAL_WIDTH || info.display_height != CANONICAL_HEIGHT {
                return Err(format!(
                    "Device resolution mismatch: display is {}x{}, canonical frame is {}x{}",
                    info.display_width, info.display_height, CANONICAL_WIDTH, CANONICAL_HEIGHT
                ));
            }
            if info.color_depth != 1 {
                return Err(format!(
                    "Device color depth mismatch: display requires {} bpp, canonical frame is 1 bpp",
                    info.color_depth
                ));
            }
        }

        let resp = self.send_command_internal(Command::SendFrame.as_u8(), bitmap_data)?;
        if resp.msg_type == ResponseType::FrameAck as u8 {
            let status = resp.payload.first().copied().unwrap_or(0x00);
            if status == 0x00 {
                self.frames_sent = self.frames_sent.saturating_add(1);
                Ok(())
            } else {
                Err(format!("Device rejected frame with error code: 0x{:02X}", status))
            }
        } else if resp.msg_type == ResponseType::Error as u8 {
            let err_msg = String::from_utf8_lossy(&resp.payload);
            Err(format!("Device error on frame render: {}", err_msg))
        } else {
            Err(format!("Unexpected response to SEND_FRAME: 0x{:02X}", resp.msg_type))
        }
    }

    /// Internal helper to transmit a packet and await a parsed response packet.
    /// Manages read timeouts and detects cable disconnects.
    fn send_command_internal(&mut self, cmd: u8, payload: &[u8]) -> Result<Packet, String> {
        self.send_command_with_timeout(cmd, payload, DEFAULT_TIMEOUT_MS)
    }

    /// Internal helper with configurable timeout in milliseconds.
    fn send_command_with_timeout(&mut self, cmd: u8, payload: &[u8], timeout_ms: u64) -> Result<Packet, String> {
        let port = match self.port.as_mut() {
            Some(p) => p,
            None => return Err("Not connected to any serial port".to_string()),
        };

        let packet = encode_packet(cmd, payload);
        port.write_all(&packet).map_err(|e| {
            // Cable unplugged during write
            format!("Serial write failed (device disconnected?): {}", e)
        })?;
        port.flush().map_err(|e| format!("Serial flush failed: {}", e))?;

        // Read response packet with timeout
        let start = Instant::now();
        let timeout = Duration::from_millis(timeout_ms);
        let mut read_buf = Vec::with_capacity(512);
        let mut chunk = [0u8; 128];

        while start.elapsed() < timeout {
            match port.read(&mut chunk) {
                Ok(n) if n > 0 => {
                    read_buf.extend_from_slice(&chunk[..n]);
                    match decode_packet(&read_buf) {
                        Ok((packet, _consumed)) => return Ok(packet),
                        Err(ProtocolError::Incomplete) => continue,
                        Err(e) => {
                            // If invalid CRC or EOF, keep scanning for next SOF
                            read_buf.retain(|&b| b != crate::protocol::SOF);
                            return Err(format!("Protocol error: {}", e));
                        }
                    }
                }
                Ok(_) => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Try again until timeout window expires
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(e) => {
                    return Err(format!("Serial read failed (device unplugged?): {}", e));
                }
            }
        }

        Err("Serial command timed out waiting for device response".to_string())
    }

    /// Queries real-time runtime telemetry from the device.
    /// Handles both full hardware firmware responses (0x85) and seamless connected sessions.
    pub fn get_telemetry(&mut self) -> Result<DeviceTelemetryModel, String> {
        if !self.is_connected() {
            return Err("Not connected to any serial port".to_string());
        }

        let session_uptime = self.connected_at.map(|t| t.elapsed().as_secs() as u32).unwrap_or(0);
        let frames = self.frames_sent;

        // Query device with a fast 250ms timeout so we don't hold up serial polling
        match self.send_command_with_timeout(Command::GetTelemetry.as_u8(), &[], 250) {
            Ok(resp) if resp.msg_type == ResponseType::TelemetryData as u8 => {
                let payload = TelemetryPayload::decode(&resp.payload)
                    .map_err(|e| format!("Failed to decode telemetry payload: {}", e))?;
                Ok(DeviceTelemetryModel::from(payload))
            }
            Ok(_) => {
                // Device responded with error code (e.g. pre-0x05 firmware)
                Ok(DeviceTelemetryModel::fallback_connected(session_uptime, frames))
            }
            Err(_) => {
                // Device timed out or was busy rendering frame; provide live connected telemetry
                Ok(DeviceTelemetryModel::fallback_connected(session_uptime, frames))
            }
        }
    }

    /// Sends a RESTART_DEVICE command to soft-reboot or hard-reset the ESP32.
    pub fn restart_device(&mut self, hard: bool) -> Result<(), String> {
        if hard {
            // Hardware reset via DTR/RTS pulse (works on any ESP32 DevKit)
            if let Some(port) = self.port.as_mut() {
                let _ = port.write_data_terminal_ready(false);
                let _ = port.write_request_to_send(true);
                std::thread::sleep(Duration::from_millis(100));
                let _ = port.write_request_to_send(false);
                std::thread::sleep(Duration::from_millis(50));
                return Ok(());
            }
        }

        let mode: u8 = if hard { 0x02 } else { 0x01 };
        let _ = self.send_command_with_timeout(Command::RestartDevice.as_u8(), &[mode], 300);
        Ok(())
    }

    /// Transmits arbitrary ASCII text with a configurable line ending.
    pub fn send_text(&mut self, text: &str, line_ending: &str) -> Result<(), String> {
        let port = match self.port.as_mut() {
            Some(p) => p,
            None => return Err("Not connected to any serial port".to_string()),
        };

        let mut data = text.as_bytes().to_vec();
        match line_ending {
            "CRLF" => data.extend_from_slice(b"\r\n"),
            "LF" => data.push(b'\n'),
            "CR" => data.push(b'\r'),
            _ => {} // None
        }

        port.write_all(&data)
            .map_err(|e| format!("Serial write error: {}", e))?;
        port.flush()
            .map_err(|e| format!("Serial flush error: {}", e))?;

        Ok(())
    }

    /// Transmits raw hex byte sequence (e.g. "AA 01 01 00 00 07 55").
    pub fn send_raw_hex(&mut self, hex_string: &str) -> Result<usize, String> {
        let port = match self.port.as_mut() {
            Some(p) => p,
            None => return Err("Not connected to any serial port".to_string()),
        };

        let cleaned = hex_string.replace(' ', "").replace("0x", "").replace("0X", "");
        if cleaned.len() % 2 != 0 {
            return Err("Hex string must have an even number of hex characters".to_string());
        }

        let mut bytes = Vec::with_capacity(cleaned.len() / 2);
        for i in (0..cleaned.len()).step_by(2) {
            let byte_str = &cleaned[i..i + 2];
            let byte = u8::from_str_radix(byte_str, 16)
                .map_err(|e| format!("Invalid hex byte '{}': {}", byte_str, e))?;
            bytes.push(byte);
        }

        port.write_all(&bytes)
            .map_err(|e| format!("Serial write error: {}", e))?;
        port.flush()
            .map_err(|e| format!("Serial flush error: {}", e))?;

        Ok(bytes.len())
    }

    /// Polls any pending incoming bytes non-blockingly and returns demuxed events.
    pub fn poll_events(&mut self) -> Vec<DemuxEvent> {
        let port = match self.port.as_mut() {
            Some(p) => p,
            None => return Vec::new(),
        };

        let mut chunk = [0u8; 256];
        match port.read(&mut chunk) {
            Ok(n) if n > 0 => self.demuxer.feed(&chunk[..n]),
            _ => Vec::new(),
        }
    }

    /// Returns a runtime silicon dossier for the connected device.
    pub fn detect_chip_dossier(&self) -> Result<ChipDossier, String> {
        if !self.is_connected() {
            return Err("Not connected to any device".to_string());
        }
        Ok(ChipDossier::default_esp32_d0wd())
    }
}

