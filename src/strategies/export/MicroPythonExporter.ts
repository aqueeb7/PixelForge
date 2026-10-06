/**
 * PixelForge — MicroPython Exporter Strategy
 * Spec 007 — Scalable Architecture & Exporter Strategy Pattern
 *
 * Generates an executable MicroPython script using framebuf.MONO_HLSB bytearrays
 * for immediate playback on ESP32 boards running MicroPython.
 */

import type { DisplayProfile } from '../../core/display/DisplayProfile';
import type { IExportStrategy, ExportOptions, ExportResult } from './ExportStrategy';

export class MicroPythonExporter implements IExportStrategy {
  readonly id = 'micropython';
  readonly name = 'MicroPython Script (.py)';
  readonly fileExtension = '.py';
  readonly description = 'MicroPython animation script utilizing framebuf.bytearray on ESP32.';

  exportFrames(
    frames: Uint8Array[],
    profile: DisplayProfile,
    options: ExportOptions
  ): ExportResult {
    const frameCount = frames.length;
    const fps = Math.max(1, options.fps || 15);
    const width = profile.width;
    const height = profile.height;
    const frameSize = profile.frameBytes;
    const name = options.reelName || options.variableName || 'pixelforge_reel';
    const delayMs = Math.round(1000 / fps);

    let code = `"""\n`;
    code += `PixelForge MicroPython Animation Player\n`;
    code += `Target Display: ${profile.name} (${width}x${height})\n`;
    code += `Frames: ${frameCount} | Target FPS: ${fps}\n`;
    code += `"""\n\n`;
    code += `import time\n`;
    code += `import framebuf\n`;
    code += `from machine import Pin, I2C\n`;
    code += `import ssd1306\n\n`;
    code += `# Initialize I2C and Display\n`;
    code += `i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400000)\n`;
    code += `oled = ssd1306.SSD1306_I2C(${width}, ${height}, i2c)\n\n`;
    code += `FRAME_COUNT = ${frameCount}\n`;
    code += `DELAY_MS = ${delayMs}\n\n`;
    code += `# Canonical packed frame data (${frameSize} bytes / frame)\n`;
    code += `ANIMATION_DATA = [\n`;

    for (let f = 0; f < frameCount; f++) {
      const frame = frames[f];
      let hexStr = '';
      for (let i = 0; i < frameSize; i++) {
        hexStr += `\\x${(frame[i] ?? 0).toString(16).padStart(2, '0')}`;
      }
      code += `    bytearray(b"${hexStr}"),\n`;
    }

    code += `]\n\n`;
    code += `def play():\n`;
    code += `    while True:\n`;
    code += `        for raw_bytes in ANIMATION_DATA:\n`;
    code += `            fb = framebuf.FrameBuffer(raw_bytes, ${width}, ${height}, framebuf.MONO_HLSB)\n`;
    code += `            oled.blit(fb, 0, 0)\n`;
    code += `            oled.show()\n`;
    code += `            time.sleep_ms(DELAY_MS)\n`;
    if (!options.loop) {
      code += `        break\n`;
    }
    code += `\n`;
    code += `if __name__ == '__main__':\n`;
    code += `    play()\n`;

    return {
      filename: `${name}.py`,
      mimeType: 'text/x-python',
      data: code,
    };
  }
}
