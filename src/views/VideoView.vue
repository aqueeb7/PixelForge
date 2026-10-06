<script setup lang="ts">
import { ref } from 'vue'
import { useVideoStore } from '../stores/video'
import { downloadFirmwareSketch } from '../services/videoExporter'
import { flashPixelforgeFirmware } from '../services/platform'
import VideoPreviewDisplay from '../components/video/VideoPreviewDisplay.vue'
import DitherControls from '../components/video/DitherControls.vue'
import VideoTimeline from '../components/video/VideoTimeline.vue'
import ThinkingOrb from '../components/common/ThinkingOrb.vue'

import { useDeviceStore } from '../stores/device'

const videoStore = useVideoStore()
const deviceStore = useDeviceStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const showExportMenu = ref<boolean>(false)

const isFlashingFirmware = ref<boolean>(false)
const flashProgressPercent = ref<number>(0)
const flashProgressStage = ref<string>('')
const flashToastMessage = ref<string>('')

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    videoStore.loadVideoFile(input.files[0])
  }
}

function handleExportCpp() {
  showExportMenu.value = false
  videoStore.exportCppHeader()
}

function handleExportBin() {
  showExportMenu.value = false
  videoStore.exportBinaryReel()
}

function handleDownloadArduino() {
  showExportMenu.value = false
  videoStore.exportStandaloneArduinoSketch()
}

async function handleCopyArduino() {
  showExportMenu.value = false
  await videoStore.copyStandaloneArduinoSketch()
}

function handleExportGif() {
  showExportMenu.value = false
  videoStore.exportAnimatedGif()
}

function handleUploadReel() {
  if (videoStore.isReelPlayingOnDevice) {
    videoStore.stopDeviceReelPlayback()
  } else {
    videoStore.uploadAndPlayOnDevice()
  }
}

async function handleFlashFirmware() {
  if (isFlashingFirmware.value) return
  isFlashingFirmware.value = true
  flashProgressPercent.value = 0
  flashProgressStage.value = 'Preparing ESP32 for flashing...'
  flashToastMessage.value = ''
  videoStore.errorMessage = ''

  const wasConnected = deviceStore.status === 'connected'
  const targetPort = deviceStore.selectedPort || undefined

  if (wasConnected) {
    flashProgressStage.value = 'Releasing COM port handle...'
    await deviceStore.disconnect()
    await new Promise((r) => setTimeout(r, 600))
  }

  try {
    await flashPixelforgeFirmware(targetPort, (progress) => {
      flashProgressPercent.value = progress.percent
      flashProgressStage.value = progress.stage
    })
    flashToastMessage.value = '⚡ ESP32 flashed & verified! You can now Upload & Play.'
    if (wasConnected && targetPort) {
      setTimeout(async () => {
        await deviceStore.connect(targetPort)
      }, 2000)
    }
    setTimeout(() => {
      flashToastMessage.value = ''
    }, 7000)
  } catch (err: any) {
    videoStore.errorMessage = `Firmware Flash Failed: ${err?.message || err}`
  } finally {
    isFlashingFirmware.value = false
  }
}

function handleDownloadFirmware() {
  showExportMenu.value = false
  downloadFirmwareSketch()
}
</script>

<template>
  <div class="video-studio">
    <!-- Top Action Toolbar (48px matching DrawView & HardwareView) -->
    <header class="video-toolbar">
      <!-- Left: Studio Identity & File Import -->
      <div class="toolbar-group toolbar-left">
        <span class="toolbar-icon">🎬</span>
        <h2 class="toolbar-title">Video Converter</h2>

        <div class="divider" />

        <!-- Import Button -->
        <button
          class="btn-action btn-import font-mono"
          title="Import video or GIF animation"
          @click="triggerFileInput"
        >
          📂 Import Video
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept="video/*,image/gif"
          class="hidden-input"
          @change="onFileSelect"
        />

        <!-- Active Video Metadata Pill -->
        <div v-if="videoStore.videoMeta" class="video-meta-pill font-mono">
          <span class="meta-name" :title="videoStore.videoMeta.filename">
            {{ videoStore.videoMeta.filename }}
          </span>
          <span class="meta-dot">•</span>
          <span>{{ videoStore.videoMeta.videoWidth }}×{{ videoStore.videoMeta.videoHeight }}</span>
          <span class="meta-dot">•</span>
          <span>{{ (videoStore.videoMeta.duration).toFixed(1) }}s</span>
          <template v-if="videoStore.activeReel">
            <span class="meta-dot">•</span>
            <span class="meta-frames">{{ videoStore.activeReel.frameCount }} frames @ {{ videoStore.activeReel.targetFps }} FPS</span>
          </template>
        </div>
      </div>

      <!-- Right: Action & Export Dropdown -->
      <div class="toolbar-group toolbar-right">
        <!-- Status Toast Banner -->
        <span v-if="flashToastMessage" class="status-msg flash-success font-mono">
          {{ flashToastMessage }}
        </span>
        <span v-else-if="videoStore.uploadStatusMessage" class="status-msg font-mono">
          {{ videoStore.uploadStatusMessage }}
        </span>
        <div v-else-if="videoStore.errorMessage" class="error-msg-container font-mono">
          <span class="error-msg">⚠️ {{ videoStore.errorMessage }}</span>
          <button
            v-if="videoStore.errorMessage.includes('firmware') || videoStore.errorMessage.includes('reel storage') || videoStore.errorMessage.includes('Arduino')"
            class="btn-quick-flash font-mono"
            :disabled="isFlashingFirmware"
            @click="handleFlashFirmware"
            title="Flash official PixelForge firmware directly to ESP32 in 1 click"
          >
            ⚡ Flash ESP32 Now
          </button>
          <button
            v-if="videoStore.errorMessage.includes('Arduino') || videoStore.errorMessage.includes('firmware')"
            class="btn-quick-copy font-mono"
            @click="handleCopyArduino"
            title="Copy standalone Arduino sketch directly to clipboard"
          >
            📋 Copy Arduino Sketch
          </button>
        </div>

        <!-- One-Click Upload to OLED (Autonomous Playback) -->
        <button
          class="btn-action btn-upload-oled font-mono"
          :class="{
            'is-uploading': videoStore.isUploadingReel,
            'is-playing': videoStore.isReelPlayingOnDevice,
            'is-stopping': videoStore.isStoppingReel,
          }"
          :disabled="!videoStore.isVideoLoaded || videoStore.isExtracting || videoStore.isUploadingReel || videoStore.isStoppingReel || isFlashingFirmware"
          title="Upload animation reel directly to ESP32 RAM for infinite repeat at 30 FPS with zero USB bottleneck"
          @click="handleUploadReel"
        >
          <span v-if="videoStore.isUploadingReel" class="inline-flex items-center gap-1.5">
            <ThinkingOrb state="weaving" :size="20" :speed="1.3" />
            <span>Uploading Reel…</span>
          </span>
          <span v-else-if="videoStore.isStoppingReel" class="inline-flex items-center gap-1.5">
            <ThinkingOrb state="breathing" :size="20" :speed="1.2" />
            <span>Stopping Loop…</span>
          </span>
          <span v-else-if="videoStore.isReelPlayingOnDevice">
            ⏹ Stop OLED Loop
          </span>
          <span v-else>
            ⚡ Upload & Play on OLED
          </span>
        </button>

        <!-- 1-Click Firmware Flash Button (always accessible) -->
        <button
          class="btn-action btn-firmware font-mono"
          :class="{ 'is-flashing': isFlashingFirmware }"
          :disabled="isFlashingFirmware || videoStore.isUploadingReel"
          title="1-Click flash bundled PixelForge firmware to your ESP32 via USB. Zero Arduino IDE required!"
          @click="handleFlashFirmware"
        >
          <span v-if="isFlashingFirmware" class="inline-flex items-center gap-1.5">
            <ThinkingOrb state="connecting" :size="20" :speed="1.3" />
            <span>Flashing ({{ flashProgressPercent }}%)</span>
          </span>
          <span v-else>
            ⚡ 1-Click Flash ESP32
          </span>
        </button>

        <!-- Export Dropdown -->
        <div class="export-dropdown-wrapper">
          <button
            class="btn-action btn-export font-mono"
            :disabled="!videoStore.isVideoLoaded || videoStore.isExtracting || isFlashingFirmware"
            @click="showExportMenu = !showExportMenu"
          >
            📦 Export Reel ▾
          </button>

          <div v-if="showExportMenu" class="export-menu font-mono">
            <button class="export-item" @click="handleCopyArduino">
              <span class="item-icon">📋</span>
              <div class="item-text">
                <span class="item-title">Copy Standalone Arduino Sketch</span>
                <span class="item-desc">One-click copy .ino to clipboard</span>
              </div>
            </button>

            <button class="export-item" @click="handleDownloadArduino">
              <span class="item-icon">⚡</span>
              <div class="item-text">
                <span class="item-title">Download Arduino Sketch (.ino)</span>
                <span class="item-desc">Ready to upload in Arduino IDE</span>
              </div>
            </button>

            <button class="export-item" @click="handleExportGif">
              <span class="item-icon">🎞️</span>
              <div class="item-text">
                <span class="item-title">Export Animated GIF (.gif)</span>
                <span class="item-desc">128×64 monochrome loop animation</span>
              </div>
            </button>

            <button class="export-item" @click="handleExportCpp">
              <span class="item-icon">💻</span>
              <div class="item-text">
                <span class="item-title">C/C++ PROGMEM Header (.h)</span>
                <span class="item-desc">For PlatformIO / ESP-IDF</span>
              </div>
            </button>

            <button class="export-item" @click="handleExportBin">
              <span class="item-icon">💾</span>
              <div class="item-text">
                <span class="item-title">Raw Binary Stream (.bin)</span>
                <span class="item-desc">For LittleFS / SPIFFS Storage</span>
              </div>
            </button>

            <div class="export-divider" />

            <button class="export-item" @click="handleDownloadFirmware">
              <span class="item-icon">🔧</span>
              <div class="item-text">
                <span class="item-title">Download Firmware Source (.ino)</span>
                <span class="item-desc">Inspect autonomous C++ source</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Workspace (Split View & Controls Sidebar) -->
    <main class="studio-body">
      <!-- Main Video Preview Viewport -->
      <section class="main-preview-pane">
        <VideoPreviewDisplay />
      </section>

      <!-- Right Dithering & Adjustments Sidebar -->
      <DitherControls />
    </main>

    <!-- Bottom Scrubbable Timeline Player -->
    <VideoTimeline />
  </div>
</template>

<style scoped>
.video-studio {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #080B11;
  overflow: hidden;
}

/* Top Toolbar */
.video-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  background: #0D1117;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  user-select: none;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toolbar-icon {
  font-size: 1.1rem;
}

.toolbar-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #F8FAFC;
  letter-spacing: 0.01em;
}

.divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
}

.btn-action {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-import {
  background: rgba(255, 255, 255, 0.06);
  color: #F8FAFC;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.btn-import:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.hidden-input {
  display: none;
}

/* Video Metadata Pill */
.video-meta-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.68rem;
  padding: 0.2rem 0.6rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  color: #94A3B8;
  max-width: 500px;
}

.meta-name {
  color: #38BDF8;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-dot {
  opacity: 0.4;
}

.meta-frames {
  color: #A78BFA;
  font-weight: 600;
}

.error-msg-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 500px;
}

.error-msg {
  font-size: 0.7rem;
  color: #F87171;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-quick-copy {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38BDF8;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-quick-copy:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: #38BDF8;
  transform: translateY(-1px);
}

.status-msg {
  font-size: 0.7rem;
  color: #10B981;
  background: rgba(16, 185, 129, 0.12);
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.btn-upload-oled {
  background: linear-gradient(135deg, #10B981, #059669);
  color: #FFFFFF;
  border: 1px solid rgba(16, 185, 129, 0.4);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
}

.btn-upload-oled:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.45);
}

.btn-upload-oled.is-playing {
  background: linear-gradient(135deg, #EF4444, #B91C1C);
  border-color: rgba(239, 68, 68, 0.4);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
}

.btn-upload-oled.is-stopping {
  background: linear-gradient(135deg, #78350F, #92400E);
  border-color: rgba(245, 158, 11, 0.4);
}

.btn-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-upload-oled:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Export Dropdown */
.export-dropdown-wrapper {
  position: relative;
}

.btn-export {
  background: linear-gradient(135deg, #0284C7, #0369A1);
  color: #FFFFFF;
  border: 1px solid rgba(56, 189, 248, 0.4);
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.35);
}

.btn-export:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.45);
}

.btn-export:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.btn-firmware {
  background: linear-gradient(135deg, #B45309, #92400E);
  color: #FEF3C7;
  border: 1px solid rgba(251, 191, 36, 0.5);
  box-shadow: 0 2px 8px rgba(180, 83, 9, 0.4);
}

.btn-firmware:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.5);
  background: linear-gradient(135deg, #D97706, #B45309);
}

.btn-firmware:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-firmware.is-flashing {
  background: linear-gradient(135deg, #D97706, #B45309);
  border-color: #FBBF24;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
}

.btn-quick-flash {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.6);
  color: #FCD34D;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-quick-flash:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.35);
  border-color: #F59E0B;
  transform: translateY(-1px);
}

.btn-quick-flash:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-msg.flash-success {
  color: #FCD34D;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.export-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0.25rem 0;
}

.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 260px;
  background: #0F172A;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  padding: 0.4rem;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.export-item {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.5rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.export-item:hover {
  background: rgba(56, 189, 248, 0.12);
}

.item-icon {
  font-size: 1.1rem;
  margin-top: 1px;
}

.item-text {
  display: flex;
  flex-direction: column;
}

.item-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: #F8FAFC;
}

.item-desc {
  font-size: 0.62rem;
  color: #64748B;
}

/* Studio Body */
.studio-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main-preview-pane {
  flex: 1;
  height: 100%;
  overflow: hidden;
}
</style>
