<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFlasherStore } from '../../stores/flasher'
import { useDeviceStore } from '../../stores/device'

const flasherStore = useFlasherStore()
const deviceStore = useDeviceStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isFlashing = computed(() => ['connecting', 'erasing', 'writing', 'verifying'].includes(flasherStore.flashState.status))

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    flasherStore.loadCustomFile(target.files[0])
  }
}

function handleFlashOfficial() {
  flasherStore.flashOfficial(deviceStore.selectedPort)
}

function handleFlashCustom() {
  flasherStore.flashCustom(deviceStore.selectedPort)
}

function handleErase() {
  if (confirm('Are you sure you want to completely erase the ESP32 flash memory? This will delete all code and stored WiFi/NVS data.')) {
    flasherStore.erase(deviceStore.selectedPort)
  }
}
</script>

<template>
  <div class="firmware-flasher-container">
    <div class="flasher-header">
      <div class="header-left">
        <span class="icon">⚡</span>
        <h3 class="title">ESP32 Firmware Flasher & Provisioner</h3>
      </div>
      <span class="header-target font-mono">
        Target Port: {{ deviceStore.selectedPort || 'None selected' }}
      </span>
    </div>

    <!-- Progress Notification Strip (visible when active or done/error) -->
    <div
      v-if="flasherStore.flashState.status !== 'idle'"
      class="flash-progress-strip"
      :class="`status-${flasherStore.flashState.status}`"
    >
      <div class="progress-info-row">
        <span class="progress-stage font-mono">{{ flasherStore.flashState.stage }}</span>
        <span class="progress-pct font-mono">{{ flasherStore.flashState.progress }}%</span>
      </div>
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${flasherStore.flashState.progress}%` }"
        />
      </div>
      <div v-if="flasherStore.flashState.speedKbs > 0" class="progress-sub font-mono">
        Write Speed: {{ flasherStore.flashState.speedKbs.toFixed(1) }} kB/s
      </div>
      <div v-if="flasherStore.flashState.errorMessage" class="error-detail">
        ⚠️ {{ flasherStore.flashState.errorMessage }}
      </div>
    </div>

    <div class="flasher-grid">
      <!-- Left Card: 1-Click Official Firmware -->
      <div class="card flash-card">
        <div class="card-top">
          <span class="badge-official">RECOMMENDED</span>
          <h4 class="card-heading">1-Click PixelForge Runtime</h4>
          <p class="card-desc">
            Instantly flash the official PixelForge runtime firmware onto a fresh ESP32 board.
            Zero toolchains or Arduino IDE needed.
          </p>
        </div>

        <div class="card-specs">
          <div class="spec-row">
            <span>Target Memory Offset:</span>
            <span class="font-mono">0x10000 (App)</span>
          </div>
          <div class="spec-row">
            <span>Display Driver:</span>
            <span class="font-mono">SH1106 / SSD1306 (U8g2)</span>
          </div>
        </div>

        <button
          class="btn-action btn-flash-primary"
          :disabled="isFlashing || !deviceStore.selectedPort"
          @click="handleFlashOfficial"
        >
          <span v-if="isFlashing">Flashing...</span>
          <span v-else>⚡ Flash PixelForge Runtime</span>
        </button>
      </div>

      <!-- Right Card: Custom Binary Picker -->
      <div class="card flash-card">
        <div class="card-top">
          <span class="badge-custom">DEVELOPER</span>
          <h4 class="card-heading">Custom Binary (.bin)</h4>
          <p class="card-desc">
            Upload custom compiled ESP-IDF or Arduino firmware directly with configurable target address.
          </p>
        </div>

        <div class="file-picker-section">
          <input
            ref="fileInputRef"
            type="file"
            accept=".bin"
            class="hidden-file-input"
            @change="onFileSelected"
          />
          <div
            class="file-drop-zone"
            :class="{ 'file-selected': flasherStore.customFileName }"
            @click="fileInputRef?.click()"
          >
            <span class="drop-icon">📁</span>
            <span v-if="flasherStore.customFileName" class="file-name font-mono">
              {{ flasherStore.customFileName }}
            </span>
            <span v-else class="drop-text">Click to browse for .bin binary</span>
          </div>
        </div>

        <div class="offset-selector-row">
          <label class="offset-label" for="offset-select">Target Flash Offset:</label>
          <select id="offset-select" v-model.number="flasherStore.targetOffset" class="offset-select font-mono">
            <option :value="0x10000">0x10000 (Application Partition)</option>
            <option :value="0x1000">0x1000 (Bootloader)</option>
            <option :value="0x8000">0x8000 (Partition Table)</option>
            <option :value="0x0">0x0 (Full Raw ROM)</option>
          </select>
        </div>

        <div class="dual-actions">
          <button
            class="btn-action btn-flash-custom"
            :disabled="isFlashing || !flasherStore.customFileBytes || !deviceStore.selectedPort"
            @click="handleFlashCustom"
          >
            Upload Custom .bin
          </button>
          <button
            class="btn-action btn-erase"
            :disabled="isFlashing || !deviceStore.selectedPort"
            title="Wipe entire SPI flash"
            @click="handleErase"
          >
            Erase Flash
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.firmware-flasher-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}

.flasher-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.title {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.header-target {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

/* Progress Notification Strip */
.flash-progress-strip {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.status-writing,
.status-connecting,
.status-erasing {
  border-color: rgba(124, 111, 255, 0.4);
  background: rgba(124, 111, 255, 0.05);
}

.status-done {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.08);
}

.status-error {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
}

.progress-info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.progress-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), #38bdf8);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.progress-sub {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.error-detail {
  font-size: 0.75rem;
  color: #f87171;
  font-weight: 600;
}

/* Flash Cards Grid */
.flasher-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.flash-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.badge-official {
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  padding: 2px 6px;
  border-radius: 4px;
}

.badge-custom {
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(124, 111, 255, 0.2);
  color: var(--color-accent);
  padding: 2px 6px;
  border-radius: 4px;
}

.card-heading {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0.4rem 0 0.25rem;
}

.card-desc {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin: 0;
}

.card-specs {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  font-size: 0.75rem;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-muted);
}

.spec-row .font-mono {
  color: var(--color-text-primary);
  font-weight: 600;
}

.btn-action {
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0.55rem 1rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-flash-primary {
  background: var(--color-accent);
  color: white;
  margin-top: auto;
}

.btn-flash-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

/* Custom File Section */
.hidden-file-input {
  display: none;
}

.file-drop-zone {
  border: 2px dashed var(--color-border);
  border-radius: 6px;
  padding: 1rem;
  text-align: center;
  cursor: pointer;
  background: var(--color-bg-base);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  transition: all 0.15s ease;
}

.file-drop-zone:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-elevated);
}

.drop-icon {
  font-size: 1.3rem;
}

.drop-text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.file-name {
  font-size: 0.78rem;
  font-weight: 700;
  color: #38bdf8;
}

.offset-selector-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.offset-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.offset-select {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  font-size: 0.78rem;
}

.dual-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  margin-top: auto;
}

.btn-flash-custom {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.btn-flash-custom:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.btn-erase {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.btn-erase:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

.font-mono {
  font-family: monospace;
}
</style>
