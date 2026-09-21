<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    frameData?: Uint8Array | null
    framebuffer?: Uint8Array | null
    connected?: boolean
    scale?: number
  }>(),
  {
    scale: 3,
    connected: false,
  }
)

const canvasRef = ref<HTMLCanvasElement | null>(null)

const activeBuffer = computed(() => props.framebuffer ?? props.frameData ?? null)

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

  const frame = activeBuffer.value

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
        // OLED emissive light cyan / blue
        data[pixelIdx] = 125     // R
        data[pixelIdx + 1] = 211 // G
        data[pixelIdx + 2] = 252 // B
        data[pixelIdx + 3] = 255 // Alpha
      } else {
        // OLED unlit pixel (deep dark charcoal)
        data[pixelIdx] = 7
        data[pixelIdx + 1] = 10
        data[pixelIdx + 2] = 15
        data[pixelIdx + 3] = 255
      }
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

watch(
  () => [props.frameData, props.framebuffer, props.connected],
  () => {
    renderFrame()
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  renderFrame()
})
</script>

<template>
  <div class="oled-fixture">
    <!-- Authentic 4-pin I2C header row -->
    <div class="oled-pin-header font-mono">
      <span class="pin-tag"><span class="pin-dot gnd" />GND</span>
      <span class="pin-tag"><span class="pin-dot vcc" />VCC</span>
      <span class="pin-tag"><span class="pin-dot scl" />SCL</span>
      <span class="pin-tag"><span class="pin-dot sda" />SDA</span>
    </div>

    <!-- Screen Glass Substrate -->
    <div class="oled-screen-frame">
      <canvas
        ref="canvasRef"
        width="128"
        height="64"
        class="oled-screen-canvas"
      />
    </div>

    <!-- Bottom spec strip -->
    <div class="oled-status-strip font-mono">
      <span class="module-title">1.3" I²C OLED (SH1106 / SSD1306)</span>
      <span v-if="props.connected" class="sync-badge">● HARDWARE SYNC</span>
      <span v-else class="offline-badge">○ OFFLINE</span>
      <span class="res-tag">128×64 · 1-BIT</span>
    </div>
  </div>
</template>

<style scoped>
.oled-fixture {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #03060a;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 0.75rem 1rem 0.6rem 1rem;
  gap: 0.6rem;
  width: 100%;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.7);
}

/* 4-Pin Header */
.oled-pin-header {
  display: flex;
  gap: 1.25rem;
  font-size: 0.65rem;
  color: #94a3b8;
  letter-spacing: 0.05em;
  padding-bottom: 2px;
}

.pin-tag {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 600;
}

.pin-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.pin-dot.gnd { background: #64748b; }
.pin-dot.vcc { background: #ef4444; }
.pin-dot.scl { background: #06b6d4; }
.pin-dot.sda { background: #3b82f6; }

/* OLED Screen Frame & Canvas */
.oled-screen-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.oled-screen-canvas {
  width: 320px;
  max-width: 100%;
  aspect-ratio: 128 / 64;
  height: auto;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 3px;
  border: 1px solid rgba(56, 189, 248, 0.22);
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.12), inset 0 0 8px rgba(0, 0, 0, 0.9);
  background-color: #04060a;
}

/* Bottom Status Strip */
.oled-status-strip {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #64748b;
  padding: 0 0.25rem;
  gap: 0.5rem;
}

.module-title {
  color: #94a3b8;
  font-weight: 600;
}

.sync-badge {
  color: #34d399;
  font-weight: 700;
  letter-spacing: 0.06em;
  animation: pulse-sync 2s infinite ease-in-out;
}

@keyframes pulse-sync {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; text-shadow: 0 0 6px #34d399; }
}

.offline-badge {
  color: #64748b;
  font-weight: 500;
}

.res-tag {
  color: #64748b;
  font-weight: 600;
}

.font-mono {
  font-family: monospace;
}
</style>
