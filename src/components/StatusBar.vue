<script setup lang="ts">
import { computed } from 'vue'
import { useDeviceStore } from '../stores/device'
import { getPlatformMode } from '../services/platform'

const deviceStore = useDeviceStore()
const platformMode = computed(() => getPlatformMode())

const statusLabel = computed(() => {
  switch (deviceStore.status) {
    case 'connected':
      return deviceStore.deviceInfo?.device_name || `Connected (${deviceStore.selectedPort})`
    case 'connecting':
      return `Connecting (${deviceStore.selectedPort})…`
    case 'error':
      return 'Connection Error'
    default:
      return 'Hardware Offline'
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
  <footer class="status-bar font-mono" role="status" aria-live="polite">
    <!-- Left: Status & Telemetry Indicators -->
    <div class="status-group status-left">
      <!-- Device Status Pill -->
      <div class="status-item device-identity" :class="`status--${deviceStore.status}`">
        <span
          class="status-dot"
          :class="{
            'status-dot--connected': deviceStore.status === 'connected',
            'status-dot--connecting': deviceStore.status === 'connecting' || deviceStore.isDisconnecting,
            'status-dot--error': deviceStore.status === 'error',
            'status-dot--disconnected': deviceStore.status === 'disconnected',
          }"
        />
        <span class="device-label">{{ statusLabel }}</span>
      </div>

      <!-- Platform Mode Tag -->
      <div class="status-item status-platform">
        <span class="status-mode-tag" :class="'status-mode--' + platformMode">
          {{ platformMode === 'desktop' ? 'Desktop' : 'Web' }}
        </span>
      </div>

      <!-- Live Micro-Telemetry (Active when Connected) -->
      <div v-if="deviceStore.status === 'connected' && deviceStore.telemetry" class="telemetry-compact">
        <span class="telemetry-badge" title="Free Heap RAM on ESP32">
          RAM: {{ Math.round(deviceStore.telemetry.free_heap / 1024) }}KB
        </span>
        <span class="telemetry-badge" title="Live Display Refresh Rate">
          {{ deviceStore.telemetry.current_fps.toFixed(1) }} FPS
        </span>
      </div>
    </div>

    <!-- Center: Live Hardware Process / Transaction Monitor -->
    <div class="status-group status-center">
      <div
        v-if="deviceStore.activeTransaction"
        class="tx-pill"
        :class="`tx--${deviceStore.activeTransaction.step}`"
        :title="deviceStore.activeTransaction.detail"
      >
        <span class="tx-pulse-dot" />
        <span class="tx-title">{{ deviceStore.activeTransaction.title }}</span>
        <span class="tx-sep">·</span>
        <span class="tx-detail">{{ deviceStore.activeTransaction.detail }}</span>
        <span class="tx-timer">{{ deviceStore.activeTransaction.elapsedMs }}ms</span>
      </div>
      <div
        v-else-if="deviceStore.lastTransaction && deviceStore.lastTransaction.step === 'completed'"
        class="tx-pill tx--idle-success"
        :title="deviceStore.lastTransaction.detail"
      >
        <span class="text-emerald-400">✓</span>
        <span class="text-slate-300 font-medium">{{ deviceStore.lastTransaction.title }}</span>
        <span class="tx-sep">·</span>
        <span class="text-slate-400">{{ deviceStore.lastTransaction.elapsedMs }}ms</span>
      </div>
    </div>

    <!-- Right: Universal Hardware Control Band -->
    <div class="status-group status-right">
      <!-- Port Selector -->
      <div class="control-unit" title="Serial COM Port">
        <select
          id="status-port-select"
          v-model="deviceStore.selectedPort"
          class="status-select font-mono"
          :disabled="deviceStore.status === 'connected' || deviceStore.status === 'connecting'"
        >
          <option v-if="deviceStore.ports.length === 0" value="" disabled>
            No COM Ports
          </option>
          <option
            v-for="p in deviceStore.ports"
            :key="p.port_name"
            :value="p.port_name"
          >
            {{ p.port_name }}
          </option>
        </select>
        <button
          class="btn-status-icon"
          title="Scan and refresh available COM ports"
          :disabled="deviceStore.isRefreshingPorts || deviceStore.status === 'connecting'"
          @click="deviceStore.refreshPorts"
        >
          <span class="icon-refresh" :class="{ 'is-spinning': deviceStore.isRefreshingPorts }">🔄</span>
        </button>
      </div>

      <!-- Baud Rate Selector -->
      <div class="control-unit" title="Baud Rate">
        <select
          v-model.number="deviceStore.baudRate"
          class="status-select baud-select font-mono"
          :disabled="deviceStore.status === 'connected' || deviceStore.status === 'connecting'"
        >
          <option :value="115200">115200</option>
          <option :value="460800">460800</option>
          <option :value="921600">921600</option>
        </select>
      </div>

      <!-- Connect / Disconnect Action Button -->
      <button
        class="btn-status-action btn-connect font-mono"
        :class="{
          'is-connected': deviceStore.status === 'connected',
          'is-connecting': deviceStore.status === 'connecting' || deviceStore.isDisconnecting,
        }"
        :disabled="!deviceStore.selectedPort || deviceStore.status === 'connecting' || deviceStore.isDisconnecting"
        @click="handleToggleConnect"
      >
        <span v-if="deviceStore.connectionState === 'Connecting'" class="inline-flex items-center gap-1">
          <span class="status-spinner" /> Connecting…
        </span>
        <span v-else-if="deviceStore.connectionState === 'Handshaking'" class="inline-flex items-center gap-1">
          <span class="status-spinner" /> Handshaking…
        </span>
        <span v-else-if="deviceStore.isDisconnecting" class="inline-flex items-center gap-1">
          <span class="status-spinner" /> Disconnecting…
        </span>
        <span v-else-if="deviceStore.status === 'connected'">
          Disconnect
        </span>
        <span v-else>
          ⚡ Connect
        </span>
      </button>

      <!-- Ping Quick Action -->
      <button
        v-if="deviceStore.status === 'connected'"
        class="btn-status-action btn-ping font-mono"
        :disabled="deviceStore.isPinging"
        title="Send PING packet (0x01) to measure round-trip latency"
        @click="deviceStore.ping"
      >
        <span v-if="deviceStore.isPinging" class="animate-pulse inline-flex items-center gap-1">
          <span class="status-spinner" /> Pinging…
        </span>
        <span v-else>
          Ping <span v-if="deviceStore.lastPingLatency !== null" class="latency-val">{{ deviceStore.lastPingLatency }}ms</span>
        </span>
      </button>

      <!-- Clear OLED Display Quick Action -->
      <button
        v-if="deviceStore.status === 'connected'"
        class="btn-status-action btn-clear font-mono"
        :disabled="deviceStore.isClearing"
        title="Clear physical OLED display and frame buffer (0x04)"
        @click="deviceStore.clear"
      >
        <span v-if="deviceStore.isClearing" class="animate-pulse">Clearing…</span>
        <span v-else>🧹 Clear</span>
      </button>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  height: 34px;
  background-color: #0A0D14;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.85rem;
  gap: 1rem;
  flex-shrink: 0;
  user-select: none;
  z-index: 30;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-left {
  min-width: 0;
}

.status-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.tx-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.7);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.4);
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  animation: fadeIn 0.2s ease;
}

.tx-title {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tx-sep {
  opacity: 0.4;
}

.tx-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.tx-timer {
  font-size: 0.64rem;
  opacity: 0.85;
}

.tx-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulse-glow 1s infinite;
}

.tx--preparing {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(8, 47, 73, 0.8);
  color: #38bdf8;
}
.tx--preparing .tx-pulse-dot {
  background-color: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}

.tx--transmitting {
  border-color: rgba(96, 165, 250, 0.5);
  background: rgba(30, 58, 138, 0.8);
  color: #93c5fd;
}
.tx--transmitting .tx-pulse-dot {
  background-color: #60a5fa;
  box-shadow: 0 0 8px #60a5fa;
}

.tx--awaiting_ack {
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(120, 53, 15, 0.8);
  color: #fde68a;
}
.tx--awaiting_ack .tx-pulse-dot {
  background-color: #fbbf24;
  box-shadow: 0 0 8px #fbbf24;
}

.tx--completed {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(6, 78, 59, 0.8);
  color: #6ee7b7;
}
.tx--completed .tx-pulse-dot {
  background-color: #34d399;
  box-shadow: 0 0 6px #34d399;
}

.tx--idle-success {
  border-color: rgba(52, 211, 153, 0.2);
  background: rgba(6, 78, 59, 0.3);
  color: #cbd5e1;
}

.tx--failed {
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(136, 19, 55, 0.8);
  color: #fca5a5;
}
.tx--failed .tx-pulse-dot {
  background-color: #f87171;
  box-shadow: 0 0 8px #f87171;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.2); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.device-identity {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.12rem 0.5rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.status--connected {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.status--connecting {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.status--error {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.device-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: #E2E8F0;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--connected {
  background-color: #10B981;
  box-shadow: 0 0 6px #10B981;
  animation: pulse-connected 2s ease-in-out infinite;
}

.status-dot--connecting {
  background-color: #F59E0B;
  animation: pulse-connecting 0.8s ease-in-out infinite alternate;
}

.status-dot--error {
  background-color: #EF4444;
}

.status-dot--disconnected {
  background-color: #64748B;
}

.status-mode-tag {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-mode--desktop {
  background-color: rgba(56, 189, 248, 0.12);
  color: #38BDF8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.status-mode--web {
  background-color: rgba(168, 85, 247, 0.12);
  color: #C084FC;
  border: 1px solid rgba(168, 85, 247, 0.25);
}

.telemetry-compact {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.telemetry-badge {
  font-size: 0.66rem;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: #38BDF8;
  padding: 0.08rem 0.4rem;
  border-radius: 3px;
  white-space: nowrap;
}

.status-right {
  flex-shrink: 0;
  gap: 0.45rem;
}

.control-unit {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.status-select {
  background: #111827;
  color: #E2E8F0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-size: 0.7rem;
  padding: 0.18rem 0.4rem;
  outline: none;
  cursor: pointer;
  transition: all 0.15s;
}

.status-select:hover:not(:disabled) {
  border-color: rgba(56, 189, 248, 0.5);
}

.status-select:focus {
  border-color: #38BDF8;
}

.status-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.baud-select {
  width: 76px;
}

.btn-status-icon {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #94A3B8;
  cursor: pointer;
  padding: 0.15rem 0.3rem;
  font-size: 0.68rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-status-icon:hover:not(:disabled) {
  border-color: #38BDF8;
  color: #FFFFFF;
}

.icon-refresh.is-spinning {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}

.btn-status-action {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.18rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-connect {
  background: linear-gradient(135deg, #059669, #047857);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #FFFFFF;
}

.btn-connect:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.35);
}

.btn-connect.is-connected {
  background: #1E293B;
  border-color: rgba(239, 68, 68, 0.4);
  color: #FCA5A5;
}

.btn-connect.is-connected:hover:not(:disabled) {
  background: #7F1D1D;
  border-color: #EF4444;
  color: #FFFFFF;
}

.btn-connect:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.btn-ping {
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38BDF8;
}

.btn-ping:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
  transform: translateY(-1px);
}

.btn-ping:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.latency-val {
  color: #4ADE80;
  font-weight: 700;
  margin-left: 2px;
}

.btn-clear {
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94A3B8;
}

.btn-clear:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.18);
  color: #F8FAFC;
  transform: translateY(-1px);
}

.btn-clear:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.status-spinner {
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse-connected {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.9); }
}

@keyframes pulse-connecting {
  0% { opacity: 0.3; }
  100% { opacity: 1; }
}
</style>
