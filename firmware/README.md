# PixelForge ESP32 Firmware (Spec 002)

Standalone ESP32 firmware for driving a 1.3" I2C OLED display (SH1106 / SSD1306) receiving canonical 128×64 1-bit frames over USB Serial at 115200 baud.

## Hardware Connections

| OLED Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **VCC** | **3V3** | 3.3V Power |
| **GND** | **GND** | Ground |
| **SCL** | **GPIO 22** | I2C Clock |
| **SDA** | **GPIO 21** | I2C Data |

I2C Address: `0x3C`

## Display Controller Selection

In `src/config.h`:
- If your 1.3" OLED uses **SH1106** (most common for 1.3"):
  ```cpp
  #define OLED_CONTROLLER_SH1106
  ```
- If your OLED uses **SSD1306**:
  ```cpp
  #define OLED_CONTROLLER_SSD1306
  ```

## Building & Flashing

### Option A: PlatformIO (Recommended)
1. Open this folder in VSCode with the PlatformIO extension installed, or run via terminal:
   ```bash
   cd firmware
   pio run --target upload
   ```
2. Monitor output (optional):
   ```bash
   pio device monitor
   ```

### Option B: Arduino IDE
1. Install ESP32 board support in Arduino IDE (Boards Manager -> `esp32` by Espressif).
2. Install required libraries via Library Manager:
   - `U8g2` by oliver
   - `ArduinoJson` by Benoit Blanchon
3. Open `src/main.cpp` (or copy `src/*` into an Arduino `.ino` sketch folder).
4. Select board: `ESP32 Dev Module`, select your COM port, and click **Upload**.
