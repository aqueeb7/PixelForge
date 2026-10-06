# Spec 008 — Component & Wiring Graph (Visual Breadboard & Netlist)

## 1. Goal & Product Identity

While [Spec 004](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/004-hardware-workspace.md) established the static ESP32 Board Definition and pin capability constraints, and [Spec 007](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/007-scalable-architecture-patterns.md) decoupled the hardware domain models (`DisplayProfile` vs `DisplayConnection`), **Spec 008** introduces the interactive **Component & Wiring Graph**.

This milestone bridges the abstract pinout model with visual physical prototyping:
- A drag-and-drop **Interactive Canvas / Breadboard** where makers connect ESP32 pins to physical peripherals.
- A **Dynamic Netlist Engine** tracking electrical nodes, bus sharing (I²C SDA/SCL pull-ups), and power rails (3V3, 5V, GND).
- An **Active Electrical Constraint Linter** that flags strapping pin hazards, input-only pin violations, bus address collisions, and voltage mismatch in real time before power is applied.
- An **Automated Code Generator** producing reproducible C++ pin header definitions (`pinout.h`) and `Wire.begin(SDA, SCL)` initialization code for firmware.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   PIXELFORGE WIRING GRAPH STUDIO                       │
├───────────────────────────────┬────────────────────────────────────────┤
│     PERIPHERAL PALETTE        │      INTERACTIVE BREADBOARD CANVAS     │
│                               │                                        │
│  [+] 0.96" OLED 128×64 (I2C)  │    ┌──────────────┐     ┌───────────┐  │
│  [+] 0.91" OLED 128×32 (I2C)  │    │ ESP32 DevKit │     │ I2C OLED  │  │
│  [+] Push Button (Active LOW) │    │  [3V3]───────┼────►│ [VCC]     │  │
│  [+] Rotary Encoder (EC11)    │    │  [GND]───────┼────►│ [GND]     │  │
│  [+] NeoPixel LED Ring        │    │  [D22]───────┼────►│ [SCL]     │  │
│  [+] MicroSD SPI Adapter      │    │  [D21]───────┼────►│ [SDA]     │  │
│                               │    └──────────────┘     └───────────┘  │
├───────────────────────────────┴────────────────────────────────────────┤
│                       ELECTRICAL LINTER & STATUS                       │
│  ✓ I²C Bus 1 @ 0x3C Valid (400 kHz) | 0 Strapping Pin Warnings         │
│  ✓ Power Budget: 3.3V Rail (Estimated Load: 28mA / 500mA Limit)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Peripheral Component Catalog

Every peripheral in the PixelForge library is defined by a declarative `ComponentDefinition` specifying its mechanical pins, electrical requirements, and bus protocols.

```typescript
// src/core/hardware/ComponentDefinition.ts
export type PinType = 'POWER_IN' | 'GND' | 'I2C_SDA' | 'I2C_SCL' | 'SPI_MOSI' | 'SPI_MISO' | 'SPI_SCK' | 'SPI_CS' | 'GPIO' | 'ANALOG';

export interface ComponentPin {
  id: string;
  label: string;
  type: PinType;
  requiredVoltage?: 3.3 | 5.0;
  description: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: 'Display' | 'Input' | 'Sensor' | 'Storage' | 'Actuator';
  description: string;
  width: number;       // Visual representation width in px
  height: number;      // Visual representation height in px
  pins: ComponentPin[];
  i2cAddress?: number; // Default address e.g. 0x3C
  alternateI2cAddresses?: number[]; // e.g. [0x3D]
  estimatedCurrentMa: number;
}
```

### Initial Component Registry:
1. **0.96" / 1.3" Monochrome OLED (SSD1306 / SH1106)**:
   - Pins: `VCC` (3.3V), `GND`, `SCL` (I2C Clock), `SDA` (I2C Data).
   - I2C Default: `0x3C` (Selectable: `0x3D` via onboard resistor jumper).
   - Current draw: ~20mA (all pixels on).
2. **0.91" Slim Monochrome OLED 128×32 (SSD1306)**:
   - Pins: `GND`, `VCC` (3.3V), `SCL`, `SDA`.
   - Current draw: ~12mA.
3. **Tactile Push Button (Momentary)**:
   - Pins: `PIN_A`, `PIN_B`.
   - Wiring mode: Active LOW with ESP32 internal pull-up (`INPUT_PULLUP`).
4. **Rotary Encoder (EC11 with Push Button)**:
   - Pins: `CLK`, `DT`, `SW`, `+` (3.3V), `GND`.
   - Ideal for frame scrubbing, timeline stepping, and on-device menu navigation.

---

## 3. The Netlist & Wiring Model

Connections in the wiring graph are not merely visual lines; they constitute an electrical **Netlist**:

```typescript
// src/core/hardware/Netlist.ts
export interface NetNode {
  instanceId: string; // Board ID ('esp32') or Peripheral Instance ID
  pinId: string;      // Pin identifier e.g. 'GPIO_21' or 'SDA'
}

export interface WireNet {
  id: string;
  name: string;       // e.g. 'NET_I2C_SDA', 'NET_3V3', 'NET_GND'
  color: string;      // Visual wire color code
  nodes: NetNode[];   // List of connected endpoints
}

export interface HardwareProjectSchema {
  version: '1.0.0';
  boardProfileId: string; // e.g. 'esp32-devkit-v1-30p'
  components: Array<{
    instanceId: string;
    definitionId: string;
    position: { x: number; y: number };
    customConfig?: Record<string, any>;
  }>;
  nets: WireNet[];
}
```

### Standard Color Coding Defaults:
- **Red (`#EF4444`)**: 3.3V / 5V Power Rails.
- **Black / Dark Gray (`#1F2937`)**: Ground (GND).
- **Amber / Yellow (`#F59E0B`)**: I2C Clock (SCL).
- **Cyan / Blue (`#3B82F6`)**: I2C Data (SDA).
- **Emerald (`#10B981`)**: SPI Buses (MOSI / MISO / SCK).
- **Violet / Purple (`#8B5CF6`)**: General Purpose Digital / Analog GPIOs.

---

## 4. Live Electrical Linter & Rule Engine

As the user links pins with interactive Bezier wires, the **Electrical Linter** continuously evaluates safety constraints:

### Rule 1: Voltage Level Protection
- **Condition**: Peripheral requiring 5V connected to 3.3V output rail, or 3.3V-only device connected to 5V (VIN).
- **Severity**: `CRITICAL ERROR`.
- **Message**: *"Component '%s' requires 3.3V VCC. Connection to 5V rail may permanently damage the silicon."*

### Rule 2: Strapping Pin Guard
- **Condition**: GPIO 0, GPIO 2, GPIO 12, or GPIO 15 wired to a low-impedance external component or pull-up/pull-down resistor.
- **Severity**: `WARNING`.
- **Message**: *"GPIO %s is an ESP32 strapping pin. Grounding this pin will prevent the ESP32 from booting firmware normally."*

### Rule 3: Input-Only Pin Guard
- **Condition**: Output-driven signals (OLED CS, LED data, buzzer, motor control) wired to GPIO 34, 35, 36 (VP), or 39 (VN).
- **Severity**: `BLOCKING ERROR`.
- **Message**: *"GPIO %s is input-only silicon (lacks internal output driver). Cannot be used as an output."*

### Rule 4: I²C Bus Address Collisions
- **Condition**: Two peripherals connected to the same I²C bus sharing identical addresses (e.g. two OLEDs both set to `0x3C`).
- **Severity**: `ERROR`.
- **Message**: *"I²C Address Conflict: Both '%s' and '%s' respond to 0x3C. Reconfigure the address jumper or use a second I²C bus."*

### Rule 5: Power Budget Estimation
- **Condition**: Cumulative current draw of all connected peripherals exceeds the ESP32 onboard LDO regulator ceiling (typically 500mA).
- **Severity**: `ADVISORY`.
- **Message**: *"Total estimated peripheral load: %dmA (exceeds recommended 3.3V LDO threshold of 450mA)."*

---

## 5. Automated Firmware Code Generation

The wiring graph automatically generates clean, standalone C++ header files ready to drop into PlatformIO or the Arduino IDE:

```cpp
// Generated by PixelForge Hardware Studio — Do NOT Edit Manually
// Project: OLED Creative Reel Station
#pragma once
#include <Arduino.h>
#include <Wire.h>

// --- PIN DEFINITIONS ---
#define PIN_OLED_SDA  21
#define PIN_OLED_SCL  22
#define PIN_BUTTON_A  4
#define PIN_ENCODER_CLK 18
#define PIN_ENCODER_DT  19
#define PIN_ENCODER_SW  5

// --- I2C CONFIGURATION ---
#define OLED_I2C_ADDRESS 0x3C
#define OLED_SCREEN_WIDTH 128
#define OLED_SCREEN_HEIGHT 64

inline void initHardwarePins() {
    // I2C Bus Initialization
    Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, 400000);

    // Digital Inputs with Internal Pull-Ups
    pinMode(PIN_BUTTON_A, INPUT_PULLUP);
    pinMode(PIN_ENCODER_CLK, INPUT_PULLUP);
    pinMode(PIN_ENCODER_DT, INPUT_PULLUP);
    pinMode(PIN_ENCODER_SW, INPUT_PULLUP);
}
```

---

## 6. Implementation Phasing

1. **Phase 1: Component Schema & Registry** (`src/core/hardware/`):
   - Model `ComponentDefinition` and build registry of initial components (OLED 128x64, 128x32, Buttons, Encoders).
2. **Phase 2: Visual Breadboard Canvas** (`src/components/hardware/graph/`):
   - Interactive SVG/Canvas node editor with draggable components and magnetic pin snapping.
   - Smooth cubic Bezier curves for wire routing with active color coding.
3. **Phase 3: Real-Time Constraint Linter** (`src/services/electricalLinter.ts`):
   - Deterministic rule engine running on every netlist mutation.
   - Visual warning badges on colliding pins.
4. **Phase 4: Code Generation & Project Persistence** (`src/stores/wiring.ts`):
   - Serializing netlist into project JSON (`hardware.json`).
   - One-click copy/export of C++ `pinout.h`.
