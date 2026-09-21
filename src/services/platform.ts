import type { AppInfo, DeviceInfo, SerialPortDescription } from '../types'

/**
 * Checks if running inside a Tauri desktop environment.
 */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined'
  )
}

/**
 * Gets the current runtime environment mode.
 */
export function getPlatformMode(): 'desktop' | 'web' {
  return isTauri() ? 'desktop' : 'web'
}

/**
 * Safely invokes a Tauri command if running inside Tauri desktop.
 * In web mode, returns fallback or throws an informative error if no fallback is provided.
 */
export async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  fallback?: T | (() => Promise<T> | T)
): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(cmd, args)
  }

  if (fallback !== undefined) {
    return typeof fallback === 'function' ? (fallback as () => Promise<T> | T)() : fallback
  }

  throw new Error(`Command "${cmd}" is only available in Desktop (Tauri) mode.`)
}

/**
 * Detects the client operating system when running in a web browser.
 */
function detectBrowserOS(): string {
  if (typeof navigator === 'undefined') return 'Browser'
  const userAgent = navigator.userAgent || ''
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/macintosh|mac os x/i.test(userAgent)) return 'macOS'
  if (/linux/i.test(userAgent)) return 'Linux'
  if (/android/i.test(userAgent)) return 'Android'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS'
  return 'Browser'
}

/**
 * Retrieves application info for both Desktop (via Tauri Rust) and Web (via browser detection).
 */
export async function getAppInfo(): Promise<AppInfo> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const info = await invoke<AppInfo>('get_app_info')
      return {
        ...info,
        mode: 'desktop',
      }
    } catch (e) {
      console.warn('Failed to retrieve desktop app info via Tauri invoke, falling back to web info:', e)
    }
  }

  const browserOs = detectBrowserOS()
  return {
    name: 'PixelForge',
    version: '0.1.0',
    platform: `Web (${browserOs})`,
    mode: 'web',
  }
}

// ==============================================================================
// Serial & Device Commands (Spec 002)
// ==============================================================================

export async function listSerialPorts(): Promise<SerialPortDescription[]> {
  return safeInvoke<SerialPortDescription[]>('list_serial_ports', undefined, () => [
    { port_name: 'DEMO-COM1', port_type: 'Virtual USB (Browser Mode)' },
  ])
}

export async function connectDevice(port: string, baudRate = 115200): Promise<DeviceInfo> {
  return safeInvoke<DeviceInfo>(
    'connect_device',
    { port, baudRate },
    () => ({
      protocol_version: 1,
      firmware_version: '0.1.0-web-demo',
      device_name: 'PixelForge-WebVirtual',
      display_width: 128,
      display_height: 64,
      color_depth: 1,
      display_controller: 'SH1106',
    })
  )
}

export async function disconnectDevice(): Promise<void> {
  return safeInvoke<void>('disconnect_device', undefined, () => {})
}

export async function pingDevice(): Promise<number> {
  return safeInvoke<number>('ping_device', undefined, () => 4)
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return safeInvoke<DeviceInfo>('get_device_info', undefined, () => ({
    protocol_version: 1,
    firmware_version: '0.1.0-web-demo',
    device_name: 'PixelForge-WebVirtual',
    display_width: 128,
    display_height: 64,
    color_depth: 1,
    display_controller: 'SH1106',
  }))
}

export async function clearDisplay(): Promise<void> {
  return safeInvoke<void>('clear_display', undefined, () => {})
}

export async function sendFrame(bitmapData: Uint8Array | number[]): Promise<void> {
  const data = Array.isArray(bitmapData) ? bitmapData : Array.from(bitmapData)
  return safeInvoke<void>('send_frame', { bitmapData: data }, () => {})
}

/**
 * Returns the deterministic 1024-byte canonical test pattern:
 * - 1px outer border
 * - 8x8 corner markers
 * - Center crosshairs (y=31, x=63)
 * - 4 diagnostic quadrants (checkerboard, horizontal stripes, vertical stripes, diagonal lines)
 */
export async function getTestPattern(): Promise<Uint8Array> {
  if (isTauri()) {
    try {
      const data = await safeInvoke<number[]>('get_test_pattern')
      return new Uint8Array(data)
    } catch {
      // Fallback to client generator if IPC fails
    }
  }

  // Client-side deterministic test pattern generator matching Rust exactly
  const buf = new Uint8Array(1024)
  const setPixel = (x: number, y: number, on: boolean) => {
    if (x < 0 || x >= 128 || y < 0 || y >= 64) return
    const byteIdx = y * 16 + Math.floor(x / 8)
    const bitMask = 0x80 >> (x % 8)
    if (on) buf[byteIdx] |= bitMask
    else buf[byteIdx] &= ~bitMask
  }

  // 1. Outer 1px border
  for (let x = 0; x < 128; x++) {
    setPixel(x, 0, true)
    setPixel(x, 63, true)
  }
  for (let y = 0; y < 64; y++) {
    setPixel(0, y, true)
    setPixel(127, y, true)
  }

  // 2. 8x8 corner markers
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      setPixel(x, y, true)
      setPixel(127 - x, y, true)
      setPixel(x, 63 - y, true)
      setPixel(127 - x, 63 - y, true)
    }
  }

  // 3. Center crosshairs
  for (let x = 0; x < 128; x++) setPixel(x, 31, true)
  for (let y = 0; y < 64; y++) setPixel(63, y, true)

  // 4. Quadrants
  for (let y = 8; y < 31; y++) {
    for (let x = 8; x < 63; x++) {
      if ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0) setPixel(x, y, true)
    }
    for (let x = 64; x < 120; x++) {
      if (y % 2 === 0) setPixel(x, y, true)
    }
  }

  for (let y = 32; y < 56; y++) {
    for (let x = 8; x < 63; x++) {
      if (x % 2 === 0) setPixel(x, y, true)
    }
    for (let x = 64; x < 120; x++) {
      if ((x + y) % 3 === 0) setPixel(x, y, true)
    }
  }

  return buf
}

// ==============================================================================
// Hardware Workspace & Board Profiles (Spec 004)
// ==============================================================================

import type { BoardProfile, HardwareConfig } from '../types/hardware'
import { DEFAULT_HARDWARE_CONFIG, STANDARD_BOARD_PROFILES } from './boardProfiles'

export async function getBoardProfiles(): Promise<BoardProfile[]> {
  return safeInvoke<BoardProfile[]>('get_board_profiles', undefined, () => STANDARD_BOARD_PROFILES)
}

export async function getHardwareConfig(): Promise<HardwareConfig> {
  return safeInvoke<HardwareConfig>('get_hardware_config', undefined, () => DEFAULT_HARDWARE_CONFIG)
}

export async function saveHardwareConfig(config: HardwareConfig): Promise<void> {
  return safeInvoke<void>('save_hardware_config', { config }, () => {
    // In browser mode, save to localStorage for persistence
    try {
      localStorage.setItem('pixelforge_hardware_config', JSON.stringify(config))
    } catch {
      // ignore
    }
  })
}

// ==============================================================================
// Device Diagnostics, Telemetry & Firmware Flasher (Spec 005)
// ==============================================================================

import type { ChipDossier, DeviceTelemetry } from '../types/monitor'

export async function getTelemetry(): Promise<DeviceTelemetry> {
  return safeInvoke<DeviceTelemetry>('get_telemetry', undefined, () => ({
    timestamp_ms: Date.now(),
    uptime_seconds: 42,
    free_heap: 245120,
    min_free_heap: 198400,
    total_heap: 327680,
    heap_usage_percent: 25.2,
    current_fps: 30.0,
    oled_contrast: 255,
    wifi_status: 'connected',
    frame_counter: 1260,
  }))
}

export async function restartDevice(hard = false): Promise<void> {
  return safeInvoke<void>('restart_device', { hard }, () => {
    console.log(`[Web Mode] Simulated device ${hard ? 'hard' : 'soft'} restart`)
  })
}

export async function sendSerialCommand(text: string, lineEnding = 'CRLF'): Promise<void> {
  return safeInvoke<void>('send_serial_command', { text, lineEnding }, () => {
    console.log(`[Web Mode] Sent serial command: ${text} (${lineEnding})`)
  })
}

export async function sendSerialRawHex(hexString: string): Promise<number> {
  return safeInvoke<number>('send_serial_raw_hex', { hexString }, () => {
    return hexString.replace(/\s+/g, '').length / 2
  })
}

export async function pollSerialEvents(): Promise<string[]> {
  return safeInvoke<string[]>('poll_serial_events', undefined, () => [])
}

export async function detectChipDossier(): Promise<ChipDossier> {
  return safeInvoke<ChipDossier>('detect_chip_dossier', undefined, () => ({
    chip_model: 'ESP32-D0WDQ6',
    revision: 'Rev 3.0',
    mac_address: '24:6F:28:3C:D2:18',
    flash_size_bytes: 4 * 1024 * 1024,
    flash_mode: 'DIO @ 40MHz',
    crystal_freq_mhz: 40,
    cpu_freq_mhz: 240,
    features: [
      'Wi-Fi 802.11 b/g/n',
      'Bluetooth 4.2 / BLE',
      'Dual Tensilica LX6 Cores',
      'Hardware Crypto (AES/SHA/RSA)',
    ],
  }))
}

export async function flashFirmware(
  port: string,
  fileBytes?: Uint8Array,
  offset = 0x10000,
  baudRate = 460800
): Promise<void> {
  return safeInvoke<void>(
    'flash_firmware',
    {
      port,
      fileBytes: fileBytes ? Array.from(fileBytes) : undefined,
      offset,
      baudRate,
    },
    async () => {
      // Simulate flashing delay in browser demo mode
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  )
}

export async function eraseDeviceFlash(port: string, baudRate = 115200): Promise<void> {
  return safeInvoke<void>('erase_device_flash', { port, baudRate }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  })
}

