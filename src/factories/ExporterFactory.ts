/**
 * PixelForge — ExporterFactory
 * Spec 007 — Scalable Architecture & Exporter Strategy Pattern
 */

import type { DisplayProfile } from '../core/display/DisplayProfile';
import type { IExportStrategy, ExportOptions, ExportResult } from '../strategies/export/ExportStrategy';
import { ArduinoSketchExporter } from '../strategies/export/ArduinoSketchExporter';
import { CppHeaderExporter } from '../strategies/export/CppHeaderExporter';
import { RawBinaryReelExporter } from '../strategies/export/RawBinaryReelExporter';
import { GifAnimationExporter } from '../strategies/export/GifAnimationExporter';
import { MicroPythonExporter } from '../strategies/export/MicroPythonExporter';

export class ExporterFactory {
  private static registry = new Map<string, IExportStrategy>([
    ['arduino-sketch', new ArduinoSketchExporter()],
    ['cpp-header', new CppHeaderExporter()],
    ['raw-binary', new RawBinaryReelExporter()],
    ['animated-gif', new GifAnimationExporter()],
    ['micropython', new MicroPythonExporter()],
  ]);

  static register(strategy: IExportStrategy): void {
    this.registry.set(strategy.id, strategy);
  }

  static getStrategy(id: string): IExportStrategy {
    return this.registry.get(id) || this.registry.get('arduino-sketch')!;
  }

  static getAvailableExporters(): Array<{
    id: string;
    name: string;
    fileExtension: string;
    description: string;
  }> {
    return Array.from(this.registry.values()).map(s => ({
      id: s.id,
      name: s.name,
      fileExtension: s.fileExtension,
      description: s.description,
    }));
  }

  static export(
    strategyId: string,
    frames: Uint8Array[],
    profile: DisplayProfile,
    options: ExportOptions
  ): Promise<ExportResult> | ExportResult {
    const strategy = this.getStrategy(strategyId);
    return strategy.exportFrames(frames, profile, options);
  }
}
