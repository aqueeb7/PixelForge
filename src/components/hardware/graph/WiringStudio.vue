<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWiringStore } from '../../../stores/wiring'
import WiringCanvas from './WiringCanvas.vue'
import LinterHUD from './LinterHUD.vue'
import ComponentPaletteModal from './ComponentPaletteModal.vue'
import CppHeaderModal from './CppHeaderModal.vue'
import HardwareDossierDrawer from './HardwareDossierDrawer.vue'

const wiringStore = useWiringStore()

const showPaletteModal = ref(false)
const showCodeModal = ref(false)
const selectedPreset = ref<string>('oled_default')

onMounted(() => {
  wiringStore.init()
})

function handlePresetChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const val = target.value as 'oled_default' | 'reel_station' | 'dual_oled' | 'blank'
  wiringStore.applyPreset(val)
  selectedPreset.value = val
}

function handleZoomIn() {
  wiringStore.zoom = Number(Math.min(2.0, wiringStore.zoom + 0.15).toFixed(2))
}

function handleZoomOut() {
  wiringStore.zoom = Number(Math.max(0.5, wiringStore.zoom - 0.15).toFixed(2))
}

function handleResetView() {
  wiringStore.zoom = 1
  wiringStore.panOffset = { x: 0, y: 0 }
}
</script>

<template>
  <div class="wiring-studio-root">
    <!-- Studio Sub-Toolbar -->
    <header class="wiring-sub-toolbar">
      <!-- Left: Component Placement & Presets -->
      <div class="toolbar-sub-group">
        <button
          class="btn-studio-action btn-add font-mono"
          title="Open component catalog to add peripherals"
          @click="showPaletteModal = true"
        >
          ➕ Add Peripheral
        </button>

        <!-- Circuit Presets Dropdown -->
        <div class="preset-selector-wrapper">
          <label class="preset-label font-mono">Template:</label>
          <select
            class="clean-select preset-select font-mono"
            :value="selectedPreset"
            @change="handlePresetChange"
          >
            <option value="oled_default">⚡ 128×64 OLED Workstation</option>
            <option value="reel_station">🎛️ Reel Station (OLED + EC11 Encoder)</option>
            <option value="dual_oled">📟 Dual Display HUD (0x3C & 0x3D)</option>
            <option value="blank">🧹 Blank Breadboard</option>
          </select>
        </div>
      </div>

      <!-- Center: Zoom Controls & Center Button -->
      <div class="toolbar-sub-group">
        <div class="zoom-controls">
          <button class="btn-zoom" title="Zoom Out" @click="handleZoomOut">−</button>
          <button class="btn-zoom-val font-mono" title="Reset View Scale" @click="handleResetView">
            {{ Math.round(wiringStore.zoom * 100) }}%
          </button>
          <button class="btn-zoom" title="Zoom In" @click="handleZoomIn">+</button>
        </div>
        <button class="btn-reset-view font-mono" title="Center breadboard view" @click="handleResetView">
          🎯 Center
        </button>
      </div>

      <!-- Right: Board Dossier / Pinout Drawer Toggle & Firmware Code Generator -->
      <div class="toolbar-sub-group">
        <button
          class="btn-studio-action btn-board-info font-mono"
          :class="{ 'btn-board-info--active': wiringStore.activeDrawer === 'board' }"
          title="Toggle MCU Silicon & Pinout Matrix (Slide Drawer)"
          @click="wiringStore.activeDrawer === 'board' ? wiringStore.closeDrawer() : wiringStore.openBoardDossier()"
        >
          📌 MCU Pinout & Dossier
        </button>
        <button
          class="btn-studio-action btn-header-code font-mono"
          title="View and export auto-generated C++ pinout.h header"
          @click="showCodeModal = true"
        >
          📄 pinout.h
        </button>
      </div>
    </header>

    <!-- Main Breadboard & Wiring Graph Canvas Area -->
    <main class="studio-canvas-area">
      <WiringCanvas />
      <!-- Real-Time Electrical Linter HUD -->
      <LinterHUD />
      <!-- Floating Interactive Hardware Dossier (Slides in on Click from Right) -->
      <HardwareDossierDrawer />
    </main>

    <!-- Modals -->
    <ComponentPaletteModal
      v-if="showPaletteModal"
      @close="showPaletteModal = false"
    />

    <CppHeaderModal
      v-if="showCodeModal"
      @close="showCodeModal = false"
    />
  </div>
</template>

<style scoped>
.wiring-studio-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-bg-base);
}

/* Studio Sub-Toolbar */
.wiring-sub-toolbar {
  height: 40px;
  min-height: 40px;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  z-index: 10;
  flex-shrink: 0;
}

.toolbar-sub-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn-studio-action {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.3rem 0.65rem;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-add {
  background-color: var(--color-accent);
  color: #fff;
  border: none;
}

.btn-add:hover {
  background-color: var(--color-accent-hover);
}

.btn-board-info {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.btn-board-info:hover {
  background-color: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn-board-info--active {
  background-color: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
}

.preset-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 0.15rem 0.5rem;
}

.preset-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.clean-select {
  background: none;
  border: none;
  color: var(--color-text-primary);
  font-size: 0.72rem;
  outline: none;
  cursor: pointer;
}

.clean-select option {
  background-color: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.zoom-controls {
  display: flex;
  align-items: center;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  overflow: hidden;
}

.btn-zoom {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}

.btn-zoom:hover {
  background-color: var(--color-border);
  color: var(--color-text-primary);
}

.btn-zoom-val {
  background: none;
  border: none;
  color: var(--color-text-primary);
  font-size: 0.7rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
}

.btn-reset-view {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  padding: 0.3rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-reset-view:hover {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.btn-header-code {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: #38bdf8;
}

.btn-header-code:hover {
  background-color: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
}

.studio-canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.font-mono {
  font-family: monospace;
}
</style>
