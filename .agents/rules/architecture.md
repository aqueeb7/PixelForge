---
trigger: always_on
---

# Architecture Rules

PixelForge has four major boundaries:

Frontend
    ↓
Tauri Command API
    ↓
Rust Core
    ↓
Hardware / Filesystem / FFmpeg

---

## Frontend

Vue must not directly contain:

- FFmpeg logic
- filesystem implementation
- hardware protocols
- bitmap packing implementation

Vue may request operations through Tauri commands.

---

## Rust Core

Rust should expose explicit commands.

Examples:

create_project
open_project
save_project
import_image
import_video
process_frame
send_frame
send_animation
get_devices

Commands should use typed request/response structures.

Avoid passing arbitrary JSON where a typed structure is practical.

---

## Core Data Types

Initial conceptual types:

DisplayProfile
Frame
Bitmap
Animation
Project
Device
VideoProcessingSettings

---

## DisplayProfile

A display profile contains:

width
height
color_depth
controller
transport

Initial profile:

128x64
1-bit
I2C OLED

---

## Frame

A Frame represents one logical image.

It should not initially depend on SSD1306 page addressing.

---

## Bitmap

Canonical representation:

width
height
pixels

The canonical representation should be easy to manipulate.

Packing happens when exporting to a device format.

---

## Animation

Animation contains:

frames
fps
loop
metadata

---

## Device

A device represents an ESP32 capable of receiving PixelForge data.

The frontend should not need to know whether communication uses:

HTTP
WebSocket
Serial
or another transport.

---

## Transport

Keep transport replaceable.

Initial implementation may use Wi-Fi.

USB/serial can be added later.