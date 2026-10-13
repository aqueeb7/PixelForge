<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectsStore } from '../stores/projects'
import { useWiringStore } from '../stores/wiring'
import { useDeviceStore } from '../stores/device'
import { useFlasherStore } from '../stores/flasher'
import type { PixelForgeProject, ProjectSprite } from '../types/project'

const router = useRouter()
const projectsStore = useProjectsStore()
const wiringStore = useWiringStore()
const deviceStore = useDeviceStore()
const flasherStore = useFlasherStore()

// High-level navigation mode
const viewMode = ref<'workspace' | 'hub'>('workspace')
const hubTab = ref<'my_projects' | 'gallery'>('my_projects')

// Workspace tabs
type WorkspaceTab = 'simulator' | 'pinout' | 'sprites' | 'code' | 'config'
const activeTab = ref<WorkspaceTab>('simulator')

// New Project Modal State
const showNewProjectModal = ref(false)
const newProjectForm = ref({
  name: '',
  description: '',
  category: 'Game' as PixelForgeProject['category'],
  templateId: 'blueprint-space-shooter',
})

// Current Active Project
const project = computed(() => projectsStore.activeProject)

// -----------------------------------------------------------------------------
// Playable 128x64 Game / Asset Simulator
// -----------------------------------------------------------------------------
const gameCanvasRef = ref<HTMLCanvasElement | null>(null)
let gameAnimationId: number | null = null

// Game state for simulation
const score = ref(0)
const highScore = ref(1280)
const lives = ref(3)
const gameOver = ref(false)
const gameStarted = ref(false)

const btn1Pressed = ref(false) // GPIO 18
const btn2Pressed = ref(false) // GPIO 19

// Virtual Entities
interface Star { x: number; y: number; speed: number }
interface Bullet { x: number; y: number; active: boolean }
interface Alien { x: number; y: number; vx: number; alive: boolean; frame: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number }

const stars: Star[] = []
const bullets: Bullet[] = []
const aliens: Alien[] = []
const particles: Particle[] = []

const player = {
  x: 56,
  y: 50,
  width: 16,
  height: 12,
  speed: 2.2,
}

let lastShotTime = 0
let alienStepTimer = 0

function initGame() {
  score.value = 0
  lives.value = 3
  gameOver.value = false
  gameStarted.value = true
  player.x = 56

  stars.length = 0
  for (let i = 0; i < 28; i++) {
    stars.push({
      x: Math.floor(Math.random() * 128),
      y: Math.floor(Math.random() * 64),
      speed: 0.3 + Math.random() * 0.7,
    })
  }

  spawnAlienWave()
  bullets.length = 0
  particles.length = 0
}

function spawnAlienWave() {
  aliens.length = 0
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      aliens.push({
        x: 8 + col * 24,
        y: 10 + row * 13,
        vx: 0.45,
        alive: true,
        frame: 0,
      })
    }
  }
}

function shootBullet() {
  if (bullets.filter(b => b.active).length < 5) {
    bullets.push({
      x: player.x + 7,
      y: player.y - 2,
      active: true,
    })
  }
}

function spawnExplosion(x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2
    const spd = 0.5 + Math.random() * 1.5
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 12 + Math.floor(Math.random() * 8),
    })
  }
}

function updateGame() {
  if (!gameStarted.value || gameOver.value) return

  for (const s of stars) {
    s.y += s.speed
    if (s.y >= 64) {
      s.y = 0
      s.x = Math.floor(Math.random() * 128)
    }
  }

  if (btn1Pressed.value) {
    player.x = Math.max(2, player.x - player.speed)
  }
  if (btn2Pressed.value) {
    player.x = Math.min(128 - player.width - 2, player.x + player.speed)
  }

  const now = performance.now()
  if (now - lastShotTime > 300) {
    shootBullet()
    lastShotTime = now
  }

  for (const b of bullets) {
    if (b.active) {
      b.y -= 2.6
      if (b.y < -4) b.active = false
    }
  }

  alienStepTimer++
  let reverseDirection = false
  let allDead = true

  for (const a of aliens) {
    if (a.alive) {
      allDead = false
      a.x += a.vx
      if (a.x <= 2 || a.x >= 128 - 18) reverseDirection = true
      if (alienStepTimer % 18 === 0) a.frame = a.frame === 0 ? 1 : 0
    }
  }

  if (reverseDirection) {
    for (const a of aliens) {
      a.vx = -a.vx
      a.y += 3
      if (a.alive && a.y + 10 >= player.y) {
        lives.value = 0
        gameOver.value = true
      }
    }
  }

  if (allDead) {
    score.value += 150
    spawnAlienWave()
  }

  for (const b of bullets) {
    if (!b.active) continue
    for (const a of aliens) {
      if (a.alive) {
        if (b.x >= a.x && b.x <= a.x + 16 && b.y >= a.y && b.y <= a.y + 10) {
          b.active = false
          a.alive = false
          score.value += 20
          if (score.value > highScore.value) highScore.value = score.value
          spawnExplosion(a.x + 8, a.y + 5)
          break
        }
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.life--
    if (p.life <= 0) particles.splice(i, 1)
  }
}

function renderGame() {
  const canvas = gameCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#060a0f'
  ctx.fillRect(0, 0, 128, 64)

  ctx.fillStyle = '#7dd3fc'
  for (const s of stars) {
    ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1)
  }

  if (!gameStarted.value) {
    ctx.fillStyle = '#38bdf8'
    ctx.font = '7px monospace'
    ctx.fillText('PIXELFORGE STUDIO', 18, 22)
    ctx.fillStyle = '#ffffff'
    ctx.font = '6px monospace'
    ctx.fillText(project.value.name.toUpperCase(), 14, 34)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('PRESS ANY BUTTON', 22, 48)
    return
  }

  if (gameOver.value) {
    ctx.fillStyle = '#f43f5e'
    ctx.font = '8px monospace'
    ctx.fillText('GAME OVER', 36, 26)
    ctx.fillStyle = '#ffffff'
    ctx.font = '6px monospace'
    ctx.fillText(`SCORE: ${score.value}`, 42, 38)
    ctx.fillStyle = '#38bdf8'
    ctx.fillText('PRESS TO RETRY', 24, 52)
    return
  }

  // Draw Player Sprite
  const pSprite = project.value.sprites.find(s => s.id.includes('player'))
  if (pSprite && pSprite.dataAscii) {
    ctx.fillStyle = '#38bdf8'
    const px = Math.floor(player.x)
    const py = Math.floor(player.y)
    for (let r = 0; r < pSprite.dataAscii.length; r++) {
      const row = pSprite.dataAscii[r]
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '#') ctx.fillRect(px + c, py + r, 1, 1)
      }
    }
  } else {
    // Default Ship
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(Math.floor(player.x), Math.floor(player.y), 16, 10)
  }

  // Draw Aliens (Animated 16x10 Frames A and B)
  ctx.fillStyle = '#f8fafc'
  const alienSpriteA = project.value.sprites.find(s => s.id === 'sprite-alien-a')
  const alienSpriteB = project.value.sprites.find(s => s.id === 'sprite-alien-b')
  for (const a of aliens) {
    if (!a.alive) continue
    const ax = Math.floor(a.x)
    const ay = Math.floor(a.y)
    const spr = (a.frame === 0 ? alienSpriteA : alienSpriteB) || alienSpriteA || project.value.sprites.find(s => s.id.includes('alien'))
    if (spr && spr.dataAscii) {
      for (let r = 0; r < spr.dataAscii.length; r++) {
        const row = spr.dataAscii[r]
        for (let c = 0; c < row.length; c++) {
          if (row[c] === '#') ctx.fillRect(ax + c, ay + r, 1, 1)
        }
      }
    } else {
      ctx.fillRect(ax, ay, 16, 10)
    }
  }

  // Bullets
  ctx.fillStyle = '#fbbf24'
  for (const b of bullets) {
    if (b.active) ctx.fillRect(Math.floor(b.x), Math.floor(b.y), 2, 4)
  }

  // Particles
  ctx.fillStyle = '#f97316'
  for (const p of particles) {
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1)
  }

  // Top HUD
  ctx.fillStyle = '#64748b'
  ctx.fillRect(0, 6, 128, 1)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '5px monospace'
  ctx.fillText(`SC:${score.value}`, 2, 5)
  ctx.fillText(`HI:${highScore.value}`, 46, 5)
  ctx.fillText(`♥${lives.value}`, 110, 5)
}

function gameLoop() {
  updateGame()
  renderGame()
  gameAnimationId = requestAnimationFrame(gameLoop)
}

function pressButton1() {
  btn1Pressed.value = true
  if (!gameStarted.value || gameOver.value) initGame()
}
function releaseButton1() { btn1Pressed.value = false }

function pressButton2() {
  btn2Pressed.value = true
  if (!gameStarted.value || gameOver.value) initGame()
}
function releaseButton2() { btn2Pressed.value = false }

function handleKeyDown(e: KeyboardEvent) {
  if (viewMode.value !== 'workspace' || activeTab.value !== 'simulator') return
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') pressButton1()
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') pressButton2()
  else if (e.code === 'Space') {
    e.preventDefault()
    pressButton2()
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') releaseButton1()
  else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Space') releaseButton2()
}

// -----------------------------------------------------------------------------
// Direct Firmware Flashing & Hardware Integration
// -----------------------------------------------------------------------------
const isFlashing = computed(() => ['connecting', 'erasing', 'writing', 'verifying'].includes(flasherStore.flashState.status))

async function handleFlashToDevice() {
  if (!deviceStore.selectedPort) {
    if (deviceStore.ports.length > 0) {
      deviceStore.selectedPort = deviceStore.ports[0].port_name
    } else {
      await deviceStore.refreshPorts()
      if (deviceStore.ports.length > 0) {
        deviceStore.selectedPort = deviceStore.ports[0].port_name
      } else {
        alert('No USB serial ports detected. Please connect your ESP32 via USB and click refresh.')
        return
      }
    }
  }
  await flasherStore.flashProject(deviceStore.selectedPort, project.value.id)
}

function openInBreadboardStudio() {
  if (project.value.wiringPreset) {
    wiringStore.applyPreset(project.value.wiringPreset)
  }
  router.push('/hardware')
}

function openSpriteInCanvas(s: ProjectSprite) {
  const buf = new Uint8Array(1024)
  const startX = Math.floor((128 - s.width) / 2)
  const startY = Math.floor((64 - s.height) / 2)
  for (let r = 0; r < s.dataAscii.length; r++) {
    const row = s.dataAscii[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') {
        const x = startX + c
        const y = startY + r
        const byteIdx = y * 16 + Math.floor(x / 8)
        const bitMask = 0x80 >> (x % 8)
        buf[byteIdx] |= bitMask
      }
    }
  }
  deviceStore.activeFrame = buf
  router.push('/draw')
}

// -----------------------------------------------------------------------------
// Hub Actions
// -----------------------------------------------------------------------------
function openProject(p: PixelForgeProject) {
  projectsStore.selectProject(p.id)
  viewMode.value = 'workspace'
  activeTab.value = 'simulator'
  initGame()
}

function handleCloneBlueprint(blueprintId: string) {
  const newProj = projectsStore.cloneBlueprint(blueprintId)
  openProject(newProj)
}

function submitCreateProject() {
  if (!newProjectForm.value.name.trim()) return
  const newProj = projectsStore.createProject({
    name: newProjectForm.value.name,
    description: newProjectForm.value.description,
    category: newProjectForm.value.category,
    templateId: newProjectForm.value.templateId,
  })
  showNewProjectModal.value = false
  newProjectForm.value.name = ''
  newProjectForm.value.description = ''
  openProject(newProj)
}

function handleDeleteProject(id: string) {
  if (confirm('Are you sure you want to delete this project?')) {
    projectsStore.deleteProject(id)
  }
}

// Code Actions
const copiedCode = ref(false)
function copyCode() {
  navigator.clipboard.writeText(project.value.customCode)
  copiedCode.value = true
  setTimeout(() => { copiedCode.value = false }, 2000)
}

function downloadInoFile() {
  const blob = new Blob([project.value.customCode], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.value.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.ino`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  projectsStore.init()
  initGame()
  gameAnimationId = requestAnimationFrame(gameLoop)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  if (deviceStore.ports.length === 0) {
    await deviceStore.refreshPorts()
  }
  if (!deviceStore.selectedPort && deviceStore.ports.length > 0) {
    deviceStore.selectedPort = deviceStore.ports[0].port_name
  }
})

onUnmounted(() => {
  if (gameAnimationId !== null) cancelAnimationFrame(gameAnimationId)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<template>
  <div class="projects-studio">
    <!-- Studio Header -->
    <header class="studio-header">
      <div class="header-left">
        <!-- View Switcher Toggle -->
        <div class="view-mode-selector">
          <button
            class="btn-view-mode font-mono"
            :class="{ 'btn-view-mode--active': viewMode === 'hub' }"
            @click="viewMode = 'hub'"
          >
            📁 Projects Hub
          </button>
          <button
            class="btn-view-mode font-mono"
            :class="{ 'btn-view-mode--active': viewMode === 'workspace' }"
            @click="viewMode = 'workspace'"
          >
            🛠️ {{ project.name }}
          </button>
        </div>

        <div v-if="viewMode === 'workspace'" class="project-meta-pill font-mono">
          <span class="meta-tag">{{ project.category }}</span>
          <span class="meta-tag meta-tag--board">{{ project.targetBoard }}</span>
          <span class="meta-tag meta-tag--oled">{{ project.display.controller }} ({{ project.display.width }}×{{ project.display.height }})</span>
        </div>
      </div>

      <!-- Quick Action Controls -->
      <div class="header-actions">
        <button
          class="btn-header-action btn-add font-mono"
          @click="showNewProjectModal = true"
        >
          ➕ New Project
        </button>
        <button
          v-if="viewMode === 'workspace'"
          class="btn-header-action btn-hardware font-mono"
          @click="openInBreadboardStudio"
        >
          🔌 Breadboard
        </button>
        <button
          v-if="viewMode === 'workspace'"
          class="btn-header-action btn-flash font-mono"
          :disabled="isFlashing"
          @click="handleFlashToDevice"
        >
          <span v-if="isFlashing">⚡ Flashing…</span>
          <span v-else>⚡ 1-Click Flash</span>
        </button>
      </div>
    </header>

    <!-- ===================================================================== -->
    <!-- VIEW MODE A: PROJECTS HUB & BLUEPRINT GALLERY                         -->
    <!-- ===================================================================== -->
    <main v-if="viewMode === 'hub'" class="hub-container">
      <nav class="hub-tabs">
        <button
          class="hub-tab-btn font-mono"
          :class="{ 'hub-tab-btn--active': hubTab === 'my_projects' }"
          @click="hubTab = 'my_projects'"
        >
          📂 My Projects ({{ projectsStore.projects.length }})
        </button>
        <button
          class="hub-tab-btn font-mono"
          :class="{ 'hub-tab-btn--active': hubTab === 'gallery' }"
          @click="hubTab = 'gallery'"
        >
          📚 Firmware & Blueprint Gallery ({{ projectsStore.blueprints.length }})
        </button>
      </nav>

      <!-- Sub-Tab: My Projects -->
      <div v-if="hubTab === 'my_projects'" class="hub-content">
        <div class="projects-grid">
          <!-- Create Card -->
          <div class="project-card project-card--new" @click="showNewProjectModal = true">
            <div class="new-icon">➕</div>
            <h3 class="new-title">Create New Project</h3>
            <p class="new-desc">Design custom pinouts, write embedded C++ code, and create 1-bit sprites.</p>
          </div>

          <!-- User Project Cards -->
          <div
            v-for="p in projectsStore.projects"
            :key="p.id"
            class="project-card"
            :class="{ 'project-card--active': p.id === project.id }"
          >
            <div class="card-top-row">
              <span class="card-icon">{{ p.icon }}</span>
              <span class="card-badge font-mono">{{ p.category }}</span>
            </div>
            <h3 class="card-name">{{ p.name }}</h3>
            <p class="card-desc">{{ p.description }}</p>

            <div class="card-tags font-mono">
              <span>{{ p.display.controller }}</span>
              <span>{{ p.targetBoard }}</span>
            </div>

            <div class="card-actions">
              <button class="btn-card-open font-mono" @click="openProject(p)">
                Open Studio →
              </button>
              <button
                v-if="projectsStore.projects.length > 1"
                class="btn-card-delete"
                title="Delete project"
                @click.stop="handleDeleteProject(p.id)"
              >
                🗑
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sub-Tab: Blueprint & Firmware Gallery -->
      <div v-if="hubTab === 'gallery'" class="hub-content">
        <div class="gallery-hero">
          <h2>Firmware Blueprint Gallery</h2>
          <p>Battle-tested embedded templates and demos with pre-wired pinouts and ready-to-run C++ code.</p>
        </div>

        <div class="gallery-grid">
          <div
            v-for="b in projectsStore.blueprints"
            :key="b.id"
            class="gallery-card"
          >
            <div class="gallery-card-header">
              <span class="gallery-icon">{{ b.icon }}</span>
              <span class="gallery-badge font-mono">{{ b.category }}</span>
            </div>
            <h3 class="gallery-title">{{ b.name }}</h3>
            <p class="gallery-desc">{{ b.description }}</p>

            <div class="gallery-features font-mono">
              <div class="feature-item">
                <span class="feature-label">Display:</span>
                <span class="feature-val">{{ b.display.controller }} 128×64 I2C</span>
              </div>
              <div class="feature-item">
                <span class="feature-label">Target:</span>
                <span class="feature-val">ESP32 DevKit</span>
              </div>
            </div>

            <div class="gallery-actions">
              <button class="btn-clone-tpl font-mono" @click="handleCloneBlueprint(b.id)">
                🚀 Clone & Open Project
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ===================================================================== -->
    <!-- VIEW MODE B: ACTIVE PROJECT WORKSPACE                                 -->
    <!-- ===================================================================== -->
    <div v-if="viewMode === 'workspace'" class="workspace-container">
      <!-- Workspace Navigation Tabs -->
      <nav class="studio-tabs">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'simulator' }"
          @click="activeTab = 'simulator'"
        >
          🎮 Simulator & Controls
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'pinout' }"
          @click="activeTab = 'pinout'"
        >
          📌 Pinout & Breadboard
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'sprites' }"
          @click="activeTab = 'sprites'"
        >
          👾 1-Bit Sprite Bank ({{ project.sprites.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'code' }"
          @click="activeTab = 'code'"
        >
          ⚡ C++ Firmware & Flasher
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'config' }"
          @click="activeTab = 'config'"
        >
          ⚙️ Hardware Settings
        </button>
      </nav>

      <!-- Workspace Body -->
      <main class="studio-body">
        <!-- 1. Simulator Tab -->
        <section v-if="activeTab === 'simulator'" class="tab-panel panel-simulator">
          <div class="simulator-layout">
            <!-- Left: Retro Cabinet -->
            <div class="arcade-cabinet">
              <div class="cabinet-bezel">
                <div class="bezel-label-top font-mono">128×64 MONOCHROME OLED PREVIEW</div>
                <div class="screen-wrapper">
                  <canvas
                    ref="gameCanvasRef"
                    width="128"
                    height="64"
                    class="oled-display-canvas"
                  />
                  <div class="scanlines-overlay" />
                </div>
                <div class="bezel-label-bottom font-mono">
                  <span>FPS: 30.0</span>
                  <span>{{ project.display.controller }}</span>
                  <span>0x{{ project.display.i2cAddress.toString(16).toUpperCase() }}</span>
                </div>
              </div>

              <!-- Tactile Controller -->
              <div class="tactile-controller">
                <div class="tactile-unit">
                  <button
                    class="tactile-btn"
                    :class="{ 'tactile-btn--pressed': btn1Pressed }"
                    @mousedown="pressButton1"
                    @mouseup="releaseButton1"
                    @mouseleave="releaseButton1"
                    @touchstart.prevent="pressButton1"
                    @touchend.prevent="releaseButton1"
                  >
                    ◀
                  </button>
                  <div class="tactile-label font-mono">
                    <span class="pin-id">GPIO 18</span>
                    <span class="role-desc">BUTTON 1</span>
                  </div>
                </div>

                <div class="silicon-status font-mono">
                  <div class="status-chip" :class="{ 'status-chip--active': btn1Pressed }">
                    <span class="chip-dot" />
                    <span>D18: {{ btn1Pressed ? 'LOW (0V)' : 'HIGH (3.3V)' }}</span>
                  </div>
                  <div class="status-chip" :class="{ 'status-chip--active': btn2Pressed }">
                    <span class="chip-dot" />
                    <span>D19: {{ btn2Pressed ? 'LOW (0V)' : 'HIGH (3.3V)' }}</span>
                  </div>
                </div>

                <div class="tactile-unit">
                  <button
                    class="tactile-btn tactile-btn--fire"
                    :class="{ 'tactile-btn--pressed': btn2Pressed }"
                    @mousedown="pressButton2"
                    @mouseup="releaseButton2"
                    @mouseleave="releaseButton2"
                    @touchstart.prevent="pressButton2"
                    @touchend.prevent="releaseButton2"
                  >
                    ▶
                  </button>
                  <div class="tactile-label font-mono">
                    <span class="pin-id">GPIO 19</span>
                    <span class="role-desc">BUTTON 2</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Controls & Mechanics -->
            <div class="simulator-sidebar">
              <div class="info-card">
                <h3 class="card-heading">🕹️ Behavioral Simulation</h3>
                <p class="card-p">
                  Test your project's graphics, inputs, and animations right in PixelForge before flashing hardware.
                </p>
                <div class="shortcut-pills">
                  <div class="shortcut-pill">
                    <kbd>A</kbd> or <kbd>←</kbd>
                    <span>Button 1 (GPIO 18)</span>
                  </div>
                  <div class="shortcut-pill">
                    <kbd>D</kbd> or <kbd>→</kbd>
                    <span>Button 2 (GPIO 19)</span>
                  </div>
                </div>
              </div>

              <div class="info-card">
                <h3 class="card-heading">⚡ Connected Hardware</h3>
                <div class="hardware-spec-list font-mono">
                  <div class="spec-row">
                    <span>MCU Target:</span>
                    <strong>{{ project.targetBoard }}</strong>
                  </div>
                  <div class="spec-row">
                    <span>OLED Driver:</span>
                    <strong>{{ project.display.controller }} ({{ project.display.width }}×{{ project.display.height }})</strong>
                  </div>
                  <div class="spec-row">
                    <span>I²C Bus:</span>
                    <strong>SDA=D21, SCL=D22 @ 400kHz</strong>
                  </div>
                </div>
                <button class="btn-sub-action btn-sub-action--primary font-mono mt-4" @click="activeTab = 'code'">
                  ⚡ Open C++ Editor & Flasher
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. Pinout & Breadboard Tab -->
        <section v-if="activeTab === 'pinout'" class="tab-panel panel-pinout">
          <div class="pinout-grid">
            <div class="blueprint-card">
              <div class="card-header-flex">
                <div>
                  <h3 class="card-heading">🔌 Project Pinout Blueprint</h3>
                  <p class="card-p">
                    Physical wiring mapped to ESP32 DevKit V1 headers.
                  </p>
                </div>
                <button class="btn-action btn-hardware font-mono" @click="openInBreadboardStudio">
                  ⚡ Open in Breadboard Studio
                </button>
              </div>

              <table class="wiring-table font-mono">
                <thead>
                  <tr>
                    <th>Peripheral</th>
                    <th>Signal Pin</th>
                    <th>ESP32 Pin</th>
                    <th>GPIO #</th>
                    <th>Logic Mode</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="row-power">
                    <td><strong>{{ project.display.controller }} OLED</strong></td>
                    <td>VCC</td>
                    <td>3V3</td>
                    <td>—</td>
                    <td>3.3V DC</td>
                    <td><span class="safe-tag">Safe</span> 3.3V Rail</td>
                  </tr>
                  <tr class="row-gnd">
                    <td><strong>{{ project.display.controller }} OLED</strong></td>
                    <td>GND</td>
                    <td>GND</td>
                    <td>—</td>
                    <td>Ground (0V)</td>
                    <td><span class="safe-tag">Safe</span> Common GND</td>
                  </tr>
                  <tr class="row-i2c">
                    <td><strong>{{ project.display.controller }} OLED</strong></td>
                    <td>SCL</td>
                    <td>D22</td>
                    <td>GPIO 22</td>
                    <td>Hardware I²C</td>
                    <td><span class="safe-tag">Verified</span> 400 kHz</td>
                  </tr>
                  <tr class="row-i2c">
                    <td><strong>{{ project.display.controller }} OLED</strong></td>
                    <td>SDA</td>
                    <td>D21</td>
                    <td>GPIO 21</td>
                    <td>Hardware I²C</td>
                    <td><span class="safe-tag">Verified</span> Data Bus</td>
                  </tr>
                  <tr class="row-btn">
                    <td><strong>Button 1</strong></td>
                    <td>SIG (Pin A)</td>
                    <td>D18</td>
                    <td>GPIO 18</td>
                    <td>INPUT_PULLUP</td>
                    <td><span class="safe-tag">Safe</span> Active LOW</td>
                  </tr>
                  <tr class="row-btn">
                    <td><strong>Button 2</strong></td>
                    <td>SIG (Pin A)</td>
                    <td>D19</td>
                    <td>GPIO 19</td>
                    <td>INPUT_PULLUP</td>
                    <td><span class="safe-tag">Safe</span> Active LOW</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="safety-card">
              <h3 class="card-heading">🛡️ Electrical Safety Matrix</h3>
              <div class="safety-points">
                <div class="safety-point">
                  <span class="point-icon text-emerald-400">✓</span>
                  <div>
                    <strong>Strapping Pin Guard:</strong>
                    <p>No connections to GPIO 0, 2, 12, or 15. Your ESP32 will boot and accept flash programming normally.</p>
                  </div>
                </div>
                <div class="safety-point">
                  <span class="point-icon text-emerald-400">✓</span>
                  <div>
                    <strong>Internal Pull-Up Validation:</strong>
                    <p>Pins 18 & 19 feature onboard 45kΩ pull-up resistors in silicon. No breadboard resistors required.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. Sprites Tab -->
        <section v-if="activeTab === 'sprites'" class="tab-panel panel-sprites">
          <div class="sprites-header">
            <div>
              <h3 class="card-heading">👾 1-Bit Sprite Asset Bank</h3>
              <p class="card-p">
                Sprites and bitmaps bundled with this project. Click any sprite to edit it in the PixelForge Draw Canvas.
              </p>
            </div>
          </div>

          <div class="sprites-grid">
            <div
              v-for="s in project.sprites"
              :key="s.id"
              class="sprite-card"
            >
              <div class="sprite-preview-box">
                <div class="sprite-ascii-art">
                  <div v-for="(row, r) in s.dataAscii" :key="r" class="ascii-row">
                    <span
                      v-for="(char, c) in row"
                      :key="c"
                      class="pixel-dot"
                      :class="{ 'pixel-on': char === '#' }"
                    />
                  </div>
                </div>
              </div>
              <div class="sprite-info">
                <h4 class="sprite-name font-mono">{{ s.name }}</h4>
                <span class="sprite-dims font-mono">{{ s.width }}×{{ s.height }} px</span>
                <button class="btn-edit-sprite font-mono mt-2" @click="openSpriteInCanvas(s)">
                  🎨 Edit in Canvas Editor
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. Code & Flasher Tab -->
        <section v-if="activeTab === 'code'" class="tab-panel panel-code">
          <!-- 1-Click Flasher -->
          <div class="direct-flasher-card">
            <div class="flasher-badge font-mono">⚡ Native Hardware Flasher</div>
            <div class="flasher-header-row">
              <div>
                <h3 class="flasher-title">⚡ Flash Embedded Blueprint: {{ project.name }}</h3>
                <p class="flasher-desc">
                  Installs this standalone project firmware directly onto your ESP32. Runs offline on your breadboard!
                  <span class="text-xs text-slate-400 block mt-1">
                    Tip: To restore live video streaming and hardware telemetry later, re-flash PixelForge Official OS from the Hardware Monitor tab.
                  </span>
                </p>
              </div>
              <div class="flasher-controls">
                <div class="port-select-box font-mono">
                  <label for="project-flasher-port">Port:</label>
                  <select
                    id="project-flasher-port"
                    v-model="deviceStore.selectedPort"
                    class="flasher-select"
                    :disabled="isFlashing"
                  >
                    <option v-if="deviceStore.ports.length === 0" value="">No Ports</option>
                    <option
                      v-for="p in deviceStore.ports"
                      :key="p.port_name"
                      :value="p.port_name"
                    >
                      {{ p.port_name }} ({{ p.port_type }})
                    </option>
                  </select>
                  <button class="btn-refresh-ports" title="Refresh USB Ports" :disabled="isFlashing" @click="deviceStore.refreshPorts">
                    🔄
                  </button>
                </div>

                <button
                  class="btn-flash-device font-mono"
                  :disabled="isFlashing || !deviceStore.selectedPort"
                  @click="handleFlashToDevice"
                >
                  <span v-if="isFlashing">⚡ Flashing {{ project.name }} ({{ flasherStore.flashState.progress }}%)…</span>
                  <span v-else>⚡ Flash {{ project.name }}</span>
                </button>
              </div>
            </div>

            <!-- Progress Bar -->
            <div
              v-if="flasherStore.flashState.status !== 'idle'"
              class="flasher-progress-strip"
              :class="'status-' + flasherStore.flashState.status"
            >
              <div class="progress-info-row font-mono">
                <span>{{ flasherStore.flashState.stage }}</span>
                <span>{{ flasherStore.flashState.progress }}%</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" :style="{ width: flasherStore.flashState.progress + '%' }" />
              </div>
              <div v-if="flasherStore.flashState.errorMessage" class="error-msg font-mono">
                ⚠️ {{ flasherStore.flashState.errorMessage }}
              </div>
            </div>
          </div>

          <!-- In-App C++ Code Editor / Viewer -->
          <div class="code-export-section">
            <div class="code-header-bar">
              <div class="code-info">
                <h3 class="card-heading">📄 C++ Source Code (`main.cpp`)</h3>
                <p class="card-p font-mono">
                  Target: {{ project.targetBoard }} · Display: {{ project.display.controller }}
                </p>
              </div>
              <div class="code-actions">
                <button class="btn-code-action font-mono" :class="{ 'btn-code-action--success': copiedCode }" @click="copyCode">
                  {{ copiedCode ? '✓ Copied!' : '📋 Copy Code' }}
                </button>
                <button class="btn-code-action btn-code-action--primary font-mono" @click="downloadInoFile">
                  💾 Download .ino
                </button>
              </div>
            </div>

            <div class="code-editor-container">
              <textarea
                v-model="project.customCode"
                class="code-editor-textarea font-mono"
                spellcheck="false"
              />
            </div>
          </div>
        </section>

        <!-- 5. Config Tab -->
        <section v-if="activeTab === 'config'" class="tab-panel panel-config">
          <div class="config-card">
            <h3 class="card-heading">⚙️ Hardware Configuration</h3>
            <p class="card-p">Adjust display controller glass, I²C bus addresses, and board profiles.</p>

            <div class="config-form">
              <div class="form-group">
                <label class="form-label font-mono">Display Controller Glass:</label>
                <div class="controller-radio-group font-mono">
                  <label class="radio-label">
                    <input
                      type="radio"
                      value="SH1106"
                      v-model="project.display.controller"
                    />
                    <span>1.3" OLED (SH1106 Controller)</span>
                  </label>
                  <label class="radio-label">
                    <input
                      type="radio"
                      value="SSD1306"
                      v-model="project.display.controller"
                    />
                    <span>0.96" OLED (SSD1306 Controller)</span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label font-mono">I²C Bus Address:</label>
                <input
                  type="text"
                  class="clean-input font-mono"
                  :value="'0x' + project.display.i2cAddress.toString(16).toUpperCase()"
                  disabled
                />
              </div>

              <div class="form-group">
                <label class="form-label font-mono">Target MCU Board:</label>
                <input
                  type="text"
                  class="clean-input font-mono"
                  v-model="project.targetBoard"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- ===================================================================== -->
    <!-- NEW PROJECT MODAL                                                     -->
    <!-- ===================================================================== -->
    <div v-if="showNewProjectModal" class="modal-backdrop" @click.self="showNewProjectModal = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Create New Embedded Project</h3>
          <button class="modal-close-btn" @click="showNewProjectModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Project Name:</label>
            <input
              v-model="newProjectForm.name"
              type="text"
              class="clean-input"
              placeholder="e.g. Weather HUD Station"
              autofocus
            />
          </div>

          <div class="form-group">
            <label class="form-label">Category:</label>
            <select v-model="newProjectForm.category" class="clean-select">
              <option value="Game">Game</option>
              <option value="Animation">Animation</option>
              <option value="HUD">HUD & Instruments</option>
              <option value="Sensor">Sensor Monitor</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Description:</label>
            <textarea
              v-model="newProjectForm.description"
              class="clean-textarea"
              placeholder="Brief description of hardware and behavior..."
              rows="2"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Starter Blueprint Template:</label>
            <select v-model="newProjectForm.templateId" class="clean-select">
              <option
                v-for="b in projectsStore.blueprints"
                :key="b.id"
                :value="b.id"
              >
                {{ b.icon }} {{ b.name }} ({{ b.category }})
              </option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel font-mono" @click="showNewProjectModal = false">Cancel</button>
          <button class="btn-submit font-mono" @click="submitCreateProject">Create Project</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.projects-studio {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-base);
  overflow: hidden;
  height: 100%;
}

/* Header */
.studio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.view-mode-selector {
  display: flex;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 2px;
}

.btn-view-mode {
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-view-mode:hover {
  color: var(--color-text-primary);
}

.btn-view-mode--active {
  background-color: var(--color-accent);
  color: #ffffff;
}

.project-meta-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.meta-tag {
  font-size: 0.68rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background-color: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.meta-tag--oled {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn-header-action {
  padding: 0.4rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  transition: all 0.2s ease;
}

.btn-add {
  background-color: rgba(124, 111, 255, 0.15);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.btn-add:hover {
  background-color: var(--color-accent);
  color: #ffffff;
}

.btn-flash {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border-color: #60a5fa;
  color: #ffffff;
}

.btn-flash:hover:not(:disabled) {
  filter: brightness(1.15);
}

/* ========================================================================= */
/* HUB STYLES                                                                */
/* ========================================================================= */
.hub-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.hub-tabs {
  display: flex;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 0 1.5rem;
  gap: 1rem;
}

.hub-tab-btn {
  background: none;
  border: none;
  padding: 0.85rem 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.hub-tab-btn:hover {
  color: var(--color-text-primary);
}

.hub-tab-btn--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.hub-content {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.projects-grid, .gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.project-card, .gallery-card {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
}

.project-card:hover, .gallery-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.project-card--active {
  border-color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.03);
}

.project-card--new {
  border: 2px dashed var(--color-border);
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  min-height: 220px;
}

.project-card--new:hover {
  border-color: var(--color-accent);
  background-color: var(--color-accent-dim);
}

.new-icon {
  font-size: 2.2rem;
  margin-bottom: 0.5rem;
}

.new-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.new-desc {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.card-top-row, .gallery-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.card-icon, .gallery-icon {
  font-size: 1.75rem;
}

.card-badge, .gallery-badge {
  font-size: 0.68rem;
  padding: 0.2rem 0.5rem;
  border-radius: 99px;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.card-name, .gallery-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.35rem;
}

.card-desc, .gallery-desc {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  line-height: 1.45;
  margin-bottom: 1rem;
  flex: 1;
}

.card-tags {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.card-tags span {
  font-size: 0.68rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background-color: var(--color-bg-elevated);
  color: var(--color-text-muted);
}

.card-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-card-open, .btn-clone-tpl {
  flex: 1;
  padding: 0.45rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--color-accent);
  background-color: var(--color-accent-dim);
  color: var(--color-accent);
  transition: all 0.2s ease;
}

.btn-card-open:hover, .btn-clone-tpl:hover {
  background-color: var(--color-accent);
  color: #ffffff;
}

.btn-card-delete {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  color: var(--color-text-muted);
}

.btn-card-delete:hover {
  border-color: #f87171;
  color: #f87171;
}

.gallery-hero {
  margin-bottom: 1.5rem;
}

.gallery-hero h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.gallery-hero p {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.gallery-features {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  margin-bottom: 1rem;
  padding: 0.6rem;
  background-color: var(--color-bg-elevated);
  border-radius: 6px;
}

.feature-item {
  display: flex;
  justify-content: space-between;
}

.feature-label {
  color: var(--color-text-muted);
}

.feature-val {
  color: var(--color-text-primary);
}

/* ========================================================================= */
/* WORKSPACE STYLES                                                          */
/* ========================================================================= */
.workspace-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.studio-tabs {
  display: flex;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 0 1.5rem;
  gap: 0.5rem;
}

.tab-btn {
  background: none;
  border: none;
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--color-text-primary);
}

.tab-btn--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.studio-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.tab-panel {
  max-width: 1200px;
  margin: 0 auto;
}

/* Simulator */
.simulator-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .simulator-layout {
    grid-template-columns: 1fr;
  }
}

.arcade-cabinet {
  background-color: #0b0c10;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cabinet-bezel {
  background-color: #12131a;
  border: 2px solid #252636;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 580px;
}

.bezel-label-top, .bezel-label-bottom {
  font-size: 0.68rem;
  color: var(--color-text-muted);
  width: 100%;
  display: flex;
  justify-content: space-between;
  letter-spacing: 0.08em;
}

.bezel-label-top {
  margin-bottom: 0.5rem;
  justify-content: center;
}

.bezel-label-bottom {
  margin-top: 0.6rem;
  padding: 0 0.25rem;
}

.screen-wrapper {
  position: relative;
  background-color: #060a0f;
  border: 3px solid #1a1c29;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(56, 189, 248, 0.15), 0 0 15px rgba(56, 189, 248, 0.2);
}

.oled-display-canvas {
  display: block;
  width: 512px;
  height: 256px;
  image-rendering: pixelated;
}

@media (max-width: 600px) {
  .oled-display-canvas {
    width: 320px;
    height: 160px;
  }
}

.scanlines-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
  background-size: 100% 4px;
  pointer-events: none;
}

.tactile-controller {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 580px;
  margin-top: 1.5rem;
  padding: 1rem 1.5rem;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  gap: 1rem;
}

.tactile-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.tactile-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: radial-gradient(circle, #3b82f6, #1d4ed8);
  border: 3px solid #60a5fa;
  color: #ffffff;
  font-size: 1.35rem;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 6px 12px rgba(37, 99, 235, 0.4);
  transition: all 0.1s ease;
  user-select: none;
}

.tactile-btn--fire {
  background: radial-gradient(circle, #f43f5e, #be123c);
  border-color: #fb7185;
}

.tactile-btn:active, .tactile-btn--pressed {
  transform: translateY(2px);
  filter: brightness(0.9);
}

.tactile-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.65rem;
}

.pin-id {
  color: #38bdf8;
  font-weight: 700;
}

.role-desc {
  color: var(--color-text-muted);
}

.silicon-status {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.72rem;
}

.status-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.status-chip--active {
  background-color: rgba(52, 211, 153, 0.15);
  border-color: #34d399;
  color: #34d399;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

.simulator-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.info-card {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem;
}

.card-heading {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.card-p {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.shortcut-pills {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.shortcut-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

kbd {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 600;
  color: var(--color-text-primary);
}

.hardware-spec-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.75rem;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--color-border);
}

.spec-row span {
  color: var(--color-text-muted);
}

.spec-row strong {
  color: var(--color-text-primary);
}

.btn-sub-action {
  width: 100%;
  padding: 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--color-accent);
  background-color: var(--color-accent);
  color: #ffffff;
}

/* Pinout */
.pinout-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .pinout-grid { grid-template-columns: 1fr; }
}

.blueprint-card, .safety-card {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.5rem;
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.wiring-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.wiring-table th, .wiring-table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.wiring-table th {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
}

.safe-tag {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  background-color: rgba(52, 211, 153, 0.15);
  color: #34d399;
  border-radius: 3px;
}

.safety-points {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.safety-point {
  display: flex;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  line-height: 1.45;
}

.point-icon {
  font-size: 1.1rem;
}

/* Sprites */
.sprites-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.sprites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}

.sprite-card {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sprite-preview-box {
  background-color: #060a0f;
  border: 1px solid #1e2230;
  border-radius: 6px;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 130px;
}

.sprite-ascii-art {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ascii-row {
  display: flex;
  gap: 2px;
}

.pixel-dot {
  width: 6px;
  height: 6px;
  background-color: #0d131f;
  border-radius: 1px;
}

.pixel-on {
  background-color: #38bdf8;
  box-shadow: 0 0 4px #38bdf8;
}

.sprite-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #38bdf8;
}

.sprite-dims {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  display: block;
  margin-bottom: 0.25rem;
}

.btn-edit-sprite {
  padding: 0.35rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--color-accent);
  background-color: var(--color-accent-dim);
  color: var(--color-accent);
}

/* Code & Flasher */
.panel-code {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.direct-flasher-card {
  background: linear-gradient(135deg, rgba(20, 22, 34, 0.95), rgba(14, 15, 23, 0.95));
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.flasher-badge {
  align-self: flex-start;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  background-color: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.flasher-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.flasher-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.35rem;
}

.flasher-desc {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 600px;
}

.flasher-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.port-select-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
}

.flasher-select {
  background: none;
  border: none;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 0.78rem;
  outline: none;
  cursor: pointer;
}

.flasher-select option {
  background-color: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.btn-refresh-ports {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.btn-flash-device {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: 1px solid #60a5fa;
  color: #ffffff;
  padding: 0.55rem 1.15rem;
  font-size: 0.82rem;
  font-weight: 700;
  border-radius: 6px;
  cursor: pointer;
}

.flasher-progress-strip {
  background-color: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.progress-info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--color-text-primary);
}

.progress-bar-track {
  height: 6px;
  background-color: var(--color-bg-elevated);
  border-radius: 99px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 99px;
  transition: width 0.3s ease;
}

.error-msg {
  font-size: 0.75rem;
  color: #f87171;
}

.code-export-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.code-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.code-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-code-action {
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  cursor: pointer;
}

.btn-code-action--primary {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: #ffffff;
}

.btn-code-action--success {
  background-color: rgba(52, 211, 153, 0.2);
  border-color: #34d399;
  color: #34d399;
}

.code-editor-container {
  background-color: #0b0c10;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  overflow: hidden;
}

.code-editor-textarea {
  width: 100%;
  height: 480px;
  background: none;
  border: none;
  color: #e2e8f0;
  font-size: 0.8rem;
  line-height: 1.55;
  resize: vertical;
  outline: none;
}

/* Config Tab */
.config-card {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.5rem;
  max-width: 600px;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.controller-radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: var(--color-text-primary);
}

.clean-input, .clean-select, .clean-textarea {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--color-text-primary);
  font-size: 0.82rem;
  outline: none;
}

.clean-input:focus, .clean-select:focus, .clean-textarea:focus {
  border-color: var(--color-accent);
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-dialog {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1rem;
}

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background-color: var(--color-bg-elevated);
  border-top: 1px solid var(--color-border);
}

.btn-cancel {
  background: none;
  border: 1px solid var(--color-border);
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.78rem;
}

.btn-submit {
  background-color: var(--color-accent);
  border: 1px solid var(--color-accent);
  padding: 0.45rem 1rem;
  border-radius: 6px;
  color: #ffffff;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
}
</style>
