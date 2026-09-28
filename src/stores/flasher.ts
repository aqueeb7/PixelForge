import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FlashState } from '../types/monitor'
import { eraseDeviceFlash, flashFirmware, flashPixelforgeFirmware } from '../services/platform'
import { useDeviceStore } from './device'

export const useFlasherStore = defineStore('flasher', () => {
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
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please select a COM port first'
      return
    }

    const deviceStore = useDeviceStore()
    const wasConnected = deviceStore.status === 'connected'

    if (wasConnected) {
      flashState.value = {
        status: 'connecting',
        progress: 1,
        stage: 'Releasing active serial connection for flashing...',
        speedKbs: 0,
        bytesWritten: 0,
        bytesTotal: 300832,
      }
      await deviceStore.disconnect()
      await new Promise((r) => setTimeout(r, 600))
    }

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
        if (p.percent > 10 && p.percent < 95) {
          flashState.value.status = 'writing'
        } else if (p.percent >= 95 && p.percent < 100) {
          flashState.value.status = 'verifying'
        }
      })

      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = '✅ Official firmware flashed & verified successfully!'

      if (wasConnected) {
        setTimeout(async () => {
          await deviceStore.connect(port)
        }, 2000)
      }
    } catch (e) {
      flashState.value.status = 'error'
      flashState.value.errorMessage = String(e)
    }
  }

  async function flashCustom(port: string) {
    if (!port) {
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please select a COM port first'
      return
    }
    if (!customFileBytes.value) {
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please choose a .bin file to flash'
      return
    }

    const deviceStore = useDeviceStore()
    const wasConnected = deviceStore.status === 'connected'
    if (wasConnected) {
      await deviceStore.disconnect()
      await new Promise((r) => setTimeout(r, 600))
    }

    flashState.value = {
      status: 'connecting',
      progress: 5,
      stage: 'Initiating auto-reset...',
      speedKbs: 0,
      bytesWritten: 0,
      bytesTotal: customFileBytes.value.length,
    }

    try {
      flashState.value.status = 'writing'
      flashState.value.stage = `Writing to 0x${targetOffset.value.toString(16).toUpperCase()}...`
      flashState.value.progress = 40

      await flashFirmware(port, customFileBytes.value, targetOffset.value, selectedBaud.value)

      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = 'Custom image flashed successfully!'

      if (wasConnected) {
        setTimeout(async () => {
          await deviceStore.connect(port)
        }, 2000)
      }
    } catch (e) {
      flashState.value.status = 'error'
      flashState.value.errorMessage = String(e)
    }
  }

  async function erase(port: string) {
    if (!port) {
      flashState.value.status = 'error'
      flashState.value.errorMessage = 'Please select a COM port first'
      return
    }

    const deviceStore = useDeviceStore()
    const wasConnected = deviceStore.status === 'connected'
    if (wasConnected) {
      await deviceStore.disconnect()
      await new Promise((r) => setTimeout(r, 600))
    }

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
      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = 'Flash memory completely erased'
    } catch (e) {
      flashState.value.status = 'error'
      flashState.value.errorMessage = String(e)
    }
  }

  return {
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
