<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useWiringStore } from '../../../stores/wiring'
import { useDeviceStore } from '../../../stores/device'
import { getComponentDefinition, type ComponentPin } from '../../../core/hardware/ComponentDefinition'
import type { PlottedComponent, NetNode } from '../../../core/hardware/Netlist'

const props = defineProps<{
  component: PlottedComponent
}>()

const emit = defineEmits<{
  (e: 'start-wire', node: NetNode, clientPos: { x: number; y: number }): void
  (e: 'hover-pin', node: NetNode | null): void
  (e: 'drop-wire', node: NetNode): void
}>()

const wiringStore = useWiringStore()
const deviceStore = useDeviceStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)

const definition = computed(() => {
  return getComponentDefinition(props.component.definitionId)
})

const isDisplay = computed(() => definition.value?.category === 'Display')

const isI2c = computed(() => {
  return isDisplay.value || (definition.value?.i2cAddress !== undefined)
})

const currentAddress = computed(() => {
  return props.component.i2cAddress || definition.value?.i2cAddress || 0x3c
})

const isConnected = computed(() => deviceStore.status === 'connected')

function isPinConnected(pinId: string): boolean {
  return wiringStore.nets.some((net) =>
    net.nodes.some(
      (n) => n.instanceId === props.component.instanceId && n.pinId === pinId
    )
  )
}

function getConnectedBoardPin(pinId: string): string | null {
  const net = wiringStore.nets.find((n) =>
    n.nodes.some((node) => node.instanceId === props.component.instanceId && node.pinId === pinId)
  )
  if (!net) return null
  const boardNode = net.nodes.find((node) => node.instanceId === 'esp32')
  return boardNode ? boardNode.pinId : 'Bridged'
}

function getPinColor(pin: ComponentPin): string {
  const t = pin.type
  if (t === 'GND') return '#6b7280'
  if (t === 'POWER_IN') return pin.requiredVoltage === 5.0 ? '#f97316' : '#ef4444'
  if (t === 'I2C_SDA') return '#38bdf8'
  if (t === 'I2C_SCL') return '#f59e0b'
  if (t.startsWith('SPI')) return '#10b981'
  if (t === 'ANALOG') return '#14b8a6'
  return '#a855f7'
}

// Live OLED canvas rendering
function renderOledFrame() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = 128
  const height = definition.value?.id.includes('128x32') || definition.value?.id.includes('091') ? 32 : 64
  canvas.width = width
  canvas.height = height

  const imgData = ctx.createImageData(width, height)
  const data = imgData.data
  const frame = deviceStore.activeFrame

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4
      let isOn = false

      if (frame && frame.length >= (width * height) / 8) {
        const byteIdx = y * Math.floor(width / 8) + Math.floor(x / 8)
        const bitMask = 0x80 >> (x % 8)
        isOn = (frame[byteIdx] & bitMask) !== 0
      } else {
        // Default subtle idle standby pattern: PixelForge logo text grid
        if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
          isOn = (x + y) % 4 === 0
        } else if (y >= 26 && y <= 36 && x >= 30 && x <= 98) {
          isOn = (x * 3 + y * 7) % 5 === 0
        }
      }

      if (isOn) {
        // Emissive OLED sky blue glow
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
    if (isDisplay.value) {
      renderOledFrame()
    }
  },
  { deep: true }
)

onMounted(() => {
  if (isDisplay.value) {
    renderOledFrame()
  }
})

// Dragging the component node
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const initialPos = ref({ x: 0, y: 0 })

function handleMouseDown(e: MouseEvent) {
  if (
    (e.target as HTMLElement).closest('.pin-socket') ||
    (e.target as HTMLElement).closest('.comp-icon-btn')
  ) {
    return
  }

  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  initialPos.value = { ...props.component.position }
  wiringStore.selectComponent(props.component.instanceId)

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const dx = (e.clientX - dragStart.value.x) / wiringStore.zoom
  const dy = (e.clientY - dragStart.value.y) / wiringStore.zoom

  wiringStore.updateComponentPosition(props.component.instanceId, {
    x: Math.round(initialPos.value.x + dx),
    y: Math.round(initialPos.value.y + dy),
  })
}

function handleMouseUp() {
  isDragging.value = false
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
}

// Pin Socket Interactions
function handlePinMouseDown(pin: ComponentPin, e: MouseEvent) {
  e.stopPropagation()
  emit('start-wire', { instanceId: props.component.instanceId, pinId: pin.id }, { x: e.clientX, y: e.clientY })
}

function handlePinMouseEnter(pin: ComponentPin) {
  emit('hover-pin', { instanceId: props.component.instanceId, pinId: pin.id })
}

function handlePinMouseLeave() {
  emit('hover-pin', null)
}

function handlePinMouseUp(pin: ComponentPin) {
  emit('drop-wire', { instanceId: props.component.instanceId, pinId: pin.id })
}
</script>

<template>
  <div
    v-if="definition"
    class="physical-component-chassis component-node"
    :data-instance-id="component.instanceId"
    :class="{
      'is-selected': wiringStore.selectedComponentId === component.instanceId,
      'is-display': isDisplay,
    }"
    :style="{
      transform: `translate(${component.position.x}px, ${component.position.y}px)`,
      width: `${Math.max(240, definition.width)}px`,
      '--accent-color': definition.accentColor,
    }"
    @mousedown="handleMouseDown"
  >
    <!-- Brass Mounting Vias in 4 corners -->
    <div class="mounting-via top-left" title="M2 Mounting Via" />
    <div class="mounting-via top-right" title="M2 Mounting Via" />
    <div class="mounting-via bottom-left" title="M2 Mounting Via" />
    <div class="mounting-via bottom-right" title="M2 Mounting Via" />

    <!-- Silkscreen Header: Part ID & Meta -->
    <header class="pcb-silkscreen-header">
      <div class="header-left">
        <span class="part-icon">{{ definition.icon }}</span>
        <div class="part-info">
          <div class="silkscreen-tag-row">
            <span class="pcb-tag font-mono">MODULE</span>
            <span v-if="isI2c" class="i2c-addr-tag font-mono">
              I²C 0x{{ currentAddress.toString(16).toUpperCase() }}
            </span>
          </div>
          <h4 class="part-name">{{ component.name }}</h4>
        </div>
      </div>

      <div class="header-actions">
        <!-- Live Hardware Sync LED -->
        <div
          class="status-led"
          :class="{ 'led--online': isConnected, 'led--offline': !isConnected }"
          :title="isConnected ? 'Hardware Active & Synchronized' : 'Hardware Offline'"
        />

        <!-- Info Button (opens slide drawer on right) -->
        <button
          class="comp-icon-btn btn-info font-mono"
          :class="{
            'is-active':
              wiringStore.activeDrawer === 'component' &&
              wiringStore.inspectedComponentId === component.instanceId,
          }"
          title="Component Specs & Pinout Matrix (Slide Drawer)"
          @click.stop="wiringStore.activeDrawer === 'component' && wiringStore.inspectedComponentId === component.instanceId ? wiringStore.closeDrawer() : wiringStore.openComponentDossier(component.instanceId)"
        >
          <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <circle cx="12" cy="8" r="1" fill="currentColor" />
          </svg>
        </button>

        <!-- Remove Component -->
        <button
          class="comp-icon-btn btn-delete"
          title="Remove component from breadboard"
          @click.stop="wiringStore.removeComponent(component.instanceId)"
        >
          <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </header>

    <!-- REAL LIVE 128×64 OLED DISPLAY PANEL (if Display) -->
    <div v-if="isDisplay" class="physical-oled-display-stage">
      <div class="glass-bezel">
        <div class="bezel-glare-overlay" />
        <canvas ref="canvasRef" width="128" height="64" class="real-oled-canvas" />
      </div>
      <div class="screen-subbar font-mono">
        <span class="subbar-tag">128×64 MONO</span>
        <span class="subbar-fps">{{ isConnected ? '15 FPS LIVE' : 'STANDBY' }}</span>
      </div>
    </div>

    <!-- ROTARY ENCODER PHYSICAL CHASSIS (if Encoder) -->
    <div v-else-if="definition.id === 'rotary-encoder-ec11'" class="physical-encoder-stage">
      <div class="encoder-knob-dial">
        <div class="knob-ridges" />
        <div class="knob-pointer-notch" />
        <span class="knob-icon">🎛️</span>
      </div>
      <span class="encoder-label font-mono">EC11 360° SCRUB DIAL</span>
    </div>

    <!-- TACTILE BUTTON CHASSIS (if Button) -->
    <div v-else-if="definition.id === 'button-momentary'" class="physical-button-stage">
      <div class="tactile-switch-case">
        <div class="metal-dome-button" />
        <div class="solder-legs" />
      </div>
      <span class="button-label font-mono">MOMENTARY PUSH-SWITCH</span>
    </div>

    <!-- NEOPIXEL RING (if Lighting) -->
    <div v-else-if="definition.id === 'neopixel-ring-8'" class="physical-neopixel-stage">
      <div class="ring-pcb">
        <div v-for="i in 8" :key="i" class="smd-led-pixel" :style="{ '--rot': `${(i - 1) * 45}deg` }">
          <div class="led-die" />
        </div>
      </div>
    </div>

    <!-- PIN HEADERS STRIP (Physical Through-Hole Copper Solder Pads) -->
    <div class="pins-header-strip">
      <div
        v-for="pin in definition.pins"
        :key="pin.id"
        class="pin-socket-entry"
        :class="{ 'is-connected': isPinConnected(pin.id) }"
        :title="`${pin.label}: ${pin.description}`"
      >
        <!-- Gold Solder Pad Terminal -->
        <div
          class="pin-socket"
          :data-pin-id="pin.id"
          :style="{ '--socket-color': getPinColor(pin) }"
          @mousedown="handlePinMouseDown(pin, $event)"
          @mouseenter="handlePinMouseEnter(pin)"
          @mouseleave="handlePinMouseLeave"
          @mouseup="handlePinMouseUp(pin)"
        >
          <div class="copper-pad-ring">
            <div class="through-hole" />
          </div>
        </div>

        <!-- Pin Label & Type Tag -->
        <div class="pin-descriptor">
          <span class="pin-title font-mono">{{ pin.label }}</span>
          <span
            class="pin-role-badge font-mono"
            :style="{
              color: getPinColor(pin),
              backgroundColor: `${getPinColor(pin)}1a`,
            }"
          >
            {{ pin.type.replace('POWER_IN', 'PWR') }}
          </span>
          <span v-if="getConnectedBoardPin(pin.id)" class="net-target-tag font-mono">
            → {{ getConnectedBoardPin(pin.id) }}
          </span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.physical-component-chassis {
  position: absolute;
  top: 0;
  left: 0;
  background: linear-gradient(180deg, #131722 0%, #0d1017 100%);
  border: 1.5px solid #2a3348;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  user-select: none;
  cursor: grab;
  z-index: 6;
  overflow: visible;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.physical-component-chassis:active {
  cursor: grabbing;
}

.physical-component-chassis.is-selected {
  border-color: var(--accent-color, #38bdf8);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

/* Brass Mounting Vias */
.mounting-via {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: radial-gradient(circle, #090b10 40%, #b45309 60%, #d97706 90%, #78350f 100%);
  border: 1px solid rgba(0, 0, 0, 0.6);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  z-index: 2;
}

.top-left { top: 6px; left: 6px; }
.top-right { top: 6px; right: 6px; }
.bottom-left { bottom: 6px; left: 6px; }
.bottom-right { bottom: 6px; right: 6px; }

/* Silkscreen Header */
.pcb-silkscreen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.part-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.part-info {
  display: flex;
  flex-direction: column;
}

.silkscreen-tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pcb-tag {
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  color: #38bdf8;
  font-weight: 700;
}

.i2c-addr-tag {
  font-size: 0.55rem;
  color: #fbbf24;
}

.part-name {
  font-size: 0.78rem;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.led--online {
  background-color: #34d399;
  box-shadow: 0 0 6px #34d399;
}

.led--offline {
  background-color: #475569;
}

.comp-icon-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #141824;
  color: #94a3b8;
  padding: 0;
}

.comp-icon-btn .btn-svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.comp-icon-btn.btn-info:hover,
.comp-icon-btn.btn-info.is-active {
  background: rgba(56, 189, 248, 0.18);
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.35);
}

.comp-icon-btn.btn-delete:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: #ef4444;
  color: #f87171;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.35);
}

/* REAL LIVE OLED DISPLAY STAGE */
.physical-oled-display-stage {
  padding: 8px 12px;
  background-color: #06070a;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.glass-bezel {
  position: relative;
  background-color: #020305;
  border: 1.5px solid #1e2433;
  border-radius: 4px;
  padding: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.9), 0 0 12px rgba(56, 189, 248, 0.15);
  overflow: hidden;
}

.bezel-glare-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 45%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 100%);
  pointer-events: none;
}

.real-oled-canvas {
  width: 100%;
  height: auto;
  aspect-ratio: 128 / 64;
  image-rendering: pixelated;
  display: block;
}

.screen-subbar {
  display: flex;
  justify-content: space-between;
  font-size: 0.55rem;
  color: #64748b;
}

.subbar-fps {
  color: #38bdf8;
}

/* ROTARY ENCODER STAGE */
.physical-encoder-stage {
  padding: 10px 12px;
  background-color: #0a0d14;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.encoder-knob-dial {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle, #334155 30%, #1e293b 80%, #0f172a 100%);
  border: 2px solid #64748b;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6), inset 0 0 6px rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.knob-pointer-notch {
  position: absolute;
  top: 4px;
  width: 3px;
  height: 8px;
  background-color: #38bdf8;
  border-radius: 2px;
  box-shadow: 0 0 4px #38bdf8;
}

.knob-icon {
  font-size: 1.1rem;
}

.encoder-label {
  font-size: 0.58rem;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

/* BUTTON STAGE */
.physical-button-stage {
  padding: 10px 12px;
  background-color: #0a0d14;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.tactile-switch-case {
  width: 36px;
  height: 36px;
  background-color: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
}

.metal-dome-button {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle, #cbd5e1 30%, #94a3b8 70%, #475569 100%);
  border: 1px solid #e2e8f0;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.8);
}

.button-label {
  font-size: 0.58rem;
  color: #94a3b8;
}

/* NEOPIXEL STAGE */
.physical-neopixel-stage {
  padding: 10px 12px;
  background-color: #0a0d14;
  display: flex;
  justify-content: center;
}

.ring-pcb {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 2px solid #334155;
  background-color: #020617;
  position: relative;
}

.smd-led-pixel {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  transform: rotate(var(--rot)) translateY(-22px);
  background-color: #fff;
  border-radius: 1px;
  box-shadow: 0 0 6px #ec4899;
}

/* PIN HEADERS STRIP */
.pins-header-strip {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: rgba(0, 0, 0, 0.25);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.pin-socket-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
}

.pin-socket {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  cursor: crosshair;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  flex-shrink: 0;
}

.copper-pad-ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle, #b45309 30%, #78350f 70%, #451a03 100%);
  border: 1.5px solid var(--socket-color, #38bdf8);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}

.through-hole {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: #000;
}

.pin-socket:hover {
  transform: scale(1.35);
}

.pin-socket:hover .copper-pad-ring {
  border-color: #fff;
  box-shadow: 0 0 8px var(--socket-color, #38bdf8);
}

.is-connected .copper-pad-ring {
  box-shadow: 0 0 5px var(--socket-color, #38bdf8);
}

.pin-descriptor {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.pin-title {
  font-size: 0.68rem;
  font-weight: 700;
  color: #e2e8f0;
}

.pin-role-badge {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 0.05rem 0.25rem;
  border-radius: 2px;
}

.net-target-tag {
  font-size: 0.58rem;
  color: #38bdf8;
  opacity: 0.85;
  white-space: nowrap;
}

</style>
