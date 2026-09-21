use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PinCapability {
    Power3V3,
    Power5V,
    Gnd,
    GpioIn,
    GpioOut,
    I2cSda,
    I2cScl,
    SpiMosi,
    SpiMiso,
    SpiSck,
    SpiCs,
    Adc1,
    Adc2,
    Dac,
    Touch,
    UartRx,
    UartTx,
    Reset,
    FlashReserved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PinDefinition {
    pub pin_number: u8,
    pub label: String,
    pub gpio: Option<u8>,
    pub capabilities: Vec<PinCapability>,
    pub is_strapping: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoardProfile {
    pub id: String,
    pub name: String,
    pub chip_family: String,
    pub form_factor: String,
    pub pin_count: u8,
    pub left_header: Vec<PinDefinition>,
    pub right_header: Vec<PinDefinition>,
}

impl BoardProfile {
    /// Standard ESP32 DevKit V1 30-pin board definition
    pub fn esp32_devkit_v1_30p() -> Self {
        use PinCapability::*;

        let left_header = vec![
            PinDefinition {
                pin_number: 1,
                label: "EN".to_string(),
                gpio: None,
                capabilities: vec![Reset],
                is_strapping: false,
                notes: Some("Chip enable / Reset button. Pull LOW to restart MCU.".to_string()),
            },
            PinDefinition {
                pin_number: 2,
                label: "VP (GPIO36)".to_string(),
                gpio: Some(36),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Input only. No internal pull-up/down resistors. ADC1 channel 0.".to_string()),
            },
            PinDefinition {
                pin_number: 3,
                label: "VN (GPIO39)".to_string(),
                gpio: Some(39),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Input only. No internal pull-up/down resistors. ADC1 channel 3.".to_string()),
            },
            PinDefinition {
                pin_number: 4,
                label: "D34".to_string(),
                gpio: Some(34),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Input only. ADC1 channel 6.".to_string()),
            },
            PinDefinition {
                pin_number: 5,
                label: "D35".to_string(),
                gpio: Some(35),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Input only. ADC1 channel 7.".to_string()),
            },
            PinDefinition {
                pin_number: 6,
                label: "D32".to_string(),
                gpio: Some(32),
                capabilities: vec![GpioIn, GpioOut, Adc1, Touch],
                is_strapping: false,
                notes: Some("ADC1 channel 4, Touch 9, 32KHz crystal.".to_string()),
            },
            PinDefinition {
                pin_number: 7,
                label: "D33".to_string(),
                gpio: Some(33),
                capabilities: vec![GpioIn, GpioOut, Adc1, Touch],
                is_strapping: false,
                notes: Some("ADC1 channel 5, Touch 8, 32KHz crystal.".to_string()),
            },
            PinDefinition {
                pin_number: 8,
                label: "D25".to_string(),
                gpio: Some(25),
                capabilities: vec![GpioIn, GpioOut, Dac, Adc2],
                is_strapping: false,
                notes: Some("DAC Channel 1 (8-bit analog output). ADC2 channel 8.".to_string()),
            },
            PinDefinition {
                pin_number: 9,
                label: "D26".to_string(),
                gpio: Some(26),
                capabilities: vec![GpioIn, GpioOut, Dac, Adc2],
                is_strapping: false,
                notes: Some("DAC Channel 2 (8-bit analog output). ADC2 channel 9.".to_string()),
            },
            PinDefinition {
                pin_number: 10,
                label: "D27".to_string(),
                gpio: Some(27),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: false,
                notes: Some("ADC2 channel 7, Touch 7.".to_string()),
            },
            PinDefinition {
                pin_number: 11,
                label: "D14".to_string(),
                gpio: Some(14),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch, SpiSck],
                is_strapping: false,
                notes: Some("HSPI SCK, ADC2 channel 6, Touch 6.".to_string()),
            },
            PinDefinition {
                pin_number: 12,
                label: "D12".to_string(),
                gpio: Some(12),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch, SpiMiso],
                is_strapping: true,
                notes: Some("MTDI strapping pin. Controls flash voltage (3.3V vs 1.8V). Avoid pulling HIGH at boot.".to_string()),
            },
            PinDefinition {
                pin_number: 13,
                label: "D13".to_string(),
                gpio: Some(13),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch, SpiMosi],
                is_strapping: false,
                notes: Some("HSPI MOSI, ADC2 channel 4, Touch 4.".to_string()),
            },
            PinDefinition {
                pin_number: 14,
                label: "GND".to_string(),
                gpio: None,
                capabilities: vec![Gnd],
                is_strapping: false,
                notes: Some("Common Ground reference.".to_string()),
            },
            PinDefinition {
                pin_number: 15,
                label: "VIN (5V)".to_string(),
                gpio: None,
                capabilities: vec![Power5V],
                is_strapping: false,
                notes: Some("5V power input from USB or external regulator.".to_string()),
            },
        ];

        let right_header = vec![
            PinDefinition {
                pin_number: 16,
                label: "D23 (MOSI)".to_string(),
                gpio: Some(23),
                capabilities: vec![GpioIn, GpioOut, SpiMosi],
                is_strapping: false,
                notes: Some("Default VSPI MOSI (Master Out Slave In).".to_string()),
            },
            PinDefinition {
                pin_number: 17,
                label: "D22 (SCL)".to_string(),
                gpio: Some(22),
                capabilities: vec![GpioIn, GpioOut, I2cScl],
                is_strapping: false,
                notes: Some("Default hardware I2C SCL (Clock). Recommended for OLED SCL.".to_string()),
            },
            PinDefinition {
                pin_number: 18,
                label: "TX0 (GPIO1)".to_string(),
                gpio: Some(1),
                capabilities: vec![GpioIn, GpioOut, UartTx],
                is_strapping: false,
                notes: Some("UART0 TX (connected to USB-UART chip for flashing and logging).".to_string()),
            },
            PinDefinition {
                pin_number: 19,
                label: "RX0 (GPIO3)".to_string(),
                gpio: Some(3),
                capabilities: vec![GpioIn, GpioOut, UartRx],
                is_strapping: false,
                notes: Some("UART0 RX (connected to USB-UART chip for flashing and logging).".to_string()),
            },
            PinDefinition {
                pin_number: 20,
                label: "D21 (SDA)".to_string(),
                gpio: Some(21),
                capabilities: vec![GpioIn, GpioOut, I2cSda],
                is_strapping: false,
                notes: Some("Default hardware I2C SDA (Data). Recommended for OLED SDA.".to_string()),
            },
            PinDefinition {
                pin_number: 21,
                label: "D19 (MISO)".to_string(),
                gpio: Some(19),
                capabilities: vec![GpioIn, GpioOut, SpiMiso],
                is_strapping: false,
                notes: Some("Default VSPI MISO (Master In Slave Out).".to_string()),
            },
            PinDefinition {
                pin_number: 22,
                label: "D18 (SCK)".to_string(),
                gpio: Some(18),
                capabilities: vec![GpioIn, GpioOut, SpiSck],
                is_strapping: false,
                notes: Some("Default VSPI SCK (Clock).".to_string()),
            },
            PinDefinition {
                pin_number: 23,
                label: "D5 (CS)".to_string(),
                gpio: Some(5),
                capabilities: vec![GpioIn, GpioOut, SpiCs],
                is_strapping: true,
                notes: Some("VSPI CS (Chip Select). Strapping pin (timing configuration).".to_string()),
            },
            PinDefinition {
                pin_number: 24,
                label: "TX2 (GPIO17)".to_string(),
                gpio: Some(17),
                capabilities: vec![GpioIn, GpioOut, UartTx],
                is_strapping: false,
                notes: Some("UART2 TX (Secondary UART port).".to_string()),
            },
            PinDefinition {
                pin_number: 25,
                label: "RX2 (GPIO16)".to_string(),
                gpio: Some(16),
                capabilities: vec![GpioIn, GpioOut, UartRx],
                is_strapping: false,
                notes: Some("UART2 RX (Secondary UART port).".to_string()),
            },
            PinDefinition {
                pin_number: 26,
                label: "D4".to_string(),
                gpio: Some(4),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: false,
                notes: Some("ADC2 channel 0, Touch 0.".to_string()),
            },
            PinDefinition {
                pin_number: 27,
                label: "D2 (LED)".to_string(),
                gpio: Some(2),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: true,
                notes: Some("On-board LED on many DevKits. Strapping pin (must be floating or LOW for flashing).".to_string()),
            },
            PinDefinition {
                pin_number: 28,
                label: "D15".to_string(),
                gpio: Some(15),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: true,
                notes: Some("MTDO strapping pin (enables debug print if HIGH at boot).".to_string()),
            },
            PinDefinition {
                pin_number: 29,
                label: "GND".to_string(),
                gpio: None,
                capabilities: vec![Gnd],
                is_strapping: false,
                notes: Some("Common Ground reference.".to_string()),
            },
            PinDefinition {
                pin_number: 30,
                label: "3V3".to_string(),
                gpio: None,
                capabilities: vec![Power3V3],
                is_strapping: false,
                notes: Some("3.3V regulated power rail (outputs up to 500-600mA).".to_string()),
            },
        ];

        BoardProfile {
            id: "esp32-devkit-v1-30p".to_string(),
            name: "ESP32 DevKit V1 (30-pin)".to_string(),
            chip_family: "ESP32-D0WDQ6".to_string(),
            form_factor: "devkit-v1-30p".to_string(),
            pin_count: 30,
            left_header,
            right_header,
        }
    }

    /// Standard ESP32 DevKitC V4 38-pin board definition matching physical silkscreen
    pub fn esp32_devkit_v1_38p() -> Self {
        use PinCapability::*;

        let left_header = vec![
            PinDefinition {
                pin_number: 1,
                label: "3V3".to_string(),
                gpio: None,
                capabilities: vec![Power3V3],
                is_strapping: false,
                notes: Some("3.3V regulated power rail (up to 500-600mA).".to_string()),
            },
            PinDefinition {
                pin_number: 2,
                label: "EN".to_string(),
                gpio: None,
                capabilities: vec![Reset],
                is_strapping: false,
                notes: Some("Chip enable / Reset button (active LOW).".to_string()),
            },
            PinDefinition {
                pin_number: 3,
                label: "VP (GPIO36)".to_string(),
                gpio: Some(36),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Sensor VP. Input-only, ADC1 channel 0, low-noise.".to_string()),
            },
            PinDefinition {
                pin_number: 4,
                label: "VN (GPIO39)".to_string(),
                gpio: Some(39),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Sensor VN. Input-only, ADC1 channel 3, low-noise.".to_string()),
            },
            PinDefinition {
                pin_number: 5,
                label: "P34".to_string(),
                gpio: Some(34),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Input-only pin. ADC1 channel 6.".to_string()),
            },
            PinDefinition {
                pin_number: 6,
                label: "P35".to_string(),
                gpio: Some(35),
                capabilities: vec![GpioIn, Adc1],
                is_strapping: false,
                notes: Some("Input-only pin. ADC1 channel 7.".to_string()),
            },
            PinDefinition {
                pin_number: 7,
                label: "P32".to_string(),
                gpio: Some(32),
                capabilities: vec![GpioIn, GpioOut, Adc1, Touch],
                is_strapping: false,
                notes: Some("ADC1 channel 4, Touch 9, 32KHz RTC crystal.".to_string()),
            },
            PinDefinition {
                pin_number: 8,
                label: "P33".to_string(),
                gpio: Some(33),
                capabilities: vec![GpioIn, GpioOut, Adc1, Touch],
                is_strapping: false,
                notes: Some("ADC1 channel 5, Touch 8, 32KHz RTC crystal.".to_string()),
            },
            PinDefinition {
                pin_number: 9,
                label: "P25".to_string(),
                gpio: Some(25),
                capabilities: vec![GpioIn, GpioOut, Dac, Adc2],
                is_strapping: false,
                notes: Some("DAC Channel 1 (8-bit analog output). ADC2 channel 8.".to_string()),
            },
            PinDefinition {
                pin_number: 10,
                label: "P26".to_string(),
                gpio: Some(26),
                capabilities: vec![GpioIn, GpioOut, Dac, Adc2],
                is_strapping: false,
                notes: Some("DAC Channel 2 (8-bit analog output). ADC2 channel 9.".to_string()),
            },
            PinDefinition {
                pin_number: 11,
                label: "P27".to_string(),
                gpio: Some(27),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: false,
                notes: Some("ADC2 channel 7, Touch 7.".to_string()),
            },
            PinDefinition {
                pin_number: 12,
                label: "P14".to_string(),
                gpio: Some(14),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch, SpiSck],
                is_strapping: false,
                notes: Some("HSPI SCK, ADC2 channel 6, Touch 6.".to_string()),
            },
            PinDefinition {
                pin_number: 13,
                label: "P12".to_string(),
                gpio: Some(12),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch, SpiMiso],
                is_strapping: true,
                notes: Some("MTDI strapping pin. Controls flash voltage (3.3V vs 1.8V). Do not pull HIGH during boot.".to_string()),
            },
            PinDefinition {
                pin_number: 14,
                label: "GND".to_string(),
                gpio: None,
                capabilities: vec![Gnd],
                is_strapping: false,
                notes: Some("Common Ground reference.".to_string()),
            },
            PinDefinition {
                pin_number: 15,
                label: "P13".to_string(),
                gpio: Some(13),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch, SpiMosi],
                is_strapping: false,
                notes: Some("HSPI MOSI, ADC2 channel 4, Touch 4.".to_string()),
            },
            PinDefinition {
                pin_number: 16,
                label: "SD2".to_string(),
                gpio: Some(9),
                capabilities: vec![GpioIn, GpioOut, FlashReserved],
                is_strapping: false,
                notes: Some("GPIO 9 (D2). Connected to internal SPI flash memory! Avoid using.".to_string()),
            },
            PinDefinition {
                pin_number: 17,
                label: "SD3".to_string(),
                gpio: Some(10),
                capabilities: vec![GpioIn, GpioOut, FlashReserved],
                is_strapping: false,
                notes: Some("GPIO 10 (D3). Connected to internal SPI flash memory! Avoid using.".to_string()),
            },
            PinDefinition {
                pin_number: 18,
                label: "CMD".to_string(),
                gpio: Some(11),
                capabilities: vec![GpioIn, GpioOut, FlashReserved],
                is_strapping: false,
                notes: Some("GPIO 11 (CMD). Connected to internal SPI flash memory! Avoid using.".to_string()),
            },
            PinDefinition {
                pin_number: 19,
                label: "5V".to_string(),
                gpio: None,
                capabilities: vec![Power5V],
                is_strapping: false,
                notes: Some("5V power input from USB or external regulator.".to_string()),
            },
        ];

        let right_header = vec![
            PinDefinition {
                pin_number: 20,
                label: "GND".to_string(),
                gpio: None,
                capabilities: vec![Gnd],
                is_strapping: false,
                notes: Some("Common Ground reference.".to_string()),
            },
            PinDefinition {
                pin_number: 21,
                label: "P23".to_string(),
                gpio: Some(23),
                capabilities: vec![GpioIn, GpioOut, SpiMosi],
                is_strapping: false,
                notes: Some("Default VSPI MOSI (Master Out Slave In).".to_string()),
            },
            PinDefinition {
                pin_number: 22,
                label: "P22 (SCL)".to_string(),
                gpio: Some(22),
                capabilities: vec![GpioIn, GpioOut, I2cScl],
                is_strapping: false,
                notes: Some("Default hardware I2C SCL (Clock). Recommended for OLED SCL.".to_string()),
            },
            PinDefinition {
                pin_number: 23,
                label: "TX".to_string(),
                gpio: Some(1),
                capabilities: vec![GpioIn, GpioOut, UartTx],
                is_strapping: false,
                notes: Some("UART0 TX (connected to USB-UART chip for flashing and logging).".to_string()),
            },
            PinDefinition {
                pin_number: 24,
                label: "RX".to_string(),
                gpio: Some(3),
                capabilities: vec![GpioIn, GpioOut, UartRx],
                is_strapping: false,
                notes: Some("UART0 RX (connected to USB-UART chip for flashing and logging).".to_string()),
            },
            PinDefinition {
                pin_number: 25,
                label: "P21 (SDA)".to_string(),
                gpio: Some(21),
                capabilities: vec![GpioIn, GpioOut, I2cSda],
                is_strapping: false,
                notes: Some("Default hardware I2C SDA (Data). Recommended for OLED SDA.".to_string()),
            },
            PinDefinition {
                pin_number: 26,
                label: "GND".to_string(),
                gpio: None,
                capabilities: vec![Gnd],
                is_strapping: false,
                notes: Some("Common Ground reference.".to_string()),
            },
            PinDefinition {
                pin_number: 27,
                label: "P19".to_string(),
                gpio: Some(19),
                capabilities: vec![GpioIn, GpioOut, SpiMiso],
                is_strapping: false,
                notes: Some("Default VSPI MISO (Master In Slave Out).".to_string()),
            },
            PinDefinition {
                pin_number: 28,
                label: "P18".to_string(),
                gpio: Some(18),
                capabilities: vec![GpioIn, GpioOut, SpiSck],
                is_strapping: false,
                notes: Some("Default VSPI SCK (Clock).".to_string()),
            },
            PinDefinition {
                pin_number: 29,
                label: "P5".to_string(),
                gpio: Some(5),
                capabilities: vec![GpioIn, GpioOut, SpiCs],
                is_strapping: true,
                notes: Some("VSPI CS (Chip Select). Strapping pin (timing configuration).".to_string()),
            },
            PinDefinition {
                pin_number: 30,
                label: "P17".to_string(),
                gpio: Some(17),
                capabilities: vec![GpioIn, GpioOut, UartTx],
                is_strapping: false,
                notes: Some("UART2 TX (Secondary UART port).".to_string()),
            },
            PinDefinition {
                pin_number: 31,
                label: "P16".to_string(),
                gpio: Some(16),
                capabilities: vec![GpioIn, GpioOut, UartRx],
                is_strapping: false,
                notes: Some("UART2 RX (Secondary UART port).".to_string()),
            },
            PinDefinition {
                pin_number: 32,
                label: "P4".to_string(),
                gpio: Some(4),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: false,
                notes: Some("ADC2 channel 0, Touch 0.".to_string()),
            },
            PinDefinition {
                pin_number: 33,
                label: "P0 (BOOT)".to_string(),
                gpio: Some(0),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: true,
                notes: Some("Boot button. Strapping pin: LOW puts chip in UART download bootloader mode.".to_string()),
            },
            PinDefinition {
                pin_number: 34,
                label: "P2 (LED)".to_string(),
                gpio: Some(2),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: true,
                notes: Some("On-board LED on many DevKits. Strapping pin (must be floating or LOW for flashing).".to_string()),
            },
            PinDefinition {
                pin_number: 35,
                label: "P15".to_string(),
                gpio: Some(15),
                capabilities: vec![GpioIn, GpioOut, Adc2, Touch],
                is_strapping: true,
                notes: Some("MTDO strapping pin (enables debug print if HIGH at boot).".to_string()),
            },
            PinDefinition {
                pin_number: 36,
                label: "SD1".to_string(),
                gpio: Some(8),
                capabilities: vec![GpioIn, GpioOut, FlashReserved],
                is_strapping: false,
                notes: Some("GPIO 8 (D1). Connected to internal SPI flash memory! Avoid using.".to_string()),
            },
            PinDefinition {
                pin_number: 37,
                label: "SD0".to_string(),
                gpio: Some(7),
                capabilities: vec![GpioIn, GpioOut, FlashReserved],
                is_strapping: false,
                notes: Some("GPIO 7 (D0). Connected to internal SPI flash memory! Avoid using.".to_string()),
            },
            PinDefinition {
                pin_number: 38,
                label: "CLK".to_string(),
                gpio: Some(6),
                capabilities: vec![GpioIn, GpioOut, FlashReserved],
                is_strapping: false,
                notes: Some("GPIO 6 (CLK). Connected to internal SPI flash memory! Avoid using.".to_string()),
            },
        ];

        BoardProfile {
            id: "esp32-devkit-v1-38p".to_string(),
            name: "ESP32 DevKit V1 (38-pin)".to_string(),
            chip_family: "ESP32-D0WDQ6".to_string(),
            form_factor: "devkit-v1-38p".to_string(),
            pin_count: 38,
            left_header,
            right_header,
        }
    }

    pub fn get_standard_profiles() -> Vec<Self> {
        vec![
            Self::esp32_devkit_v1_38p(),
            Self::esp32_devkit_v1_30p(),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_profiles() {
        let profiles = BoardProfile::get_standard_profiles();
        assert_eq!(profiles.len(), 2);
        
        let p38 = profiles.iter().find(|p| p.id == "esp32-devkit-v1-38p").expect("38-pin profile exists");
        assert_eq!(p38.pin_count, 38);
        assert_eq!(p38.left_header.len(), 19);
        assert_eq!(p38.right_header.len(), 19);

        let p30 = profiles.iter().find(|p| p.id == "esp32-devkit-v1-30p").expect("30-pin profile exists");
        assert_eq!(p30.pin_count, 30);
        assert_eq!(p30.left_header.len(), 15);
        assert_eq!(p30.right_header.len(), 15);

        // Verify I2C pins exist on right header of 38-pin
        let sda = p38.right_header.iter().find(|p| p.gpio == Some(21));
        assert!(sda.is_some());
        assert_eq!(sda.unwrap().label, "P21 (SDA)");

        let scl = p38.right_header.iter().find(|p| p.gpio == Some(22));
        assert!(scl.is_some());
        assert_eq!(scl.unwrap().label, "P22 (SCL)");
    }
}
