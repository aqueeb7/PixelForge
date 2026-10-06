/**
 * PixelForge — Arduino Sketch Exporter Strategy
 * Spec 007 — Scalable Architecture & Exporter Strategy Pattern
 *
 * Generates a complete, self-contained standalone Arduino sketch (.ino)
 * that compiles and runs immediately on an ESP32 connected to an OLED display.
 */

import type { DisplayProfile } from '../../core/display/DisplayProfile';
import type { IExportStrategy, ExportOptions, ExportResult } from './ExportStrategy';

export class ArduinoSketchExporter implements IExportStrategy {
  readonly id = 'arduino-sketch';
  readonly name = 'Arduino Standalone Sketch (.ino)';
  readonly fileExtension = '.ino';
  readonly description = 'Complete self-contained Arduino sketch ready to flash via Arduino IDE.';

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
    const bytesPerRow = Math.ceil(width / 8);
    const name = options.reelName || 'pixelforge_animation';

    let code = `// ============================================================================\n`;
    code += `// PixelForge Standalone ESP32 OLED Animation Player\n`;
    code += `// Project: ${name} (${options.sourceFilename || 'custom'})\n`;
    code += `// Display: ${profile.name} (${width}x${height} ${profile.controller})\n`;
    code += `// Total Frames: ${frameCount} | Target FPS: ${fps} | Loop: ${options.loop ? 'Infinite' : 'Once'}\n`;
    code += `// ============================================================================\n\n`;
    code += `#include <Arduino.h>\n`;
    code += `#include <Wire.h>\n`;
    code += `#include <U8g2lib.h>\n\n`;
    code += `// Standard ESP32 I2C Pinout\n`;
    code += `#define OLED_SDA 21\n`;
    code += `#define OLED_SCL 22\n`;
    code += `#define OLED_ADDR 0x3C\n\n`;
    code += `// Initialize U8g2 driver for 128x64 I2C OLED\n`;
    code += `U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, OLED_SCL, OLED_SDA);\n\n`;
    code += `#define ANIMATION_FRAME_COUNT ${frameCount}\n`;
    code += `#define ANIMATION_FPS ${fps}\n`;
    code += `#define FRAME_INTERVAL_MS (1000 / ANIMATION_FPS)\n\n`;
    code += `// Canonical 1-bit frames stored in Flash (PROGMEM)\n`;
    code += `const uint8_t PROGMEM animation_frames[${frameCount}][${frameSize}] = {\n`;

    for (let f = 0; f < frameCount; f++) {
      const frame = frames[f];
      code += `  { // Frame ${f}\n`;
      for (let row = 0; row < height; row++) {
        code += `    `;
        const rowOffset = row * bytesPerRow;
        for (let b = 0; b < bytesPerRow; b++) {
          const byteVal = frame[rowOffset + b] ?? 0;
          code += `0x${byteVal.toString(16).padStart(2, '0').toUpperCase()}, `;
        }
        code += `\n`;
      }
      code += f === frameCount - 1 ? `  }\n` : `  },\n`;
    }

    code += `};\n\n`;
    code += `void renderCanonicalBitmap(const uint8_t* pgmFrame) {\n`;
    code += `  u8g2.clearBuffer();\n`;
    code += `  for (uint16_t y = 0; y < ${height}; y++) {\n`;
    code += `    uint16_t rowOffset = y * ${bytesPerRow};\n`;
    code += `    for (uint16_t xByte = 0; xByte < ${bytesPerRow}; xByte++) {\n`;
    code += `      uint8_t b = pgm_read_byte(&pgmFrame[rowOffset + xByte]);\n`;
    code += `      if (b == 0) continue;\n`;
    code += `      uint16_t baseX = xByte * 8;\n`;
    code += `      for (uint8_t bit = 0; bit < 8; bit++) {\n`;
    code += `        if (b & (0x80 >> bit)) {\n`;
    code += `          u8g2.drawPixel(baseX + bit, y);\n`;
    code += `        }\n`;
    code += `      }\n`;
    code += `    }\n`;
    code += `  }\n`;
    code += `  u8g2.sendBuffer();\n`;
    code += `}\n\n`;
    code += `void setup() {\n`;
    code += `  Wire.begin(OLED_SDA, OLED_SCL);\n`;
    code += `  Wire.setClock(400000); // 400kHz fast I2C\n`;
    code += `  u8g2.setI2CAddress(OLED_ADDR << 1);\n`;
    code += `  u8g2.begin();\n`;
    code += `  u8g2.clearBuffer();\n`;
    code += `  u8g2.sendBuffer();\n`;
    code += `}\n\n`;
    code += `void loop() {\n`;
    code += `  for (int i = 0; i < ANIMATION_FRAME_COUNT; i++) {\n`;
    code += `    uint32_t start = millis();\n`;
    code += `    renderCanonicalBitmap(animation_frames[i]);\n`;
    code += `    uint32_t elapsed = millis() - start;\n`;
    code += `    if (elapsed < FRAME_INTERVAL_MS) {\n`;
    code += `      delay(FRAME_INTERVAL_MS - elapsed);\n`;
    code += `    }\n`;
    code += `  }\n`;
    if (!options.loop) {
      code += `  while (true) { delay(1000); } // Stop\n`;
    }
    code += `}\n`;

    return {
      filename: `${name}.ino`,
      mimeType: 'text/x-arduino',
      data: code,
    };
  }
}
