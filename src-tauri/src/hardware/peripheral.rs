use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeripheralDevice {
    pub id: String,
    #[serde(rename = "type")]
    pub device_type: String,
    pub name: String,
    pub controller: Option<String>,
    pub i2c_address: Option<String>,
    /// Map of logical role (e.g. "SDA", "SCL", "VCC", "GND", "SIGNAL") to pin label (e.g. "D21", "D22", "3V3", "GND")
    pub pins: HashMap<String, String>,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HardwareConfig {
    pub version: u32,
    pub board_id: String,
    pub board_name: String,
    pub peripherals: Vec<PeripheralDevice>,
}

impl HardwareConfig {
    /// Canonical default hardware configuration for PixelForge:
    /// ESP32 DevKit V1 30-pin with 1.3" Monochrome OLED on I2C (0x3C, SDA=D21, SCL=D22)
    pub fn default_oled_config() -> Self {
        let mut oled_pins = HashMap::new();
        oled_pins.insert("VCC".to_string(), "3V3".to_string());
        oled_pins.insert("GND".to_string(), "GND".to_string());
        oled_pins.insert("SDA".to_string(), "D21 (SDA)".to_string());
        oled_pins.insert("SCL".to_string(), "D22 (SCL)".to_string());

        let oled_peripheral = PeripheralDevice {
            id: "oled-display-primary".to_string(),
            device_type: "OLED_128X64_I2C".to_string(),
            name: "1.3\" Monochrome OLED (128x64)".to_string(),
            controller: Some("SH1106".to_string()),
            i2c_address: Some("0x3C".to_string()),
            pins: oled_pins,
            status: "configured".to_string(),
        };

        HardwareConfig {
            version: 1,
            board_id: "esp32-devkit-v1-38p".to_string(),
            board_name: "ESP32 DevKit V1 (38-pin)".to_string(),
            peripherals: vec![oled_peripheral],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = HardwareConfig::default_oled_config();
        assert_eq!(cfg.version, 1);
        assert_eq!(cfg.peripherals.len(), 1);
        let oled = &cfg.peripherals[0];
        assert_eq!(oled.device_type, "OLED_128X64_I2C");
        assert_eq!(oled.pins.get("SDA").unwrap(), "D21 (SDA)");
        assert_eq!(oled.pins.get("SCL").unwrap(), "D22 (SCL)");
    }
}
