<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useWiringStore } from '../../../stores/wiring'
import { useHardwareStore } from '../../../stores/hardware'
import { useDeviceStore } from '../../../stores/device'
import { getComponentDefinition, type ComponentPin } from '../../../core/hardware/ComponentDefinition'
import type { PinDefinition } from '../../../types/hardware'

const wiringStore = useWiringStore()
const hardwareStore = useHardwareStore()
const deviceStore = useDeviceStore()

// Board sub-tab: 'pinout' | 'silicon'
const boardTab = ref<'pinout' | 'silicon'>('pinout')
const pinSearch = ref('')

// Computed active component
const activeComponent = computed(() => {
  if (!wiringStore.inspectedComponentId) return null
  return wiringStore.components.find((c) => c.instanceId === wiringStore.inspectedComponentId) || null
})

const activeDefinition = computed(() => {
  if (!activeComponent.value) return null
  return getComponentDefinition(activeComponent.value.definitionId)
})

const isComponentI2c = computed(() => {
  if (!activeDefinition.value) return false
  return (
    activeDefinition.value.category === 'Display' ||
    activeDefinition.value.i2cAddress !== undefined
  )
})

const currentI2cAddress = computed(() => {
  if (!activeComponent.value) return 0x3c
  return activeComponent.value.i2cAddress || activeDefinition.value?.i2cAddress || 0x3c
})

const isConnected = computed(() => deviceStore.status === 'connected')
const siliconDossier = computed(() => deviceStore.chipDossier)

const componentVoltage = computed(() => {
  if (!activeDefinition.value) return 3.3
  const powerPin = activeDefinition.value.pins.find((p) => p.type === 'POWER_IN')
  return powerPin?.requiredVoltage || 3.3
})

function formatMb(bytes?: number): string {
  if (!bytes) return '4 MB (SPI)'
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

function getConnectedBoardPin(pinId: string): string | null {
  if (!activeComponent.value) return null
  const net = wiringStore.nets.find((n) =>
    n.nodes.some(
      (node) =>
        node.instanceId === activeComponent.value?.instanceId && node.pinId === pinId
    )
  )
  if (!net) return null
  const boardNode = net.nodes.find((node) => node.instanceId === 'esp32')
  return boardNode ? boardNode.pinId : 'Bridged'
}

function getConnectedNetNameForPin(pinLabel: string): string | null {
  const net = wiringStore.nets.find((n) =>
    n.nodes.some(
      (node) =>
        node.instanceId === 'esp32' &&
        (node.pinId === pinLabel || pinLabel.startsWith(node.pinId))
    )
  )
  return net ? net.name : null
}

function getPinColor(pin: ComponentPin | PinDefinition): string {
  const caps = 'capabilities' in pin ? pin.capabilities : []
  const type = 'type' in pin ? pin.type : ''

  if (type === 'GND' || caps.includes('gnd')) return '#6b7280'
  if (type === 'POWER_IN') return (pin as ComponentPin).requiredVoltage === 5.0 ? '#f97316' : '#ef4444'
  if (caps.includes('power_3v3')) return '#ef4444'
  if (caps.includes('power_5v')) return '#f97316'
  if (type === 'I2C_SDA' || caps.includes('i2c_sda')) return '#38bdf8'
  if (type === 'I2C_SCL' || caps.includes('i2c_scl')) return '#f59e0b'
  if (type === 'SPI_MOSI' || type === 'SPI_MISO' || caps.includes('spi_mosi') || caps.includes('spi_miso')) return '#10b981'
  if (caps.includes('adc1') || caps.includes('adc2')) return '#14b8a6'
  return '#8b5cf6'
}

function toggleI2cAddress() {
  if (!activeComponent.value) return
  const next = currentI2cAddress.value === 0x3c ? 0x3d : 0x3c
  wiringStore.setComponentI2cAddress(activeComponent.value.instanceId, next)
}

function handleDeleteComponent() {
  if (!activeComponent.value) return
  wiringStore.removeComponent(activeComponent.value.instanceId)
  wiringStore.closeDrawer()
}

// Filtered Board Pins list
const filteredBoardPins = computed(() => {
  const all = hardwareStore.allPins
  const q = pinSearch.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((p) => {
    return (
      p.label.toLowerCase().includes(q) ||
      (p.gpio !== null && String(p.gpio).includes(q)) ||
      p.capabilities.some((c) => c.toLowerCase().includes(q))
    )
  })
})

// Keyboard Esc handler to close drawer
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && wiringStore.activeDrawer) {
    wiringStore.closeDrawer()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Transition name="dossier-slide">
    <aside
      v-if="wiringStore.activeDrawer"
      class="hardware-dossier-drawer"
      @click.stop
    >
      <!-- Top Drawer Header -->
      <header class="drawer-header">
        <div class="header-identity">
          <!-- Component Header -->
          <template v-if="wiringStore.activeDrawer === 'component' && activeDefinition">
            <span class="drawer-icon">{{ activeDefinition.icon }}</span>
            <div class="drawer-title-group">
              <div class="badge-row">
                <span class="type-tag font-mono">MODULE</span>
                <span class="cat-tag font-mono" :style="{ color: activeDefinition.accentColor }">
                  {{ activeDefinition.category.toUpperCase() }}
                </span>
                <span v-if="isComponentI2c" class="i2c-tag font-mono">
                  I²C 0x{{ currentI2cAddress.toString(16).toUpperCase() }}
                </span>
              </div>
              <h3 class="drawer-title">{{ activeComponent?.name || activeDefinition.name }}</h3>
            </div>
          </template>

          <!-- Board Header -->
          <template v-else-if="wiringStore.activeDrawer === 'board'">
            <span class="drawer-icon">📡</span>
            <div class="drawer-title-group">
              <div class="badge-row">
                <span class="type-tag font-mono">MCU</span>
                <span class="cat-tag font-mono text-cyan">
                  {{ hardwareStore.activeBoard.chip_family }}
                </span>
                <span class="status-indicator-tag" :class="isConnected ? 'is-online' : 'is-offline'">
                  {{ isConnected ? '● Online' : '○ Standby' }}
                </span>
              </div>
              <h3 class="drawer-title">{{ hardwareStore.activeBoard.name }}</h3>
            </div>
          </template>
        </div>

        <!-- Close Drawer Button -->
        <button
          class="btn-drawer-close"
          title="Close Dossier Drawer (Esc)"
          @click="wiringStore.closeDrawer()"
        >
          ✕
        </button>
      </header>

      <!-- Sub-Tab Switcher for Board Drawer -->
      <div v-if="wiringStore.activeDrawer === 'board'" class="drawer-tabs font-mono">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': boardTab === 'pinout' }"
          @click="boardTab = 'pinout'"
        >
          📌 Pinout Matrix ({{ hardwareStore.allPins.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': boardTab === 'silicon' }"
          @click="boardTab = 'silicon'"
        >
          📋 Silicon & Telemetry
        </button>
      </div>

      <!-- ========================================================= -->
      <!-- VIEW 1: COMPONENT DOSSIER CONTENT                          -->
      <!-- ========================================================= -->
      <div v-if="wiringStore.activeDrawer === 'component' && activeDefinition" class="drawer-body font-mono">
        <!-- Section 1: Electrical Specs & Power -->
        <div class="dossier-card">
          <div class="card-section-label">ELECTRICAL SPECIFICATIONS</div>
          <div class="metrics-grid">
            <div class="metric-box">
              <span class="metric-lbl">OPERATING LOAD</span>
              <span class="metric-val text-amber">
                ⚡ {{ activeDefinition.estimatedCurrentMa }} mA
              </span>
            </div>
            <div class="metric-box">
              <span class="metric-lbl">RAIL VOLTAGE</span>
              <span class="metric-val" :class="componentVoltage === 5.0 ? 'text-amber' : 'text-cyan'">
                {{ componentVoltage }}V DC
              </span>
            </div>
            <div class="metric-box">
              <span class="metric-lbl">BUS INTERFACE</span>
              <span class="metric-val text-purple">
                {{ activeDefinition.category === 'Display' ? 'I²C / Fast 400k' : activeDefinition.category }}
              </span>
            </div>
            <div class="metric-box">
              <span class="metric-lbl">PIN COUNT</span>
              <span class="metric-val text-emerald">
                {{ activeDefinition.pins.length }} Pins
              </span>
            </div>
          </div>
        </div>

        <!-- Section 2: I2C Configuration (if I2C) -->
        <div v-if="isComponentI2c" class="dossier-card">
          <div class="card-section-label">I²C BUS CONFIGURATION</div>
          <div class="i2c-jumper-row">
            <div class="i2c-info">
              <span class="i2c-label">SLAVE ADDRESS:</span>
              <span class="i2c-hex-badge">0x{{ currentI2cAddress.toString(16).toUpperCase() }}</span>
            </div>
            <button
              class="btn-toggle-jumper font-mono"
              title="Toggle between standard 0x3C and 0x3D slave addresses"
              @click="toggleI2cAddress"
            >
              ⇄ Jumper to 0x{{ (currentI2cAddress === 0x3c ? 0x3d : 0x3c).toString(16).toUpperCase() }}
            </button>
          </div>
          <p class="jumper-hint">
            * Matches solder jumper pads on the back of standard 0.96" and 1.3" OLED breakout boards.
          </p>
        </div>

        <!-- Section 3: Pinout & Netlist Routing Table -->
        <div class="dossier-card">
          <div class="card-section-label">PINOUT & ROUTED NETS</div>
          <div class="pins-table-wrapper">
            <table class="pins-table">
              <thead>
                <tr>
                  <th>PIN</th>
                  <th>TYPE</th>
                  <th>VOLT</th>
                  <th>ROUTED MCU PIN</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="pin in activeDefinition.pins"
                  :key="pin.id"
                  :class="{ 'is-routed': !!getConnectedBoardPin(pin.id) }"
                >
                  <td class="pin-cell">
                    <span class="pin-dot" :style="{ backgroundColor: getPinColor(pin) }" />
                    <span class="pin-cell-name">{{ pin.label }}</span>
                  </td>
                  <td>
                    <span
                      class="pin-badge"
                      :style="{
                        color: getPinColor(pin),
                        backgroundColor: `${getPinColor(pin)}1a`,
                      }"
                    >
                      {{ pin.type.replace('POWER_IN', 'PWR') }}
                    </span>
                  </td>
                  <td class="voltage-cell">
                    {{ pin.requiredVoltage ? `${pin.requiredVoltage}V` : '3.3V' }}
                  </td>
                  <td class="target-cell">
                    <span v-if="getConnectedBoardPin(pin.id)" class="routed-tag text-emerald">
                      → {{ getConnectedBoardPin(pin.id) }}
                    </span>
                    <span v-else class="unrouted-tag text-muted">
                      Unrouted
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 4: Peripheral Description -->
        <div class="dossier-card">
          <div class="card-section-label">DESCRIPTION & INTEGRATION</div>
          <p class="desc-text">{{ activeDefinition.description }}</p>
        </div>

        <!-- Footer Actions -->
        <div class="drawer-actions-card">
          <button
            class="btn-delete-peripheral font-mono"
            title="Remove peripheral from breadboard"
            @click="handleDeleteComponent"
          >
            🗑️ Remove Peripheral
          </button>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- VIEW 2: BOARD PINOUT MATRIX TAB                            -->
      <!-- ========================================================= -->
      <div v-else-if="wiringStore.activeDrawer === 'board' && boardTab === 'pinout'" class="drawer-body font-mono">
        <!-- Selected Pin Deep-Dive Inspector (if user clicked a pin) -->
        <div v-if="hardwareStore.selectedPin" class="selected-pin-inspector">
          <div class="inspector-header">
            <div class="inspector-badge-row">
              <span class="badge-pin-num">PIN #{{ hardwareStore.selectedPin.pin_number }}</span>
              <span class="badge-pin-label">{{ hardwareStore.selectedPin.label }}</span>
              <span v-if="hardwareStore.selectedPin.gpio !== null" class="badge-gpio">
                GPIO {{ hardwareStore.selectedPin.gpio }}
              </span>
            </div>
            <button
              class="btn-dismiss-pin"
              title="Deselect pin"
              @click="hardwareStore.selectPin(null)"
            >
              ✕
            </button>
          </div>

          <!-- Strapping Alert -->
          <div v-if="hardwareStore.selectedPin.is_strapping" class="pin-alert alert-warning">
            ⚠️ Hardware Strapping Pin: Avoid pull-down during boot!
          </div>

          <!-- Input-only Alert -->
          <div
            v-if="hardwareStore.selectedPin.gpio !== null && [34, 35, 36, 39].includes(hardwareStore.selectedPin.gpio)"
            class="pin-alert alert-error"
          >
            ⚠️ Input-only silicon: Cannot output clock or data!
          </div>

          <div class="pin-meta-grid">
            <div class="meta-row">
              <span class="meta-lbl">Capabilities:</span>
              <div class="cap-chips">
                <span
                  v-for="c in hardwareStore.selectedPin.capabilities"
                  :key="c"
                  class="cap-chip"
                >
                  {{ c.toUpperCase() }}
                </span>
              </div>
            </div>
            <div v-if="getConnectedNetNameForPin(hardwareStore.selectedPin.label)" class="meta-row">
              <span class="meta-lbl">Connected Net:</span>
              <span class="meta-net text-emerald">
                {{ getConnectedNetNameForPin(hardwareStore.selectedPin.label) }}
              </span>
            </div>
            <div v-if="hardwareStore.selectedPin.notes" class="meta-notes">
              {{ hardwareStore.selectedPin.notes }}
            </div>
          </div>
        </div>

        <!-- Filter / Search Header -->
        <div class="pinout-search-bar">
          <input
            v-model="pinSearch"
            type="text"
            class="clean-input pin-search-input font-mono"
            placeholder="🔍 Search pin, GPIO, function (e.g. SDA, ADC, 21)..."
          />
          <span v-if="pinSearch" class="search-count font-mono">
            {{ filteredBoardPins.length }} results
          </span>
        </div>

        <!-- Complete Interactive Pinout Table -->
        <div class="dossier-card">
          <div class="card-section-label">
            BOARD PINOUT MATRIX ({{ hardwareStore.activeBoard.pin_count }} PINS)
          </div>
          <div class="pins-table-wrapper">
            <table class="pins-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PIN</th>
                  <th>GPIO</th>
                  <th>CAPABILITIES</th>
                  <th>NET</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="pin in filteredBoardPins"
                  :key="pin.pin_number"
                  class="pinout-row"
                  :class="{
                    'is-selected-pin': hardwareStore.selectedPin?.label === pin.label,
                    'is-strapping-pin': pin.is_strapping,
                  }"
                  @click="hardwareStore.selectPin(pin)"
                >
                  <td class="pin-num-cell">{{ pin.pin_number }}</td>
                  <td class="pin-cell">
                    <span class="pin-dot" :style="{ backgroundColor: getPinColor(pin) }" />
                    <span class="pin-cell-name">{{ pin.label }}</span>
                  </td>
                  <td class="gpio-cell">
                    {{ pin.gpio !== null ? `GPIO ${pin.gpio}` : '—' }}
                  </td>
                  <td>
                    <div class="cap-chips-cell">
                      <span
                        v-for="c in pin.capabilities.slice(0, 3)"
                        :key="c"
                        class="cap-chip-compact"
                      >
                        {{ c.toUpperCase() }}
                      </span>
                      <span v-if="pin.capabilities.length > 3" class="cap-more">
                        +{{ pin.capabilities.length - 3 }}
                      </span>
                    </div>
                  </td>
                  <td class="target-cell">
                    <span v-if="getConnectedNetNameForPin(pin.label)" class="routed-tag text-emerald">
                      ✓ Connected
                    </span>
                    <span v-else class="unrouted-tag text-muted">
                      Free
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- VIEW 3: SILICON & TELEMETRY TAB                            -->
      <!-- ========================================================= -->
      <div v-else-if="wiringStore.activeDrawer === 'board' && boardTab === 'silicon'" class="drawer-body font-mono">
        <!-- Section 1: Silicon & Hardware Identity -->
        <div class="dossier-card">
          <div class="card-section-label">ESP32 SILICON ARCHITECTURE</div>
          <div class="metrics-grid">
            <div class="metric-box">
              <span class="metric-lbl">SILICON MODEL</span>
              <span class="metric-val text-cyan">
                {{ siliconDossier?.chip_model || 'ESP32-D0WDQ6' }}
              </span>
            </div>
            <div class="metric-box">
              <span class="metric-lbl">REVISION</span>
              <span class="metric-val text-purple">
                r{{ siliconDossier?.revision ?? '1.0' }}
              </span>
            </div>
            <div class="metric-box">
              <span class="metric-lbl">CPU CLOCK</span>
              <span class="metric-val text-amber">
                240 MHz (Dual Core)
              </span>
            </div>
            <div class="metric-box">
              <span class="metric-lbl">XTAL FREQUENCY</span>
              <span class="metric-val text-emerald">
                40 MHz
              </span>
            </div>
          </div>
        </div>

        <!-- Section 2: Memory & Flash Storage -->
        <div class="dossier-card">
          <div class="card-section-label">STORAGE & MEMORY MAP</div>
          <div class="data-key-row">
            <span class="data-k">SPI Flash Size:</span>
            <span class="data-v font-mono text-cyan">
              {{ formatMb(siliconDossier?.flash_size_bytes) }} ({{ siliconDossier?.flash_mode || 'DIO 40MHz' }})
            </span>
          </div>
          <div class="data-key-row">
            <span class="data-k">SRAM Capacity:</span>
            <span class="data-v font-mono text-purple">520 KB On-Chip SRAM</span>
          </div>
          <div class="data-key-row">
            <span class="data-k">LittleFS Partition:</span>
            <span class="data-v font-mono text-emerald">1.5 MB LittleFS Flash Storage</span>
          </div>
          <div class="data-key-row">
            <span class="data-k">Autonomous Reel Limit:</span>
            <span class="data-v font-mono text-amber">Up to 1,500 Frames (~100s @ 15fps)</span>
          </div>
        </div>

        <!-- Section 3: Connectivity & MAC -->
        <div class="dossier-card">
          <div class="card-section-label">COMMUNICATION & MAC</div>
          <div class="data-key-row">
            <span class="data-k">MAC Address:</span>
            <span class="data-v font-mono text-cyan">
              {{ siliconDossier?.mac_address || (isConnected ? 'Reading…' : 'Offline (Plug USB)') }}
            </span>
          </div>
          <div class="data-key-row">
            <span class="data-k">Hardware Status:</span>
            <span class="data-v font-mono" :class="isConnected ? 'text-emerald' : 'text-muted'">
              {{ isConnected ? '● Online & Synchronized' : '○ Standby / Disconnected' }}
            </span>
          </div>
          <div class="data-key-row">
            <span class="data-k">UART Baud Rate:</span>
            <span class="data-v font-mono">115,200 baud (Standard)</span>
          </div>
        </div>

        <!-- Section 4: Hardware Control Actions -->
        <div class="dossier-card">
          <div class="card-section-label">HARDWARE CONTROLS</div>
          <div class="hw-action-buttons">
            <button
              class="btn-hw-action font-mono btn-reboot"
              title="Software reboot via serial (0x06 command)"
              :disabled="!isConnected || deviceStore.isRebooting"
              @click="deviceStore.restart(false)"
            >
              ↺ Software Reboot
            </button>
            <button
              class="btn-hw-action font-mono btn-reset"
              title="Hardware reset via DTR/RTS pulse"
              :disabled="!isConnected || deviceStore.isRebooting"
              @click="deviceStore.restart(true)"
            >
              ⚡ Hardware Reset (DTR/RTS)
            </button>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
/* Main Drawer Shell (Slides from the right edge like Telemetry) */
.hardware-dossier-drawer {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  width: 390px;
  max-width: calc(100% - 1rem);
  z-index: 50;
  background: rgba(15, 23, 42, 0.96) !important;
  backdrop-filter: blur(28px) !important;
  -webkit-backdrop-filter: blur(28px) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  border-radius: 8px !important;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.8), 0 10px 25px rgba(0, 0, 0, 0.6) !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.8rem 0.95rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(10, 15, 30, 0.5);
  flex-shrink: 0;
}

.header-identity {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.drawer-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.drawer-title-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.badge-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.type-tag {
  font-size: 0.56rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.cat-tag {
  font-size: 0.56rem;
  font-weight: 700;
}

.i2c-tag {
  font-size: 0.56rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.status-indicator-tag {
  font-size: 0.56rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.is-online {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.is-offline {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.drawer-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-drawer-close {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 9999px;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-drawer-close:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.6);
  color: #ef4444;
  transform: scale(1.08);
}

/* Board Sub-Tabs */
.drawer-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 0.45rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 600;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.tab-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.04);
}

.tab-btn--active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
  font-weight: 700;
}

/* Drawer Body Scroll Area */
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Cards */
.dossier-card {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.card-section-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.2rem;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}

.metric-box {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.metric-lbl {
  font-size: 0.52rem;
  color: #64748b;
}

.metric-val {
  font-size: 0.74rem;
  font-weight: 700;
}

/* I2C Configuration Row */
.i2c-jumper-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.i2c-info {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.i2c-label {
  font-size: 0.65rem;
  color: #94a3b8;
}

.i2c-hex-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.btn-toggle-jumper {
  font-size: 0.64rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #f1f5f9;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-toggle-jumper:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
}

.jumper-hint {
  margin: 0;
  font-size: 0.58rem;
  color: #64748b;
  line-height: 1.3;
}

/* Table */
.pins-table-wrapper {
  overflow-x: auto;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.pins-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.65rem;
}

.pins-table th {
  background: rgba(15, 23, 42, 0.7);
  padding: 0.35rem 0.5rem;
  text-align: left;
  color: #64748b;
  font-weight: 600;
  font-size: 0.56rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.pins-table td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.pin-cell {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
}

.pin-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pin-badge {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}

.voltage-cell {
  color: #94a3b8;
}

.routed-tag {
  font-weight: 600;
}

.unrouted-tag {
  color: #64748b;
}

.desc-text {
  margin: 0;
  font-size: 0.64rem;
  color: #94a3b8;
  line-height: 1.4;
}

/* Selected Pin Inspector in Board Drawer */
.selected-pin-inspector {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.inspector-badge-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.badge-pin-num {
  font-size: 0.56rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.badge-pin-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #f8fafc;
}

.badge-gpio {
  font-size: 0.62rem;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.btn-dismiss-pin {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.7rem;
  cursor: pointer;
}

.btn-dismiss-pin:hover {
  color: #ef4444;
}

.pin-alert {
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  font-size: 0.6rem;
  line-height: 1.3;
}

.alert-warning {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.alert-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.pin-meta-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.64rem;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.meta-lbl {
  color: #64748b;
  min-width: 85px;
}

.cap-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.cap-chip {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.meta-notes {
  font-size: 0.6rem;
  color: #94a3b8;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  padding-top: 0.3rem;
}

/* Search bar */
.pinout-search-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pin-search-input {
  flex: 1;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 0.35rem 0.55rem;
  font-size: 0.66rem;
  color: #f1f5f9;
}

.pin-search-input:focus {
  outline: none;
  border-color: #38bdf8;
}

.search-count {
  font-size: 0.58rem;
  color: #64748b;
  white-space: nowrap;
}

.pinout-row {
  cursor: pointer;
  transition: background 0.1s ease;
}

.pinout-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.is-selected-pin {
  background: rgba(56, 189, 248, 0.18) !important;
}

.is-strapping-pin {
  border-left: 2px solid #f59e0b;
}

.pin-num-cell {
  color: #64748b;
  width: 24px;
}

.gpio-cell {
  color: #38bdf8;
  font-weight: 600;
}

.cap-chips-cell {
  display: flex;
  gap: 0.2rem;
  flex-wrap: wrap;
}

.cap-chip-compact {
  font-size: 0.5rem;
  font-weight: 700;
  padding: 0.08rem 0.25rem;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}

.cap-more {
  font-size: 0.5rem;
  color: #64748b;
}

/* Data key rows for Silicon tab */
.data-key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.65rem;
  padding: 0.2rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.data-k {
  color: #94a3b8;
}

.hw-action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-hw-action {
  flex: 1;
  padding: 0.45rem 0.6rem;
  font-size: 0.66rem;
  font-weight: 700;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn-reboot {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
}

.btn-reboot:hover:not(:disabled) {
  background: #38bdf8;
  color: #0f172a;
}

.btn-reset {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.btn-reset:hover:not(:disabled) {
  background: #ef4444;
  color: #fff;
}

.btn-hw-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Actions Card */
.drawer-actions-card {
  margin-top: auto;
  padding-top: 0.5rem;
}

.btn-delete-peripheral {
  width: 100%;
  padding: 0.45rem 0.65rem;
  font-size: 0.68rem;
  font-weight: 700;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-delete-peripheral:hover {
  background: #ef4444;
  color: #fff;
}

/* Transition */
.dossier-slide-enter-active,
.dossier-slide-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.dossier-slide-enter-from,
.dossier-slide-leave-to {
  transform: translateX(110%);
  opacity: 0;
}

.text-cyan { color: #38bdf8; }
.text-amber { color: #f59e0b; }
.text-purple { color: #a855f7; }
.text-emerald { color: #10b981; }
.text-muted { color: #64748b; }
</style>
