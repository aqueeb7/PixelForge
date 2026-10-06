/**
 * Spec 006 — Video to 128×64 OLED Converter Store
 * Manages video ingestion, real-time preview, multi-algorithm dithering parameters,
 * timeline playback, live streaming to ESP32, and code export.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useDeviceStore } from './device'
import { VideoDecoderService } from '../services/videoDecoder'
import { CANONICAL_BYTE_LENGTH } from '../services/ditherEngine'
import {
  downloadBlob,
  downloadText,
  exportReelAsGif,
  generateCppHeader,
  generateRawBinaryReel,
  generateStandaloneArduinoSketch,
} from '../services/videoExporter'
import {
  uploadAndPlayReel as apiUploadAndPlayReel,
  stopDeviceReel as apiStopDeviceReel,
} from '../services/platform'
import type {
  ExtractedFrame,
  VideoProcessingSettings,
  VideoReel,
  VideoSourceMeta,
} from '../types/video'

export const useVideoStore = defineStore('video', () => {
  const decoder = new VideoDecoderService()
  const deviceStore = useDeviceStore()

  // Video Source & Metadata
  const videoMeta = ref<VideoSourceMeta | null>(null)
  const isVideoLoaded = ref<boolean>(false)
  const isLoadingFile = ref<boolean>(false)
  const errorMessage = ref<string | null>(null)

  // Processing Settings
  const settings = ref<VideoProcessingSettings>({
    targetFps: 15,
    ditherAlgorithm: 'atkinson',
    fitMode: 'cover',
    contrast: 20,
    brightness: 0,
    gamma: 1.0,
    blackPoint: 10,
    edgeBoost: 15,
    invert: false,
    panX: 0,
    panY: 0,
    rotation: 0,
    temporalSmoothing: false,
    trimStart: 0,
    trimEnd: 0,
    maxFrames: 450,
  })

  // Timeline & Playback State
  const currentFrameIndex = ref<number>(0)
  const isPlaying = ref<boolean>(false)
  const isLooping = ref<boolean>(true)
  const currentTimeSeconds = ref<number>(0)
  const playbackTimer = ref<number | null>(null)

  // Real-time Preview Buffers
  const currentPackedFrame = shallowRef<Uint8Array>(new Uint8Array(CANONICAL_BYTE_LENGTH))
  const currentSourceImageData = shallowRef<ImageData | null>(null)

  // Extracted Reel State
  const isExtracting = ref<boolean>(false)
  const extractionProgress = ref<{ current: number; total: number; percent: number }>({
    current: 0,
    total: 0,
    percent: 0,
  })
  const extractedFrames = shallowRef<ExtractedFrame[]>([])
  const activeReel = shallowRef<VideoReel | null>(null)

  // Live Hardware Streaming State
  const isStreamingToDevice = ref<boolean>(false)
  const isUploadingReel = ref<boolean>(false)
  const isReelPlayingOnDevice = ref<boolean>(false)
  const isStoppingReel = ref<boolean>(false)
  const uploadStatusMessage = ref<string | null>(null)

  // Total Frames Count Computed
  const totalFrames = computed<number>(() => {
    if (extractedFrames.value.length > 0) {
      return extractedFrames.value.length
    }
    if (!videoMeta.value) return 1
    const start = settings.value.trimStart || 0
    const end = settings.value.trimEnd || videoMeta.value.duration
    const duration = Math.max(0.1, end - start)
    return Math.min(settings.value.maxFrames, Math.max(1, Math.floor(duration * settings.value.targetFps)))
  })

  // ----------------------------------------------------------------------------
  // Video Ingestion
  // ----------------------------------------------------------------------------

  async function loadVideoFile(file: File | Blob) {
    isLoadingFile.value = true
    errorMessage.value = null
    pause()

    try {
      const meta = await decoder.loadVideo(file)
      videoMeta.value = meta
      isVideoLoaded.value = true

      // Initialize trim range
      settings.value.trimStart = 0
      settings.value.trimEnd = meta.duration
      currentFrameIndex.value = 0
      currentTimeSeconds.value = 0

      // Immediately seek to frame 0 and render preview
      await decoder.seekTo(0.001)
      await refreshCurrentFramePreview()

      // Automatically trigger fast extraction in background
      await extractReel()
    } catch (e: any) {
      errorMessage.value = `Failed to load video: ${e.message || e}`
      isVideoLoaded.value = false
    } finally {
      isLoadingFile.value = false
    }
  }

  // ----------------------------------------------------------------------------
  // Frame Extraction & Batch Dithering
  // ----------------------------------------------------------------------------

  async function extractReel() {
    if (!decoder.isLoaded || !videoMeta.value) return

    isExtracting.value = true
    extractionProgress.value = { current: 0, total: 1, percent: 0 }

    try {
      const frames = await decoder.extractAllFrames(settings.value, (p) => {
        extractionProgress.value = p
      })

      extractedFrames.value = frames

      // For GIFs, derive native FPS from the actual decoded frame data
      // so the ESP32 plays back at the same rate as the source animation
      const effectiveFps = decoder.isGifMode && frames.length > 1
        ? Math.round(frames.length / videoMeta.value.duration)
        : settings.value.targetFps

      // Build canonical VideoReel model
      const reel: VideoReel = {
        id: `reel_${Date.now()}`,
        name: videoMeta.value.filename.replace(/\.[^/.]+$/, ''),
        sourceFilename: videoMeta.value.filename,
        sourceDurationSeconds: videoMeta.value.duration,
        targetFps: Math.max(1, effectiveFps),
        frameCount: frames.length,
        width: 128,
        height: 64,
        settings: { ...settings.value },
        frames: frames.map((f) => f.packedFrame),
      }
      activeReel.value = reel

      // Sync active frame to current playhead
      if (frames[currentFrameIndex.value]) {
        const activeF = frames[currentFrameIndex.value]
        currentPackedFrame.value = activeF.packedFrame
        if (activeF.sourceImageData) {
          currentSourceImageData.value = activeF.sourceImageData
        }
        deviceStore.activeFrame = activeF.packedFrame
      }
    } catch (e: any) {
      errorMessage.value = `Extraction failed: ${e.message || e}`
    } finally {
      isExtracting.value = false
    }
  }

  // ----------------------------------------------------------------------------
  // Real-Time Frame Seeking & Preview
  // ----------------------------------------------------------------------------

  async function refreshCurrentFramePreview() {
    if (!decoder.isLoaded) return

    // If pre-extracted frames are available and matching current settings
    if (extractedFrames.value.length > 0 && extractedFrames.value[currentFrameIndex.value]) {
      const f = extractedFrames.value[currentFrameIndex.value]
      currentPackedFrame.value = f.packedFrame
      if (f.sourceImageData) {
        currentSourceImageData.value = f.sourceImageData
      }
      deviceStore.activeFrame = f.packedFrame
      return
    }

    try {
      const { packed, rawImageData } = await decoder.getProcessedFrameAtTime(
        currentTimeSeconds.value,
        settings.value
      )
      currentPackedFrame.value = packed
      currentSourceImageData.value = rawImageData
      deviceStore.activeFrame = packed
    } catch (e) {
      console.warn('Real-time frame preview error:', e)
    }
  }

  // Throttled frame transmission for live hardware streaming
  let isSendingFrame = false
  async function streamFrameThrottled(frame: Uint8Array) {
    if (deviceStore.status !== 'connected') return
    if (isSendingFrame) return // Drop frame if previous is still transmitting over serial
    isSendingFrame = true
    try {
      await deviceStore.sendCurrentFrame(frame)
    } catch (e) {
      console.warn('Live stream transmission notice:', e)
    } finally {
      isSendingFrame = false
    }
  }

  async function seekToFrame(index: number) {
    const clampedIndex = Math.max(0, Math.min(totalFrames.value - 1, index))
    currentFrameIndex.value = clampedIndex

    const start = settings.value.trimStart || 0
    const interval = 1.0 / settings.value.targetFps
    currentTimeSeconds.value = start + clampedIndex * interval

    // Use pre-extracted frame if available for instant scrubbing
    if (extractedFrames.value.length > clampedIndex) {
      const f = extractedFrames.value[clampedIndex]
      currentPackedFrame.value = f.packedFrame
      if (f.sourceImageData) {
        currentSourceImageData.value = f.sourceImageData
      }
      deviceStore.activeFrame = f.packedFrame

      if (isStreamingToDevice.value) {
        streamFrameThrottled(currentPackedFrame.value)
      }
      return
    }

    await refreshCurrentFramePreview()
    if (isStreamingToDevice.value) {
      streamFrameThrottled(currentPackedFrame.value)
    }
  }

  async function seekToTime(seconds: number) {
    if (!videoMeta.value) return
    const start = settings.value.trimStart || 0
    const end = settings.value.trimEnd || videoMeta.value.duration
    const clamped = Math.max(start, Math.min(end, seconds))
    currentTimeSeconds.value = clamped

    const frameIdx = Math.floor((clamped - start) * settings.value.targetFps)
    currentFrameIndex.value = Math.max(0, Math.min(totalFrames.value - 1, frameIdx))

    await refreshCurrentFramePreview()
  }

  function stepFrame(delta: number) {
    pause()
    let next = currentFrameIndex.value + delta
    if (next < 0) {
      next = isLooping.value ? totalFrames.value - 1 : 0
    } else if (next >= totalFrames.value) {
      next = isLooping.value ? 0 : totalFrames.value - 1
    }
    seekToFrame(next)
  }

  // ----------------------------------------------------------------------------
  // Transport & Playback Loop
  // ----------------------------------------------------------------------------

  function play() {
    if (isPlaying.value || totalFrames.value <= 1) return
    isPlaying.value = true

    const intervalMs = Math.round(1000 / settings.value.targetFps)
    playbackTimer.value = window.setInterval(() => {
      let next = currentFrameIndex.value + 1
      if (next >= totalFrames.value) {
        if (isLooping.value) {
          next = 0
        } else {
          pause()
          return
        }
      }
      seekToFrame(next)
    }, intervalMs)
  }

  function pause() {
    isPlaying.value = false
    if (playbackTimer.value !== null) {
      clearInterval(playbackTimer.value)
      playbackTimer.value = null
    }
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  // ----------------------------------------------------------------------------
  // Live Streaming to ESP32 OLED
  // ----------------------------------------------------------------------------

  function toggleStreamingToDevice() {
    if (isStreamingToDevice.value) {
      stopStreamingToDevice()
    } else {
      startStreamingToDevice()
    }
  }

  function startStreamingToDevice() {
    isStreamingToDevice.value = true
    if (deviceStore.status !== 'connected') {
      errorMessage.value = 'Streaming to simulated OLED preview. (Connect ESP32 in Hardware tab for physical display)'
    } else {
      errorMessage.value = null
    }
    play()
  }

  function stopStreamingToDevice() {
    isStreamingToDevice.value = false
  }

  // ----------------------------------------------------------------------------
  // Exports & Canvas Hand-Off
  // ----------------------------------------------------------------------------

  function exportCppHeader() {
    if (!activeReel.value) {
      errorMessage.value = 'Please wait for frames to extract before exporting.'
      return
    }
    const code = generateCppHeader(activeReel.value)
    const filename = `${activeReel.value.name}_animation.h`
    downloadText(code, filename, 'text/x-c')
  }

  function exportBinaryReel() {
    if (!activeReel.value) {
      errorMessage.value = 'Please wait for frames to extract before exporting.'
      return
    }
    const bin = generateRawBinaryReel(activeReel.value)
    const blob = new Blob([bin as unknown as BlobPart], { type: 'application/octet-stream' })
    const filename = `${activeReel.value.name}_128x64.bin`
    downloadBlob(blob, filename)
  }

  function exportStandaloneArduinoSketch() {
    if (!activeReel.value) {
      errorMessage.value = 'Please wait for frames to extract before exporting.'
      return
    }
    const code = generateStandaloneArduinoSketch(activeReel.value)
    const filename = `${activeReel.value.name}_oled_player.ino`
    downloadText(code, filename, 'text/x-c')
  }

  async function copyStandaloneArduinoSketch(): Promise<boolean> {
    if (!activeReel.value) {
      errorMessage.value = 'Please wait for frames to extract before copying.'
      return false
    }
    const code = generateStandaloneArduinoSketch(activeReel.value)
    try {
      await navigator.clipboard.writeText(code)
      uploadStatusMessage.value = '✓ Standalone Arduino Sketch (.ino) copied to clipboard!'
      setTimeout(() => {
        if (uploadStatusMessage.value?.startsWith('✓ Standalone')) {
          uploadStatusMessage.value = null
        }
      }, 4000)
      return true
    } catch {
      errorMessage.value = 'Failed to copy to clipboard.'
      return false
    }
  }

  function exportAnimatedGif() {
    if (!activeReel.value) {
      errorMessage.value = 'Please wait for frames to extract before exporting.'
      return
    }
    exportReelAsGif(activeReel.value)
    uploadStatusMessage.value = '✓ Exported 128×64 Animated GIF (.gif)!'
    setTimeout(() => {
      if (uploadStatusMessage.value?.startsWith('✓ Exported')) {
        uploadStatusMessage.value = null
      }
    }, 4000)
  }

  async function uploadAndPlayOnDevice() {
    if (!activeReel.value || activeReel.value.frames.length === 0) {
      errorMessage.value = 'Please wait for frames to extract before uploading.'
      return
    }

    if (deviceStore.status !== 'connected') {
      errorMessage.value = 'Please connect an ESP32 in the Hardware tab first.'
      return
    }

    pause()
    isUploadingReel.value = true
    uploadStatusMessage.value = `Uploading ${activeReel.value.frames.length} frames to ESP32...`
    errorMessage.value = null

    try {
      await apiUploadAndPlayReel(activeReel.value.frames, settings.value.targetFps)
      isReelPlayingOnDevice.value = true
      uploadStatusMessage.value = `✓ Reel uploaded! Running on repeat at ${settings.value.targetFps} FPS directly on OLED.`
    } catch (e: any) {
      const msg = e.message || String(e)
      if (msg.includes('Unsupported command') || msg.includes('Device failed to start reel upload')) {
        errorMessage.value = 'ESP32 firmware update required: Your device is running earlier firmware without on-device reel storage. Please reflash firmware/src/main.cpp, or click "Export Reel" -> "Copy Standalone Arduino Sketch" to upload via Arduino IDE without desktop serial!'
      } else {
        errorMessage.value = `Failed to upload reel to ESP32: ${msg}`
      }
      uploadStatusMessage.value = null
    } finally {
      isUploadingReel.value = false
    }
  }

  async function stopDeviceReelPlayback() {
    if (isStoppingReel.value) return
    isStoppingReel.value = true
    try {
      await apiStopDeviceReel()
      isReelPlayingOnDevice.value = false
      uploadStatusMessage.value = '⏹ OLED loop playback stopped.'
      setTimeout(() => {
        if (uploadStatusMessage.value?.startsWith('⏹')) {
          uploadStatusMessage.value = null
        }
      }, 3000)
    } catch (e: any) {
      console.warn('Stop reel warning:', e)
    } finally {
      isStoppingReel.value = false
    }
  }

  function sendCurrentFrameToDraw() {
    if (!currentPackedFrame.value) return
    // Clone 1024-byte framebuffer into deviceStore.activeFrame
    const copy = new Uint8Array(currentPackedFrame.value)
    deviceStore.activeFrame = copy
  }

  // Debounced auto-re-extraction when dithering sliders change
  let reExtractDebounce: number | null = null
  watch(
    () => [
      settings.value.ditherAlgorithm,
      settings.value.contrast,
      settings.value.brightness,
      settings.value.gamma,
      settings.value.blackPoint,
      settings.value.edgeBoost,
      settings.value.invert,
      settings.value.fitMode,
      settings.value.panX,
      settings.value.panY,
      settings.value.rotation,
      settings.value.targetFps,
      settings.value.maxFrames,
    ],
    () => {
      // 1. Immediately update current preview frame
      refreshCurrentFramePreview()

      // 2. Debounce full extraction by 350ms
      if (reExtractDebounce) clearTimeout(reExtractDebounce)
      reExtractDebounce = window.setTimeout(() => {
        if (isVideoLoaded.value) {
          extractReel()
        }
      }, 350)
    }
  )

  return {
    // State
    videoMeta,
    isVideoLoaded,
    isLoadingFile,
    errorMessage,
    settings,
    currentFrameIndex,
    currentTimeSeconds,
    totalFrames,
    isPlaying,
    isLooping,
    isExtracting,
    extractionProgress,
    extractedFrames,
    activeReel,
    currentPackedFrame,
    currentSourceImageData,
    isStreamingToDevice,
    isUploadingReel,
    isReelPlayingOnDevice,
    isStoppingReel,
    uploadStatusMessage,

    // Actions
    loadVideoFile,
    extractReel,
    seekToFrame,
    seekToTime,
    stepFrame,
    play,
    pause,
    togglePlay,
    toggleStreamingToDevice,
    startStreamingToDevice,
    stopStreamingToDevice,
    uploadAndPlayOnDevice,
    stopDeviceReelPlayback,
    exportCppHeader,
    exportBinaryReel,
    exportStandaloneArduinoSketch,
    copyStandaloneArduinoSketch,
    exportAnimatedGif,
    sendCurrentFrameToDraw,
    refreshCurrentFramePreview,
  }
})
