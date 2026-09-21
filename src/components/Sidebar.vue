<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

interface NavEntry {
  name: string
  label: string
  to: string
  icon: string
}

const navItems: NavEntry[] = [
  { name: 'home',      label: 'Home',         to: '/',          icon: 'home' },
  { name: 'draw',      label: 'Draw',         to: '/draw',      icon: 'pencil' },
  { name: 'devices',   label: 'Devices',      to: '/devices',   icon: 'cpu' },
  { name: 'hardware',  label: 'Hardware Lab', to: '/hardware',  icon: 'lab' },
  { name: 'video',     label: 'Video',        to: '/video',     icon: 'film' },
  { name: 'animation', label: 'Animation',    to: '/animation', icon: 'play' },
  { name: 'projects',  label: 'Projects',     to: '/projects',  icon: 'folder' },
  { name: 'settings',  label: 'Settings',     to: '/settings',  icon: 'settings' },
]

const isCollapsed = ref(localStorage.getItem('pixelforge-sidebar-collapsed') === 'true')

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('pixelforge-sidebar-collapsed', String(isCollapsed.value))
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    toggleCollapse()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function isActive(itemName: string): boolean {
  return route.name === itemName
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <!-- Header with logo and collapse toggle -->
    <div class="sidebar-header">
      <div class="sidebar-top-row">
        <div class="sidebar-logo" :title="isCollapsed ? 'Expand sidebar' : undefined" @click="isCollapsed ? toggleCollapse() : null">
          <span class="sidebar-logo-icon">⬛</span>
          <span v-if="!isCollapsed" class="sidebar-logo-text">PixelForge</span>
        </div>
        <button
          v-if="!isCollapsed"
          class="btn-toggle-collapse"
          title="Collapse navigation (Ctrl+B)"
          @click="toggleCollapse"
        >
          ‹
        </button>
      </div>
      <div class="sidebar-divider" />
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.name"
        :to="item.to"
        class="nav-item"
        :class="{ 'nav-item--active': isActive(item.name) }"
        :title="isCollapsed ? item.label : undefined"
      >
        <span class="nav-icon" :data-icon="item.icon" />
        <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
        <span v-if="isActive(item.name)" class="nav-active-bar" />
      </router-link>
    </nav>

    <!-- Footer -->
    <div class="sidebar-footer">
      <span v-if="!isCollapsed" class="sidebar-version-hint">v0.1.0</span>
      <button
        v-else
        class="btn-expand-hint"
        title="Expand navigation (Ctrl+B)"
        @click="toggleCollapse"
      >
        ›
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100%;
  background-color: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.sidebar--collapsed {
  width: 58px;
  min-width: 58px;
}

/* Header */
.sidebar-header {
  padding: 1rem 0.65rem 0;
}

.sidebar-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.25rem 0.85rem;
}

.sidebar--collapsed .sidebar-top-row {
  justify-content: center;
  padding-bottom: 0.85rem;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.sidebar--collapsed .sidebar-logo {
  cursor: pointer;
}

.sidebar-logo-icon {
  font-size: 1.1rem;
  filter: brightness(0) invert(0.6) sepia(1) saturate(8) hue-rotate(230deg);
}

.sidebar-logo-text {
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-primary);
  text-transform: uppercase;
  white-space: nowrap;
}

.btn-toggle-collapse {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted);
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 1rem;
  line-height: 1;
}

.btn-toggle-collapse:hover {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
  background: var(--color-bg-surface);
}

.sidebar-divider {
  height: 1px;
  background: var(--color-border-subtle);
  margin-bottom: 0.75rem;
}

/* Nav */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 0.4rem;
  overflow-y: auto;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
  cursor: pointer;
  white-space: nowrap;
}

.sidebar--collapsed .nav-item {
  justify-content: center;
  padding: 0.6rem 0;
}

.nav-item:hover {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
}

.nav-item--active {
  background-color: var(--color-accent-dim);
  color: var(--color-accent-hover);
}

.nav-item--active:hover {
  background-color: var(--color-accent-dim);
}

/* Active indicator bar */
.nav-active-bar {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--color-accent);
}

.sidebar--collapsed .nav-active-bar {
  right: 3px;
}

/* Icon glyphs via content */
.nav-icon {
  width: 1.1rem;
  height: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.nav-icon[data-icon="home"]::before      { content: "🏠"; font-size: 0.85rem; }
.nav-icon[data-icon="pencil"]::before    { content: "✏️"; font-size: 0.85rem; }
.nav-icon[data-icon="film"]::before      { content: "🎞️"; font-size: 0.85rem; }
.nav-icon[data-icon="play"]::before      { content: "▶️"; font-size: 0.85rem; }
.nav-icon[data-icon="cpu"]::before       { content: "🔌"; font-size: 0.85rem; }
.nav-icon[data-icon="lab"]::before       { content: "🧪"; font-size: 0.85rem; }
.nav-icon[data-icon="folder"]::before    { content: "📁"; font-size: 0.85rem; }
.nav-icon[data-icon="settings"]::before  { content: "⚙️"; font-size: 0.85rem; }

/* Footer */
.sidebar-footer {
  padding: 0.75rem 0.65rem 1rem;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-version-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}

.btn-expand-hint {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn-expand-hint:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
}
</style>
