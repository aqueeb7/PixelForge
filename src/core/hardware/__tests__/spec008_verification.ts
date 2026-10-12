/**
 * Spec 008 Verification Suite
 * Deterministically tests Component Registry, Electrical Linter rules, and C++ Pinout Generator.
 */

import { ESP32_DEVKIT_V1_30P } from '../../../services/boardProfiles'
import { COMPONENT_REGISTRY, getComponentDefinition } from '../ComponentDefinition'
import { ElectricalLinter } from '../ElectricalLinter'
import { generatePinoutHeader } from '../../../services/pinoutGenerator'
import type { PlottedComponent, WireNet } from '../Netlist'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✓ ${message}`)
}

console.log('=== 1. COMPONENT REGISTRY TESTS ===')
assert(COMPONENT_REGISTRY.length >= 6, 'Component registry has at least 6 standard peripherals')
const oledDef = getComponentDefinition('oled-096-ssd1306')
assert(oledDef !== undefined, 'OLED 128x64 definition exists')
assert(oledDef?.pins.some((p) => p.id === 'SDA') === true, 'OLED has SDA pin')
assert(oledDef?.pins.some((p) => p.id === 'SCL') === true, 'OLED has SCL pin')
assert(oledDef?.i2cAddress === 0x3c, 'OLED default address is 0x3C')

console.log('\n=== 2. ELECTRICAL LINTER: VALID CIRCUIT TEST ===')
const validComponents: PlottedComponent[] = [
  {
    instanceId: 'oled-1',
    definitionId: 'oled-096-ssd1306',
    name: '0.96" OLED',
    position: { x: 500, y: 100 },
    i2cAddress: 0x3c,
  },
]
const validNets: WireNet[] = [
  { id: 'n1', name: 'GND', color: '#666', nodes: [{ instanceId: 'esp32', pinId: 'GND' }, { instanceId: 'oled-1', pinId: 'GND' }] },
  { id: 'n2', name: '3V3', color: '#f00', nodes: [{ instanceId: 'esp32', pinId: '3V3' }, { instanceId: 'oled-1', pinId: 'VCC' }] },
  { id: 'n3', name: 'SCL', color: '#ff0', nodes: [{ instanceId: 'esp32', pinId: 'D22' }, { instanceId: 'oled-1', pinId: 'SCL' }] },
  { id: 'n4', name: 'SDA', color: '#00f', nodes: [{ instanceId: 'esp32', pinId: 'D21' }, { instanceId: 'oled-1', pinId: 'SDA' }] },
]

const validReport = ElectricalLinter.evaluate(ESP32_DEVKIT_V1_30P, validComponents, validNets)
assert(validReport.isValid === true, 'Valid OLED circuit has isValid = true')
assert(validReport.hasErrors === false, 'Valid OLED circuit has 0 errors')
assert(validReport.totalCurrentMa === 22, 'Valid OLED circuit total current is 22 mA')

console.log('\n=== 3. ELECTRICAL LINTER: VOLTAGE VIOLATION TEST (RULE 1) ===')
const invalidVoltageNets: WireNet[] = [
  ...validNets.filter((n) => n.id !== 'n2'),
  // Connect 3.3V OLED to 5V (VIN) rail
  { id: 'n2-bad', name: '5V', color: '#f00', nodes: [{ instanceId: 'esp32', pinId: 'VIN' }, { instanceId: 'oled-1', pinId: 'VCC' }] },
]
const voltageReport = ElectricalLinter.evaluate(ESP32_DEVKIT_V1_30P, validComponents, invalidVoltageNets)
assert(voltageReport.hasErrors === true, '3.3V device on 5V rail triggers error')
assert(voltageReport.issues.some((i) => i.ruleId === 'RULE_1_VOLTAGE_PROTECTION'), 'Rule 1 Voltage Protection issue reported')

console.log('\n=== 4. ELECTRICAL LINTER: INPUT-ONLY PIN VIOLATION (RULE 3) ===')
const inputOnlyNets: WireNet[] = [
  ...validNets.filter((n) => n.id !== 'n4'),
  // Connect SDA (bidirectional output) to D34 (input-only GPIO)
  { id: 'n4-bad', name: 'SDA', color: '#00f', nodes: [{ instanceId: 'esp32', pinId: 'D34' }, { instanceId: 'oled-1', pinId: 'SDA' }] },
]
const inputOnlyReport = ElectricalLinter.evaluate(ESP32_DEVKIT_V1_30P, validComponents, inputOnlyNets)
assert(inputOnlyReport.hasErrors === true, 'Driving output from GPIO34 triggers error')
assert(inputOnlyReport.issues.some((i) => i.ruleId === 'RULE_3_INPUT_ONLY_PIN'), 'Rule 3 Input-Only Pin issue reported')

console.log('\n=== 5. ELECTRICAL LINTER: I2C ADDRESS COLLISION (RULE 4) ===')
const dualCollisionComponents: PlottedComponent[] = [
  { instanceId: 'oled-1', definitionId: 'oled-096-ssd1306', name: 'OLED A', position: { x: 500, y: 100 }, i2cAddress: 0x3c },
  { instanceId: 'oled-2', definitionId: 'oled-096-ssd1306', name: 'OLED B', position: { x: 500, y: 300 }, i2cAddress: 0x3c },
]
const collisionReport = ElectricalLinter.evaluate(ESP32_DEVKIT_V1_30P, dualCollisionComponents, validNets)
assert(collisionReport.hasErrors === true, 'Dual OLEDs with identical 0x3C address trigger error')
assert(collisionReport.issues.some((i) => i.ruleId === 'RULE_4_I2C_COLLISION'), 'Rule 4 I2C Collision issue reported')

console.log('\n=== 6. AUTOMATED C++ PINOUT CODE GENERATION ===')
const cppHeader = generatePinoutHeader(ESP32_DEVKIT_V1_30P, validComponents, validNets, {
  projectName: 'Spec 008 Test',
  i2cSpeedHz: 400000,
})
assert(cppHeader.includes('#define PIN_OLED_SDA 21'), 'Header defines PIN_OLED_SDA as 21')
assert(cppHeader.includes('#define PIN_OLED_SCL 22'), 'Header defines PIN_OLED_SCL as 22')
assert(cppHeader.includes('#define OLED_I2C_ADDRESS 0x3C'), 'Header defines OLED_I2C_ADDRESS as 0x3C')
assert(cppHeader.includes('Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, 400000);'), 'Header initializes Wire.begin with 400kHz')

console.log('\n🎉 ALL SPEC 008 VERIFICATION CHECKS PASSED PERFECTLY!\n')
