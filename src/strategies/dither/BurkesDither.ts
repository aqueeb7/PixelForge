/**
 * PixelForge — Burkes Dithering Strategy
 * Spec 007 — Scalable Architecture & Strategy Pattern
 *
 * Burkes 7-neighbor diffusion algorithm using /32 fractional distribution.
 */

import type { IDitherStrategy, DitherContext } from './DitherStrategy';

export class BurkesDither implements IDitherStrategy {
  readonly id = 'burkes';
  readonly name = 'Burkes (1988)';
  readonly description = '7-neighbor error diffusion balancing speed and gradient quality.';

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

        if (x + 1 < width) buffer[idx + 1] += (error * 8) / 32;
        if (x + 2 < width) buffer[idx + 2] += (error * 4) / 32;
        if (y + 1 < height) {
          if (x - 2 >= 0) buffer[(y + 1) * width + (x - 2)] += (error * 2) / 32;
          if (x - 1 >= 0) buffer[(y + 1) * width + (x - 1)] += (error * 4) / 32;
          buffer[(y + 1) * width + x] += (error * 8) / 32;
          if (x + 1 < width) buffer[(y + 1) * width + (x + 1)] += (error * 4) / 32;
          if (x + 2 < width) buffer[(y + 2) * width + (x + 2)] += (error * 2) / 32;
        }
      }
    }
    return output;
  }
}
