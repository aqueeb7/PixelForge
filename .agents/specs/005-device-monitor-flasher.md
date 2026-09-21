# Spec 005 — Device Diagnostics, Telemetry & Firmware Flasher

## Inspiration & Architectural Foundation

Derived from the architecture of **ESP32 Monitor** (PySide6/Qt + PySerial + esptool), this specification establishes deep hardware diagnostics, live runtime telemetry, an interactive serial terminal, and an in-app firmware flasher in PixelForge Desktop.

Rather than building a standalone ESP32 monitor, Spec 005 is engineered as the **Device Communication & Diagnostics Layer** of the broader PixelForge Hardware Engine. It adheres to strict architectural boundaries so that the forthcoming simulator and multi-board extensions plug in seamlessly.

---

## Evolution Roadmap

PixelForge's hardware system progresses through the following sequential milestones:

```
Spec 004: Hardware Definition (Completed)
          Physical pinouts, strapping constraints, canonical peripheral bindings
       │
       ▼
Spec 005: Device Diagnostics, Serial & Flasher (Current Milestone)
          Hardware abstraction, runtime chip inspection, 3-way stream demux,
          pluggable flasher, generic telemetry, transport decoupled from simulator
       │
       ▼
Spec 006: Component & Wiring System
          Active bus probing (I²C scanner 0x3C), wire netlists, logical signals
       │
       ▼
Spec 007: Hardware Workspace
          Full schematic/breadboard canvas, live signal animation, multimeter mode
       │
       ▼
Spec 008: Virtual ESP32 + Virtual Components
          Headless MCU emulator, virtual I²C bus, virtual OLED canvas rendering
       │
       ▼
PixelForge Hardware Simulator
```

---

## Architectural Principles (Lock-Down Rules)

Before writing implementation code for Spec 005, the following 6 core architectural rules must be locked down:

### 1. Board Definition Consumption (Spec 004 Integration)
Spec 005 does **not** hardcode ESP32 DevKit pin counts or layouts. Instead:
- It consumes the active `BoardProfile` from **Spec 004** (`useHardwareStore.activeBoard` / `HardwareConfig`).
- The UI binds incoming telemetry, pin states, and peripheral roles directly to the active profile's pin definitions.
- If the user changes boards (e.g. 30-pin vs. 38-pin vs. custom board), the diagnostics UI adapts dynamically.

### 2. Runtime-Derived Silicon Identification
- A physical board definition (e.g., 38-pin DevKitC) defines the **physical carrier**, not the exact silicon revision.
- Silicon specifications (exact chip model, silicon revision, MAC address, flash size, crystal frequency, and PSRAM) are **queried at runtime** from the connected hardware (via bootloader ROM queries or firmware status).
- The silicon dossier never assumes hardware parameters without runtime verification.

### 3. Three-Way Serial Stream Demultiplexing
The serial stream reader must never assume all incoming bytes belong to one format. Incoming traffic is demuxed into three mutually exclusive channels:
1. **ROM Bootloader Traffic**: Initial power-on reset banners (`rst:0x1 (POWERON_RESET)...`), download bootloader sync packets, and esptool handshakes.
2. **PixelForge Binary Protocol (Spec 002 & 005)**: Strictly structured binary frames bounded by `SOF=0xAA` and `EOF=0x55` with CRC-8 validation (e.g., `TELEMETRY_DATA`, `FRAME_ACK`).
3. **Arbitrary Text / Log Traffic**: Human-readable ASCII output, ESP-IDF log tags (`[I][main.cpp:42]`), Arduino `Serial.print` statements, and crash panic dumps.

### 4. Pluggable Flashing Abstraction (`DeviceFlasher` Trait)
The flashing subsystem must not hardwire UI components or Rust commands to ESP32 / `esptool.py`.
- Flashing is encapsulated behind a native Rust trait:
  ```rust
  #[async_trait]
  pub trait DeviceFlasher: Send + Sync {
      async fn detect_chip(&mut self) -> Result<ChipDossier, FlashError>;
      async fn erase_flash(&mut self, progress: ProgressCallback) -> Result<(), FlashError>;
      async fn write_image(&mut self, offset: u32, data: &[u8], progress: ProgressCallback) -> Result<(), FlashError>;
      async fn reset_device(&mut self, boot_mode: BootMode) -> Result<(), FlashError>;
  }
  ```
- `Esp32Flasher` (wrapping `espflash` or `esptool`) is the first provider implementation. Future microcontrollers (RP2040 UF2/SWD, STM32 DFU, ESP32-S3 USB-OTG) can implement `DeviceFlasher` without modifying frontend components.

### 5. Generic Telemetry Model (`DeviceTelemetry`)
Telemetry is defined as an abstract, extensible domain model:
```typescript
interface DeviceTelemetry {
  timestamp: number
  uptime_seconds: number
  memory: {
    free_heap: number
    min_free_heap: number
    total_heap: number
    flash_used?: number
    flash_total?: number
    psram_free?: number
    psram_total?: number
  }
  rendering: {
    current_fps: number
    target_fps: number
    frame_counter: number
    dropped_frames: number
  }
  peripherals: {
    oled_contrast: number
    bus_errors: number
  }
  connectivity?: {
    wifi_status: 'off' | 'connecting' | 'connected'
    rssi?: number
  }
}
```
The ESP32 firmware supplies the initial 24-byte binary serialization (`0x85`), while the desktop domain remains decoupled from the specific transport format.

### 6. Simulator Transport Decoupling (`DeviceTransport` Trait)
**Critical for Spec 008**: The desktop frontend and diagnostics engine must communicate with devices through a common transport abstraction:
```rust
#[async_trait]
pub trait DeviceTransport: Send + Sync {
    async fn send(&mut self, bytes: &[u8]) -> Result<(), TransportError>;
    async fn receive(&mut self) -> Result<Vec<u8>, TransportError>;
    async fn set_baud_rate(&mut self, baud: u32) -> Result<(), TransportError>;
    async fn toggle_dtr_rts(&mut self, dtr: bool, rts: bool) -> Result<(), TransportError>;
}
```
- Physical serial ports implement `DeviceTransport` via `serialport-rs`.
- The future **Virtual ESP32 Simulator** (Spec 008) will implement `DeviceTransport` via an in-memory channel or IPC, allowing the identical Serial Monitor, Packet Inspector, and Telemetry Gauges to monitor simulated hardware without a physical USB cable!

---

## Detailed Feature Specifications

### 1. Connection & Port Management
- **Hardware Enumeration**:
  - Scans available serial/COM ports using OS USB descriptors.
  - Identifies bridge ICs: Silicon Labs CP2102/CP2104, WCH CH340/CH9102, FTDI FT232R, Espressif USB-JTAG/CDC.
- **Baud Rate Strategy**:
  - **Operational Runtime**: 115200 baud (balanced for reliable canonical bitmap streaming and serial logging).
  - **High-Speed Flashing**: Negotiated 460800 or 921600 baud for sub-10-second firmware uploads.
- **Auto-Reconnect & Hotplug**:
  - Monitors USB insertion/removal events.
  - If a connected device is temporarily disconnected and reconnected to the same port, the connection resumes automatically without resetting UI state.

---

### 2. Device Hardware Inspection & Silicon Telemetry
Inspired by ESP32 Monitor's `device_overview.py`:
- **Silicon Dossier**:
  - **Chip Family & Model**: e.g. `ESP32-D0WDQ6 (revision v3.0)`, `ESP32-S3`.
  - **MAC Address**: Unique factory burn-in base MAC (`XX:XX:XX:XX:XX:XX`).
  - **Flash Capacity & Speed**: Detected flash size (4MB / 8MB / 16MB), SPI clock mode (QIO / DIO @ 40MHz/80MHz).
  - **Clock Frequencies**: CPU clock (240MHz/160MHz) and crystal reference (40MHz/26MHz).
  - **Features**: Wi-Fi 802.11 b/g/n, Bluetooth Classic 4.2, BLE.
- **Live Memory Gauges**:
  - Distinctive glowing circular progress gauges and bar meters inspired by `circular_progress.py`:
    - **Free Heap**: Real-time remaining dynamic RAM (bytes & percentage).
    - **Minimum Free Heap (Watermark)**: Critical indicator for tracking heap fragmentation or buffer leaks during continuous 1024-byte frame transmission.
    - **Flash Usage**: Application partition size vs. allocated partition ceiling.
    - **PSRAM (if fitted)**: External SPI RAM allocation.

---

### 3. Interactive Serial Monitor & Console
Inspired by ESP32 Monitor's `serial_monitor.py`:
- **High-Performance Monospace Terminal**:
  - Non-blocking line stream using virtualized scrolling for large buffers (up to 10,000 lines).
  - Precise timestamps (`[HH:mm:ss.sss]`).
  - Auto-scroll lock (freezes scroll position when user inspects historical output; resumes when scrolled to bottom).
  - Filtering by log level (`INFO`, `WARN`, `ERROR`, or custom text query).
- **Traffic Demultiplexer View**:
  - **Log View**: Clean, human-readable terminal output.
  - **Packet Inspector**: Structured table of Spec 002/005 packets showing:
    - Direction (`TX` Host → Device / `RX` Device → Host)
    - Code & Name (e.g. `0x03 SEND_FRAME`, `0x85 TELEMETRY_DATA`)
    - Payload Length & CRC-8 verification result
    - Elapsed latency (ms)
- **Interactive Command Sender**:
  - Monospace text input with command history (`Up` / `Down` recall).
  - Selectable line terminators (`LF`, `CRLF`, `CR`, `None`).
  - Hex transmission mode for manual protocol testing (e.g., `AA 01 01 00 00 07 55`).

---

### 4. Integrated Firmware Flasher
Inspired by ESP32 Monitor's `flashing_widget.py`:
- **Zero-Dependency 1-Click Provisioning**:
  - Eliminates host setup requirements (no Python CLI, Arduino IDE, or PlatformIO needed).
  - Bundles the official PixelForge ESP32 runtime firmware binary inside the desktop app.
  - One-click **"Flash PixelForge Firmware"** button automatically provisions a clean ESP32 board.
- **DTR/RTS Auto-Reset Sequence**:
  - Implements the standard transistor cross-coupled auto-reset sequence:
    1. Assert DTR and RTS (`DTR=1`, `RTS=1`)
    2. Release DTR to pull `EN` LOW while holding `GPIO0` LOW
    3. Release RTS to let `EN` rise HIGH while `GPIO0` remains LOW, latching the ROM bootloader
- **Custom Firmware Flasher**:
  - File picker for arbitrary user `.bin` binaries.
  - Configurable flash address offset:
    - Bootloader: `0x1000`
    - Partition Table: `0x8000`
    - Application Code: `0x10000` (default)
  - Full chip erase (`erase_flash`) support.
  - Real-time animated progress bar with write speed (kB/s) and stage indicator.

---

## Protocol Specification (Spec 002 Expansion)

### Additional Commands (Host → Device)

| Code | Name | Payload Length | Description |
| :--- | :--- | :--- | :--- |
| `0x05` | `GET_TELEMETRY` | 0 | Query live memory, uptime, and frame rendering metrics |
| `0x06` | `RESTART_DEVICE`| 1 byte (`0x01`=Soft, `0x02`=Hard) | Request device reboot |

### Additional Responses (Device → Host, `0x80 | CMD`)

| Code | Name | Payload Length | Payload Format |
| :--- | :--- | :--- | :--- |
| `0x85` | `TELEMETRY_DATA` | 24 bytes | **Heap & Runtime Metrics**:<br>- `u32 free_heap` (Big-Endian)<br>- `u32 min_free_heap`<br>- `u32 total_heap`<br>- `u32 uptime_seconds`<br>- `u16 current_fps` (x10 fixed point, e.g. 300 = 30.0 fps)<br>- `u8 oled_contrast` (0–255)<br>- `u8 wifi_status` (0=off, 1=connecting, 2=connected)<br>- `u32 frame_counter` |
| `0x86` | `RESTART_ACK` | 1 byte | `0x00` = Rebooting now |

---

## Technical Architecture

```
src-tauri/src/
├── device/
│   ├── mod.rs
│   ├── transport.rs        # DeviceTransport trait (Serial + future Simulator)
│   ├── serial_transport.rs # Physical serial implementation (serialport-rs)
│   ├── demux.rs            # 3-way demux (Bootloader / Binary Protocol / Text)
│   ├── flasher/
│   │   ├── mod.rs          # DeviceFlasher trait
│   │   └── esp32.rs        # ESP32 esptool/espflash implementation
│   └── telemetry.rs        # DeviceTelemetry parser & scheduler
└── commands/
    ├── device.rs           # Connect / disconnect / get_ports
    ├── monitor.rs          # Stream terminal lines & send commands
    └── flasher.rs          # Flash firmware & erase commands
```

---

## UI Layout & Aesthetic Structure

The diagnostics workspace is structured with the same fixed-viewport, zero-outer-scroll rules as `HardwareView` and `DrawView`:

1. **Top Device Status Strip**:
   - COM Port selector, Connect/Disconnect button, Baud rate dropdown, and Auto-Reconnect toggle.
   - Connected chip badge (`ESP32-D0WDQ6 Rev 3.0`) with live connection heartbeat dot.
2. **Left Column — Silicon Dossier & Gauges**:
   - Circular gauge for **Free Heap** with dynamic color transition (Green > 100KB, Amber > 40KB, Red < 40KB).
   - Minimum heap watermark bar.
   - Chip specs table (MAC, Flash size, Crystal, Clock).
   - "Flash Firmware" action launcher.
3. **Right Column — Serial Terminal & Packet Inspector**:
   - Tabbed view: `[ Terminal Console ]` | `[ Protocol Packets ]`.
   - Monospace virtual terminal with timestamp toggle, search filter, and clear button.
   - Bottom command input bar with line ending picker.

---

## Verification & Acceptance Criteria

1. **Board Profile Independence**:
   - Telemetry and diagnostics successfully function when switching between 30-pin, 38-pin, or custom Spec 004 board profiles.
2. **Three-Way Stream Demux**:
   - Terminal cleanly prints ESP-IDF ASCII startup logs (`rst:0x1...`).
   - Binary telemetry packets (`0x85`) update the UI gauges without polluting the ASCII terminal stream.
3. **Transport Abstraction**:
   - The device management core implements `DeviceTransport`, ensuring zero serial port dependencies when Spec 008 introduces simulated devices.
4. **Flasher Isolation**:
   - Flashing logic resides strictly behind `DeviceFlasher`.
   - Successfully enters download mode via DTR/RTS auto-reset and completes an application flash at 460800 baud with progress updates.
