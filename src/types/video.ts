/**
 * Spec 006 — Video to 128×64 OLED Converter & Multi-Algorithm Dithering Engine
 * Domain Types
 */

export type DitherAlgorithm =
  | 'atkinson'
  | 'floyd-steinberg'
  | 'bayer4'
  | 'bayer8'
  | 'burkes'
  | 'threshold'

export type FitMode = 'cover' | 'contain' | 'stretch'

export interface VideoProcessingSettings {
  targetFps: number
  ditherAlgorithm: DitherAlgorithm
  fitMode: FitMode
  contrast: number // -100 to 100 (default 0)
  brightness: number // -100 to 100 (default 0)
  gamma: number // 0.2 to 3.0 (default 1.0)
  blackPoint: number // 0 to 100 (default 10)
  edgeBoost: number // 0 to 100 (default 0)
  invert: boolean
  panX: number // -50 to 50 percent
  panY: number // -50 to 50 percent
  rotation: 0 | 90 | 180 | 270
  temporalSmoothing: boolean
  trimStart: number // in seconds
  trimEnd: number // in seconds
  maxFrames: number // default 150
}

export interface VideoSourceMeta {
  filename: string
  filesize: number
  duration: number // seconds
  videoWidth: number
  videoHeight: number
  aspectRatio: number
}

export interface ExtractedFrame {
  index: number
  timestamp: number // seconds in video
  sourceCanvas?: HTMLCanvasElement // 128x64 intermediate canvas
  sourceImageData?: ImageData // 128x64 pre-dithered source frame
  packedFrame: Uint8Array // 1024 bytes canonical 1-bit bitmap
}

export interface VideoReel {
  id: string
  name: string
  sourceFilename: string
  sourceDurationSeconds: number
  targetFps: number
  frameCount: number
  width: 128
  height: 64
  settings: VideoProcessingSettings
  frames: Uint8Array[] // 1024-byte canonical frames
}

export interface AlgorithmInfo {
  id: DitherAlgorithm
  name: string
  tagline: string
  badge: string
  description: string
  bestFor: string
}
