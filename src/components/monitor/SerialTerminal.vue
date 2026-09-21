<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useMonitorStore } from '../../stores/monitor'
import { useDeviceStore } from '../../stores/device'

const monitorStore = useMonitorStore()
const deviceStore = useDeviceStore()

const terminalRef = ref<HTMLDivElement | null>(null)
const inputText = ref<string>('')

// Auto-scroll watcher
watch(
  () => monitorStore.logs.length,
  async () => {
    if (monitorStore.autoScroll && terminalRef.value) {
      await nextTick()
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    }
  }
)

function handleSend() {
  if (!inputText.value.trim()) return
  monitorStore.sendCommand(inputText.value)
  inputText.value = ''
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleSend()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (monitorStore.commandHistory.length > 0) {
      if (monitorStore.historyIndex < monitorStore.commandHistory.length - 1) {
        monitorStore.historyIndex++
      }
      const idx = monitorStore.commandHistory.length - 1 - monitorStore.historyIndex
      inputText.value = monitorStore.commandHistory[idx] || ''
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (monitorStore.historyIndex > 0) {
      monitorStore.historyIndex--
      const idx = monitorStore.commandHistory.length - 1 - monitorStore.historyIndex
      inputText.value = monitorStore.commandHistory[idx] || ''
    } else {
      monitorStore.historyIndex = -1
      inputText.value = ''
    }
  }
}

async function copyAllLogs() {
  const text = monitorStore.logs.map((l) => `${l.timestamp} [${l.type.toUpperCase()}] ${l.text}`).join('\n')
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    console.warn('Copy failed:', e)
  }
}
</script>

<template>
  <div class="serial-terminal-container">
    <!-- Terminal Header Bar -->
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <span class="terminal-title">📟 Serial Monitor</span>
        <div class="type-filter-group">
          <button
            v-for="t in ['ALL', 'LOG', 'BOOT', 'PACKET'] as const"
            :key="t"
            class="filter-tab"
            :class="{ 'filter-tab--active': monitorStore.filterType === t }"
            @click="monitorStore.filterType = t"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <!-- Search filter -->
        <input
          v-model="monitorStore.filterQuery"
          type="text"
          class="search-input"
          placeholder="Filter logs..."
        />

        <!-- Timestamp toggle -->
        <button
          class="btn-icon-tool"
          :class="{ 'btn-icon-tool--active': monitorStore.showTimestamps }"
          title="Toggle Timestamps"
          @click="monitorStore.showTimestamps = !monitorStore.showTimestamps"
        >
          🕒
        </button>

        <!-- Auto-scroll toggle -->
        <button
          class="btn-icon-tool"
          :class="{ 'btn-icon-tool--active': monitorStore.autoScroll }"
          title="Auto-scroll Lock"
          @click="monitorStore.autoScroll = !monitorStore.autoScroll"
        >
          ⬇️
        </button>

        <!-- Copy logs -->
        <button
          class="btn-icon-tool"
          title="Copy All Logs"
          @click="copyAllLogs"
        >
          📋
        </button>

        <!-- Clear logs -->
        <button
          class="btn-icon-tool btn-clear"
          title="Clear Console"
          @click="monitorStore.clearLogs"
        >
          🗑
        </button>
      </div>
    </div>

    <!-- Monospace Terminal Screen -->
    <div ref="terminalRef" class="terminal-body font-mono">
      <div v-if="monitorStore.filteredLogs.length === 0" class="empty-terminal">
        <p>No serial output. Connect your device or send a command to see stream output.</p>
      </div>

      <div
        v-for="line in monitorStore.filteredLogs"
        :key="line.id"
        class="terminal-line"
        :class="`line-${line.type}`"
      >
        <span v-if="monitorStore.showTimestamps" class="timestamp-col">
          {{ line.timestamp }}
        </span>
        <span class="type-badge" :class="`badge-${line.type}`">{{ line.type }}</span>
        <span class="text-content">{{ line.text }}</span>
      </div>
    </div>

    <!-- Bottom Command Input Strip -->
    <div class="command-bar">
      <button
        class="btn-mode-toggle"
        :class="{ 'btn-mode--active': monitorStore.isHexMode }"
        title="Toggle Hex Input Mode"
        @click="monitorStore.isHexMode = !monitorStore.isHexMode"
      >
        {{ monitorStore.isHexMode ? 'HEX' : 'ASCII' }}
      </button>

      <div class="select-wrapper-compact">
        <select v-model="monitorStore.lineEnding" class="line-ending-select">
          <option value="CRLF">CRLF (\r\n)</option>
          <option value="LF">LF (\n)</option>
          <option value="CR">CR (\r)</option>
          <option value="NONE">None</option>
        </select>
      </div>

      <input
        v-model="inputText"
        type="text"
        class="command-input font-mono"
        :placeholder="monitorStore.isHexMode ? 'Enter hex bytes (e.g. AA 01 01 00 00 07 55)...' : 'Type a command and press Enter...'"
        :disabled="deviceStore.status !== 'connected'"
        @keydown="handleKeyDown"
      />

      <button
        class="btn-send"
        :disabled="deviceStore.status !== 'connected' || !inputText.trim()"
        @click="handleSend"
      >
        Send ↵
      </button>
    </div>
  </div>
</template>

<style scoped>
.serial-terminal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1117;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
}

/* Toolbar */
.terminal-toolbar {
  height: 38px;
  min-height: 38px;
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  gap: 0.5rem;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.terminal-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-right: 0.25rem;
}

.type-filter-group {
  display: flex;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 2px;
}

.filter-tab {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.filter-tab:hover {
  color: var(--color-text-primary);
}

.filter-tab--active {
  background: var(--color-accent);
  color: #ffffff;
}

.search-input {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
  width: 120px;
  outline: none;
}

.btn-icon-tool {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.75rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: all 0.15s ease;
}

.btn-icon-tool:hover {
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.btn-icon-tool--active {
  background: var(--color-accent-dim);
  border-color: rgba(124, 111, 255, 0.4);
}

/* Terminal Body */
.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
  line-height: 1.4;
  background: #090a0f;
  color: #cbd5e1;
}

.empty-terminal {
  margin: auto;
  text-align: center;
  color: #475569;
  font-size: 0.8rem;
}

.terminal-line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  word-break: break-all;
}

.timestamp-col {
  color: #64748b;
  font-size: 0.68rem;
  flex-shrink: 0;
  user-select: none;
}

.type-badge {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
  user-select: none;
}

.badge-log {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}

.badge-boot {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.badge-packet {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.badge-tx {
  background: rgba(124, 111, 255, 0.25);
  color: #a78bfa;
}

.badge-system {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.line-boot .text-content {
  color: #fbbf24;
}

.line-tx .text-content {
  color: #c4b5fd;
  font-weight: 600;
}

.line-packet .text-content {
  color: #34d399;
}

.line-system .text-content {
  color: #f87171;
}

/* Command Bar */
.command-bar {
  height: 38px;
  min-height: 38px;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  gap: 0.4rem;
}

.btn-mode-toggle {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.btn-mode--active {
  background: #f59e0b;
  color: #000;
  border-color: #f59e0b;
}

.line-ending-select {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  outline: none;
}

.command-input {
  flex: 1;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.78rem;
  padding: 0.25rem 0.6rem;
  outline: none;
}

.command-input:focus {
  border-color: var(--color-accent);
}

.btn-send {
  background: var(--color-accent);
  color: white;
  border: none;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.font-mono {
  font-family: monospace;
}
</style>
