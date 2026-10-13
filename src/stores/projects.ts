/**
 * Projects Pinia Store (Spec 012)
 * Manages the user's project library, blueprint gallery, project creation,
 * active project workspace, and persistence.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PixelForgeProject, ProjectSprite } from '../types/project'

const STORAGE_KEY = 'pixelforge_user_projects_v1'
const ACTIVE_PROJECT_KEY = 'pixelforge_active_project_id'

// Initial Default Sprites for Space Shooter (16px MSB-aligned)
const DEFAULT_SPACE_SPRITES: ProjectSprite[] = [
  {
    id: 'sprite-player',
    name: 'Player Interceptor (16×12)',
    width: 16,
    height: 12,
    dataAscii: [
      "..##....##......",
      "..####..####....",
      ".######..######..",
      ".######..######..",
      "################",
      "################",
      "################",
      "################",
      "################",
      "###..######..###",
      "##...##..##...##",
      ".#..............#.",
    ],
    cArraySnippet: `const unsigned char PROGMEM bitmap_player[] = {
  0x01, 0x80, 0x03, 0xC0, 0x07, 0xE0, 0x07, 0xE0,
  0x0F, 0xF0, 0x1F, 0xF8, 0x3F, 0xFC, 0x7F, 0xFE,
  0xFF, 0xFF, 0xEF, 0xF7, 0xC6, 0x63, 0x40, 0x02
};`,
  },
  {
    id: 'sprite-alien-a',
    name: 'Alien Invader Frame A (16×10)',
    width: 16,
    height: 10,
    dataAscii: [
      "....##....##....",
      "......####......",
      "....########....",
      "..############..",
      "..##..####..##..",
      "..############..",
      "....########....",
      "..##..####..##..",
      "##............##",
      "##............##",
    ],
    cArraySnippet: `const unsigned char PROGMEM bitmap_alien_a[] = {
  0x0C, 0x30, 0x03, 0xC0, 0x0F, 0xF0, 0x3F, 0xFC,
  0x33, 0xCC, 0x3F, 0xFC, 0x0F, 0xF0, 0x33, 0xCC,
  0xC0, 0x03, 0xC0, 0x03
};`,
  },
  {
    id: 'sprite-alien-b',
    name: 'Alien Invader Frame B (16×10)',
    width: 16,
    height: 10,
    dataAscii: [
      "##............##",
      "....##....##....",
      "....########....",
      "..############..",
      "..##..####..##..",
      "..############..",
      "....########....",
      "......####......",
      "....##....##....",
      "..##........##..",
    ],
    cArraySnippet: `const unsigned char PROGMEM bitmap_alien_b[] = {
  0xC0, 0x03, 0x0C, 0x30, 0x0F, 0xF0, 0x3F, 0xFC,
  0x33, 0xCC, 0x3F, 0xFC, 0x0F, 0xF0, 0x03, 0xC0,
  0x0C, 0x30, 0x30, 0x0C
};`,
  },
]

// Standard Reference Blueprints & Templates
export const BLUEPRINT_GALLERY: PixelForgeProject[] = [
  {
    id: 'blueprint-space-shooter',
    name: 'Space Shooter Arcade',
    description: '128×64 retro space arcade with player ship, alien waves, auto-fire laser blaster, and 2-button input.',
    category: 'Game',
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    icon: '🚀',
    targetBoard: 'esp32-devkit-v1-30p',
    display: {
      width: 128,
      height: 64,
      controller: 'SH1106',
      driver: 'U8G2',
      i2cAddress: 0x3c,
      sdaGpio: 21,
      sclGpio: 22,
    },
    wiringPreset: 'space_shooter',
    sprites: DEFAULT_SPACE_SPRITES,
    isTemplate: true,
    customCode: `// ==============================================================================
// PixelForge Arcade — ESP32 Space Shooter
// Target: ESP32 DevKit V1 + 1.3" I2C OLED (SH1106) + 2 Buttons
// Wiring:
//   OLED GND -> ESP32 GND
//   OLED VCC -> ESP32 3V3 (3.3V)
//   OLED SCL -> ESP32 D22 (GPIO 22)
//   OLED SDA -> ESP32 D21 (GPIO 21)
//   Button 1 (Left):  GPIO 18 -> GND (Internal pull-up)
//   Button 2 (Right): GPIO 19 -> GND (Internal pull-up)
// ==============================================================================

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

#define PIN_OLED_SDA  21
#define PIN_OLED_SCL  22
#define PIN_BTN_LEFT  18  // Button 1: Move Left
#define PIN_BTN_RIGHT 19  // Button 2: Move Right / Fire

// U8G2_R2 rotates display by 180° for upside-down breadboard mounting
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R2, /* reset=*/ U8X8_PIN_NONE, PIN_OLED_SCL, PIN_OLED_SDA);

// 16x12 Player Interceptor Ship (MSB-first format)
const unsigned char PROGMEM bitmap_player[] = {
  0x01, 0x80, 0x03, 0xC0, 0x07, 0xE0, 0x07, 0xE0,
  0x0F, 0xF0, 0x1F, 0xF8, 0x3F, 0xFC, 0x7F, 0xFE,
  0xFF, 0xFF, 0xEF, 0xF7, 0xC6, 0x63, 0x40, 0x02
};

// 16x10 Alien Invader Frame A (MSB-first format)
const unsigned char PROGMEM bitmap_alien_a[] = {
  0x0C, 0x30, 0x03, 0xC0, 0x0F, 0xF0, 0x3F, 0xFC,
  0x33, 0xCC, 0x3F, 0xFC, 0x0F, 0xF0, 0x33, 0xCC,
  0xC0, 0x03, 0xC0, 0x03
};

// 16x10 Alien Invader Frame B (MSB-first format)
const unsigned char PROGMEM bitmap_alien_b[] = {
  0xC0, 0x03, 0x0C, 0x30, 0x0F, 0xF0, 0x3F, 0xFC,
  0x33, 0xCC, 0x3F, 0xFC, 0x0F, 0xF0, 0x03, 0xC0,
  0x0C, 0x30, 0x30, 0x0C
};

struct Bullet { int8_t x, y; bool active; };
struct Alien { float x, y, vx; bool alive; };
struct Star { int8_t x, y; uint8_t speed; };

#define MAX_BULLETS 4
#define ALIEN_COUNT 10
#define STAR_COUNT 16

Bullet bullets[MAX_BULLETS];
Alien aliens[ALIEN_COUNT];
Star stars[STAR_COUNT];

float playerX = 56;
int score = 0;
int highScore = 1500;
int wave = 1;
bool gameOver = false;
uint32_t lastShotTime = 0;
uint32_t lastFrameTime = 0;
uint8_t animTick = 0;

void initStars() {
  for (int i = 0; i < STAR_COUNT; i++) {
    stars[i].x = random(0, 128);
    stars[i].y = random(0, 64);
    stars[i].speed = random(1, 3);
  }
}

void initGame() {
  playerX = 56;
  score = 0;
  wave = 1;
  gameOver = false;
  for (int i = 0; i < MAX_BULLETS; i++) bullets[i].active = false;
  for (int i = 0; i < ALIEN_COUNT; i++) {
    int col = i % 5;
    int row = i / 5;
    aliens[i].x = 8 + col * 24;
    aliens[i].y = 10 + row * 13;
    aliens[i].vx = 0.65;
    aliens[i].alive = true;
  }
}

void spawnNextWave() {
  wave++;
  score += 150;
  float speedBoost = 0.65 + (wave * 0.12);
  for (int i = 0; i < ALIEN_COUNT; i++) {
    int col = i % 5;
    int row = i / 5;
    aliens[i].x = 8 + col * 24;
    aliens[i].y = 10 + row * 13;
    aliens[i].vx = (i % 2 == 0) ? speedBoost : -speedBoost;
    aliens[i].alive = true;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN_LEFT, INPUT_PULLUP);
  pinMode(PIN_BTN_RIGHT, INPUT_PULLUP);
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, 400000);
  u8g2.begin();
  u8g2.setDisplayRotation(U8G2_R2);
  u8g2.setContrast(255);
  initStars();
  initGame();
}

void loop() {
  uint32_t now = millis();
  if (now - lastFrameTime < 33) return;
  lastFrameTime = now;
  animTick++;

  bool leftPressed = (digitalRead(PIN_BTN_LEFT) == LOW);
  bool rightPressed = (digitalRead(PIN_BTN_RIGHT) == LOW);

  if (gameOver) {
    if (leftPressed || rightPressed) { initGame(); delay(250); }
  } else {
    if (leftPressed)  playerX -= 2.6;
    if (rightPressed) playerX += 2.6;
    if (playerX < 0) playerX = 0;
    if (playerX > 128 - 16) playerX = 128 - 16;

    if (now - lastShotTime > 300) {
      for (int i = 0; i < MAX_BULLETS; i++) {
        if (!bullets[i].active) {
          bullets[i].x = playerX + 7;
          bullets[i].y = 48;
          bullets[i].active = true;
          lastShotTime = now;
          break;
        }
      }
    }

    for (int i = 0; i < STAR_COUNT; i++) {
      stars[i].y += stars[i].speed;
      if (stars[i].y >= 64) { stars[i].y = 8; stars[i].x = random(0, 128); }
    }

    for (int i = 0; i < MAX_BULLETS; i++) {
      if (bullets[i].active) {
        bullets[i].y -= 3;
        if (bullets[i].y < 8) bullets[i].active = false;
      }
    }

    bool reverse = false;
    bool allDead = true;
    for (int i = 0; i < ALIEN_COUNT; i++) {
      if (aliens[i].alive) {
        allDead = false;
        aliens[i].x += aliens[i].vx;
        if (aliens[i].x <= 2 || aliens[i].x >= 128 - 18) reverse = true;
      }
    }

    if (reverse) {
      for (int i = 0; i < ALIEN_COUNT; i++) {
        aliens[i].vx = -aliens[i].vx;
        aliens[i].y += 3;
        if (aliens[i].alive && aliens[i].y >= 44) {
          gameOver = true;
          if (score > highScore) highScore = score;
        }
      }
    }

    if (allDead) spawnNextWave();

    for (int b = 0; b < MAX_BULLETS; b++) {
      if (!bullets[b].active) continue;
      for (int a = 0; a < ALIEN_COUNT; a++) {
        if (aliens[a].alive) {
          if (bullets[b].x >= aliens[a].x && bullets[b].x <= aliens[a].x + 16 &&
              bullets[b].y >= aliens[a].y && bullets[b].y <= aliens[a].y + 10) {
            aliens[a].alive = false;
            bullets[b].active = false;
            score += 20;
            if (score > highScore) highScore = score;
            break;
          }
        }
      }
    }
  }

  u8g2.clearBuffer();
  if (gameOver) {
    u8g2.setFont(u8g2_font_ncenB08_tr);
    u8g2.drawStr(24, 26, "GAME OVER");
    u8g2.setFont(u8g2_font_5x7_tr);
    u8g2.setCursor(30, 40); u8g2.print("SCORE: "); u8g2.print(score);
    u8g2.setCursor(26, 50); u8g2.print("HIGH: "); u8g2.print(highScore);
    u8g2.drawStr(14, 62, "PRESS ANY BUTTON");
  } else {
    for (int i = 0; i < STAR_COUNT; i++) u8g2.drawPixel(stars[i].x, stars[i].y);
    u8g2.setFont(u8g2_font_5x7_tr);
    u8g2.setCursor(2, 6); u8g2.print("SC:"); u8g2.print(score);
    u8g2.setCursor(52, 6); u8g2.print("W:"); u8g2.print(wave);
    u8g2.setCursor(94, 6); u8g2.print("HI:"); u8g2.print(highScore);
    u8g2.drawLine(0, 7, 128, 7);

    u8g2.drawBitmap((int)playerX, 52, 2, 12, bitmap_player);
    for (int i = 0; i < MAX_BULLETS; i++) {
      if (bullets[i].active) u8g2.drawVLine(bullets[i].x, bullets[i].y, 3);
    }
    const unsigned char* alienBitmap = ((animTick / 8) % 2 == 0) ? bitmap_alien_a : bitmap_alien_b;
    for (int i = 0; i < ALIEN_COUNT; i++) {
      if (aliens[i].alive) {
        u8g2.drawBitmap((int)aliens[i].x, (int)aliens[i].y, 2, 10, alienBitmap);
      }
    }
  }
  u8g2.sendBuffer();
}`,
  },
  {
    id: 'blueprint-reel-scrubber',
    name: 'Animation Reel Scrubber',
    description: 'Scrub, reverse, and play multi-frame 1-bit animations using an EC11 Rotary Encoder and push button.',
    category: 'Animation',
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    icon: '🎛️',
    targetBoard: 'esp32-devkit-v1-30p',
    display: {
      width: 128,
      height: 64,
      controller: 'SSD1306',
      driver: 'U8G2',
      i2cAddress: 0x3c,
      sdaGpio: 21,
      sclGpio: 22,
    },
    wiringPreset: 'reel_station',
    sprites: [],
    isTemplate: true,
    customCode: `// PixelForge — Animation Reel Station
#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

#define PIN_ENC_CLK 18
#define PIN_ENC_DT  19
#define PIN_ENC_SW  5

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, 22, 21);

void setup() {
  pinMode(PIN_ENC_CLK, INPUT_PULLUP);
  pinMode(PIN_ENC_DT, INPUT_PULLUP);
  pinMode(PIN_ENC_SW, INPUT_PULLUP);
  Wire.begin(21, 22, 400000);
  u8g2.begin();
}

void loop() {
  // Frame scrub logic
}`,
  },
  {
    id: 'blueprint-dual-hud',
    name: 'Dual OLED Telemetry Station',
    description: 'Multi-display instrument cluster with a 128×64 primary screen (0x3C) and 128×32 secondary HUD (0x3D).',
    category: 'HUD',
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    icon: '📟',
    targetBoard: 'esp32-devkit-v1-30p',
    display: {
      width: 128,
      height: 64,
      controller: 'SSD1306',
      driver: 'U8G2',
      i2cAddress: 0x3c,
      sdaGpio: 21,
      sclGpio: 22,
    },
    wiringPreset: 'dual_oled',
    sprites: [],
    isTemplate: true,
    customCode: `// PixelForge — Dual Display I2C Telemetry
#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

U8G2_SSD1306_128X64_NONAME_F_HW_I2C oledPrimary(U8G2_R0, U8X8_PIN_NONE, 22, 21);
U8G2_SSD1306_128X32_UNIVISION_F_HW_I2C oledSecondary(U8G2_R0, U8X8_PIN_NONE, 22, 21);

void setup() {
  Wire.begin(21, 22, 400000);
  oledPrimary.setI2CAddress(0x3C * 2);
  oledPrimary.begin();
  oledSecondary.setI2CAddress(0x3D * 2);
  oledSecondary.begin();
}

void loop() {
  // Dual screen rendering
}`,
  },
  {
    id: 'blueprint-blank-canvas',
    name: 'Blank Creative Project',
    description: 'Start from scratch with a clean slate for custom pinouts, drawings, and embedded C++ code.',
    category: 'Custom',
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    icon: '✨',
    targetBoard: 'esp32-devkit-v1-30p',
    display: {
      width: 128,
      height: 64,
      controller: 'SH1106',
      driver: 'U8G2',
      i2cAddress: 0x3c,
      sdaGpio: 21,
      sclGpio: 22,
    },
    wiringPreset: 'blank',
    sprites: [],
    isTemplate: true,
    customCode: `// PixelForge Custom Embedded Project
#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, 22, 21);

void setup() {
  Wire.begin(21, 22, 400000);
  u8g2.begin();
}

void loop() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(10, 32, "Hello PixelForge!");
  u8g2.sendBuffer();
  delay(1000);
}`,
  },
]

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<PixelForgeProject[]>([])
  const activeProjectId = ref<string>('project-space-shooter-1')

  // Active Project computed
  const activeProject = computed<PixelForgeProject>(() => {
    const found = projects.value.find((p) => p.id === activeProjectId.value)
    if (found) return found
    if (projects.value.length > 0) return projects.value[0]
    return BLUEPRINT_GALLERY[0]
  })

  // Load projects from localStorage or seed initial default user project
  function init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          projects.value = parsed
          const savedActiveId = localStorage.getItem(ACTIVE_PROJECT_KEY)
          if (savedActiveId && projects.value.some((p) => p.id === savedActiveId)) {
            activeProjectId.value = savedActiveId
          } else {
            activeProjectId.value = projects.value[0].id
          }
          return
        }
      }
    } catch (e) {
      console.warn('Failed to load user projects from storage:', e)
    }

    // Seed initial user projects from Space Shooter blueprint
    const seed: PixelForgeProject = {
      ...JSON.parse(JSON.stringify(BLUEPRINT_GALLERY[0])),
      id: 'project-space-shooter-1',
      name: 'Space Shooter Arcade',
      isTemplate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    projects.value = [seed]
    activeProjectId.value = seed.id
    persist()
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.value))
      localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId.value)
    } catch (e) {
      console.error('Failed to persist user projects:', e)
    }
  }

  function selectProject(id: string) {
    if (projects.value.some((p) => p.id === id)) {
      activeProjectId.value = id
      persist()
    }
  }

  function createProject(options: {
    name: string
    description?: string
    category?: PixelForgeProject['category']
    templateId?: string
  }): PixelForgeProject {
    let base = BLUEPRINT_GALLERY[3] // Blank by default
    if (options.templateId) {
      const foundTpl = BLUEPRINT_GALLERY.find((b) => b.id === options.templateId)
      if (foundTpl) base = foundTpl
    }

    const newId = `project-${Date.now().toString(36)}`
    const newProject: PixelForgeProject = {
      ...JSON.parse(JSON.stringify(base)),
      id: newId,
      name: options.name || 'Untitled Embedded Project',
      description: options.description || 'Custom PixelForge embedded hardware project.',
      category: options.category || base.category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isTemplate: false,
    }

    projects.value.unshift(newProject)
    activeProjectId.value = newId
    persist()
    return newProject
  }

  function cloneBlueprint(blueprintId: string): PixelForgeProject {
    const tpl = BLUEPRINT_GALLERY.find((b) => b.id === blueprintId) || BLUEPRINT_GALLERY[0]
    return createProject({
      name: `${tpl.name} (My Copy)`,
      description: tpl.description,
      category: tpl.category,
      templateId: tpl.id,
    })
  }

  function updateActiveProject(updates: Partial<PixelForgeProject>) {
    const proj = projects.value.find((p) => p.id === activeProjectId.value)
    if (proj) {
      Object.assign(proj, updates)
      proj.updatedAt = new Date().toISOString()
      persist()
    }
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id)
    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value.length > 0 ? projects.value[0].id : ''
    }
    persist()
  }

  function exportProjectJson(id: string): string {
    const proj = projects.value.find((p) => p.id === id) || activeProject.value
    return JSON.stringify(proj, null, 2)
  }

  function importProjectJson(jsonStr: string): PixelForgeProject | null {
    try {
      const parsed: PixelForgeProject = JSON.parse(jsonStr)
      if (parsed && parsed.name) {
        parsed.id = `project-${Date.now().toString(36)}`
        parsed.isTemplate = false
        parsed.updatedAt = new Date().toISOString()
        projects.value.unshift(parsed)
        activeProjectId.value = parsed.id
        persist()
        return parsed
      }
    } catch (e) {
      console.error('Failed to import project JSON:', e)
    }
    return null
  }

  return {
    projects,
    activeProjectId,
    activeProject,
    blueprints: BLUEPRINT_GALLERY,
    init,
    selectProject,
    createProject,
    cloneBlueprint,
    updateActiveProject,
    deleteProject,
    exportProjectJson,
    importProjectJson,
  }
})
