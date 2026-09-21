<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  getPixel,
  setPixel,
  drawLine,
  drawRectangle,
  floodFill,
  cloneBuffer,
  bresenhamPoints,
  rectanglePoints,
} from '../composables/usePixelDrawing'

const props = defineProps<{
  modelValue: Uint8Array
  activeTool: 'pencil' | 'eraser' | 'line' | 'rectangle' | 'fill'
  rectangleMode: 'outline' | 'filled'
  zoom: number
  showGrid: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Uint8Array): void
  (e: 'strokeStart', beforeSnapshot: Uint8Array): void
  (e: 'strokeEnd'): void
  (e: 'cursorMove', coord: { x: number; y: number } | null): void
}>()

const baseCanvasRef = ref<HTMLCanvasElement | null>(null)
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)

// Panning offset in viewport pixels
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const isSpacePressed = ref(false)

// Active drawing state
const isDrawing = ref(false)
const drawButton = ref<number>(0) // 0 = Left, 2 = Right
const strokeSnapshot = ref<Uint8Array | null>(null)
const lastLogical = ref<{ x: number; y: number } | null>(null)
const dragStart = ref<{ x: number; y: number } | null>(null)

const canvasPixelWidth = computed(() => CANVAS_WIDTH * props.zoom)
const canvasPixelHeight = computed(() => CANVAS_HEIGHT * props.zoom)

// -----------------------------------------------------------------------------
// Canvas Rendering
// -----------------------------------------------------------------------------

function renderBaseCanvas() {
  const canvas = baseCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Render 128x64 buffer directly to internal canvas buffer
  const imgData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT)
  const d = imgData.data
  const buf = props.modelValue

  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    for (let x = 0; x < CANVAS_WIDTH; x++) {
      const idx = (y * CANVAS_WIDTH + x) * 4
      const on = getPixel(buf, x, y)
      if (on) {
        // Emissive light cyan / white OLED pixel
        d[idx] = 125     // R
        d[idx + 1] = 211 // G
        d[idx + 2] = 252 // B
        d[idx + 3] = 255
      } else {
        // OLED unlit dark pixel
        d[idx] = 9
        d[idx + 1] = 13
        d[idx + 2] = 20
        d[idx + 3] = 255
      }
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

function clearPreviewCanvas() {
  const canvas = previewCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function renderGhostPreview(points: Array<{ x: number; y: number }>, on: boolean) {
  const canvas = previewCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = on ? 'rgba(56, 189, 248, 0.85)' : 'rgba(239, 68, 68, 0.85)'

  for (const pt of points) {
    if (pt.x >= 0 && pt.x < CANVAS_WIDTH && pt.y >= 0 && pt.y < CANVAS_HEIGHT) {
      ctx.fillRect(pt.x, pt.y, 1, 1)
    }
  }
}

watch(() => props.modelValue, renderBaseCanvas, { deep: true })
watch(() => props.zoom, () => {
  renderBaseCanvas()
})

// -----------------------------------------------------------------------------
// Coordinate Calculations
// -----------------------------------------------------------------------------

function getLogicalCoords(e: MouseEvent): { x: number; y: number } | null {
  const canvas = baseCanvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()

  const clientX = e.clientX - rect.left
  const clientY = e.clientY - rect.top

  if (clientX < 0 || clientX >= rect.width || clientY < 0 || clientY >= rect.height) {
    return null
  }

  const x = Math.floor((clientX / rect.width) * CANVAS_WIDTH)
  const y = Math.floor((clientY / rect.height) * CANVAS_HEIGHT)

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH - 1, x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - 1, y)),
  }
}

// -----------------------------------------------------------------------------
// Pointer Event Handlers
// -----------------------------------------------------------------------------

function onMouseDown(e: MouseEvent) {
  // Check for pan start (middle click or Space + left click)
  if (e.button === 1 || (e.button === 0 && isSpacePressed.value)) {
    isPanning.value = true
    panStart.value = { x: e.clientX - panX.value, y: e.clientY - panY.value }
    e.preventDefault()
    return
  }

  // Drawing interactions: Left (0) or Right (2) click
  if (e.button !== 0 && e.button !== 2) return

  const coords = getLogicalCoords(e)
  if (!coords) return

  isDrawing.value = true
  drawButton.value = e.button
  dragStart.value = coords
  lastLogical.value = coords

  // Capture snapshot before this stroke for undo history
  strokeSnapshot.value = cloneBuffer(props.modelValue)
  emit('strokeStart', strokeSnapshot.value)

  const isEraser = e.button === 2 || props.activeTool === 'eraser'
  const pixelValue = !isEraser

  if (props.activeTool === 'pencil' || props.activeTool === 'eraser') {
    setPixel(props.modelValue, coords.x, coords.y, pixelValue)
    renderBaseCanvas()
  } else if (props.activeTool === 'fill') {
    floodFill(props.modelValue, coords.x, coords.y, pixelValue)
    renderBaseCanvas()
    finishStroke()
  }
}

function onMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    panX.value = e.clientX - panStart.value.x
    panY.value = e.clientY - panStart.value.y
    return
  }

  const coords = getLogicalCoords(e)
  emit('cursorMove', coords)

  if (!isDrawing.value || !coords) return

  const isEraser = drawButton.value === 2 || props.activeTool === 'eraser'
  const pixelValue = !isEraser

  if (props.activeTool === 'pencil' || props.activeTool === 'eraser') {
    // Bresenham interpolation between last position and current position
    if (lastLogical.value) {
      drawLine(props.modelValue, lastLogical.value.x, lastLogical.value.y, coords.x, coords.y, pixelValue)
      renderBaseCanvas()
    }
    lastLogical.value = coords
  } else if (props.activeTool === 'line' && dragStart.value) {
    const pts = bresenhamPoints(dragStart.value.x, dragStart.value.y, coords.x, coords.y)
    renderGhostPreview(pts, pixelValue)
  } else if (props.activeTool === 'rectangle' && dragStart.value) {
    const pts = rectanglePoints(
      dragStart.value.x,
      dragStart.value.y,
      coords.x,
      coords.y,
      props.rectangleMode === 'filled'
    )
    renderGhostPreview(pts, pixelValue)
  }
}

function onMouseUp(e: MouseEvent) {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (!isDrawing.value) return

  const coords = getLogicalCoords(e) || lastLogical.value
  const isEraser = drawButton.value === 2 || props.activeTool === 'eraser'
  const pixelValue = !isEraser

  if (coords && dragStart.value) {
    if (props.activeTool === 'line') {
      drawLine(props.modelValue, dragStart.value.x, dragStart.value.y, coords.x, coords.y, pixelValue)
      renderBaseCanvas()
    } else if (props.activeTool === 'rectangle') {
      drawRectangle(
        props.modelValue,
        dragStart.value.x,
        dragStart.value.y,
        coords.x,
        coords.y,
        props.rectangleMode === 'filled',
        pixelValue
      )
      renderBaseCanvas()
    }
  }

  clearPreviewCanvas()
  finishStroke()
}

function onMouseLeave() {
  emit('cursorMove', null)
  if (isDrawing.value) {
    clearPreviewCanvas()
    finishStroke()
  }
}

function finishStroke() {
  isDrawing.value = false
  dragStart.value = null
  lastLogical.value = null
  strokeSnapshot.value = null
  emit('strokeEnd')
}

// -----------------------------------------------------------------------------
// Keyboard Space Navigation
// -----------------------------------------------------------------------------

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !e.repeat && !isSpacePressed.value) {
    isSpacePressed.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = false
    isPanning.value = false
  }
}

function centerCanvas() {
  panX.value = 0
  panY.value = 0
}

defineExpose({
  centerCanvas,
})

onMounted(() => {
  renderBaseCanvas()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div
    ref="viewportRef"
    class="canvas-viewport"
    :class="{ 'canvas-viewport--panning': isSpacePressed || isPanning }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @contextmenu.prevent
  >
    <div
      class="canvas-stage"
      :style="{
        transform: `translate(${panX}px, ${panY}px)`,
        width: `${canvasPixelWidth}px`,
        height: `${canvasPixelHeight}px`,
      }"
    >
      <!-- Base Canonical Framebuffer Canvas -->
      <canvas
        ref="baseCanvasRef"
        :width="CANVAS_WIDTH"
        :height="CANVAS_HEIGHT"
        class="pixel-layer"
      />

      <!-- Ghost Preview Layer (Line / Rect drag) -->
      <canvas
        ref="previewCanvasRef"
        :width="CANVAS_WIDTH"
        :height="CANVAS_HEIGHT"
        class="ghost-layer"
      />

      <!-- Pixel Grid Overlay -->
      <div
        v-if="showGrid && zoom >= 4"
        class="grid-layer"
        :style="{
          backgroundSize: `${zoom}px ${zoom}px`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.canvas-viewport {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #06090e;
  background-image: 
    radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    radial-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 32px 32px, 8px 8px;
  background-position: 0 0, 16px 16px;
  cursor: crosshair;
  user-select: none;
}

.canvas-viewport--panning {
  cursor: grab;
}

.canvas-viewport--panning:active {
  cursor: grabbing;
}

.canvas-stage {
  position: relative;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(56, 189, 248, 0.2);
  border-radius: 4px;
  transition: width 0.1s ease, height 0.1s ease;
}

.pixel-layer,
.ghost-layer,
.grid-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  pointer-events: none;
}

.pixel-layer {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  box-shadow: 0 0 30px rgba(56, 189, 248, 0.08);
}

.ghost-layer {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.grid-layer {
  background-image: linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  pointer-events: none;
}
</style>
