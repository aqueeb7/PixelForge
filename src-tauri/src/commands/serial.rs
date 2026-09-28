use std::sync::Arc;
use tauri::async_runtime::{spawn_blocking, Mutex};
use tauri::State;

use crate::protocol::DeviceInfo;
use crate::serial_service::{SerialManager, SerialPortDescription};
use crate::test_pattern::generate_test_pattern;

pub type SharedSerialManager = Arc<Mutex<SerialManager>>;

#[tauri::command]
pub async fn list_serial_ports() -> Result<Vec<SerialPortDescription>, String> {
    spawn_blocking(SerialManager::list_ports)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn connect_device(
    port: String,
    baud_rate: Option<u32>,
    state: State<'_, SharedSerialManager>,
) -> Result<DeviceInfo, String> {
    let baud = baud_rate.unwrap_or(115200);
    let manager = state.inner().clone();

    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.connect(&port, baud)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn disconnect_device(state: State<'_, SharedSerialManager>) -> Result<(), String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.disconnect()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn ping_device(state: State<'_, SharedSerialManager>) -> Result<u32, String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.ping()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_device_info(state: State<'_, SharedSerialManager>) -> Result<DeviceInfo, String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.get_device_info()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn clear_display(state: State<'_, SharedSerialManager>) -> Result<(), String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.clear_display()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn send_frame(
    bitmap_data: Vec<u8>,
    state: State<'_, SharedSerialManager>,
) -> Result<(), String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.send_frame(&bitmap_data)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn get_test_pattern() -> Result<Vec<u8>, String> {
    Ok(generate_test_pattern())
}

#[tauri::command]
pub async fn upload_and_play_reel(
    frames: Vec<Vec<u8>>,
    target_fps: u16,
    state: State<'_, SharedSerialManager>,
) -> Result<usize, String> {
    let count = frames.len();
    if count == 0 {
        return Err("Cannot upload empty animation reel".to_string());
    }

    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        // 1. Tell ESP32 to prepare RAM for the new reel
        let allocated_count = mg.start_reel_upload(count as u16, target_fps).map_err(|e| {
            if e.contains("Unsupported command") {
                "ESP32 firmware update required: Your device does not support on-device reel storage in its currently flashed firmware. Please reflash firmware/src/main.cpp, or use 'Export Reel' -> 'Copy Standalone Arduino Sketch' to upload via Arduino IDE without desktop serial!".to_string()
            } else {
                e
            }
        })?;

        let upload_limit = std::cmp::min(count, allocated_count);

        // 2. Upload each 1024-byte frame up to allocated limit
        for (i, frame) in frames.iter().take(upload_limit).enumerate() {
            mg.append_reel_frame(i as u16, frame)?;
        }

        // 3. Command ESP32 to immediately begin autonomous infinite-loop playback
        mg.play_reel(target_fps)?;
        Ok(upload_limit)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn stop_device_reel(
    state: State<'_, SharedSerialManager>,
) -> Result<(), String> {
    let manager = state.inner().clone();
    spawn_blocking(move || {
        let mut mg = manager.blocking_lock();
        mg.stop_reel()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
