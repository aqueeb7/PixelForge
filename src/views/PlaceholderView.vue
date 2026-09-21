<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

// Friendly labels for routes not yet implemented
const labels: Record<string, string> = {
  draw:      'Draw',
  video:     'Video',
  animation: 'Animation',
  devices:   'Devices',
  projects:  'Projects',
  settings:  'Settings',
}

const label = String(route.name ?? '')
</script>

<template>
  <div class="placeholder-view">
    <div class="placeholder-icon">🚧</div>
    <h2 class="placeholder-title">{{ labels[label] ?? label }}</h2>
    <p class="placeholder-desc">This feature is coming in a future spec.</p>
  </div>
</template>

<style scoped>
.placeholder-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--color-text-muted);
}

.placeholder-icon {
  font-size: 2.5rem;
  margin-bottom: 0.25rem;
}

.placeholder-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.placeholder-desc {
  font-size: 0.85rem;
}
</style>
