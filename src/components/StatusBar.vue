<script setup lang="ts">
import { computed } from 'vue'
import { useDeviceStore } from '../stores/device'
import { getPlatformMode } from '../services/platform'

const deviceStore = useDeviceStore()
const platformMode = computed(() => getPlatformMode())

const statusLabel = computed(() => {
  switch (deviceStore.status) {
    case 'connected':    return `Connected (${deviceStore.selectedPort || 'Serial'})`
    case 'connecting':   return `Connecting (${deviceStore.selectedPort})…`
    case 'error':        return 'Error'
    default:             return 'Disconnected'
  }
})

const statusClass = computed(() => ({
  'status-dot--connected':    deviceStore.status === 'connected',
  'status-dot--connecting':   deviceStore.status === 'connecting',
  'status-dot--error':        deviceStore.status === 'error',
  'status-dot--disconnected': deviceStore.status === 'disconnected',
}))
</script>

<template>
  <div class="status-bar" role="status" aria-live="polite">
    <div class="status-item">
      <span class="status-chip-label">ESP32</span>
      <span class="status-dot" :class="statusClass" />
      <span class="status-chip-value">{{ statusLabel }}</span>
    </div>
    <div class="status-item status-platform">
      <span class="status-chip-label">Platform</span>
      <span class="status-mode-tag" :class="'status-mode--' + platformMode">
        {{ platformMode === 'desktop' ? 'Desktop' : 'Web' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 36px;
  background-color: var(--color-bg-sidebar);
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 1.5rem;
  flex-shrink: 0;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.status-chip-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-chip-value {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* Status indicator dot */
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--connected {
  background-color: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
  animation: pulse-connected 2s ease-in-out infinite;
}

.status-dot--connecting {
  background-color: var(--color-warning);
  animation: pulse-connecting 0.8s ease-in-out infinite alternate;
}

.status-dot--error {
  background-color: var(--color-error);
}

.status-dot--disconnected {
  background-color: var(--color-disconnected);
}

@keyframes pulse-connected {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}

@keyframes pulse-connecting {
  from { opacity: 0.3; }
  to   { opacity: 1; }
}

.status-platform {
  margin-left: auto;
}

.status-mode-tag {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.status-mode--desktop {
  background-color: rgba(124, 111, 255, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(124, 111, 255, 0.3);
}

.status-mode--web {
  background-color: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
  border: 1px solid rgba(56, 189, 248, 0.3);
}
</style>
