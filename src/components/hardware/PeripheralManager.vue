<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHardwareStore } from '../../stores/hardware'
import type { PeripheralDevice, PeripheralType } from '../../types/hardware'

const hardwareStore = useHardwareStore()

const showAddModal = ref<boolean>(false)
const newPeripheralType = ref<PeripheralType>('PUSH_BUTTON')
const newPeripheralName = ref<string>('User Push Button')

const availablePins = computed(() => {
  return hardwareStore.allPins.map((p) => p.label)
})

function handleAddPeripheral() {
  const id = `periph-${Date.now()}`
  let defaultPins: Record<string, string> = {}

  if (newPeripheralType.value === 'PUSH_BUTTON') {
    defaultPins = { SIGNAL: 'D26', GND: 'GND' }
  } else if (newPeripheralType.value === 'STATUS_LED') {
    defaultPins = { ANODE: 'D2 (LED)', CATHODE: 'GND' }
  } else if (newPeripheralType.value === 'ANALOG_SENSOR') {
    defaultPins = { VCC: '3V3', GND: 'GND', ADC: 'D32' }
  } else if (newPeripheralType.value === 'OLED_128X64_I2C') {
    defaultPins = { VCC: '3V3', GND: 'GND', SDA: 'D21 (SDA)', SCL: 'D22 (SCL)' }
  }

  const device: PeripheralDevice = {
    id,
    type: newPeripheralType.value,
    name: newPeripheralName.value || 'New Peripheral',
    pins: defaultPins,
    status: 'configured',
  }

  hardwareStore.addPeripheral(device)
  showAddModal.value = false
}

function handlePresetSelect(type: PeripheralType, name: string) {
  newPeripheralType.value = type
  newPeripheralName.value = name
}
</script>

<template>
  <div class="peripheral-manager-card">
    <div class="card-header">
      <div class="title-with-icon">
        <span class="icon">🔌</span>
        <h3 class="card-title">Configured Peripherals</h3>
      </div>
      <button class="btn-sm btn-primary" @click="showAddModal = true">
        ➕ Add Peripheral
      </button>
    </div>

    <div class="manager-body">
      <!-- Validation Issues Banner -->
      <div v-if="hardwareStore.validationIssues.length > 0" class="validation-box">
        <div
          v-for="issue in hardwareStore.validationIssues"
          :key="issue.id"
          class="issue-alert"
          :class="`issue-${issue.severity}`"
        >
          <span class="issue-icon">{{ issue.severity === 'error' ? '❌' : '⚠️' }}</span>
          <div class="issue-text">
            <strong>{{ issue.title }}</strong>
            <p>{{ issue.message }}</p>
          </div>
        </div>
      </div>

      <!-- Peripheral Devices List -->
      <div class="peripherals-list">
        <div
          v-for="device in hardwareStore.peripherals"
          :key="device.id"
          class="device-card"
        >
          <div class="device-card-header">
            <div class="device-title-area">
              <span class="device-icon">
                {{
                  device.type === 'OLED_128X64_I2C'
                    ? '📺'
                    : device.type === 'PUSH_BUTTON'
                    ? '🔘'
                    : device.type === 'STATUS_LED'
                    ? '💡'
                    : '📟'
                }}
              </span>
              <div>
                <h4 class="device-name">{{ device.name }}</h4>
                <div class="device-badges">
                  <span class="type-tag">{{ device.type }}</span>
                  <span v-if="device.i2c_address" class="i2c-tag">Addr: {{ device.i2c_address }}</span>
                </div>
              </div>
            </div>

            <button
              v-if="device.id !== 'oled-display-primary'"
              class="btn-icon-danger"
              title="Remove peripheral"
              @click="hardwareStore.removePeripheral(device.id)"
            >
              ✕
            </button>
          </div>

          <!-- Pin Bindings Table -->
          <div class="pins-table">
            <div
              v-for="[role, assignedPin] in Object.entries(device.pins)"
              :key="role"
              class="pin-bind-row"
            >
              <span class="role-badge">{{ role }}</span>
              <span class="bind-arrow">➔</span>
              <select
                class="pin-select"
                :value="assignedPin"
                @change="(e) => hardwareStore.updatePeripheralPin(device.id, role, (e.target as HTMLSelectElement).value)"
              >
                <option v-for="pinLabel in availablePins" :key="pinLabel" :value="pinLabel">
                  {{ pinLabel }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Peripheral Modal -->
    <div v-if="showAddModal" class="modal-backdrop" @click.self="showAddModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Add Peripheral</h3>
          <button class="btn-close" @click="showAddModal = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="preset-buttons">
            <button
              type="button"
              class="preset-btn"
              :class="{ 'is-active': newPeripheralType === 'PUSH_BUTTON' }"
              @click="handlePresetSelect('PUSH_BUTTON', 'Tactile Push Button')"
            >
              🔘 Push Button
            </button>
            <button
              type="button"
              class="preset-btn"
              :class="{ 'is-active': newPeripheralType === 'STATUS_LED' }"
              @click="handlePresetSelect('STATUS_LED', 'Status LED Indicator')"
            >
              💡 Status LED
            </button>
            <button
              type="button"
              class="preset-btn"
              :class="{ 'is-active': newPeripheralType === 'ANALOG_SENSOR' }"
              @click="handlePresetSelect('ANALOG_SENSOR', 'Analog Sensor (ADC)')"
            >
              📟 Analog Sensor
            </button>
          </div>

          <div class="form-group">
            <label class="form-label">Peripheral Label</label>
            <input v-model="newPeripheralName" class="form-input" placeholder="e.g. Action Button" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="showAddModal = false">Cancel</button>
          <button class="btn-primary" @click="handleAddPeripheral">Add to Workspace</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.peripheral-manager-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.btn-sm {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-primary {
  background: var(--color-accent);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.manager-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Validation Box */
.validation-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-alert {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.4;
}

.issue-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.issue-warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fcd34d;
}

.issue-text p {
  margin-top: 0.2rem;
  color: var(--color-text-secondary);
}

/* Peripherals List */
.peripherals-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.device-card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.device-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.device-title-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.device-icon {
  font-size: 1.4rem;
}

.device-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.device-badges {
  display: flex;
  gap: 6px;
  margin-top: 3px;
}

.type-tag, .i2c-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}

.type-tag {
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.i2c-tag {
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.btn-icon-danger {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.btn-icon-danger:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

/* Pins Table */
.pins-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 0.5rem;
}

.pin-bind-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
}

.role-badge {
  font-family: monospace;
  font-weight: 700;
  width: 50px;
  color: var(--color-text-primary);
}

.bind-arrow {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.pin-select {
  flex: 1;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: monospace;
  outline: none;
}

.pin-select:focus {
  border-color: var(--color-accent);
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  width: 400px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-subtle);
}

.modal-title {
  font-size: 0.95rem;
  font-weight: 600;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 1rem;
  cursor: pointer;
}

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preset-buttons {
  display: flex;
  gap: 8px;
}

.preset-btn {
  flex: 1;
  padding: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn.is-active {
  background: rgba(124, 111, 255, 0.15);
  border-color: var(--color-accent);
  color: var(--color-accent-hover);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

.form-input {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--color-bg-elevated);
  border-top: 1px solid var(--color-border-subtle);
}

.btn-secondary {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>
