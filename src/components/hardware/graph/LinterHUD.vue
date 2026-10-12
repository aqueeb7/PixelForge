<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWiringStore } from '../../../stores/wiring'

const wiringStore = useWiringStore()
const isExpanded = ref(false)

const report = computed(() => wiringStore.lintReport)

const powerPercent = computed(() => {
  return Math.min(100, (report.value.totalCurrentMa / report.value.maxLdoCurrentMa) * 100)
})

const powerStatusClass = computed(() => {
  if (powerPercent.value > 90) return 'meter-danger'
  if (powerPercent.value > 70) return 'meter-warn'
  return 'meter-ok'
})
</script>

<template>
  <div class="linter-hud-container" :class="{ 'is-expanded': isExpanded }">
    <!-- Top Bar Summary -->
    <div class="hud-bar" @click="isExpanded = !isExpanded">
      <div class="hud-summary-left">
        <!-- Status Indicator Pill -->
        <div
          class="status-pill"
          :class="{
            'status-pill--error': report.hasErrors,
            'status-pill--warn': !report.hasErrors && report.hasWarnings,
            'status-pill--ok': !report.hasErrors && !report.hasWarnings,
          }"
        >
          <span v-if="report.hasErrors" class="pill-icon">❌</span>
          <span v-else-if="report.hasWarnings" class="pill-icon">⚠️</span>
          <span v-else class="pill-icon">✓</span>

          <span class="pill-text font-mono">
            <template v-if="report.hasErrors">
              {{ report.issues.filter((i) => i.severity === 'error').length }} Pin / Bus Error(s)
            </template>
            <template v-else-if="report.hasWarnings">
              {{ report.issues.filter((i) => i.severity === 'warning').length }} Strapping / Bus Advisory
            </template>
            <template v-else>
              Electrical Rules Valid
            </template>
          </span>
        </div>

        <!-- Power Budget Widget -->
        <div class="power-widget" title="Estimated 3.3V LDO current draw of attached peripherals">
          <span class="power-label font-mono">3.3V LDO Load:</span>
          <div class="power-meter-bar">
            <div
              class="power-meter-fill"
              :class="powerStatusClass"
              :style="{ width: `${powerPercent}%` }"
            />
          </div>
          <span class="power-val font-mono" :class="powerStatusClass">
            {{ report.totalCurrentMa }} mA / {{ report.maxLdoCurrentMa }} mA
          </span>
        </div>

        <!-- Breadboard Stats -->
        <div class="net-stats font-mono">
          <span class="stat-item">{{ report.connectedComponentsCount }} Components</span>
          <span class="stat-divider">•</span>
          <span class="stat-item">{{ report.totalWiresCount }} Nets</span>
        </div>
      </div>

      <!-- Right: Toggle & Issues Badge -->
      <div class="hud-summary-right">
        <button
          class="btn-toggle-hud"
          :class="{ 'has-issues': report.issues.length > 0 }"
        >
          <span v-if="report.issues.length > 0" class="issues-count font-mono">
            {{ report.issues.length }} Issue{{ report.issues.length > 1 ? 's' : '' }}
          </span>
          <span class="toggle-icon">{{ isExpanded ? '▼' : '▲' }}</span>
        </button>
      </div>
    </div>

    <!-- Collapsible Issues Drawer -->
    <div v-if="isExpanded" class="hud-drawer">
      <div v-if="report.issues.length === 0" class="empty-issues">
        <span class="empty-icon">🛡️</span>
        <div class="empty-text">
          <h5>All Electrical Rules Satisfied</h5>
          <p>No strapping pin violations, voltage mismatches, or bus collisions detected.</p>
        </div>
      </div>

      <div v-else class="issues-list">
        <div
          v-for="issue in report.issues"
          :key="issue.id"
          class="issue-card"
          :class="`issue-card--${issue.severity}`"
        >
          <div class="issue-header">
            <span class="issue-badge font-mono">{{ issue.severity.toUpperCase() }}</span>
            <span class="issue-rule font-mono">{{ issue.ruleId }}</span>
            <span class="issue-title">{{ issue.title }}</span>
          </div>
          <p class="issue-message">{{ issue.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.linter-hud-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(19, 19, 26, 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--color-border);
  z-index: 20;
  display: flex;
  flex-direction: column;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
}

.hud-bar {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  cursor: pointer;
  user-select: none;
}

.hud-bar:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

.hud-summary-left {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.65rem;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.status-pill--ok {
  background-color: rgba(52, 211, 153, 0.12);
  color: var(--color-success);
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.status-pill--warn {
  background-color: rgba(251, 191, 36, 0.12);
  color: var(--color-warning);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.status-pill--error {
  background-color: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.pill-icon {
  font-size: 0.75rem;
}

.power-widget {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
}

.power-label {
  color: var(--color-text-secondary);
}

.power-meter-bar {
  width: 90px;
  height: 6px;
  background-color: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}

.power-meter-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.meter-ok {
  background-color: var(--color-success);
  color: var(--color-success);
}

.meter-warn {
  background-color: var(--color-warning);
  color: var(--color-warning);
}

.meter-danger {
  background-color: var(--color-error);
  color: var(--color-error);
}

.power-val {
  font-size: 0.7rem;
}

.net-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.stat-divider {
  opacity: 0.4;
}

.hud-summary-right {
  display: flex;
  align-items: center;
}

.btn-toggle-hud {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.btn-toggle-hud:hover {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.has-issues .issues-count {
  background-color: rgba(248, 113, 113, 0.2);
  color: var(--color-error);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-weight: 600;
}

.toggle-icon {
  font-size: 0.65rem;
  opacity: 0.7;
}

.hud-drawer {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border-subtle);
  background-color: #0c0c11;
}

.empty-issues {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
}

.empty-icon {
  font-size: 1.5rem;
}

.empty-text h5 {
  font-size: 0.8rem;
  color: var(--color-success);
  margin-bottom: 0.15rem;
}

.empty-text p {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.issue-card {
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  border-left: 3px solid;
  background-color: var(--color-bg-surface);
}

.issue-card--error {
  border-color: var(--color-error);
  background-color: rgba(248, 113, 113, 0.05);
}

.issue-card--warning {
  border-color: var(--color-warning);
  background-color: rgba(251, 191, 36, 0.05);
}

.issue-card--advisory {
  border-color: var(--color-accent);
  background-color: rgba(124, 111, 255, 0.05);
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.issue-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}

.issue-card--error .issue-badge {
  background-color: rgba(248, 113, 113, 0.2);
  color: var(--color-error);
}

.issue-card--warning .issue-badge {
  background-color: rgba(251, 191, 36, 0.2);
  color: var(--color-warning);
}

.issue-card--advisory .issue-badge {
  background-color: rgba(124, 111, 255, 0.2);
  color: var(--color-accent);
}

.issue-rule {
  font-size: 0.65rem;
  color: var(--color-text-muted);
}

.issue-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.issue-message {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}
</style>
