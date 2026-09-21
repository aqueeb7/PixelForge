use crate::hardware::{BoardProfile, HardwareConfig};
use std::fs;
use std::path::PathBuf;

fn get_config_path() -> PathBuf {
    // In local desktop mode, store in current working dir or temp
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push("hardware.json");
    path
}

/// Returns list of standard ESP32 board definitions supported by PixelForge.
#[tauri::command]
pub fn get_board_profiles() -> Vec<BoardProfile> {
    BoardProfile::get_standard_profiles()
}

/// Retrieves the saved hardware configuration or the canonical default.
#[tauri::command]
pub fn get_hardware_config() -> HardwareConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<HardwareConfig>(&content) {
                return config;
            }
        }
    }
    HardwareConfig::default_oled_config()
}

/// Saves the hardware configuration to hardware.json.
#[tauri::command]
pub fn save_hardware_config(config: HardwareConfig) -> Result<(), String> {
    let path = get_config_path();
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Serialization error: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write hardware.json: {}", e))?;
    Ok(())
}
