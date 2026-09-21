<script setup lang="ts">
import { useMonitorStore } from '../../stores/monitor'

const monitorStore = useMonitorStore()
</script>

<template>
  <div class="packet-inspector-container">
    <div class="inspector-header">
      <div class="header-left">
        <span class="icon">🔍</span>
        <span class="title">Spec 002 / 005 Protocol Packets</span>
        <span class="packet-count font-mono">{{ monitorStore.packets.length }} captured</span>
      </div>
      <button class="btn-clear-packets" title="Clear Packets" @click="monitorStore.clearPackets">
        Clear
      </button>
    </div>

    <div class="packet-table-wrapper">
      <table class="packet-table font-mono">
        <thead>
          <tr>
            <th>Time</th>
            <th>Dir</th>
            <th>Code</th>
            <th>Packet Name</th>
            <th>Length</th>
            <th>CRC</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="monitorStore.packets.length === 0">
            <td colspan="6" class="empty-row">
              No protocol packets logged yet. Packets transmitted via Spec 002/005 will appear here in real-time.
            </td>
          </tr>
          <tr
            v-for="pkt in monitorStore.packets"
            :key="pkt.id"
            class="packet-row"
            :class="`dir-${pkt.direction.toLowerCase()}`"
          >
            <td class="col-time">{{ pkt.timestamp }}</td>
            <td>
              <span class="dir-badge" :class="`dir-${pkt.direction.toLowerCase()}`">
                {{ pkt.direction }}
              </span>
            </td>
            <td class="col-code">0x{{ pkt.code.toString(16).toUpperCase().padStart(2, '0') }}</td>
            <td class="col-name">{{ pkt.name }}</td>
            <td class="col-len">{{ pkt.payloadLength }} B</td>
            <td>
              <span class="crc-badge" :class="`crc-${pkt.status}`">
                {{ pkt.status.toUpperCase() }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.packet-inspector-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
}

.inspector-header {
  height: 38px;
  min-height: 38px;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.packet-count {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  padding: 1px 5px;
  border-radius: 4px;
}

.btn-clear-packets {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-clear-packets:hover {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

/* Table */
.packet-table-wrapper {
  flex: 1;
  overflow-y: auto;
}

.packet-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
  text-align: left;
}

.packet-table th {
  background: rgba(0, 0, 0, 0.2);
  color: var(--color-text-muted);
  font-weight: 600;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--color-border-subtle);
  position: sticky;
  top: 0;
  z-index: 2;
}

.packet-table td {
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.packet-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.empty-row {
  text-align: center;
  color: var(--color-text-muted);
  padding: 2rem !important;
}

.col-time {
  color: #64748b;
}

.dir-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
}

.dir-tx {
  background: rgba(124, 111, 255, 0.2);
  color: #a78bfa;
}

.dir-rx {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.col-code {
  color: #38bdf8;
}

.col-name {
  color: var(--color-text-primary);
  font-weight: 600;
}

.col-len {
  color: var(--color-text-secondary);
}

.crc-badge {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
}

.crc-ok {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.crc-error {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.font-mono {
  font-family: monospace;
}
</style>
