# Spec 009 — Hardware Workspace: Virtual Multimeter & Live Logic Analyzer

## 1. Goal & Product Identity

While [Spec 005](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/005-device-monitor-flasher.md) built the initial Device Monitor (Silicon Treemap, serial terminal, and packet table), and [Spec 008](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/008-component-wiring-graph.md) modeled the wiring graph and netlist, **Spec 009** provides makers and engineers with embedded diagnostic instrumentation directly inside the desktop app:

1. **Virtual Multimeter (DMM)**:
   - Interactive Red/Black probe needles to touch virtual pins on the board or breadboard.
   - Real-time measurements: DC Voltage (0.0V – 3.3V / 5.0V), Continuity test with audio chime, and High/Low Logic State.
2. **Software Logic Analyzer (Mini 4-Channel Stream)**:
   - High-speed bit-level timing capture for I2C Clock (SCL), I2C Data (SDA), UART RX/TX, and button GPIO toggles.
   - Decodes I2C transactions (Start, 7-bit Address, R/W bit, ACK/NACK, Data Bytes, Stop).
3. **Active I²C Bus Scanner & Register Interrogator**:
   - One-click scan of addresses `0x08` to `0x77`.
   - Automatic identification of standard chips (SSD1306 @ 0x3C, SH1106 @ 0x3C, BME280 @ 0x76, MPU6050 @ 0x68).
   - Live register readout and OLED contrast modulation probe.

```text
┌────────────────────────────────────────────────────────────────────────┐
│             PIXELFORGE VIRTUAL MULTIMETER & LOGIC ANALYZER             │
├───────────────────────────────┬────────────────────────────────────────┤
│       VIRTUAL DMM PROBE       │        4-CHANNEL LOGIC ANALYZER        │
│                               │                                        │
│   ┌───────────────────────┐   │  CH1 (SCL) ─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─   │
│   │      3.298 V DC       │   │             └─┘ └─┘ └─┘ └─┘ └─┘ └─┘    │
│   │   MODE: DC VOLTAGE    │   │  CH2 (SDA) ───┐   ┌─────┐   ┌─────┐    │
│   └───────────────────────┘   │               └───┘     └───┘     └─── │
│   Probe A: [ESP32: GPIO 21]   │  DECODE: [START] [ADDR: 0x3C ACK]      │
│   Probe B: [ESP32: GND]       │          [CMD: 0x40 DATA] [0xFF] [STOP]│
├───────────────────────────────┴────────────────────────────────────────┤
│                       ACTIVE I²C BUS SCANNER                           │
│  [ SCAN BUS ]  Found 1 Device: [0x3C] -> SSD1306 128×64 OLED (ACK 14ms)│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Interactive Virtual Multimeter (DMM)

### Modes of Operation:
1. **DC Voltage Mode (`V DC`)**:
   - Calculates the voltage potential difference between Probe (+) and Probe (-).
   - In physical connected mode, reads actual ADC/GPIO telemetry reported by firmware via `CMD_PROBE_PIN (0x12)`.
   - In virtual mode, calculates ideal node voltages based on the netlist.
2. **Continuity Tester (`CONT 🔊`)**:
   - Audio feedback (synthesized 2.8kHz sine beep) when resistance between two points is `< 10 Ω` (direct net connection).
   - Useful for tracing breadboard traces and verifying ground returns.
3. **Logic State Mode (`LOGIC`)**:
   - Displays binary `LOW` ($< 0.8\text{V}$), `HIGH` ($> 2.0\text{V}$), or `FLOATING / HIGH-Z`.

---

## 3. Mini 4-Channel I²C & GPIO Logic Analyzer

The ESP32 firmware includes a lightweight circular sampling buffer capable of capturing GPIO state transitions at high rates:

```typescript
// src/core/hardware/LogicAnalyzer.ts
export interface LogicSample {
  timestampUs: number; // Microseconds since capture trigger
  channels: [boolean, boolean, boolean, boolean]; // 4 binary channels
}

export interface I2cDecodedPacket {
  startUs: number;
  endUs: number;
  type: 'START' | 'ADDRESS' | 'DATA' | 'STOP';
  byteValue?: number;
  ack?: boolean;
}
```

### Visual Timing Stream:
- Canvas-based crisp digital waveform rendering with pan and zoom down to microsecond intervals.
- Protocol decoding overlays:
  - Highlights I²C `START` condition (SDA drops while SCL is HIGH).
  - Highlights 7-bit address byte (`0x3C` + Write bit `0`).
  - Flags missing `ACK` (NACK) in red when an OLED is disconnected or not responding.

---

## 4. Active I²C Bus Scanner & Diagnostic Protocol

The desktop invokes the firmware command `CMD_I2C_SCAN (0x10)`:
1. Firmware sweeps addresses `0x08` through `0x77` using `Wire.beginTransmission(addr)` and `Wire.endTransmission()`.
2. Firmware returns a binary bitmask of responsive devices (112 bits = 14 bytes payload).
3. The desktop cross-references responsive addresses against the known Silicon Database:
   - `0x3C`: SSD1306 / SH1106 / SSD1309 OLED
   - `0x3D`: Secondary SSD1306 address
   - `0x68`: MPU6050 6-Axis IMU
   - `0x76`: BME280 Pressure/Humidity/Temp sensor

---

## 5. Technical Requirements & Performance Guarantees

- **Audio Latency**: Synthesized audio for continuity beeper uses the Web Audio API with $< 15\text{ms}$ trigger latency.
- **Waveform Rendering**: Canvas logic trace rendering maintains 60 FPS utilizing `requestAnimationFrame` and `OffscreenCanvas`.
- **Safety Limiter**: Probing commands are rate-limited over serial to prevent saturating the 115200/921600 baud serial channel.
