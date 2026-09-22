<script setup lang="ts">
import { computed } from 'vue'
import { useHardwareStore } from '../../stores/hardware'
import type { PinCapability } from '../../types/hardware'

const hardwareStore = useHardwareStore()

const pin = computed(() => hardwareStore.selectedPin)

const assignments = computed(() => {
  if (!pin.value) return []
  return hardwareStore.pinAssignments.get(pin.value.label) || []
})

const isLeftHeader = computed(() => {
  if (!pin.value) return false
  return hardwareStore.activeBoard.left_header.some((p) => p.pin_number === pin.value?.pin_number)
})

function formatCapLabel(cap: PinCapability): string {
  switch (cap) {
    case 'power_3v3': return '3.3V Power Rail'
    case 'power_5v': return '5V Power Input / VIN'
    case 'gnd': return 'System Ground (GND)'
    case 'gpio_in': return 'Digital Input'
    case 'gpio_out': return 'Digital Output'
    case 'i2c_sda': return 'I²C SDA (Data Bus)'
    case 'i2c_scl': return 'I²C SCL (Clock Bus)'
    case 'spi_mosi': return 'SPI MOSI'
    case 'spi_miso': return 'SPI MISO'
    case 'spi_sck': return 'SPI SCK (Clock)'
    case 'spi_cs': return 'SPI CS (Chip Select)'
    case 'adc1': return 'ADC1 (Analog-in, Wi-Fi safe)'
    case 'adc2': return 'ADC2 (Analog-in, restricted on Wi-Fi)'
    case 'dac': return 'DAC (8-bit Analog Out)'
    case 'touch': return 'Capacitive Touch'
    case 'uart_tx': return 'UART TX (Serial Transmit)'
    case 'uart_rx': return 'UART RX (Serial Receive)'
    case 'reset': return 'System Reset (Active Low)'
    case 'flash_reserved': return 'Internal SPI Flash (Reserved)'
    default: return cap
  }
}
</script>

<template>
  <div class="pin-inspector-card">
    <div class="card-header">
      <div class="title-with-icon">
        <span class="icon">🔍</span>
        <h3 class="card-title">Pin Dossier</h3>
      </div>
      <div class="header-right-meta">
        <span v-if="pin" class="header-indicator font-mono">
          {{ isLeftHeader ? 'Left (J1)' : 'Right (J2)' }} • Pin #{{ pin.pin_number }}
        </span>
        <button
          v-if="pin"
          class="btn-close-pin"
          title="Close pin dossier"
          @click="hardwareStore.selectPin(null)"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Active Pin Selected -->
    <div v-if="pin" class="inspector-body">
      <!-- Pin Identifier Hero -->
      <div class="pin-hero">
        <div class="pin-badge-large">
          {{ pin.label }}
        </div>
        <div class="hero-details">
          <div class="hero-row">
            <span class="label">Physical Pin:</span>
            <span class="val font-mono">Header Pin {{ pin.pin_number }}</span>
          </div>
          <div class="hero-row">
            <span class="label">Native GPIO:</span>
            <span class="val font-mono">{{ pin.gpio !== null ? `GPIO ${pin.gpio}` : 'Dedicated (No GPIO)' }}</span>
          </div>
        </div>
      </div>

      <!-- Strapping Pin Alert -->
      <div v-if="pin.is_strapping" class="advisory-banner strap-banner">
        <span class="advisory-icon">⚠️</span>
        <div class="advisory-content">
          <strong>ESP32 Strapping Pin Advisory</strong>
          <p>
            This pin controls boot mode, flash voltage, or logging output during MCU reset. Avoid pulling it to unintended logic levels during power-up.
          </p>
        </div>
      </div>

      <!-- Input-Only Warning -->
      <div v-if="pin.gpio !== null && [34, 35, 36, 39].includes(pin.gpio)" class="advisory-banner input-banner">
        <span class="advisory-icon">ℹ️</span>
        <div class="advisory-content">
          <strong>Input-Only Pin</strong>
          <p>
            GPIO {{ pin.gpio }} lacks internal pull-up/pull-down resistors and output drivers. It can only be used as a digital or analog input.
          </p>
        </div>
      </div>

      <!-- Flash Memory Pin Warning -->
      <div v-if="pin.capabilities.includes('flash_reserved')" class="advisory-banner flash-banner">
        <span class="advisory-icon">⛔</span>
        <div class="advisory-content">
          <strong>Internal SPI Flash Memory Pin</strong>
          <p>
            This pin is connected internally to the high-speed SPI flash memory chip. Connecting external sensors, wires, or loads will crash or prevent the ESP32 from booting!
          </p>
        </div>
      </div>

      <!-- Capabilities List -->
      <div class="section-group">
        <h4 class="section-heading">Hardware Capabilities</h4>
        <div class="capabilities-grid">
          <span
            v-for="cap in pin.capabilities"
            :key="cap"
            class="cap-pill"
          >
            {{ formatCapLabel(cap) }}
          </span>
        </div>
      </div>

      <!-- Engineering Notes -->
      <div v-if="pin.notes" class="section-group">
        <h4 class="section-heading">Datasheet & Practical Notes</h4>
        <div class="notes-box">
          {{ pin.notes }}
        </div>
      </div>

      <!-- Active Wiring Assignments -->
      <div class="section-group">
        <h4 class="section-heading">Active Wiring Assignment</h4>
        <div v-if="assignments.length > 0" class="assignments-list">
          <div
            v-for="(asgn, idx) in assignments"
            :key="idx"
            class="assignment-row"
          >
            <span class="asgn-device">{{ asgn.peripheralName }}</span>
            <span class="asgn-arrow">◄──►</span>
            <span class="asgn-role-tag">{{ asgn.role }}</span>
          </div>
        </div>
        <div v-else class="empty-assignment-hint">
          No peripheral is currently wired to this pin.
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <span class="empty-icon">👆</span>
      <h4 class="empty-title">No Pin Selected</h4>
      <p class="empty-desc">
        Click any pin on the ESP32 board to inspect its GPIO multiplexing, electrical limits, and connected peripherals.
      </p>
    </div>
  </div>
</template>

<style scoped>
.pin-inspector-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-accent);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: fit-content;
  box-shadow: 0 4px 20px rgba(124, 111, 255, 0.15);
}

.header-right-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-close-pin {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn-close-pin:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.4);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-subtle);
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon {
  font-size: 1rem;
}

.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.header-indicator {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-base);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.inspector-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Pin Hero */
.pin-hero {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.pin-badge-large {
  font-family: monospace;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-accent-hover);
  background: rgba(124, 111, 255, 0.15);
  border: 1px solid rgba(124, 111, 255, 0.3);
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
}

.hero-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.hero-row .label {
  color: var(--color-text-muted);
}

.hero-row .val {
  color: var(--color-text-primary);
  font-weight: 600;
}

/* Advisories */
.advisory-banner {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.4;
}

.strap-banner {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
}

.input-banner {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #93c5fd;
}

.flash-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.advisory-content p {
  margin-top: 0.2rem;
  color: var(--color-text-secondary);
}

/* Sections */
.section-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-heading {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.capabilities-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cap-pill {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
}

.notes-box {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  line-height: 1.4;
}

/* Active Wiring */
.assignments-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assignment-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 6px;
  font-size: 0.8rem;
}

.asgn-device {
  font-weight: 600;
  color: #ecfdf5;
}

.asgn-arrow {
  color: #10b981;
  font-size: 0.7rem;
}

.asgn-role-tag {
  font-family: monospace;
  font-weight: 700;
  background: #059669;
  color: white;
  padding: 1px 6px;
  border-radius: 4px;
}

.empty-assignment-hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-style: italic;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3rem 1.5rem;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
  filter: grayscale(0.5);
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.empty-desc {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  max-width: 260px;
  line-height: 1.4;
}
</style>
