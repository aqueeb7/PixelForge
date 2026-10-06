/**
 * PixelForge — Otsu Adaptive Threshold Strategy
 * Spec 007 — Scalable Architecture & Strategy Pattern
 *
 * Maximizes between-class variance to calculate optimal bimodal threshold.
 */

import type { IDitherStrategy, DitherContext } from './DitherStrategy';

export function computeOtsuThreshold(gray: Float32Array): number {
  const histogram = new Int32Array(256);
  const total = gray.length;
  for (let i = 0; i < total; i++) {
    const val = Math.max(0, Math.min(255, Math.round(gray[i])));
    histogram[val]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

export class OtsuThresholdDither implements IDitherStrategy {
  readonly id = 'threshold';
  readonly name = 'Adaptive Threshold (Otsu)';
  readonly description = 'Pure stark bimodal threshold without error diffusion.';

  process(pixels: Float32Array, ctx: DitherContext): Uint8Array {
    const { width, height } = ctx;
    const output = new Uint8Array(width * height);
    const threshold = computeOtsuThreshold(pixels);

    for (let i = 0; i < width * height; i++) {
      output[i] = pixels[i] >= threshold ? 1 : 0;
    }
    return output;
  }
}
