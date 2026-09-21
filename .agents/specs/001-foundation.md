# Spec 001 — PixelForge Foundation

## Goal

Create the initial Tauri desktop application and establish the
frontend/Rust architecture.

---

## Requirements

Application must:

- launch as a desktop application
- use Vue 3
- use TypeScript
- use Tauri
- use Rust
- have a basic application shell
- expose a working Tauri command
- have a project structure compatible with future OLED/video features

---

## UI

Create:

Sidebar:

PixelForge
─────────
Home
Draw
Video
Animation
Devices
Projects
Settings

Main area:

Welcome to PixelForge

Status:

ESP32
Disconnected

---

## Rust

Create a basic health/status command.

Example conceptual API:

get_app_info()

Returns:

name
version
platform

---

## Do NOT implement

- video processing
- ESP32 communication
- OLED drawing
- FFmpeg
- animation
- authentication
- cloud services

---

## Acceptance Criteria

1. Application launches.
2. Vue UI renders.
3. Rust/Tauri command works.
4. Frontend receives Rust response.
5. Project builds without errors.
6. Architecture is ready for the next specification.