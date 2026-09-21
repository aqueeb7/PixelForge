# Spec 004 — Hardware Workspace & ESP32 Board Definition

## Goal

Establish the **Hardware Workspace** and **ESP32 Board Definition System** in PixelForge. This milestone models the physical and electrical layout of ESP32 development boards, provides an interactive visual pinout and wiring inspector, and enables configuring attached peripherals (starting with the 128×64 I2C OLED display). 

This configuration forms the authoritative hardware schema (`hardware.json`) used by **Spec 005 (Active Hardware Probing & I²C Scan)** and **Spec 006 (Hardware Simulator)**.

---

## Architectural Principle: Physical Reality vs. Electrical Knowledge

As established in the project design:
1. **Passive wires cannot be discovered in isolation**: An ESP32 cannot inherently sense that a physical jumper wire connects GPIO 21 to an OLED display without active bus probing or state changes.
2. **Three-Layer Hardware Model**:
   ```
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Board Profile (Static Definition)                         │
   │    Physical pinout, GPIO multiplexing, electrical limits    │
   ├─────────────────────────────────────────────────────────────┤
   │ 2. Hardware Configuration (User & Project State)            │
   │    Assigned peripherals: OLED (SDA=21, SCL=22), buttons, etc│
   ├─────────────────────────────────────────────────────────────┤
   │ 3. Active Probing & Verification (Spec 005)                 │
   │    I²C bus scans (0x3C ACK), GPIO loopback, pin assertions   │
   └─────────────────────────────────────────────────────────────┘
   ```
3. Spec 004 builds Layers 1 and 2, creating the visual workspace, data contracts, and safety validation engine.

---

## Board Definition Schema (`BoardProfile`)

Each supported development board is defined by a canonical profile describing its physical pin headers, GPIO mappings, and hardware constraints.

### Pin Capabilities & Constraints

Pins are tagged with bitwise or enumerated capabilities:
- `POWER_3V3`: 3.3V power output
- `POWER_5V` / `VIN`: 5V power input/output
- `GND`: Ground reference
- `GPIO_IN`: Capable of digital input
- `GPIO_OUT`: Capable of digital output (Note: GPIOs 34, 35, 36, 39 are **input only**)
- `I2C_SDA` / `I2C_SCL`: Default hardware I²C pins (GPIO 21 = SDA, GPIO 22 = SCL)
- `SPI_MOSI` / `SPI_MISO` / `SPI_SCK` / `SPI_CS`: VSPI / HSPI default pins
- `ADC1`: Analog-to-digital converter channels (usable concurrently with Wi-Fi)
- `ADC2`: ADC channels (conflicts with Wi-Fi runtime)
- `DAC`: Digital-to-analog converter channels (GPIO 25, GPIO 26)
- `TOUCH`: Capacitive touch sensing pads (T0–T9)
- `UART`: Hardware serial RX/TX (UART0, UART2)

### Hardware Constraints & Strapping Pins

The board definition encodes critical ESP32 hardware advisories:
- **Strapping Pins (`isStrapping = true`)**:
  - `GPIO 0`: Bootloader mode (must not be held LOW on boot).
  - `GPIO 2`: Flashing mode (must be floating or LOW during flashing; connected to on-board LED on many DevKits).
  - `GPIO 12` (MTDI): Flash voltage selection (forcing HIGH can damage 3.3V flash modules).
  - `GPIO 15` (MTDO): Silent boot debug log output.
- **Input-Only Pins**: `GPIO 34`, `GPIO 35`, `GPIO 36` (VP), `GPIO 39` (VN) lack internal pull-up/pull-down resistors and cannot drive output peripherals.
- **ADC2 Wi-Fi Restriction**: ADC2 pins cannot be read reliably when Wi-Fi driver is active.

### Standard Supported Board Profiles

1. **ESP32 DevKit V1 (30-Pin)**:
   - Left Header (15 pins): `EN`, `VP (GPIO36)`, `VN (GPIO39)`, `D34`, `D35`, `D32`, `D33`, `D25`, `D26`, `D27`, `D14`, `D12`, `D13`, `GND`, `VIN (5V)`
   - Right Header (15 pins): `D23 (MOSI)`, `D22 (SCL)`, `TX0 (GPIO1)`, `RX0 (GPIO3)`, `D21 (SDA)`, `D19 (MISO)`, `D18 (SCK)`, `D5 (CS)`, `TX2 (GPIO17)`, `RX2 (GPIO16)`, `D4`, `D2`, `D15`, `GND`, `3V3`
2. **ESP32 DevKit V1 (36 / 38-Pin)**:
   - Includes additional exposed pins (GPIO 6-11 flash pins, GPIO 0).

---

## Peripheral Configuration Schema (`hardware.json`)

PixelForge serializes the active hardware workspace into a structured configuration file:

```json
{
  "version": 1,
  "boardId": "esp32-devkit-v1-30p",
  "boardName": "ESP32 DevKit V1 (30-pin)",
  "peripherals": [
    {
      "id": "oled-display-primary",
      "type": "OLED_128X64_I2C",
      "name": "1.3\" Monochrome OLED",
      "controller": "SH1106_OR_SSD1306",
      "i2cAddress": "0x3C",
      "pins": {
        "VCC": "3V3",
        "GND": "GND",
        "SDA": "GPIO_21",
        "SCL": "GPIO_22"
      },
      "status": "configured"
    }
  ]
}
```

Future peripherals in Spec 005 will include:
- `PUSH_BUTTON` (e.g. `PIN: GPIO_26`, mode: `INPUT_PULLUP`)
- `STATUS_LED` (e.g. `PIN: GPIO_2`, active high)
- `ROTARY_ENCODER` (e.g. `A: GPIO_32`, `B: GPIO_33`, `SW: GPIO_25`)

---

## Workspace UI & User Experience

The Hardware Workspace is accessible via a primary navigation route (`/hardware` or `/lab`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PixelForge • Hardware Workspace & Board Definition                          │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 🔌 Target Board: ESP32 DevKit V1 (30p)│ 📋 Configured Peripherals             │
│                                      ├──────────────────────────────────────┤
│   LEFT HEADER           RIGHT HEADER │ ▣ 1.3" OLED Display (128×64 Monochrome)│
│  ┌───────────┐         ┌───────────┐ │   • Bus: I²C (0x3C)                   │
│  │ EN        │         │ D23 (MOSI)│ │   • SDA ──► GPIO 21                   │
│  │ VP (GPI36)│         │ D22 (SCL) │◄┼───┼ SCL ──► GPIO 22                   │
│  │ VN (GPI39)│         │ TX0 (GPIO1│ │   • VCC ──► 3V3                       │
│  │ D34 (IN)  │         │ RX0 (GPIO3│ │   • GND ──► GND                       │
│  │ D35 (IN)  │         │ D21 (SDA) │◄┼───┘ [Status: Valid Mapping]           │
│  │ D32       │         │ D19 (MISO)│ ├──────────────────────────────────────┤
│  │ D33       │         │ D18 (SCK) │ │ ➕ Add Peripheral                     │
│  │ D25 (DAC) │         │ D5  (CS)  │ │   [Button] [LED] [Sensor]             │
│  │ D26 (DAC) │         │ TX2 (GP17)│ ├──────────────────────────────────────┤
│  │ D27       │         │ RX2 (GP16)│ │ ⚡ Pin Inspector: GPIO 21 (D21)       │
│  │ D14       │         │ D4        │ │   • Header: Right, Pin 5             │
│  │ D12 (STRAP│         │ D2  (LED) │ │   • Default Function: I²C SDA         │
│  │ D13       │         │ D15 (STRAP│ │   • Cap: GPIO, I2C, PWM, Touch       │
│  │ GND       │         │ GND       │ │   • Status: Assigned to OLED [SDA]    │
│  │ VIN (5V)  │         │ 3V3       │ │   • Strapping Warning: None (Safe)    │
│  └───────────┘         └───────────┘ └──────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI Features:
1. **Interactive Dual-Row Pinout**:
   - Visual representation of the ESP32 module with Left and Right headers.
   - Visual color coding for pin classes:
     - **Power (3V3 / VIN)**: Red / Orange accent
     - **Ground (GND)**: Dark slate / Neutral
     - **I²C (SDA / SCL)**: Cyan / Teal
     - **SPI**: Purple
     - **Analog / ADC**: Emerald green
     - **Standard GPIO**: Slate / White
     - **Strapping Pins**: Amber warning ring
2. **Pin Selection & Hover Inspector**:
   - Selecting or hovering over any pin highlights its counterpart assignments, shows physical header coordinates, alternate functions, and safety notes.
3. **Peripheral Manager Panel**:
   - Displays all registered project peripherals.
   - Dedicated card for the **128×64 OLED Display** with live pin bindings.
   - Validation badge displaying rule check results.
4. **Validation & Advisory Engine**:
   - Warns if output peripherals are bound to input-only pins (GPIO 34-39).
   - Warns if active peripherals interfere with critical strapping pins (GPIO 0, 2, 12, 15).
   - Prevents duplicate conflicting pin assignments.

---

## Code Architecture & Responsibilities

### 1. Frontend (`src/`)
- `src/types/hardware.ts`:
  - Type definitions for `BoardProfile`, `PinDefinition`, `PinCapability`, `PeripheralDevice`, `HardwareConfig`.
- `src/services/boardProfiles.ts`:
  - Built-in board profile definitions (ESP32 DevKit V1 30-pin and 38-pin).
- `src/stores/hardware.ts`:
  - Pinia store managing active board profile, peripheral list, pin assignments, selection states, and validation rules.
- `src/components/hardware/`:
  - `Esp32BoardView.vue`: Interactive SVG/Canvas board layout with pin nodes, headers, and assignment badges.
  - `PinInspector.vue`: Detailed inspector for the selected pin.
  - `PeripheralCard.vue`: Card displaying configured peripheral details and pin mappings.
- `src/views/HardwareView.vue`:
  - Primary hardware workspace view integrated into sidebar navigation.

### 2. Backend (`src-tauri/src/hardware/`)
- `src-tauri/src/hardware/mod.rs`:
  - Domain structs: `BoardProfile`, `PinDefinition`, `HardwareConfig`.
- `src-tauri/src/commands/hardware.rs`:
  - Tauri commands:
    - `get_board_profiles()`: Return list of standard board definitions.
    - `get_hardware_config()`: Read `hardware.json` from project or app storage.
    - `save_hardware_config(config: HardwareConfig)`: Persist updated hardware mappings.

---

## Acceptance Criteria

1. **Board Definition Completeness**:
   - Both 30-pin and 38-pin ESP32 DevKit board profiles are modeled with accurate pin numbers, GPIO mappings, and capability flags.
   - Input-only pins and strapping pins are accurately classified with embedded safety advisories.
2. **Interactive Workspace View**:
   - Navigating to Hardware Workspace displays an authentic ESP32 board layout with color-coded pin tags.
   - Clicking any pin displays its full electrical and logical specification in the Pin Inspector.
3. **Peripheral Configuration**:
   - Default hardware profile includes the 128×64 OLED display connected to SDA (GPIO 21), SCL (GPIO 22), 3V3, and GND.
   - Active OLED connections are visually highlighted directly on the board pinout.
4. **Validation Engine**:
   - Assigning an invalid configuration (e.g. mapping an output to an input-only pin, or two peripherals to the same non-shared pin) produces clear UI warnings.
5. **Persistence**:
   - Hardware configuration can be saved and reloaded through the Tauri backend.
6. **Extensibility**:
   - Schema directly accepts future Spec 005 probing commands (`CMD_I2C_SCAN`) and additional peripheral types (buttons, LEDs, sensors).
