/**
 * PixelForge — DitherEngineFactory
 * Spec 007 — Scalable Architecture & Factory Design Patterns
 */

import type { IDitherStrategy } from '../strategies/dither/DitherStrategy';
import { AtkinsonDither } from '../strategies/dither/AtkinsonDither';
import { FloydSteinbergDither } from '../strategies/dither/FloydSteinbergDither';
import { Bayer4Dither, Bayer8Dither } from '../strategies/dither/BayerDither';
import { BurkesDither } from '../strategies/dither/BurkesDither';
import { OtsuThresholdDither } from '../strategies/dither/OtsuThresholdDither';

export class DitherEngineFactory {
  private static registry = new Map<string, IDitherStrategy>([
    ['atkinson', new AtkinsonDither()],
    ['floyd-steinberg', new FloydSteinbergDither()],
    ['bayer4', new Bayer4Dither()],
    ['bayer8', new Bayer8Dither()],
    ['burkes', new BurkesDither()],
    ['threshold', new OtsuThresholdDither()],
  ]);

  static register(strategy: IDitherStrategy): void {
    this.registry.set(strategy.id, strategy);
  }

  static getStrategy(id: string): IDitherStrategy {
    return this.registry.get(id) || this.registry.get('atkinson')!;
  }

  static getAvailableAlgorithms(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.registry.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));
  }
}
