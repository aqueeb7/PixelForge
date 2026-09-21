# PixelForge — Agent Instructions

## Project

PixelForge is a desktop application for creating, converting, previewing,
and sending 1-bit graphics and animations to ESP32-connected OLED displays.

The application is primarily designed around a 128x64 monochrome OLED.

The long-term goal is:

DRAW / IMPORT VIDEO
        ↓
PROCESS
        ↓
128x64 1-BIT BITMAP
        ↓
PREVIEW
        ↓
ESP32
        ↓
OLED
        ↓
ANIMATION / REEL CREATION

---

# Core Technology

Frontend:
- Vue 3
- TypeScript
- Vite
- Tauri
- Tailwind CSS where appropriate

Desktop backend:
- Rust
- Tauri commands

Video:
- FFmpeg
- Local processing only

Hardware:
- ESP32
- I2C OLED
- Primary target: 128x64 monochrome OLED

Firmware:
- C/C++ for ESP32
- Do not assume Arduino IDE is available
- Firmware should be buildable independently

---

# Engineering Principles

## 1. Local-first

PixelForge must work without a cloud backend.

Do not introduce:
- SaaS APIs
- mandatory accounts
- cloud processing
- paid services

unless explicitly requested.

---

## 2. Hardware abstraction

Do not hard-code OLED-specific logic throughout the application.

Create abstractions for:

- DisplayProfile
- Frame
- Animation
- Device
- Transport

The initial profile is:

128x64
1-bit monochrome
I2C

Future profiles may include other OLED controllers.

---

## 3. Separate responsibilities

Vue is responsible for:

- UI
- user interaction
- canvas rendering
- timeline interaction
- application state

Rust is responsible for:

- filesystem operations
- video processing
- bitmap processing
- CPU-intensive transformations
- FFmpeg integration
- device communication where appropriate
- project serialization

ESP32 firmware is responsible for:

- receiving frames
- storing frames
- OLED rendering
- animation playback

---

# Important Rule

Do not solve a problem by putting all logic into one file.

Prefer small modules with clear responsibilities.

---

# Project Files

PixelForge projects should eventually use a portable project format.

Example:

project/
  project.json
  frames/
    0001.bin
    0002.bin
    0003.bin

Do not invent the final format prematurely.

First document the format in a specification.

---

# OLED Bitmap Format

The initial display is:

WIDTH = 128
HEIGHT = 64

1 bit per pixel.

Therefore:

128 * 64 / 8 = 1024 bytes per frame.

The application should maintain a canonical internal representation
independent of the OLED controller's page addressing format.

Convert to controller-specific format only at the device/output boundary.

---

# Video Processing

The video pipeline must be explicit:

Input video
→ frame extraction
→ crop
→ resize
→ grayscale
→ dithering
→ threshold / 1-bit conversion
→ bitmap packing
→ preview
→ export/send

Do not combine all processing into one opaque function.

Each stage should be independently testable.

---

# UI Principle

The application should feel like a creative tool, not a developer utility.

Primary workflow:

Import
→ Edit
→ Preview
→ Send
→ Export

Avoid exposing technical complexity unless necessary.

---

# Development Process

Before implementing a substantial feature:

1. Read the relevant specification.
2. Inspect the existing architecture.
3. Identify affected modules.
4. Implement the smallest coherent change.
5. Run tests/build.
6. Update the specification if behavior changed.
7. Document important decisions.

Never blindly rewrite existing working code.

---

# Hardware Safety

Never assume GPIO pins.

The exact ESP32 board and OLED wiring must be documented in the
hardware specification.

Do not modify GPIO configuration without checking the hardware profile.

---

# Testing

Every important transformation should have deterministic tests.

Especially:

- bitmap dimensions
- bit packing
- frame ordering
- grayscale conversion
- dithering
- crop calculations
- resize calculations
- project serialization

Hardware tests should be separated from unit tests.

---

# Git

Use small, meaningful commits.

Examples:

feat: add 128x64 bitmap model
feat: add OLED canvas
feat: add ESP32 discovery
fix: correct bitmap page packing
feat: add video frame extraction

Do not create commits containing unrelated changes.

---

# Current Priority

Build the project incrementally.

Do NOT implement the entire product in one pass.

Phase 1:

Application foundation
→ OLED canvas
→ 128x64 preview
→ bitmap model
→ ESP32 connection
→ send static frame
→ OLED displays frame

Only after Phase 1 is stable should video processing be implemented.