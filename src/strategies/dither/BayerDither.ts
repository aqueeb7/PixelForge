/**
 * PixelForge — Bayer Ordered Dithering Strategies
 * Spec 007 — Scalable Architecture & Strategy Pattern
 *
 * Position-independent matrix dithering with zero temporal swimming.
 */

import type { IDitherStrategy, DitherContext } from './DitherStrategy';

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export class Bayer4Dither implements IDitherStrategy {
  readonly id = 'bayer4';
  readonly name = 'Bayer 4×4 (Ordered)';
  readonly description = 'Fast ordered matrix with zero temporal pixel swimming.';

  process(pixels: Float32Array, ctx: DitherContext): Uint8Array {
    const { width, height } = ctx;
    const output = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const threshold = ((BAYER_4X4[y % 4][x % 4] + 0.5) / 16) * 255;
        output[idx] = pixels[idx] >= threshold ? 1 : 0;
      }
    }
    return output;
  }
}

export class Bayer8Dither implements IDitherStrategy {
  readonly id = 'bayer8';
  readonly name = 'Bayer 8×8 (Ordered)';
  readonly description = 'Fine-grained ordered matrix for subtle textures.';

  process(pixels: Float32Array, ctx: DitherContext): Uint8Array {
    const { width, height } = ctx;
    const output = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const threshold = ((BAYER_8X8[y % 8][x % 8] + 0.5) / 64) * 255;
        output[idx] = pixels[idx] >= threshold ? 1 : 0;
      }
    }
    return output;
  }
}
