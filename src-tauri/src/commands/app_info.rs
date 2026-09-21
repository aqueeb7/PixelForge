use serde::Serialize;

/// Information about the PixelForge application returned to the frontend.
#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
}

/// Returns basic application metadata.
///
/// Tauri command — called from the frontend via `invoke("get_app_info")`.
#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME").to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
    }
}
