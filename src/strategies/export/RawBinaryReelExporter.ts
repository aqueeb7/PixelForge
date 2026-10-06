/**
 * PixelForge — Raw Binary Reel Exporter Strategy
 * Spec 007 — Scalable Architecture & Exporter Strategy Pattern
 *
 * Concatenates all packed frames into a contiguous binary payload (.bin)
 * suitable for direct flash partitioning, LittleFS storage, or SD-card playback.
 */

import type { DisplayProfile } from '../../core/display/DisplayProfile';
import type { IExportStrategy, ExportOptions, ExportResult } from './ExportStrategy';

export class RawBinaryReelExporter implements IExportStrategy {
  readonly id = 'raw-binary';
  readonly name = 'Raw Binary Reel (.bin)';
  readonly fileExtension = '.bin';
  readonly description = 'Flat contiguous binary stream of packed frames for flash/SD-card storage.';

  exportFrames(
    frames: Uint8Array[],
    profile: DisplayProfile,
    options: ExportOptions
  ): ExportResult {
    const frameSize = profile.frameBytes;
    const totalBytes = frames.length * frameSize;
    const bin = new Uint8Array(totalBytes);

    for (let i = 0; i < frames.length; i++) {
      bin.set(frames[i], i * frameSize);
    }

    const name = options.reelName || options.variableName || 'pixelforge_reel';

    return {
      filename: `${name}.bin`,
      mimeType: 'application/octet-stream',
      data: bin,
    };
  }
}
