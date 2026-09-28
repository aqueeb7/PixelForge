<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useDeviceStore } from '../../stores/device'

const deviceStore = useDeviceStore()

export type TreemapViewMode = 'flash' | 'sram' | 'unified'
export type ViewDetailLevel = 'creator' | 'engineer'

const viewMode = ref<TreemapViewMode>('flash')
const detailLevel = ref<ViewDetailLevel>('creator')

const isConnected = computed(() => deviceStore.status === 'connected')
const telemetry = computed(() => deviceStore.telemetry)
const chipDossier = computed(() => deviceStore.chipDossier)

// Active inspected block & floating dossier state
const selectedBlockId = ref<string | null>(null)
const hoveredBlockId = ref<string | null>(null)
const isDossierOpen = ref<boolean>(false)

const activeBlockId = computed<string | null>(() => {
  if (hoveredBlockId.value) return hoveredBlockId.value
  if (isDossierOpen.value && selectedBlockId.value) return selectedBlockId.value
  return null
})

interface TreemapBlock {
  id: string
  friendlyName: string
  techName: string
  icon: string
  category: 'storage' | 'firmware' | 'system' | 'heap' | 'free' | 'dma'
  addressHex: string
  endAddressHex: string
  sizeBytes: number
  usedBytes: number
  access: 'R-X' | 'RW-' | 'R--'
  status: 'optimal' | 'active' | 'warning' | 'headroom' | 'system'
  color: string
  plainSummary: string
  creatorImpact: string
  techDetail: string
}

// -------------------------------------------------------------
// Live Telemetry Calculations
// -------------------------------------------------------------
const MINI_RADIUS = 14
const MINI_CIRCUMFERENCE = 2 * Math.PI * MINI_RADIUS

const heapUsagePercent = computed(() => {
  if (!telemetry.value || !telemetry.value.total_heap) return 33
  const used = telemetry.value.total_heap - telemetry.value.free_heap
  return Math.min(100, Math.max(0, (used / telemetry.value.total_heap) * 100))
})

const freePercent = computed(() => {
  return 100 - heapUsagePercent.value
})

const miniStrokeDashoffset = computed(() => {
  return MINI_CIRCUMFERENCE - (freePercent.value / 100) * MINI_CIRCUMFERENCE
})

const gaugeColor = computed(() => {
  const freeKb = (telemetry.value?.free_heap ?? 218000) / 1024
  if (freeKb > 100) return '#10b981' // Emerald
  if (freeKb > 40) return '#f59e0b'  // Amber
  return '#f43f5e'                   // Crimson
})

function formatKb(bytes?: number): string {
  if (!bytes) return '0 KB'
  return `${(bytes / 1024).toFixed(0)} KB`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${bytes} B`
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '0s'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// -------------------------------------------------------------
// Treemap Silicon Storage & Memory Models
// -------------------------------------------------------------
const totalFlashBytes = computed(() => {
  return chipDossier.value?.flash_size_bytes || 4 * 1024 * 1024
})

const totalSramBytes = 520 * 1024

const flashBlocks = computed<TreemapBlock[]>(() => {
  const total = totalFlashBytes.value
  const app0Size = 1310720 // 1.25 MB
  const spiffsSize = 1572864 // 1.50 MB
  const nvsSize = 20480 // 20 KB
  const otaDataSize = 8192 // 8 KB
  const bootloaderSize = 28672 // 28 KB
  const partitionTableSize = 4096 // 4 KB
  const unallocatedSize = Math.max(0, total - (app0Size + spiffsSize + nvsSize + otaDataSize + bootloaderSize + partitionTableSize))

  return [
    {
      id: 'spiffs',
      friendlyName: 'Animation Reels & Assets',
      techName: 'spiffs (LittleFS Partition)',
      icon: '🎞️',
      category: 'storage',
      addressHex: '0x150000',
      endAddressHex: '0x2CFFFF',
      sizeBytes: spiffsSize,
      usedBytes: 184320,
      access: 'RW-',
      status: 'optimal',
      color: '#10b981', // Emerald
      plainSummary: 'Dedicated flash storage for offline 1-bit video clips, drawings, and animation reels.',
      creatorImpact: 'Room for ~1,530 frames (100+ seconds of animation at 15 FPS) running standalone!',
      techDetail: 'SPI flash partition formatted as LittleFS with wear-leveling.',
    },
    {
      id: 'app0',
      friendlyName: 'PixelForge Firmware OS',
      techName: 'app0 (Factory App Partition)',
      icon: '🚀',
      category: 'firmware',
      addressHex: '0x010000',
      endAddressHex: '0x14FFFF',
      sizeBytes: app0Size,
      usedBytes: 440320,
      access: 'R-X',
      status: 'active',
      color: '#0284c7', // Electric Blue
      plainSummary: 'Core operating system driving the OLED display and serial binary protocol.',
      creatorImpact: 'Handles real-time 30 FPS rendering, CRC-8 packet checks, and I2C fast-mode communication.',
      techDetail: 'Cached via Xtensa flash MMU with instruction cache enabled.',
    },
    {
      id: 'unallocated',
      friendlyName: 'Available Flash Space',
      techName: 'Unallocated Flash Headroom',
      icon: '🟢',
      category: 'free',
      addressHex: '0x2D0000',
      endAddressHex: `0x${(total - 1).toString(16).toUpperCase()}`,
      sizeBytes: unallocatedSize,
      usedBytes: 0,
      access: 'RW-',
      status: 'headroom',
      color: '#059669', // Dark Emerald
      plainSummary: 'Empty flash storage available for future OTA firmware updates or larger animation storage.',
      creatorImpact: 'Zero storage anxiety: over 1 MB of spare flash space remaining.',
      techDetail: 'Raw unpartitioned flash sectors available for OTA2 partition.',
    },
    {
      id: 'nvs',
      friendlyName: 'Saved Settings & WiFi',
      techName: 'nvs (Key-Value Storage)',
      icon: '⚙️',
      category: 'storage',
      addressHex: '0x009000',
      endAddressHex: '0x00DFFF',
      sizeBytes: nvsSize,
      usedBytes: 12288,
      access: 'RW-',
      status: 'active',
      color: '#f59e0b', // Amber
      plainSummary: 'Stores your Wi-Fi credentials, last-used OLED display pins, and screen brightness.',
      creatorImpact: 'Remembers all your hardware settings across power unplugs.',
      techDetail: 'Non-volatile storage sectors with CRC32 integrity verification.',
    },
    {
      id: 'bootloader',
      friendlyName: 'Hardware Bootloader',
      techName: 'bootloader (ROM Stage 2)',
      icon: '🛡️',
      category: 'system',
      addressHex: '0x001000',
      endAddressHex: '0x007FFF',
      sizeBytes: bootloaderSize,
      usedBytes: bootloaderSize,
      access: 'R-X',
      status: 'system',
      color: '#6366f1', // Indigo
      plainSummary: 'Initializes the ESP32 CPU and handles 1-click flashing from PixelForge.',
      creatorImpact: 'Enables automatic DTR/RTS auto-reset without needing to hold physical board buttons.',
      techDetail: 'Second-stage bootloader binary executing from IRAM.',
    },
    {
      id: 'otadata',
      friendlyName: 'OTA System State',
      techName: 'otadata (Dual-Boot State)',
      icon: '🔄',
      category: 'system',
      addressHex: '0x00E000',
      endAddressHex: '0x00FFFF',
      sizeBytes: otaDataSize,
      usedBytes: 4096,
      access: 'RW-',
      status: 'system',
      color: '#8b5cf6', // Violet
      plainSummary: 'Safeguards firmware updates so the board never bricks if interrupted.',
      creatorImpact: 'Guarantees reliable recovery during firmware upgrades.',
      techDetail: 'Two mirror pages keeping rollback boot sequence pointers.',
    },
    {
      id: 'partition_table',
      friendlyName: 'Partition Map',
      techName: 'partition_table (Binary Table)',
      icon: '📑',
      category: 'system',
      addressHex: '0x008000',
      endAddressHex: '0x008FFF',
      sizeBytes: partitionTableSize,
      usedBytes: partitionTableSize,
      access: 'R--',
      status: 'system',
      color: '#475569', // Slate
      plainSummary: 'The master blueprint that tells the ESP32 where each partition lives.',
      creatorImpact: 'Ensures animation files never collide with system code.',
      techDetail: 'Binary table parsed at address 0x8000 on startup.',
    },
  ]
})

const sramBlocks = computed<TreemapBlock[]>(() => {
  const currentFree = telemetry.value?.free_heap ?? 218500
  const totalReportedHeap = telemetry.value?.total_heap ?? 328000
  const minFree = telemetry.value?.min_free_heap ?? 184200
  const watermarkMargin = Math.max(0, currentFree - minFree)
  const inUseHeap = Math.max(0, totalReportedHeap - currentFree)
  const staticBssData = 114688
  const iramSize = 131072
  const dmaBufferSize = 1024

  return [
    {
      id: 'free_heap',
      friendlyName: 'Free Dynamic RAM',
      techName: 'Free Dynamic Heap (DRAM)',
      icon: '🟢',
      category: 'free',
      addressHex: '0x3FFE0000',
      endAddressHex: '0x3FFF8000',
      sizeBytes: currentFree,
      usedBytes: 0,
      access: 'RW-',
      status: currentFree > 100000 ? 'headroom' : currentFree > 40000 ? 'warning' : 'optimal',
      color: currentFree > 100000 ? '#10b981' : currentFree > 40000 ? '#f59e0b' : '#ef4444',
      plainSummary: 'Available dynamic memory ready to receive real-time drawing and video frames.',
      creatorImpact: 'Abundant headroom: ensures smooth 30 FPS playback without frame drops or lag.',
      techDetail: 'DRAM managed by FreeRTOS multi-heap allocator.',
    },
    {
      id: 'in_use_heap',
      friendlyName: 'Active Memory Buffers',
      techName: 'Allocated Heap Objects',
      icon: '⚡',
      category: 'heap',
      addressHex: '0x3FFC0000',
      endAddressHex: '0x3FFDFFFF',
      sizeBytes: inUseHeap,
      usedBytes: inUseHeap,
      access: 'RW-',
      status: 'active',
      color: '#f59e0b',
      plainSummary: 'Memory currently in active use processing packets and managing OLED tasks.',
      creatorImpact: 'Holds incoming serial data packets while converting to display pixels.',
      techDetail: 'Allocated heap objects and FreeRTOS task stacks.',
    },
    {
      id: 'watermark_margin',
      friendlyName: 'Leak Guard Margin',
      techName: 'Watermark Safety Margin',
      icon: '🛡️',
      category: 'heap',
      addressHex: '0x3FFB8000',
      endAddressHex: '0x3FFBFFFF',
      sizeBytes: Math.max(12288, watermarkMargin),
      usedBytes: 0,
      access: 'RW-',
      status: 'optimal',
      color: '#06b6d4',
      plainSummary: 'Lowest recorded memory headroom since boot. Proves whether your firmware has leaks.',
      creatorImpact: 'Green watermark confirms your device can stream animations for days without crashing.',
      techDetail: 'Differential between current free heap and lowest recorded floor.',
    },
    {
      id: 'iram',
      friendlyName: 'Driver Code (IRAM)',
      techName: 'IRAM (Zero-Wait Memory)',
      icon: '⚡',
      category: 'system',
      addressHex: '0x40080000',
      endAddressHex: '0x4009FFFF',
      sizeBytes: iramSize,
      usedBytes: iramSize,
      access: 'R-X',
      status: 'system',
      color: '#6366f1',
      plainSummary: 'Ultra-fast memory for the I2C display driver so pixels render instantaneously.',
      creatorImpact: 'Zero lag: sends frames to your OLED at 400 kHz fast mode without stutter.',
      techDetail: 'Zero-wait-state internal memory for time-critical ISRs.',
    },
    {
      id: 'static_bss',
      friendlyName: 'Static System & Stack',
      techName: 'Static BSS & Stack',
      icon: '⚙️',
      category: 'system',
      addressHex: '0x3FFA0000',
      endAddressHex: '0x3FFB7FFF',
      sizeBytes: staticBssData,
      usedBytes: staticBssData,
      access: 'RW-',
      status: 'system',
      color: '#475569',
      plainSummary: 'Fixed system memory used by the microcontroller for background tasks.',
      creatorImpact: 'Keeps the ESP32 operating reliably in the background.',
      techDetail: 'Compile-time statically allocated variables.',
    },
    {
      id: 'dma_buffer',
      friendlyName: '128×64 OLED Buffer',
      techName: 'DMA Display Framebuffer',
      icon: '🖥️',
      category: 'dma',
      addressHex: '0x3FF9F000',
      endAddressHex: '0x3FF9F3FF',
      sizeBytes: dmaBufferSize,
      usedBytes: dmaBufferSize,
      access: 'RW-',
      status: 'active',
      color: '#ec4899',
      plainSummary: 'Exact 1024-byte pixel buffer mirrored directly to your physical OLED screen.',
      creatorImpact: 'This is the active canvas where every pixel you draw or stream is held in RAM.',
      techDetail: '8,192 bits (1024 bytes) row-major MSB-first packed buffer.',
    },
  ]
})

const currentBlocks = computed<TreemapBlock[]>(() => {
  if (viewMode.value === 'flash') return flashBlocks.value
  if (viewMode.value === 'sram') return sramBlocks.value
  return [...flashBlocks.value, ...sramBlocks.value]
})

const activeBlock = computed<TreemapBlock>(() => {
  const targetId = selectedBlockId.value ?? hoveredBlockId.value
  const found = currentBlocks.value.find((b) => b.id === targetId)
  return found || currentBlocks.value[0]
})

const currentTotalBytes = computed<number>(() => {
  if (viewMode.value === 'flash') return totalFlashBytes.value
  if (viewMode.value === 'sram') return totalSramBytes
  return totalFlashBytes.value + totalSramBytes
})

function calculatePercent(bytes: number): string {
  const pct = (bytes / currentTotalBytes.value) * 100
  return pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`
}

function calculateBlockFill(block: TreemapBlock): number {
  if (!block.usedBytes) return 0
  return Math.min(100, Math.max(0, Math.round((block.usedBytes / block.sizeBytes) * 100)))
}

function calculateLiquidHeight(block: TreemapBlock): number {
  if (block.category === 'free') {
    return 14
  }
  const fill = calculateBlockFill(block)
  return Math.min(94, Math.max(16, fill))
}

function calculateDisplayPercent(block: TreemapBlock): string {
  if (block.category === 'free') {
    return '100% FREE'
  }
  const fill = calculateBlockFill(block)
  return `${fill}%`
}

function onCardMouseEnter(id: string) {
  hoveredBlockId.value = id
}

function onCardMouseLeave(id: string) {
  if (hoveredBlockId.value === id) {
    hoveredBlockId.value = null
  }
}

function onGridMouseLeave() {
  hoveredBlockId.value = null
}

function scrollToLegend(id: string) {
  nextTick(() => {
    const el = document.getElementById(`legend-item-${id}`)
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  })
}

function selectBlock(id: string, openDossier = false) {
  selectedBlockId.value = id
  if (openDossier) {
    isDossierOpen.value = true
    scrollToLegend(id)
  }
}

function closeDossier() {
  isDossierOpen.value = false
  selectedBlockId.value = null
}

function toggleDossier() {
  isDossierOpen.value = !isDossierOpen.value
  if (isDossierOpen.value && !selectedBlockId.value) {
    selectedBlockId.value = currentBlocks.value[0]?.id ?? 'spiffs'
    scrollToLegend(selectedBlockId.value)
  } else if (!isDossierOpen.value) {
    selectedBlockId.value = null
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isDossierOpen.value) {
    closeDossier()
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
  <div class="silicon-telemetry-dashboard">
    <!-- ========================================================= -->
    <!-- 1. COMPACT TOP HUD STRIP (Zero Scroll, High Density)     -->
    <!-- ========================================================= -->
    <header class="compact-hud-strip">
      <!-- Left: Identity & Connection -->
      <div class="hud-left">
        <span class="hud-badge font-mono">COCKPIT</span>
        <div class="conn-pill" :class="isConnected ? 'conn-live' : 'conn-demo'">
          <span class="conn-dot" />
          <span class="conn-text font-mono">{{ isConnected ? 'ESP32 LIVE' : 'DEMO PROFILE' }}</span>
        </div>
        <span class="chip-name font-mono">
          {{ chipDossier?.chip_model ?? 'ESP32 DevKit V1' }}
        </span>
      </div>

      <!-- Center: Compact Radial RAM Gauge & Watermark Floor -->
      <div class="hud-center">
        <!-- Mini Radial RAM Gauge -->
        <div class="mini-gauge-group" title="Dynamic RAM Free Headroom">
          <div class="mini-gauge-svg-wrap">
            <svg class="mini-svg" viewBox="0 0 36 36">
              <circle class="mini-gauge-bg" cx="18" cy="18" :r="MINI_RADIUS" />
              <circle
                class="mini-gauge-fill"
                cx="18"
                cy="18"
                :r="MINI_RADIUS"
                :stroke="gaugeColor"
                :stroke-dasharray="MINI_CIRCUMFERENCE"
                :stroke-dashoffset="miniStrokeDashoffset"
                transform="rotate(-90 18 18)"
              />
              <text
                x="18"
                y="18.5"
                text-anchor="middle"
                dominant-baseline="central"
                class="mini-gauge-svg-text font-mono"
                :fill="gaugeColor"
              >
                {{ freePercent.toFixed(0) }}%
              </text>
            </svg>
          </div>
          <div class="mini-gauge-text">
            <span class="text-label">RAM FREE</span>
            <span class="text-val font-mono" :style="{ color: gaugeColor }">
              {{ formatKb(telemetry?.free_heap ?? 218500) }}
            </span>
          </div>
        </div>

        <div class="hud-divider" />

        <!-- Mini Watermark Floor -->
        <div class="mini-watermark-group" title="Lowest recorded memory floor since boot (Leak guard)">
          <div class="watermark-info">
            <span class="text-label">LEAK FLOOR</span>
            <span class="text-val font-mono text-cyan">
              {{ formatKb(telemetry?.min_free_heap ?? 184200) }}
            </span>
          </div>
          <div class="mini-watermark-track">
            <div
              class="mini-watermark-bar"
              :style="{ width: `${Math.min(100, (((telemetry?.min_free_heap ?? 184200)) / (telemetry?.total_heap ?? 328000)) * 100)}%` }"
            />
          </div>
        </div>
      </div>

      <!-- Right: Live HUD Telemetry Pills -->
      <div class="hud-right">
        <div class="hud-chip pill-fps" title="Live OLED render FPS">
          <span class="chip-icon">⚡</span>
          <span class="chip-val font-mono">{{ (telemetry?.current_fps ?? 30.0).toFixed(1) }} FPS</span>
        </div>
        <div class="hud-chip" title="Microcontroller uptime">
          <span class="chip-icon">⏱</span>
          <span class="chip-val font-mono">{{ formatUptime(telemetry?.uptime_seconds ?? 4820) }}</span>
        </div>
        <div class="hud-chip" title="Frames rendered">
          <span class="chip-icon">🖼</span>
          <span class="chip-val font-mono">#{{ telemetry?.frame_counter ?? 1420 }}</span>
        </div>
        <div class="hud-chip" title="OLED contrast">
          <span class="chip-icon">💡</span>
          <span class="chip-val font-mono">{{ telemetry?.oled_contrast ?? 255 }}</span>
        </div>
        <div class="hud-chip pill-wifi" :class="`wifi-${telemetry?.wifi_status ?? 'connected'}`" title="Wi-Fi connectivity">
          <span class="chip-icon">📶</span>
          <span class="chip-val font-mono">{{ telemetry?.wifi_status ?? 'Connected' }}</span>
        </div>
      </div>
    </header>

    <!-- ========================================================= -->
    <!-- 2. SILICON HEATMAP & DOSSIER (Fills 100% Remaining Height)-->
    <!-- ========================================================= -->
    <main class="treemap-main-card">
      <!-- Sleek Section Toolbar -->
      <div class="section-toolbar">
        <div class="toolbar-title-group">
          <span class="toolbar-icon">🗺️</span>
          <h3 class="toolbar-title">Silicon Storage & Memory Heatmap</h3>
          <span class="toolbar-subtag font-mono">
            {{ viewMode === 'flash' ? `Flash: ${formatBytes(totalFlashBytes)}` : viewMode === 'sram' ? `RAM: ${formatBytes(totalSramBytes)}` : 'Unified View' }}
          </span>
        </div>

        <div class="toolbar-controls">
          <!-- Floating Inspector Toggle -->
          <button
            class="compact-btn"
            :class="{ 'compact-btn--active': isDossierOpen }"
            title="Toggle Floating Block Inspector (Esc to close)"
            @click="toggleDossier"
          >
            📑 Inspector {{ isDossierOpen ? '●' : '' }}
          </button>

          <!-- Creator vs CS Toggle -->
          <div class="compact-toggle-group">
            <button
              class="compact-btn"
              :class="{ 'compact-btn--active': detailLevel === 'creator' }"
              title="Creator Mode: Plain English labels & animation capacity"
              @click="detailLevel = 'creator'"
            >
              👤 Creator
            </button>
            <button
              class="compact-btn"
              :class="{ 'compact-btn--active': detailLevel === 'engineer' }"
              title="Engineer Mode: Hex addresses, access permissions & MMU"
              @click="detailLevel = 'engineer'"
            >
              🔬 CS Engineer
            </button>
          </div>

          <!-- View Mode (Flash / RAM / Unified) -->
          <div class="compact-toggle-group">
            <button
              class="compact-btn"
              :class="{ 'compact-btn--active': viewMode === 'flash' }"
              @click="viewMode = 'flash'; selectBlock('spiffs', isDossierOpen)"
            >
              💾 Flash
            </button>
            <button
              class="compact-btn"
              :class="{ 'compact-btn--active': viewMode === 'sram' }"
              @click="viewMode = 'sram'; selectBlock('free_heap', isDossierOpen)"
            >
              ⚡ RAM
            </button>
            <button
              class="compact-btn"
              :class="{ 'compact-btn--active': viewMode === 'unified' }"
              @click="viewMode = 'unified'; selectBlock('spiffs', isDossierOpen)"
            >
              🧩 All
            </button>
          </div>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- DEDICATED SILICON MEMORY DISTRIBUTION PRISM (Prominent)   -->
      <!-- ========================================================= -->
      <section class="memory-distribution-section">
        <div class="distribution-header">
          <div class="dist-header-left">
            <span class="dist-icon">🌈</span>
            <span class="dist-title">Silicon Memory Topology</span>
            <span class="dist-scope-badge font-mono">
              {{ viewMode === 'flash' ? `Flash 4.0 MB` : viewMode === 'sram' ? `SRAM 328 KB` : `Unified 4.33 MB` }}
            </span>
          </div>
          <div class="dist-header-right font-mono">
            <span class="dist-hint">💡 Click any segment or card to open details</span>
          </div>
        </div>

        <!-- Thicker Glass Prism Distribution Bar (24px) -->
        <div class="distribution-bar-wrap" role="progressbar" title="Proportional distribution of memory across chip">
          <div
            v-for="b in currentBlocks"
            :key="b.id"
            class="dist-segment"
            :class="{ 'dist-segment--active': b.id === activeBlockId }"
            :style="{
              width: `${(b.sizeBytes / currentTotalBytes) * 100}%`,
              backgroundColor: b.color,
              boxShadow: b.id === activeBlockId ? `inset 0 0 0 2px #ffffff, 0 0 16px ${b.color}` : 'none',
              zIndex: b.id === activeBlockId ? 5 : 1,
            }"
            :title="`${b.friendlyName}: ${formatBytes(b.sizeBytes)} (${calculatePercent(b.sizeBytes)})`"
            @mouseenter="onCardMouseEnter(b.id)"
            @mouseleave="onCardMouseLeave(b.id)"
            @click="selectBlock(b.id, true)"
          >
            <div class="segment-shine" />
            <span v-if="((b.sizeBytes / currentTotalBytes) * 100) > 10" class="dist-label font-mono">
              {{ b.friendlyName }}
            </span>
            <span v-else-if="((b.sizeBytes / currentTotalBytes) * 100) > 4" class="dist-label font-mono">
              {{ formatBytes(b.sizeBytes) }}
            </span>
          </div>
        </div>

        <!-- Informative Quick Legend Strip -->
        <div class="distribution-legend-strip font-mono">
          <button
            v-for="b in currentBlocks"
            :key="`legend-${b.id}`"
            :id="`legend-item-${b.id}`"
            class="legend-item"
            :class="{ 'legend-item--active': b.id === activeBlockId }"
            :style="b.id === activeBlockId ? {
              backgroundColor: `${b.color}25`,
              borderColor: b.color,
              boxShadow: `0 0 12px ${b.color}75, inset 0 0 4px ${b.color}40`,
              color: '#ffffff',
            } : {}"
            :title="`Inspect ${b.friendlyName} (${formatBytes(b.sizeBytes)})`"
            @mouseenter="onCardMouseEnter(b.id)"
            @mouseleave="onCardMouseLeave(b.id)"
            @click="selectBlock(b.id, true)"
          >
            <span class="legend-color-dot" :style="{ backgroundColor: b.color }" />
            <span class="legend-name">{{ b.friendlyName }}</span>
            <span class="legend-val text-muted">{{ formatBytes(b.sizeBytes) }}</span>
            <span class="legend-pct" :style="{ color: b.color }">({{ calculatePercent(b.sizeBytes) }})</span>
          </button>
        </div>
      </section>

      <!-- ========================================================= -->
      <!-- FULL-WIDTH TILES WORKSPACE (Spacious Layout)             -->
      <!-- ========================================================= -->
      <div class="heatmap-workspace-area">
        <!-- Proportional Responsive Tiles Grid (100% Horizontal Space) -->
        <div class="tiles-grid" @mouseleave="onGridMouseLeave">
          <div
            v-for="block in currentBlocks"
            :key="block.id"
            class="finviz-tile"
            :class="{
              'tile--active': block.id === activeBlockId,
              'tile--selected': block.id === selectedBlockId && isDossierOpen,
              [`cat--${block.category}`]: true,
            }"
            :style="block.id === activeBlockId ? {
              borderColor: block.color,
              boxShadow: `inset 0 1px 2px rgba(255, 255, 255, 0.35), 0 0 0 1.5px ${block.color}85, 0 12px 30px ${block.color}45`,
            } : {}"
            @mouseenter="onCardMouseEnter(block.id)"
            @mouseleave="onCardMouseLeave(block.id)"
            @click="selectBlock(block.id, true)"
          >
            <!-- Glass Specular Reflection Highlight -->
            <div class="tile-glass-specular" />

            <!-- Vertical Animated Liquid Fill with Diluted Overlapping Waves (Soft, Organic Watercolor Feel) -->
            <div
              class="tile-liquid-fill"
              :style="{
                height: `${calculateLiquidHeight(block)}%`,
                background: `linear-gradient(180deg, ${block.color}35 0%, ${block.color}1e 45%, ${block.color}0a 100%)`,
                boxShadow: `0 -4px 18px ${block.color}25`,
              }"
            >
              <!-- Diluted Overlapping Liquid Wave Surface SVG -->
              <div class="subtle-wave-wrap">
                <svg class="subtle-wave-svg" viewBox="0 0 320 20" preserveAspectRatio="none">
                  <!-- Back wave: gentle deep ripple -->
                  <path
                    class="wave-path wave-path-back"
                    :fill="block.color"
                    fill-opacity="0.14"
                    d="M0,10 C40,4 90,16 160,10 C230,4 280,16 320,10 L320,20 L0,20 Z"
                  />
                  <!-- Mid wave: overlapping offset ripple -->
                  <path
                    class="wave-path wave-path-mid"
                    :fill="block.color"
                    fill-opacity="0.22"
                    d="M0,10 C50,15 110,5 170,11 C230,17 280,6 320,10 L320,20 L0,20 Z"
                  />
                  <!-- Front wave: soft crest ripple -->
                  <path
                    class="wave-path wave-path-front"
                    :fill="block.color"
                    fill-opacity="0.30"
                    d="M0,10 C60,6 120,15 180,9 C240,3 290,14 320,10 L320,20 L0,20 Z"
                  />
                </svg>
              </div>
            </div>

            <!-- Floating Percentage Gauge Pill at Water Surface Level on Card Edge -->
            <div
              class="water-edge-pill-wrap"
              :style="{
                bottom: `${calculateLiquidHeight(block)}%`,
              }"
            >
              <div
                class="surface-gauge-pill font-mono"
                :style="{
                  backgroundColor: block.color,
                  boxShadow: `0 2px 10px ${block.color}75`,
                }"
                :title="`Fill Level: ${calculateDisplayPercent(block)}`"
              >
                <span class="pill-dot" />
                {{ calculateDisplayPercent(block) }}
              </div>
            </div>

            <!-- Clean Minimalist Tile Content Layer -->
            <div class="tile-content-layer">
              <!-- Header: Category & Access -->
              <div class="tile-header">
                <div class="tile-cat-badge font-mono" :style="{ color: block.color }">
                  <span class="cat-dot" :style="{ backgroundColor: block.color }" />
                  {{ block.category.toUpperCase() }}
                </div>
                <span class="tile-access font-mono">{{ block.access }}</span>
              </div>

              <!-- Title Row: Fully Visible, Never Truncated with Dots -->
              <div class="tile-title-row">
                <span class="tile-icon">{{ block.icon }}</span>
                <h5 class="tile-full-title">
                  {{ detailLevel === 'creator' ? block.friendlyName : block.techName }}
                </h5>
              </div>

              <!-- Central Metric: Bold Size & Submetric Info -->
              <div class="tile-metric-block">
                <div class="tile-size font-mono">{{ formatBytes(block.sizeBytes) }}</div>
                <div class="tile-submetric font-mono">
                  <span class="submetric-share">{{ calculatePercent(block.sizeBytes) }} share</span>
                  <span class="submetric-dot">•</span>
                  <span class="submetric-status">
                    {{ block.usedBytes > 0 ? `${formatBytes(Math.max(0, block.sizeBytes - block.usedBytes))} free` : '100% free' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================================= -->
        <!-- FLOATING INTERACTIVE BLOCK DOSSIER (Slides in on Click)   -->
        <!-- ========================================================= -->
        <Transition name="dossier-slide">
          <aside
            v-if="isDossierOpen"
            class="block-dossier-card floating-dossier-card"
          >
            <!-- Close Button -->
            <button
              class="dossier-close-btn"
              title="Close Dossier Inspector (Esc)"
              @click="closeDossier"
            >
              ✕
            </button>

            <!-- Top: Identity & Summary -->
            <div class="dossier-top">
              <div class="dossier-header-row">
                <span class="dossier-icon">{{ activeBlock.icon }}</span>
                <div class="dossier-names">
                  <div class="dossier-badges">
                    <span class="badge-cat font-mono" :style="{ color: activeBlock.color }">
                      {{ activeBlock.category.toUpperCase() }}
                    </span>
                    <span class="badge-status" :class="`pill--${activeBlock.status}`">
                      {{ activeBlock.status.toUpperCase() }}
                    </span>
                  </div>
                  <h4 class="dossier-heading">{{ activeBlock.friendlyName }}</h4>
                  <span class="dossier-subheading font-mono">{{ activeBlock.techName }}</span>
                </div>
              </div>

              <div class="plain-summary-card">
                <p class="summary-text">{{ activeBlock.plainSummary }}</p>
              </div>
            </div>

            <!-- Middle: 4-Item Compact Metrics Grid -->
            <div class="dossier-stats-grid">
              <div class="stat-box">
                <span class="stat-lbl">ALLOCATED</span>
                <span class="stat-val font-mono" :style="{ color: activeBlock.color }">
                  {{ formatBytes(activeBlock.sizeBytes) }}
                </span>
              </div>
              <div class="stat-box">
                <span class="stat-lbl">CHIP SHARE</span>
                <span class="stat-val font-mono">{{ calculatePercent(activeBlock.sizeBytes) }}</span>
              </div>
              <div class="stat-box">
                <span class="stat-lbl">CURRENT USAGE</span>
                <span class="stat-val font-mono">
                  {{ activeBlock.usedBytes ? formatBytes(activeBlock.usedBytes) : '0 B (Free)' }}
                </span>
              </div>
              <div class="stat-box">
                <span class="stat-lbl">FREE HEADROOM</span>
                <span class="stat-val font-mono text-emerald">
                  {{ formatBytes(Math.max(0, activeBlock.sizeBytes - activeBlock.usedBytes)) }}
                </span>
              </div>
            </div>

            <!-- Creator Animation Impact Box -->
            <div class="creator-note-box">
              <span class="note-badge">CREATOR IMPACT:</span>
              <p class="note-text">{{ activeBlock.creatorImpact }}</p>
            </div>

            <!-- Bottom: Tech Specs Footer -->
            <div class="tech-footer-box">
              <div class="tech-header font-mono">
                <span>BASE: <strong class="text-cyan">{{ activeBlock.addressHex }}</strong></span>
                <span>END: <strong class="text-cyan">{{ activeBlock.endAddressHex }}</strong></span>
              </div>
              <p class="tech-detail-text">{{ activeBlock.techDetail }}</p>
            </div>
          </aside>
        </Transition>
      </div>
    </main>
  </div>
</template>

<style scoped>
.silicon-telemetry-dashboard {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  width: 100%;
  overflow: hidden; /* Strict: zero scrollbars */
}

/* ========================================================= */
/* 1. COMPACT TOP HUD STRIP                                  */
/* ========================================================= */
.compact-hud-strip {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  flex-shrink: 0;
  height: 52px;
}

.hud-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.hud-badge {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.conn-pill {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
}

.conn-live {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.conn-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: #10b981;
  animation: pulse-dot 2s infinite ease-in-out;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}

.conn-demo {
  background: var(--color-bg-base);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.chip-name {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

/* Center HUD Gauges */
.hud-center {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-shrink: 0;
}

.mini-gauge-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.mini-gauge-svg-wrap {
  position: relative;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.mini-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.mini-gauge-bg {
  fill: none;
  stroke: var(--color-border-subtle);
  stroke-width: 3.5;
}

.mini-gauge-fill {
  fill: none;
  stroke-width: 3.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s ease;
}

.mini-gauge-svg-text {
  font-size: 8.8px;
  font-weight: 800;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  letter-spacing: -0.4px;
  user-select: none;
}

.mini-gauge-text {
  display: flex;
  flex-direction: column;
}

.text-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}

.text-val {
  font-size: 0.76rem;
  font-weight: 800;
}

.hud-divider {
  width: 1px;
  height: 24px;
  background: var(--color-border);
}

.mini-watermark-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 120px;
}

.watermark-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mini-watermark-track {
  width: 100%;
  height: 4px;
  background: var(--color-border-subtle);
  border-radius: 9999px;
  overflow: hidden;
}

.mini-watermark-bar {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #10b981);
  border-radius: 9999px;
}

/* Right HUD Chips */
.hud-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.hud-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 0.15rem 0.45rem;
  font-size: 0.68rem;
  color: var(--color-text-secondary);
}

.chip-icon {
  font-size: 0.72rem;
}

.chip-val {
  font-weight: 700;
  color: var(--color-text-primary);
}

.pill-fps .chip-val {
  color: #38bdf8;
}

.pill-wifi.wifi-connected {
  border-color: rgba(16, 185, 129, 0.35);
  color: #10b981;
}

/* ========================================================= */
/* 2. SILICON HEATMAP & DOSSIER (Fills 100% Height)          */
/* ========================================================= */
.treemap-main-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.55rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Toolbar */
.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-shrink: 0;
  height: 32px;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 0.35rem;
}

.toolbar-title-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.toolbar-icon {
  font-size: 0.95rem;
}

.toolbar-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.toolbar-subtag {
  font-size: 0.64rem;
  color: var(--color-text-muted);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.compact-toggle-group {
  display: flex;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 1px;
  gap: 1px;
}

.compact-btn {
  font-size: 0.66rem;
  font-weight: 600;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.compact-btn:hover {
  color: var(--color-text-primary);
}

.compact-btn--active {
  background: var(--color-bg-elevated);
  color: var(--color-accent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Dedicated Memory Distribution Section */
.memory-distribution-section {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex-shrink: 0;
}

.distribution-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.dist-header-left {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dist-icon {
  font-size: 0.85rem;
}

.dist-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.dist-scope-badge {
  font-size: 0.62rem;
  color: var(--color-accent);
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
}

.dist-hint {
  font-size: 0.58rem;
  color: var(--color-text-muted);
}

/* Prominent 24px Multi-Colored Glass Prism Bar */
.distribution-bar-wrap {
  width: 100%;
  height: 24px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.7), 0 2px 10px rgba(0, 0, 0, 0.35);
  border-radius: 6px;
  display: flex;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

.dist-segment {
  height: 100%;
  transition: width 0.3s ease, filter 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(0, 0, 0, 0.55);
  position: relative;
  cursor: pointer;
  user-select: none;
}

.dist-segment:hover,
.dist-segment--active {
  filter: brightness(1.3);
  z-index: 2;
}

.dist-segment--active::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1.5px solid #ffffff;
  pointer-events: none;
}

.segment-shine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.04) 100%);
  pointer-events: none;
}

.dist-label {
  font-size: 0.6rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.98);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 0.4rem;
  z-index: 1;
}

/* Informative Legend Strip */
.distribution-legend-strip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0.05rem 0;
}

.distribution-legend-strip::-webkit-scrollbar {
  display: none;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 0.12rem 0.4rem;
  font-size: 0.58rem;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.legend-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
  color: var(--color-text-primary);
}

.legend-item--active {
  color: #ffffff !important;
  transform: translateY(-1px);
}

.legend-item--active .legend-color-dot {
  transform: scale(1.25);
  box-shadow: 0 0 6px currentColor;
}

.legend-color-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.legend-name {
  font-weight: 600;
}

.legend-pct {
  font-weight: 700;
}

/* Full-Width Heatmap Workspace Area */
.heatmap-workspace-area {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* Proportional Heatmap Tiles Grid - Full 100% Horizontal Space */
.tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  grid-auto-rows: 1fr;
  gap: 0.6rem;
  padding: 0.35rem; /* Safe padding so scaled cards never clip or overlap container boundaries */
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* The Finviz Tile: Frosted Glass Container with Illuminated Liquid */
.finviz-tile {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.75) 100%);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transform-origin: center center;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.22s ease, box-shadow 0.22s ease;
  min-height: 0;
  box-shadow: inset 0 1px 1.5px rgba(255, 255, 255, 0.18), inset 0 -1px 2px rgba(0, 0, 0, 0.5), 0 6px 18px rgba(0, 0, 0, 0.35);
}

.finviz-tile:hover {
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.02);
  z-index: 10;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.35), 0 12px 28px rgba(0, 0, 0, 0.55);
}

.tile--active {
  transform: scale(1.024) !important;
  z-index: 20 !important;
}

/* Glass Specular Reflection Highlight (top glossy curved sheen) */
.tile-glass-specular {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 42%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 60%, transparent 100%);
  pointer-events: none;
  z-index: 3;
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
}

/* Vertical Animated Liquid Fill rising from bottom of Glass Container */
.tile-liquid-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 1;
  transition: height 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: visible;
}

/* Diluted Overlapping Liquid Waves (Soft, Organic Watercolor Feel) */
.subtle-wave-wrap {
  position: absolute;
  top: -12px;
  left: -20%;
  width: 140%;
  height: 18px;
  pointer-events: none;
  overflow: hidden;
}

.subtle-wave-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.wave-path-front {
  animation: wave-front-drift 6.5s ease-in-out infinite alternate;
}

.wave-path-mid {
  animation: wave-mid-drift 8.5s ease-in-out infinite alternate;
}

.wave-path-back {
  animation: wave-back-drift 11s ease-in-out infinite alternate;
}

@keyframes wave-front-drift {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-40px);
  }
}

@keyframes wave-mid-drift {
  0% {
    transform: translateX(-15px);
  }
  100% {
    transform: translateX(20px);
  }
}

@keyframes wave-back-drift {
  0% {
    transform: translateX(-30px);
  }
  100% {
    transform: translateX(10px);
  }
}

/* Floating Percentage Gauge Pill at Water Surface Level on Card Edge */
.water-edge-pill-wrap {
  position: absolute;
  right: 6px;
  z-index: 6;
  pointer-events: none;
  transform: translateY(50%);
  transition: bottom 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.surface-gauge-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  padding: 0.12rem 0.38rem;
  border-radius: 9999px;
  font-size: 0.58rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  white-space: nowrap;
  user-select: none;
}

.surface-gauge-pill .pill-dot {
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background-color: #ffffff;
  box-shadow: 0 0 4px #ffffff;
}


/* Clean Minimalist Tile Content Layer */
.tile-content-layer {
  position: relative;
  z-index: 2;
  height: 100%;
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.25rem;
}

.tile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
}

.tile-cat-badge {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.cat-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
}

.tile-access {
  font-size: 0.54rem;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
  letter-spacing: 0.02em;
}

/* Title Row: STRICTLY FULLY VISIBLE, NEVER DOTTED */
.tile-title-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.1rem 0;
}

.tile-icon {
  font-size: 0.95rem;
  flex-shrink: 0;
}

.tile-full-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.25;
  white-space: normal; /* STRICT: No single-line clipping */
  overflow: visible;   /* STRICT: No hidden overflow */
  text-overflow: clip; /* STRICT: No ellipsis dots */
  word-break: normal;
}

/* Central Metric: Bold Size & Submetric Info */
.tile-metric-block {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.tile-size {
  font-size: 1.05rem;
  font-weight: 800;
  color: #ffffff;
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.tile-submetric {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.58rem;
  line-height: 1;
}

.submetric-share {
  color: var(--color-text-secondary);
  font-weight: 600;
}

.submetric-dot {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.submetric-status {
  color: var(--color-text-muted);
}

/* Right Dossier Panel */
.block-dossier-card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.4rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.dossier-top {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.dossier-header-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.dossier-icon {
  font-size: 1.5rem;
  line-height: 1;
  flex-shrink: 0;
}

.dossier-names {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  overflow: hidden;
}

.dossier-badges {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.badge-cat {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.badge-status {
  font-size: 0.54rem;
  font-weight: 700;
  padding: 0.05rem 0.3rem;
  border-radius: 9999px;
  text-transform: uppercase;
}

.pill--optimal, .pill--headroom {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.pill--active {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.pill--system {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.dossier-heading {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.dossier-subheading {
  font-size: 0.62rem;
  color: var(--color-text-muted);
}

.plain-summary-card {
  background: var(--color-bg-surface);
  border-left: 2.5px solid #38bdf8;
  border-radius: 3px;
  padding: 0.4rem 0.55rem;
}

.summary-text {
  font-size: 0.68rem;
  color: var(--color-text-primary);
  line-height: 1.35;
  margin: 0;
}

/* 4-Item Compact Stats */
.dossier-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  padding: 0.45rem;
}

.stat-box {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.stat-lbl {
  font-size: 0.54rem;
  color: var(--color-text-muted);
  letter-spacing: 0.03em;
}

.stat-val {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

/* Creator Note */
.creator-note-box {
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.22);
  border-radius: 5px;
  padding: 0.4rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.note-badge {
  font-size: 0.54rem;
  font-weight: 800;
  color: #10b981;
  letter-spacing: 0.04em;
}

.note-text {
  font-size: 0.66rem;
  color: var(--color-text-secondary);
  line-height: 1.3;
  margin: 0;
}

/* Tech Specs Footer */
.tech-footer-box {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  padding: 0.4rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.tech-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.56rem;
  color: var(--color-text-muted);
}

.tech-detail-text {
  font-size: 0.62rem;
  color: var(--color-text-muted);
  line-height: 1.25;
  margin: 0;
}

.text-cyan { color: #38bdf8; }
.text-emerald { color: #10b981; }

/* Floating Interactive Block Dossier (Overlay Card) */
.floating-dossier-card {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  width: 360px;
  max-width: calc(100% - 1rem);
  z-index: 50;
  background: rgba(15, 23, 42, 0.94) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255, 255, 255, 0.22) !important;
  border-radius: 8px !important;
  box-shadow: -10px 0 36px rgba(0, 0, 0, 0.75), 0 10px 25px rgba(0, 0, 0, 0.6) !important;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.45rem;
  padding: 0.85rem 0.95rem !important;
  overflow-y: auto;
}

.dossier-close-btn {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 9999px;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  z-index: 10;
}

.dossier-close-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.6);
  color: #ef4444;
  transform: scale(1.08);
}

/* Slide Transition */
.dossier-slide-enter-active,
.dossier-slide-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.dossier-slide-enter-from,
.dossier-slide-leave-to {
  transform: translateX(110%);
  opacity: 0;
}
</style>
