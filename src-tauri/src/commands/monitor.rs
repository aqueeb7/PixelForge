use tauri::async_runtime::spawn_blocking;
use tauri::State;

use crate::commands::serial::SharedSerialManager;
use crate::device::demux::DemuxEvent;
use crate::device::flasher::esp32::Esp32Flasher;
use crate::device::flasher::{DeviceFlasher, FlashProgress};
use crate::device::telemetry::{ChipDossier, DeviceTelemetryModel};

#[tauri::command]
pub async fn get_telemetry(
    state: State<'_, SharedSerialManager>,
) -> Result<DeviceTelemetryModel, String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.get_telemetry()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn restart_device(
    hard: bool,
    state: State<'_, SharedSerialManager>,
) -> Result<(), String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.restart_device(hard)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn send_serial_command(
    text: String,
    line_ending: String,
    state: State<'_, SharedSerialManager>,
) -> Result<(), String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.send_text(&text, &line_ending)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn send_serial_raw_hex(
    hex_string: String,
    state: State<'_, SharedSerialManager>,
) -> Result<usize, String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.send_raw_hex(&hex_string)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn poll_serial_events(
    state: State<'_, SharedSerialManager>,
) -> Result<Vec<String>, String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        let events = mg.poll_events();
        let mut lines = Vec::new();
        for ev in events {
            match ev {
                DemuxEvent::LogLine(line) => lines.push(format!("[LOG] {}", line)),
                DemuxEvent::Bootloader(line) => lines.push(format!("[BOOT] {}", line)),
                DemuxEvent::Packet(pkt) => {
                    lines.push(format!("[PKT] Type:0x{:02X} Len:{}", pkt.msg_type, pkt.payload.len()))
                }
            }
        }
        lines
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))
}

#[tauri::command]
pub async fn detect_chip_dossier(
    state: State<'_, SharedSerialManager>,
) -> Result<ChipDossier, String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mg = manager.blocking_lock();
        mg.detect_chip_dossier()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn flash_firmware(
    port: String,
    file_bytes: Option<Vec<u8>>,
    offset: Option<u32>,
    baud_rate: Option<u32>,
) -> Result<(), String> {
    let baud = baud_rate.unwrap_or(460800);
    let target_offset = offset.unwrap_or(0x10000);
    let binary_data = file_bytes.unwrap_or_else(|| {
        // Pre-bundled canonical PixelForge ESP32 firmware stub (64KB placeholder)
        vec![0xE9; 64 * 1024]
    });

    spawn_blocking(move || {
        let mut flasher = Esp32Flasher::new(&port, baud);
        flasher.write_image(target_offset, &binary_data, Box::new(|_p: FlashProgress| {
            // Can be wired to Tauri window emit if desired
        }))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn erase_device_flash(
    port: String,
    baud_rate: Option<u32>,
) -> Result<(), String> {
    let baud = baud_rate.unwrap_or(115200);

    spawn_blocking(move || {
        let mut flasher = Esp32Flasher::new(&port, baud);
        flasher.erase_flash(Box::new(|_p: FlashProgress| {}))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
