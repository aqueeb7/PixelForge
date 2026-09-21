<script setup lang="ts">
import { computed } from 'vue'
import { useDeviceStore } from '../../stores/device'

const deviceStore = useDeviceStore()

const telemetry = computed(() => deviceStore.telemetry)

// Circular gauge calculations (radius 48, circumference ~301.6)
const RADIUS = 48
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const heapUsagePercent = computed(() => {
  if (!telemetry.value || !telemetry.value.total_heap) return 0
  const used = telemetry.value.total_heap - telemetry.value.free_heap
  return Math.min(100, Math.max(0, (used / telemetry.value.total_heap) * 100))
})

const freePercent = computed(() => {
  return 100 - heapUsagePercent.value
})

const strokeDashoffset = computed(() => {
  const percent = freePercent.value
  return CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE
})

const gaugeColor = computed(() => {
  const freeKb = (telemetry.value?.free_heap || 0) / 1024
  if (freeKb > 100) return '#38bdf8' // Clean Electric Cyan
  if (freeKb > 40) return '#f59e0b'  // Amber
  return '#f43f5e'                   // Rose
})

const gradientStart = computed(() => {
  const freeKb = (telemetry.value?.free_heap || 0) / 1024
  if (freeKb > 100) return '#38bdf8' // Electric Cyan
  if (freeKb > 40) return '#fbbf24'  // Light Amber
  return '#fb7185'                   // Light Rose
})

const gradientEnd = computed(() => {
  const freeKb = (telemetry.value?.free_heap || 0) / 1024
  if (freeKb > 100) return '#818cf8' // Tech Violet / Accent
  if (freeKb > 40) return '#f59e0b'  // Deep Amber
  return '#e11d48'                   // Deep Rose
})

function formatKb(bytes?: number): string {
  if (!bytes) return '0 KB'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '0s'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}
</script>

<template>
  <div class="memory-gauges-card">
    <div class="card-header">
      <div class="header-title">
        <span class="icon">📊</span>
        <h3>Real-time Device Telemetry</h3>
      </div>
      <div v-if="telemetry" class="header-pills">
        <span class="pill uptime-pill">⏱ Uptime: {{ formatUptime(telemetry.uptime_seconds) }}</span>
        <span class="pill fps-pill">⚡ {{ telemetry.current_fps.toFixed(1) }} FPS</span>
      </div>
    </div>

    <div v-if="!telemetry" class="no-telemetry-notice">
      <p>Connect your ESP32 to start streaming live memory, heap watermarks, and render metrics.</p>
    </div>

    <div v-else class="gauges-content">
      <!-- Circular Progress for Free Heap -->
      <div class="circular-gauge-container">
        <div class="svg-gauge-wrapper">
          <svg class="circular-gauge-svg" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="heapGaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" :stop-color="gradientStart" />
                <stop offset="100%" :stop-color="gradientEnd" />
              </linearGradient>
            </defs>
            <!-- Background circle track -->
            <circle
              class="gauge-track"
              cx="60"
              cy="60"
              :r="RADIUS"
            />
            <!-- Animated progress circle -->
            <circle
              class="gauge-progress"
              cx="60"
              cy="60"
              :r="RADIUS"
              stroke="url(#heapGaugeGradient)"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="strokeDashoffset"
            />
          </svg>
          <div class="gauge-center-text">
            <span class="gauge-value" :style="{ color: gaugeColor }">
              {{ freePercent.toFixed(0) }}%
            </span>
            <span class="gauge-label">Free Heap</span>
          </div>
        </div>

        <div class="gauge-meta">
          <div class="meta-row">
            <span class="label">Current Free:</span>
            <span class="val font-mono" :style="{ color: gaugeColor }">
              {{ formatKb(telemetry.free_heap) }}
            </span>
          </div>
          <div class="meta-row">
            <span class="label">Total Heap:</span>
            <span class="val font-mono">{{ formatKb(telemetry.total_heap) }}</span>
          </div>
        </div>
      </div>

      <!-- Linear Meters: Min Heap Watermark & Flash -->
      <div class="meters-container">
        <!-- Min Heap Watermark (leak detector) -->
        <div class="meter-block">
          <div class="meter-header">
            <span class="meter-name">
              Min Heap Watermark
              <span class="hint-tag" title="Lowest free heap since boot. Detects leaks during frame rendering.">ℹ</span>
            </span>
            <span class="meter-val font-mono">{{ formatKb(telemetry.min_free_heap) }}</span>
          </div>
          <div class="meter-track">
            <div
              class="meter-fill watermark-fill"
              :style="{ width: `${Math.min(100, ((telemetry.min_free_heap) / (telemetry.total_heap || 1)) * 100)}%` }"
            />
          </div>
          <span class="meter-sub">Lowest dynamic memory headroom recorded</span>
        </div>

        <!-- Frame Counter & Display Metrics -->
        <div class="metrics-grid">
          <div class="metric-box">
            <span class="box-label">Frames Rendered</span>
            <span class="box-val font-mono">#{{ telemetry.frame_counter }}</span>
          </div>
          <div class="metric-box">
            <span class="box-label">OLED Contrast</span>
            <span class="box-val font-mono">{{ telemetry.oled_contrast }}/255</span>
          </div>
          <div class="metric-box">
            <span class="box-label">Wi-Fi Telemetry</span>
            <span class="box-val font-mono wifi-tag" :class="`wifi-${telemetry.wifi_status}`">
              {{ telemetry.wifi_status }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-gauges-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 0.6rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.header-title h3 {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.header-pills {
  display: flex;
  gap: 0.4rem;
}

.pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
}

.fps-pill {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.no-telemetry-notice {
  padding: 1.5rem 1rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.gauges-content {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 1.25rem;
  align-items: center;
}

/* Circular SVG Gauge */
.circular-gauge-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.svg-gauge-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.circular-gauge-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg); /* Start from top */
}

.gauge-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.06);
  stroke-width: 8;
}

.gauge-progress {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.5s ease;
  filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.25));
}

.gauge-center-text {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.gauge-value {
  font-family: monospace;
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1.1;
}

.gauge-label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gauge-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.meta-row {
  display: flex;
  justify-content: space-between;
}

.meta-row .label {
  color: var(--color-text-muted);
}

/* Linear Meters */
.meters-container {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.meter-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.meter-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  font-weight: 600;
}

.meter-name {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--color-text-secondary);
}

.hint-tag {
  cursor: help;
  font-size: 0.7rem;
  color: var(--color-accent);
}

.meter-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 9999px;
  overflow: hidden;
}

.watermark-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 9999px;
  transition: width 0.4s ease;
}

.meter-sub {
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.metric-box {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.box-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.box-val {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.wifi-tag {
  text-transform: capitalize;
}

.wifi-connected {
  color: #34d399;
}

.wifi-connecting {
  color: #fbbf24;
}

.wifi-off {
  color: #94a3b8;
}

.font-mono {
  font-family: monospace;
}
</style>
