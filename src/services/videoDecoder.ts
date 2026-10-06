/**
 * Spec 006 — Local-First HTML5 Video Decoder & Frame Resampler
 * Extracts frames at exact target FPS with spatial framing (Cover / Contain / Stretch),
 * pan offset, rotation, and duration trimming. Zero external dependencies.
 */

import type { ExtractedFrame, VideoProcessingSettings, VideoSourceMeta } from '../types/video'
import { CANVAS_HEIGHT, CANVAS_WIDTH, processFrame } from './ditherEngine'

export class VideoDecoderService {
  private videoEl: HTMLVideoElement | null = null
  private offscreenCanvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private objectUrl: string | null = null

  // GIF decoding state
  public get isGifMode(): boolean { return this._isGifMode }
  private _isGifMode: boolean = false
  private gifFrames: { canvas: HTMLCanvasElement; duration: number; timestamp: number }[] = []
  private currentGifFrameIndex: number = 0
  private gifWidth: number = 128
  private gifHeight: number = 64
  private gifTotalDuration: number = 1.0

  constructor() {
    this.offscreenCanvas = document.createElement('canvas')
    this.offscreenCanvas.width = CANVAS_WIDTH
    this.offscreenCanvas.height = CANVAS_HEIGHT
    const ctx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Failed to create offscreen 2D canvas context')
    this.ctx = ctx
  }

  /**
   * Loads a video file (MP4, WebM, MOV) or animated GIF into the decoder element
   * and extracts metadata.
   */
  public async loadVideo(file: File | Blob): Promise<VideoSourceMeta> {
    this.cleanup()

    const filename = (file as File).name || 'imported_media'
    const isGif = file.type === 'image/gif' || filename.toLowerCase().endsWith('.gif')

    if (isGif) {
      return this.loadGif(file, filename)
    }

    return this.loadHtmlVideo(file, filename)
  }

  /**
   * Decodes an animated or static GIF using the browser WebCodecs ImageDecoder API
   * with fallback to standard Image element.
   */
  private async loadGif(file: File | Blob, filename: string): Promise<VideoSourceMeta> {
    this._isGifMode = true
    this.gifFrames = []

    try {
      if (typeof (window as any).ImageDecoder !== 'undefined') {
        const buffer = await file.arrayBuffer()
        const decoder = new (window as any).ImageDecoder({
          data: buffer,
          type: 'image/gif',
        })

        await decoder.tracks.ready
        const track = decoder.tracks.selectedTrack
        const frameCount = track ? track.frameCount : 1

        let totalDuration = 0
        let w = 128
        let h = 64

        for (let i = 0; i < frameCount; i++) {
          const result = await decoder.decode({ frameIndex: i })
          const vFrame = result.image
          w = vFrame.displayWidth || 128
          h = vFrame.displayHeight || 64

          // vFrame.duration is in microseconds
          const frameDurSec = (vFrame.duration && vFrame.duration > 0)
            ? vFrame.duration / 1_000_000
            : 0.1

          const frameCanvas = document.createElement('canvas')
          frameCanvas.width = w
          frameCanvas.height = h
          const fCtx = frameCanvas.getContext('2d', { willReadFrequently: true })
          if (fCtx) {
            fCtx.drawImage(vFrame, 0, 0)
          }

          this.gifFrames.push({
            canvas: frameCanvas,
            duration: frameDurSec,
            timestamp: totalDuration,
          })

          totalDuration += frameDurSec
          vFrame.close()
        }

        this.gifWidth = w
        this.gifHeight = h
        this.gifTotalDuration = Math.max(0.1, totalDuration)
        this.currentGifFrameIndex = 0

        return {
          filename,
          filesize: file.size,
          duration: this.gifTotalDuration,
          videoWidth: this.gifWidth,
          videoHeight: this.gifHeight,
          aspectRatio: this.gifWidth / this.gifHeight,
        }
      }
    } catch (e) {
      console.warn('ImageDecoder failed, attempting static Image fallback:', e)
    }

    // Fallback for static GIF / Image loading
    return new Promise<VideoSourceMeta>((resolve, reject) => {
      this.objectUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth || 128
        const h = img.naturalHeight || 64
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const fCtx = canvas.getContext('2d', { willReadFrequently: true })
        if (fCtx) {
          fCtx.drawImage(img, 0, 0)
        }

        this.gifFrames = [{
          canvas,
          duration: 1.0,
          timestamp: 0,
        }]
        this.gifWidth = w
        this.gifHeight = h
        this.gifTotalDuration = 1.0
        this.currentGifFrameIndex = 0

        resolve({
          filename,
          filesize: file.size,
          duration: 1.0,
          videoWidth: w,
          videoHeight: h,
          aspectRatio: w / h,
        })
      }
      img.onerror = () => reject(new Error('Failed to decode GIF image'))
      img.src = this.objectUrl
    })
  }

  /**
   * Loads standard HTML5 video formats (MP4, WebM, MOV) via video element.
   */
  private async loadHtmlVideo(file: File | Blob, filename: string): Promise<VideoSourceMeta> {
    this._isGifMode = false
    this.objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = this.objectUrl

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady)
        video.removeEventListener('error', onError)
        resolve()
      }
      const onError = (_e: Event) => {
        video.removeEventListener('loadeddata', onReady)
        video.removeEventListener('error', onError)
        reject(new Error(`Failed to load video: ${video.error?.message || 'Unknown error'}`))
      }
      video.addEventListener('loadeddata', onReady)
      video.addEventListener('error', onError)
    })

    this.videoEl = video

    const filesize = file.size
    const duration = isFinite(video.duration) ? video.duration : 1.0
    const videoWidth = video.videoWidth || 128
    const videoHeight = video.videoHeight || 64
    const aspectRatio = videoWidth / videoHeight

    return {
      filename,
      filesize,
      duration,
      videoWidth,
      videoHeight,
      aspectRatio,
    }
  }

  /**
   * Seeks the media to an exact timestamp (seconds).
   * For GIFs, seeks instantly by selecting the corresponding frame.
   * For video, awaits the browser seeked event.
   */
  public async seekTo(timeSeconds: number): Promise<void> {
    if (this.isGifMode) {
      if (this.gifFrames.length === 0) return
      const clampedTime = Math.max(0, Math.min(this.gifTotalDuration, timeSeconds))
      let frameIdx = 0
      for (let i = 0; i < this.gifFrames.length; i++) {
        const f = this.gifFrames[i]
        if (clampedTime >= f.timestamp && clampedTime < f.timestamp + f.duration) {
          frameIdx = i
          break
        }
        if (clampedTime >= f.timestamp) {
          frameIdx = i
        }
      }
      this.currentGifFrameIndex = frameIdx
      return
    }

    if (!this.videoEl) throw new Error('No video loaded')

    const clampedTime = Math.max(0, Math.min(this.videoEl.duration, timeSeconds))

    return new Promise((resolve) => {
      let resolved = false
      const finish = () => {
        if (!resolved) {
          resolved = true
          this.videoEl?.removeEventListener('seeked', finish)
          resolve()
        }
      }

      this.videoEl?.addEventListener('seeked', finish, { once: true })
      // Safety timeout: if seeked event doesn't fire within 150ms, resolve anyway
      setTimeout(finish, 150)

      if (this.videoEl) {
        this.videoEl.currentTime = clampedTime
      }
    })
  }

  /**
   * Renders the current video or GIF frame into the 128x64 offscreen canvas
   * applying spatial fit mode (Cover, Contain, Stretch), pan offset, and rotation.
   */
  public renderCurrentVideoFrame(settings: VideoProcessingSettings): ImageData {
    const hasSource = this.isGifMode ? this.gifFrames.length > 0 : this.videoEl !== null
    if (!hasSource) throw new Error('No media loaded')

    const source: CanvasImageSource = this.isGifMode
      ? this.gifFrames[this.currentGifFrameIndex].canvas
      : this.videoEl!

    const vw = this.isGifMode ? this.gifWidth : (this.videoEl?.videoWidth || 128)
    const vh = this.isGifMode ? this.gifHeight : (this.videoEl?.videoHeight || 64)
    const tw = CANVAS_WIDTH
    const th = CANVAS_HEIGHT

    const ctx = this.ctx

    // Clear canvas to black
    ctx.save()
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, tw, th)

    // Apply rotation around center if configured
    if (settings.rotation !== 0) {
      ctx.translate(tw / 2, th / 2)
      ctx.rotate((settings.rotation * Math.PI) / 180)
      ctx.translate(-tw / 2, -th / 2)
    }

    if (settings.fitMode === 'stretch') {
      ctx.drawImage(source, 0, 0, tw, th)
    } else if (settings.fitMode === 'contain') {
      const scale = Math.min(tw / vw, th / vh)
      const dw = vw * scale
      const dh = vh * scale
      const dx = (tw - dw) / 2
      const dy = (th - dh) / 2
      ctx.drawImage(source, dx, dy, dw, dh)
    } else {
      // 'cover' mode with optional pan offset
      const scale = Math.max(tw / vw, th / vh)
      const dw = vw * scale
      const dh = vh * scale

      // Base center
      let dx = (tw - dw) / 2
      let dy = (th - dh) / 2

      // Apply pan offsets (-50% to +50%)
      if (settings.panX) {
        dx += (settings.panX / 100) * (dw - tw)
      }
      if (settings.panY) {
        dy += (settings.panY / 100) * (dh - th)
      }

      ctx.drawImage(source, dx, dy, dw, dh)
    }

    ctx.restore()

    return ctx.getImageData(0, 0, tw, th)
  }

  /**
   * Extracts a single frame at a specific timestamp, applies dither & bit-packing.
   */
  public async getProcessedFrameAtTime(
    timeSeconds: number,
    settings: VideoProcessingSettings
  ): Promise<{ packed: Uint8Array; rawImageData: ImageData }> {
    await this.seekTo(timeSeconds)
    const rawImageData = this.renderCurrentVideoFrame(settings)
    const { packed } = processFrame(rawImageData, settings)
    return { packed, rawImageData }
  }

  /**
   * Batch extracts all frames.
   * For GIFs: uses each native GIF frame exactly once (respects original frame count and durations).
   * For video: resamples at targetFps in the [trimStart, trimEnd] range.
   */
  public async extractAllFrames(
    settings: VideoProcessingSettings,
    onProgress?: (progress: { current: number; total: number; percent: number }) => void
  ): Promise<ExtractedFrame[]> {
    const hasSource = this.isGifMode ? this.gifFrames.length > 0 : this.videoEl !== null
    if (!hasSource) throw new Error('No media loaded')

    // GIF mode: iterate native frames directly — no resampling.
    // This guarantees every frame in the source GIF is decoded exactly once.
    if (this.isGifMode) {
      return this.extractGifNativeFrames(settings, onProgress)
    }

    // Video mode: resample at targetFps
    const totalMediaDuration = this.duration
    const start = Math.max(0, Math.min(settings.trimStart || 0, totalMediaDuration))
    const end = Math.max(start + 0.1, Math.min(settings.trimEnd || totalMediaDuration, totalMediaDuration))
    const spanDuration = end - start

    const fps = Math.max(1, Math.min(60, settings.targetFps || 15))
    const frameInterval = 1.0 / fps
    const rawTotalFrames = Math.max(1, Math.floor(spanDuration * fps))
    const totalFrames = Math.min(rawTotalFrames, settings.maxFrames || 450)

    const frames: ExtractedFrame[] = []

    for (let i = 0; i < totalFrames; i++) {
      const time = start + i * frameInterval
      await this.seekTo(time)

      const rawImageData = this.renderCurrentVideoFrame(settings)
      const { packed } = processFrame(rawImageData, settings)

      frames.push({
        index: i,
        timestamp: time,
        sourceImageData: rawImageData,
        packedFrame: packed,
      })

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalFrames,
          percent: Math.round(((i + 1) / totalFrames) * 100),
        })
      }
    }

    return frames
  }

  /**
   * Extracts each native GIF frame exactly once, preserving the source animation
   * frame count and timing rather than resampling at a fixed FPS.
   */
  private async extractGifNativeFrames(
    settings: VideoProcessingSettings,
    onProgress?: (progress: { current: number; total: number; percent: number }) => void
  ): Promise<ExtractedFrame[]> {
    const maxFrames = settings.maxFrames || 450
    const totalFrames = Math.min(this.gifFrames.length, maxFrames)
    const frames: ExtractedFrame[] = []

    for (let i = 0; i < totalFrames; i++) {
      this.currentGifFrameIndex = i
      const rawImageData = this.renderCurrentVideoFrame(settings)
      const { packed } = processFrame(rawImageData, settings)

      frames.push({
        index: i,
        timestamp: this.gifFrames[i].timestamp,
        sourceImageData: rawImageData,
        packedFrame: packed,
      })

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalFrames,
          percent: Math.round(((i + 1) / totalFrames) * 100),
        })
      }

      // Yield to event loop every 10 frames to keep UI responsive
      if (i % 10 === 9) {
        await new Promise<void>((r) => setTimeout(r, 0))
      }
    }

    return frames
  }

  public get duration(): number {
    return this.isGifMode
      ? this.gifTotalDuration
      : (this.videoEl ? this.videoEl.duration : 0)
  }

  public get isLoaded(): boolean {
    return this.isGifMode
      ? this.gifFrames.length > 0
      : (this.videoEl !== null)
  }

  public cleanup(): void {
    this._isGifMode = false
    this.gifFrames = []
    this.currentGifFrameIndex = 0

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    if (this.videoEl) {
      this.videoEl.src = ''
      this.videoEl.load()
      this.videoEl = null
    }
  }
}
