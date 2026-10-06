<script setup lang="ts">
import { useVideoStore } from '../../stores/video'
import type { AlgorithmInfo, DitherAlgorithm, FitMode } from '../../types/video'

const videoStore = useVideoStore()

const algorithms: AlgorithmInfo[] = [
  {
    id: 'atkinson',
    name: 'Atkinson',
    tagline: 'Mac 1984 Classic',
    badge: '★ Best for Faces/Anime',
    description: 'Discards 25% error to create punchy highlights and clean blacks.',
    bestFor: 'High contrast videos, anime, portraits, pixel art.',
  },
  {
    id: 'floyd-steinberg',
    name: 'Floyd-Steinberg',
    tagline: 'Smooth Diffusion',
    badge: 'Photorealistic',
    description: '100% error conservation for silky smooth gradients.',
    bestFor: 'Nature, landscapes, subtle shading.',
  },
  {
    id: 'bayer4',
    name: 'Bayer 4×4',
    tagline: 'Retro Crosshatch',
    badge: 'Zero Swimming',
    description: 'Ordered matrix with zero temporal grain swimming on moving video.',
    bestFor: 'Retro Game Boy aesthetic, high-motion footage.',
  },
  {
    id: 'bayer8',
    name: 'Bayer 8×8',
    tagline: 'Fine Bayer Grid',
    badge: 'Dense Matrix',
    description: 'Finer ordered pattern providing high detail without temporal boiling.',
    bestFor: 'Detailed textures, UI animations.',
  },
  {
    id: 'burkes',
    name: 'Burkes',
    tagline: 'Fine Diffusion',
    badge: 'Sharp Gradients',
    description: '7-pixel diffusion filter creating crisp midtone transitions.',
    bestFor: 'Graphic art, 3D renders.',
  },
  {
    id: 'threshold',
    name: 'Adaptive Otsu',
    tagline: 'Stark Silhouette',
    badge: 'Pure B&W',
    description: 'Calculates optimal bimodal split with zero diffusion noise.',
    bestFor: 'Logos, text, minimalist line animations.',
  },
]

function selectAlgorithm(alg: DitherAlgorithm) {
  videoStore.settings.ditherAlgorithm = alg
}

function selectFitMode(mode: FitMode) {
  videoStore.settings.fitMode = mode
}

function rotate90() {
  const current = videoStore.settings.rotation
  videoStore.settings.rotation = ((current + 90) % 360) as 0 | 90 | 180 | 270
}

function resetDefaults() {
  videoStore.settings.contrast = 20
  videoStore.settings.brightness = 0
  videoStore.settings.gamma = 1.0
  videoStore.settings.blackPoint = 10
  videoStore.settings.edgeBoost = 15
  videoStore.settings.invert = false
  videoStore.settings.fitMode = 'cover'
  videoStore.settings.panX = 0
  videoStore.settings.panY = 0
  videoStore.settings.rotation = 0
}
</script>

<template>
  <aside class="dither-controls-sidebar">
    <div class="sidebar-header">
      <div class="title-wrap">
        <span class="header-icon">⚙️</span>
        <h3 class="header-title">Dither & Pipeline</h3>
      </div>
      <button class="btn-reset font-mono" title="Reset all adjustments to defaults" @click="resetDefaults">
        Reset
      </button>
    </div>

    <div class="sidebar-scrollable">
      <!-- Section 1: Dithering Algorithm Selector -->
      <section class="control-section">
        <div class="section-label-row">
          <span class="section-label font-mono">1. DITHERING ALGORITHM</span>
          <span class="active-badge font-mono">{{ videoStore.settings.ditherAlgorithm }}</span>
        </div>

        <div class="algo-grid">
          <div
            v-for="alg in algorithms"
            :key="alg.id"
            class="algo-card"
            :class="{ active: videoStore.settings.ditherAlgorithm === alg.id }"
            @click="selectAlgorithm(alg.id)"
          >
            <div class="card-top">
              <span class="algo-name">{{ alg.name }}</span>
              <span class="algo-badge font-mono">{{ alg.badge }}</span>
            </div>
            <div class="algo-tagline font-mono">{{ alg.tagline }}</div>
            <p class="algo-desc">{{ alg.description }}</p>
          </div>
        </div>
      </section>

      <!-- Section 2: Spatial Framing & Crop -->
      <section class="control-section">
        <div class="section-label-row">
          <span class="section-label font-mono">2. SPATIAL FRAMING (128×64)</span>
        </div>

        <div class="fit-controls-row">
          <div class="fit-buttons">
            <button
              class="btn-fit"
              :class="{ active: videoStore.settings.fitMode === 'cover' }"
              title="Cover: Center-crop to fill 128x64 without black borders"
              @click="selectFitMode('cover')"
            >
              Cover
            </button>
            <button
              class="btn-fit"
              :class="{ active: videoStore.settings.fitMode === 'contain' }"
              title="Contain: Fit entire frame with black letterbox"
              @click="selectFitMode('contain')"
            >
              Contain
            </button>
            <button
              class="btn-fit"
              :class="{ active: videoStore.settings.fitMode === 'stretch' }"
              title="Stretch: Non-uniform stretch to 128x64"
              @click="selectFitMode('stretch')"
            >
              Stretch
            </button>
          </div>

          <button
            class="btn-rotate"
            title="Rotate 90 degrees clockwise"
            @click="rotate90"
          >
            ↻ {{ videoStore.settings.rotation }}°
          </button>
        </div>

        <!-- Pan Sliders (Cover mode only) -->
        <div v-if="videoStore.settings.fitMode === 'cover'" class="pan-sliders">
          <div class="slider-row">
            <div class="slider-header font-mono">
              <span>Pan X Offset</span>
              <span>{{ videoStore.settings.panX }}%</span>
            </div>
            <input
              v-model.number="videoStore.settings.panX"
              type="range"
              min="-50"
              max="50"
              step="1"
              class="slider-input"
            />
          </div>

          <div class="slider-row">
            <div class="slider-header font-mono">
              <span>Pan Y Offset</span>
              <span>{{ videoStore.settings.panY }}%</span>
            </div>
            <input
              v-model.number="videoStore.settings.panY"
              type="range"
              min="-50"
              max="50"
              step="1"
              class="slider-input"
            />
          </div>
        </div>
      </section>

      <!-- Section 3: Tone & Contrast Adjustments -->
      <section class="control-section">
        <div class="section-label-row">
          <span class="section-label font-mono">3. TONE & EDGE BOOST</span>
        </div>

        <!-- Contrast Slider -->
        <div class="slider-row">
          <div class="slider-header font-mono">
            <span>Contrast</span>
            <span :class="{ 'val-highlight': videoStore.settings.contrast !== 0 }">
              {{ videoStore.settings.contrast > 0 ? `+${videoStore.settings.contrast}` : videoStore.settings.contrast }}
            </span>
          </div>
          <input
            v-model.number="videoStore.settings.contrast"
            type="range"
            min="-100"
            max="100"
            step="1"
            class="slider-input"
          />
        </div>

        <!-- Brightness Slider -->
        <div class="slider-row">
          <div class="slider-header font-mono">
            <span>Brightness</span>
            <span :class="{ 'val-highlight': videoStore.settings.brightness !== 0 }">
              {{ videoStore.settings.brightness > 0 ? `+${videoStore.settings.brightness}` : videoStore.settings.brightness }}
            </span>
          </div>
          <input
            v-model.number="videoStore.settings.brightness"
            type="range"
            min="-100"
            max="100"
            step="1"
            class="slider-input"
          />
        </div>

        <!-- Gamma Slider -->
        <div class="slider-row">
          <div class="slider-header font-mono">
            <span>Gamma Correction</span>
            <span :class="{ 'val-highlight': videoStore.settings.gamma !== 1.0 }">
              {{ videoStore.settings.gamma.toFixed(2) }}
            </span>
          </div>
          <input
            v-model.number="videoStore.settings.gamma"
            type="range"
            min="0.2"
            max="3.0"
            step="0.05"
            class="slider-input"
          />
        </div>

        <!-- Black Point Clip -->
        <div class="slider-row">
          <div class="slider-header font-mono">
            <span>Black Point Clip (Clean OLED)</span>
            <span :class="{ 'val-highlight': videoStore.settings.blackPoint > 0 }">
              {{ videoStore.settings.blackPoint }}%
            </span>
          </div>
          <input
            v-model.number="videoStore.settings.blackPoint"
            type="range"
            min="0"
            max="80"
            step="1"
            class="slider-input"
          />
        </div>

        <!-- Edge Boost (Laplacian Sharpening) -->
        <div class="slider-row">
          <div class="slider-header font-mono">
            <span>Edge Sharpening (Laplacian Boost)</span>
            <span :class="{ 'val-highlight': videoStore.settings.edgeBoost > 0 }">
              {{ videoStore.settings.edgeBoost }}%
            </span>
          </div>
          <input
            v-model.number="videoStore.settings.edgeBoost"
            type="range"
            min="0"
            max="100"
            step="1"
            class="slider-input"
          />
        </div>

        <!-- Invert Toggle -->
        <div class="toggle-row">
          <span class="toggle-label font-mono">Invert Black & White</span>
          <label class="switch">
            <input v-model="videoStore.settings.invert" type="checkbox" />
            <span class="switch-slider" />
          </label>
        </div>
      </section>

      <!-- Section 3: LittleFS Flash Storage & Reel Duration HUD -->
      <section class="control-section flash-hud-section">
        <div class="section-label-row">
          <span class="section-label font-mono">3. FLASH STORAGE & REEL DURATION</span>
          <span class="flash-badge font-mono">⚡ LittleFS 1.5 MB</span>
        </div>

        <!-- Real-Time Duration & Capacity Metric Cards -->
        <div class="hud-metric-grid">
          <div class="hud-card">
            <span class="hud-card-label font-mono">Output Duration</span>
            <span class="hud-card-value font-mono highlight-cyan">
              {{ (videoStore.totalFrames / videoStore.settings.targetFps).toFixed(1) }}s
            </span>
            <span class="hud-card-sub font-mono">
              @ {{ videoStore.settings.targetFps }} FPS loop
            </span>
          </div>

          <div class="hud-card">
            <span class="hud-card-label font-mono">Extracted Frames</span>
            <span class="hud-card-value font-mono highlight-purple">
              {{ videoStore.totalFrames }}
            </span>
            <span class="hud-card-sub font-mono">
              {{ videoStore.totalFrames }} KB Flash
            </span>
          </div>
        </div>

        <!-- Flash Storage Capacity Meter -->
        <div class="flash-capacity-card">
          <div class="capacity-header font-mono">
            <span>Onboard Flash Used:</span>
            <span class="capacity-val font-mono">
              {{ videoStore.totalFrames }} KB / 1,500 KB ({{ Math.min(100, Math.round((videoStore.totalFrames / 1500) * 100)) }}%)
            </span>
          </div>
          <div class="capacity-bar-track">
            <div
              class="capacity-bar-fill"
              :style="{ width: `${Math.min(100, (videoStore.totalFrames / 1500) * 100)}%` }"
            />
          </div>
          <p class="capacity-desc font-mono">
            ✓ Survives power disconnect. Streamed autonomously via LittleFS.
          </p>
        </div>

        <!-- Max Frame Limit Selector / Presets -->
        <div class="max-frames-control">
          <div class="slider-header font-mono">
            <span>Max Frames Ceiling</span>
            <span class="val-highlight font-mono">{{ videoStore.settings.maxFrames }} frames</span>
          </div>
          <div class="frame-preset-buttons font-mono">
            <button
              v-for="preset in [150, 300, 450, 600, 1000, 1500]"
              :key="preset"
              class="btn-frame-preset"
              :class="{ active: videoStore.settings.maxFrames === preset }"
              :title="`Max ${preset} frames: ${(preset / videoStore.settings.targetFps).toFixed(0)}s at ${videoStore.settings.targetFps} FPS (${preset} KB)`"
              @click="videoStore.settings.maxFrames = preset"
            >
              {{ preset }}
            </button>
          </div>
          <input
            v-model.number="videoStore.settings.maxFrames"
            type="range"
            min="30"
            max="1500"
            step="10"
            class="slider-input"
          />
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.dither-controls-sidebar {
  width: 340px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0B0F17;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  user-select: none;
}

.sidebar-header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  background: rgba(13, 17, 23, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-icon {
  font-size: 0.85rem;
}

.header-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #F8FAFC;
  letter-spacing: 0.02em;
}

.btn-reset {
  font-size: 0.68rem;
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  color: #94A3B8;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-reset:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #F8FAFC;
}

.sidebar-scrollable {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: #64748B;
  letter-spacing: 0.05em;
}

.active-badge {
  font-size: 0.65rem;
  color: #38BDF8;
  background: rgba(56, 189, 248, 0.1);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

/* Algorithm Grid */
.algo-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

.algo-card {
  padding: 0.65rem 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.algo-card:hover {
  background: rgba(30, 41, 59, 0.6);
  border-color: rgba(255, 255, 255, 0.15);
}

.algo-card.active {
  background: rgba(14, 165, 233, 0.1);
  border-color: #38BDF8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.2rem;
}

.algo-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: #F8FAFC;
}

.algo-card.active .algo-name {
  color: #38BDF8;
}

.algo-badge {
  font-size: 0.62rem;
  color: #10B981;
  background: rgba(16, 185, 129, 0.12);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.algo-tagline {
  font-size: 0.65rem;
  color: #94A3B8;
  margin-bottom: 0.3rem;
}

.algo-desc {
  font-size: 0.68rem;
  color: #64748B;
  line-height: 1.35;
  margin: 0;
}

/* Fit Controls */
.fit-controls-row {
  display: flex;
  gap: 0.5rem;
}

.fit-buttons {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px;
}

.btn-fit {
  font-size: 0.72rem;
  padding: 0.3rem 0;
  background: transparent;
  color: #94A3B8;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-fit.active {
  background: rgba(56, 189, 248, 0.2);
  color: #38BDF8;
  font-weight: 600;
}

.btn-rotate {
  font-size: 0.72rem;
  padding: 0.3rem 0.65rem;
  background: rgba(255, 255, 255, 0.04);
  color: #94A3B8;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-rotate:hover {
  color: #F8FAFC;
  background: rgba(255, 255, 255, 0.08);
}

.pan-sliders {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.4rem;
  padding: 0.6rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
}

/* Sliders */
.slider-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: #94A3B8;
}

.val-highlight {
  color: #38BDF8;
  font-weight: 600;
}

.slider-input {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  accent-color: #38BDF8;
}

/* Toggle Switch */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.4rem;
}

.toggle-label {
  font-size: 0.72rem;
  color: #94A3B8;
}

.switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 18px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: rgba(255, 255, 255, 0.15);
  transition: 0.2s;
  border-radius: 18px;
}

.switch-slider:before {
  position: absolute;
  content: '';
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: 0.2s;
  border-radius: 50%;
}

input:checked + .switch-slider {
  background-color: #38BDF8;
}

input:checked + .switch-slider:before {
  transform: translateX(16px);
}

/* Flash Storage & Reel Duration HUD Section */
.flash-hud-section {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 8px;
  padding: 0.85rem;
  margin-top: 0.5rem;
}

.flash-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  background: rgba(56, 189, 248, 0.15);
  color: #38BDF8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 4px;
}

.hud-metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0.6rem 0;
}

.hud-card {
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
}

.hud-card-label {
  font-size: 0.6rem;
  color: #64748B;
  text-transform: uppercase;
}

.hud-card-value {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0.15rem 0;
}

.highlight-cyan {
  color: #38BDF8;
}

.highlight-purple {
  color: #C084FC;
}

.hud-card-sub {
  font-size: 0.62rem;
  color: #94A3B8;
}

.flash-capacity-card {
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 0.75rem;
}

.capacity-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.64rem;
  color: #94A3B8;
  margin-bottom: 0.3rem;
}

.capacity-val {
  color: #34D399;
  font-weight: 600;
}

.capacity-bar-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.3rem;
}

.capacity-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #38BDF8, #34D399);
  transition: width 0.25s ease;
}

.capacity-desc {
  font-size: 0.6rem;
  color: #64748B;
  margin: 0;
}

.max-frames-control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.frame-preset-buttons {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.btn-frame-preset {
  font-size: 0.65rem;
  padding: 0.2rem 0.45rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94A3B8;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-frame-preset:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #F8FAFC;
}

.btn-frame-preset.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38BDF8;
  color: #38BDF8;
  font-weight: 700;
}
</style>
