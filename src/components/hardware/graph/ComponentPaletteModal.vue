<script setup lang="ts">
import { ref, computed } from 'vue'
import { COMPONENT_REGISTRY, type ComponentDefinition } from '../../../core/hardware/ComponentDefinition'
import { useWiringStore } from '../../../stores/wiring'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'added', instanceId: string): void
}>()

const wiringStore = useWiringStore()
const selectedCategory = ref<string>('All')

const categories = computed(() => {
  const cats = new Set<string>()
  COMPONENT_REGISTRY.forEach((c) => cats.add(c.category))
  return ['All', ...Array.from(cats)]
})

const filteredComponents = computed(() => {
  if (selectedCategory.value === 'All') return COMPONENT_REGISTRY
  return COMPONENT_REGISTRY.filter((c) => c.category === selectedCategory.value)
})

function handleAdd(def: ComponentDefinition) {
  const id = wiringStore.addComponent(def.id)
  emit('added', id)
  emit('close')
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-left">
          <span class="header-icon">🧰</span>
          <div>
            <h3 class="header-title">Peripheral Component Catalog</h3>
            <p class="header-subtitle">Select embedded modules and sensors to connect on your breadboard</p>
          </div>
        </div>
        <button class="btn-close" title="Close" @click="emit('close')">✕</button>
      </header>

      <!-- Category Filter Pills -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat"
          class="cat-tab"
          :class="{ 'cat-tab--active': selectedCategory === cat }"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Component Cards Grid -->
      <div class="palette-grid">
        <div
          v-for="comp in filteredComponents"
          :key="comp.id"
          class="comp-card"
          :style="{ '--accent-col': comp.accentColor }"
        >
          <div class="comp-card-top">
            <span class="comp-icon">{{ comp.icon }}</span>
            <div class="comp-info">
              <h4 class="comp-name">{{ comp.name }}</h4>
              <div class="comp-badges">
                <span class="badge cat-badge">{{ comp.category }}</span>
                <span class="badge power-badge font-mono">⚡ {{ comp.estimatedCurrentMa }} mA</span>
                <span v-if="comp.i2cAddress" class="badge i2c-badge font-mono">
                  I²C 0x{{ comp.i2cAddress.toString(16).toUpperCase() }}
                </span>
              </div>
            </div>
          </div>

          <p class="comp-desc">{{ comp.description }}</p>

          <div class="comp-pins-preview">
            <span class="pins-label">Pins ({{ comp.pins.length }}):</span>
            <div class="pins-tags">
              <span
                v-for="p in comp.pins"
                :key="p.id"
                class="pin-tag font-mono"
                :title="p.description"
              >
                {{ p.label }}
              </span>
            </div>
          </div>

          <button class="btn-add-comp" @click="handleAdd(comp)">
            ➕ Add to Breadboard
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.modal-card {
  width: 100%;
  max-width: 840px;
  max-height: 85vh;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background-color: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  font-size: 1.5rem;
}

.header-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.btn-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.btn-close:hover {
  color: var(--color-text-primary);
  background-color: var(--color-border);
}

.category-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border-subtle);
  overflow-x: auto;
}

.cat-tab {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  padding: 0.25rem 0.65rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cat-tab:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

.cat-tab--active {
  background-color: var(--color-accent-dim);
  border-color: var(--color-accent);
  color: var(--color-accent);
  font-weight: 600;
}

.palette-grid {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.comp-card {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: transform 0.15s ease, border-color 0.15s ease;
  position: relative;
  overflow: hidden;
}

.comp-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background-color: var(--accent-col, var(--color-accent));
}

.comp-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-col, var(--color-accent));
}

.comp-card-top {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.comp-icon {
  font-size: 1.75rem;
  line-height: 1;
}

.comp-info {
  flex: 1;
}

.comp-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.3rem;
}

.comp-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.badge {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--color-text-secondary);
}

.power-badge {
  color: #fbbf24;
  background-color: rgba(251, 191, 36, 0.1);
}

.i2c-badge {
  color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.1);
}

.comp-desc {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  flex: 1;
}

.comp-pins-preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.7rem;
}

.pins-label {
  color: var(--color-text-muted);
}

.pins-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.pin-tag {
  font-size: 0.65rem;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  color: var(--color-text-primary);
}

.btn-add-comp {
  width: 100%;
  padding: 0.45rem;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-add-comp:hover {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}
</style>
