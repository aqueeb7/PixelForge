use std::thread;
use std::time::Duration;
use tauri::async_runtime::spawn_blocking;
use tauri::{Emitter, Manager, State};

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
    state: State<'_, SharedSerialManager>,
) -> Result<(), String> {
    let manager = state.inner().clone();
    {
        let mut mg = manager.lock().await;
        let _ = mg.disconnect();
    }
    thread::sleep(Duration::from_millis(600));

    let baud = baud_rate.unwrap_or(460800);
    let target_offset = offset.unwrap_or(0x10000);
    let binary_data = file_bytes.unwrap_or_else(|| {
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
    state: State<'_, SharedSerialManager>,
) -> Result<(), String> {
    let manager = state.inner().clone();
    {
        let mut mg = manager.lock().await;
        let _ = mg.disconnect();
    }
    thread::sleep(Duration::from_millis(600));

    let baud = baud_rate.unwrap_or(115200);

    spawn_blocking(move || {
        let mut flasher = Esp32Flasher::new(&port, baud);
        flasher.erase_flash(Box::new(|_p: FlashProgress| {}))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn resolve_firmware_paths(app: &tauri::AppHandle) -> Result<(std::path::PathBuf, std::path::PathBuf, std::path::PathBuf), String> {
    let mut candidates = Vec::new();

    // 1. Current workspace / dev directories
    candidates.push(std::path::PathBuf::from("src-tauri/resources"));
    candidates.push(std::path::PathBuf::from("resources"));

    // 2. Tauri resource directory
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("resources"));
        candidates.push(res_dir.clone());
    }

    // 3. Executable directory parent
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("resources"));
            candidates.push(exe_dir.to_path_buf());
        }
    }

    for dir in &candidates {
        let fw = dir.join("pixelforge_firmware.bin");
        let bl = dir.join("bootloader.bin");
        let pt = dir.join("partitions.bin");
        if fw.exists() && bl.exists() && pt.exists() {
            return Ok((bl, pt, fw));
        }
    }

    // Fallback: check firmware/.pio build artifacts directly
    let pio_dir = std::path::PathBuf::from("firmware/.pio/build/esp32dev");
    let fw = pio_dir.join("firmware.bin");
    let bl = pio_dir.join("bootloader.bin");
    let pt = pio_dir.join("partitions.bin");
    if fw.exists() && bl.exists() && pt.exists() {
        return Ok((bl, pt, fw));
    }

    Err(format!(
        "Could not find firmware binaries. Checked: {}",
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
    ))
}

#[tauri::command]
pub async fn flash_pixelforge_firmware(
    app: tauri::AppHandle,
    state: State<'_, SharedSerialManager>,
    port: Option<String>,
) -> Result<String, String> {
    let (bl_path, pt_path, fw_path) = resolve_firmware_paths(&app)?;

    let manager = state.inner().clone();

    // Determine target port: explicit param -> active port -> first detected port
    let target_port = {
        let mg = manager.lock().await;
        if let Some(p) = port.filter(|s| !s.trim().is_empty()) {
            p
        } else if let Some(active) = mg.active_port() {
            active
        } else {
            // Find first available serial port
            let ports = serialport::available_ports().map_err(|e| e.to_string())?;
            ports
                .first()
                .map(|p| p.port_name.clone())
                .ok_or_else(|| "No ESP32 serial port found. Please connect your ESP32 via USB.".to_string())?
        }
    };

    // Close any active serial connection so esptool can claim the port exclusively
    {
        let mut mg = manager.lock().await;
        let _ = mg.disconnect();
    }

    // Cooldown to allow OS / USB-UART driver to release COM port handle
    thread::sleep(Duration::from_millis(600));

    let app_handle = app.clone();
    let port_clone = target_port.clone();

    let flash_res = spawn_blocking(move || {
        let flasher = Esp32Flasher::new(&port_clone, 460800);
        flasher.flash_with_esptool(
            bl_path.to_str().unwrap_or(""),
            pt_path.to_str().unwrap_or(""),
            fw_path.to_str().unwrap_or(""),
            &|progress: FlashProgress| {
                let _ = app_handle.emit("firmware-flash-progress", &progress);
            },
        )
    })
    .await
    .map_err(|e| format!("Flash thread join error: {}", e))?;

    flash_res?;

    // Wait 1.5s for ESP32 to boot up and initialize OLED
    thread::sleep(Duration::from_millis(1500));

    // Auto-reconnect to the freshly flashed ESP32
    {
        let mut mg = manager.lock().await;
        let _ = mg.connect(&target_port, 115200);
    }

    Ok(format!("Successfully flashed PixelForge firmware to {}", target_port))
}

