# Spec 011 — Firmware & Autonomous Simulation Integration (LittleFS Reel Flash)

## 1. Goal & Product Identity

While [Spec 010](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/010-virtual-esp32-simulator.md) introduced the in-app software emulator and [Spec 008](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/008-component-wiring-graph.md) established the hardware wiring graph, **Spec 011** completes the standalone IoT hardware vision:

1. **Non-Volatile Flash Persistence (LittleFS / SPIFFS)**:
   - Moving beyond volatile RAM buffering (`MAX_REEL_FRAMES` in heap).
   - Storing animations directly into ESP32 internal flash memory (or MicroSD card).
   - Enabling thousands of animation frames to persist across power cycles.
2. **Autonomous Physical Appliance Mode (PC-Free Playback)**:
   - When disconnected from the desktop, the ESP32 boots autonomously into **Appliance Mode**:
     - Automatically renders saved reels to the OLED at configured FPS.
     - Supports hardware input pins: Button A (Play/Pause/Next Reel), Rotary Encoder (Scrub frames, adjust contrast).
3. **Golden Reference Parity & Native C++ Shared Dispatcher**:
   - The same command parser and packet framing logic used in `firmware/src/main.cpp` is compiled via WebAssembly / Rust to power the virtual simulator.
   - Guarantees 100% bug-for-bug protocol parity between desktop preview, virtual simulator, and physical hardware.

```text
┌────────────────────────────────────────────────────────────────────────┐
│               PIXELFORGE AUTONOMOUS FLASH APPLIANCE                    │
├───────────────────────────────┬────────────────────────────────────────┤
│     LITTLEFS REEL MANAGER     │       PHYSICAL APPLIANCE MODE          │
│                               │                                        │
│  [+] reel_cyberpunk_30fps.bin │   ┌────────────────────────────────┐   │
│      Size: 153,600 Bytes      │   │  [ AUTONOMOUS PLAYBACK ]       │   │
│      Frames: 150 @ 30 FPS     │   │  Reel: cyberpunk_30fps.bin     │   │
│      Partition: storage (1MB) │   │  FPS: 30.0 | Loop: INF         │   │
│                               │   │  Controls: GPIO 4 / EC11 Enc   │   │
│  [+] bad_apple_intro.bin      │   └────────────────────────────────┘   │
│      Size: 409,600 Bytes      │   ⚡ Battery / USB Powered (No PC)     │
│      Frames: 400 @ 20 FPS     │   I2C OLED running autonomously        │
├───────────────────────────────┴────────────────────────────────────────┤
│                       ONE-CLICK PARTITION FLASH                        │
│  [ FLASH REEL TO LITTLEFS ]  Available Flash Space: 840 KB / 1.4 MB    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Firmware Partition Table & LittleFS Layout

To support long animations and multiple saved reels, the firmware adopts an expanded SPI flash partition table:

```csv
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x5000,
otadata,  data, ota,     0xe000,  0x2000,
app0,     app,  ota_0,   0x10000, 0x140000,
storage,  data, spiffs,  0x150000,0x2B0000,
```

- **`storage` partition (2.75 MB)**: Formatted as **LittleFS**.
- Stores structured `.pfr` (PixelForge Reel) binary files containing indexed frames and header metadata.

---

## 3. Protocol Expansion: LittleFS Commands

The framed binary protocol is extended with file streaming opcodes:

| Opcode | Command Name | Description |
| :---: | :--- | :--- |
| `0x20` | `CMD_FS_LIST_REELS` | Enumerates saved reels on LittleFS flash partition |
| `0x21` | `CMD_FS_OPEN_WRITE` | Creates a new reel file (e.g. `/reels/reel01.pfr`) |
| `0x22` | `CMD_FS_WRITE_CHUNK` | Streams 512-byte payload chunk to flash |
| `0x23` | `CMD_FS_CLOSE_WRITE` | Finalizes file handle, calculates CRC-32 |
| `0x24` | `CMD_FS_SET_AUTOPLAY`| Configures default boot reel and playback FPS |
| `0x25` | `CMD_FS_DELETE_REEL` | Removes a reel file from LittleFS storage |

---

## 4. Hardware Interaction: Appliance Loop Mode

When running PC-free, the firmware's `loop()` dispatches to `AutonomousApplianceManager`:

```cpp
// firmware/src/appliance.cpp
#include "appliance.h"
#include <LittleFS.h>

void runAutonomousAppliance() {
    File reel = LittleFS.open("/reels/active.pfr", "r");
    if (!reel) return;

    ReelHeader header;
    reel.read((uint8_t*)&header, sizeof(ReelHeader));

    uint8_t frameBuffer[1024];
    uint32_t frameDelayMs = 1000 / header.fps;

    while (true) {
        // Read next frame from LittleFS
        if (reel.read(frameBuffer, 1024) < 1024) {
            // End of reel: rewind for infinite loop
            reel.seek(sizeof(ReelHeader));
            continue;
        }

        // Render to physical OLED
        display.drawBitmap(0, 0, frameBuffer, 128, 64, WHITE);
        display.display();

        // Check hardware inputs (Pause/Resume, Brightness)
        handleHardwareInputs();

        delay(frameDelayMs);
    }
}
```

---

## 5. End-to-End Golden Verification

PixelForge provides automated integration tests:
1. Export animation reel from video converter.
2. Stream to Virtual Simulator via `CMD_FS_WRITE_CHUNK`.
3. Verify file integrity and playback timing in simulation.
4. Flash physical ESP32 and verify identical hardware execution.
