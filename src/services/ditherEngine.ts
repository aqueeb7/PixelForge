/**
 * Spec 006 — Multi-Algorithm Dithering & Canonical Bit-Packing Engine
 * High-performance, zero-allocation algorithms operating on 128x64 image buffers.
 */

import type { DitherAlgorithm, VideoProcessingSettings } from '../types/video'

export const CANVAS_WIDTH = 128
export const CANVAS_HEIGHT = 64
export const CANONICAL_BYTE_LENGTH = 1024 // 128 * 64 / 8

// 4x4 Bayer Matrix
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

// 8x8 Bayer Matrix
const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

/**
 * Pre-processes an RGBA ImageData (128x64) into normalized, contrast-adjusted grayscale Float32Array.
 * Applies BT.709 luminance, brightness, contrast, gamma LUT, black point clamp, and edge boost.
 */
export function preprocessGrayscale(
  imageData: ImageData,
  settings: VideoProcessingSettings
): Float32Array {
  const { data, width, height } = imageData
  const count = width * height
  const gray = new Float32Array(count)

  // Precompute gamma LUT for values 0..255
  const gamma = Math.max(0.1, settings.gamma || 1.0)
  const gammaLUT = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    gammaLUT[i] = Math.pow(i / 255.0, 1.0 / gamma) * 255.0
  }

  // Precompute contrast factor: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  const c = Math.max(-100, Math.min(100, settings.contrast || 0))
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c))
  const brightness = settings.brightness || 0
  const blackPoint = Math.max(0, Math.min(100, settings.blackPoint || 0)) * 2.55 // map to 0..255

  // 1. Initial luminance and tone curves
  for (let i = 0; i < count; i++) {
    const idx = i * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]

    // BT.709 Luminance
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    // Brightness offset
    lum += brightness * 2.55

    // Contrast adjustment centered at 128
    lum = contrastFactor * (lum - 128) + 128

    // Gamma curve
    const clampedIndex = Math.max(0, Math.min(255, Math.round(lum)))
    lum = gammaLUT[clampedIndex]

    // Black point clipping: clamp dark pixels strictly to 0
    if (lum < blackPoint) {
      lum = 0
    }

    gray[i] = Math.max(0, Math.min(255, lum))
  }

  // 2. Optional Laplacian Edge Enhancement
  if (settings.edgeBoost && settings.edgeBoost > 0) {
    const boost = (settings.edgeBoost / 100) * 1.5
    const enhanced = new Float32Array(count)
    // 3x3 Laplacian kernel:
    // [ 0, -1,  0 ]
    // [-1,  4, -1 ]
    // [ 0, -1,  0 ]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          enhanced[i] = gray[i]
          continue
        }
        const center = gray[i]
        const top = gray[(y - 1) * width + x]
        const bottom = gray[(y + 1) * width + x]
        const left = gray[y * width + (x - 1)]
        const right = gray[y * width + (x + 1)]
        const laplacian = 4 * center - (top + bottom + left + right)
        enhanced[i] = Math.max(0, Math.min(255, center + laplacian * boost))
      }
    }
    return enhanced
  }

  return gray
}

/**
 * Computes the optimal bimodal threshold using Otsu's method.
 */
export function computeOtsuThreshold(gray: Float32Array): number {
  const histogram = new Int32Array(256)
  const total = gray.length
  for (let i = 0; i < total; i++) {
    const val = Math.max(0, Math.min(255, Math.round(gray[i])))
    histogram[val]++
  }

  let sum = 0
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i]
  }

  let sumB = 0
  let wB = 0
  let wF = 0
  let maxVariance = 0
  let threshold = 128

  for (let t = 0; t < 256; t++) {
    wB += histogram[t]
    if (wB === 0) continue
    wF = total - wB
    if (wF === 0) break

    sumB += t * histogram[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF

    // Between-class variance
    const variance = wB * wF * (mB - mF) * (mB - mF)
    if (variance > maxVariance) {
      maxVariance = variance
      threshold = t
    }
  }

  return threshold
}

/**
 * Applies the selected dithering algorithm to the grayscale buffer
 * and returns a binary Uint8Array(128x64) with values 0 (black) or 1 (white).
 */
export function dither(
  gray: Float32Array,
  algorithm: DitherAlgorithm,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Uint8Array {
  const binary = new Uint8Array(width * height)
  // Create a mutable copy of grayscale values for error diffusion
  const buffer = new Float32Array(gray)

  switch (algorithm) {
    case 'atkinson': {
      // Bill Atkinson 1984 algorithm: distributes 6/8 (75%) of error, leaves 25% for high-contrast punch
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          const oldVal = buffer[idx]
          const newVal = oldVal >= 128 ? 255 : 0
          binary[idx] = newVal === 255 ? 1 : 0
          const error = (oldVal - newVal) / 8

          if (x + 1 < width) buffer[idx + 1] += error
          if (x + 2 < width) buffer[idx + 2] += error
          if (y + 1 < height) {
            if (x - 1 >= 0) buffer[(y + 1) * width + (x - 1)] += error
            buffer[(y + 1) * width + x] += error
            if (x + 1 < width) buffer[(y + 1) * width + (x + 1)] += error
          }
          if (y + 2 < height) {
            buffer[(y + 2) * width + x] += error
          }
        }
      }
      break
    }

    case 'floyd-steinberg': {
      // Classic 100% error diffusion: 7/16, 3/16, 5/16, 1/16
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          const oldVal = buffer[idx]
          const newVal = oldVal >= 128 ? 255 : 0
          binary[idx] = newVal === 255 ? 1 : 0
          const error = oldVal - newVal

          if (x + 1 < width) buffer[idx + 1] += (error * 7) / 16
          if (y + 1 < height) {
            if (x - 1 >= 0) buffer[(y + 1) * width + (x - 1)] += (error * 3) / 16
            buffer[(y + 1) * width + x] += (error * 5) / 16
            if (x + 1 < width) buffer[(y + 1) * width + (x + 1)] += (error * 1) / 16
          }
        }
      }
      break
    }

    case 'bayer4': {
      // 4x4 Ordered Bayer Matrix (position-independent, zero temporal pixel swimming)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          const threshold = ((BAYER_4X4[y % 4][x % 4] + 0.5) / 16) * 255
          binary[idx] = buffer[idx] >= threshold ? 1 : 0
        }
      }
      break
    }

    case 'bayer8': {
      // 8x8 Ordered Bayer Matrix
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          const threshold = ((BAYER_8X8[y % 8][x % 8] + 0.5) / 64) * 255
          binary[idx] = buffer[idx] >= threshold ? 1 : 0
        }
      }
      break
    }

    case 'burkes': {
      // Burkes 7-neighbor diffusion (error / 32)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          const oldVal = buffer[idx]
          const newVal = oldVal >= 128 ? 255 : 0
          binary[idx] = newVal === 255 ? 1 : 0
          const error = oldVal - newVal

          if (x + 1 < width) buffer[idx + 1] += (error * 8) / 32
          if (x + 2 < width) buffer[idx + 2] += (error * 4) / 32
          if (y + 1 < height) {
            if (x - 2 >= 0) buffer[(y + 1) * width + (x - 2)] += (error * 2) / 32
            if (x - 1 >= 0) buffer[(y + 1) * width + (x - 1)] += (error * 4) / 32
            buffer[(y + 1) * width + x] += (error * 8) / 32
            if (x + 1 < width) buffer[(y + 1) * width + (x + 1)] += (error * 4) / 32
            if (x + 2 < width) buffer[(y + 1) * width + (x + 2)] += (error * 2) / 32
          }
        }
      }
      break
    }

    case 'threshold': {
      // Adaptive Otsu Threshold (pure stark silhouette)
      const otsuThresh = computeOtsuThreshold(buffer)
      for (let i = 0; i < width * height; i++) {
        binary[i] = buffer[i] >= otsuThresh ? 1 : 0
      }
      break
    }
  }

  return binary
}

/**
 * Packs 128x64 binary pixels (0 or 1) into the canonical 1024-byte format
 * specified in Spec 003 & Spec 006:
 * Byte Index = Y * 16 + (X >> 3), Bit Mask = 0x80 >> (X & 7).
 */
export function packCanonicalBitmap(
  binary: Uint8Array,
  invert = false,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Uint8Array {
  const packed = new Uint8Array(CANONICAL_BYTE_LENGTH)

  for (let y = 0; y < height; y++) {
    const rowOffset = y * 16
    const binRowOffset = y * width
    for (let x = 0; x < width; x++) {
      let val = binary[binRowOffset + x]
      if (invert) {
        val = val === 1 ? 0 : 1
      }
      if (val === 1) {
        const byteIndex = rowOffset + (x >> 3)
        const bitMask = 0x80 >> (x & 7)
        packed[byteIndex] |= bitMask
      }
    }
  }

  return packed
}

/**
 * Unpacks a canonical 1024-byte framebuffer into an RGBA ImageData (128x64)
 * with authentic OLED phosphor white (#FFFFFF) or cyan (#38BDF8) on deep black (#050508).
 */
export function unpackCanonicalBitmap(
  packed: Uint8Array,
  targetImageData?: ImageData,
  color: [number, number, number] = [255, 255, 255],
  bgColor: [number, number, number] = [5, 5, 8],
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): ImageData {
  const imgData = targetImageData || new ImageData(width, height)
  const data = imgData.data

  for (let y = 0; y < height; y++) {
    const rowOffset = y * 16
    const outRowOffset = y * width * 4
    for (let x = 0; x < width; x++) {
      const byteIndex = rowOffset + (x >> 3)
      const bitMask = 0x80 >> (x & 7)
      const isPixelOn = (packed[byteIndex] & bitMask) !== 0

      const pIdx = outRowOffset + x * 4
      if (isPixelOn) {
        data[pIdx] = color[0]
        data[pIdx + 1] = color[1]
        data[pIdx + 2] = color[2]
        data[pIdx + 3] = 255
      } else {
        data[pIdx] = bgColor[0]
        data[pIdx + 1] = bgColor[1]
        data[pIdx + 2] = bgColor[2]
        data[pIdx + 3] = 255
      }
    }
  }

  return imgData
}

/**
 * Full end-to-end processing pipeline for a single 128x64 RGBA ImageData frame.
 */
export function processFrame(
  imageData: ImageData,
  settings: VideoProcessingSettings
): { packed: Uint8Array; binary: Uint8Array } {
  const gray = preprocessGrayscale(imageData, settings)
  const binary = dither(gray, settings.ditherAlgorithm)
  const packed = packCanonicalBitmap(binary, settings.invert)
  return { packed, binary }
}
