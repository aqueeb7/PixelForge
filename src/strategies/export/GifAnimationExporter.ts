/**
 * PixelForge — Animated GIF Exporter Strategy
 * Spec 007 — Scalable Architecture & Exporter Strategy Pattern
 *
 * Generates an animated monochrome GIF89a file with infinite Netscape 2.0 loop extension.
 */

import type { DisplayProfile } from '../../core/display/DisplayProfile';
import type { IExportStrategy, ExportOptions, ExportResult } from './ExportStrategy';

function lzwEncode(pixelIndices: Uint8Array): number[] {
  const minCodeSize = 2;
  const clearCode = 1 << minCodeSize; // 4
  const eoiCode = clearCode + 1; // 5

  let codeSize = minCodeSize + 1; // 3 bits
  let nextCode = clearCode + 2; // 6
  const maxCode = (1 << 12) - 1; // 4095

  const dict = new Map<number, number>();
  const outputBytes: number[] = [];
  let curAccum = 0;
  let curBits = 0;

  function writeBits(code: number, size: number) {
    curAccum |= (code << curBits);
    curBits += size;
    while (curBits >= 8) {
      outputBytes.push(curAccum & 0xFF);
      curAccum >>= 8;
      curBits -= 8;
    }
  }

  function resetDict() {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = clearCode + 2;
  }

  writeBits(clearCode, codeSize);
  resetDict();

  if (pixelIndices.length > 0) {
    let prefix = pixelIndices[0];
    for (let i = 1; i < pixelIndices.length; i++) {
      const k = pixelIndices[i];
      const key = (prefix << 8) | k;
      if (dict.has(key)) {
        prefix = dict.get(key)!;
      } else {
        writeBits(prefix, codeSize);
        if (nextCode <= maxCode) {
          dict.set(key, nextCode);
          if (nextCode === (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
          nextCode++;
        } else {
          writeBits(clearCode, codeSize);
          resetDict();
        }
        prefix = k;
      }
    }
    writeBits(prefix, codeSize);
  }

  writeBits(eoiCode, codeSize);
  if (curBits > 0) {
    outputBytes.push(curAccum & 0xFF);
  }

  const result: number[] = [minCodeSize];
  let offset = 0;
  while (offset < outputBytes.length) {
    const blockSize = Math.min(255, outputBytes.length - offset);
    result.push(blockSize);
    for (let j = 0; j < blockSize; j++) {
      result.push(outputBytes[offset + j]);
    }
    offset += blockSize;
  }
  result.push(0x00);
  return result;
}

export class GifAnimationExporter implements IExportStrategy {
  readonly id = 'animated-gif';
  readonly name = 'Animated GIF Preview (.gif)';
  readonly fileExtension = '.gif';
  readonly description = 'Monochrome GIF89a animation with infinite loop for web and social preview.';

  exportFrames(
    frames: Uint8Array[],
    profile: DisplayProfile,
    options: ExportOptions
  ): ExportResult {
    const width = profile.width;
    const height = profile.height;
    const bytesPerRow = Math.ceil(width / 8);
    const bytes: number[] = [];
    const fps = Math.max(1, options.fps || 15);
    const delayHundredths = Math.max(2, Math.round(100 / fps));

    // 1. Header: GIF89a
    bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

    // 2. Logical Screen Descriptor
    bytes.push(width & 0xFF, (width >> 8) & 0xFF);
    bytes.push(height & 0xFF, (height >> 8) & 0xFF);
    bytes.push(0xF0); // GCT flag = 1, color res = 7, 2 colors
    bytes.push(0x00); // Background color index = 0
    bytes.push(0x00); // Pixel aspect ratio

    // 3. Global Color Table (Black #000000, Phosphor White #FFFFFF)
    bytes.push(
      0x00, 0x00, 0x00,
      0xFF, 0xFF, 0xFF
    );

    // 4. Netscape 2.0 Loop Extension
    if (options.loop) {
      bytes.push(
        0x21, 0xFF, 0x0B,
        0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30,
        0x03, 0x01, 0x00, 0x00,
        0x00
      );
    }

    // 5. Encode each frame
    const totalPixels = width * height;
    const pixelBuffer = new Uint8Array(totalPixels);

    for (const frame of frames) {
      for (let row = 0; row < height; row++) {
        const rowOffset = row * bytesPerRow;
        const pixRowOffset = row * width;
        for (let col = 0; col < width; col++) {
          const byteVal = frame[rowOffset + (col >> 3)] ?? 0;
          pixelBuffer[pixRowOffset + col] = (byteVal & (0x80 >> (col & 7))) !== 0 ? 1 : 0;
        }
      }

      // Graphic Control Extension
      bytes.push(
        0x21, 0xF9, 0x04,
        0x04,
        delayHundredths & 0xFF,
        (delayHundredths >> 8) & 0xFF,
        0x00,
        0x00
      );

      // Image Descriptor
      bytes.push(
        0x2C,
        0x00, 0x00,
        0x00, 0x00,
        width & 0xFF, (width >> 8) & 0xFF,
        height & 0xFF, (height >> 8) & 0xFF,
        0x00
      );

      const lzwBlocks = lzwEncode(pixelBuffer);
      for (let i = 0; i < lzwBlocks.length; i++) {
        bytes.push(lzwBlocks[i]);
      }
    }

    // 6. Trailer: 0x3B
    bytes.push(0x3B);

    const name = options.reelName || options.variableName || 'pixelforge_animation';

    return {
      filename: `${name}.gif`,
      mimeType: 'image/gif',
      data: new Uint8Array(bytes),
    };
  }
}
