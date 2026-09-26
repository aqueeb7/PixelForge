---
description: Video to 128×64 OLED Conversion & Dithering Workflow
---

# Video to 128×64 OLED Conversion Workflow

Follow this procedure when implementing or processing video-to-OLED animations:

1. **Reference Specification**:
   - Consult [Spec 006 — Video to 128×64 OLED Converter](file:///c:/Users/DELL/OneDrive/Desktop/PixelForge/.agents/specs/006-video-converter.md).

2. **Ingestion & Duration Trimming**:
   - Load local video (MP4, GIF, WebM, MOV).
   - Set in/out trim points to keep frame count within memory bounds (typically 30–150 frames).
   - Set target framerate (10 FPS for reliable I2C, 15–30 FPS for high-speed SPI).

3. **Spatial Framing (128×64 2:1)**:
   - Select fit mode:
     - `Cover`: Full 128×64 frame with pan offset.
     - `Contain`: Letterboxed with clean black borders.
     - `Stretch`: Force 128×64 fill.

4. **Luminance & Contrast Pre-Processing**:
   - Compute BT.709 grayscale ($Y = 0.2126R + 0.7152G + 0.0722B$).
   - Adjust contrast, brightness, and gamma to avoid muddy midtones.
   - Apply black-point clipping to keep OLED backgrounds clean.
   - Apply edge boost for small display clarity.

5. **Dithering Selection**:
   - **Atkinson**: High-contrast punchy highlights, Mac 1984 aesthetic (best for faces, anime, pixel art).
   - **Floyd-Steinberg**: Smooth photorealistic gradients.
   - **Bayer Ordered**: Retro 4×4/8×8 crosshatch with zero temporal pixel swimming.
   - **Otsu Threshold**: Stark black/white silhouette for logos and bold text.

6. **Canonical Bit-Packing**:
   - Pack 128×64 pixels into 1,024 bytes MSB-first per frame matching Spec 003.

7. **Timeline Verification**:
   - Scrub through playback in the UI.
   - Verify loop continuity and frame transitions.

8. **Target Export / Delivery**:
   - **Live Stream**: Stream via Spec 002 serial protocol (`0x03 SEND_FRAME`).
   - **Firmware Code**: Export C/C++ PROGMEM array for Arduino/PlatformIO.
   - **Binary Reel**: Export `.bin` for SPIFFS/LittleFS autonomous playback.
