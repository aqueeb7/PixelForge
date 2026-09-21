<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAppInfo } from '../services/platform'
import type { AppInfo } from '../types'

const appInfo = ref<AppInfo | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    appInfo.value = await getAppInfo()
  } catch (e) {
    error.value = String(e)
  }
})
</script>

<template>
  <div class="home-view">
    <!-- Hero -->
    <div class="hero">
      <div class="hero-badge">1-bit graphics for OLED displays</div>
      <h1 class="hero-title">
        Welcome to <span class="hero-accent">PixelForge</span>
      </h1>
      <p class="hero-subtitle">
        Draw, convert, and send pixel-perfect graphics to your ESP32-connected
        display. From a single frame to a full animation reel.
      </p>
    </div>

    <!-- Action cards -->
    <div class="cards">
      <div class="card">
        <div class="card-icon">✏️</div>
        <div class="card-body">
          <h3 class="card-title">Draw</h3>
          <p class="card-desc">Create 128×64 pixel art directly on the OLED canvas.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon">🎞️</div>
        <div class="card-body">
          <h3 class="card-title">Convert</h3>
          <p class="card-desc">Import video or images and dither them to 1-bit.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon">🔌</div>
        <div class="card-body">
          <h3 class="card-title">Send</h3>
          <p class="card-desc">Push frames and animations to your ESP32 over Wi-Fi.</p>
        </div>
      </div>
    </div>

    <!-- App info (Rust → Frontend) -->
    <div class="app-info" v-if="appInfo">
      <span class="app-info-label">Runtime</span>
      <span class="app-info-value">{{ appInfo.name }} v{{ appInfo.version }} · {{ appInfo.platform }}</span>
    </div>
    <div class="app-info app-info--error" v-if="error">
      <span class="app-info-label">Error</span>
      <span class="app-info-value">{{ error }}</span>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 4rem;
  gap: 2.5rem;
  overflow-y: auto;
}

/* Hero */
.hero {
  text-align: center;
  max-width: 560px;
}

.hero-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-accent);
  background-color: var(--color-accent-dim);
  border: 1px solid rgba(124, 111, 255, 0.3);
  padding: 0.25rem 0.75rem;
  border-radius: 99px;
  margin-bottom: 1.25rem;
}

.hero-title {
  font-size: 2.75rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.hero-accent {
  background: linear-gradient(135deg, #7c6fff, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1rem;
  line-height: 1.65;
  color: var(--color-text-secondary);
}

/* Cards */
.cards {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.card {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  width: 210px;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  cursor: default;
}

.card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(124, 111, 255, 0.12);
}

.card-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
  margin-top: 1px;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.card-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-desc {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

/* App info / Rust badge */
.app-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
}

.app-info--error {
  color: var(--color-error);
  border-color: rgba(248, 113, 113, 0.3);
  background-color: rgba(248, 113, 113, 0.05);
}

.app-info-label {
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.app-info-value {
  font-family: "Courier New", monospace;
}
</style>
