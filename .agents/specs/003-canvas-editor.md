# Spec 003 — 128×64 OLED Canvas & Drawing Tools

## Goal

Create a pixel-perfect, interactive 128×64 pixel art canvas editor with essential drawing tools, bounded undo/redo history, zoom/pan navigation, and direct synchronization to the ESP32-connected physical OLED display using the established Spec 002 serial transport.

---

## Implementation Contract & Architecture

The editor operates strictly on a **single canonical framebuffer**:

```text
                 ┌─────────────────────┐
                 │   128×64 Canvas     │
                 └──────────┬──────────┘
                            │
                    drawing operation
                            ↓
                 ┌─────────────────────┐
                 │ Uint8Array(1024)    │
                 │ canonical framebuffer│
                 └───────┬─────────────┘
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
       History Manager          OLED Sync
       50 snapshots             Send / Mirror
              │                     │
       Undo / Redo              send_frame
                                    │
                                    ↓
                              Existing Serial
                                    │
                                    ↓
                                  ESP32
                                    │
                                    ↓
                                128×64 OLED
```

### Core Architecture Rules

1. **Single Authoritative Source of Truth**:
   - The canvas renderer reads from the `Uint8Array(1024)`.
   - Tools modify the `Uint8Array(1024)`.
   - History stores clones of the `Uint8Array(1024)`.
   - Serial transmission (`send_frame`) reads the same `Uint8Array(1024)`.
   - No separate image representation or format conversion exists.
2. **Canonical Data Format**:
   - Resolution: $128 \times 64$ logical pixels ($8,192$ pixels total).
   - Array: Flat $1,024$-byte array (`Uint8Array(1024)`).
   - Packing: Row-major, MSB-first (bit 7 represents $X \pmod 8 = 0$, bit 0 represents $X \pmod 8 = 7$).
     $$\text{Byte Index} = Y \times 16 + \lfloor X / 8 \rfloor, \quad \text{Bit Mask} = 0x80 \gg (X \pmod 8)$$
3. **Tool Preview Separation**:
   - While dragging with Line or Rectangle, tool preview does **NOT** mutate the committed framebuffer.
   - The preview is composited ephemerally on a separate overlay during `mousemove`.
   - The pixels are committed to the canonical framebuffer only upon `mouseup`, creating exactly one history snapshot.
4. **Bresenham Pencil Interpolation**:
   - Continuous pencil strokes rasterize a complete Bresenham line between successive pointer samples to guarantee no gaps during fast mouse movement.
5. **Right-Click Eraser**:
   - Right-click drawing functions as an eraser and prevents the browser context menu (`contextmenu.prevent`).
6. **Rectangle Modes**:
   - Explicitly selectable: **Outline** or **Filled**.
7. **Framebuffer Flood Fill**:
   - Bucket fill operates directly on the 1024-byte framebuffer bit-matrix using 4-way flood fill.

---

## Toolset Specifications

| Tool | Icon | Behavior |
| :--- | :---: | :--- |
| **Pencil** | ✏️ | Sets pixels to `1` along path with Bresenham interpolation between samples. |
| **Eraser** | 🧹 | Clears pixels to `0` along path with Bresenham interpolation. Right-click with any tool also erases. |
| **Line** | 📏 | Interactive Bresenham line with ghost preview; commits on mouseup. |
| **Rectangle** | ▭ | Interactive rectangle with **Outline** or **Filled** modes; commits on mouseup. |
| **Fill Bucket** | 🪣 | 4-way flood fill operating directly on canonical bit buffer. |
| **Invert** | ◐ | Instantaneously inverts all bits across the 1024-byte array (`byte ^= 0xFF`). |
| **Clear** | 🗑 | Blanks the entire 1024-byte framebuffer to zeros (`0x00`). |

---

## History Model (Undo / Redo)

- Stack Structure:
  ```text
  past[] (max 50)      current (1024 B)      future[]
        │                     │                 │
        └─── Undo ────────────┘───── Redo ──────┘
  ```
- Maximum depth: **50 snapshots** ($50 \times 1\text{ KB} \approx 50\text{ KiB}$).
- FIFO eviction when exceeding 50 entries.
- New stroke after Undo discards the `future[]` redo branch.
- Keyboard shortcuts: `Ctrl+Z` (Undo), `Ctrl+Y` or `Ctrl+Shift+Z` (Redo).

---

## Canvas & Viewport

- Exact $128 \times 64$ logical pixels.
- Zoom levels: **1×, 2×, 4×, 6×, 8×, 12×, 16×** (default **8×**).
- Panning via middle-click drag or `Space` + drag.
- Pixel grid overlay at zoom $\ge 4\times$.
- Live cursor coordinates HUD (`X: [0..127], Y: [0..63]`).

---

## Physical Display Synchronization

- **Send to Display**: Transmits active 1024-byte framebuffer to ESP32 using the proven `send_frame` serial command.
- **Live Mirror Mode**: When enabled, canvas changes automatically transmit to the ESP32 upon stroke completion (`mouseup`). Uses the exact same `send_frame` path as "Send to Display".
- Connection badge and transmission feedback in the canvas toolbar.

---

## Acceptance Test Sequence

Before declaring Spec 003 complete, the following sequence must pass:

1. Draw random pixels with Pencil.
2. Click **Send to Display**; confirm physical OLED updates.
3. Draw a line with Line tool.
4. Undo (`Ctrl+Z`); verify line disappears.
5. Redo (`Ctrl+Y`); verify line reappears.
6. Click **Invert**; verify all pixels invert.
7. Undo; verify inversion reverses.
8. Click **Clear**; verify canvas becomes blank.
9. Undo; verify drawing restores.
10. Enable **Live Mirror**.
11. Draw continuously with Pencil; confirm OLED updates on stroke release with no gaps.
12. Disable **Live Mirror**.
13. Draw additional pixels on canvas.
14. Confirm physical OLED remains unchanged while Live Mirror is off.
15. Click **Send to Display**.
16. Confirm physical OLED now exactly matches the canvas.
