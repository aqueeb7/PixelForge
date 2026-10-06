/**
 * PixelForge — DisplayProfile Domain Model
 * Spec 007 — Scalable Architecture & Enterprise Scalability
 */

import type { IPackingStrategy } from '../../strategies/packing/PackingStrategy';

export type PixelFormat = 'mono-1' | 'gray-4' | 'rgb565';
export type ControllerFamily = 'SSD1306' | 'SH1106' | 'SSD1309' | 'SSD1322' | 'ST7789';

export interface DisplayProfileConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  pixelFormat: PixelFormat;
  controller: ControllerFamily;
  packingStrategy: IPackingStrategy;
}

export class DisplayProfile {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: PixelFormat;
  readonly controller: ControllerFamily;
  readonly frameBytes: number;
  private readonly packingStrategy: IPackingStrategy;

  constructor(config: DisplayProfileConfig) {
    this.id = config.id;
    this.name = config.name;
    this.width = config.width;
    this.height = config.height;
    this.pixelFormat = config.pixelFormat;
    this.controller = config.controller;
    this.packingStrategy = config.packingStrategy;

    switch (config.pixelFormat) {
      case 'mono-1':
        this.frameBytes = Math.ceil((config.width * config.height) / 8);
        break;
      case 'gray-4':
        this.frameBytes = Math.ceil((config.width * config.height) / 2);
        break;
      case 'rgb565':
        this.frameBytes = config.width * config.height * 2;
        break;
      default:
        this.frameBytes = Math.ceil((config.width * config.height) / 8);
    }
  }

  get strategyId(): string {
    return this.packingStrategy.id;
  }

  get strategyName(): string {
    return this.packingStrategy.name;
  }

  pack(canonicalPixels: Uint8Array): Uint8Array {
    return this.packingStrategy.pack(canonicalPixels, this.width, this.height);
  }

  unpack(packedBytes: Uint8Array): Uint8Array {
    return this.packingStrategy.unpack(packedBytes, this.width, this.height);
  }
}
