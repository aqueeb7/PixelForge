# Spec 002 — Serial Device & ESP32 Protocol (Revised)

## Goal

Enable PixelForge Desktop to communicate directly with an ESP32 microcontroller over USB Serial at 115200 baud to query device status, validate hardware capabilities, clear the screen, and transmit a canonical 128×64 1-bit monochrome bitmap to a 1.3" I2C OLED display with an authentic on-screen preview.

---

## Hardware Specification

| Component | Specification |
| :--- | :--- |
| **Microcontroller** | Standard ESP32 DevKit-style board |
| **Display** | 1.3" I2C OLED Monochrome Display |
| **Resolution** | 128 × 64 pixels (1-bit monochrome) |
| **OLED Controller** | Configurable abstraction (e.g. SH1106 / SSD1306 via U8g2) |
| **I2C Address** | `0x3C` |
| **Wiring** | **VCC** → ESP32 3V3<br>**GND** → ESP32 GND<br>**SCL** → GPIO 22<br>**SDA** → GPIO 21 |
| **Transport** | USB Serial (UART) at **115200 baud**, 8 data bits, 1 stop bit, no parity |

---

## Canonical Bitmap Model (Controller-Independent)

PixelForge desktop maintains a strict separation between canonical bitmap data and controller-specific OLED addressing.

- **Logical Dimensions**: 128 pixels wide × 64 pixels high
- **Color Depth**: 1 bit per pixel (0 = black/off, 1 = white/on)
- **Data Layout**: Flat row-major array, MSB first
  - Row size: $128 \div 8 = 16$ bytes per row
  - Frame size: $16 \times 64 = 1024$ bytes
  - Byte 0, bit 7 represents $(x=0, y=0)$; bit 0 represents $(x=7, y=0)$.
- **Controller Independence**: The desktop protocol transmits this canonical 1024-byte row-major frame directly. It does **NOT** perform SSD1306 or SH1106 vertical page addressing. The ESP32 firmware is responsible for translating the canonical row-major bytes into the display controller's page buffer.

---

## Serial Protocol Specification

Every packet transmitted over the serial link uses a deterministic binary framing format:

```
┌──────┬──────────────┬─────────┬────────────────┬───────────────┬──────────┬──────┐
│ SOF  │ MESSAGE TYPE │ VERSION │ LENGTH (BE)    │ PAYLOAD       │ CRC-8    │ EOF  │
│ 0xAA │ 1 byte       │ 0x01    │ 2 bytes (u16)  │ N bytes       │ 1 byte   │ 0x55 │
└──────┴──────────────┴─────────┴────────────────┴───────────────┴──────────┴──────┘
```

- **SOF**: `0xAA` (Start of Frame)
- **MESSAGE TYPE**: 1 byte command or response identifier
- **VERSION**: `0x01` (Protocol Version 1)
- **LENGTH**: 2 bytes, unsigned 16-bit integer in **Big-Endian** order, representing payload size $N$ (0 to 65535)
- **PAYLOAD**: $N$ bytes of data
- **CRC-8**: 1 byte CRC computed over `[MSG_TYPE, VERSION, LENGTH_H, LENGTH_L, PAYLOAD...]`
- **EOF**: `0x55` (End of Frame)

### CRC-8 Definition

To ensure bit-identical calculation across Rust and ESP32 C++:

- **Algorithm**: CRC-8 (SMBus / ATM / ITU-T)
- **Polynomial**: `0x07` ($x^8 + x^2 + x + 1$)
- **Initial Value**: `0x00`
- **Input Reflected**: False (MSB-first)
- **Output Reflected**: False (MSB-first)
- **Final XOR**: `0x00`
- **Input Range**: Exactly all bytes between SOF and CRC-8: `[MSG_TYPE, VERSION, LENGTH_HIGH, LENGTH_LOW, PAYLOAD[0..N-1]]`

#### Reference Algorithm:
```
uint8_t crc8(const uint8_t *data, size_t len) {
    uint8_t crc = 0x00;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t b = 0; b < 8; b++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x07;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}
```

---

### Command Set (Host → Device)

| Code | Name | Payload Length | Description |
| :--- | :--- | :--- | :--- |
| `0x01` | `PING` | 0 | Health check request |
| `0x02` | `GET_DEVICE_INFO` | 0 | Request device and display capabilities |
| `0x03` | `SEND_FRAME` | 1024 | Transmit 128×64 canonical row-major bitmap |
| `0x04` | `CLEAR_DISPLAY` | 0 | Blank the OLED screen |

---

### Response Set (Device → Host, High-Bit Convention: `0x80 | CMD`)

| Code | Name | Payload Length | Description |
| :--- | :--- | :--- | :--- |
| `0x81` | `PONG` | 1 | Status byte (`0x00` = OK) |
| `0x82` | `DEVICE_INFO` | Variable (JSON string) | Serialized JSON payload containing hardware capabilities (see schema below) |
| `0x83` | `FRAME_ACK` | 1 | Frame render status (`0x00` = OK, `0x01` = resolution mismatch, `0x02` = error) |
| `0x84` | `CLEAR_ACK` | 1 | Display clear status (`0x00` = OK) |
| `0xFF` | `ERROR` | Variable | Error status byte (`u8`) + UTF-8 ASCII error message string |

#### Device Info Payload Schema (`0x82`):
```json
{
  "protocol_version": 1,
  "firmware_version": "0.1.0",
  "device_name": "PixelForge-ESP32",
  "display_width": 128,
  "display_height": 64,
  "color_depth": 1,
  "display_controller": "SH1106"
}
```
*Note: The desktop validates that `display_width == 128`, `display_height == 64`, and `color_depth == 1` before allowing `SEND_FRAME`.*

---

## Desktop Requirements (Rust Backend)

1. **Serial Port Service (`src-tauri/src/serial/`)**:
   - Enumerate available system serial ports (e.g. `COM3`, `COM4` on Windows, `/dev/ttyUSB*` on Linux).
   - Connect and disconnect safely with `115200` baud.
   - Non-blocking execution: Serial I/O must run on dedicated background threads (`tokio::task::spawn_blocking`) with configurable read/write timeouts (1000ms default) so the UI thread is never blocked.
   - State machine packet parser: Tolerate garbage bytes before SOF, validate CRC-8, detect unexpected cable disconnections gracefully, and return structured errors.

2. **Deterministic Built-in Test Pattern**:
   - The desktop backend or frontend can generate a canonical 1024-byte test pattern without requiring the Draw canvas:
     - 1-pixel outer border on all four boundaries ($x \in [0, 127], y \in [0, 63]$).
     - Four corner markers: $8 \times 8$ filled pixel blocks at $(0,0), (120,0), (0,56), (120,56)$.
     - Center lines: Horizontal line at $y = 31$, vertical line at $x = 63$.
     - Quadrant test patterns:
       - Top-Left: $2 \times 2$ alternating checkerboard.
       - Top-Right: Horizontal alternating stripes.
       - Bottom-Left: Vertical alternating stripes.
       - Bottom-Right: Diagonal lines.

3. **Tauri Commands (`src-tauri/src/commands/serial.rs`)**:
   - `list_serial_ports() -> Result<Vec<SerialPortInfo>, String>`
   - `connect_device(port: String, baud_rate: u32) -> Result<DeviceInfo, String>`
   - `disconnect_device() -> Result<(), String>`
   - `ping_device() -> Result<u32, String>` (returns round-trip latency in ms)
   - `get_device_info() -> Result<DeviceInfo, String>`
   - `clear_display() -> Result<(), String>`
   - `send_frame(bitmap_data: Vec<u8>) -> Result<(), String>`
   - `get_test_pattern() -> Result<Vec<u8>, String>`

---

## Frontend Requirements (Vue 3)

1. **Devices View (`src/views/DevicesView.vue`)**:
   - Replaces the placeholder route for `/devices`.
   - Serial port selector dropdown with a "Refresh" button.
   - Connect / Disconnect button with loading indicators.
   - Device Info card showing device name, firmware version, resolution, and active display controller.
   - Diagnostic actions:
     - "Send Ping" button with live latency readout in milliseconds.
     - "Clear Display" button.
     - "Send Test Pattern" button.
   - Built-in 128×64 live pixel preview showing the exact canonical bitmap currently transmitted or previewed.

2. **Device Store (`src/stores/device.ts`)**:
   - Holds active port name, connection state (`connected`, `disconnected`, `connecting`, `error`), device capabilities (`DeviceInfo`), and error message.

3. **Status Bar (`src/components/StatusBar.vue`)**:
   - Displays real-time device connection state (`Connected [COM3]` vs `Disconnected`).

---

## ESP32 Firmware Requirements (`firmware/`)

1. **Standalone Structure**: Independent PlatformIO / Arduino C++ project in `firmware/`.
2. **Display Abstraction (U8g2)**:
   - Configurable controller initialization (e.g. `U8G2_SH1106_128X64_NONAME_F_HW_I2C` default for 1.3" I2C OLED, selectable via `#define OLED_CONTROLLER_SH1106` or `#define OLED_CONTROLLER_SSD1306`).
   - Wire pins configured for SDA = GPIO 21, SCL = GPIO 22, address `0x3C`.
3. **Canonical-to-Display Translation**:
   - Translates the canonical 1024-byte row-major frame ($128 \times 64$, 16 bytes/row, MSB-first) into the U8g2 internal buffer using `u8g2.drawPixel(x, y, color)` or direct buffer page transfer.
4. **Serial Packet State Machine**:
   - Non-blocking loop reading UART at 115200 baud.
   - States: `WAIT_SOF` → `READ_HEADER` → `READ_PAYLOAD` → `VERIFY_CRC` → `READ_EOF` → `DISPATCH`.
   - Sends formatted responses using the high-bit convention and CRC-8.

---

## Out of Scope (Do NOT Implement in Spec 002)

- Video import / frame extraction
- FFmpeg integration
- Dithering algorithms
- Multi-frame animation / timeline / Reel Mode
- Wi-Fi / WebSocket communication
- Cloud services / accounts
- Freehand drawing canvas (belongs to Spec 003)

---

## Acceptance Criteria

1. **Port Enumeration**: PixelForge lists all available serial ports on the host system without crashing.
2. **Port Selection & Connection**: User can select a COM port and establish a serial connection at 115200 baud.
3. **PING / PONG**: PixelForge sends `PING` (`0x01`) and receives `PONG` (`0x81`) with valid round-trip time.
4. **Device Info & Compatibility Validation**: PixelForge requests `GET_DEVICE_INFO` (`0x02`), parses device capabilities, and verifies resolution compatibility (128×64, 1-bit).
5. **Clear Screen**: PixelForge sends `CLEAR_DISPLAY` (`0x04`), and the physical OLED turns completely blank.
6. **Send Test Pattern**: PixelForge sends the canonical 1024-byte test pattern (`0x03`), and the complete test pattern (border, corner boxes, center crosshairs, and quadrant patterns) appears sharply on the physical 1.3" OLED.
7. **OLED Preview**: The desktop UI displays an authentic 128×64 pixel preview corresponding to the test pattern sent.
8. **Disconnect & Error Recovery**: Disconnecting the serial connection or unplugging the physical USB cable is detected cleanly without crashing the desktop application, and error states are clearly displayed to the user.
