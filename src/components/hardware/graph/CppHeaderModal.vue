<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWiringStore } from '../../../stores/wiring'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const wiringStore = useWiringStore()
const isCopied = ref(false)

const code = computed(() => {
  return wiringStore.getGeneratedHeaderCode()
})

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(code.value)
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

function handleDownload() {
  const blob = new Blob([code.value], { type: 'text/x-c++hdr;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', 'pinout.h')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-left">
          <span class="header-icon">📄</span>
          <div>
            <h3 class="header-title font-mono">pinout.h</h3>
            <p class="header-subtitle">Auto-generated C++ firmware pin definitions for PlatformIO / Arduino IDE</p>
          </div>
        </div>
        <button class="btn-close" title="Close" @click="emit('close')">✕</button>
      </header>

      <div class="code-container">
        <pre class="code-block font-mono"><code>{{ code }}</code></pre>
      </div>

      <footer class="modal-footer">
        <span class="footer-tip">
          💡 Drop this file into your firmware's <code>include/</code> directory and call <code>initHardwarePins()</code> in <code>setup()</code>.
        </span>
        <div class="footer-actions">
          <button class="btn btn-secondary" @click="handleDownload">
            💾 Download pinout.h
          </button>
          <button class="btn btn-primary" :class="{ 'btn-copied': isCopied }" @click="handleCopy">
            {{ isCopied ? '✓ Copied to Clipboard!' : '📋 Copy to Clipboard' }}
          </button>
        </div>
      </footer>
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
  max-width: 760px;
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
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-accent);
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

.code-container {
  flex: 1;
  overflow: auto;
  background-color: #08080c;
  padding: 1rem 1.25rem;
}

.code-block {
  font-size: 0.8rem;
  line-height: 1.5;
  color: #38bdf8;
  white-space: pre;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  background-color: var(--color-bg-elevated);
  border-top: 1px solid var(--color-border);
  gap: 1rem;
}

.footer-tip {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.footer-tip code {
  color: var(--color-accent);
  background-color: rgba(124, 111, 255, 0.1);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}

.footer-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn {
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background-color: var(--color-border);
}

.btn-primary {
  background-color: var(--color-accent);
  border: 1px solid var(--color-accent);
  color: #fff;
}

.btn-primary:hover {
  background-color: var(--color-accent-hover);
}

.btn-copied {
  background-color: var(--color-success) !important;
  border-color: var(--color-success) !important;
  color: #000 !important;
  font-weight: 600;
}
</style>
