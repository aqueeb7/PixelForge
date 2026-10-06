/**
 * PixelForge — Dithering Strategy Interface
 * Spec 007 — Scalable Architecture & Strategy Pattern
 */

export interface DitherContext {
  width: number;
  height: number;
  contrast?: number;     // -100 to 100
  brightness?: number;   // -100 to 100
  gamma?: number;        // 0.2 to 3.0
  blackPoint?: number;   // 0 to 100
  invert?: boolean;
}

export interface IDitherStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /**
   * Applies the dithering algorithm to a normalized grayscale buffer (0.0 to 255.0).
   * Returns a 1-byte-per-pixel Uint8Array where 1 = White / On, 0 = Black / Off.
   */
  process(grayscale: Float32Array, ctx: DitherContext): Uint8Array;
}
