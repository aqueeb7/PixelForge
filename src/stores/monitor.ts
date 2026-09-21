import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PacketLogEntry, SerialLogLine } from '../types/monitor'
import { sendSerialCommand, sendSerialRawHex } from '../services/platform'

export const useMonitorStore = defineStore('monitor', () => {
  const logs = ref<SerialLogLine[]>([])
  const packets = ref<PacketLogEntry[]>([])
  const filterQuery = ref<string>('')
  const filterType = ref<'ALL' | 'LOG' | 'BOOT' | 'PACKET'>('ALL')
  const autoScroll = ref<boolean>(true)
  const showTimestamps = ref<boolean>(true)
  const commandHistory = ref<string[]>([])
  const historyIndex = ref<number>(-1)
  const lineEnding = ref<'CRLF' | 'LF' | 'CR' | 'NONE'>('CRLF')
  const isHexMode = ref<boolean>(false)

  const MAX_LOGS = 2000
  const MAX_PACKETS = 500

  const filteredLogs = computed(() => {
    let result = logs.value

    if (filterType.value !== 'ALL') {
      const target = filterType.value.toLowerCase()
      result = result.filter((l) => l.type === target)
    }

    if (filterQuery.value.trim()) {
      const q = filterQuery.value.toLowerCase()
      result = result.filter((l) => l.text.toLowerCase().includes(q))
    }

    return result
  })

  function formatTimestamp(): string {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
  }

  function addLog(text: string, type: SerialLogLine['type'] = 'log') {
    const entry: SerialLogLine = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: formatTimestamp(),
      text,
      type,
    }
    logs.value.push(entry)
    if (logs.value.length > MAX_LOGS) {
      logs.value.shift()
    }
  }

  function addPacket(direction: 'TX' | 'RX', code: number, name: string, payloadLength: number, status: 'ok' | 'error' = 'ok', latencyMs?: number) {
    const entry: PacketLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: formatTimestamp(),
      direction,
      code,
      name,
      payloadLength,
      status,
      latencyMs,
    }
    packets.value.unshift(entry)
    if (packets.value.length > MAX_PACKETS) {
      packets.value.pop()
    }

    // Also mirror to log stream if packet logging
    addLog(`[PKT ${direction}] 0x${code.toString(16).toUpperCase().padStart(2, '0')} ${name} (${payloadLength}B)`, 'packet')
  }

  function clearLogs() {
    logs.value = []
  }

  function clearPackets() {
    packets.value = []
  }

  async function sendCommand(text: string) {
    if (!text) return
    try {
      if (isHexMode.value) {
        const count = await sendSerialRawHex(text)
        addLog(`[HEX TX] ${text} (${count} bytes sent)`, 'tx')
      } else {
        await sendSerialCommand(text, lineEnding.value)
        addLog(`> ${text}`, 'tx')
      }

      // Add to command history
      if (!commandHistory.value.includes(text)) {
        commandHistory.value.push(text)
        if (commandHistory.value.length > 50) commandHistory.value.shift()
      }
      historyIndex.value = -1
    } catch (e) {
      addLog(`[SEND ERROR] ${e}`, 'system')
    }
  }

  return {
    logs,
    packets,
    filterQuery,
    filterType,
    autoScroll,
    showTimestamps,
    commandHistory,
    historyIndex,
    lineEnding,
    isHexMode,
    filteredLogs,
    addLog,
    addPacket,
    clearLogs,
    clearPackets,
    sendCommand,
  }
})
