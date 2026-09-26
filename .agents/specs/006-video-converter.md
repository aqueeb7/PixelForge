# Spec 006 — Video to 128×64 OLED Converter & Multi-Algorithm Dithering Engine

## Inspiration & Product Identity (Face 2: Creative Studio)

PixelForge is designed around two complementary pillars:
1. **Face 1 (Hardware Cockpit)**: High-precision ESP32 board visualization, silicon treemap telemetry, and low-level firmware tooling.
2. **Face 2 (Creative Studio)**: An intuitive, high-impact playground for IoT makers, pixel artists, and tech influencers.

While drawing tools ([Spec 003](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/003-canvas-editor.md)) allow manual pixel art creation, the **Video to 128×64 OLED Converter** is PixelForge's headline creative feature. It allows users to drag in any video clip (MP4, GIF, WebM, MOV), adjust spatial framing and contrast, preview multiple real-time 1-bit dithering algorithms, and stream or export high-framerate monochrome animations running directly on physical OLED displays.

---

## Architectural Pipeline (Local-First)

In accordance with [AGENTS.md](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/AGENTS.md), all video processing is strictly local with no cloud dependencies or telemetry:

```text
Local Video (MP4 / GIF / WebM / MOV)
                  ↓
[Stage 1: Frame Extraction & Resampling]
  - Target FPS: 5, 10, 12, 15, 20, 24, 30 FPS
  - In/Out Trimming & Duration Cap
                  ↓
[Stage 2: Spatial Framing & Crop Engine]
  - Target 128×64 (2:1 aspect ratio)
  - Fit Modes: Cover (Center Crop), Contain (Letterbox), Stretch
                  ↓
[Stage 3: Grayscale Normalization & Contrast Boost]
  - BT.709 Luminance: Y = 0.2126R + 0.7152G + 0.0722B
  - Contrast, Brightness, Gamma & Black-point Clipping
  - Edge Enhancement (Laplacian Boost for small OLEDs)
                  ↓
[Stage 4: Multi-Algorithm Dithering Engine]
  ├── Floyd-Steinberg (Balanced diffusion)
  ├── Atkinson (Macintosh Classic 1984 punchy highlights)
  ├── Bayer Ordered (2×2, 4×4, 8×8 flicker-free retro matrix)
  ├── Burkes / Sierra Lite (Fine diffusion)
  └── Adaptive Otsu Threshold (Clean silhouette)
                  ↓
[Stage 5: Canonical 1-Bit Bit Packing]
  - 128 × 64 pixels = 8,192 bits = 1,024 bytes / frame
                  ↓
[Stage 6: Interactive Scrubbable Timeline & Reel Engine]
  - Play, Pause, Loop, Scrub, Frame Step
  - "Edit in Draw" Canvas Hand-Off
                  ↓
       ┌──────────┴──────────┐
       ↓                     ↓
[Live Serial Stream]   [Export Options]
  - Real-time 30 FPS     - C/C++ PROGMEM Header
    to ESP32 OLED        - Raw Binary Reel (.bin)
                         - Animated Monochrome GIF
```

---

## Technical Specifications

### 1. Ingestion & Frame Extraction
- **Input Formats**: MP4 (H.264 / H.265), WebM (VP8 / VP9 / AV1), GIF (Animated), MOV, APNG, and PNG/JPEG image sequences.
- **Local Decoder**:
  - Desktop execution leverages local FFmpeg CLI / native demux in Rust (`src-tauri`).
  - Fallback / browser preview can decode HTML5 video elements onto offscreen canvases for instant zero-latency scrub before heavy batch processing.
- **Sampling Controls**:
  - **Target FPS**: Preset selector for `10 FPS` (recommended for standard I2C), `15 FPS`, `20 FPS`, and `30 FPS` (high-speed SPI/I2C 400kHz).
  - **In/Out Trimmers**: Draggable start and end playhead needles to isolate exact loops.
  - **Max Frame Limit**: Configurable ceiling (e.g. 150 frames default) to protect ESP32 memory and serial bandwidth.

---

### 2. Spatial Framing & Aspect Fitting (128×64 Canvas)
Physical I2C OLEDs possess an exact **2:1 aspect ratio** ($128 \times 64$). Incoming video rarely matches this natively.
The converter provides three explicit fit modes:
1. **Cover (Center Crop)**: Fills the entire $128 \times 64$ frame without black bars, cropping excess edges. Includes an interactive $X/Y$ pan offset slider.
2. **Contain (Letterbox / Pillarbox)**: Scales the video to fit completely within $128 \times 64$, padding borders with selectable black (`0x00`) or white (`0xFF`) margins.
3. **Stretch**: Stretches video non-uniformly to exactly $128 \times 64$.
4. **Rotation / Flip**: $90^\circ$ rotation, horizontal flip, and vertical flip for displays mounted in portrait or inverted orientations.

---

### 3. Pre-Dither Image Processing
Monochrome displays have no native grays. Detail must be enhanced prior to dithering:
- **Luminance Calculation**:
  $$Y = 0.2126 \cdot R + 0.7152 \cdot G + 0.0722 \cdot B$$
- **Pre-Dither Adjustments**:
  - **Contrast (-100 to +100)**: Expands dynamic range to prevent muddy midtones.
  - **Brightness (-100 to +100)**: Shifts luminance baseline.
  - **Gamma (0.2 to 3.0)**: Corrects dark/light shadow curve.
  - **Black Point Clipping (0 to 100)**: Clamps dark grays directly to pure black to keep OLED backgrounds deep and noise-free.
  - **Edge Sharpening (Laplacian Boost)**: Enhances fine lines and character silhouettes before error diffusion, preventing facial features or text from dissolving on 128-pixel displays.

---

### 4. The Multi-Algorithm Dithering Engine
Each dithering algorithm produces a radically different visual aesthetic on OLED displays:

#### 1. Atkinson Dithering (The Influencer & Pixel Art Favorite)
- Developed by Bill Atkinson for the original 1984 Apple Macintosh.
- Error distribution pattern:
  $$\begin{pmatrix} & * & 1/8 & 1/8 \\ 1/8 & 1/8 & 1/8 & \\ & 1/8 & & \end{pmatrix}$$
- **Key Feature**: Distributes only $\frac{6}{8} = 75\%$ of the quantization error (discarding 25%). This creates deep blacks, crisp punchy whites, and avoids the "diffuse sand" look of standard algorithms. **Ideal for faces, anime, and high-contrast video**.

#### 2. Floyd-Steinberg Dithering (Classic Diffusion)
- Error distribution pattern:
  $$\begin{pmatrix} & * & 7/16 \\ 3/16 & 5/16 & 1/16 \end{pmatrix}$$
- **Key Feature**: Conserves 100% of error. Delivers the smoothest gradients for photorealistic video clips and nature footage.

#### 3. Bayer Ordered Dithering (Retro Game Boy Crosshatch)
- Applies a static spatial threshold matrix ($2\times 2$, $4\times 4$, or $8\times 8$):
  $$M_4 = \frac{1}{16} \begin{bmatrix} 0 & 8 & 2 & 10 \\ 12 & 4 & 14 & 6 \\ 3 & 11 & 1 & 9 \\ 15 & 7 & 13 & 5 \end{bmatrix}$$
- **Key Feature**: Unlike error diffusion, ordered dithering is position-independent. **It produces ZERO temporal grain swimming or inter-frame boiling on moving video**, delivering a razor-sharp retro Game Boy aesthetic.

#### 4. Burkes & Sierra Lite Dithering
- Simplified diffusion filters optimized for low-latency rendering on slower host machines.

#### 5. Adaptive Otsu Threshold (Pure High-Contrast Silhouette)
- Computes the bimodal variance threshold to convert frames into pure stark graphic silhouettes with no diffusion dots. Perfect for text, line art, and typography.

#### 6. Temporal Dithering Filter (Anti-Flicker)
- Optional temporal smoothing between consecutive frames $t$ and $t-1$ to prevent rapid pixel toggling on slow-response OLED phosphors.

---

### 5. Canonical Data Model & Frame Packing

In strict compliance with [Spec 003](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/003-canvas-editor.md) and [AGENTS.md](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/AGENTS.md):
- **Frame Buffer**: Every processed frame produces an identical, canonical `Uint8Array(1024)`:
  $$\text{Byte Index} = Y \times 16 + \lfloor X / 8 \rfloor, \quad \text{Bit Mask} = 0x80 \gg (X \pmod 8)$$
- **Animation Reel Data Model**:
```typescript
export interface VideoReel {
  id: string
  name: string
  sourceFilename: string
  sourceDurationSeconds: number
  targetFps: number
  frameCount: number
  width: 128
  height: 64
  ditherAlgorithm: 'atkinson' | 'floyd-steinberg' | 'bayer4' | 'bayer8' | 'burkes' | 'threshold'
  contrast: number
  brightness: number
  invert: boolean
  frames: Uint8Array[] // Array of 1024-byte canonical framebuffers
}
```

---

### 6. UI Studio Layout (`/video` Route)

The video workspace replaces `PlaceholderView.vue` at `/video` with a creative cockpit adhering to PixelForge design standards:

1. **Top Control Bar (48px)**:
   - "Import Video" file launcher (drag-and-drop support).
   - Video Metadata pill (Filename, Duration, Dimensions).
   - Target FPS selector (`10`, `15`, `20`, `30`).
   - Fit Mode toggle (`Cover` / `Contain` / `Stretch`).
   - Invert Colors toggle.
   - Live "Stream to OLED" toggle button.
   - "Export" menu dropdown.
2. **Main Workspace View (Split Comparison)**:
   - **Left / Split Pane**: Original video playback frame.
   - **Right / Primary Pane**: Real-time simulated 128×64 OLED display showing the exact dithered bitmap output with authentic phosphor glow and grid lines.
   - Interactive split slider to compare source vs dithered output on the fly.
3. **Right Controls Sidebar**:
   - Dithering algorithm selector with visual thumbnail cards.
   - Sliders: Contrast, Brightness, Gamma, Black Point, Edge Boost.
   - Temporal stability toggle.
4. **Bottom Scrubbable Timeline Player**:
   - Play / Pause button (`Spacebar`).
   - Loop toggle.
   - Frame step buttons (`←` / `→`).
   - Large scrub track with playhead and frame thumbnails.
   - In/Out range markers.
   - "Send Current Frame to Canvas" (hands current frame to `/draw` for manual touch-up).

---

### 7. Delivery & Export Formats

Makers and influencers need diverse outputs for their content:

1. **Live Serial Streaming**:
   - Streams the reel in real time to the connected ESP32 via Spec 002 `0x03 SEND_FRAME` packets, automatically throttling transmission to match the reel's target FPS.
2. **C/C++ PROGMEM Header File (`.h`)**:
   - Formatted for immediate paste into Arduino IDE / PlatformIO:
```cpp
// Generated by PixelForge Video Converter
#pragma once
#include <Arduino.h>

#define ANIMATION_FRAME_COUNT 45
#define ANIMATION_WIDTH 128
#define ANIMATION_HEIGHT 64
#define ANIMATION_FPS 15

const uint8_t PROGMEM animation_frames[45][1024] = {
  { 0x00, 0x1F, ... }, // Frame 0
  { 0x00, 0x3F, ... }, // Frame 1
  ...
};
```
3. **Raw Binary Reel (`.bin`)**:
   - Continuous stream of raw 1024-byte frames for direct writing to ESP32 LittleFS/SPIFFS or SD card storage.
4. **Animated Monochrome GIF (`.gif`)**:
   - Export an authentic 128×64 (or scaled 512×256) pixel-art animated GIF ready for sharing on social media (X/Twitter, Reddit, Discord).

---

## Acceptance Criteria

1. **Local-First Execution**: Works completely offline without remote network calls.
2. **Real-Time Dither Preview**: Moving the contrast slider or switching from Floyd-Steinberg to Atkinson updates the preview within 16ms without UI stutter.
3. **Zero Frame Desync**: Extracted frames correctly pack into the canonical 1024-byte model and render 100% pixel-perfect on both the web preview and physical hardware.
4. **Live Streaming Stability**: Streaming a 150-frame animation to an ESP32 at 15 FPS maintains smooth playback without dropping packets or exhausting ESP32 heap.
