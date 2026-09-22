<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useHardwareStore } from '../stores/hardware'
import { useDeviceStore } from '../stores/device'

// Hardware Rack & Board Components
import Esp32BoardView from '../components/hardware/Esp32BoardView.vue'
import PinInspector from '../components/hardware/PinInspector.vue'
import PeripheralManager from '../components/hardware/PeripheralManager.vue'
import OledDeviceCard from '../components/monitor/OledDeviceCard.vue'
import DeviceDossier from '../components/monitor/DeviceDossier.vue'

// Diagnostics, Console & Tools Components
import MemoryGauges from '../components/monitor/MemoryGauges.vue'
import SerialTerminal from '../components/monitor/SerialTerminal.vue'
import PacketInspector from '../components/monitor/PacketInspector.vue'
import FirmwareFlasher from '../components/monitor/FirmwareFlasher.vue'

const hardwareStore = useHardwareStore()
const deviceStore = useDeviceStore()

export type StudioTab = 'rack' | 'telemetry' | 'console' | 'flasher'
const activeTab = ref<StudioTab>('rack')

onMounted(async () => {
  await hardwareStore.init()
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

async function handleSave() {
  await hardwareStore.save()
}
</script>

<template>
  <div class="hardware-studio">
    <!-- Top Action & Connection Toolbar (Fixed 48px matching DrawView) -->
    <header class="studio-toolbar">
      <!-- Left: Studio Identity -->
      <div class="toolbar-group toolbar-left">
        <span class="toolbar-icon">🎛️</span>
        <h2 class="toolbar-title">Hardware Studio</h2>
      </div>

      <!-- Center: Hardware & Connection Controls -->
      <div class="toolbar-group toolbar-center">
        <!-- Target Board Selector -->
        <div class="selector-wrapper" title="Select target development board definition">
          <label class="selector-prefix font-mono">MCU:</label>
          <select
            id="board-select"
            class="clean-select board-select font-mono"
            :value="hardwareStore.selectedBoardId"
            @change="(e) => hardwareStore.selectBoard((e.target as HTMLSelectElement).value)"
          >
            <option
              v-for="b in hardwareStore.boards"
              :key="b.id"
              :value="b.id"
            >
              {{ b.name }}
            </option>
          </select>
        </div>

        <div class="toolbar-divider" />

        <!-- Serial Port Selector -->
        <div class="port-selector-wrapper" title="Serial COM port">
          <select
            id="port-select"
            v-model="deviceStore.selectedPort"
            class="clean-select port-select font-mono"
            :disabled="deviceStore.status === 'connected' || deviceStore.status === 'connecting'"
          >
            <option v-if="deviceStore.ports.length === 0" value="" disabled>
              No COM ports
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
            class="btn-icon-refresh"
            title="Scan available COM ports"
            :disabled="deviceStore.status === 'connecting'"
            @click="deviceStore.refreshPorts"
          >
            🔄
          </button>
        </div>

        <!-- Baud Rate Selector -->
        <div class="selector-wrapper" title="Baud rate">
          <select
            v-model.number="deviceStore.baudRate"
            class="clean-select baud-select font-mono"
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

      <!-- Right: Studio Mode Switchers & Config Persistence -->
      <div class="toolbar-group toolbar-right">
        <!-- Studio Mode Switcher Tabs -->
        <div class="studio-tabs">
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'rack' }"
            title="Rack & Wiring: ESP32 board and attached peripheral components"
            @click="activeTab = 'rack'"
          >
            ⚡ Rack
          </button>
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'telemetry' }"
            title="Runtime Telemetry: Live dynamic memory allocations & framerate"
            @click="activeTab = 'telemetry'"
          >
            📊 Telemetry
          </button>
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'console' }"
            title="Serial Console: Log output & packet inspector"
            @click="activeTab = 'console'"
          >
            📟 Console
          </button>
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'flasher' }"
            title="Firmware Flasher: Bootloader image upload"
            @click="activeTab = 'flasher'"
          >
            🔥 Flasher
          </button>
        </div>

        <div class="toolbar-divider" />

        <!-- Save Status Toast -->
        <span v-if="hardwareStore.errorMessage" class="status-msg error-msg" :title="hardwareStore.errorMessage">
          ⚠️ Error
        </span>
        <span
          v-else-if="hardwareStore.lastSaved"
          class="status-msg save-msg"
          :title="'Saved at ' + hardwareStore.lastSaved.toLocaleTimeString()"
        >
          ✓ Saved
        </span>

        <!-- Save Config Button -->
        <button
          class="btn-save"
          :disabled="hardwareStore.isSaving"
          title="Persist board & connection graph to hardware.json"
          @click="handleSave"
        >
          {{ hardwareStore.isSaving ? 'Saving…' : '💾 Save' }}
        </button>
      </div>
    </header>

    <!-- Error Banner (if connection error present) -->
    <div v-if="deviceStore.errorMessage" class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-text font-mono">{{ deviceStore.errorMessage }}</span>
      <button class="btn-dismiss-error" @click="deviceStore.errorMessage = null">✕</button>
    </div>

    <!-- Main Studio Workspace Area (100% height, zero window scrollbar) -->
    <main class="studio-workspace">
      <!-- MODE 1: Rack & Wiring (Board + Components Rack + Net Linking) -->
      <div v-if="activeTab === 'rack'" class="tab-pane rack-grid">
        <!-- Left Column: Interactive Visual MCU Board -->
        <div class="board-column">
          <Esp32BoardView />
        </div>

        <!-- Right Column: Hardware Dossier, Peripherals Rack & Pin Dossier -->
        <aside class="rack-sidebar">
          <!-- Active Pin Dossier (appears at top when a pin is clicked on the board) -->
          <PinInspector v-if="hardwareStore.selectedPin" />

          <!-- Device #00: Silicon & Hardware Dossier -->
          <DeviceDossier />

          <!-- Peripheral #01: OLED Display Physical Component Chassis -->
          <OledDeviceCard />

          <!-- Attached Peripherals & Bus Configurator -->
          <PeripheralManager />
        </aside>
      </div>

      <!-- MODE 2: Runtime Telemetry (Gauges, Allocations & Framerate) -->
      <div v-else-if="activeTab === 'telemetry'" class="tab-pane telemetry-pane">
        <MemoryGauges />
      </div>

      <!-- MODE 3: Serial Console & Packet Demux Inspector -->
      <div v-else-if="activeTab === 'console'" class="tab-pane console-grid">
        <div class="console-col">
          <SerialTerminal />
        </div>
        <div class="packets-col">
          <PacketInspector />
        </div>
      </div>

      <!-- MODE 4: ESP32 Bootloader & Firmware Flasher -->
      <div v-else-if="activeTab === 'flasher'" class="tab-pane flasher-pane">
        <FirmwareFlasher />
      </div>
    </main>
  </div>
</template>

<style scoped>
.hardware-studio {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden; /* Strict: no outer window scrollbars */
  background-color: var(--color-bg-base);
}

/* Fixed Top Studio Toolbar */
.studio-toolbar {
  height: 48px;
  min-height: 48px;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  gap: 0.5rem;
  z-index: 10;
  flex-shrink: 0;
  overflow: hidden;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.toolbar-left {
  flex-shrink: 0;
}

.toolbar-icon {
  font-size: 1.05rem;
}

.toolbar-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border-subtle);
  margin: 0 0.15rem;
  flex-shrink: 0;
}

/* Center Connection & Hardware Controls */
.toolbar-center {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 1;
  min-width: 0;
}

.selector-wrapper {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
  flex-shrink: 1;
  min-width: 0;
}

.selector-prefix {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.clean-select {
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  font-size: 0.75rem;
  outline: none;
  cursor: pointer;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.board-select {
  max-width: 140px;
}

.clean-select option {
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.port-selector-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 1;
  min-width: 0;
}

.port-selector-wrapper .clean-select {
  padding: 0.22rem 0.4rem;
  max-width: 110px;
}

.btn-icon-refresh {
  background: none;
  border: none;
  border-left: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted);
  padding: 0.22rem 0.35rem;
  cursor: pointer;
  font-size: 0.7rem;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-icon-refresh:hover:not(:disabled) {
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.baud-select {
  max-width: 72px;
}

.btn-connect {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.28rem 0.65rem;
  border-radius: 6px;
  border: none;
  background: var(--color-accent);
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
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
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.22rem 0.45rem;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-ping:hover {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}

.latency {
  color: #34d399;
  font-size: 0.68rem;
}

/* Right Tabs & Persistence */
.toolbar-right {
  margin-left: auto;
  gap: 0.35rem;
  flex-shrink: 0;
}

.studio-tabs {
  display: flex;
  align-items: center;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.tab-btn {
  font-size: 0.71rem;
  font-weight: 600;
  padding: 0.22rem 0.5rem;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tab-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
}

.tab-btn--active {
  background: var(--color-bg-elevated);
  color: var(--color-accent-hover);
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.btn-save {
  background: var(--color-accent);
  color: white;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.28rem 0.65rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-save:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-msg {
  font-size: 0.68rem;
  font-weight: 500;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.save-msg {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.error-msg {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
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

/* Main Studio Workspace */
.studio-workspace {
  flex: 1;
  min-height: 0; /* Crucial for internal scroll containers */
  padding: 0.75rem 1rem;
  overflow: hidden;
}

.tab-pane {
  height: 100%;
  min-height: 0;
}

/* MODE 1: Rack & Wiring Grid */
.rack-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 440px;
  grid-template-rows: minmax(0, 1fr);
  gap: 1.25rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.board-column {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.rack-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow-y: auto; /* Internal scrolling in right rack */
  overflow-x: hidden;
  padding-right: 6px;
}

.rack-sidebar > * {
  flex-shrink: 0;
}

.rack-sidebar::-webkit-scrollbar {
  width: 6px;
}

.rack-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.rack-sidebar::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.rack-sidebar::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-subtle);
}

/* MODE 2: Telemetry Pane */
.telemetry-pane {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

/* MODE 3: Serial Console & Packet Grid */
.console-grid {
  display: grid;
  grid-template-columns: 1fr 420px;
  grid-template-rows: minmax(0, 1fr);
  gap: 1rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.console-col,
.packets-col {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* MODE 4: Firmware Flasher Pane */
.flasher-pane {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.font-mono {
  font-family: monospace;
}
</style>
