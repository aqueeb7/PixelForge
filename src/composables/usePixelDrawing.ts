export const CANVAS_WIDTH = 128
export const CANVAS_HEIGHT = 64
export const FRAMEBUFFER_SIZE = 1024 // 128 * 64 / 8 bytes

/**
 * Reads a single pixel state from a 1024-byte row-major MSB-first framebuffer.
 */
export function getPixel(buf: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    return false
  }
  const byteIdx = y * 16 + Math.floor(x / 8)
  const bitMask = 0x80 >> (x % 8)
  return (buf[byteIdx] & bitMask) !== 0
}

/**
 * Sets a single pixel in a 1024-byte row-major MSB-first framebuffer.
 */
export function setPixel(buf: Uint8Array, x: number, y: number, on: boolean): void {
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    return
  }
  const byteIdx = y * 16 + Math.floor(x / 8)
  const bitMask = 0x80 >> (x % 8)
  if (on) {
    buf[byteIdx] |= bitMask
  } else {
    buf[byteIdx] &= ~bitMask
  }
}

/**
 * Returns all (x, y) coordinates along a line using Bresenham's algorithm.
 */
export function bresenhamPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  let x = Math.floor(x0)
  let y = Math.floor(y0)
  const targetX = Math.floor(x1)
  const targetY = Math.floor(y1)

  const dx = Math.abs(targetX - x)
  const dy = Math.abs(targetY - y)
  const sx = x < targetX ? 1 : -1
  const sy = y < targetY ? 1 : -1
  let err = dx - dy

  while (true) {
    if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
      points.push({ x, y })
    }
    if (x === targetX && y === targetY) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }

  return points
}

/**
 * Draws a line directly onto the framebuffer using Bresenham's algorithm.
 */
export function drawLine(
  buf: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  on: boolean
): void {
  const points = bresenhamPoints(x0, y0, x1, y1)
  for (const pt of points) {
    setPixel(buf, pt.x, pt.y, on)
  }
}

/**
 * Returns all coordinates on a rectangle (outline or filled).
 */
export function rectanglePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean
): Array<{ x: number; y: number }> {
  const minX = Math.max(0, Math.min(x0, x1))
  const maxX = Math.min(CANVAS_WIDTH - 1, Math.max(x0, x1))
  const minY = Math.max(0, Math.min(y0, y1))
  const maxY = Math.min(CANVAS_HEIGHT - 1, Math.max(y0, y1))

  const points: Array<{ x: number; y: number }> = []

  if (filled) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        points.push({ x, y })
      }
    }
  } else {
    for (let x = minX; x <= maxX; x++) {
      points.push({ x, y: minY })
      if (minY !== maxY) {
        points.push({ x, y: maxY })
      }
    }
    for (let y = minY + 1; y < maxY; y++) {
      points.push({ x: minX, y })
      if (minX !== maxX) {
        points.push({ x: maxX, y })
      }
    }
  }

  return points
}

/**
 * Draws a rectangle directly onto the framebuffer.
 */
export function drawRectangle(
  buf: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
  on: boolean
): void {
  const points = rectanglePoints(x0, y0, x1, y1, filled)
  for (const pt of points) {
    setPixel(buf, pt.x, pt.y, on)
  }
}

/**
 * 4-way flood fill operating directly on the canonical 1024-byte framebuffer.
 */
export function floodFill(
  buf: Uint8Array,
  startX: number,
  startY: number,
  fillOn: boolean
): void {
  if (startX < 0 || startX >= CANVAS_WIDTH || startY < 0 || startY >= CANVAS_HEIGHT) {
    return
  }

  const targetColor = getPixel(buf, startX, startY)
  if (targetColor === fillOn) {
    return // Already the desired color
  }

  // Queue-based iterative flood fill
  const queue: Array<[number, number]> = [[startX, startY]]
  const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT)

  while (queue.length > 0) {
    const [cx, cy] = queue.pop()!
    const idx = cy * CANVAS_WIDTH + cx

    if (visited[idx]) continue
    visited[idx] = 1

    if (getPixel(buf, cx, cy) !== targetColor) {
      continue
    }

    setPixel(buf, cx, cy, fillOn)

    if (cx > 0 && !visited[idx - 1]) queue.push([cx - 1, cy])
    if (cx < CANVAS_WIDTH - 1 && !visited[idx + 1]) queue.push([cx + 1, cy])
    if (cy > 0 && !visited[idx - CANVAS_WIDTH]) queue.push([cx, cy - 1])
    if (cy < CANVAS_HEIGHT - 1 && !visited[idx + CANVAS_WIDTH]) queue.push([cx, cy + 1])
  }
}

/**
 * Inverts all pixels in the framebuffer (0 -> 1, 1 -> 0).
 */
export function invertBuffer(buf: Uint8Array): void {
  for (let i = 0; i < FRAMEBUFFER_SIZE; i++) {
    buf[i] ^= 0xFF
  }
}

/**
 * Clears the entire framebuffer to 0 (all dark).
 */
export function clearBuffer(buf: Uint8Array): void {
  buf.fill(0)
}

/**
 * Deep clones a canonical framebuffer.
 */
export function cloneBuffer(buf: Uint8Array): Uint8Array {
  return new Uint8Array(buf)
}
