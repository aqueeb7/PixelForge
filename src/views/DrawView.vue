<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useCanvasHistory } from '../composables/useCanvasHistory'
import {
  invertBuffer,
  clearBuffer,
  cloneBuffer,
} from '../composables/usePixelDrawing'
import { useDeviceStore } from '../stores/device'
import DrawCanvas from '../components/DrawCanvas.vue'

type ToolType = 'pencil' | 'eraser' | 'line' | 'rectangle' | 'fill'
type RectMode = 'outline' | 'filled'

const deviceStore = useDeviceStore()

// Initialize history with existing activeFrame from store if available, or blank buffer
const {
  current: framebuffer,
  canUndo,
  canRedo,
  commitBeforeMutation,
  undo,
  redo,
} = useCanvasHistory(deviceStore.activeFrame || undefined)

const activeTool = ref<ToolType>('pencil')
const rectangleMode = ref<RectMode>('outline')
const zoom = ref<number>(8)
const showGrid = ref<boolean>(true)
const liveMirror = ref<boolean>(false)

const cursorCoords = ref<{ x: number; y: number } | null>(null)
const isSending = ref<boolean>(false)
const sendFeedback = ref<'idle' | 'success' | 'error'>('idle')
const canvasRef = ref<InstanceType<typeof DrawCanvas> | null>(null)

const zoomLevels = [1, 2, 4, 6, 8, 12, 16]

function zoomIn() {
  const idx = zoomLevels.indexOf(zoom.value)
  if (idx < zoomLevels.length - 1) {
    zoom.value = zoomLevels[idx + 1]
  }
}

function zoomOut() {
  const idx = zoomLevels.indexOf(zoom.value)
  if (idx > 0) {
    zoom.value = zoomLevels[idx - 1]
  }
}

// -----------------------------------------------------------------------------
// History Actions
// -----------------------------------------------------------------------------

function onStrokeStart(beforeSnapshot: Uint8Array) {
  commitBeforeMutation(beforeSnapshot)
}

function onStrokeEnd() {
  // Update device store active frame
  deviceStore.activeFrame = cloneBuffer(framebuffer.value)

  // If live mirror is enabled, push frame immediately to OLED
  if (liveMirror.value && deviceStore.status === 'connected') {
    pushToOled()
  }
}

function handleInvert() {
  commitBeforeMutation(framebuffer.value)
  invertBuffer(framebuffer.value)
  onStrokeEnd()
}

function handleClear() {
  commitBeforeMutation(framebuffer.value)
  clearBuffer(framebuffer.value)
  onStrokeEnd()
}

function handleUndo() {
  if (undo()) {
    onStrokeEnd()
  }
}

function handleRedo() {
  if (redo()) {
    onStrokeEnd()
  }
}

// -----------------------------------------------------------------------------
// Physical Display Sync
// -----------------------------------------------------------------------------

async function pushToOled() {
  if (deviceStore.status !== 'connected') return

  isSending.value = true
  sendFeedback.value = 'idle'
  try {
    await deviceStore.sendCurrentFrame(framebuffer.value)
    sendFeedback.value = 'success'
    setTimeout(() => {
      if (sendFeedback.value === 'success') sendFeedback.value = 'idle'
    }, 1500)
  } catch {
    sendFeedback.value = 'error'
  } finally {
    isSending.value = false
  }
}

// -----------------------------------------------------------------------------
// Keyboard Shortcuts
// -----------------------------------------------------------------------------

function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return
  }

  // Ctrl / Cmd shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
      e.preventDefault()
      return
    }
    if (e.key === 'y' || e.key === 'Y') {
      handleRedo()
      e.preventDefault()
      return
    }
  }

  // Single-key tool switches
  switch (e.key.toLowerCase()) {
    case 'p': activeTool.value = 'pencil'; break
    case 'e': activeTool.value = 'eraser'; break
    case 'l': activeTool.value = 'line'; break
    case 'r': activeTool.value = 'rectangle'; break
    case 'f': activeTool.value = 'fill'; break
    case 'i': handleInvert(); break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  // Auto-sync store active frame if already present
  if (!deviceStore.activeFrame) {
    deviceStore.activeFrame = cloneBuffer(framebuffer.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="draw-view">
    <!-- Top Action & Navigation Toolbar -->
    <header class="toolbar">
      <div class="toolbar-group">
        <button
          class="tool-btn"
          title="Undo (Ctrl+Z)"
          :disabled="!canUndo"
          @click="handleUndo"
        >
          ↩️ <span class="tool-label">Undo</span>
        </button>
        <button
          class="tool-btn"
          title="Redo (Ctrl+Y)"
          :disabled="!canRedo"
          @click="handleRedo"
        >
          ↪️ <span class="tool-label">Redo</span>
        </button>
      </div>

      <div class="toolbar-separator" />

      <div class="toolbar-group">
        <button class="tool-btn" title="Invert Canvas (I)" @click="handleInvert">
          ◐ <span class="tool-label">Invert</span>
        </button>
        <button class="tool-btn" title="Clear Canvas" @click="handleClear">
          🗑 <span class="tool-label">Clear</span>
        </button>
      </div>

      <div class="toolbar-separator" />

      <!-- Zoom & View Controls -->
      <div class="toolbar-group">
        <button class="tool-btn-compact" title="Zoom Out" :disabled="zoom <= 1" @click="zoomOut">−</button>
        <div class="zoom-dropdown">
          <select v-model.number="zoom" class="zoom-select">
            <option v-for="z in zoomLevels" :key="z" :value="z">{{ z }}×</option>
          </select>
        </div>
        <button class="tool-btn-compact" title="Zoom In" :disabled="zoom >= 16" @click="zoomIn">+</button>

        <button
          class="tool-btn"
          :class="{ 'tool-btn--active': showGrid }"
          title="Toggle Pixel Grid"
          @click="showGrid = !showGrid"
        >
          ▦ <span class="tool-label">Grid</span>
        </button>

        <button
          class="tool-btn"
          title="Reset Pan"
          @click="canvasRef?.centerCanvas()"
        >
          🎯 <span class="tool-label">Center</span>
        </button>
      </div>

      <!-- Physical OLED Sync Group (Right Side) -->
      <div class="toolbar-group toolbar-group--right">
        <!-- Live Mirror Toggle -->
        <label
          class="mirror-toggle"
          :class="{ 'mirror-toggle--active': liveMirror && deviceStore.status === 'connected' }"
          title="Automatically stream canvas changes to the OLED upon stroke completion"
        >
          <input
            type="checkbox"
            v-model="liveMirror"
            :disabled="deviceStore.status !== 'connected'"
          />
          <span class="mirror-indicator" />
          <span class="mirror-label">Live Mirror</span>
        </label>

        <!-- Send to Display Button -->
        <button
          class="btn btn--send"
          :class="{
            'btn--sending': isSending,
            'btn--sent': sendFeedback === 'success',
            'btn--error': sendFeedback === 'error',
          }"
          :disabled="deviceStore.status !== 'connected' || isSending"
          @click="pushToOled"
        >
          <span v-if="isSending">⚡ Sending…</span>
          <span v-else-if="sendFeedback === 'success'">✓ Sent</span>
          <span v-else-if="sendFeedback === 'error'">✕ Error</span>
          <span v-else>🚀 Send to Display</span>
        </button>

        <!-- Connection Status Pill -->
        <router-link to="/devices" class="device-pill" :class="'device-pill--' + deviceStore.status">
          <span class="status-dot" />
          <span>{{ deviceStore.status === 'connected' ? (deviceStore.selectedPort || 'ESP32') : 'No Device' }}</span>
        </router-link>
      </div>
    </header>

    <!-- Main Workspace Layout -->
    <div class="workspace">
      <!-- Left Tool Palette -->
      <aside class="tool-palette">
        <button
          class="palette-btn"
          :class="{ 'palette-btn--active': activeTool === 'pencil' }"
          title="Pencil (P)"
          @click="activeTool = 'pencil'"
        >
          <span class="palette-icon">✏️</span>
          <span class="palette-title">Pencil</span>
        </button>

        <button
          class="palette-btn"
          :class="{ 'palette-btn--active': activeTool === 'eraser' }"
          title="Eraser (E) — Right-click also erases"
          @click="activeTool = 'eraser'"
        >
          <span class="palette-icon">🧹</span>
          <span class="palette-title">Eraser</span>
        </button>

        <button
          class="palette-btn"
          :class="{ 'palette-btn--active': activeTool === 'line' }"
          title="Straight Line (L)"
          @click="activeTool = 'line'"
        >
          <span class="palette-icon">📏</span>
          <span class="palette-title">Line</span>
        </button>

        <div class="tool-with-options">
          <button
            class="palette-btn"
            :class="{ 'palette-btn--active': activeTool === 'rectangle' }"
            title="Rectangle (R)"
            @click="activeTool = 'rectangle'"
          >
            <span class="palette-icon">▭</span>
            <span class="palette-title">Rect</span>
          </button>

          <!-- Rectangle Mode Toggle (when rect tool active) -->
          <div v-if="activeTool === 'rectangle'" class="rect-options">
            <button
              class="subtool-btn"
              :class="{ 'subtool-btn--active': rectangleMode === 'outline' }"
              title="Outline Rectangle"
              @click="rectangleMode = 'outline'"
            >
              Outline
            </button>
            <button
              class="subtool-btn"
              :class="{ 'subtool-btn--active': rectangleMode === 'filled' }"
              title="Filled Rectangle"
              @click="rectangleMode = 'filled'"
            >
              Filled
            </button>
          </div>
        </div>

        <button
          class="palette-btn"
          :class="{ 'palette-btn--active': activeTool === 'fill' }"
          title="Bucket Fill (F)"
          @click="activeTool = 'fill'"
        >
          <span class="palette-icon">🪣</span>
          <span class="palette-title">Fill</span>
        </button>
      </aside>

      <!-- Central Interactive Viewport -->
      <main class="canvas-area">
        <DrawCanvas
          ref="canvasRef"
          v-model="framebuffer"
          :active-tool="activeTool"
          :rectangle-mode="rectangleMode"
          :zoom="zoom"
          :show-grid="showGrid"
          @stroke-start="onStrokeStart"
          @stroke-end="onStrokeEnd"
          @cursor-move="coords => cursorCoords = coords"
        />
      </main>
    </div>

    <!-- Bottom Coordinate & Dimension Status Footer -->
    <footer class="canvas-footer">
      <div class="footer-left">
        <span class="footer-meta">Canvas: <strong>128 × 64</strong> (1-bit monochrome • 1024 Bytes)</span>
        <span class="footer-divider">|</span>
        <span class="footer-meta">Active Tool: <strong class="capitalize">{{ activeTool }}</strong></span>
      </div>

      <div class="footer-right">
        <span class="coord-tag">
          X: <strong class="coord-val">{{ cursorCoords ? cursorCoords.x : '--' }}</strong>
          Y: <strong class="coord-val">{{ cursorCoords ? cursorCoords.y : '--' }}</strong>
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.draw-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--color-bg-base);
}

/* Top Toolbar */
.toolbar {
  height: 48px;
  min-height: 48px;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  z-index: 10;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.toolbar-group--right {
  margin-left: auto;
  gap: 0.75rem;
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background-color: var(--color-border-subtle);
  margin: 0 0.25rem;
}

.tool-btn,
.tool-btn-compact {
  background: none;
  border: 1px solid transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover:not(:disabled),
.tool-btn-compact:hover:not(:disabled) {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border-color: var(--color-border-subtle);
}

.tool-btn:disabled,
.tool-btn-compact:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tool-btn--active {
  background-color: var(--color-accent-dim);
  color: var(--color-accent-hover);
  border-color: rgba(124, 111, 255, 0.4);
}

.tool-btn-compact {
  padding: 0.3rem 0.5rem;
  font-weight: 700;
}

.zoom-select {
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  font-size: 0.78rem;
  outline: none;
}

/* Send & Mirror actions */
.mirror-toggle {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-base);
  transition: all 0.15s ease;
}

.mirror-toggle input {
  display: none;
}

.mirror-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
  transition: all 0.2s ease;
}

.mirror-toggle--active {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.1);
}

.mirror-toggle--active .mirror-indicator {
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
}

.btn--send {
  background: linear-gradient(135deg, #7c6fff, #6366f1);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  transition: all 0.15s ease;
}

.btn--send:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn--send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.btn--sent {
  background: #10b981 !important;
}

.btn--error {
  background: #ef4444 !important;
}

.device-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  text-decoration: none;
}

.device-pill--connected {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.device-pill--disconnected {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Main Workspace */
.workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* Left Tool Palette */
.tool-palette {
  width: 68px;
  background-color: var(--color-bg-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0.4rem;
  gap: 0.5rem;
  z-index: 5;
}

.palette-btn {
  width: 52px;
  height: 52px;
  background: none;
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--color-text-secondary);
}

.palette-btn:hover {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.palette-btn--active {
  background-color: var(--color-accent-dim) !important;
  color: var(--color-accent-hover) !important;
  border-color: rgba(124, 111, 255, 0.4);
}

.palette-icon {
  font-size: 1.25rem;
}

.palette-title {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tool-with-options {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
}

.rect-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 52px;
}

.subtool-btn {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 600;
  padding: 0.2rem 0.3rem;
  color: var(--color-text-muted);
  cursor: pointer;
}

.subtool-btn--active {
  background: rgba(124, 111, 255, 0.2);
  color: #c4b5fd;
  border-color: var(--color-accent);
}

/* Central Canvas Area */
.canvas-area {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* Bottom Footer */
.canvas-footer {
  height: 28px;
  min-height: 28px;
  background-color: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.footer-divider {
  color: var(--color-border-subtle);
}

.coord-tag {
  font-family: monospace;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-subtle);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.coord-val {
  color: #38bdf8;
}

.capitalize {
  text-transform: capitalize;
}
</style>
