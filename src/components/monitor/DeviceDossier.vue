<script setup lang="ts">
import { computed } from 'vue'
import { useDeviceStore } from '../../stores/device'
import { useHardwareStore } from '../../stores/hardware'

const deviceStore = useDeviceStore()
const hardwareStore = useHardwareStore()

const dossier = computed(() => deviceStore.chipDossier)
const board = computed(() => hardwareStore.activeBoard)
const isConnected = computed(() => deviceStore.status === 'connected')

function formatMb(bytes?: number): string {
  if (!bytes) return 'N/A'
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}
</script>

<template>
  <div class="physical-device-card mcu-dossier-card" :class="{ 'device--active': isConnected }">
    <!-- Corner Brass Mounting Vias -->
    <div class="mounting-hole top-left" title="M2 Mounting Via" />
    <div class="mounting-hole top-right" title="M2 Mounting Via" />
    <div class="mounting-hole bottom-left" title="M2 Mounting Via" />
    <div class="mounting-hole bottom-right" title="M2 Mounting Via" />

    <!-- PCB Header: Meta & Reboot Controls -->
    <div class="pcb-header">
      <div class="component-meta">
        <div class="tag-row">
          <span class="pcb-badge">DEVICE #00</span>
          <span class="pcb-subtext font-mono">MCU CORE</span>
        </div>
        <h4 class="component-name">Silicon & Hardware Dossier</h4>
      </div>

      <div class="header-actions">
        <button
          class="btn-mcu-action"
          title="Software reboot via command 0x06"
          :disabled="!isConnected"
          @click="deviceStore.restart(false)"
        >
          ↺ Reboot
        </button>
        <button
          class="btn-mcu-action btn-danger"
          title="Hardware reset via DTR/RTS pulse"
          :disabled="!isConnected"
          @click="deviceStore.restart(true)"
        >
          ⚡ Reset
        </button>
      </div>
    </div>

    <!-- Active Carrier Board Reference Strip -->
    <div class="carrier-board-strip">
      <div class="carrier-info">
        <span class="carrier-label">CARRIER:</span>
        <span class="carrier-name font-mono">{{ board.name }}</span>
      </div>
      <div class="carrier-meta">
        <span class="carrier-badge font-mono">{{ board.pin_count }}P</span>
        <span class="carrier-chip-tag font-mono">{{ board.chip_family }}</span>
      </div>
    </div>

    <!-- Disconnected State -->
    <div v-if="!isConnected && !dossier" class="disconnected-dossier-notice">
      <span class="notice-icon">🔌</span>
      <p>Connect ESP32 via USB Serial to read silicon stepping, MAC address, and flash memory.</p>
    </div>

    <!-- Connected Silicon Data Grid -->
    <div v-else-if="dossier" class="dossier-grid font-mono">
      <div class="dossier-row">
        <span class="field-label">Silicon:</span>
        <span class="field-val chip-highlight">
          {{ dossier.chip_model }} <span class="sub-rev">r{{ dossier.revision }}</span>
        </span>
      </div>

      <div class="dossier-row">
        <span class="field-label">MAC:</span>
        <span class="field-val">{{ dossier.mac_address }}</span>
      </div>

      <div class="dossier-row">
        <span class="field-label">Flash:</span>
        <span class="field-val">
          {{ formatMb(dossier.flash_size_bytes) }} · {{ dossier.flash_mode }}
        </span>
      </div>

      <div class="dossier-row">
        <span class="field-label">Clocks:</span>
        <span class="field-val">
          {{ dossier.cpu_freq_mhz }}MHz · {{ dossier.crystal_freq_mhz }}M XTAL
        </span>
      </div>

      <!-- Feature Tags -->
      <div class="features-wrapper">
        <span class="field-label">Features:</span>
        <div class="tags-container">
          <span
            v-for="(feat, idx) in dossier.features"
            :key="idx"
            class="feature-tag"
          >
            {{ feat }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Physical Device Chassis / PCB */
.physical-device-card {
  position: relative;
  background: #090d14;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.85rem 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s ease;
  flex-shrink: 0;
  min-height: fit-content;
}

.physical-device-card.device--active {
  border-color: rgba(56, 189, 248, 0.35);
}

/* Corner Brass Mounting Vias */
.mounting-hole {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #020408;
  border: 1.5px solid #d97706; /* Brass ring */
  box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.top-left { top: 6px; left: 6px; }
.top-right { top: 6px; right: 6px; }
.bottom-left { bottom: 6px; left: 6px; }
.bottom-right { bottom: 6px; right: 6px; }

/* PCB Silkscreen Header */
.pcb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  padding-bottom: 0.5rem;
  gap: 0.5rem;
}

.component-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pcb-badge {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  background: rgba(124, 111, 255, 0.15);
  color: #a78bfa;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(124, 111, 255, 0.3);
}

.pcb-subtext {
  font-size: 0.65rem;
  color: #64748b;
  font-weight: 600;
}

.component-name {
  font-size: 0.86rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.btn-mcu-action {
  background: #0f172a;
  border: 1px solid #334155;
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-mcu-action:hover:not(:disabled) {
  background: #1e293b;
  color: #f1f5f9;
  border-color: #64748b;
}

.btn-mcu-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger:hover:not(:disabled) {
  border-color: #ef4444;
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
}

/* Carrier Board Reference Strip */
.carrier-board-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #04070d;
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 0.3rem 0.55rem;
  border-radius: 5px;
  font-size: 0.72rem;
  gap: 0.5rem;
}

.carrier-info {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  overflow: hidden;
}

.carrier-label {
  color: #64748b;
  font-size: 0.62rem;
  font-weight: 700;
  flex-shrink: 0;
}

.carrier-name {
  color: #cbd5e1;
  font-weight: 600;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carrier-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.carrier-badge {
  font-size: 0.6rem;
  font-weight: 700;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.carrier-chip-tag {
  font-size: 0.62rem;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Disconnected Notice */
.disconnected-dossier-notice {
  padding: 1rem 0.5rem;
  text-align: center;
  color: #64748b;
  font-size: 0.76rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.notice-icon {
  font-size: 1.2rem;
  opacity: 0.6;
}

.disconnected-dossier-notice p {
  margin: 0;
  line-height: 1.35;
}

/* Silicon Data Grid */
.dossier-grid {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
  font-size: 0.74rem;
}

.dossier-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.18rem 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
  gap: 0.5rem;
}

.field-label {
  color: #64748b;
  font-weight: 600;
  font-size: 0.7rem;
  flex-shrink: 0;
}

.field-val {
  color: #cbd5e1;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-highlight {
  color: #38bdf8;
}

.sub-rev {
  color: #64748b;
  font-size: 0.68rem;
}

.features-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-top: 0.2rem;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.feature-tag {
  font-size: 0.62rem;
  font-weight: 700;
  background: #0c121e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  padding: 1px 5px;
  border-radius: 3px;
}

.font-mono {
  font-family: monospace;
}
</style>
