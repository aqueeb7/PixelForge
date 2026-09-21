<script setup lang="ts">
import { computed } from 'vue'
import { useHardwareStore } from '../../stores/hardware'
import type { PinDefinition } from '../../types/hardware'

const hardwareStore = useHardwareStore()

const leftPins = computed(() => hardwareStore.activeBoard.left_header)
const rightPins = computed(() => hardwareStore.activeBoard.right_header)

function getPinClass(pin: PinDefinition): string {
  const caps = pin.capabilities
  if (caps.includes('flash_reserved')) return 'pin-flash'
  if (caps.includes('power_3v3') || caps.includes('power_5v')) return 'pin-power'
  if (caps.includes('gnd')) return 'pin-gnd'
  if (caps.includes('i2c_sda') || caps.includes('i2c_scl')) return 'pin-i2c'
  if (caps.includes('spi_mosi') || caps.includes('spi_miso') || caps.includes('spi_sck') || caps.includes('spi_cs')) return 'pin-spi'
  if (caps.includes('dac')) return 'pin-dac'
  if (caps.includes('adc1') || caps.includes('adc2')) return 'pin-adc'
  return 'pin-gpio'
}

function getPrimaryCapBadge(pin: PinDefinition): string {
  const caps = pin.capabilities
  if (caps.includes('flash_reserved')) return 'FLASH'
  if (caps.includes('power_3v3')) return '3.3V'
  if (caps.includes('power_5v')) return '5V'
  if (caps.includes('gnd')) return 'GND'
  if (caps.includes('i2c_sda')) return 'SDA'
  if (caps.includes('i2c_scl')) return 'SCL'
  if (caps.includes('spi_mosi')) return 'MOSI'
  if (caps.includes('spi_miso')) return 'MISO'
  if (caps.includes('spi_sck')) return 'SCK'
  if (caps.includes('spi_cs')) return 'CS'
  if (caps.includes('dac')) return 'DAC'
  if (caps.includes('adc1')) return 'ADC1'
  if (caps.includes('adc2')) return 'ADC2'
  if (caps.includes('uart_tx')) return 'TX'
  if (caps.includes('uart_rx')) return 'RX'
  if (caps.includes('reset')) return 'RST'
  return 'IO'
}

function getAssignments(pin: PinDefinition) {
  return hardwareStore.pinAssignments.get(pin.label) || []
}

function isPinSelected(pin: PinDefinition): boolean {
  return hardwareStore.selectedPin?.label === pin.label
}

function isPinHovered(pin: PinDefinition): boolean {
  return hardwareStore.hoveredPin?.label === pin.label
}
</script>

<template>
  <div class="board-view-container">
    <div class="board-header-bar">
      <div class="board-meta">
        <span class="chip-badge">{{ hardwareStore.activeBoard.chip_family }}</span>
        <h3 class="board-title">{{ hardwareStore.activeBoard.name }}</h3>
      </div>
      <div class="board-stats">
        <span class="stat-tag">{{ hardwareStore.activeBoard.pin_count }} Physical Pins</span>
        <span class="stat-tag">Dual Row 2.54mm Pitch</span>
      </div>
    </div>

    <div class="board-stage">
      <!-- Left Header Pins Column -->
      <div class="header-column left-column">
        <div class="header-label-tag">LEFT HEADER (J1)</div>
        <div class="pin-rows">
          <div
            v-for="pin in leftPins"
            :key="pin.pin_number"
            class="pin-row left-pin-row"
            :class="{
              'is-selected': isPinSelected(pin),
              'is-hovered': isPinHovered(pin),
              'has-assignment': getAssignments(pin).length > 0,
            }"
            @click="hardwareStore.selectPin(pin)"
            @mouseenter="hardwareStore.setHoveredPin(pin)"
            @mouseleave="hardwareStore.setHoveredPin(null)"
          >
            <!-- Peripheral Assignment Badge (shown on outside) -->
            <div class="assignment-tags-wrapper left-outside">
              <span
                v-for="(asgn, idx) in getAssignments(pin)"
                :key="idx"
                class="asgn-badge"
                :class="`asgn-${asgn.peripheralType.toLowerCase()}`"
                :title="`${asgn.peripheralName} [${asgn.role}]`"
              >
                {{ asgn.role }}
              </span>
            </div>

            <!-- Strapping Warning Icon -->
            <span v-if="pin.is_strapping" class="strap-icon" title="Strapping Pin: Boot/flash timing critical">⚠️</span>

            <!-- Primary capability badge -->
            <span class="cap-badge" :class="getPinClass(pin)">
              {{ getPrimaryCapBadge(pin) }}
            </span>

            <!-- Pin label -->
            <span class="pin-label-text">{{ pin.label }}</span>

            <!-- Physical pin index number -->
            <span class="pin-idx-badge">{{ pin.pin_number }}</span>

            <!-- Physical header pad -->
            <div class="pin-pad-socket">
              <div class="pin-hole" />
            </div>
          </div>
        </div>
      </div>

      <!-- Central Physical ESP32 PCB Module Graphic -->
      <div class="pcb-module">
        <div class="pcb-top-section">
          <!-- Meander Antenna Graphic -->
          <div class="antenna-trace" title="2.4 GHz Onboard Inverted-F PCB Trace Antenna">
            <div class="antenna-pattern" />
          </div>
        </div>

        <!-- ESP-WROOM-32 Metal RF Shield -->
        <div class="rf-shield">
          <div class="shield-silkscreen">
            <div class="shield-logo">
              <span class="shield-icon">⬡</span>
              <span class="shield-title">ESP-WROOM-32</span>
            </div>
            <div class="shield-specs">
              <span>WiFi: 802.11 b/g/n</span>
              <span>BT: v4.2 BR/EDR & BLE</span>
              <span>Dual Core 240MHz</span>
            </div>
            <div class="shield-fcc">FCC ID: 2AC7Z-ESPWROOM32</div>
          </div>
        </div>

        <!-- Center components on PCB (flex expands to match 15 or 19 pins) -->
        <div class="pcb-center-components">
          <div class="chip-crystal">
            <span class="crystal-text">40MHz</span>
          </div>

          <!-- Tactile Buttons -->
          <div class="pcb-tactile-buttons">
            <div class="tactile-btn" title="EN (Reset Button)">
              <div class="btn-top" />
              <span class="btn-label">EN</span>
            </div>

            <div class="tactile-btn" title="BOOT / GPIO0 Button">
              <div class="btn-top" />
              <span class="btn-label">BOOT</span>
            </div>
          </div>

          <!-- Onboard Status LEDs -->
          <div class="pcb-leds">
            <div class="led red-led" title="Power LED (3.3V)">
              <div class="led-light" />
              <span class="led-label">PWR</span>
            </div>
            <div class="led blue-led" title="GPIO2 User LED">
              <div class="led-light" />
              <span class="led-label">D2</span>
            </div>
          </div>

          <!-- PCB Silkscreen Model Identifier -->
          <div class="pcb-model-silkscreen">
            <span>{{ hardwareStore.activeBoard.form_factor.toUpperCase() }}</span>
          </div>
        </div>

        <!-- Micro-USB Port at bottom -->
        <div class="pcb-bottom-section">
          <div class="usb-port" title="Micro-USB Programming & Power Port">
            <div class="usb-cavity" />
            <span class="usb-label">USB UART</span>
          </div>
        </div>
      </div>

      <!-- Right Header Pins Column -->
      <div class="header-column right-column">
        <div class="header-label-tag">RIGHT HEADER (J2)</div>
        <div class="pin-rows">
          <div
            v-for="pin in rightPins"
            :key="pin.pin_number"
            class="pin-row right-pin-row"
            :class="{
              'is-selected': isPinSelected(pin),
              'is-hovered': isPinHovered(pin),
              'has-assignment': getAssignments(pin).length > 0,
            }"
            @click="hardwareStore.selectPin(pin)"
            @mouseenter="hardwareStore.setHoveredPin(pin)"
            @mouseleave="hardwareStore.setHoveredPin(null)"
          >
            <!-- Physical header pad -->
            <div class="pin-pad-socket">
              <div class="pin-hole" />
            </div>

            <!-- Physical pin index number -->
            <span class="pin-idx-badge">{{ pin.pin_number }}</span>

            <!-- Pin label -->
            <span class="pin-label-text">{{ pin.label }}</span>

            <!-- Primary capability badge -->
            <span class="cap-badge" :class="getPinClass(pin)">
              {{ getPrimaryCapBadge(pin) }}
            </span>

            <!-- Strapping Warning Icon -->
            <span v-if="pin.is_strapping" class="strap-icon" title="Strapping Pin: Boot/flash timing critical">⚠️</span>

            <!-- Peripheral Assignment Badge (shown on outside) -->
            <div class="assignment-tags-wrapper right-outside">
              <span
                v-for="(asgn, idx) in getAssignments(pin)"
                :key="idx"
                class="asgn-badge"
                :class="`asgn-${asgn.peripheralType.toLowerCase()}`"
                :title="`${asgn.peripheralName} [${asgn.role}]`"
              >
                {{ asgn.role }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-view-container {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  max-height: 100%;
}

.board-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.board-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.chip-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(124, 111, 255, 0.2);
  color: var(--color-accent);
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  border: 1px solid rgba(124, 111, 255, 0.3);
}

.board-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.board-stats {
  display: flex;
  gap: 0.5rem;
}

.stat-tag {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-base);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

/* Main Stage */
.board-stage {
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: 0.75rem;
  gap: 0.75rem;
  overflow: hidden;
  flex: 1;
}

/* Header Columns */
.header-column {
  display: flex;
  flex-direction: column;
  min-width: 175px;
}

.header-label-tag {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  text-align: center;
  margin-bottom: 0.35rem;
}

.pin-rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pin-row {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border: 1px solid transparent;
}

.left-pin-row {
  justify-content: flex-end;
  gap: 6px;
}

.right-pin-row {
  justify-content: flex-start;
  gap: 6px;
}

.pin-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}

.pin-row.is-selected {
  background: rgba(124, 111, 255, 0.15);
  border-color: var(--color-accent);
  box-shadow: 0 0 10px rgba(124, 111, 255, 0.25);
}

.pin-row.is-hovered {
  border-color: var(--color-accent-hover);
}

.pin-row.has-assignment {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.3);
}

.pin-label-text {
  font-family: monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.pin-idx-badge {
  font-family: monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-text-muted);
  min-width: 18px;
  text-align: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  padding: 1px 3px;
}

.strap-icon {
  font-size: 0.7rem;
}

/* Capability Badges */
.cap-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.pin-flash {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
  border: 1px dashed rgba(239, 68, 68, 0.5);
}

.pin-power {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.pin-gnd {
  background: rgba(100, 116, 139, 0.25);
  color: #cbd5e1;
  border: 1px solid rgba(100, 116, 139, 0.4);
}

.pin-i2c {
  background: rgba(6, 182, 212, 0.2);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.4);
}

.pin-spi {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.4);
}

.pin-dac {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.pin-adc {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.pin-gpio {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

/* Pin Pad Sockets */
.pin-pad-socket {
  width: 14px;
  height: 14px;
  background: #2a2a38;
  border: 1px solid #4a4a5e;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pin-hole {
  width: 6px;
  height: 6px;
  background: #0f0f14;
  border: 1px solid #717188;
  border-radius: 50%;
}

.pin-row.is-selected .pin-pad-socket {
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.pin-row.is-selected .pin-hole {
  background: #ffffff;
}

/* Assignment Badges */
.assignment-tags-wrapper {
  display: flex;
  gap: 4px;
}

.asgn-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  background: #059669;
  color: #ecfdf5;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
  white-space: nowrap;
}

/* Central ESP32 PCB Module */
.pcb-module {
  width: 160px;
  background: #111a14; /* Authentic dark PCB solder mask */
  border: 2px solid #233827;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.8), 0 8px 24px rgba(0, 0, 0, 0.4);
  position: relative;
  align-self: stretch;
}

.pcb-top-section {
  width: 100%;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.antenna-trace {
  width: 90%;
  height: 24px;
  background: #0d130e;
  border: 1px solid #4ade80;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.antenna-pattern {
  width: 80%;
  height: 8px;
  background: repeating-linear-gradient(
    90deg,
    #4ade80,
    #4ade80 4px,
    transparent 4px,
    transparent 8px
  );
}

/* RF Shield */
.rf-shield {
  width: 130px;
  height: 140px;
  background: linear-gradient(145deg, #a3a3a3 0%, #737373 40%, #525252 100%);
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  padding: 8px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.6), inset 1px 1px 2px rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.shield-silkscreen {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
  color: #1c1917;
  font-family: sans-serif;
  user-select: none;
}

.shield-logo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 800;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
}

.shield-specs {
  display: flex;
  flex-direction: column;
  font-size: 0.55rem;
  font-weight: 600;
  line-height: 1.3;
  color: #262626;
}

.shield-fcc {
  font-size: 0.5rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #404040;
}

/* PCB Center Components */
.pcb-center-components {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  margin: 8px 0;
  gap: 8px;
  min-height: 60px;
}

.pcb-model-silkscreen {
  font-family: monospace;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #4ade80;
  background: rgba(74, 222, 128, 0.06);
  text-align: center;
  padding: 2px 6px;
  border: 1px dashed rgba(74, 222, 128, 0.25);
  border-radius: 3px;
}

.chip-crystal {
  background: #e2e8f0;
  color: #334155;
  border-radius: 2px;
  padding: 1px 6px;
  font-size: 0.55rem;
  font-weight: 700;
  border: 1px solid #94a3b8;
}

.pcb-tactile-buttons {
  display: flex;
  justify-content: space-around;
  width: 100%;
}

.tactile-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.btn-top {
  width: 14px;
  height: 14px;
  background: #475569;
  border: 1px solid #94a3b8;
  border-radius: 2px;
  box-shadow: inset 0 0 2px rgba(255, 255, 255, 0.4);
}

.btn-label {
  font-size: 0.55rem;
  font-weight: 700;
  color: #94a3b8;
}

.pcb-leds {
  display: flex;
  justify-content: space-around;
  width: 80%;
}

.led {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.led-light {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.red-led .led-light {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.blue-led .led-light {
  background: #3b82f6;
  box-shadow: 0 0 6px #3b82f6;
}

.led-label {
  font-size: 0.5rem;
  color: #64748b;
  font-weight: 600;
}

/* USB Port */
.pcb-bottom-section {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: auto;
  flex-shrink: 0;
  padding-bottom: 2px;
}

.usb-port {
  width: 50px;
  height: 20px;
  background: linear-gradient(to bottom, #d1d5db, #9ca3af);
  border: 1px solid #4b5563;
  border-radius: 2px 2px 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.5);
}

.usb-cavity {
  width: 24px;
  height: 6px;
  background: #1f2937;
  border-radius: 1px;
}

.usb-label {
  font-size: 0.45rem;
  font-weight: 700;
  color: #374151;
  margin-top: 1px;
}
</style>
