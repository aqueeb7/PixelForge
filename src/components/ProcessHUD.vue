<script setup lang="ts">
import { computed } from 'vue'
import { useDeviceStore } from '../stores/device'

const deviceStore = useDeviceStore()

const currentTx = computed(() => deviceStore.activeTransaction)
const isVisible = computed(() => Boolean(currentTx.value))

const stepIndex = computed(() => {
  if (!currentTx.value) return 0
  switch (currentTx.value.step) {
    case 'preparing':
      return 1
    case 'transmitting':
      return 2
    case 'awaiting_ack':
      return 3
    case 'completed':
      return 4
    case 'failed':
      return -1
    default:
      return 0
  }
})

const badgeColor = computed(() => {
  if (!currentTx.value) return 'border-cyan-500/40 bg-cyan-950/80'
  switch (currentTx.value.step) {
    case 'preparing':
      return 'border-sky-500/50 bg-sky-950/90 text-sky-300'
    case 'transmitting':
      return 'border-blue-500/60 bg-blue-950/90 text-blue-300'
    case 'awaiting_ack':
      return 'border-amber-500/60 bg-amber-950/90 text-amber-300'
    case 'completed':
      return 'border-emerald-500/60 bg-emerald-950/90 text-emerald-300'
    case 'failed':
      return 'border-rose-500/60 bg-rose-950/90 text-rose-300'
    default:
      return 'border-slate-700 bg-slate-900/90 text-slate-300'
  }
})
</script>

<template>
  <Transition name="hud-slide">
    <div
      v-if="isVisible && currentTx"
      class="process-hud-container"
      role="status"
      aria-live="assertive"
    >
      <div class="process-hud-card font-mono" :class="badgeColor">
        <!-- Top Row: Icon, Title, Timing -->
        <div class="hud-header">
          <div class="hud-title-group">
            <span v-if="currentTx.step === 'completed'" class="hud-icon text-emerald-400">✓</span>
            <span v-else-if="currentTx.step === 'failed'" class="hud-icon text-rose-400">✕</span>
            <span v-else class="hud-icon animate-spin text-cyan-400">⟳</span>

            <span class="hud-title">{{ currentTx.title }}</span>
          </div>

          <div class="hud-meta">
            <span v-if="currentTx.port" class="hud-port-tag">{{ currentTx.port }}</span>
            <span class="hud-timer">{{ currentTx.elapsedMs }}ms</span>
          </div>
        </div>

        <!-- Middle: Micro-Step Pipeline Badges -->
        <div class="hud-steps">
          <div
            class="hud-step-pill"
            :class="{
              'is-active': stepIndex === 1,
              'is-done': stepIndex > 1,
            }"
          >
            1. Prep
          </div>
          <span class="hud-step-arrow">→</span>
          <div
            class="hud-step-pill"
            :class="{
              'is-active': stepIndex === 2,
              'is-done': stepIndex > 2,
            }"
          >
            2. Send
          </div>
          <span class="hud-step-arrow">→</span>
          <div
            class="hud-step-pill"
            :class="{
              'is-active': stepIndex === 3,
              'is-done': stepIndex > 3,
            }"
          >
            3. ACK
          </div>
          <span class="hud-step-arrow">→</span>
          <div
            class="hud-step-pill"
            :class="{
              'is-active': stepIndex === 4,
              'is-done': stepIndex === 4,
            }"
          >
            4. Render
          </div>
        </div>

        <!-- Detail Message -->
        <div class="hud-detail">
          {{ currentTx.detail }}
        </div>

        <!-- Animated Progress Line -->
        <div class="hud-progress-track">
          <div
            class="hud-progress-fill"
            :class="{
              'bg-cyan-400': currentTx.step === 'preparing' || currentTx.step === 'transmitting',
              'bg-amber-400': currentTx.step === 'awaiting_ack',
              'bg-emerald-400': currentTx.step === 'completed',
              'bg-rose-400': currentTx.step === 'failed',
            }"
            :style="{ width: `${currentTx.progress}%` }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.process-hud-container {
  position: fixed;
  right: 1.5rem;
  bottom: 2.85rem;
  z-index: 100;
  pointer-events: none;
}

.process-hud-card {
  pointer-events: auto;
  min-width: 320px;
  max-width: 420px;
  border-width: 1px;
  border-style: solid;
  border-radius: 8px;
  padding: 0.65rem 0.85rem 0.55rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.65), 0 0 15px rgba(56, 189, 248, 0.15);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.hud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.hud-title-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.hud-icon {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}

.hud-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hud-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.hud-port-tag {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
}

.hud-timer {
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.hud-steps {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0;
}

.hud-step-pill {
  font-size: 0.66rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #64748b;
  transition: all 0.2s ease;
}

.hud-step-pill.is-active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 700;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
}

.hud-step-pill.is-done {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.hud-step-arrow {
  font-size: 0.65rem;
  color: #475569;
}

.hud-detail {
  font-size: 0.73rem;
  line-height: 1.3;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-progress-track {
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 0.1rem;
}

.hud-progress-fill {
  height: 100%;
  transition: width 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 6px currentColor;
}

/* Slide Transition */
.hud-slide-enter-active,
.hud-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.hud-slide-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.hud-slide-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
