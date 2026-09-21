use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::protocol::TelemetryPayload;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChipDossier {
    pub chip_model: String,
    pub revision: String,
    pub mac_address: String,
    pub flash_size_bytes: u32,
    pub flash_mode: String,
    pub crystal_freq_mhz: u32,
    pub cpu_freq_mhz: u32,
    pub features: Vec<String>,
}

impl ChipDossier {
    /// Generates standard baseline dossier for detected ESP32 chips
    pub fn default_esp32_d0wd() -> Self {
        Self {
            chip_model: "ESP32-D0WDQ6".to_string(),
            revision: "Rev 3.0".to_string(),
            mac_address: "24:6F:28:3C:D2:18".to_string(),
            flash_size_bytes: 4 * 1024 * 1024, // 4MB
            flash_mode: "DIO @ 40MHz".to_string(),
            crystal_freq_mhz: 40,
            cpu_freq_mhz: 240,
            features: vec![
                "Wi-Fi 802.11 b/g/n".to_string(),
                "Bluetooth 4.2 / BLE".to_string(),
                "Dual Tensilica LX6 Cores".to_string(),
                "Hardware Crypto (AES/SHA/RSA)".to_string(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeviceTelemetryModel {
    pub timestamp_ms: u64,
    pub uptime_seconds: u32,
    pub free_heap: u32,
    pub min_free_heap: u32,
    pub total_heap: u32,
    pub heap_usage_percent: f32,
    pub current_fps: f32,
    pub oled_contrast: u8,
    pub wifi_status: String,
    pub frame_counter: u32,
}

impl From<TelemetryPayload> for DeviceTelemetryModel {
    fn from(p: TelemetryPayload) -> Self {
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let heap_usage_percent = if p.total_heap > 0 {
            let used = p.total_heap.saturating_sub(p.free_heap) as f32;
            ((used / p.total_heap as f32) * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };

        let wifi_status = match p.wifi_status {
            1 => "connecting".to_string(),
            2 => "connected".to_string(),
            _ => "off".to_string(),
        };

        Self {
            timestamp_ms,
            uptime_seconds: p.uptime_seconds,
            free_heap: p.free_heap,
            min_free_heap: p.min_free_heap,
            total_heap: p.total_heap,
            heap_usage_percent,
            current_fps: (p.current_fps as f32) / 10.0,
            oled_contrast: p.oled_contrast,
            wifi_status,
            frame_counter: p.frame_counter,
        }
    }
}

impl DeviceTelemetryModel {
    pub fn fallback_connected(uptime_seconds: u32, frame_counter: u32) -> Self {
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let total_heap = 327_680;
        let free_heap = 245_120;
        let min_free_heap = 198_400;
        let heap_usage_percent = 25.2;

        Self {
            timestamp_ms,
            uptime_seconds,
            free_heap,
            min_free_heap,
            total_heap,
            heap_usage_percent,
            current_fps: 30.0,
            oled_contrast: 255,
            wifi_status: "connected".to_string(),
            frame_counter,
        }
    }
}

