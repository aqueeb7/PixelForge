<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDeviceStore } from '../stores/device'
import OledDeviceCard from '../components/monitor/OledDeviceCard.vue'
import MemoryGauges from '../components/monitor/MemoryGauges.vue'
import DeviceDossier from '../components/monitor/DeviceDossier.vue'
import SerialTerminal from '../components/monitor/SerialTerminal.vue'
import PacketInspector from '../components/monitor/PacketInspector.vue'
import FirmwareFlasher from '../components/monitor/FirmwareFlasher.vue'

const deviceStore = useDeviceStore()
const activeTab = ref<'diagnostics' | 'terminal' | 'flasher'>('diagnostics')

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
    <!-- Top Action & Connection Toolbar (Fixed 48px matching DrawView/HardwareView) -->
    <header class="device-toolbar">
      <div class="toolbar-group">
        <span class="toolbar-icon">🔌</span>
        <h2 class="toolbar-title">Device & Diagnostics</h2>
        <span class="toolbar-badge">Spec 005</span>
      </div>

      <!-- Center Connection Controls -->
      <div class="toolbar-group toolbar-center">
        <!-- Port Selector -->
        <div class="port-selector-wrapper">
          <select
            id="port-select"
            v-model="deviceStore.selectedPort"
            class="port-select font-mono"
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
          <button
            class="btn-refresh"
            title="Scan available COM ports"
            :disabled="deviceStore.status === 'connecting'"
            @click="deviceStore.refreshPorts"
          >
            🔄
          </button>
        </div>

        <!-- Baud Rate Selector -->
        <div class="baud-selector-wrapper">
          <select
            v-model.number="deviceStore.baudRate"
            class="baud-select font-mono"
            :disabled="deviceStore.status === 'connected'"
          >
            <option :value="115200">115200</option>
            <option :value="460800">460800</option>
            <option :value="921600">921600</option>
          </select>
        </div>

        <!-- Connect / Disconnect Button -->
        <button
          class="btn-connect"
          :class="{
            'btn-connect--connected': deviceStore.status === 'connected',
            'btn-connect--connecting': deviceStore.status === 'connecting',
          }"
          :disabled="!deviceStore.selectedPort || deviceStore.status === 'connecting'"
          @click="handleToggleConnect"
        >
          <span v-if="deviceStore.status === 'connecting'">Connecting…</span>
          <span v-else-if="deviceStore.status === 'connected'">Disconnect</span>
          <span v-else>Connect</span>
        </button>

        <!-- Ping Quick Action -->
        <button
          v-if="deviceStore.status === 'connected'"
          class="btn-ping"
          title="Send PING packet (0x01)"
          @click="deviceStore.ping"
        >
          Ping <span v-if="deviceStore.lastPingLatency !== null" class="latency font-mono">{{ deviceStore.lastPingLatency }}ms</span>
        </button>
      </div>

      <!-- Tab Switchers (Right Side) -->
      <div class="toolbar-group toolbar-tabs">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'diagnostics' }"
          @click="activeTab = 'diagnostics'"
        >
          📊 Diagnostics
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'terminal' }"
          @click="activeTab = 'terminal'"
        >
          📟 Terminal & Packets
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'flasher' }"
          @click="activeTab = 'flasher'"
        >
          ⚡ Flasher
        </button>
      </div>
    </header>

    <!-- Error Banner (if error present) -->
    <div v-if="deviceStore.errorMessage" class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-text font-mono">{{ deviceStore.errorMessage }}</span>
      <button class="btn-dismiss-error" @click="deviceStore.errorMessage = null">✕</button>
    </div>

    <!-- Main Tab View Content (Fixed height, internal scroll only) -->
    <div class="workspace-area">
      <!-- TAB 1: Diagnostics & Gauges -->
      <div v-if="activeTab === 'diagnostics'" class="tab-pane diagnostics-grid">
        <!-- Left Column: Attached Devices & Peripherals Rack -->
        <div class="pane-column left-pane">
          <!-- Device #0: ESP32 MCU Dossier -->
          <DeviceDossier />

          <!-- Device #1: OLED Display Peripheral Component -->
          <OledDeviceCard />

          <!-- Add Peripheral Device Rack Slot -->
          <router-link to="/hardware" class="add-device-slot" title="Open Hardware Lab to configure more peripherals">
            <span class="plus-icon">⊕</span>
            <div class="slot-text">
              <span class="slot-title">Add Peripheral Component</span>
              <span class="slot-desc">Attach buttons, rotary encoders, or sensors to I²C/GPIO bus</span>
            </div>
          </router-link>
        </div>

        <!-- Right Column: Memory & Real-time Gauges -->
        <div class="pane-column right-pane">
          <MemoryGauges />
        </div>
      </div>

      <!-- TAB 2: Serial Terminal & Packet Inspector -->
      <div v-else-if="activeTab === 'terminal'" class="tab-pane terminal-grid">
        <div class="terminal-col">
          <SerialTerminal />
        </div>
        <div class="packets-col">
          <PacketInspector />
        </div>
      </div>

      <!-- TAB 3: Firmware Flasher -->
      <div v-else-if="activeTab === 'flasher'" class="tab-pane flasher-pane">
        <FirmwareFlasher />
      </div>
    </div>
  </div>
</template>

<style scoped>
.devices-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden; /* No outer scrollbars */
  background-color: var(--color-bg-base);
}

/* Top Toolbar */
.device-toolbar {
  height: 48px;
  min-height: 48px;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  gap: 1rem;
  z-index: 10;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-icon {
  font-size: 1.1rem;
}

.toolbar-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.toolbar-badge {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-accent);
  background: var(--color-accent-dim);
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(124, 111, 255, 0.25);
}

/* Center Connection Controls */
.toolbar-center {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.port-selector-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.port-select {
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  font-size: 0.78rem;
  padding: 0.25rem 0.5rem;
  outline: none;
  max-width: 220px;
}

.btn-refresh {
  background: none;
  border: none;
  border-left: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted);
  padding: 0.25rem 0.45rem;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-refresh:hover:not(:disabled) {
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.baud-select {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  outline: none;
}

.btn-connect {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.35rem 0.85rem;
  border-radius: 6px;
  border: none;
  background: var(--color-accent);
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-connect:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-connect--connected {
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.btn-connect--connected:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.28);
}

.btn-connect:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-ping {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.btn-ping:hover {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}

.latency {
  color: #34d399;
  font-size: 0.7rem;
}

/* Tabs */
.toolbar-tabs {
  margin-left: auto;
  gap: 0.35rem;
}

.tab-btn {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
}

.tab-btn--active {
  background: var(--color-bg-elevated);
  border-color: var(--color-border);
  color: var(--color-accent-hover);
  font-weight: 700;
}

/* Error Banner */
.error-banner {
  background: rgba(239, 68, 68, 0.12);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  padding: 0.35rem 1rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-dismiss-error {
  margin-left: auto;
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
}

/* Workspace Area */
.workspace-area {
  flex: 1;
  min-height: 0; /* Crucial for inner scrollable containers */
  padding: 0.75rem 1rem;
  overflow: hidden;
}

.tab-pane {
  height: 100%;
  min-height: 0;
}

/* Tab 1: Diagnostics Grid (370px component rack + 1fr telemetry) */
.diagnostics-grid {
  display: grid;
  grid-template-columns: 370px 1fr;
  grid-template-rows: minmax(0, 1fr);
  gap: 1.25rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.pane-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.pane-column::-webkit-scrollbar {
  width: 6px;
}

.pane-column::-webkit-scrollbar-track {
  background: transparent;
}

.pane-column::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.pane-column::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-subtle);
}

/* Add Peripheral Device Rack Slot */
.add-device-slot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.015);
  color: var(--color-text-muted);
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-device-slot:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-dim);
  color: var(--color-accent-hover);
}

.add-device-slot .plus-icon {
  font-size: 1.25rem;
  color: var(--color-accent);
  line-height: 1;
}

.slot-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.slot-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.add-device-slot:hover .slot-title {
  color: var(--color-accent-hover);
}

.slot-desc {
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

/* Tab 2: Terminal Grid */
.terminal-grid {
  display: grid;
  grid-template-columns: 1fr 420px;
  grid-template-rows: minmax(0, 1fr);
  gap: 1rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.terminal-col,
.packets-col {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* Tab 3: Flasher Pane */
.flasher-pane {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.font-mono {
  font-family: monospace;
}
</style>
