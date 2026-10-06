/**
 * PixelForge — Export Strategy Interface
 * Spec 007 — Scalable Architecture & Exporter Strategy Pattern
 */

import type { DisplayProfile } from '../../core/display/DisplayProfile';

export interface ExportOptions {
  variableName: string;
  includeDrawFunction: boolean;
  fps: number;
  loop: boolean;
  reelName?: string;
  sourceFilename?: string;
  algorithmName?: string;
}

export interface ExportResult {
  filename: string;
  mimeType: string;
  data: string | Uint8Array;
}

export interface IExportStrategy {
  readonly id: string;
  readonly name: string;
  readonly fileExtension: string;
  readonly description: string;

  exportFrames(
    frames: Uint8Array[],
    profile: DisplayProfile,
    options: ExportOptions
  ): Promise<ExportResult> | ExportResult;
}
