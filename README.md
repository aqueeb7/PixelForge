# ⚡ PixelForge

<p align="center">
  <strong>The High-Performance 1-Bit Graphics & Hardware Cockpit for ESP32 and Monochrome OLEDs</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Rust-1.78+-DEA584?style=for-the-badge&logo=rust&logoColor=black" alt="Rust" />
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/ESP32-Xtensa%20%2F%20PlatformIO-E7352C?style=for-the-badge&logo=espressif&logoColor=white" alt="ESP32" />
  <img src="https://img.shields.io/badge/Architecture-Local--First-10B981?style=for-the-badge" alt="Local First" />
</p>

---

## 🌌 Overview

**PixelForge** is a desktop workstation engineered for makers, embedded systems engineers, and IoT content creators. It bridges desktop-class creative software with physical embedded silicon, transforming 128×64 monochrome OLED displays into high-framerate animation screens while providing a deep, diagnostic hardware cockpit for the ESP32.

The platform is architected around two complementary faces:

1. **Face 1 — Hardware Cockpit (Embedded Systems & Silicon Diagnostics)**: A publication-grade diagnostic environment featuring interactive board pinout verification, strapping pin safety alerts, a 3-way reactive stream demultiplexer, zero-dependency firmware flashing, and a **financial market-style partition & memory treemap heatmap**.
2. **Face 2 — Creative Studio (IoT Creators, Influencers & Pixel Artists)**: A pixel-perfect 128×64 art canvas and a **video-to-OLED converter** with real-time multi-algorithm dithering (Atkinson, Floyd-Steinberg, Bayer Ordered), timeline playback, and live 30 FPS serial streaming.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PIXELFORGE DESKTOP (Tauri v2)                   │
├───────────────────────────────────┬────────────────────────────────────┤
│     FACE 1: HARDWARE COCKPIT      │      FACE 2: CREATIVE STUDIO       │
│                                   │                                    │
│  • Visual Board Dossier (30/38p)  │  • 128×64 Drawing Canvas           │
│  • Pin Strapping Constraint Guard │  • Video to 1-Bit Dither Engine    │
│  • Silicon Treemap Heatmap        │  • Atkinson & Bayer Algorithms     │
│  • 1-Click ROM Bootloader Flash   │  • Scrubbable Timeline Player      │
│  • ANSI Terminal & Packet Table   │  • Live 30 FPS Mirror Stream       │
└─────────────────┬─────────────────┴──────────────────┬─────────────────┘
                  │                                    │
                  │   Tauri IPC Commands & Events      │
                  ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        RUST DESKTOP RUNTIME                            │
│  • PacketDemuxer (ASCII Logs / Bootloader Text / Binary Packets)       │
│  • Framed Binary Protocol (0xPF Magic Header, CRC-8, 115.2k–921.6k)    │
│  • Canonical 1024-Byte Framebuffer Packing & Transform Pipeline        │
│  • Native DeviceTransport Abstraction (Physical Serial + Virtual Sim)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ USB-Serial (115200 / 921600 Baud)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ESP32 DEVICE RUNTIME                            │
│  • Generic C++ Firmware (Zero hardcoded drawings; dynamic reception)   │
│  • CRC-8 Ingestion & Command Dispatcher (0x01–0x06 / 0x85 Telemetry)  │
│  • I2C Hardware Bus (SDA=GPIO 21, SCL=GPIO 22 @ 400kHz Fast Mode)      │
│  • Display Driver: SSD1306 / SH1106 128×64 Monochrome OLED            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Capabilities

### 🎛️ Unified Hardware Studio (`/hardware`)
- **Interactive MCU Board View**: High-fidelity visual pinout models for ESP32 DevKit V1 (30-pin & 38-pin variants).
- **Hardware Safety Engine**: Live warnings for critical bootstrapping pins (`GPIO 0`, `GPIO 2`, `GPIO 12`, `GPIO 15`) and input-only pins (`GPIO 34-39`) to prevent hardware hangs and boot loops.
- **Silicon Treemap Heatmap**: A Finviz / Bloomberg-style market treemap that visualizes ESP32 Flash memory partitions (`bootloader`, `nvs`, `otadata`, `app0`, `spiffs`) and dynamic SRAM allocations (`Free Heap`, `Watermark Margin`, `In-Use Heap`, `DMA Buffer`) with green/amber/crimson saturation coding.
- **3-Way Stream Demuxer**: Automatically separates garbled bootloader ROM text (`rst:0x1...`), application log lines, and high-speed binary protocol packets into dedicated reactive UI channels.
- **Integrated Firmware Flasher**: Zero-dependency ESP32 flasher with automatic DTR/RTS transistor toggling, chip silicon inspection (MAC, Flash size, crystal, revision), binary uploads, and complete chip erasure.

### 🎨 Creative Canvas & Video Converter (`/draw`, `/video`)
- **128×64 Drawing Canvas**: Low-latency pixel art engine with Pencil, Eraser, Line, Rectangle, Circle, Flood Fill, Invert, and a 50-step undo/redo stack.
- **Video to 1-Bit Dither Pipeline**: Ingest local MP4, GIF, WebM, and MOV files into 128×64 monochrome reels.
- **Multi-Algorithm Dithering Suite**:
  - **Atkinson (1984 Macintosh)**: Discards 25% error to create punchy, high-contrast highlights—the gold standard for faces and anime on OLED displays.
  - **Floyd-Steinberg**: Classic error diffusion delivering smooth, photorealistic gradients.
  - **Bayer Ordered (2×2, 4×4, 8×8)**: Structured matrix crosshatching with **zero temporal swimming**, perfect for clean animation reels.
  - **Adaptive Otsu Threshold**: High-contrast graphic silhouettes for logos and typography.
- **Timeline & Frame Scrubbing**: Scrub through animations, set in/out loop markers, inspect individual frames, and hand off any frame directly to the drawing canvas for manual retouching.
- **Export & Delivery**:
  - Live 30 FPS streaming over USB-Serial.
  - 1-click C/C++ `PROGMEM` header export for Arduino & PlatformIO.
  - Raw binary reel (`.bin`) export for SPIFFS/LittleFS autonomous playback.
  - Animated monochrome GIF generator for social media sharing.

---

## ⚡ Serial Binary Protocol (Spec 002 & 005)

PixelForge communicates over serial using a framed, CRC-8 verified binary protocol:

```text
[ 0x50 ] [ 0x46 ] [ Length: 2B ] [ Command: 1B ] [ Payload: N Bytes ] [ CRC-8: 1B ]
```

| Opcode | Name | Direction | Payload Length | Description |
| :---: | :--- | :---: | :---: | :--- |
| `0x01` | `PING` | Host $\to$ Device | 0 bytes | Connection test; device replies with `0x81 PONG` |
| `0x02` | `GET_DEVICE_INFO` | Host $\to$ Device | 0 bytes | Queries firmware version, chip type, and screen specs |
| `0x03` | `SEND_FRAME` | Host $\to$ Device | 1,024 bytes | Sends canonical 128×64 1-bit bitmap for immediate OLED display |
| `0x04` | `CLEAR_DISPLAY` | Host $\to$ Device | 0 bytes | Clears display buffer to black |
| `0x05` | `GET_TELEMETRY` | Host $\to$ Device | 0 bytes | Requests live memory, heap watermark, and framerate metrics |
| `0x06` | `RESTART_DEVICE` | Host $\to$ Device | 1 byte | Triggers soft (`0x01`) or hard (`0x02`) microcontroller reboot |
| `0x85` | `TELEMETRY_DATA` | Device $\to$ Host | 24 bytes | Encoded Free Heap, Min Heap, Total Heap, Uptime, FPS, Contrast |

---

## 🔌 Hardware Reference Wiring

Default configuration targets an ESP32 connected to a monochrome 128×64 I2C OLED (SSD1306 or SH1106):

| OLED Pin | ESP32 Pin | Function | Notes |
| :---: | :---: | :---: | :--- |
| **VCC** | **3V3** | Power Supply | 3.3V Logic & Power |
| **GND** | **GND** | Ground | Common Ground |
| **SDA** | **GPIO 21** | I2C Serial Data | Standard ESP32 I2C Data |
| **SCL** | **GPIO 22** | I2C Serial Clock | Standard ESP32 I2C Clock (400 kHz Fast Mode) |

*Note: Custom pin mappings, SPI controllers, and 30-pin layouts can be remapped directly in the Hardware Studio.*

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Rust](https://www.rust-lang.org/) (1.78+ with `cargo`)
- [PlatformIO](https://platformio.org/) *(optional; only if developing firmware directly)*

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/aqueeb7/PixelForge.git
cd PixelForge

# Install frontend dependencies
npm install
```

### 2. Run the Desktop Application (Dev Mode)
```bash
npm run tauri dev
```

### 3. Flash ESP32 Firmware
- **Option A (Recommended — In-App)**: Open PixelForge $\to$ navigate to **Hardware Studio** $\to$ select your COM port $\to$ click the **Flasher** tab $\to$ click **Flash Firmware**.
- **Option B (PlatformIO CLI)**:
  ```bash
  cd firmware
  pio run --target upload
  ```

---

## 🗺️ Roadmap & Milestones

| Milestone | Scope | Status |
| :--- | :--- | :---: |
| **Spec 001** | App Foundation, Tauri v2 shell, design system, preview layout | **Completed** |
| **Spec 002** | Serial transport, CRC-8 binary protocol, dynamic COM enumeration | **Completed** |
| **Spec 003** | 128×64 pixel canvas, drawing tools, undo/redo, 1:1 hardware mirror | **Completed** |
| **Spec 004** | Board definitions (30p/38p), pin inspector, strapping safety rules | **Completed** |
| **Spec 005** | Unified Hardware Studio, 3-way demux, flasher, silicon treemap heatmap | **Completed** |
| **Spec 006** | Video to 128×64 OLED converter, multi-algorithm dithering engine | **Current** |
| **Spec 007** | Animation reel storage, LittleFS / SPIFFS flasher, autonomous player | **Upcoming** |
| **Spec 008** | Canonical hardware project schema, wiring graph, virtual ESP32 simulator | **Upcoming** |

---

## 🛡️ Engineering Philosophy

- **Local-First**: Zero mandatory cloud accounts, telemetry trackers, or SaaS dependencies. All video processing, dithering, and flashing occur on local silicon.
- **Hardware Safety First**: No arbitrary GPIO assumptions. Strapping pins and bus limits are validated before transmission.
- **Deterministic Pipeline**: Every bitmap transformation from original video to 1,024-byte framebuffer is deterministic, reproducible, and verifiable.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
