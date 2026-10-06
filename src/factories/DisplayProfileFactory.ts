/**
 * PixelForge — DisplayProfileFactory
 * Spec 007 — Scalable Architecture & Factory Design Patterns
 */

import { DisplayProfile } from '../core/display/DisplayProfile';
import {
  HorizontalMsbPackingStrategy,
  Ssd1306PagePackingStrategy,
  Ssd1322Grayscale4PackingStrategy,
} from '../strategies/packing/PackingStrategy';

export class DisplayProfileFactory {
  private static profiles = new Map<string, DisplayProfile>();

  static {
    // Standard SSD1306 128x64 0.96" Monochrome (Default hardware)
    this.register(
      new DisplayProfile({
        id: 'ssd1306-128x64',
        name: '0.96" OLED (128x64 SSD1306)',
        width: 128,
        height: 64,
        pixelFormat: 'mono-1',
        controller: 'SSD1306',
        packingStrategy: new HorizontalMsbPackingStrategy(),
      })
    );

    // SSD1306 128x32 0.91" Monochrome Slim
    this.register(
      new DisplayProfile({
        id: 'ssd1306-128x32',
        name: '0.91" OLED (128x32 SSD1306)',
        width: 128,
        height: 32,
        pixelFormat: 'mono-1',
        controller: 'SSD1306',
        packingStrategy: new HorizontalMsbPackingStrategy(),
      })
    );

    // SH1106 128x64 1.3" Monochrome
    this.register(
      new DisplayProfile({
        id: 'sh1106-128x64',
        name: '1.3" OLED (128x64 SH1106)',
        width: 128,
        height: 64,
        pixelFormat: 'mono-1',
        controller: 'SH1106',
        packingStrategy: new HorizontalMsbPackingStrategy(),
      })
    );

    // SSD1306 Native Page Mode (Vertical Page format for direct hardware flashing)
    this.register(
      new DisplayProfile({
        id: 'ssd1306-128x64-page',
        name: '0.96" OLED Page Mode (SSD1306 Direct GDDRAM)',
        width: 128,
        height: 64,
        pixelFormat: 'mono-1',
        controller: 'SSD1306',
        packingStrategy: new Ssd1306PagePackingStrategy(),
      })
    );

    // SSD1322 256x64 4-bit Grayscale OLED
    this.register(
      new DisplayProfile({
        id: 'ssd1322-256x64',
        name: '3.12" OLED (256x64 SSD1322 4-bit Grayscale)',
        width: 256,
        height: 64,
        pixelFormat: 'gray-4',
        controller: 'SSD1322',
        packingStrategy: new Ssd1322Grayscale4PackingStrategy(),
      })
    );
  }

  static register(profile: DisplayProfile): void {
    this.profiles.set(profile.id, profile);
  }

  static getProfile(id: string): DisplayProfile {
    return this.profiles.get(id) || this.getDefaultProfile();
  }

  static getDefaultProfile(): DisplayProfile {
    return this.profiles.get('ssd1306-128x64')!;
  }

  static getAvailableProfiles(): Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    pixelFormat: string;
    controller: string;
    frameBytes: number;
  }> {
    return Array.from(this.profiles.values()).map(p => ({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      pixelFormat: p.pixelFormat,
      controller: p.controller,
      frameBytes: p.frameBytes,
    }));
  }
}
