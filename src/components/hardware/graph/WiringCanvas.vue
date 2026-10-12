<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useWiringStore } from '../../../stores/wiring'
import { useHardwareStore } from '../../../stores/hardware'
import type { NetNode } from '../../../core/hardware/Netlist'
import BreadboardBoardNode from './BreadboardBoardNode.vue'
import BreadboardComponentNode from './BreadboardComponentNode.vue'

const wiringStore = useWiringStore()
const hardwareStore = useHardwareStore()

const canvasRef = ref<HTMLElement | null>(null)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const initialPan = ref({ x: 0, y: 0 })

// Cache of pin terminal center coordinates on the canvas coordinate space
const socketCoords = ref<Map<string, { x: number; y: number; dir: number }>>(new Map())

// Active in-progress drawing wire state in canvas coordinate space
const activeWireStart = ref<{ x: number; y: number; dir: number } | null>(null)
const activeWireCurrent = ref<{ x: number; y: number } | null>(null)
const activeHoveredNode = ref<NetNode | null>(null)

// Format key for socket node: "esp32:D21" or "instanceId:SDA"
function getNodeKey(node: NetNode): string {
  return `${node.instanceId}:${node.pinId}`
}

// Update all socket positions relative to canvas
function updateSocketCoordinates() {
  if (!canvasRef.value) return
  const canvasRect = canvasRef.value.getBoundingClientRect()
  const zoom = wiringStore.zoom
  const panX = wiringStore.panOffset.x
  const panY = wiringStore.panOffset.y

  const map = new Map<string, { x: number; y: number; dir: number }>()

  // 1. Board sockets
  const boardSockets = canvasRef.value.querySelectorAll<HTMLElement>('.esp32-board-node .pin-socket')
  boardSockets.forEach((el) => {
    const label = el.dataset.pinLabel
    if (!label) return
    const rect = el.getBoundingClientRect()
    const cx = (rect.left + rect.width / 2 - canvasRect.left - panX) / zoom
    const cy = (rect.top + rect.height / 2 - canvasRect.top - panY) / zoom
    const isLeft = el.classList.contains('left-socket')
    map.set(`esp32:${label}`, { x: cx, y: cy, dir: isLeft ? -1 : 1 })
  })

  // 2. Component sockets
  const compSockets = canvasRef.value.querySelectorAll<HTMLElement>(
    '.component-node .pin-socket, .physical-component-chassis .pin-socket'
  )
  compSockets.forEach((el) => {
    const pinId = el.dataset.pinId
    const compNode = el.closest<HTMLElement>('.component-node, .physical-component-chassis')
    if (!pinId || !compNode) return

    const rect = el.getBoundingClientRect()
    const cx = (rect.left + rect.width / 2 - canvasRect.left - panX) / zoom
    const cy = (rect.top + rect.height / 2 - canvasRect.top - panY) / zoom

    // Direct lookup by data-instance-id
    const instanceId = compNode.dataset.instanceId
    if (instanceId) {
      map.set(`${instanceId}:${pinId}`, { x: cx, y: cy, dir: -1 })
      return
    }

    // Fallback: match by position
    for (const comp of wiringStore.components) {
      if (compNode.style.transform.includes(`${comp.position.x}px`)) {
        map.set(`${comp.instanceId}:${pinId}`, { x: cx, y: cy, dir: -1 })
        break
      }
    }
  })

  socketCoords.value = map
}

// Watch changes to update coordinates
watch(
  [() => wiringStore.boardPosition, () => wiringStore.components, () => wiringStore.zoom, () => wiringStore.panOffset],
  () => {
    nextTick(updateSocketCoordinates)
  },
  { deep: true }
)

// Canvas Wheel Zoom
function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
  const newZoom = Math.max(0.5, Math.min(2.0, wiringStore.zoom * zoomFactor))
  wiringStore.zoom = Number(newZoom.toFixed(2))
  nextTick(updateSocketCoordinates)
}

// Canvas Panning (Middle Click or Dragging Background)
function handleCanvasMouseDown(e: MouseEvent) {
  // Only pan if clicking canvas background, not on a component, board, or floating drawer
  if (
    (e.target as HTMLElement).closest('.component-node') ||
    (e.target as HTMLElement).closest('.physical-component-chassis') ||
    (e.target as HTMLElement).closest('.esp32-board-node') ||
    (e.target as HTMLElement).closest('.hardware-dossier-drawer')
  ) {
    return
  }

  isPanning.value = true
  panStart.value = { x: e.clientX, y: e.clientY }
  initialPan.value = { ...wiringStore.panOffset }
  wiringStore.selectComponent(null)
  wiringStore.selectWire(null)
  wiringStore.closeDrawer()
  hardwareStore.selectPin(null)

  window.addEventListener('mousemove', handleCanvasMouseMove)
  window.addEventListener('mouseup', handleCanvasMouseUp)
}

function handleCanvasMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    const dx = e.clientX - panStart.value.x
    const dy = e.clientY - panStart.value.y
    wiringStore.panOffset = {
      x: Math.round(initialPan.value.x + dx),
      y: Math.round(initialPan.value.y + dy),
    }
  }

  // Handle active wire drawing cursor follow
  if (wiringStore.drawingWire.isDrawing && canvasRef.value) {
    const canvasRect = canvasRef.value.getBoundingClientRect()
    const zoom = wiringStore.zoom
    const panX = wiringStore.panOffset.x
    const panY = wiringStore.panOffset.y

    activeWireCurrent.value = {
      x: (e.clientX - canvasRect.left - panX) / zoom,
      y: (e.clientY - canvasRect.top - panY) / zoom,
    }
  }
}

function handleCanvasMouseUp() {
  isPanning.value = false
  window.removeEventListener('mousemove', handleCanvasMouseMove)
  window.removeEventListener('mouseup', handleCanvasMouseUp)

  // If drawing a wire and released over nothing, cancel
  if (wiringStore.drawingWire.isDrawing) {
    wiringStore.cancelWireDrawing()
    activeWireStart.value = null
    activeWireCurrent.value = null
    activeHoveredNode.value = null
  }
}

// Keydown: Delete selected wire
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (wiringStore.selectedWireId) {
      wiringStore.deleteWire(wiringStore.selectedWireId)
    } else if (wiringStore.selectedComponentId) {
      wiringStore.removeComponent(wiringStore.selectedComponentId)
    }
  }
}

// Wire Socket Connection Handlers
function handleStartWire(node: NetNode, _clientPos?: { x: number; y: number }) {
  updateSocketCoordinates()
  const key = getNodeKey(node)
  const pos = socketCoords.value.get(key)
  if (!pos) return

  activeWireStart.value = pos
  activeWireCurrent.value = { ...pos }
  wiringStore.startWireDrawing(node, pos)
}

function handleHoverPin(node: NetNode | null) {
  activeHoveredNode.value = node
  if (node) {
    const key = getNodeKey(node)
    const pos = socketCoords.value.get(key)
    if (pos && activeWireCurrent.value) {
      activeWireCurrent.value = { ...pos }
    }
  }
}

function handleDropWire(targetNode: NetNode) {
  if (!wiringStore.drawingWire.isDrawing) return
  wiringStore.finishWireDrawing(targetNode)
  activeWireStart.value = null
  activeWireCurrent.value = null
  activeHoveredNode.value = null
  nextTick(updateSocketCoordinates)
}

// Generate Cubic Bezier Path between two points
function getCubicBezier(
  p1: { x: number; y: number; dir?: number },
  p2: { x: number; y: number; dir?: number }
): string {
  const dx = Math.abs(p2.x - p1.x)
  const dy = Math.abs(p2.y - p1.y)
  const curvature = Math.max(40, Math.min(200, Math.sqrt(dx * dx + dy * dy) * 0.45))

  const dir1 = p1.dir !== undefined ? p1.dir : p2.x >= p1.x ? 1 : -1
  const dir2 = p2.dir !== undefined ? p2.dir : p1.x >= p2.x ? 1 : -1

  const cp1x = p1.x + dir1 * curvature
  const cp1y = p1.y
  const cp2x = p2.x + dir2 * curvature
  const cp2y = p2.y

  return `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
}

// Resolve Net Endpoints
function getNetCoordinates(net: { nodes: NetNode[] }) {
  if (net.nodes.length < 2) return null
  const n1 = net.nodes[0]
  const n2 = net.nodes[1]

  const p1 = socketCoords.value.get(getNodeKey(n1))
  const p2 = socketCoords.value.get(getNodeKey(n2))

  if (!p1 || !p2) return null
  return { p1, p2 }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  nextTick(() => {
    updateSocketCoordinates()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div
    ref="canvasRef"
    class="wiring-canvas"
    :class="{ 'is-panning': isPanning }"
    :style="{
      backgroundPosition: `${wiringStore.panOffset.x}px ${wiringStore.panOffset.y}px`,
      backgroundSize: `${28 * wiringStore.zoom}px ${28 * wiringStore.zoom}px`,
      cursor: isPanning ? 'grabbing' : (wiringStore.drawingWire.isDrawing ? 'crosshair' : 'default'),
    }"
    @wheel="handleWheel"
    @mousedown="handleCanvasMouseDown"
  >
    <!-- Circuit Dot Grid Background & Scaled Canvas Container -->
    <div
      class="canvas-viewport"
      :style="{
        transform: `translate(${wiringStore.panOffset.x}px, ${wiringStore.panOffset.y}px) scale(${wiringStore.zoom})`,
      }"
    >
      <!-- SVG Wire Routing Layer (Rendered below components but above grid) -->
      <svg class="wires-layer">
        <defs>
          <!-- Wire Glow Filter -->
          <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Static Configured Nets -->
        <g
          v-for="net in wiringStore.nets"
          :key="net.id"
          class="wire-group"
          :class="{
            'is-selected': wiringStore.selectedWireId === net.id,
          }"
          @click.stop="wiringStore.selectWire(net.id)"
        >
          <!-- Compute endpoints -->
          <template v-if="getNetCoordinates(net)">
            <!-- Hit Target (Thick Invisible Stroke) -->
            <path
              :d="getCubicBezier(getNetCoordinates(net)!.p1, getNetCoordinates(net)!.p2)"
              class="wire-hitbox"
            />

            <!-- Outline Shadow Stroke -->
            <path
              :d="getCubicBezier(getNetCoordinates(net)!.p1, getNetCoordinates(net)!.p2)"
              class="wire-outline"
            />

            <!-- Main Colored Core Wire -->
            <path
              :d="getCubicBezier(getNetCoordinates(net)!.p1, getNetCoordinates(net)!.p2)"
              class="wire-core"
              :style="{ stroke: net.color }"
            />

            <!-- Signal Pulse Animation on I2C / Clock / Data Lines -->
            <path
              v-if="net.name.includes('I2C') || net.name.includes('CLK') || net.name.includes('SDA') || net.name.includes('SCL')"
              :d="getCubicBezier(getNetCoordinates(net)!.p1, getNetCoordinates(net)!.p2)"
              class="wire-signal-pulse"
              :style="{ stroke: net.color }"
            />
          </template>
        </g>

        <!-- In-Progress Drawing Wire -->
        <g v-if="activeWireStart && activeWireCurrent" class="drawing-wire-group">
          <!-- Outline -->
          <path
            :d="getCubicBezier(activeWireStart, activeWireCurrent)"
            class="wire-outline"
          />
          <!-- Core Drawing Line -->
          <path
            :d="getCubicBezier(activeWireStart, activeWireCurrent)"
            class="wire-drawing"
          />
          <!-- Magnet Socket Ring if hovering target -->
          <circle
            v-if="activeHoveredNode"
            :cx="activeWireCurrent.x"
            :cy="activeWireCurrent.y"
            r="10"
            class="magnet-target-ring"
          />
        </g>
      </svg>

      <!-- MCU Development Board Node -->
      <BreadboardBoardNode
        @start-wire="handleStartWire"
        @hover-pin="handleHoverPin"
        @drop-wire="handleDropWire"
      />

      <!-- Plotted Peripheral Components -->
      <BreadboardComponentNode
        v-for="comp in wiringStore.components"
        :key="comp.instanceId"
        :component="comp"
        @start-wire="handleStartWire"
        @hover-pin="handleHoverPin"
        @drop-wire="handleDropWire"
      />
    </div>

    <!-- Active Wire Selection Action Toast -->
    <div v-if="wiringStore.selectedWireId" class="selected-wire-hud">
      <span class="wire-hud-icon">⚡</span>
      <span class="wire-hud-name font-mono">
        {{ wiringStore.nets.find((n) => n.id === wiringStore.selectedWireId)?.name }}
      </span>
      <button
        class="btn-delete-wire"
        title="Delete wire connection (or press Del)"
        @click.stop="wiringStore.deleteWire(wiringStore.selectedWireId!)"
      >
        🗑️ Disconnect
      </button>
      <button class="btn-close-hud" @click="wiringStore.selectWire(null)">✕</button>
    </div>
  </div>
</template>

<style scoped>
.wiring-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #0b0c10;
  /* Circuit Dot Grid */
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px);
  background-size: 24px 24px;
  cursor: default;
}

.canvas-viewport {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

/* SVG Wires Layer */
.wires-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 5000px;
  height: 5000px;
  pointer-events: none;
  z-index: 2;
  overflow: visible;
}

.wire-group {
  cursor: pointer;
  pointer-events: all;
}

.wire-hitbox {
  fill: none;
  stroke: transparent;
  stroke-width: 16px;
  stroke-linecap: round;
}

.wire-outline {
  fill: none;
  stroke: #090a0f;
  stroke-width: 5px;
  stroke-linecap: round;
}

.wire-core {
  fill: none;
  stroke-width: 2.5px;
  stroke-linecap: round;
  transition: stroke-width 0.15s ease, filter 0.15s ease;
}

.wire-group:hover .wire-core {
  stroke-width: 4px;
  filter: url(#wire-glow);
}

.wire-group.is-selected .wire-core {
  stroke-width: 4px;
  stroke: #fbbf24 !important;
  filter: url(#wire-glow);
}

.wire-signal-pulse {
  fill: none;
  stroke-width: 2px;
  stroke-linecap: round;
  stroke-dasharray: 6, 8;
  animation: signalPulse 1s linear infinite;
  opacity: 0.8;
}

@keyframes signalPulse {
  from {
    stroke-dashoffset: 28;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* In-Progress Drawing Wire */
.wire-drawing {
  fill: none;
  stroke: #7c6fff;
  stroke-width: 2.5px;
  stroke-linecap: round;
  stroke-dasharray: 5, 5;
  animation: wireDrawingPulse 0.8s linear infinite;
}

@keyframes wireDrawingPulse {
  from {
    stroke-dashoffset: 20;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.magnet-target-ring {
  fill: none;
  stroke: #34d399;
  stroke-width: 2px;
  animation: magnetPulse 0.6s alternate infinite ease-in-out;
}

@keyframes magnetPulse {
  from {
    r: 8px;
    opacity: 0.5;
  }
  to {
    r: 12px;
    opacity: 1;
  }
}

/* Selected Wire HUD */
.selected-wire-hud {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(20, 22, 32, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.4rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  z-index: 30;
  animation: fadeInDown 0.15s ease-out;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translate(-50%, -10px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.wire-hud-icon {
  font-size: 0.9rem;
}

.wire-hud-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.btn-delete-wire {
  background-color: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: var(--color-error);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-delete-wire:hover {
  background-color: var(--color-error);
  color: #fff;
}

.btn-close-hud {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-close-hud:hover {
  color: var(--color-text-primary);
}
</style>
