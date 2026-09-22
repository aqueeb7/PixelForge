<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useDeviceStore } from '../../stores/device'
import { useHardwareStore } from '../../stores/hardware'

const deviceStore = useDeviceStore()
const hardwareStore = useHardwareStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)

// Find OLED peripheral configuration from hardwareStore
const oledPeripheral = computed(() => {
  return hardwareStore.peripherals.find(
    (p) => p.type === 'OLED_128X64_I2C' || p.id.includes('oled')
  ) || {
    id: 'oled-display-primary',
    name: '1.3" Monochrome OLED',
    controller: 'SH1106 / SSD1306',
    i2c_address: '0x3C',
    pins: {
      GND: 'GND',
      VCC: '3V3',
      SCL: 'D22 (SCL)',
      SDA: 'D21 (SDA)',
    },
  }
})

// Net-based connection highlighting
const isCardNetHighlighted = computed(() => {
  const compId = oledPeripheral.value.id
  return hardwareStore.highlightedEndpoints.has(compId)
})

function isPinNetHighlighted(pinKey: string) {
  const compId = oledPeripheral.value.id
  const pinSet = hardwareStore.highlightedEndpoints.get(compId)
  return pinSet ? pinSet.has(pinKey) : false
}

function handleCardMouseEnter() {
  hardwareStore.setHoveredEndpoint(oledPeripheral.value.id)
}

function handleCardMouseLeave() {
  hardwareStore.clearHoveredEndpoint()
}

function handlePinMouseEnter(pinKey: string) {
  hardwareStore.setHoveredEndpoint(oledPeripheral.value.id, pinKey)
}

function handlePinMouseLeave() {
  hardwareStore.setHoveredEndpoint(oledPeripheral.value.id)
}

const isConnected = computed(() => deviceStore.status === 'connected')
const activeFrame = computed(() => deviceStore.activeFrame)

function renderFrame() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = 128
  const height = 64

  const imgData = ctx.createImageData(width, height)
  const data = imgData.data
  const frame = activeFrame.value

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
        // High-contrast emissive OLED cyan glow
        data[pixelIdx] = 125     // R
        data[pixelIdx + 1] = 211 // G
        data[pixelIdx + 2] = 252 // B
        data[pixelIdx + 3] = 255
      } else {
        // Deep OLED charcoal off-pixel
        data[pixelIdx] = 6
        data[pixelIdx + 1] = 9
        data[pixelIdx + 2] = 14
        data[pixelIdx + 3] = 255
      }
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

watch(
  () => [deviceStore.activeFrame, deviceStore.status],
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
  <!-- Physical Component Chassis / PCB Card -->
  <div
    class="physical-device-card"
    :class="{
      'device--active': isConnected,
      'device--net-highlighted': isCardNetHighlighted,
    }"
    @mouseenter="handleCardMouseEnter"
    @mouseleave="handleCardMouseLeave"
  >
    <!-- Corner Brass Mounting Vias -->
    <div class="mounting-hole top-left" title="M2 Mounting Via" />
    <div class="mounting-hole top-right" title="M2 Mounting Via" />
    <div class="mounting-hole bottom-left" title="M2 Mounting Via" />
    <div class="mounting-hole bottom-right" title="M2 Mounting Via" />

    <!-- Silkscreen Header: Component Identity & Markings -->
    <div class="pcb-header">
      <div class="component-meta">
        <div class="tag-row">
          <span class="pcb-badge">PERIPHERAL #01</span>
          <span class="pcb-subtext font-mono">I²C BUS: {{ oledPeripheral.i2c_address || '0x3C' }}</span>
        </div>
        <h4 class="component-name">{{ oledPeripheral.name || '1.3" Monochrome OLED' }}</h4>
        <span class="controller-tag font-mono">IC: {{ oledPeripheral.controller || 'SH1106 / SSD1306' }}</span>
      </div>

      <!-- Live Sync Status Indicator -->
      <div class="sync-indicator">
        <div
          class="status-led"
          :class="{ 'led--online': isConnected, 'led--offline': !isConnected }"
        />
        <span v-if="isConnected" class="status-label sync-on">HARDWARE SYNC</span>
        <span v-else class="status-label sync-off">OFFLINE</span>
      </div>
    </div>

    <!-- Integrated Pin Drive Header Strip -->
    <div class="pin-drive-strip font-mono">
      <div
        class="pin-cell"
        :class="{ 'pin-cell--net-highlighted': isPinNetHighlighted('GND') }"
        @mouseenter.stop="handlePinMouseEnter('GND')"
        @mouseleave.stop="handlePinMouseLeave"
      >
        <span class="pin-name gnd">GND</span>
        <span class="pin-wire">{{ oledPeripheral.pins?.GND || 'GND' }}</span>
      </div>
      <div
        class="pin-cell"
        :class="{ 'pin-cell--net-highlighted': isPinNetHighlighted('VCC') }"
        @mouseenter.stop="handlePinMouseEnter('VCC')"
        @mouseleave.stop="handlePinMouseLeave"
      >
        <span class="pin-name vcc">VCC</span>
        <span class="pin-wire">{{ oledPeripheral.pins?.VCC || '3V3' }}</span>
      </div>
      <div
        class="pin-cell"
        :class="{ 'pin-cell--net-highlighted': isPinNetHighlighted('SCL') }"
        @mouseenter.stop="handlePinMouseEnter('SCL')"
        @mouseleave.stop="handlePinMouseLeave"
      >
        <span class="pin-name scl">SCL</span>
        <span class="pin-wire">{{ oledPeripheral.pins?.SCL || 'D22' }}</span>
      </div>
      <div
        class="pin-cell"
        :class="{ 'pin-cell--net-highlighted': isPinNetHighlighted('SDA') }"
        @mouseenter.stop="handlePinMouseEnter('SDA')"
        @mouseleave.stop="handlePinMouseLeave"
      >
        <span class="pin-name sda">SDA</span>
        <span class="pin-wire">{{ oledPeripheral.pins?.SDA || 'D21' }}</span>
      </div>
    </div>

    <!-- Embedded Physical OLED Glass Substrate -->
    <div class="oled-glass-bezel">
      <canvas
        ref="canvasRef"
        width="128"
        height="64"
        class="oled-screen"
      />
    </div>

    <!-- Bottom Laser Markings & Micro-Controls -->
    <div class="pcb-footer">
      <div class="tech-specs font-mono">
        <span class="spec-item">128×64</span>
        <span class="spec-dot">·</span>
        <span class="spec-item">1-BIT</span>
        <span class="spec-dot">·</span>
        <span class="spec-item">1024 B</span>
      </div>

      <div class="device-actions">
        <button
          class="btn-pcb-action"
          :disabled="!isConnected"
          title="Clear screen buffer on device"
          @click="deviceStore.clear"
        >
          ⌧ Clear
        </button>
        <button
          class="btn-pcb-action btn-accent"
          title="Send test grid pattern to OLED"
          @click="deviceStore.sendTestPattern"
        >
          ⟳ Test Pattern
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Physical Device Chassis / PCB */
.physical-device-card {
  position: relative;
  background: #090d14;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.85rem 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s ease;
  flex-shrink: 0;
  min-height: fit-content;
}

.physical-device-card.device--active {
  border-color: rgba(56, 189, 248, 0.35);
}

.physical-device-card.device--net-highlighted {
  border-color: #38bdf8;
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* Corner Brass Mounting Vias */
.mounting-hole {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #020408;
  border: 1.5px solid #d97706; /* Brass ring */
  box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.top-left { top: 6px; left: 6px; }
.top-right { top: 6px; right: 6px; }
.bottom-left { bottom: 6px; left: 6px; }
.bottom-right { bottom: 6px; right: 6px; }

/* PCB Silkscreen Header */
.pcb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  padding-bottom: 0.5rem;
}

.component-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pcb-badge {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.pcb-subtext {
  font-size: 0.65rem;
  color: #64748b;
  font-weight: 600;
}

.component-name {
  font-size: 0.86rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: -0.01em;
}

.controller-tag {
  font-size: 0.65rem;
  color: #94a3b8;
}

/* Live Sync Status Indicator */
.sync-indicator {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(0, 0, 0, 0.35);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.status-led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.led--online {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-led 2s infinite ease-in-out;
}

@keyframes pulse-led {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; filter: brightness(1.3); }
}

.led--offline {
  background: #64748b;
}

.status-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: monospace;
}

.sync-on {
  color: #34d399;
}

.sync-off {
  color: #64748b;
}

/* Pin Drive Header Strip */
.pin-drive-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
  background: #04070d;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
}

.pin-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pin-cell:hover,
.pin-cell.pin-cell--net-highlighted {
  background: rgba(56, 189, 248, 0.18);
  outline: 1px solid rgba(56, 189, 248, 0.6);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.35);
}

.pin-name {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.pin-name.gnd { color: #94a3b8; }
.pin-name.vcc { color: #f87171; }
.pin-name.scl { color: #38bdf8; }
.pin-name.sda { color: #60a5fa; }

.pin-wire {
  font-size: 0.58rem;
  color: #64748b;
  font-weight: 500;
}

/* Glass Screen Bezel */
.oled-glass-bezel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #020306;
  border: 1px solid #111827;
  border-radius: 4px;
  padding: 6px 4px;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.9);
}

.oled-screen {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 128 / 64;
  min-height: 140px;
  height: auto;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 2px;
  border: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.12);
  background-color: #030509;
}

/* PCB Footer Markings & Micro-Controls */
.pcb-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.2rem;
}

.tech-specs {
  font-size: 0.64rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 600;
}

.spec-dot {
  color: #334155;
}

.device-actions {
  display: flex;
  gap: 0.35rem;
}

.btn-pcb-action {
  background: #0f172a;
  border: 1px solid #334155;
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-pcb-action:hover:not(:disabled) {
  background: #1e293b;
  color: #f1f5f9;
  border-color: #64748b;
}

.btn-pcb-action.btn-accent:hover:not(:disabled) {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.btn-pcb-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.font-mono {
  font-family: monospace;
}
</style>
