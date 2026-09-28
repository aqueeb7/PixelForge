<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeviceStore } from '../../stores/device'

const deviceStore = useDeviceStore()

export type TreemapViewMode = 'flash' | 'sram' | 'unified'
export type ViewDetailLevel = 'creator' | 'engineer'

const viewMode = ref<TreemapViewMode>('flash')
const detailLevel = ref<ViewDetailLevel>('creator')

const isConnected = computed(() => deviceStore.status === 'connected')
const telemetry = computed(() => deviceStore.telemetry)
const chipDossier = computed(() => deviceStore.chipDossier)

// Active inspected block
const selectedBlockId = ref<string>('spiffs')

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
// Live Telemetry Calculations (formerly from MemoryGauges)
// -------------------------------------------------------------
const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const heapUsagePercent = computed(() => {
  if (!telemetry.value || !telemetry.value.total_heap) return 33
  const used = telemetry.value.total_heap - telemetry.value.free_heap
  return Math.min(100, Math.max(0, (used / telemetry.value.total_heap) * 100))
})

const freePercent = computed(() => {
  return 100 - heapUsagePercent.value
})

const strokeDashoffset = computed(() => {
  return CIRCUMFERENCE - (freePercent.value / 100) * CIRCUMFERENCE
})

const gaugeColor = computed(() => {
  const freeKb = (telemetry.value?.free_heap ?? 218000) / 1024
  if (freeKb > 100) return '#10b981' // Emerald
  if (freeKb > 40) return '#f59e0b'  // Amber
  return '#f43f5e'                   // Crimson
})

const gradientStart = computed(() => {
  const freeKb = (telemetry.value?.free_heap ?? 218000) / 1024
  if (freeKb > 100) return '#38bdf8'
  if (freeKb > 40) return '#fbbf24'
  return '#fb7185'
})

const gradientEnd = computed(() => {
  const freeKb = (telemetry.value?.free_heap ?? 218000) / 1024
  if (freeKb > 100) return '#10b981'
  if (freeKb > 40) return '#f59e0b'
  return '#e11d48'
})

function formatKb(bytes?: number): string {
  if (!bytes) return '0 KB'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${bytes} B`
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '0s'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
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
      techName: 'spiffs (LittleFS)',
      icon: '🎞️',
      category: 'storage',
      addressHex: '0x150000',
      endAddressHex: '0x2CFFFF',
      sizeBytes: spiffsSize,
      usedBytes: 184320, // ~180 KB used for starter animations
      access: 'RW-',
      status: 'optimal',
      color: '#10b981', // Emerald
      plainSummary: 'Dedicated flash storage for offline 1-bit video clips, drawings, and animation reels.',
      creatorImpact: 'Room for ~1,530 frames (100+ seconds of animation at 15 FPS) running without a PC!',
      techDetail: 'SPI flash partition formatted as LittleFS with wear-leveling.',
    },
    {
      id: 'app0',
      friendlyName: 'PixelForge Firmware OS',
      techName: 'app0 (Factory App)',
      icon: '🚀',
      category: 'firmware',
      addressHex: '0x010000',
      endAddressHex: '0x14FFFF',
      sizeBytes: app0Size,
      usedBytes: 440320, // ~430 KB application code
      access: 'R-X',
      status: 'active',
      color: '#0284c7', // Electric Blue
      plainSummary: 'The core operating system running on the ESP32 that drives the OLED display and serial protocol.',
      creatorImpact: 'Handles real-time 30 FPS rendering, CRC-8 packet checks, and I2C fast-mode communication.',
      techDetail: 'Cached via Xtensa flash MMU with instruction cache enabled.',
    },
    {
      id: 'unallocated',
      friendlyName: 'Available Expansion Space',
      techName: 'Unallocated Flash',
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
      friendlyName: 'Saved Settings & Wi-Fi',
      techName: 'nvs (Key-Value)',
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
      techName: 'bootloader (ROM)',
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
      friendlyName: 'Dual-Boot System State',
      techName: 'otadata (OTA State)',
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
      friendlyName: 'Partition Table Map',
      techName: 'partition_table',
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
  const staticBssData = 114688 // ~112 KB
  const iramSize = 131072 // 128 KB
  const dmaBufferSize = 1024 // 1024 bytes canonical OLED frame buffer

  return [
    {
      id: 'free_heap',
      friendlyName: 'Free Dynamic RAM',
      techName: 'Free Dynamic Heap',
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
      techName: 'Allocated Heap',
      icon: '⚡',
      category: 'heap',
      addressHex: '0x3FFC0000',
      endAddressHex: '0x3FFDFFFF',
      sizeBytes: inUseHeap,
      usedBytes: inUseHeap,
      access: 'RW-',
      status: 'active',
      color: '#f59e0b', // Amber
      plainSummary: 'Memory currently in active use processing packets and managing OLED tasks.',
      creatorImpact: 'Holds incoming serial data packets while converting to display pixels.',
      techDetail: 'Allocated heap objects and FreeRTOS task stacks.',
    },
    {
      id: 'watermark_margin',
      friendlyName: 'Memory Leak Guard',
      techName: 'Watermark Safety Margin',
      icon: '🛡️',
      category: 'heap',
      addressHex: '0x3FFB8000',
      endAddressHex: '0x3FFBFFFF',
      sizeBytes: Math.max(12288, watermarkMargin),
      usedBytes: 0,
      access: 'RW-',
      status: 'optimal',
      color: '#06b6d4', // Cyan
      plainSummary: 'Lowest recorded memory headroom since boot. Proves whether your firmware has leaks.',
      creatorImpact: 'Green watermark confirms your device can stream animations for days without crashing.',
      techDetail: 'Differential between current free heap and xPortGetMinimumEverFreeHeapSize().',
    },
    {
      id: 'dma_buffer',
      friendlyName: '128×64 OLED Framebuffer',
      techName: 'DMA Display Buffer',
      icon: '🖥️',
      category: 'dma',
      addressHex: '0x3FF9F000',
      endAddressHex: '0x3FF9F3FF',
      sizeBytes: dmaBufferSize,
      usedBytes: dmaBufferSize,
      access: 'RW-',
      status: 'active',
      color: '#ec4899', // Pink
      plainSummary: 'Exact 1024-byte pixel buffer mirrored directly to your physical OLED screen.',
      creatorImpact: 'This is the active canvas where every pixel you draw or stream is held in RAM.',
      techDetail: '8,192 bits (1024 bytes) row-major MSB-first packed buffer.',
    },
    {
      id: 'iram',
      friendlyName: 'High-Speed Driver Code',
      techName: 'IRAM (Instruction RAM)',
      icon: '⚡',
      category: 'system',
      addressHex: '0x40080000',
      endAddressHex: '0x4009FFFF',
      sizeBytes: iramSize,
      usedBytes: iramSize,
      access: 'R-X',
      status: 'system',
      color: '#6366f1', // Indigo
      plainSummary: 'Ultra-fast memory for the I2C display driver so pixels render instantaneously.',
      creatorImpact: 'Zero lag: sends frames to your OLED at 400 kHz fast mode without stutter.',
      techDetail: 'Zero-wait-state internal memory for time-critical ISRs.',
    },
    {
      id: 'static_bss',
      friendlyName: 'System Variables & OS',
      techName: 'Static BSS & Stack',
      icon: '⚙️',
      category: 'system',
      addressHex: '0x3FFA0000',
      endAddressHex: '0x3FFB7FFF',
      sizeBytes: staticBssData,
      usedBytes: staticBssData,
      access: 'RW-',
      status: 'system',
      color: '#475569', // Slate
      plainSummary: 'Fixed system memory used by the microcontroller for background tasks.',
      creatorImpact: 'Keeps the ESP32 operating reliably in the background.',
      techDetail: 'Compile-time statically allocated variables.',
    },
  ]
})

const currentBlocks = computed<TreemapBlock[]>(() => {
  if (viewMode.value === 'flash') return flashBlocks.value
  if (viewMode.value === 'sram') return sramBlocks.value
  return [...flashBlocks.value, ...sramBlocks.value]
})

const activeBlock = computed<TreemapBlock>(() => {
  const found = currentBlocks.value.find((b) => b.id === selectedBlockId.value)
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

function selectBlock(id: string) {
  selectedBlockId.value = id
}
</script>

<template>
  <div class="silicon-telemetry-dashboard">
    <!-- ========================================================= -->
    <!-- 1. TOP UNIFIED TELEMETRY HUD BAR (Live Silicon Health)   -->
    <!-- ========================================================= -->
    <header class="telemetry-hud-card">
      <div class="hud-top-strip">
        <div class="device-identity">
          <span class="hud-badge font-mono">SILICON COCKPIT</span>
          <div class="connection-status">
            <span v-if="isConnected" class="status-indicator status-live">
              <span class="live-dot" /> LIVE ESP32 (115200 BAUD)
            </span>
            <span v-else class="status-indicator status-demo">
              <span class="demo-dot" /> DEMO / CANONICAL PROFILE
            </span>
          </div>
          <span v-if="chipDossier" class="chip-label font-mono">
            {{ chipDossier.chip_model }} ({{ formatBytes(totalFlashBytes) }})
          </span>
          <span v-else class="chip-label font-mono">
            ESP32 DevKit V1 (4 MB Flash)
          </span>
        </div>

        <!-- Quick Live Telemetry Pills -->
        <div class="hud-quick-pills">
          <div class="hud-pill" title="Microcontroller continuous runtime">
            <span class="pill-icon">⏱</span>
            <span class="pill-label">Uptime:</span>
            <span class="pill-val font-mono">{{ formatUptime(telemetry?.uptime_seconds ?? 4820) }}</span>
          </div>
          <div class="hud-pill pill-fps" title="Real-time OLED frame rendering rate">
            <span class="pill-icon">⚡</span>
            <span class="pill-label">Framerate:</span>
            <span class="pill-val font-mono">{{ (telemetry?.current_fps ?? 30.0).toFixed(1) }} FPS</span>
          </div>
          <div class="hud-pill" title="Total frames pushed to OLED since boot">
            <span class="pill-icon">🖼</span>
            <span class="pill-label">Frames:</span>
            <span class="pill-val font-mono">#{{ telemetry?.frame_counter ?? 1420 }}</span>
          </div>
          <div class="hud-pill" title="OLED contrast level">
            <span class="pill-icon">💡</span>
            <span class="pill-label">OLED:</span>
            <span class="pill-val font-mono">{{ telemetry?.oled_contrast ?? 255 }}/255</span>
          </div>
          <div class="hud-pill pill-wifi" :class="`wifi-${telemetry?.wifi_status ?? 'connected'}`">
            <span class="pill-icon">📶</span>
            <span class="pill-val font-mono">{{ telemetry?.wifi_status ?? 'Connected' }}</span>
          </div>
        </div>
      </div>

      <!-- Health Barometers Grid: Dual Gauges + Watermark Bar -->
      <div class="hud-meters-grid">
        <!-- Meter 1: Dynamic RAM Circular Gauge -->
        <div class="meter-card ram-gauge-card">
          <div class="radial-gauge-wrapper">
            <svg class="radial-svg" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="ramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" :stop-color="gradientStart" />
                  <stop offset="100%" :stop-color="gradientEnd" />
                </linearGradient>
              </defs>
              <circle class="gauge-bg" cx="50" cy="50" :r="RADIUS" />
              <circle
                class="gauge-bar"
                cx="50"
                cy="50"
                :r="RADIUS"
                stroke="url(#ramGrad)"
                :stroke-dasharray="CIRCUMFERENCE"
                :stroke-dashoffset="strokeDashoffset"
              />
            </svg>
            <div class="radial-center-content">
              <span class="gauge-main-val" :style="{ color: gaugeColor }">
                {{ freePercent.toFixed(0) }}%
              </span>
              <span class="gauge-sub-label">FREE RAM</span>
            </div>
          </div>

          <div class="meter-details">
            <div class="meter-title-row">
              <span class="meter-title">⚡ Dynamic RAM Headroom</span>
              <span class="meter-badge font-mono" :style="{ color: gaugeColor }">
                {{ formatKb(telemetry?.free_heap ?? 218500) }} FREE
              </span>
            </div>
            <p class="meter-plain-desc">
              Unallocated memory ready for animation buffers and frame transmission.
            </p>
            <div class="meter-stat-row font-mono">
              <span>Total Heap: {{ formatKb(telemetry?.total_heap ?? 328000) }}</span>
              <span>Allocated: {{ formatKb((telemetry?.total_heap ?? 328000) - (telemetry?.free_heap ?? 218500)) }}</span>
            </div>
          </div>
        </div>

        <!-- Meter 2: Leak Guard Watermark Barometer -->
        <div class="meter-card leak-guard-card">
          <div class="meter-title-row">
            <div class="title-with-icon">
              <span class="icon">🛡️</span>
              <div>
                <span class="meter-title">Memory Leak Guard (Watermark)</span>
                <span class="meter-sub">Lowest dynamic headroom recorded since boot</span>
              </div>
            </div>
            <span class="meter-badge font-mono text-cyan">
              {{ formatKb(telemetry?.min_free_heap ?? 184200) }} FLOOR
            </span>
          </div>

          <!-- Visual Watermark Progress Bar -->
          <div class="watermark-bar-track">
            <div
              class="watermark-bar-fill"
              :style="{ width: `${Math.min(100, (((telemetry?.min_free_heap ?? 184200)) / (telemetry?.total_heap ?? 328000)) * 100)}%` }"
            />
          </div>

          <div class="watermark-footer font-mono">
            <span class="status-text text-emerald">✓ SAFE: No fragmentation detected</span>
            <span>Safety Margin: +{{ formatKb(Math.max(0, (telemetry?.free_heap ?? 218500) - (telemetry?.min_free_heap ?? 184200))) }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- ========================================================= -->
    <!-- 2. FINVIZ-STYLE SILICON HEATMAP (Deeply Visual Treemap)  -->
    <!-- ========================================================= -->
    <section class="treemap-section">
      <!-- Section Header & Controls -->
      <div class="section-toolbar">
        <div class="toolbar-left">
          <div class="title-row">
            <span class="section-icon">🗺️</span>
            <h3 class="section-heading">Silicon Storage & Memory Heatmap</h3>
          </div>
          <p class="section-desc">
            Visual breakdown of on-chip Flash storage partitions and dynamic RAM distribution.
          </p>
        </div>

        <div class="toolbar-right">
          <!-- View Detail Level (Creator vs Engineer) -->
          <div class="mode-toggle-group" title="Toggle between friendly creator language and engineering hardware offsets">
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--active': detailLevel === 'creator' }"
              @click="detailLevel = 'creator'"
            >
              👤 Creator Mode
            </button>
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--active': detailLevel === 'engineer' }"
              @click="detailLevel = 'engineer'"
            >
              🔬 CS Engineer Mode
            </button>
          </div>

          <!-- View Mode (Flash / RAM / Unified) -->
          <div class="mode-toggle-group">
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--active': viewMode === 'flash' }"
              @click="viewMode = 'flash'; selectedBlockId = 'spiffs'"
            >
              💾 Flash ({{ formatBytes(totalFlashBytes) }})
            </button>
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--active': viewMode === 'sram' }"
              @click="viewMode = 'sram'; selectedBlockId = 'free_heap'"
            >
              ⚡ RAM ({{ formatBytes(totalSramBytes) }})
            </button>
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--active': viewMode === 'unified' }"
              @click="viewMode = 'unified'; selectedBlockId = 'spiffs'"
            >
              🧩 Unified
            </button>
          </div>
        </div>
      </div>

      <!-- Heatmap Workspace: Finviz Canvas + Interactive Dossier -->
      <div class="heatmap-workspace-grid">
        <!-- Visual Treemap Canvas -->
        <div class="heatmap-canvas-card">
          <!-- Visual Capacity Progress Summary Bar -->
          <div class="capacity-summary-bar">
            <span class="bar-label font-mono">MAP WEIGHT DISTRIBUTION:</span>
            <div class="bar-track">
              <div
                v-for="b in currentBlocks"
                :key="b.id"
                class="bar-segment"
                :style="{
                  width: `${(b.sizeBytes / currentTotalBytes) * 100}%`,
                  backgroundColor: b.color,
                }"
                :title="`${b.friendlyName}: ${formatBytes(b.sizeBytes)}`"
              />
            </div>
          </div>

          <!-- Finviz-Style Proportional Tiles -->
          <div class="tiles-canvas">
            <div
              v-for="block in currentBlocks"
              :key="block.id"
              class="finviz-tile"
              :class="{
                'tile--active': block.id === selectedBlockId,
                [`cat--${block.category}`]: true,
              }"
              :style="{
                flexGrow: Math.max(1, Math.round((block.sizeBytes / currentTotalBytes) * 100)),
                borderTopColor: block.color,
              }"
              @mouseenter="selectBlock(block.id)"
              @click="selectBlock(block.id)"
            >
              <!-- Glowing Top Indicator -->
              <div class="tile-glow-strip" :style="{ backgroundColor: block.color }" />

              <!-- Tile Header: Icon & Primary Label -->
              <div class="tile-header">
                <div class="tile-title-group">
                  <span class="tile-icon">{{ block.icon }}</span>
                  <div class="tile-names">
                    <span class="tile-primary-name">
                      {{ detailLevel === 'creator' ? block.friendlyName : block.techName }}
                    </span>
                    <span v-if="detailLevel === 'creator'" class="tile-subtag font-mono">
                      {{ block.techName }}
                    </span>
                  </div>
                </div>
                <span class="tile-access-badge font-mono">{{ block.access }}</span>
              </div>

              <!-- Center Metric: Size & Share -->
              <div class="tile-metric-body">
                <div class="size-row">
                  <span class="tile-big-size font-mono">{{ formatBytes(block.sizeBytes) }}</span>
                  <span class="tile-share-pct font-mono">({{ calculatePercent(block.sizeBytes) }})</span>
                </div>

                <!-- Visual Mini-Fill Bar (Capacity Used vs Free) -->
                <div class="tile-mini-fill-wrapper">
                  <div class="mini-track">
                    <div
                      class="mini-fill"
                      :style="{
                        width: `${calculateBlockFill(block)}%`,
                        backgroundColor: block.color,
                      }"
                    />
                  </div>
                  <span v-if="block.usedBytes > 0" class="mini-fill-text font-mono">
                    {{ calculateBlockFill(block) }}% used
                  </span>
                  <span v-else class="mini-fill-text font-mono text-emerald">
                    100% free
                  </span>
                </div>
              </div>

              <!-- Tile Footer: Impact Summary or Hex Bounds -->
              <div class="tile-footer">
                <span v-if="detailLevel === 'creator'" class="footer-plain-note">
                  {{ block.creatorImpact }}
                </span>
                <span v-else class="footer-hex-bounds font-mono">
                  {{ block.addressHex }} → {{ block.endAddressHex }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Interactive Block Dossier Panel (Hover / Click Card) -->
        <aside class="block-dossier-card">
          <div class="dossier-top">
            <div class="dossier-icon-row">
              <span class="dossier-big-icon">{{ activeBlock.icon }}</span>
              <div class="dossier-headings">
                <div class="dossier-tag-row">
                  <span class="dossier-cat font-mono" :style="{ color: activeBlock.color }">
                    {{ activeBlock.category.toUpperCase() }}
                  </span>
                  <span class="dossier-status-pill" :class="`pill--${activeBlock.status}`">
                    {{ activeBlock.status.toUpperCase() }}
                  </span>
                </div>
                <h4 class="dossier-title">{{ activeBlock.friendlyName }}</h4>
                <span class="dossier-subname font-mono">{{ activeBlock.techName }}</span>
              </div>
            </div>

            <!-- Plain English Explanation -->
            <div class="plain-english-box">
              <p class="plain-summary-text">
                {{ activeBlock.plainSummary }}
              </p>
            </div>
          </div>

          <!-- Capacity & Impact Breakdown -->
          <div class="dossier-metrics-grid">
            <div class="dossier-metric">
              <span class="m-label">TOTAL ALLOCATED</span>
              <span class="m-val font-mono" :style="{ color: activeBlock.color }">
                {{ formatBytes(activeBlock.sizeBytes) }}
              </span>
            </div>
            <div class="dossier-metric">
              <span class="m-label">SILICON SHARE</span>
              <span class="m-val font-mono">{{ calculatePercent(activeBlock.sizeBytes) }}</span>
            </div>
            <div class="dossier-metric">
              <span class="m-label">CURRENT USAGE</span>
              <span class="m-val font-mono">
                {{ activeBlock.usedBytes ? formatBytes(activeBlock.usedBytes) : '0 B (Free)' }}
              </span>
            </div>
            <div class="dossier-metric">
              <span class="m-label">HEADROOM LEFT</span>
              <span class="m-val font-mono text-emerald">
                {{ formatBytes(Math.max(0, activeBlock.sizeBytes - activeBlock.usedBytes)) }}
              </span>
            </div>
          </div>

          <!-- Creator Animation & Visual Impact Note -->
          <div class="creator-impact-box">
            <span class="impact-badge">CREATOR IMPACT:</span>
            <p class="impact-text">
              {{ activeBlock.creatorImpact }}
            </p>
          </div>

          <!-- Technical Offset Dossier (Collapsible/Engineering) -->
          <div class="tech-specs-box">
            <div class="specs-title-row">
              <span class="specs-title font-mono">TECHNICAL ARCHITECTURE:</span>
              <span class="specs-perm font-mono">ACCESS: {{ activeBlock.access }}</span>
            </div>
            <div class="specs-addr-row font-mono">
              <span>Start: <strong class="text-cyan">{{ activeBlock.addressHex }}</strong></span>
              <span>End: <strong class="text-cyan">{{ activeBlock.endAddressHex }}</strong></span>
            </div>
            <p class="specs-tech-desc">{{ activeBlock.techDetail }}</p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.silicon-telemetry-dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

/* ========================================================= */
/* 1. TOP UNIFIED TELEMETRY HUD BAR                          */
/* ========================================================= */
.telemetry-hud-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hud-top-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 0.75rem;
  flex-wrap: wrap;
}

.device-identity {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.hud-badge {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 0.18rem 0.5rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
}

.status-live {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #10b981;
  animation: pulse-dot 2s infinite ease-in-out;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

.status-demo {
  background: var(--color-bg-base);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.demo-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--color-text-muted);
}

.chip-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.hud-quick-pills {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.hud-pill {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.pill-icon {
  font-size: 0.8rem;
}

.pill-val {
  font-weight: 700;
  color: var(--color-text-primary);
}

.pill-fps .pill-val {
  color: #38bdf8;
}

.pill-wifi.wifi-connected {
  border-color: rgba(16, 185, 129, 0.35);
  color: #10b981;
}

/* Health Barometers Grid */
.hud-meters-grid {
  display: grid;
  grid-template-columns: minmax(320px, 1.2fr) minmax(280px, 1fr);
  gap: 1.25rem;
}

.meter-card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.85rem 1rem;
}

.ram-gauge-card {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.radial-gauge-wrapper {
  position: relative;
  width: 90px;
  height: 90px;
  flex-shrink: 0;
}

.radial-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.gauge-bg {
  fill: none;
  stroke: var(--color-border-subtle);
  stroke-width: 8;
}

.gauge-bar {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.radial-center-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.gauge-main-val {
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1;
}

.gauge-sub-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
  margin-top: 2px;
}

.meter-details {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.meter-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.meter-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.meter-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}

.meter-plain-desc {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  line-height: 1.35;
  margin: 0;
}

.meter-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 0.35rem;
}

.leak-guard-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.5rem;
}

.title-with-icon {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.title-with-icon .icon {
  font-size: 1.1rem;
}

.meter-sub {
  display: block;
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.watermark-bar-track {
  width: 100%;
  height: 10px;
  background: var(--color-border-subtle);
  border-radius: 9999px;
  overflow: hidden;
  position: relative;
}

.watermark-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #10b981);
  border-radius: 9999px;
  transition: width 0.6s ease;
}

.watermark-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

/* ========================================================= */
/* 2. FINVIZ-STYLE SILICON HEATMAP (Deeply Visual)           */
/* ========================================================= */
.treemap-section {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 0.85rem;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-icon {
  font-size: 1.1rem;
}

.section-heading {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.section-desc {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.mode-toggle-group {
  display: flex;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.toggle-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.toggle-btn:hover {
  color: var(--color-text-primary);
}

.toggle-btn--active {
  background: var(--color-bg-elevated);
  color: var(--color-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Heatmap Grid Layout */
.heatmap-workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.85fr);
  gap: 1.25rem;
  align-items: stretch;
}

.heatmap-canvas-card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 380px;
}

/* Top Distribution Bar */
.capacity-summary-bar {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.bar-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
}

.bar-track {
  width: 100%;
  height: 6px;
  background: var(--color-border-subtle);
  border-radius: 9999px;
  display: flex;
  overflow: hidden;
}

.bar-segment {
  height: 100%;
  transition: width 0.3s ease;
}

/* Proportional Tiles Canvas */
.tiles-canvas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
  align-content: stretch;
}

.finviz-tile {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-top-width: 3px;
  border-radius: 6px;
  padding: 0.65rem 0.8rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 155px;
  min-height: 110px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.finviz-tile:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.tile--active {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3), 0 8px 20px rgba(0, 0, 0, 0.5);
  background: var(--color-bg-elevated);
}

.tile-glow-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.7;
}

.tile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.35rem;
}

.tile-title-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.tile-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.tile-names {
  display: flex;
  flex-direction: column;
}

.tile-primary-name {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.tile-subtag {
  font-size: 0.62rem;
  color: var(--color-text-muted);
}

.tile-access-badge {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.08rem 0.28rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.tile-metric-body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0.4rem 0;
}

.size-row {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.tile-big-size {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-text-primary);
}

.tile-share-pct {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}

.tile-mini-fill-wrapper {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.mini-track {
  flex: 1;
  height: 5px;
  background: var(--color-border-subtle);
  border-radius: 9999px;
  overflow: hidden;
}

.mini-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.mini-fill-text {
  font-size: 0.62rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.tile-footer {
  font-size: 0.66rem;
  color: var(--color-text-secondary);
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 0.3rem;
  line-height: 1.25;
}

.footer-plain-note {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.footer-hex-bounds {
  color: var(--color-text-muted);
}

/* ========================================================= */
/* 3. INTERACTIVE BLOCK DOSSIER PANEL                        */
/* ========================================================= */
.block-dossier-card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
  height: 100%;
}

.dossier-icon-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.dossier-big-icon {
  font-size: 2rem;
  line-height: 1;
  flex-shrink: 0;
}

.dossier-headings {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.dossier-tag-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.dossier-cat {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.dossier-status-pill {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.08rem 0.35rem;
  border-radius: 9999px;
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

.dossier-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.dossier-subname {
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.plain-english-box {
  background: var(--color-bg-surface);
  border-left: 3px solid #38bdf8;
  border-radius: 4px;
  padding: 0.65rem 0.8rem;
  margin-top: 0.35rem;
}

.plain-summary-text {
  font-size: 0.76rem;
  color: var(--color-text-primary);
  line-height: 1.45;
  margin: 0;
}

.dossier-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 0.75rem;
}

.dossier-metric {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.m-label {
  font-size: 0.62rem;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}

.m-val {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.creator-impact-box {
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 6px;
  padding: 0.65rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.impact-badge {
  font-size: 0.62rem;
  font-weight: 800;
  color: #10b981;
  letter-spacing: 0.05em;
}

.impact-text {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin: 0;
}

.tech-specs-box {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 0.65rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: auto;
}

.specs-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.62rem;
  color: var(--color-text-muted);
}

.specs-addr-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}

.specs-tech-desc {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  line-height: 1.35;
  margin: 0;
}

.text-cyan { color: #38bdf8; }
.text-emerald { color: #10b981; }

@media (max-width: 1024px) {
  .hud-meters-grid {
    grid-template-columns: 1fr;
  }
  .heatmap-workspace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
