<script setup lang="ts">
import { onMounted } from 'vue'
import { useHardwareStore } from '../stores/hardware'
import Esp32BoardView from '../components/hardware/Esp32BoardView.vue'
import PinInspector from '../components/hardware/PinInspector.vue'
import PeripheralManager from '../components/hardware/PeripheralManager.vue'

const hardwareStore = useHardwareStore()

onMounted(async () => {
  await hardwareStore.init()
})

async function handleSave() {
  await hardwareStore.save()
}
</script>

<template>
  <div class="hardware-view">
    <!-- Top Toolbar (Fixed 48px like DrawView) -->
    <header class="hardware-toolbar">
      <div class="toolbar-group">
        <span class="toolbar-icon">🧪</span>
        <h2 class="toolbar-title">Hardware Lab</h2>
        <span class="toolbar-badge">Spec 004</span>
      </div>

      <div class="toolbar-group toolbar-center">
        <div class="board-selector-group">
          <label class="selector-label" for="board-select">Target Board:</label>
          <select
            id="board-select"
            class="board-select"
            :value="hardwareStore.selectedBoardId"
            @change="(e) => hardwareStore.selectBoard((e.target as HTMLSelectElement).value)"
          >
            <option
              v-for="b in hardwareStore.boards"
              :key="b.id"
              :value="b.id"
            >
              {{ b.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="toolbar-group toolbar-right">
        <!-- Save status toast -->
        <span v-if="hardwareStore.errorMessage" class="status-msg error-msg">
          ⚠️ {{ hardwareStore.errorMessage }}
        </span>
        <span v-else-if="hardwareStore.lastSaved" class="status-msg save-msg">
          ✓ Saved at {{ hardwareStore.lastSaved.toLocaleTimeString() }}
        </span>

        <button
          class="btn-tool btn-secondary"
          title="Reset configuration to default OLED setup"
          @click="hardwareStore.resetToDefault"
        >
          ↺ Reset Default
        </button>

        <button
          class="btn-tool btn-save"
          :disabled="hardwareStore.isSaving"
          @click="handleSave"
        >
          {{ hardwareStore.isSaving ? 'Saving...' : '💾 Save Config' }}
        </button>
      </div>
    </header>

    <!-- Main Workspace Grid (Fills remaining height, no window scroll) -->
    <div class="workspace-grid">
      <!-- Left Column: Interactive Visual Board (Centered, fits vertically) -->
      <div class="board-column">
        <Esp32BoardView />
      </div>

      <!-- Right Column: Inspector & Peripherals (Internal scrolling only) -->
      <aside class="sidebar-column">
        <PinInspector />
        <PeripheralManager />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.hardware-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden; /* Prevent any outer page scrollbar */
  background-color: var(--color-bg-base);
}

/* Fixed Top Toolbar */
.hardware-toolbar {
  height: 48px;
  min-height: 48px;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  gap: 1rem;
  z-index: 10;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-icon {
  font-size: 1.1rem;
}

.toolbar-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.toolbar-badge {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-accent);
  background: var(--color-accent-dim);
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(124, 111, 255, 0.25);
}

/* Board Selector */
.board-selector-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.selector-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.board-select {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-primary);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
  outline: none;
}

/* Action Buttons */
.toolbar-right {
  margin-left: auto;
  gap: 0.5rem;
}

.btn-tool {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-secondary {
  background: var(--color-bg-elevated);
  border-color: var(--color-border);
  color: var(--color-text-secondary);
}

.btn-secondary:hover {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.btn-save {
  background: var(--color-accent);
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-msg {
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.save-msg {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.error-msg {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Workspace Grid */
.workspace-grid {
  flex: 1;
  min-height: 0; /* Crucial for inner scrollable columns */
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1rem;
  padding: 0.75rem 1rem;
  overflow: hidden;
}

.board-column {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  height: 100%;
  min-height: 0;
}

.sidebar-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
  overflow-y: auto; /* Internal scrolling only inside sidebar */
  padding-right: 2px;
}
</style>
