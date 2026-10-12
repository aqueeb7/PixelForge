<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWiringStore } from '../../../stores/wiring'
import { useHardwareStore } from '../../../stores/hardware'
import { useDeviceStore } from '../../../stores/device'
import type { PinDefinition } from '../../../types/hardware'
import type { NetNode } from '../../../core/hardware/Netlist'

const emit = defineEmits<{
  (e: 'start-wire', node: NetNode, clientPos: { x: number; y: number }): void
  (e: 'hover-pin', node: NetNode | null): void
  (e: 'drop-wire', node: NetNode): void
}>()

const wiringStore = useWiringStore()
const hardwareStore = useHardwareStore()
const deviceStore = useDeviceStore()

const activeBoard = computed(() => wiringStore.activeBoard)
const isConnected = computed(() => deviceStore.status === 'connected')
const selectedPin = computed(() => hardwareStore.selectedPin)

const leftPins = computed(() => activeBoard.value.left_header)
const rightPins = computed(() => activeBoard.value.right_header)

function handlePinClick(pin: PinDefinition) {
  hardwareStore.selectPin(pin)
  wiringStore.openBoardDossier()
}

// Check if a pin has any wires connected
function isPinConnected(pinLabel: string): boolean {
  return wiringStore.nets.some((net) =>
    net.nodes.some(
      (n) =>
        n.instanceId === 'esp32' &&
        (n.pinId === pinLabel ||
          (pinLabel.includes(n.pinId) && (n.pinId.startsWith('D') || n.pinId.startsWith('P') || n.pinId === '3V3' || n.pinId === 'GND')))
    )
  )
}

function getPinBadge(pin: PinDefinition): string {
  const caps = pin.capabilities
  if (caps.includes('power_3v3')) return '3.3V'
  if (caps.includes('power_5v')) return '5V'
  if (caps.includes('gnd')) return 'GND'
  if (caps.includes('i2c_sda')) return 'SDA'
  if (caps.includes('i2c_scl')) return 'SCL'
  if (caps.includes('spi_mosi') || caps.includes('spi_miso')) return 'SPI'
  if (caps.includes('adc1') || caps.includes('adc2')) return 'ADC'
  return 'IO'
}

function getPinColor(pin: PinDefinition): string {
  const caps = pin.capabilities
  if (caps.includes('power_3v3')) return '#ef4444'
  if (caps.includes('power_5v')) return '#f97316'
  if (caps.includes('gnd')) return '#6b7280'
  if (caps.includes('i2c_sda')) return '#38bdf8'
  if (caps.includes('i2c_scl')) return '#f59e0b'
  if (caps.includes('spi_mosi') || caps.includes('spi_miso')) return '#10b981'
  if (caps.includes('adc1') || caps.includes('adc2')) return '#14b8a6'
  return '#8b5cf6'
}

// Dragging the board itself
const isDraggingBoard = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const initialBoardPos = ref({ x: 0, y: 0 })

function handleBoardMouseDown(e: MouseEvent) {
  if (
    (e.target as HTMLElement).closest('.pin-socket') ||
    (e.target as HTMLElement).closest('.mcu-icon-btn') ||
    (e.target as HTMLElement).closest('.pin-entry')
  ) {
    return
  }

  isDraggingBoard.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  initialBoardPos.value = { ...wiringStore.boardPosition }

  window.addEventListener('mousemove', handleBoardMouseMove)
  window.addEventListener('mouseup', handleBoardMouseUp)
}

function handleBoardMouseMove(e: MouseEvent) {
  if (!isDraggingBoard.value) return
  const dx = (e.clientX - dragStart.value.x) / wiringStore.zoom
  const dy = (e.clientY - dragStart.value.y) / wiringStore.zoom

  wiringStore.updateBoardPosition({
    x: Math.round(initialBoardPos.value.x + dx),
    y: Math.round(initialBoardPos.value.y + dy),
  })
}

function handleBoardMouseUp() {
  isDraggingBoard.value = false
  window.removeEventListener('mousemove', handleBoardMouseMove)
  window.removeEventListener('mouseup', handleBoardMouseUp)
}

// Pin Socket Interactions
function handlePinMouseDown(pin: PinDefinition, e: MouseEvent) {
  e.stopPropagation()
  hardwareStore.selectPin(pin)
  emit('start-wire', { instanceId: 'esp32', pinId: pin.label }, { x: e.clientX, y: e.clientY })
}

function handlePinMouseEnter(pin: PinDefinition) {
  emit('hover-pin', { instanceId: 'esp32', pinId: pin.label })
}

function handlePinMouseLeave() {
  emit('hover-pin', null)
}

function handlePinMouseUp(pin: PinDefinition) {
  emit('drop-wire', { instanceId: 'esp32', pinId: pin.label })
}
</script>

<template>
  <div
    class="esp32-board-node"
    :style="{
      transform: `translate(${wiringStore.boardPosition.x}px, ${wiringStore.boardPosition.y}px)`,
    }"
    @mousedown="handleBoardMouseDown"
  >
    <!-- Brass Mounting Vias in 4 corners -->
    <div class="mounting-via top-left" title="M2 Mounting Via" />
    <div class="mounting-via top-right" title="M2 Mounting Via" />
    <div class="mounting-via bottom-left" title="M2 Mounting Via" />
    <div class="mounting-via bottom-right" title="M2 Mounting Via" />

    <!-- Board PCB Surface -->
    <div class="pcb-body">
      <!-- Top USB Port & Power Reg -->
      <div class="pcb-top-bar">
        <div class="usb-port" title="Micro-USB / Type-C Power & Data Port">
          <div class="usb-metal" />
        </div>
        <div class="top-silkscreen-meta">
          <span class="mcu-tag font-mono">DEVICE #00 · MCU CORE</span>
        </div>
        <div class="ldo-chip" title="AMS1117-3.3 Linear Voltage Regulator (500mA)">
          <span class="ldo-text">3.3V LDO</span>
        </div>
      </div>

      <!-- MCU Hardware Bar & Controls -->
      <div class="mcu-control-bar">
        <div class="mcu-title-group">
          <div class="title-text-stack">
            <span class="board-name font-mono" :title="activeBoard.name">
              {{ activeBoard.name.replace(/\s*\(.*\)/, '') }}
            </span>
            <div class="board-sub-meta">
              <span class="mcu-pins-count font-mono">{{ activeBoard.pin_count }} PINS</span>
              <span class="meta-dot">·</span>
              <span class="mcu-chip-family font-mono">{{ activeBoard.chip_family }}</span>
            </div>
          </div>
        </div>

        <div class="mcu-actions-group">
          <!-- Button 1: Pinout & Silicon Dossier Drawer -->
          <button
            class="mcu-icon-btn btn-info-dossier"
            :class="{ 'is-active': wiringStore.activeDrawer === 'board' }"
            title="ESP32 Pinout Matrix & Silicon Dossier (Esc to close)"
            @click.stop="wiringStore.activeDrawer === 'board' ? wiringStore.closeDrawer() : wiringStore.openBoardDossier()"
          >
            <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <circle cx="12" cy="8" r="1" fill="currentColor" />
            </svg>
          </button>

          <!-- Button 2: Software MCU Reboot -->
          <button
            class="mcu-icon-btn btn-reboot"
            title="Software Reboot MCU (0x06 command)"
            :disabled="!isConnected || deviceStore.isRebooting"
            @click.stop="deviceStore.restart(false)"
          >
            <svg
              class="btn-svg"
              :class="{ 'is-spinning': deviceStore.isRebooting }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.8 1.04 6.44 2.72L21 8" />
              <polyline points="21 3 21 8 16 8" />
            </svg>
          </button>

          <!-- Button 3: Hardware Reset Pulse -->
          <button
            class="mcu-icon-btn btn-reset"
            title="Hardware Reset via DTR/RTS pulse"
            :disabled="!isConnected || deviceStore.isRebooting"
            @click.stop="deviceStore.restart(true)"
          >
            <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Center ESP-WROOM-32 RF Shield & Status LEDs -->
      <div class="mcu-module-area">
        <div class="rf-shield">
          <div class="rf-logo">📡</div>
          <div class="rf-text">
            <span class="rf-title">{{ activeBoard.chip_family }}</span>
            <span class="rf-sub">ESP-WROOM-32 FCC ID: 2AC7Z</span>
          </div>
        </div>

        <div class="board-indicators">
          <div class="indicator-group">
            <div class="led-dot led-pwr" title="3.3V Power Rail Active" />
            <span class="led-label">PWR</span>
          </div>
          <div class="indicator-group">
            <div class="led-dot" :class="isConnected ? 'led-com-active' : 'led-com-idle'" title="UART COM Status" />
            <span class="led-label">COM</span>
          </div>
        </div>
      </div>

      <!-- Dual Header Columns (Physical Through-Hole Solder Pads) -->
      <div class="headers-wrapper">
        <!-- Left Header Column -->
        <div class="header-column left-header">
          <div
            v-for="pin in leftPins"
            :key="pin.pin_number"
            class="pin-entry left-pin-entry"
            :class="{
              'is-connected': isPinConnected(pin.label),
              'is-selected': selectedPin?.label === pin.label,
            }"
            :title="`${pin.label} (Pin ${pin.pin_number}) - Click to inspect in dossier`"
            @click="handlePinClick(pin)"
          >
            <!-- Socket Dot (Wire Anchor) -->
            <div
              class="pin-socket left-socket"
              :data-pin-label="pin.label"
              :style="{ '--socket-color': getPinColor(pin) }"
              @mousedown="handlePinMouseDown(pin, $event)"
              @mouseenter="handlePinMouseEnter(pin)"
              @mouseleave="handlePinMouseLeave"
              @mouseup="handlePinMouseUp(pin)"
            >
              <div class="copper-pad-ring">
                <div class="through-hole" />
              </div>
            </div>

            <!-- Pin Label & Badge -->
            <div class="pin-info left-pin-info">
              <span class="pin-label font-mono">{{ pin.label }}</span>
              <span
                class="pin-cap-badge font-mono"
                :style="{ backgroundColor: `${getPinColor(pin)}22`, color: getPinColor(pin) }"
              >
                {{ getPinBadge(pin) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Center Silkscreen Spine -->
        <div class="board-center-spine">
          <div class="spine-text font-mono">PIXELFORGE · DUAL HEADER</div>
        </div>

        <!-- Right Header Column -->
        <div class="header-column right-header">
          <div
            v-for="pin in rightPins"
            :key="pin.pin_number"
            class="pin-entry right-pin-entry"
            :class="{
              'is-connected': isPinConnected(pin.label),
              'is-selected': selectedPin?.label === pin.label,
            }"
            :title="`${pin.label} (Pin ${pin.pin_number}) - Click to inspect in dossier`"
            @click="handlePinClick(pin)"
          >
            <!-- Pin Label & Badge -->
            <div class="pin-info right-pin-info">
              <span
                class="pin-cap-badge font-mono"
                :style="{ backgroundColor: `${getPinColor(pin)}22`, color: getPinColor(pin) }"
              >
                {{ getPinBadge(pin) }}
              </span>
              <span class="pin-label font-mono">{{ pin.label }}</span>
            </div>

            <!-- Socket Dot (Wire Anchor) -->
            <div
              class="pin-socket right-socket"
              :data-pin-label="pin.label"
              :style="{ '--socket-color': getPinColor(pin) }"
              @mousedown="handlePinMouseDown(pin, $event)"
              @mouseenter="handlePinMouseEnter(pin)"
              @mouseleave="handlePinMouseLeave"
              @mouseup="handlePinMouseUp(pin)"
            >
              <div class="copper-pad-ring">
                <div class="through-hole" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Pinout Silkscreen / Reset & Boot Buttons -->
      <div class="pcb-bottom-bar">
        <div class="tactile-switch" title="EN / Reset Button">
          <div class="switch-button" />
          <span class="switch-label">EN</span>
        </div>
        <div class="bottom-brand font-mono">128×64 STUDIO</div>
        <div class="tactile-switch" title="BOOT / GPIO0 Button">
          <div class="switch-button" />
          <span class="switch-label">BOOT</span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.esp32-board-node {
  position: absolute;
  top: 0;
  left: 0;
  width: 320px;
  user-select: none;
  cursor: grab;
  z-index: 5;
}

.esp32-board-node:active {
  cursor: grabbing;
}

.pcb-body {
  background: linear-gradient(180deg, #141722 0%, #0d0f17 100%);
  border: 2px solid #2e364c;
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  padding: 10px 8px 12px 8px;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Brass Mounting Vias */
.mounting-via {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: radial-gradient(circle, #090b10 40%, #b45309 60%, #d97706 90%, #78350f 100%);
  border: 1px solid rgba(0, 0, 0, 0.6);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  z-index: 2;
}

.top-left { top: 6px; left: 6px; }
.top-right { top: 6px; right: 6px; }
.bottom-left { bottom: 6px; left: 6px; }
.bottom-right { bottom: 6px; right: 6px; }

/* Top USB & LDO */
.pcb-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.usb-port {
  width: 48px;
  height: 18px;
  background-color: #2a2d3d;
  border: 1px solid #4a5068;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.usb-metal {
  width: 28px;
  height: 8px;
  background: linear-gradient(180deg, #64748b 0%, #334155 100%);
  border-radius: 2px;
}

.top-silkscreen-meta {
  display: flex;
  align-items: center;
}

.mcu-tag {
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: #38bdf8;
  font-weight: 700;
}

.ldo-chip {
  background-color: #1e2130;
  border: 1px solid #373d54;
  padding: 2px 6px;
  border-radius: 3px;
}

.ldo-text {
  font-size: 0.58rem;
  font-family: monospace;
  color: #94a3b8;
}

/* MCU Control Bar */
.mcu-control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background-color: #0b0c12;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  gap: 8px;
}

.mcu-title-group {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.title-text-stack {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.board-name {
  font-size: 0.73rem;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.board-sub-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.53rem;
  color: #64748b;
  letter-spacing: 0.05em;
  font-weight: 600;
  white-space: nowrap;
}

.mcu-pins-count {
  color: #94a3b8;
}

.meta-dot {
  opacity: 0.4;
}

.mcu-chip-family {
  color: #38bdf8;
}

/* MCU Icon Action Buttons */
.mcu-actions-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.mcu-icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #141824;
  color: #94a3b8;
  padding: 0;
}

.mcu-icon-btn .btn-svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Info & Pinout Dossier Button */
.btn-info-dossier:hover,
.btn-info-dossier.is-active {
  background: rgba(56, 189, 248, 0.18);
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
}

/* Software Reboot Button */
.btn-reboot:hover:not(:disabled) {
  background: rgba(129, 140, 248, 0.18);
  border-color: #818cf8;
  color: #818cf8;
  box-shadow: 0 0 10px rgba(129, 140, 248, 0.35);
}

/* Hardware Reset Button */
.btn-reset:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.18);
  border-color: #ef4444;
  color: #f87171;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
}

.mcu-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Center MCU RF Shield */
.mcu-module-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 6px;
  padding: 6px 10px;
  background-color: #0b0c12;
  border: 1px solid #232738;
  border-radius: 6px;
}

.rf-shield {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rf-logo {
  font-size: 1.1rem;
}

.rf-text {
  display: flex;
  flex-direction: column;
}

.rf-title {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: monospace;
  color: #e2e8f0;
}

.rf-sub {
  font-size: 0.58rem;
  color: #64748b;
}

.board-indicators {
  display: flex;
  gap: 8px;
}

.indicator-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.led-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.led-pwr {
  background-color: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.led-com-active {
  background-color: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}

.led-com-idle {
  background-color: #475569;
}

.led-label {
  font-size: 0.55rem;
  font-family: monospace;
  color: #64748b;
}

/* Header Columns */
.headers-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  position: relative;
  margin: 6px 0;
  width: 100%;
  box-sizing: border-box;
}

.header-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.left-header {
  align-items: flex-start;
}

.right-header {
  align-items: flex-end;
}

.board-center-spine {
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: vertical-lr;
  transform: rotate(180deg);
  opacity: 0.25;
  padding: 0 4px;
  flex-shrink: 0;
}

.spine-text {
  font-size: 0.55rem;
  letter-spacing: 0.15em;
  color: #94a3b8;
}

.pin-entry {
  display: flex;
  align-items: center;
  height: 22px;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  cursor: pointer;
  border-radius: 4px;
  padding: 0 4px;
  transition: background-color 0.15s ease;
}

.pin-entry:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.pin-entry.is-selected {
  background-color: rgba(56, 189, 248, 0.2);
  outline: 1.5px solid #38bdf8;
}

.left-pin-entry {
  justify-content: flex-start;
  gap: 6px;
}

.right-pin-entry {
  justify-content: flex-end;
  gap: 6px;
}

/* Sockets with Copper Pad Rings */
.pin-socket {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: crosshair;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.copper-pad-ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle, #b45309 30%, #78350f 70%, #451a03 100%);
  border: 1.5px solid var(--socket-color, #7c6fff);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}

.through-hole {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: #000;
}

.pin-socket:hover {
  transform: scale(1.35);
}

.pin-socket:hover .copper-pad-ring {
  border-color: #fff;
  box-shadow: 0 0 8px var(--socket-color, #7c6fff);
}

.is-connected .copper-pad-ring {
  box-shadow: 0 0 5px var(--socket-color, #7c6fff);
}

/* Pin Info */
.pin-info {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.left-pin-info {
  justify-content: flex-start;
  margin-right: auto;
}

.right-pin-info {
  justify-content: flex-end;
  text-align: right;
  margin-left: auto;
}

.pin-label {
  font-size: 0.65rem;
  color: #cbd5e1;
  font-weight: 600;
}

.pin-cap-badge {
  font-size: 0.52rem;
  font-weight: 700;
  padding: 0.05rem 0.25rem;
  border-radius: 2px;
}

/* Bottom Bar */
.pcb-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 0 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.tactile-switch {
  display: flex;
  align-items: center;
  gap: 4px;
}

.switch-button {
  width: 8px;
  height: 8px;
  background-color: #475569;
  border: 1px solid #64748b;
  border-radius: 2px;
}

.switch-label {
  font-size: 0.55rem;
  font-family: monospace;
  color: #64748b;
}

.bottom-brand {
  font-size: 0.55rem;
  color: #475569;
  letter-spacing: 0.1em;
}
</style>
