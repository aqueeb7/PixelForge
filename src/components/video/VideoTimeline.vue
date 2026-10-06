<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVideoStore } from '../../stores/video'
import { useDeviceStore } from '../../stores/device'

const router = useRouter()
const videoStore = useVideoStore()
const deviceStore = useDeviceStore()

const trackRef = ref<HTMLDivElement | null>(null)
const isDraggingScrub = ref<boolean>(false)

// Formatting seconds as MM:SS.SS
function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) return '00:00.0'
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1)
  return `${String(m).padStart(2, '0')}:${s.padStart(4, '0')}`
}

const progressPercent = computed(() => {
  if (videoStore.totalFrames <= 1) return 0
  return (videoStore.currentFrameIndex / (videoStore.totalFrames - 1)) * 100
})

// Timeline Scrubber Interactions
function onTrackMouseDown(e: MouseEvent) {
  if (!trackRef.value || !videoStore.isVideoLoaded) return
  isDraggingScrub.value = true
  videoStore.pause()
  seekFromMouse(e)
  window.addEventListener('mousemove', onTrackMouseMove)
  window.addEventListener('mouseup', onTrackMouseUp)
}

function onTrackMouseMove(e: MouseEvent) {
  if (!isDraggingScrub.value) return
  seekFromMouse(e)
}

function onTrackMouseUp() {
  isDraggingScrub.value = false
  window.removeEventListener('mousemove', onTrackMouseMove)
  window.removeEventListener('mouseup', onTrackMouseUp)
}

function seekFromMouse(e: MouseEvent) {
  if (!trackRef.value) return
  const rect = trackRef.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const targetFrame = Math.round(ratio * (videoStore.totalFrames - 1))
  videoStore.seekToFrame(targetFrame)
}

// Hand-off current frame to Draw Canvas
function sendToDraw() {
  videoStore.sendCurrentFrameToDraw()
  router.push('/draw')
}

// Keyboard shortcuts for Play/Pause and Step
function onKeyDown(e: KeyboardEvent) {
  // Ignore if user is typing in an input
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    return
  }

  if (e.code === 'Space') {
    e.preventDefault()
    videoStore.togglePlay()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    videoStore.stepFrame(-1)
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    videoStore.stepFrame(1)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  videoStore.pause()
  videoStore.stopStreamingToDevice?.()
})
</script>

<template>
  <footer class="video-timeline">
    <!-- Top Transport Bar -->
    <div class="transport-bar">
      <!-- Left: Playback Controls -->
      <div class="transport-group">
        <button
          class="btn-step"
          title="Previous Frame (Left Arrow)"
          :disabled="!videoStore.isVideoLoaded"
          @click="videoStore.stepFrame(-1)"
        >
          ⏮
        </button>

        <button
          class="btn-play"
          :class="{ playing: videoStore.isPlaying }"
          :title="videoStore.isPlaying ? 'Pause (Space)' : 'Play (Space)'"
          :disabled="!videoStore.isVideoLoaded"
          @click="videoStore.togglePlay"
        >
          {{ videoStore.isPlaying ? '⏸' : '▶' }}
        </button>

        <button
          class="btn-step"
          title="Next Frame (Right Arrow)"
          :disabled="!videoStore.isVideoLoaded"
          @click="videoStore.stepFrame(1)"
        >
          ⏭
        </button>

        <button
          class="btn-loop"
          :class="{ active: videoStore.isLooping }"
          title="Toggle Repeat Loop"
          @click="videoStore.isLooping = !videoStore.isLooping"
        >
          🔁
        </button>

        <!-- Time & Frame Badges -->
        <div class="time-display font-mono">
          <span class="curr-time">{{ formatTime(videoStore.currentTimeSeconds) }}</span>
          <span class="sep">/</span>
          <span class="total-time">{{ formatTime(videoStore.videoMeta?.duration || 0) }}</span>
        </div>

        <div class="frame-badge font-mono">
          Frame {{ videoStore.currentFrameIndex + 1 }} / {{ videoStore.totalFrames }}
        </div>

        <div class="output-duration-badge font-mono" title="Total animation loop duration on OLED display: Frames / FPS">
          ⏱ Output: {{ (videoStore.totalFrames / videoStore.settings.targetFps).toFixed(1) }}s
        </div>
      </div>

      <!-- Center: FPS Presets -->
      <div class="transport-group">
        <span class="fps-label font-mono">Target FPS:</span>
        <div class="fps-presets font-mono">
          <button
            v-for="fps in [5, 10, 15, 20, 30]"
            :key="fps"
            class="btn-fps"
            :class="{ active: videoStore.settings.targetFps === fps }"
            :title="`${fps} FPS ${fps === 5 ? '(Cinematic / Max video duration)' : fps === 10 ? '(Best for standard I2C)' : fps === 30 ? '(SPI high-speed)' : ''}`"
            @click="videoStore.settings.targetFps = fps"
          >
            {{ fps }}
          </button>
        </div>
      </div>

      <!-- Right: Handoff & Stream Actions -->
      <div class="transport-group">
        <!-- Autonomous Upload & Play to OLED (Repeat on Hardware) -->
        <button
          class="btn-upload-oled-timeline font-mono"
          :class="{
            'is-uploading': videoStore.isUploadingReel,
            'is-playing': videoStore.isReelPlayingOnDevice,
          }"
          :disabled="!videoStore.isVideoLoaded || videoStore.isExtracting || videoStore.isUploadingReel"
          title="Upload complete reel to ESP32 for infinite repeat at 30 FPS without serial lag"
          @click="videoStore.isReelPlayingOnDevice ? videoStore.stopDeviceReelPlayback() : videoStore.uploadAndPlayOnDevice()"
        >
          <span v-if="videoStore.isUploadingReel">⚡ Uploading…</span>
          <span v-else-if="videoStore.isReelPlayingOnDevice">⏹ Stop OLED Loop</span>
          <span v-else>⚡ Upload to OLED</span>
        </button>

        <!-- Live Stream to OLED Toggle -->
        <button
          class="btn-stream"
          :class="{
            streaming: videoStore.isStreamingToDevice,
            'is-connected': deviceStore.status === 'connected',
          }"
          :title="deviceStore.status === 'connected' ? 'Stream animation frames in real-time to OLED display' : 'Connect an ESP32 in Hardware tab first'"
          @click="videoStore.toggleStreamingToDevice"
        >
          <span class="stream-dot" />
          {{ videoStore.isStreamingToDevice ? 'Stop Stream' : 'Live OLED Stream' }}
        </button>

        <!-- Send Current Frame to Draw Canvas -->
        <button
          class="btn-draw-handoff"
          title="Send current 1024-byte frame to Draw Canvas for manual pixel touch-up"
          :disabled="!videoStore.isVideoLoaded"
          @click="sendToDraw"
        >
          ✏️ Edit in Draw
        </button>
      </div>
    </div>

    <!-- Bottom Interactive Scrub Track -->
    <div
      ref="trackRef"
      class="scrub-track"
      :class="{ disabled: !videoStore.isVideoLoaded }"
      @mousedown="onTrackMouseDown"
    >
      <!-- Track Background Filled Progress -->
      <div class="track-fill" :style="{ width: `${progressPercent}%` }" />

      <!-- Playhead Needle -->
      <div class="playhead" :style="{ left: `${progressPercent}%` }">
        <div class="playhead-handle" />
        <div class="playhead-line" />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.video-timeline {
  height: 80px;
  display: flex;
  flex-direction: column;
  background: #0D1117;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  user-select: none;
}

.transport-bar {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
}

.transport-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

/* Transport Buttons */
.btn-play {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0284C7;
  color: #FFFFFF;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
  transition: all 0.15s;
}

.btn-play:hover:not(:disabled) {
  background: #0369A1;
  transform: scale(1.05);
}

.btn-play:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-step, .btn-loop {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  color: #94A3B8;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.btn-step:hover:not(:disabled), .btn-loop:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #F8FAFC;
}

.btn-loop.active {
  background: rgba(56, 189, 248, 0.15);
  color: #38BDF8;
  border-color: rgba(56, 189, 248, 0.3);
}

.btn-step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Time & Frame Badges */
.time-display {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #94A3B8;
  background: rgba(0, 0, 0, 0.4);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.curr-time {
  color: #F8FAFC;
  font-weight: 600;
}

.sep {
  opacity: 0.4;
}

.frame-badge {
  font-size: 0.7rem;
  color: #38BDF8;
  background: rgba(56, 189, 248, 0.08);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.output-duration-badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: #10B981;
  background: rgba(16, 185, 129, 0.1);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

/* FPS Presets */
.fps-label {
  font-size: 0.68rem;
  color: #64748B;
}

.fps-presets {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  overflow: hidden;
}

.btn-fps {
  font-size: 0.68rem;
  padding: 0.2rem 0.45rem;
  background: transparent;
  color: #64748B;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-fps.active {
  background: #1E293B;
  color: #38BDF8;
  font-weight: 700;
}

/* Action Buttons */
.btn-upload-oled-timeline {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  background: linear-gradient(135deg, #10B981, #059669);
  color: #FFFFFF;
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
  transition: all 0.15s;
}

.btn-upload-oled-timeline:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.45);
}

.btn-upload-oled-timeline.is-playing {
  background: linear-gradient(135deg, #EF4444, #B91C1C);
  border-color: rgba(239, 68, 68, 0.4);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
}

.btn-upload-oled-timeline:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.btn-stream {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  color: #94A3B8;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-stream.is-connected {
  border-color: rgba(56, 189, 248, 0.3);
  color: #F8FAFC;
}

.btn-stream.streaming {
  background: rgba(16, 185, 129, 0.15);
  border-color: #10B981;
  color: #10B981;
}

.stream-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748B;
}

.btn-stream.is-connected .stream-dot {
  background: #38BDF8;
}

.btn-stream.streaming .stream-dot {
  background: #10B981;
  box-shadow: 0 0 8px #10B981;
  animation: pulse 1s infinite;
}

.btn-draw-handoff {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  background: rgba(56, 189, 248, 0.12);
  color: #38BDF8;
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-draw-handoff:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38BDF8;
}

.btn-draw-handoff:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Bottom Scrub Track */
.scrub-track {
  height: 22px;
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.scrub-track.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.track-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(90deg, rgba(2, 132, 199, 0.25), rgba(56, 189, 248, 0.45));
  pointer-events: none;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  pointer-events: none;
}

.playhead-handle {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 10px;
  background: #38BDF8;
  border-radius: 2px;
  box-shadow: 0 0 6px #38BDF8;
}

.playhead-line {
  position: absolute;
  top: 10px;
  left: 50%;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  background: #38BDF8;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
