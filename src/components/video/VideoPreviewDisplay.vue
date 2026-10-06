<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useVideoStore } from '../../stores/video'
import { CANVAS_WIDTH, CANVAS_HEIGHT, unpackCanonicalBitmap } from '../../services/ditherEngine'
import ThinkingOrb from '../common/ThinkingOrb.vue'

const videoStore = useVideoStore()

const oledCanvasRef = ref<HTMLCanvasElement | null>(null)
const sourceCanvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

const zoom = ref<number>(4)
const showGrid = ref<boolean>(true)
const showGlow = ref<boolean>(true)
const viewMode = ref<'split' | 'dithered' | 'source'>('split')
const splitPercent = ref<number>(50)
const isDraggingSplit = ref<boolean>(false)

// Zoom levels
const zoomOptions = [1, 2, 3, 4, 6]

// Render the 128x64 dithered bitmap to canvas
function renderDitheredCanvas() {
  if (!oledCanvasRef.value) return
  const ctx = oledCanvasRef.value.getContext('2d')
  if (!ctx) return

  const imgData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT)
  // Render phosphor cyan/white pixels on deep black
  unpackCanonicalBitmap(
    videoStore.currentPackedFrame,
    imgData,
    [56, 189, 248], // Sky cyan phosphor #38BDF8
    [7, 10, 16] // Deep OLED black
  )
  ctx.putImageData(imgData, 0, 0)
}

// Render source video frame to source canvas
function renderSourceCanvas() {
  if (!sourceCanvasRef.value) return
  const ctx = sourceCanvasRef.value.getContext('2d')
  if (!ctx) return

  if (videoStore.currentSourceImageData) {
    ctx.putImageData(videoStore.currentSourceImageData, 0, 0)
  } else {
    ctx.fillStyle = '#070A10'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }
}

// Watch packed frame changes
watch(
  () => [videoStore.currentPackedFrame, videoStore.currentSourceImageData],
  () => {
    renderDitheredCanvas()
    renderSourceCanvas()
  },
  { deep: true }
)

onMounted(() => {
  renderDitheredCanvas()
  renderSourceCanvas()
})

// Split Slider Mouse Interactions
function onSplitMouseDown(e: MouseEvent) {
  isDraggingSplit.value = true
  updateSplitPosition(e)
  window.addEventListener('mousemove', onSplitMouseMove)
  window.addEventListener('mouseup', onSplitMouseUp)
}

function onSplitMouseMove(e: MouseEvent) {
  if (!isDraggingSplit.value) return
  updateSplitPosition(e)
}

function onSplitMouseUp() {
  isDraggingSplit.value = false
  window.removeEventListener('mousemove', onSplitMouseMove)
  window.removeEventListener('mouseup', onSplitMouseUp)
}

function updateSplitPosition(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
  splitPercent.value = Math.round(pct)
}

// File drop handling
const isDragOver = ref<boolean>(false)
function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}
function onDragLeave() {
  isDragOver.value = false
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    videoStore.loadVideoFile(e.dataTransfer.files[0])
  }
}
function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    videoStore.loadVideoFile(input.files[0])
  }
}
</script>

<template>
  <div class="video-preview-display">
    <!-- Top Display Header & Zoom Bar -->
    <div class="preview-header">
      <div class="header-left font-mono">
        <span class="preview-title">📺 128×64 OLED Dither Viewport</span>
        <span v-if="videoStore.isVideoLoaded" class="badge-fps">
          {{ videoStore.settings.targetFps }} FPS
        </span>
        <span v-if="videoStore.isExtracting" class="badge-extracting inline-flex items-center gap-1.5">
          <ThinkingOrb state="weaving" :size="20" :speed="1.3" />
          <span>Extracting ({{ videoStore.extractionProgress.percent }}%)</span>
        </span>
      </div>

      <div class="header-right font-mono">
        <!-- View Mode Switcher -->
        <div class="segmented-control">
          <button
            class="seg-btn"
            :class="{ active: viewMode === 'split' }"
            title="Split view (Source vs 1-bit Dither)"
            @click="viewMode = 'split'"
          >
            Split
          </button>
          <button
            class="seg-btn"
            :class="{ active: viewMode === 'dithered' }"
            title="1-bit Dithered OLED display only"
            @click="viewMode = 'dithered'"
          >
            1-Bit OLED
          </button>
          <button
            class="seg-btn"
            :class="{ active: viewMode === 'source' }"
            title="Source video frame only"
            @click="viewMode = 'source'"
          >
            Source
          </button>
        </div>

        <div class="divider" />

        <!-- Grid Toggle -->
        <button
          class="btn-tool"
          :class="{ active: showGrid }"
          title="Toggle pixel grid lines"
          @click="showGrid = !showGrid"
        >
          #
        </button>

        <!-- Glow Toggle -->
        <button
          class="btn-tool"
          :class="{ active: showGlow }"
          title="Toggle OLED phosphor glow simulation"
          @click="showGlow = !showGlow"
        >
          ✨
        </button>

        <!-- Zoom Selector -->
        <div class="zoom-selector">
          <button
            v-for="z in zoomOptions"
            :key="z"
            class="zoom-btn"
            :class="{ active: zoom === z }"
            @click="zoom = z"
          >
            {{ z }}x
          </button>
        </div>
      </div>
    </div>

    <!-- Main Viewport Canvas Workspace -->
    <div
      class="viewport-stage"
      :class="{ 'drag-over': isDragOver }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- State 1: Drop Zone when no video loaded -->
      <div v-if="!videoStore.isVideoLoaded" class="empty-dropzone">
        <div class="drop-icon">🎬</div>
        <h3 class="drop-title">Drop Video or Animation Clip Here</h3>
        <p class="drop-subtitle font-mono">
          Supports MP4, WebM, GIF, MOV • Real-time 128×64 1-bit dithering
        </p>

        <label class="btn-import-file">
          <input
            type="file"
            accept="video/*,image/gif"
            class="hidden-input"
            @change="onFileSelect"
          />
          📂 Browse Video File
        </label>
      </div>

      <!-- State 2: Active OLED Simulation Display -->
      <div
        v-else
        ref="containerRef"
        class="oled-chassis"
        :class="{ 'has-glow': showGlow }"
        :style="{
          width: `${128 * zoom}px`,
          height: `${64 * zoom}px`,
        }"
      >
        <!-- 1. Source Video Canvas (Underneath) -->
        <canvas
          ref="sourceCanvasRef"
          width="128"
          height="64"
          class="preview-canvas source-canvas"
          :style="{
            width: `${128 * zoom}px`,
            height: `${64 * zoom}px`,
            display: viewMode === 'dithered' ? 'none' : 'block',
          }"
        />

        <!-- 2. Dithered 1-Bit OLED Canvas (Clipped on top in split mode) -->
        <div
          class="dither-clip-wrapper"
          :style="{
            width: viewMode === 'split' ? `${splitPercent}%` : '100%',
            display: viewMode === 'source' ? 'none' : 'block',
          }"
        >
          <canvas
            ref="oledCanvasRef"
            width="128"
            height="64"
            class="preview-canvas dither-canvas"
            :style="{
              width: `${128 * zoom}px`,
              height: `${64 * zoom}px`,
            }"
          />
        </div>

        <!-- 3. Authentic OLED Pixel Grid Overlay -->
        <div
          v-if="showGrid && zoom >= 3"
          class="pixel-grid-overlay"
          :style="{
            backgroundSize: `${zoom}px ${zoom}px`,
          }"
        />

        <!-- 4. Interactive Split Handle (only in split view mode) -->
        <div
          v-if="viewMode === 'split'"
          class="split-slider-line"
          :style="{ left: `${splitPercent}%` }"
          @mousedown="onSplitMouseDown"
        >
          <div class="split-thumb font-mono">
            <span class="thumb-arrow">◀</span>
            <span class="thumb-pct">{{ splitPercent }}%</span>
            <span class="thumb-arrow">▶</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-preview-display {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #080B11;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
}

.preview-header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  background: rgba(13, 17, 23, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.preview-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #94A3B8;
  letter-spacing: 0.03em;
}

.badge-fps {
  font-size: 0.7rem;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.12);
  color: #38BDF8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.badge-extracting {
  font-size: 0.7rem;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
  background: rgba(234, 179, 8, 0.15);
  color: #EAB308;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.segmented-control {
  display: flex;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px;
}

.seg-btn {
  font-size: 0.7rem;
  padding: 0.2rem 0.55rem;
  background: transparent;
  color: #94A3B8;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.seg-btn.active {
  background: rgba(56, 189, 248, 0.2);
  color: #38BDF8;
  font-weight: 600;
}

.divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.1);
}

.btn-tool {
  font-size: 0.75rem;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  color: #64748B;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-tool.active {
  background: rgba(56, 189, 248, 0.15);
  color: #38BDF8;
  border-color: rgba(56, 189, 248, 0.3);
}

.zoom-selector {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  overflow: hidden;
}

.zoom-btn {
  font-size: 0.68rem;
  padding: 0.2rem 0.4rem;
  background: transparent;
  color: #64748B;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.zoom-btn.active {
  background: #1E293B;
  color: #F8FAFC;
  font-weight: bold;
}

.viewport-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: auto;
  padding: 2rem;
  background: radial-gradient(circle at center, #0F172A 0%, #05080E 100%);
}

.viewport-stage.drag-over {
  background: radial-gradient(circle at center, rgba(56, 189, 248, 0.12) 0%, #05080E 100%);
  outline: 2px dashed #38BDF8;
  outline-offset: -12px;
}

/* Empty Drop Zone */
.empty-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 440px;
  padding: 2.5rem 2rem;
  border: 2px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.4);
}

.drop-icon {
  font-size: 3rem;
  margin-bottom: 0.85rem;
}

.drop-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #F8FAFC;
  margin-bottom: 0.4rem;
}

.drop-subtitle {
  font-size: 0.75rem;
  color: #64748B;
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.btn-import-file {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.4rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0284C7, #0369A1);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
  transition: all 0.2s;
}

.btn-import-file:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(2, 132, 199, 0.45);
}

.hidden-input {
  display: none;
}

/* OLED Physical Chassis */
.oled-chassis {
  position: relative;
  background: #000000;
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
  transition: box-shadow 0.3s ease;
}

.oled-chassis.has-glow {
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.9), 0 0 30px rgba(56, 189, 248, 0.25), 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.preview-canvas {
  position: absolute;
  top: 0;
  left: 0;
  image-rendering: pixelated;
}

.dither-clip-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  overflow: hidden;
  z-index: 2;
}

.pixel-grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(to right, rgba(0, 0, 0, 0.45) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.45) 1px, transparent 1px);
  z-index: 3;
}

/* Split Slider Handle */
.split-slider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #38BDF8;
  cursor: ew-resize;
  z-index: 10;
  transform: translateX(-50%);
  box-shadow: 0 0 10px #38BDF8;
}

.split-thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: #0F172A;
  border: 1px solid #38BDF8;
  border-radius: 10px;
  color: #38BDF8;
  font-size: 0.65rem;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  user-select: none;
}

.thumb-arrow {
  font-size: 0.55rem;
  opacity: 0.75;
}
</style>
