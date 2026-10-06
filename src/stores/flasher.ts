import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FlashState } from '../types/monitor'
import { eraseDeviceFlash, flashFirmware, flashPixelforgeFirmware } from '../services/platform'
import { useDeviceStore } from './device'

/**
 * Spec 007 — Finite State Machine for ESP32 Firmware Flashing
 * Strictly isolates serial port teardown, cooldown, and ROM bootloader sync.
 */
export type FlashFsmState =
  | 'Idle'
  | 'Preflight'
  | 'HaltingTelemetry'
  | 'ReleasingPort'
  | 'PortCooldown'
  | 'EnteringBootloader'
  | 'Erasing'
  | 'Writing'
  | 'Verifying'
  | 'Resetting'
  | 'AutoReconnect'
  | 'Complete'
  | 'Error';

export const useFlasherStore = defineStore('flasher', () => {
  const fsmState = ref<FlashFsmState>('Idle')

  const flashState = ref<FlashState>({
    status: 'idle',
    progress: 0,
    stage: 'Ready to flash',
    speedKbs: 0,
    bytesWritten: 0,
    bytesTotal: 0,
  })

  const targetOffset = ref<number>(0x10000)
  const selectedBaud = ref<number>(460800)
  const customFileName = ref<string>('')
  const customFileBytes = ref<Uint8Array | null>(null)

  function resetState() {
    fsmState.value = 'Idle'
    flashState.value = {
      status: 'idle',
      progress: 0,
      stage: 'Ready to flash',
      speedKbs: 0,
      bytesWritten: 0,
      bytesTotal: 0,
      errorMessage: undefined,
    }
  }

  async function loadCustomFile(file: File) {
    customFileName.value = file.name
    const arrayBuf = await file.arrayBuffer()
    customFileBytes.value = new Uint8Array(arrayBuf)
  }

  function clearCustomFile() {
    customFileName.value = ''
    customFileBytes.value = null
  }

  async function flashOfficial(port: string) {
    if (!port) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please select a COM port first'
      return
    }

    const deviceStore = useDeviceStore()
    const wasConnected = deviceStore.status === 'connected'

    fsmState.value = 'Preflight'

    if (wasConnected) {
      fsmState.value = 'HaltingTelemetry'
      flashState.value = {
        status: 'connecting',
        progress: 1,
        stage: 'Halting telemetry and releasing active port...',
        speedKbs: 0,
        bytesWritten: 0,
        bytesTotal: 300832,
      }

      fsmState.value = 'ReleasingPort'
      await deviceStore.disconnect()

      fsmState.value = 'PortCooldown'
      await new Promise((r) => setTimeout(r, 600))
    }

    fsmState.value = 'EnteringBootloader'
    flashState.value = {
      status: 'connecting',
      progress: 2,
      stage: 'Connecting to ESP32 ROM bootloader...',
      speedKbs: 0,
      bytesWritten: 0,
      bytesTotal: 300832,
    }

    try {
      await flashPixelforgeFirmware(port, (p) => {
        flashState.value.progress = p.percent
        flashState.value.stage = p.stage

        if (p.percent > 0 && p.percent <= 10) {
          fsmState.value = 'Erasing'
          flashState.value.status = 'erasing'
        } else if (p.percent > 10 && p.percent < 95) {
          fsmState.value = 'Writing'
          flashState.value.status = 'writing'
        } else if (p.percent >= 95 && p.percent < 100) {
          fsmState.value = 'Verifying'
          flashState.value.status = 'verifying'
        }
      })

      fsmState.value = 'Resetting'
      flashState.value.stage = 'Resetting ESP32 controller...'

      if (wasConnected) {
        fsmState.value = 'AutoReconnect'
        flashState.value.stage = 'Auto-reconnecting serial communication...'
        setTimeout(async () => {
          await deviceStore.connect(port)
          fsmState.value = 'Complete'
        }, 2000)
      } else {
        fsmState.value = 'Complete'
      }

      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = '✅ Official firmware flashed & verified successfully!'
    } catch (e) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = String(e)
    }
  }

  async function flashCustom(port: string) {
    if (!port) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please select a COM port first'
      return
    }
    if (!customFileBytes.value) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please choose a .bin file to flash'
      return
    }

    const deviceStore = useDeviceStore()
    const wasConnected = deviceStore.status === 'connected'

    fsmState.value = 'Preflight'

    if (wasConnected) {
      fsmState.value = 'ReleasingPort'
      await deviceStore.disconnect()
      fsmState.value = 'PortCooldown'
      await new Promise((r) => setTimeout(r, 600))
    }

    fsmState.value = 'EnteringBootloader'
    flashState.value = {
      status: 'connecting',
      progress: 5,
      stage: 'Initiating auto-reset...',
      speedKbs: 0,
      bytesWritten: 0,
      bytesTotal: customFileBytes.value.length,
    }

    try {
      fsmState.value = 'Writing'
      flashState.value.status = 'writing'
      flashState.value.stage = `Writing to 0x${targetOffset.value.toString(16).toUpperCase()}...`
      flashState.value.progress = 40

      await flashFirmware(port, customFileBytes.value, targetOffset.value, selectedBaud.value)

      if (wasConnected) {
        fsmState.value = 'AutoReconnect'
        setTimeout(async () => {
          await deviceStore.connect(port)
          fsmState.value = 'Complete'
        }, 2000)
      } else {
        fsmState.value = 'Complete'
      }

      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = 'Custom image flashed successfully!'
    } catch (e) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = String(e)
    }
  }

  async function erase(port: string) {
    if (!port) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please select a COM port first'
      return
    }

    const deviceStore = useDeviceStore()
    const wasConnected = deviceStore.status === 'connected'
    if (wasConnected) {
      fsmState.value = 'ReleasingPort'
      await deviceStore.disconnect()
      fsmState.value = 'PortCooldown'
      await new Promise((r) => setTimeout(r, 600))
    }

    fsmState.value = 'Erasing'
    flashState.value = {
      status: 'erasing',
      progress: 20,
      stage: 'Erasing flash memory...',
      speedKbs: 0,
      bytesWritten: 0,
      bytesTotal: 0,
    }

    try {
      await eraseDeviceFlash(port, selectedBaud.value)
      fsmState.value = 'Complete'
      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = 'Flash memory completely erased'
    } catch (e) {
      fsmState.value = 'Error'
      flashState.value.status = 'error'
      flashState.value.errorMessage = String(e)
    }
  }

  return {
    fsmState,
    flashState,
    targetOffset,
    selectedBaud,
    customFileName,
    customFileBytes,
    resetState,
    loadCustomFile,
    clearCustomFile,
    flashOfficial,
    flashCustom,
    erase,
  }
})
