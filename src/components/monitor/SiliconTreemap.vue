<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeviceStore } from '../../stores/device'

const deviceStore = useDeviceStore()

export type TreemapViewMode = 'flash' | 'sram' | 'unified'
const viewMode = ref<TreemapViewMode>('flash')

const isConnected = computed(() => deviceStore.status === 'connected')
const telemetry = computed(() => deviceStore.telemetry)
const chipDossier = computed(() => deviceStore.chipDossier)

// Active block inspected by user (hover or click)
const selectedBlockId = ref<string>('app0')

interface TreemapBlock {
  id: string
  name: string
  shortLabel: string
  category: 'system' | 'firmware' | 'storage' | 'heap' | 'free' | 'dma'
  addressHex: string
  endAddressHex: string
  sizeBytes: number
  usedBytes?: number
  access: 'R-X' | 'RW-' | 'R--'
  status: 'optimal' | 'active' | 'warning' | 'headroom' | 'system'
  color: string
  description: string
  techDetail: string
}

// Total Flash detection (defaults to 4MB if disconnected or not reported)
const totalFlashBytes = computed(() => {
  return chipDossier.value?.flash_size_bytes || 4 * 1024 * 1024
})

// Total SRAM capacity (~520 KB on ESP32)
const totalSramBytes = 520 * 1024

// Flash Partitions model (Standard ESP32 Partition Table for PixelForge)
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
      id: 'app0',
      name: 'app0 (Factory Firmware)',
      shortLabel: 'APP0',
      category: 'firmware',
      addressHex: '0x010000',
      endAddressHex: '0x14FFFF',
      sizeBytes: app0Size,
      usedBytes: 440320, // ~430 KB application code
      access: 'R-X',
      status: 'active',
      color: '#0284c7', // Electric Blue
      description: 'Active PixelForge runtime binary, FreeRTOS kernel & display drivers.',
      techDetail: 'Directly mapped via flash MMU cache into CPU instruction bus.',
    },
    {
      id: 'spiffs',
      name: 'spiffs (Offline Reels & Bitmaps)',
      shortLabel: 'SPIFFS',
      category: 'storage',
      addressHex: '0x150000',
      endAddressHex: '0x2CFFFF',
      sizeBytes: spiffsSize,
      usedBytes: 184320, // ~180 KB used for starter animations
      access: 'RW-',
      status: 'optimal',
      color: '#10b981', // Emerald Green
      description: 'Dedicated LittleFS/SPIFFS partition for autonomous 1-bit animation reel playback.',
      techDetail: 'Capacity for up to 1,536 sequential 1024-byte 128×64 bitmap frames.',
    },
    {
      id: 'unallocated',
      name: 'Unallocated Flash Headroom',
      shortLabel: 'FREE FLASH',
      category: 'free',
      addressHex: '0x2D0000',
      endAddressHex: `0x${(total - 1).toString(16).toUpperCase()}`,
      sizeBytes: unallocatedSize,
      usedBytes: 0,
      access: 'RW-',
      status: 'headroom',
      color: '#059669', // Dark Emerald
      description: 'Unpartitioned flash memory available for OTA updates or expanded reel storage.',
      techDetail: 'Available for raw binary flashing via PixelForge Firmware Flasher.',
    },
    {
      id: 'bootloader',
      name: '2nd-Stage Bootloader',
      shortLabel: 'BOOT',
      category: 'system',
      addressHex: '0x001000',
      endAddressHex: '0x007FFF',
      sizeBytes: bootloaderSize,
      usedBytes: bootloaderSize,
      access: 'R-X',
      status: 'system',
      color: '#6366f1', // Indigo
      description: 'ROM bootloader entry point with DTR/RTS auto-reset trigger support.',
      techDetail: 'Loads partition table and initializes SPI flash bus @ 40MHz/80MHz.',
    },
    {
      id: 'nvs',
      name: 'NVS (Settings & Key-Value)',
      shortLabel: 'NVS',
      category: 'storage',
      addressHex: '0x009000',
      endAddressHex: '0x00DFFF',
      sizeBytes: nvsSize,
      usedBytes: 12288,
      access: 'RW-',
      status: 'active',
      color: '#f59e0b', // Amber
      description: 'Non-volatile key-value storage for Wi-Fi credentials and OLED bus mappings.',
      techDetail: 'Wear-leveled flash sectors preserving configurations across reboots.',
    },
    {
      id: 'otadata',
      name: 'otadata (OTA State)',
      shortLabel: 'OTA',
      category: 'system',
      addressHex: '0x00E000',
      endAddressHex: '0x00FFFF',
      sizeBytes: otaDataSize,
      usedBytes: 4096,
      access: 'RW-',
      status: 'system',
      color: '#8b5cf6', // Violet
      description: 'Active OTA partition flags and boot counter records.',
      techDetail: 'CRC-verified dual slots preventing bricking on interrupted flashes.',
    },
    {
      id: 'partition_table',
      name: 'Partition Table',
      shortLabel: 'TBL',
      category: 'system',
      addressHex: '0x008000',
      endAddressHex: '0x008FFF',
      sizeBytes: partitionTableSize,
      usedBytes: partitionTableSize,
      access: 'R--',
      status: 'system',
      color: '#475569', // Slate
      description: 'Binary partition map table parsed by ESP32 bootloader on reset.',
      techDetail: 'Standard binary format defining type, subtype, offset, and size.',
    },
  ]
})

// Internal SRAM Model (~520 KB)
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
      name: 'Free Dynamic Heap',
      shortLabel: 'FREE HEAP',
      category: 'free',
      addressHex: '0x3FFE0000',
      endAddressHex: '0x3FFF8000',
      sizeBytes: currentFree,
      access: 'RW-',
      status: currentFree > 100000 ? 'headroom' : currentFree > 40000 ? 'warning' : 'optimal',
      color: currentFree > 100000 ? '#10b981' : currentFree > 40000 ? '#f59e0b' : '#ef4444',
      description: 'Available unallocated dynamic RAM for frame queues and protocol packets.',
      techDetail: 'Real-time telemetry metric updated dynamically via packet 0x85.',
    },
    {
      id: 'in_use_heap',
      name: 'In-Use Heap & Active Buffers',
      shortLabel: 'ALLOC HEAP',
      category: 'heap',
      addressHex: '0x3FFC0000',
      endAddressHex: '0x3FFDFFFF',
      sizeBytes: inUseHeap,
      access: 'RW-',
      status: 'active',
      color: '#f59e0b', // Amber
      description: 'Dynamically allocated memory for tasks, packet buffers, and parser states.',
      techDetail: 'Managed by FreeRTOS heap_4 multi-heap allocator.',
    },
    {
      id: 'watermark_margin',
      name: 'Watermark Safety Margin',
      shortLabel: 'WATERMARK',
      category: 'heap',
      addressHex: '0x3FFB8000',
      endAddressHex: '0x3FFBFFFF',
      sizeBytes: Math.max(8192, watermarkMargin),
      access: 'RW-',
      status: 'optimal',
      color: '#06b6d4', // Cyan
      description: 'Peak memory headroom consumed during heavy continuous frame streaming.',
      techDetail: 'Diff between current free heap and lowest recorded watermark since boot.',
    },
    {
      id: 'iram',
      name: 'IRAM (Instruction RAM)',
      shortLabel: 'IRAM',
      category: 'system',
      addressHex: '0x40080000',
      endAddressHex: '0x4009FFFF',
      sizeBytes: iramSize,
      access: 'R-X',
      status: 'system',
      color: '#6366f1', // Indigo
      description: 'Zero-wait-state high-speed memory for interrupt service routines and I2C driver.',
      techDetail: 'Executes without cache misses even while flash write operations occur.',
    },
    {
      id: 'static_bss',
      name: 'Static BSS & FreeRTOS Stack',
      shortLabel: 'STATIC / BSS',
      category: 'system',
      addressHex: '0x3FFA0000',
      endAddressHex: '0x3FFB7FFF',
      sizeBytes: staticBssData,
      access: 'RW-',
      status: 'system',
      color: '#475569', // Slate
      description: 'Global variables, kernel task control blocks (TCBs), and interrupt stacks.',
      techDetail: 'Statically mapped at firmware compilation time.',
    },
    {
      id: 'dma_buffer',
      name: 'DMA Display Framebuffer',
      shortLabel: 'OLED DMA (1KB)',
      category: 'dma',
      addressHex: '0x3FF9F000',
      endAddressHex: '0x3FF9F3FF',
      sizeBytes: dmaBufferSize,
      access: 'RW-',
      status: 'active',
      color: '#ec4899', // Pink
      description: '32-bit aligned 1024-byte canonical framebuffer mirrored directly to physical OLED.',
      techDetail: '128×64 1-bit monochrome bitmap row-major MSB-first packing.',
    },
  ]
})

// Active blocks based on view mode
const currentBlocks = computed<TreemapBlock[]>(() => {
  if (viewMode.value === 'flash') return flashBlocks.value
  if (viewMode.value === 'sram') return sramBlocks.value
  return [...flashBlocks.value, ...sramBlocks.value]
})

// Current inspected block
const activeBlock = computed<TreemapBlock>(() => {
  const found = currentBlocks.value.find((b) => b.id === selectedBlockId.value)
  return found || currentBlocks.value[0]
})

// Total capacity for active view
const currentTotalBytes = computed<number>(() => {
  if (viewMode.value === 'flash') return totalFlashBytes.value
  if (viewMode.value === 'sram') return totalSramBytes
  return totalFlashBytes.value + totalSramBytes
})

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

function calculatePercent(bytes: number): string {
  const pct = (bytes / currentTotalBytes.value) * 100
  return pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`
}

function selectBlock(id: string) {
  selectedBlockId.value = id
}
</script>

<template>
  <div class="silicon-treemap-card">
    <!-- PCB Header with Silicon Title & Mode Selector -->
    <div class="treemap-header">
      <div class="header-left">
        <div class="header-tag-row">
          <span class="chip-badge font-mono">FINVIZ-STYLE SILICON HEATMAP</span>
          <span v-if="isConnected" class="live-pill">● LIVE TELEMETRY</span>
          <span v-else class="sim-pill">○ CANONICAL ESP32 MODEL</span>
        </div>
        <h3 class="treemap-title">Silicon Storage & Memory Treemap</h3>
        <p class="treemap-subtitle">
          Market-weight visualizer for ESP32 Flash partition distribution and dynamic SRAM headroom.
        </p>
      </div>

      <!-- Mode Switcher Tabs -->
      <div class="treemap-tabs">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': viewMode === 'flash' }"
          @click="viewMode = 'flash'; selectedBlockId = 'app0'"
        >
          💾 Flash Storage ({{ formatBytes(totalFlashBytes) }})
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': viewMode === 'sram' }"
          @click="viewMode = 'sram'; selectedBlockId = 'free_heap'"
        >
          ⚡ Internal SRAM ({{ formatBytes(totalSramBytes) }})
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': viewMode === 'unified' }"
          @click="viewMode = 'unified'; selectedBlockId = 'app0'"
        >
          🧩 Unified Silicon
        </button>
      </div>
    </div>

    <!-- Main Treemap Visualization Grid -->
    <div class="treemap-body">
      <!-- Finviz-Style Proportional Heatmap Canvas -->
      <div class="treemap-canvas-container">
        <div class="treemap-grid" :class="`grid--${viewMode}`">
          <div
            v-for="block in currentBlocks"
            :key="block.id"
            class="treemap-tile"
            :class="{
              'tile--selected': block.id === selectedBlockId,
              [`cat--${block.category}`]: true,
            }"
            :style="{
              flexGrow: Math.max(1, Math.round((block.sizeBytes / currentTotalBytes) * 100)),
              borderTopColor: block.color,
            }"
            @mouseenter="selectBlock(block.id)"
            @click="selectBlock(block.id)"
          >
            <!-- Background Glow Bar -->
            <div class="tile-glow" :style="{ backgroundColor: block.color }" />

            <div class="tile-header">
              <span class="tile-label font-mono">{{ block.shortLabel }}</span>
              <span class="tile-access font-mono">{{ block.access }}</span>
            </div>

            <div class="tile-center">
              <span class="tile-size font-mono">{{ formatBytes(block.sizeBytes) }}</span>
              <span class="tile-pct font-mono">{{ calculatePercent(block.sizeBytes) }}</span>
            </div>

            <div class="tile-footer font-mono">
              <span class="tile-addr">{{ block.addressHex }}</span>
              <span class="tile-status-dot" :style="{ backgroundColor: block.color }" />
            </div>
          </div>
        </div>
      </div>

      <!-- Live Inspector Dossier Panel (Hover / Click Inspector) -->
      <aside class="block-inspector-panel">
        <div class="inspector-card">
          <div class="inspector-top">
            <div class="inspector-badge-row">
              <span class="inspector-category font-mono" :style="{ color: activeBlock.color }">
                {{ activeBlock.category.toUpperCase() }}
              </span>
              <span class="inspector-status-tag" :class="`tag--${activeBlock.status}`">
                {{ activeBlock.status.toUpperCase() }}
              </span>
            </div>
            <h4 class="inspector-name">{{ activeBlock.name }}</h4>
            <p class="inspector-desc">{{ activeBlock.description }}</p>
          </div>

          <div class="inspector-metrics-grid">
            <div class="metric-item">
              <span class="metric-label">Allocated Size</span>
              <span class="metric-value font-mono" :style="{ color: activeBlock.color }">
                {{ formatBytes(activeBlock.sizeBytes) }}
              </span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Share of Memory</span>
              <span class="metric-value font-mono">
                {{ calculatePercent(activeBlock.sizeBytes) }}
              </span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Base Address</span>
              <span class="metric-value font-mono text-cyan">
                {{ activeBlock.addressHex }}
              </span>
            </div>
            <div class="metric-item">
              <span class="metric-label">End Address</span>
              <span class="metric-value font-mono text-cyan">
                {{ activeBlock.endAddressHex }}
              </span>
            </div>
          </div>

          <!-- Technical Architecture Annotation -->
          <div class="tech-annotation">
            <span class="annotation-icon">💡</span>
            <span class="annotation-text">{{ activeBlock.techDetail }}</span>
          </div>

          <!-- Quick Legend Bar -->
          <div class="treemap-legend">
            <span class="legend-title font-mono">HEATMAP SEMANTICS:</span>
            <div class="legend-items">
              <span class="legend-item"><span class="dot bg-emerald" /> Headroom / Free</span>
              <span class="legend-item"><span class="dot bg-blue" /> Firmware / Binary</span>
              <span class="legend-item"><span class="dot bg-amber" /> Storage / Active</span>
              <span class="legend-item"><span class="dot bg-purple" /> System & Boot</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.silicon-treemap-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.treemap-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 0.85rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.header-tag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chip-badge {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.live-pill {
  font-size: 0.65rem;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 0.12rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.sim-pill {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-bg-base);
  padding: 0.12rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
}

.treemap-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.treemap-subtitle {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Tabs */
.treemap-tabs {
  display: flex;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.tab-btn {
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

.tab-btn:hover {
  color: var(--color-text-primary);
}

.tab-btn--active {
  background: var(--color-bg-elevated);
  color: var(--color-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Layout */
.treemap-body {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
  gap: 1.25rem;
  align-items: stretch;
}

/* Proportional Heatmap Canvas */
.treemap-canvas-container {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.65rem;
  min-height: 280px;
  display: flex;
  flex-direction: column;
}

.treemap-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  height: 100%;
  width: 100%;
  align-content: stretch;
}

.treemap-tile {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-top-width: 3px;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 130px;
  min-height: 95px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.treemap-tile:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4);
}

.tile--selected {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3), 0 8px 18px rgba(0, 0, 0, 0.5);
  background: var(--color-bg-elevated);
}

.tile-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.65;
}

.tile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tile-label {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: 0.04em;
}

.tile-access {
  font-size: 0.62rem;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.08rem 0.3rem;
  border-radius: 3px;
}

.tile-center {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin: 0.35rem 0;
}

.tile-size {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.tile-pct {
  font-size: 0.68rem;
  color: var(--color-text-secondary);
}

.tile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.62rem;
  color: var(--color-text-muted);
}

.tile-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
}

/* Inspector Panel */
.block-inspector-panel {
  display: flex;
  flex-direction: column;
}

.inspector-card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  height: 100%;
}

.inspector-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}

.inspector-category {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.inspector-status-tag {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  text-transform: uppercase;
}

.tag--optimal, .tag--headroom {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.tag--active {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.tag--system {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.tag--warning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.inspector-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.25rem 0;
}

.inspector-desc {
  font-size: 0.76rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin: 0;
}

.inspector-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 0.65rem;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.metric-label {
  font-size: 0.64rem;
  color: var(--color-text-muted);
}

.metric-value {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.text-cyan {
  color: #38bdf8;
}

.tech-annotation {
  display: flex;
  gap: 0.5rem;
  background: rgba(56, 189, 248, 0.05);
  border: 1px dashed rgba(56, 189, 248, 0.25);
  border-radius: 6px;
  padding: 0.6rem;
}

.annotation-icon {
  font-size: 0.85rem;
  flex-shrink: 0;
}

.annotation-text {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  line-height: 1.35;
}

.treemap-legend {
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 0.65rem;
  margin-top: auto;
}

.legend-title {
  font-size: 0.62rem;
  color: var(--color-text-muted);
  display: block;
  margin-bottom: 0.35rem;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.legend-item {
  font-size: 0.66rem;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  display: inline-block;
}

.bg-emerald { background-color: #10b981; }
.bg-blue { background-color: #0284c7; }
.bg-amber { background-color: #f59e0b; }
.bg-purple { background-color: #8b5cf6; }

@media (max-width: 1024px) {
  .treemap-body {
    grid-template-columns: 1fr;
  }
}
</style>
