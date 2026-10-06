/**
 * PixelForge — Atkinson Dithering Strategy
 * Spec 007 — Scalable Architecture & Strategy Pattern
 *
 * Bill Atkinson 1984 algorithm: distributes 6/8ths (75%) of quantization error,
 * intentionally discarding 25% of error to produce high-contrast, clean 1-bit highlights.
 */

import type { IDitherStrategy, DitherContext } from './DitherStrategy';

export class AtkinsonDither implements IDitherStrategy {
  readonly id = 'atkinson';
  readonly name = 'Atkinson (Macintosh 1984)';
  readonly description = 'High-contrast 1/8th error diffusion preserving crisp highlights.';

  process(pixels: Float32Array, ctx: DitherContext): Uint8Array {
    const { width, height } = ctx;
    const output = new Uint8Array(width * height);
    const buffer = new Float32Array(pixels); // Mutable working buffer

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldVal = buffer[idx];
        const newVal = oldVal >= 128 ? 255 : 0;
        output[idx] = newVal === 255 ? 1 : 0;

        // Correct: True floating-point error divided by 8
        const err = (oldVal - newVal) / 8;

        // Atkinson 1/8 distribution:
        //       [P]   1/8   1/8
        // 1/8   1/8   1/8
        //       1/8
        if (x + 1 < width) buffer[idx + 1] += err;
        if (x + 2 < width) buffer[idx + 2] += err;
        if (y + 1 < height) {
          if (x - 1 >= 0) buffer[(y + 1) * width + (x - 1)] += err;
          buffer[(y + 1) * width + x] += err;
          if (x + 1 < width) buffer[(y + 1) * width + (x + 1)] += err;
        }
        if (y + 2 < height) {
          buffer[(y + 2) * width + x] += err;
        }
      }
    }
    return output;
  }
}
