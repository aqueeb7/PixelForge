/**
 * PixelForge — Floyd-Steinberg Dithering Strategy
 * Spec 007 — Scalable Architecture & Strategy Pattern
 *
 * Classic 100% error diffusion: 7/16, 3/16, 5/16, 1/16 distribution.
 */

import type { IDitherStrategy, DitherContext } from './DitherStrategy';

export class FloydSteinbergDither implements IDitherStrategy {
  readonly id = 'floyd-steinberg';
  readonly name = 'Floyd-Steinberg (1976)';
  readonly description = 'Standard 100% error diffusion preserving smooth tonal gradients.';

  process(pixels: Float32Array, ctx: DitherContext): Uint8Array {
    const { width, height } = ctx;
    const output = new Uint8Array(width * height);
    const buffer = new Float32Array(pixels);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldVal = buffer[idx];
        const newVal = oldVal >= 128 ? 255 : 0;
        output[idx] = newVal === 255 ? 1 : 0;
        const error = oldVal - newVal;

        if (x + 1 < width) buffer[idx + 1] += (error * 7) / 16;
        if (y + 1 < height) {
          if (x - 1 >= 0) buffer[(y + 1) * width + (x - 1)] += (error * 3) / 16;
          buffer[(y + 1) * width + x] += (error * 5) / 16;
          if (x + 1 < width) buffer[(y + 1) * width + (x + 1)] += (error * 1) / 16;
        }
      }
    }
    return output;
  }
}
