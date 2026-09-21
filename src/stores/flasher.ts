import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FlashState } from '../types/monitor'
import { eraseDeviceFlash, flashFirmware } from '../services/platform'

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

    flashState.value = {
      status: 'connecting',
      progress: 5,
      stage: 'Resetting ESP32 into ROM bootloader...',
      speedKbs: 0,
      bytesWritten: 0,
      bytesTotal: 65536,
    }

    try {
      flashState.value.status = 'writing'
      flashState.value.stage = 'Flashing official PixelForge firmware...'
      flashState.value.progress = 30

      await flashFirmware(port, undefined, 0x10000, selectedBaud.value)

      flashState.value.status = 'done'
      flashState.value.progress = 100
      flashState.value.stage = 'Firmware flashed & verified successfully!'
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
