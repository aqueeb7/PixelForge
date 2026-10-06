/**
 * PixelForge — Packing Strategy Abstraction
 * Spec 007 — Scalable Architecture & Factory Design Patterns
 */

export interface IPackingStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /**
   * Packs canonical 1-byte-per-pixel buffer (values 0 or 1 for mono, 0-15 for gray-4)
   * into controller-specific memory format.
   */
  pack(canonicalPixels: Uint8Array, width: number, height: number): Uint8Array;

  /**
   * Unpacks controller-specific packed bytes into canonical 1-byte-per-pixel buffer.
   */
  unpack(packedBytes: Uint8Array, width: number, height: number): Uint8Array;
}

/**
 * Standard SSD1306 / SH1106 Page Addressing Mode:
 * Screen is divided into (height / 8) pages.
 * Each page is 8 pixels tall and spans all columns.
 * Bit 0 is topmost pixel of the byte, Bit 7 is bottommost.
 */
export class Ssd1306PagePackingStrategy implements IPackingStrategy {
  readonly id = 'ssd1306-page';
  readonly name = 'SSD1306 Page Addressing Mode';
  readonly description = 'Vertical 8-pixel page addressing for SSD1306/SH1106 OLEDs.';

  pack(canonicalPixels: Uint8Array, width: number, height: number): Uint8Array {
    const pages = Math.ceil(height / 8);
    const packed = new Uint8Array(width * pages);

    for (let page = 0; page < pages; page++) {
      const pageBaseY = page * 8;
      const pageOffset = page * width;

      for (let x = 0; x < width; x++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const y = pageBaseY + bit;
          if (y < height) {
            const pixel = canonicalPixels[y * width + x];
            if (pixel > 0) {
              byteVal |= (1 << bit);
            }
          }
        }
        packed[pageOffset + x] = byteVal;
      }
    }

    return packed;
  }

  unpack(packedBytes: Uint8Array, width: number, height: number): Uint8Array {
    const pages = Math.ceil(height / 8);
    const unpacked = new Uint8Array(width * height);

    for (let page = 0; page < pages; page++) {
      const pageBaseY = page * 8;
      const pageOffset = page * width;

      for (let x = 0; x < width; x++) {
        const byteVal = packedBytes[pageOffset + x] || 0;
        for (let bit = 0; bit < 8; bit++) {
          const y = pageBaseY + bit;
          if (y < height) {
            unpacked[y * width + x] = (byteVal & (1 << bit)) !== 0 ? 1 : 0;
          }
        }
      }
    }

    return unpacked;
  }
}

/**
 * Horizontal Scanline Bit-Packed (MSB First):
 * Canonical 1024-byte format used by PixelForge desktop pipeline:
 * Byte Index = Y * (width / 8) + (X >> 3), Bit Mask = 0x80 >> (X & 7).
 */
export class HorizontalMsbPackingStrategy implements IPackingStrategy {
  readonly id = 'horizontal-msb';
  readonly name = 'Horizontal Scanline Bit-Packed (MSB)';
  readonly description = '1-bit per pixel packed horizontally MSB first across raster rows.';

  pack(canonicalPixels: Uint8Array, width: number, height: number): Uint8Array {
    const bytesPerRow = Math.ceil(width / 8);
    const packed = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * bytesPerRow;
      const pixelRowOffset = y * width;

      for (let x = 0; x < width; x++) {
        const pixel = canonicalPixels[pixelRowOffset + x];
        if (pixel > 0) {
          const byteIdx = rowOffset + (x >> 3);
          const bitMask = 0x80 >> (x & 7);
          packed[byteIdx] |= bitMask;
        }
      }
    }

    return packed;
  }

  unpack(packedBytes: Uint8Array, width: number, height: number): Uint8Array {
    const bytesPerRow = Math.ceil(width / 8);
    const unpacked = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * bytesPerRow;
      const pixelRowOffset = y * width;

      for (let x = 0; x < width; x++) {
        const byteIdx = rowOffset + (x >> 3);
        const bitMask = 0x80 >> (x & 7);
        const isOn = (packedBytes[byteIdx] & bitMask) !== 0;
        unpacked[pixelRowOffset + x] = isOn ? 1 : 0;
      }
    }

    return unpacked;
  }
}

/**
 * SSD1322 4-bit Grayscale Packing (16 levels):
 * 2 pixels per byte, High Nibble = Pixel N, Low Nibble = Pixel N+1.
 */
export class Ssd1322Grayscale4PackingStrategy implements IPackingStrategy {
  readonly id = 'ssd1322-gray4';
  readonly name = 'SSD1322 4-bit Grayscale';
  readonly description = '4-bit per pixel (2 pixels per byte, 16 grayscale levels).';

  pack(canonicalPixels: Uint8Array, width: number, height: number): Uint8Array {
    const totalPixels = width * height;
    const packed = new Uint8Array(Math.ceil(totalPixels / 2));

    for (let i = 0; i < totalPixels; i += 2) {
      const p1 = (canonicalPixels[i] || 0) & 0x0F;
      const p2 = (canonicalPixels[i + 1] || 0) & 0x0F;
      packed[i >> 1] = (p1 << 4) | p2;
    }

    return packed;
  }

  unpack(packedBytes: Uint8Array, width: number, height: number): Uint8Array {
    const totalPixels = width * height;
    const unpacked = new Uint8Array(totalPixels);

    for (let i = 0; i < packedBytes.length; i++) {
      const b = packedBytes[i];
      const p1Idx = i * 2;
      const p2Idx = p1Idx + 1;
      if (p1Idx < totalPixels) unpacked[p1Idx] = (b >> 4) & 0x0F;
      if (p2Idx < totalPixels) unpacked[p2Idx] = b & 0x0F;
    }

    return unpacked;
  }
}
