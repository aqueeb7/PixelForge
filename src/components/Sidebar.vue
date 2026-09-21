<script setup lang="ts">
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

function isActive(itemName: string): boolean {
  return route.name === itemName
}
</script>

<template>
  <aside class="sidebar">
    <!-- Logo / App name -->
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <span class="sidebar-logo-icon">⬛</span>
        <span class="sidebar-logo-text">PixelForge</span>
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
      >
        <span class="nav-icon" :data-icon="item.icon">
          <!-- Icon glyphs via CSS content, keyed by data-icon -->
        </span>
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="isActive(item.name)" class="nav-active-bar" />
      </router-link>
    </nav>

    <!-- Bottom spacer for future content (e.g. version badge) -->
    <div class="sidebar-footer">
      <span class="sidebar-version-hint">v0.1.0</span>
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
}

/* Header */
.sidebar-header {
  padding: 1.25rem 1rem 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.25rem 1rem;
}

.sidebar-logo-icon {
  font-size: 1.1rem;
  filter: brightness(0) invert(0.6) sepia(1) saturate(8) hue-rotate(230deg);
}

.sidebar-logo-text {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-primary);
  text-transform: uppercase;
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
  padding: 0 0.5rem;
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
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--color-border-subtle);
}

.sidebar-version-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}
</style>
