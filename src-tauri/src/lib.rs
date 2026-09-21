pub mod commands;
pub mod hardware;
pub mod protocol;
pub mod serial_service;
pub mod test_pattern;

use std::sync::Arc;
use tauri::async_runtime::Mutex;

use commands::app_info::get_app_info;
use commands::hardware::{get_board_profiles, get_hardware_config, save_hardware_config};
use commands::serial::{
    clear_display, connect_device, disconnect_device, get_device_info, get_test_pattern,
    list_serial_ports, ping_device, send_frame, SharedSerialManager,
};
use serial_service::SerialManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let serial_manager: SharedSerialManager = Arc::new(Mutex::new(SerialManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(serial_manager)
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            list_serial_ports,
            connect_device,
            disconnect_device,
            ping_device,
            get_device_info,
            clear_display,
            send_frame,
            get_test_pattern,
            get_board_profiles,
            get_hardware_config,
            save_hardware_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
