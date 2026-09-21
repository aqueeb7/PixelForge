<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  frameData?: Uint8Array | null
  scale?: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

function renderFrame() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Logical canvas is always 128x64
  const width = 128
  const height = 64

  const imgData = ctx.createImageData(width, height)
  const data = imgData.data

  const frame = props.frameData

  // Background: very dark OLED off-pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4

      let isOn = false
      if (frame && frame.length >= 1024) {
        const byteIdx = y * 16 + Math.floor(x / 8)
        const bitMask = 0x80 >> (x % 8)
        isOn = (frame[byteIdx] & bitMask) !== 0
      }

      if (isOn) {
        // OLED emissive light blue / white
        data[pixelIdx] = 125     // R
        data[pixelIdx + 1] = 211 // G
        data[pixelIdx + 2] = 252 // B
        data[pixelIdx + 3] = 255 // Alpha
      } else {
        // OLED unlit pixel (deep dark charcoal)
        data[pixelIdx] = 8
        data[pixelIdx + 1] = 12
        data[pixelIdx + 2] = 18
        data[pixelIdx + 3] = 255
      }
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

watch(() => props.frameData, renderFrame, { deep: true })

onMounted(() => {
  renderFrame()
})
</script>

<template>
  <div class="oled-frame-container">
    <div class="oled-bezel">
      <div class="oled-glass">
        <canvas
          ref="canvasRef"
          width="128"
          height="64"
          class="oled-canvas"
        />
      </div>
      <div class="oled-brand-row">
        <span class="oled-brand">128 × 64 OLED</span>
        <span class="oled-spec">1-BIT MONOCHROME</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oled-frame-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.oled-bezel {
  background: #0d1117;
  border: 2px solid #21262d;
  border-radius: 12px;
  padding: 1.25rem 1.5rem 0.85rem;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.oled-glass {
  background-color: #05080c;
  border: 1px solid #161b22;
  border-radius: 6px;
  padding: 8px;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.oled-canvas {
  width: 512px;
  height: 256px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 2px;
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.12);
}

.oled-brand-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: monospace;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: var(--color-text-muted, #64748b);
  padding: 0 0.25rem;
}

.oled-brand {
  font-weight: 600;
  color: #94a3b8;
}

.oled-spec {
  color: #64748b;
}
</style>
