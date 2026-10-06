# Spec 010 — Virtual ESP32 Simulator (Silicon Emulation & Virtual OLED)

## 1. Goal & Product Identity

A core friction point for embedded developers and creators is hardware dependency:
- Debugging animation loops requires physical hardware, USB cables, and breadboards.
- Continuous Integration (CI/CD) cannot physically verify that a newly generated animation reel actually displays correctly without physical bench testing.
- Beginners frequently struggle with loose jumper wires, bad USB data cables, or blown LDO regulators.

**Spec 010** introduces the **PixelForge Virtual ESP32 Simulator**:
A fully local, zero-hardware emulation engine executing within Tauri (Rust native core / WASM) that simulates:
1. **Virtual GPIO Matrix**: Models input/output states, strapping pins, and internal pull-up/pull-down resistors.
2. **Virtual I²C Bus Engine**: Accurately simulates the I²C state machine (Start, Address ACK, Register, Data, Stop) at 100kHz / 400kHz timing.
3. **Virtual SSD1306 / SH1106 OLED Display**: An accurate software emulator of the display controller's 1,024-byte Graphic Display Data RAM (GDDRAM), page-addressing registers, and contrast modulation.
4. **Simulator Transport (`SimulatorTransport`)**: Plugs into the `ITransport` adapter interface ([Spec 007](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/007-scalable-architecture-patterns.md)), allowing the entire desktop UI (Video Converter, Canvas, Multimeter, Telemetry) to interact with a virtual ESP32 with zero code changes.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   PIXELFORGE VIRTUAL ESP32 SIMULATOR                   │
├───────────────────────────────┬────────────────────────────────────────┤
│        VIRTUAL HARDWARE       │         EMULATED 128×64 OLED           │
│                               │                                        │
│   [ ESP32-WROOM-32 ]          │   ┌────────────────────────────────┐   │
│   • CPU 0: 240 MHz (Idle)     │   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│   • CPU 1: 240 MHz (Render)   │   │ ░░███╗░░██████╗░███████╗█████╗ │   │
│   • Free Heap: 284,120 B      │   │ ░░██╔██╗██╔═══██╗██╔════╝██╔══╝ │   │
│   • I2C Bus: Active @ 0x3C    │   │ ░░█████╔╝██████╔╝███████╗█████╗ │   │
│   • Frame Rate: 30.0 FPS      │   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│                               │   └────────────────────────────────┘   │
│   [ REEL MEMORY ]             │   Controller: SSD1306 (Page Mode)      │
│   • Frames: 150 / 150 Loaded  │   GDDRAM: 1024 Bytes | Contrast: 255   │
├───────────────────────────────┴────────────────────────────────────────┤
│                       SIMULATION CONTROLS                              │
│  [ ▶ RUN ]  [ ⏸ PAUSE ]  [ ⏭ STEP FRAME ]  [ 🔄 RESET SILICON ]      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Virtual SSD1306 OLED Memory Controller

The virtual OLED emulates the internal state registers of the Solomon Systech SSD1306 controller:

```typescript
// src/core/simulation/VirtualSsd1306.ts
export class VirtualSsd1306 {
  readonly width = 128;
  readonly height = 64;
  readonly gddram = new Uint8Array(1024); // 8 pages × 128 columns

  // Controller State Registers
  private pageAddress = 0;       // 0 to 7
  private columnAddress = 0;     // 0 to 127
  private contrast = 0x7F;       // 0 to 255
  private displayOn = true;
  private inverseMode = false;   // Normal (0=Black, 1=White) vs Inverted
  private addressingMode: 'PAGE' | 'HORIZONTAL' | 'VERTICAL' = 'PAGE';

  /**
   * Dispatches command bytes received over virtual I2C
   */
  writeCommand(cmd: number): void {
    if (cmd >= 0xB0 && cmd <= 0xB7) {
      this.pageAddress = cmd - 0xB0;
    } else if (cmd === 0xAE) {
      this.displayOn = false;
    } else if (cmd === 0xAF) {
      this.displayOn = true;
    } else if (cmd === 0xA6) {
      this.inverseMode = false;
    } else if (cmd === 0xA7) {
      this.inverseMode = true;
    }
  }

  /**
   * Writes data bytes directly into GDDRAM
   */
  writeData(byte: number): void {
    const idx = this.pageAddress * this.width + this.columnAddress;
    if (idx < 1024) {
      this.gddram[idx] = byte;
    }
    this.columnAddress = (this.columnAddress + 1) % this.width;
  }

  /**
   * Renders the current GDDRAM state to an HTML5 Canvas context
   */
  renderToCanvas(ctx: CanvasRenderingContext2D, scale: number = 4): void {
    const imgData = ctx.createImageData(this.width, this.height);
    const data = imgData.data;

    for (let page = 0; page < 8; page++) {
      for (let col = 0; col < 128; col++) {
        const byte = this.gddram[page * 128 + col];
        for (let bit = 0; bit < 8; bit++) {
          const y = page * 8 + bit;
          const x = col;
          const pixelIndex = (y * this.width + x) * 4;
          const isLit = (byte & (1 << bit)) !== 0;
          const effectiveLit = this.inverseMode ? !isLit : isLit;

          // OLED Classic Blue/White Phosphor
          const color = effectiveLit && this.displayOn ? (this.contrast / 255) * 255 : 0;
          data[pixelIndex] = color;     // R
          data[pixelIndex + 1] = color; // G
          data[pixelIndex + 2] = color; // B
          data[pixelIndex + 3] = 255;   // Alpha
        }
      }
    }
    // Draw scaled pixel-perfect canvas
    ctx.putImageData(imgData, 0, 0);
  }
}
```

---

## 3. Simulator Transport Integration (`SimulatorTransport`)

The simulator implements the universal `ITransport` interface:

```typescript
// src/strategies/transport/SimulatorTransport.ts
import type { ITransport, TransportEventMap } from './ITransport';
import { VirtualEsp32Core } from '@/core/simulation/VirtualEsp32Core';

export class SimulatorTransport implements ITransport {
  readonly id = 'simulator';
  isConnected = false;
  private core: VirtualEsp32Core;
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.core = new VirtualEsp32Core();
    // Forward simulated packet responses to desktop listeners
    this.core.onPacketOut((bytes: Uint8Array) => {
      this.emit('data', bytes);
    });
  }

  async connect(): Promise<void> {
    this.isConnected = true;
    this.emit('connected', undefined);
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.emit('disconnected', undefined);
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.isConnected) throw new Error('Virtual Simulator offline');
    // Feed packet directly into virtual ESP32 binary dispatcher
    this.core.dispatchPacket(packet);
  }

  on<K extends keyof TransportEventMap>(event: K, handler: (payload: TransportEventMap[K]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler);
  }

  private emit(event: string, payload: any): void {
    this.listeners.get(event)?.forEach(fn => fn(payload));
  }
}
```

---

## 4. Autonomous Simulation Features

1. **Step-by-Step Frame Debugger**:
   - Pause execution, step forward 1 frame, step backward 1 frame.
   - Inspect exact byte diffs between consecutive animation frames.
2. **Deterministic CI/CD Headless Testing**:
   - Run tests without GUI: load an MP4, dither with Atkinson, stream through `SimulatorTransport`, and compare final virtual GDDRAM hash against golden test vectors.
3. **Silicon Anomaly Injection**:
   - Inject simulated I2C bus noise, CRC errors, and memory pressure to verify frontend graceful degradation.
