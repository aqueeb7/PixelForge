<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  resolvePreset,
  MODE_FRAMES,
  scaleCounts,
  scaleRadii,
} from 'thinking-orbs'
import { paintFrame } from 'thinking-orbs/engine'

export type OrbState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping'

export type OrbSize = 64 | 32 | 20 | number

export interface ThinkingOrbProps {
  state?: OrbState
  size?: OrbSize
  speed?: number
  dark?: boolean
  paused?: boolean
  color?: string
  dots?: number
  dotSize?: number
  ariaLabel?: string
}

const props = withDefaults(defineProps<ThinkingOrbProps>(), {
  state: 'working',
  size: 64,
  speed: 1,
  dark: true,
  paused: false,
  dots: 1,
  dotSize: 1,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
let raf = 0
let running = false
let observer: IntersectionObserver | null = null

function parseTint(color?: string) {
  if (!color) return undefined
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    const n = parseInt(h, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const fn = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (fn) return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) }
  return undefined
}

const LABELS: Record<OrbState, string> = {
  working: 'Working…',
  searching: 'Searching…',
  solving: 'Solving…',
  listening: 'Listening…',
  connecting: 'Connecting…',
  weaving: 'Weaving…',
  composing: 'Composing…',
  breathing: 'Thinking…',
  shaping: 'Shaping…',
}

function startAnimation() {
  stopAnimation()
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const sizeNum = Number(props.size) || 64
  canvas.width = Math.round(sizeNum * dpr)
  canvas.height = Math.round(sizeNum * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { mode, speed: baseSpeed, opts: presetOpts } = resolvePreset(props.state, sizeNum as any)
  let opts = props.dots !== 1 ? scaleCounts(presetOpts, Math.max(0.1, props.dots)) : presetOpts
  if (props.dotSize !== 1) opts = scaleRadii(opts, Math.max(0.1, props.dotSize))

  const frameFn = MODE_FRAMES[mode]
  const tint = parseTint(props.color)
  const effSpeed = baseSpeed * props.speed

  const render = (tSec: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, sizeNum, sizeNum)
    paintFrame(ctx, frameFn(sizeNum, tSec, opts), props.dark, tint)
  }

  // Draw initial frame immediately
  render((performance.now() / 1000) * effSpeed)

  if (props.paused) return

  const loop = () => {
    render((performance.now() / 1000) * effSpeed)
    if (running) {
      raf = requestAnimationFrame(loop)
    }
  }

  running = true
  raf = requestAnimationFrame(loop)
}

function stopAnimation() {
  running = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    stopAnimation()
  } else if (!props.paused) {
    startAnimation()
  }
}

onMounted(() => {
  startAnimation()

  if (typeof IntersectionObserver !== 'undefined' && canvasRef.value) {
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && document.visibilityState !== 'hidden') {
        if (!running && !props.paused) startAnimation()
      } else {
        stopAnimation()
      }
    })
    observer.observe(canvasRef.value)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  stopAnimation()
  if (observer) {
    observer.disconnect()
    observer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

watch(
  () => [
    props.state,
    props.size,
    props.speed,
    props.dark,
    props.paused,
    props.color,
    props.dots,
    props.dotSize,
  ],
  () => {
    startAnimation()
  }
)
</script>

<template>
  <canvas
    ref="canvasRef"
    role="img"
    :aria-label="ariaLabel || LABELS[state]"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      display: 'inline-block',
      verticalAlign: 'middle',
    }"
  />
</template>
