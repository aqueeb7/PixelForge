<script setup lang="ts">
import { onMounted } from 'vue'
import { useDeviceStore } from '../stores/device'
import OledPreview from '../components/OledPreview.vue'

const deviceStore = useDeviceStore()

onMounted(async () => {
  await deviceStore.refreshPorts()
  if (!deviceStore.activeFrame) {
    await deviceStore.sendTestPattern()
  }
})

function handleToggleConnect() {
  if (deviceStore.status === 'connected') {
    deviceStore.disconnect()
  } else {
    deviceStore.connect()
  }
}
</script>

<template>
  <div class="devices-view">
    <div class="header-section">
      <div class="header-badge">Spec 002 • USB Serial Link</div>
      <h1 class="page-title">ESP32 Device Manager</h1>
      <p class="page-subtitle">
        Connect to your ESP32 over USB Serial at 115200 baud to query device info, clear screen, and transmit 128×64 canonical bitmaps to your 1.3″ I2C OLED display.
      </p>
    </div>

    <!-- Error Banner -->
    <div v-if="deviceStore.errorMessage" class="error-banner" role="alert">
      <span class="error-icon">⚠️</span>
      <div class="error-text">
        <strong>Serial Error:</strong> {{ deviceStore.errorMessage }}
      </div>
    </div>

    <div class="main-grid">
      <!-- Left Column: Serial Controls & Device Info -->
      <div class="controls-column">
        <!-- Port Selection Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Serial Port Configuration</span>
            <button
              class="btn-icon"
              title="Refresh Ports"
              @click="deviceStore.refreshPorts"
              :disabled="deviceStore.status === 'connecting'"
            >
              🔄
            </button>
          </div>

          <div class="form-group">
            <label class="form-label" for="port-select">Target COM Port</label>
            <div class="select-wrapper">
              <select
                id="port-select"
                v-model="deviceStore.selectedPort"
                class="form-select"
                :disabled="deviceStore.status === 'connected' || deviceStore.status === 'connecting'"
              >
                <option v-if="deviceStore.ports.length === 0" value="" disabled>
                  No serial ports detected
                </option>
                <option
                  v-for="p in deviceStore.ports"
                  :key="p.port_name"
                  :value="p.port_name"
                >
                  {{ p.port_name }} ({{ p.port_type }})
                </option>
              </select>
            </div>
          </div>

          <div class="connection-actions">
            <button
              class="btn"
              :class="{
                'btn--primary': deviceStore.status !== 'connected',
                'btn--danger': deviceStore.status === 'connected',
                'btn--loading': deviceStore.status === 'connecting'
              }"
              :disabled="!deviceStore.selectedPort || deviceStore.status === 'connecting'"
              @click="handleToggleConnect"
            >
              <span v-if="deviceStore.status === 'connecting'">Connecting…</span>
              <span v-else-if="deviceStore.status === 'connected'">Disconnect Device</span>
              <span v-else>Connect via Serial</span>
            </button>
          </div>
        </div>

        <!-- Diagnostics & Actions Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Hardware Diagnostics</span>
            <span
              class="status-indicator"
              :class="'status-indicator--' + deviceStore.status"
            >
              {{ deviceStore.status.toUpperCase() }}
            </span>
          </div>

          <div class="actions-grid">
            <button
              class="btn btn--secondary"
              :disabled="deviceStore.status !== 'connected'"
              @click="deviceStore.ping"
            >
              <span class="btn-glyph">📡</span>
              <span>Send PING</span>
              <span v-if="deviceStore.lastPingLatency !== null" class="latency-pill">
                {{ deviceStore.lastPingLatency }} ms
              </span>
            </button>

            <button
              class="btn btn--secondary"
              :disabled="deviceStore.status !== 'connected'"
              @click="deviceStore.clear"
            >
              <span class="btn-glyph">🧹</span>
              <span>Clear Screen</span>
            </button>

            <button
              class="btn btn--accent"
              @click="deviceStore.sendTestPattern"
            >
              <span class="btn-glyph">🏁</span>
              <span>Send Test Pattern</span>
            </button>
          </div>
        </div>

        <!-- Connected Device Capabilities -->
        <div v-if="deviceStore.deviceInfo" class="card card--info">
          <div class="card-header">
            <span class="card-title">Device Capabilities</span>
            <span class="verified-badge">✓ Compatible</span>
          </div>

          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Device Name</span>
              <span class="info-value">{{ deviceStore.deviceInfo.device_name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Firmware Version</span>
              <span class="info-value">v{{ deviceStore.deviceInfo.firmware_version }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Display Resolution</span>
              <span class="info-value">
                {{ deviceStore.deviceInfo.display_width }} × {{ deviceStore.deviceInfo.display_height }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Color Depth</span>
              <span class="info-value">{{ deviceStore.deviceInfo.color_depth }}-bit Monochrome</span>
            </div>
            <div class="info-row">
              <span class="info-label">OLED Controller</span>
              <span class="info-value controller-pill">{{ deviceStore.deviceInfo.display_controller }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Protocol Version</span>
              <span class="info-value">v{{ deviceStore.deviceInfo.protocol_version }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Live OLED Preview & Hardware Wiring Guide -->
      <div class="preview-column">
        <div class="card preview-card">
          <div class="card-header">
            <span class="card-title">Physical OLED Mirror (128×64)</span>
            <span class="preview-badge">Canonical 1-bit Buffer</span>
          </div>

          <div class="preview-stage">
            <OledPreview :frame-data="deviceStore.activeFrame" />
          </div>

          <div class="preview-caption">
            Exact representation of the 1024-byte row-major frame sent to the ESP32. The ESP32 firmware translates this canonical buffer to the physical OLED controller.
          </div>
        </div>

        <!-- Hardware Wiring Reference -->
        <div class="card wiring-card">
          <div class="card-header">
            <span class="card-title">Hardware Profile (Spec 002)</span>
          </div>
          <div class="wiring-table">
            <div class="wire-item">
              <span class="wire-pin">VCC</span>
              <span class="wire-arrow">➔</span>
              <span class="wire-dest">ESP32 3V3</span>
            </div>
            <div class="wire-item">
              <span class="wire-pin">GND</span>
              <span class="wire-arrow">➔</span>
              <span class="wire-dest">ESP32 GND</span>
            </div>
            <div class="wire-item">
              <span class="wire-pin">SCL</span>
              <span class="wire-arrow">➔</span>
              <span class="wire-dest">GPIO 22</span>
            </div>
            <div class="wire-item">
              <span class="wire-pin">SDA</span>
              <span class="wire-arrow">➔</span>
              <span class="wire-dest">GPIO 21</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.devices-view {
  flex: 1;
  padding: 2rem 2.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background-color: var(--color-bg-base);
}

.header-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.header-badge {
  align-self: flex-start;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: var(--color-accent-dim);
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  border: 1px solid rgba(124, 111, 255, 0.3);
}

.page-title {
  font-size: 1.85rem;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
  max-width: 820px;
  line-height: 1.5;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.85rem;
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 1024px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}

.controls-column,
.preview-column {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.form-select {
  width: 100%;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.15s;
}

.form-select:focus {
  border-color: var(--color-accent);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 1.25rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-accent);
  color: white;
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn--danger {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.btn--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.35);
}

.btn--secondary {
  background: var(--color-bg-base);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
}

.btn--accent {
  background: rgba(124, 111, 255, 0.15);
  border-color: rgba(124, 111, 255, 0.4);
  color: #c4b5fd;
}

.btn--accent:hover:not(:disabled) {
  background: rgba(124, 111, 255, 0.25);
}

.btn-icon {
  background: none;
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  color: var(--color-text-secondary);
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s ease;
}

.btn-icon:hover:not(:disabled) {
  border-color: var(--color-accent);
  background: var(--color-bg-elevated);
}

.actions-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.65rem;
}

.latency-pill {
  margin-left: auto;
  font-size: 0.72rem;
  font-family: monospace;
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.status-indicator {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.status-indicator--connected {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-indicator--disconnected {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.status-indicator--connecting {
  background: rgba(245, 158, 11, 0.15);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-indicator--error {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 0.45rem;
}

.info-label {
  color: var(--color-text-secondary);
}

.info-value {
  font-family: monospace;
  font-weight: 600;
  color: var(--color-text-primary);
}

.controller-pill {
  background: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.verified-badge {
  font-size: 0.72rem;
  color: #6ee7b7;
  font-weight: 600;
}

.preview-card {
  align-items: center;
}

.preview-stage {
  padding: 1rem 0;
  display: flex;
  justify-content: center;
  width: 100%;
}

.preview-caption {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.45;
  max-width: 480px;
}

.preview-badge {
  font-size: 0.68rem;
  font-family: monospace;
  color: var(--color-accent);
}

.wiring-table {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.wire-item {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-family: monospace;
}

.wire-pin {
  font-weight: 700;
  color: #38bdf8;
}

.wire-arrow {
  color: var(--color-text-muted);
  font-size: 0.65rem;
}

.wire-dest {
  color: var(--color-text-primary);
}
</style>
