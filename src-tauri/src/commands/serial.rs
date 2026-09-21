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
