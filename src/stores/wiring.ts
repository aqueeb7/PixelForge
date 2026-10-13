/**
 * Wiring Studio Pinia Store (Spec 008)
 * Manages the visual breadboard canvas state, component placement, wire nets,
 * real-time electrical linting, presets, and sync with the hardware store.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useHardwareStore } from './hardware'
import { getComponentDefinition } from '../core/hardware/ComponentDefinition'
import {
  type PlottedComponent,
  type WireNet,
  type NetNode,
  type WiringProjectSchema,
  WIRE_COLOR_PALETTE,
  getRecommendedWireColor,
} from '../core/hardware/Netlist'
import { ElectricalLinter, type LintReport } from '../core/hardware/ElectricalLinter'
import { generatePinoutHeader } from '../services/pinoutGenerator'
import type { PeripheralDevice, HardwareConnection } from '../types/hardware'

export interface DrawingWireState {
  isDrawing: boolean
  startNode: NetNode | null
  startPos: { x: number; y: number } | null
  currentPos: { x: number; y: number } | null
  targetCandidate: NetNode | null
}

const STORAGE_KEY = 'pixelforge_wiring_project_v1'

export const useWiringStore = defineStore('wiring', () => {
  const hardwareStore = useHardwareStore()

  // Breadboard Placement Coordinates
  const boardPosition = ref<{ x: number; y: number }>({ x: 320, y: 160 })
  const components = ref<PlottedComponent[]>([])
  const nets = ref<WireNet[]>([])

  // Interactive UI State
  const selectedWireId = ref<string | null>(null)
  const selectedComponentId = ref<string | null>(null)
  const activeDrawer = ref<'component' | 'board' | null>(null)
  const inspectedComponentId = ref<string | null>(null)
  const drawingWire = ref<DrawingWireState>({
    isDrawing: false,
    startNode: null,
    startPos: null,
    currentPos: null,
    targetCandidate: null,
  })

  // Canvas Pan & Zoom State
  const zoom = ref<number>(1)
  const panOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 })

  // Active Board Profile from hardwareStore
  const activeBoard = computed(() => hardwareStore.activeBoard)

  // Real-Time Electrical Linter Report
  const lintReport = computed<LintReport>(() => {
    return ElectricalLinter.evaluate(activeBoard.value, components.value, nets.value)
  })

  // Load project from local storage or initialize default circuit
  function init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: WiringProjectSchema = JSON.parse(saved)
        if (parsed && Array.isArray(parsed.components) && Array.isArray(parsed.nets)) {
          boardPosition.value = parsed.boardPosition || { x: 320, y: 160 }
          components.value = parsed.components
          nets.value = parsed.nets
          return
        }
      }
    } catch (e) {
      console.warn('Failed to load wiring project from storage:', e)
    }

    // Default circuit: 0.96" OLED wired to I2C pins (D21, D22, 3V3, GND)
    applyPreset('oled_default')
  }

  // Persist whenever state changes
  function persist() {
    try {
      const data: WiringProjectSchema = {
        version: '1.0.0',
        boardProfileId: activeBoard.value.id,
        boardPosition: boardPosition.value,
        components: components.value,
        nets: nets.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save wiring project:', e)
    }
  }

  // --- Component Management ---

  function addComponent(definitionId: string, position?: { x: number; y: number }): string {
    const def = getComponentDefinition(definitionId)
    if (!def) return ''

    const instanceId = `${def.id}-${Date.now().toString(36)}`
    const defaultPos = position || {
      x: boardPosition.value.x + 360,
      y: boardPosition.value.y + (components.value.length * 60) % 300,
    }

    const newComp: PlottedComponent = {
      instanceId,
      definitionId: def.id,
      name: def.name,
      position: defaultPos,
      i2cAddress: def.i2cAddress,
    }

    components.value.push(newComp)
    selectedComponentId.value = instanceId
    persist()
    syncToHardwareStore()
    return instanceId
  }

  function removeComponent(instanceId: string) {
    components.value = components.value.filter((c) => c.instanceId !== instanceId)
    // Remove all wires attached to this component
    nets.value = nets.value.filter(
      (net) => !net.nodes.some((node) => node.instanceId === instanceId)
    )
    if (selectedComponentId.value === instanceId) {
      selectedComponentId.value = null
    }
    if (inspectedComponentId.value === instanceId) {
      activeDrawer.value = null
      inspectedComponentId.value = null
    }
    persist()
    syncToHardwareStore()
  }

  function updateComponentPosition(instanceId: string, position: { x: number; y: number }) {
    const comp = components.value.find((c) => c.instanceId === instanceId)
    if (comp) {
      comp.position = position
      persist()
    }
  }

  function updateBoardPosition(position: { x: number; y: number }) {
    boardPosition.value = position
    persist()
  }

  function setComponentI2cAddress(instanceId: string, address: number) {
    const comp = components.value.find((c) => c.instanceId === instanceId)
    if (comp) {
      comp.i2cAddress = address
      persist()
      syncToHardwareStore()
    }
  }

  // --- Wire Net Management ---

  function startWireDrawing(node: NetNode, startPos: { x: number; y: number }) {
    drawingWire.value = {
      isDrawing: true,
      startNode: node,
      startPos,
      currentPos: { ...startPos },
      targetCandidate: null,
    }
  }

  function updateWireDrawing(pos: { x: number; y: number }, targetCandidate?: NetNode | null) {
    if (!drawingWire.value.isDrawing) return
    drawingWire.value.currentPos = pos
    drawingWire.value.targetCandidate = targetCandidate ?? null
  }

  function cancelWireDrawing() {
    drawingWire.value = {
      isDrawing: false,
      startNode: null,
      startPos: null,
      currentPos: null,
      targetCandidate: null,
    }
  }

  function connectNodes(nodeA: NetNode, nodeB: NetNode): boolean {
    if (nodeA.instanceId === nodeB.instanceId && nodeA.pinId === nodeB.pinId) {
      return false
    }

    // Check if wire between these two exact nodes already exists
    const exists = nets.value.some((net) => {
      const hasA = net.nodes.some((n) => n.instanceId === nodeA.instanceId && n.pinId === nodeA.pinId)
      const hasB = net.nodes.some((n) => n.instanceId === nodeB.instanceId && n.pinId === nodeB.pinId)
      return hasA && hasB
    })
    if (exists) return false

    // Standard wire color code
    const wireColor = getRecommendedWireColor(nodeA.pinId || nodeB.pinId)

    const netId = `net-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
    const netName = `NET_${nodeA.pinId}_${nodeB.pinId}`

    nets.value.push({
      id: netId,
      name: netName,
      color: wireColor,
      nodes: [nodeA, nodeB],
    })

    persist()
    syncToHardwareStore()
    return true
  }

  function finishWireDrawing(targetNode: NetNode): boolean {
    if (!drawingWire.value.isDrawing || !drawingWire.value.startNode) {
      cancelWireDrawing()
      return false
    }

    const source = drawingWire.value.startNode
    const success = connectNodes(source, targetNode)
    cancelWireDrawing()
    return success
  }

  function deleteWire(netId: string) {
    nets.value = nets.value.filter((n) => n.id !== netId)
    if (selectedWireId.value === netId) {
      selectedWireId.value = null
    }
    persist()
    syncToHardwareStore()
  }

  function selectWire(netId: string | null) {
    selectedWireId.value = netId
  }

  function selectComponent(instanceId: string | null) {
    selectedComponentId.value = instanceId
  }

  function openComponentDossier(instanceId: string) {
    inspectedComponentId.value = instanceId
    activeDrawer.value = 'component'
    selectedComponentId.value = instanceId
  }

  function openBoardDossier() {
    activeDrawer.value = 'board'
  }

  function closeDrawer() {
    activeDrawer.value = null
  }

  // --- Synchronization with Hardware Store ---

  /**
   * Sync breadboard peripherals & connections into hardwareStore
   * so other views (Rack, Dossier, Flasher) are immediately in sync!
   */
  function syncToHardwareStore() {
    const syncedPeripherals: PeripheralDevice[] = []
    const syncedConnections: HardwareConnection[] = []

    for (const comp of components.value) {
      const def = getComponentDefinition(comp.definitionId)
      if (!def) continue

      // Find all board pins connected to this component's pins
      const pinMap: Record<string, string> = {}
      for (const p of def.pins) {
        const net = nets.value.find((n) =>
          n.nodes.some((node) => node.instanceId === comp.instanceId && node.pinId === p.id)
        )
        if (net) {
          const boardNode = net.nodes.find((node) => node.instanceId === 'esp32')
          if (boardNode) {
            pinMap[p.id] = boardNode.pinId
          }
        }
      }

      let pType: PeripheralDevice['type'] = 'CUSTOM'
      if (def.category === 'Display') pType = 'OLED_128X64_I2C'
      else if (def.id === 'button-momentary') pType = 'PUSH_BUTTON'
      else if (def.id === 'rotary-encoder-ec11') pType = 'ROTARY_ENCODER'
      else if (def.id === 'neopixel-ring-8') pType = 'STATUS_LED'
      else if (def.category === 'Sensor' || def.id === 'potentiometer-10k') pType = 'ANALOG_SENSOR'

      syncedPeripherals.push({
        id: comp.instanceId,
        type: pType,
        name: comp.name,
        controller: def.category === 'Display' ? 'SSD1306' : undefined,
        i2c_address: comp.i2cAddress ? `0x${comp.i2cAddress.toString(16).toUpperCase()}` : undefined,
        pins: pinMap,
        status: 'configured',
      })
    }

    // Convert nets into HardwareConnections
    for (const net of nets.value) {
      const bNode = net.nodes.find((n) => n.instanceId === 'esp32')
      const pNode = net.nodes.find((n) => n.instanceId !== 'esp32')
      if (bNode && pNode) {
        syncedConnections.push({
          id: net.id,
          source: { componentId: pNode.instanceId, pinId: pNode.pinId },
          target: { componentId: 'esp32-mcu', pinId: bNode.pinId },
          signal: net.name,
        })
      }
    }

    hardwareStore.peripherals = syncedPeripherals
    hardwareStore.connections = syncedConnections
  }

  // --- Presets ---

  function applyPreset(presetKey: 'oled_default' | 'reel_station' | 'dual_oled' | 'space_shooter' | 'blank') {
    selectedWireId.value = null
    selectedComponentId.value = null

    if (presetKey === 'blank') {
      components.value = []
      nets.value = []
      boardPosition.value = { x: 300, y: 140 }
      persist()
      syncToHardwareStore()
      return
    }

    if (presetKey === 'oled_default') {
      boardPosition.value = { x: 260, y: 120 }
      const oledId = 'oled-default-1'
      components.value = [
        {
          instanceId: oledId,
          definitionId: 'oled-096-ssd1306',
          name: '0.96" Monochrome OLED',
          position: { x: 680, y: 150 },
          i2cAddress: 0x3c,
        },
      ]

      nets.value = [
        {
          id: 'net-oled-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: oledId, pinId: 'GND' }],
        },
        {
          id: 'net-oled-vcc',
          name: 'NET_3V3',
          color: WIRE_COLOR_PALETTE.POWER_3V3,
          nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: oledId, pinId: 'VCC' }],
        },
        {
          id: 'net-oled-scl',
          name: 'NET_I2C_SCL',
          color: WIRE_COLOR_PALETTE.I2C_SCL,
          nodes: [{ instanceId: 'esp32', pinId: 'D22' }, { instanceId: oledId, pinId: 'SCL' }],
        },
        {
          id: 'net-oled-sda',
          name: 'NET_I2C_SDA',
          color: WIRE_COLOR_PALETTE.I2C_SDA,
          nodes: [{ instanceId: 'esp32', pinId: 'D21' }, { instanceId: oledId, pinId: 'SDA' }],
        },
      ]
    } else if (presetKey === 'reel_station') {
      boardPosition.value = { x: 260, y: 120 }
      const oledId = 'oled-station-1'
      const encId = 'enc-station-1'

      components.value = [
        {
          instanceId: oledId,
          definitionId: 'oled-096-ssd1306',
          name: '128×64 Reel OLED',
          position: { x: 680, y: 100 },
          i2cAddress: 0x3c,
        },
        {
          instanceId: encId,
          definitionId: 'rotary-encoder-ec11',
          name: 'EC11 Scrub Dial',
          position: { x: 680, y: 340 },
        },
      ]

      nets.value = [
        // OLED lines
        {
          id: 'net-oled-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: oledId, pinId: 'GND' }],
        },
        {
          id: 'net-oled-vcc',
          name: 'NET_3V3',
          color: WIRE_COLOR_PALETTE.POWER_3V3,
          nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: oledId, pinId: 'VCC' }],
        },
        {
          id: 'net-oled-scl',
          name: 'NET_I2C_SCL',
          color: WIRE_COLOR_PALETTE.I2C_SCL,
          nodes: [{ instanceId: 'esp32', pinId: 'D22' }, { instanceId: oledId, pinId: 'SCL' }],
        },
        {
          id: 'net-oled-sda',
          name: 'NET_I2C_SDA',
          color: WIRE_COLOR_PALETTE.I2C_SDA,
          nodes: [{ instanceId: 'esp32', pinId: 'D21' }, { instanceId: oledId, pinId: 'SDA' }],
        },
        // Encoder lines
        {
          id: 'net-enc-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: encId, pinId: 'GND' }],
        },
        {
          id: 'net-enc-vcc',
          name: 'NET_3V3',
          color: WIRE_COLOR_PALETTE.POWER_3V3,
          nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: encId, pinId: 'VCC' }],
        },
        {
          id: 'net-enc-clk',
          name: 'NET_ENC_CLK',
          color: WIRE_COLOR_PALETTE.GPIO,
          nodes: [{ instanceId: 'esp32', pinId: 'D18' }, { instanceId: encId, pinId: 'CLK' }],
        },
        {
          id: 'net-enc-dt',
          name: 'NET_ENC_DT',
          color: WIRE_COLOR_PALETTE.GPIO,
          nodes: [{ instanceId: 'esp32', pinId: 'D19' }, { instanceId: encId, pinId: 'DT' }],
        },
        {
          id: 'net-enc-sw',
          name: 'NET_ENC_SW',
          color: WIRE_COLOR_PALETTE.GPIO,
          nodes: [{ instanceId: 'esp32', pinId: 'D5' }, { instanceId: encId, pinId: 'SW' }],
        },
      ]
    } else if (presetKey === 'dual_oled') {
      boardPosition.value = { x: 260, y: 120 }
      const oled1 = 'oled-hud-1'
      const oled2 = 'oled-hud-2'
      const btn = 'btn-step-1'

      components.value = [
        {
          instanceId: oled1,
          definitionId: 'oled-096-ssd1306',
          name: 'Primary 128×64 OLED',
          position: { x: 680, y: 80 },
          i2cAddress: 0x3c,
        },
        {
          instanceId: oled2,
          definitionId: 'oled-091-ssd1306',
          name: 'Secondary 128×32 HUD',
          position: { x: 680, y: 310 },
          i2cAddress: 0x3d, // Solder jumper set to 0x3D to prevent address collision!
        },
        {
          instanceId: btn,
          definitionId: 'button-momentary',
          name: 'Mode Select Button',
          position: { x: 680, y: 520 },
        },
      ]

      nets.value = [
        {
          id: 'net-oled1-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: oled1, pinId: 'GND' }],
        },
        {
          id: 'net-oled1-vcc',
          name: 'NET_3V3',
          color: WIRE_COLOR_PALETTE.POWER_3V3,
          nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: oled1, pinId: 'VCC' }],
        },
        {
          id: 'net-oled1-scl',
          name: 'NET_I2C_SCL',
          color: WIRE_COLOR_PALETTE.I2C_SCL,
          nodes: [{ instanceId: 'esp32', pinId: 'D22' }, { instanceId: oled1, pinId: 'SCL' }],
        },
        {
          id: 'net-oled1-sda',
          name: 'NET_I2C_SDA',
          color: WIRE_COLOR_PALETTE.I2C_SDA,
          nodes: [{ instanceId: 'esp32', pinId: 'D21' }, { instanceId: oled1, pinId: 'SDA' }],
        },
        // OLED 2 on same I2C bus with alternate address 0x3D
        {
          id: 'net-oled2-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: oled2, pinId: 'GND' }],
        },
        {
          id: 'net-oled2-vcc',
          name: 'NET_3V3',
          color: WIRE_COLOR_PALETTE.POWER_3V3,
          nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: oled2, pinId: 'VCC' }],
        },
        {
          id: 'net-oled2-scl',
          name: 'NET_I2C_SCL',
          color: WIRE_COLOR_PALETTE.I2C_SCL,
          nodes: [{ instanceId: 'esp32', pinId: 'D22' }, { instanceId: oled2, pinId: 'SCL' }],
        },
        {
          id: 'net-oled2-sda',
          name: 'NET_I2C_SDA',
          color: WIRE_COLOR_PALETTE.I2C_SDA,
          nodes: [{ instanceId: 'esp32', pinId: 'D21' }, { instanceId: oled2, pinId: 'SDA' }],
        },
        // Button
        {
          id: 'net-btn-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: btn, pinId: 'PIN_B' }],
        },
        {
          id: 'net-btn-sig',
          name: 'NET_BUTTON_SIG',
          color: WIRE_COLOR_PALETTE.GPIO,
          nodes: [{ instanceId: 'esp32', pinId: 'D4' }, { instanceId: btn, pinId: 'PIN_A' }],
        },
      ]
    } else if (presetKey === 'space_shooter') {
      boardPosition.value = { x: 260, y: 120 }
      const oledId = 'oled-space-1'
      const btnLeftId = 'btn-space-left'
      const btnFireId = 'btn-space-fire'

      components.value = [
        {
          instanceId: oledId,
          definitionId: 'oled-096-ssd1306',
          name: '128×64 Game OLED',
          position: { x: 680, y: 80 },
          i2cAddress: 0x3c,
        },
        {
          instanceId: btnLeftId,
          definitionId: 'button-momentary',
          name: 'Button 1 (Left / Move)',
          position: { x: 680, y: 310 },
        },
        {
          instanceId: btnFireId,
          definitionId: 'button-momentary',
          name: 'Button 2 (Fire / Right)',
          position: { x: 680, y: 490 },
        },
      ]

      nets.value = [
        // OLED Power & I2C
        {
          id: 'net-space-oled-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: oledId, pinId: 'GND' }],
        },
        {
          id: 'net-space-oled-vcc',
          name: 'NET_3V3',
          color: WIRE_COLOR_PALETTE.POWER_3V3,
          nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: oledId, pinId: 'VCC' }],
        },
        {
          id: 'net-space-oled-scl',
          name: 'NET_I2C_SCL',
          color: WIRE_COLOR_PALETTE.I2C_SCL,
          nodes: [{ instanceId: 'esp32', pinId: 'D22' }, { instanceId: oledId, pinId: 'SCL' }],
        },
        {
          id: 'net-space-oled-sda',
          name: 'NET_I2C_SDA',
          color: WIRE_COLOR_PALETTE.I2C_SDA,
          nodes: [{ instanceId: 'esp32', pinId: 'D21' }, { instanceId: oledId, pinId: 'SDA' }],
        },
        // Button 1 (Left / Move) on D18
        {
          id: 'net-space-btn1-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: btnLeftId, pinId: 'PIN_B' }],
        },
        {
          id: 'net-space-btn1-sig',
          name: 'NET_BTN_LEFT',
          color: WIRE_COLOR_PALETTE.GPIO,
          nodes: [{ instanceId: 'esp32', pinId: 'D18' }, { instanceId: btnLeftId, pinId: 'PIN_A' }],
        },
        // Button 2 (Fire / Right) on D19
        {
          id: 'net-space-btn2-gnd',
          name: 'NET_GND',
          color: WIRE_COLOR_PALETTE.GND,
          nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: btnFireId, pinId: 'PIN_B' }],
        },
        {
          id: 'net-space-btn2-sig',
          name: 'NET_BTN_FIRE',
          color: WIRE_COLOR_PALETTE.GPIO,
          nodes: [{ instanceId: 'esp32', pinId: 'D19' }, { instanceId: btnFireId, pinId: 'PIN_A' }],
        },
      ]
    }

    persist()
    syncToHardwareStore()
  }

  function getGeneratedHeaderCode(): string {
    return generatePinoutHeader(activeBoard.value, components.value, nets.value, {
      projectName: 'PixelForge Visual Netlist',
    })
  }

  return {
    boardPosition,
    components,
    nets,
    selectedWireId,
    selectedComponentId,
    drawingWire,
    zoom,
    panOffset,
    activeBoard,
    lintReport,
    init,
    persist,
    addComponent,
    removeComponent,
    updateComponentPosition,
    updateBoardPosition,
    setComponentI2cAddress,
    startWireDrawing,
    updateWireDrawing,
    cancelWireDrawing,
    finishWireDrawing,
    connectNodes,
    deleteWire,
    selectWire,
    selectComponent,
    activeDrawer,
    inspectedComponentId,
    openComponentDossier,
    openBoardDossier,
    closeDrawer,
    applyPreset,
    syncToHardwareStore,
    getGeneratedHeaderCode,
  }
})
