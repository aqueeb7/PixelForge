// ==============================================================================
// PixelForge Embedded Arcade — ESP32 Space Shooter (Blueprint Project)
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

// --- PIN ASSIGNMENTS ---
#define PIN_OLED_SDA  21
#define PIN_OLED_SCL  22
#define PIN_BTN_LEFT  18  // Button 1: Move Left
#define PIN_BTN_RIGHT 19  // Button 2: Move Right / Fire

// --- DISPLAY CONTROLLER (1.3" SH1106) ---
// U8G2_R2 rotates display by 180° for upside-down breadboard mounting!
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R2, /* reset=*/ U8X8_PIN_NONE, PIN_OLED_SCL, PIN_OLED_SDA);

// --- 1-BIT SPRITES IN PROGMEM (MSB First, 2 bytes = 16 pixels per row) ---
// 16x12 Player Interceptor Ship (MSB-first format)
const unsigned char PROGMEM bitmap_player[] = {
  0x01, 0x80, // ..##....##......
  0x03, 0xC0, // ..####..####....
  0x07, 0xE0, // .######..######..
  0x07, 0xE0, // .######..######..
  0x0F, 0xF0, // ################
  0x1F, 0xF8, // ################
  0x3F, 0xFC, // ################
  0x7F, 0xFE, // ################
  0xFF, 0xFF, // ################
  0xEF, 0xF7, // ###..######..###
  0xC6, 0x63, // ##...##..##...##
  0x40, 0x02  // .#..............#.
};

// 16x10 Alien Invader Frame A (Wings Open, MSB-first format)
const unsigned char PROGMEM bitmap_alien_a[] = {
  0x0C, 0x30, // ....##....##....
  0x03, 0xC0, // ......####......
  0x0F, 0xF0, // ....########....
  0x3F, 0xFC, // ..############..
  0x33, 0xCC, // ..##..####..##.. (eyes)
  0x3F, 0xFC, // ..############..
  0x0F, 0xF0, // ....########....
  0x33, 0xCC, // ..##..####..##..
  0xC0, 0x03, // ##............##
  0xC0, 0x03  // ##............##
};

// 16x10 Alien Invader Frame B (Wings Closed, MSB-first format)
const unsigned char PROGMEM bitmap_alien_b[] = {
  0xC0, 0x03, // ##............##
  0x0C, 0x30, // ....##....##....
  0x0F, 0xF0, // ....########....
  0x3F, 0xFC, // ..############..
  0x33, 0xCC, // ..##..####..##.. (eyes)
  0x3F, 0xFC, // ..############..
  0x0F, 0xF0, // ....########....
  0x03, 0xC0, // ......####......
  0x0C, 0x30, // ....##....##....
  0x30, 0x0C  // ..##........##..
};

// --- GAME ENTITIES ---
struct Bullet {
  int8_t x, y;
  bool active;
};

struct Alien {
  float x, y;
  float vx;
  bool alive;
};

struct Star {
  int8_t x, y;
  uint8_t speed;
};

#define MAX_BULLETS 4
#define ALIEN_COUNT 10  // 2 rows of 5 aliens spanning full 128px screen!
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
  
  // 10 Aliens: 2 rows of 5 aliens evenly distributed from x=8 to x=120
  for (int i = 0; i < ALIEN_COUNT; i++) {
    int col = i % 5;
    int row = i / 5;
    aliens[i].x = 8 + col * 24;  // 8, 32, 56, 80, 104 (spans 8px to 120px)
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
  delay(150);
  Serial.println("\n\n========================================");
  Serial.println("    PIXELFORGE EMBEDDED ARCADE");
  Serial.println("  SPACE SHOOTER v1.1 (180° FLIP & FULL ALIEN FIX)");
  Serial.println("========================================");
  Serial.println("[INIT] Controller: SH1106 (1.3\" OLED)");
  Serial.println("[INIT] Display Orientation: 180° Rotated (U8G2_R2)");

  // Configure Button Pins with Internal Pull-Ups
  pinMode(PIN_BTN_LEFT, INPUT_PULLUP);
  pinMode(PIN_BTN_RIGHT, INPUT_PULLUP);

  // Initialize Hardware I2C at 400kHz
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, 400000);

  // Initialize SH1106 U8g2 Display Driver with 180° rotation
  u8g2.begin();
  u8g2.setDisplayRotation(U8G2_R2); // 180° flip for inverted mounting
  u8g2.setContrast(255);            // Max brightness
  u8g2.clearBuffer();

  // Splash Screen Display
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.drawStr(22, 24, "PIXELFORGE");
  u8g2.setFont(u8g2_font_5x7_tr);
  u8g2.drawStr(26, 38, "SPACE SHOOTER");
  // Draw 16x12 Player Ship in Center using drawBitmap (MSB-first)
  u8g2.drawBitmap(56, 44, 2, 12, bitmap_player);
  u8g2.sendBuffer();

  Serial.println("[INIT] Splash screen rendered right-side up!");
  delay(1200);

  initStars();
  initGame();
  Serial.println("[INIT] Game started! 10 Aliens deployed across full screen width.");
}

void loop() {
  uint32_t now = millis();
  if (now - lastFrameTime < 33) return; // ~30 FPS Cap
  lastFrameTime = now;
  animTick++;

  // Read Inputs (Active LOW with internal pull-up)
  bool leftPressed = (digitalRead(PIN_BTN_LEFT) == LOW);
  bool rightPressed = (digitalRead(PIN_BTN_RIGHT) == LOW);

  if (gameOver) {
    if (leftPressed || rightPressed) {
      Serial.println("[GAME] Restarting new game session...");
      initGame();
      delay(250);
    }
  } else {
    // Player Movement (16px ship bounded inside 0..112)
    if (leftPressed)  playerX -= 2.6;
    if (rightPressed) playerX += 2.6;
    if (playerX < 0) playerX = 0;
    if (playerX > 128 - 16) playerX = 128 - 16;

    // Continuous Auto-Fire
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

    // Update Stars (Twinkling background)
    for (int i = 0; i < STAR_COUNT; i++) {
      stars[i].y += stars[i].speed;
      if (stars[i].y >= 64) {
        stars[i].y = 8;
        stars[i].x = random(0, 128);
      }
    }

    // Update Bullets
    for (int i = 0; i < MAX_BULLETS; i++) {
      if (bullets[i].active) {
        bullets[i].y -= 3;
        if (bullets[i].y < 8) bullets[i].active = false;
      }
    }

    // Update Aliens (16px width each, bounce off 2..110)
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
          Serial.println("[GAME] Aliens reached defense base! Game Over.");
          gameOver = true;
          if (score > highScore) highScore = score;
        }
      }
    }

    if (allDead) {
      Serial.printf("[GAME] Wave %d cleared! Bonus +150\n", wave);
      spawnNextWave();
    }

    // Collision Detection (Bullets vs 16x10 Aliens)
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

  // --- OLED RENDERING (SH1106 Full Buffer with U8G2_R2 180° Rotation) ---
  u8g2.clearBuffer();

  if (gameOver) {
    u8g2.setFont(u8g2_font_ncenB08_tr);
    u8g2.drawStr(24, 26, "GAME OVER");
    u8g2.setFont(u8g2_font_5x7_tr);
    u8g2.setCursor(30, 40);
    u8g2.print("SCORE: ");
    u8g2.print(score);
    u8g2.setCursor(26, 50);
    u8g2.print("HIGH: ");
    u8g2.print(highScore);
    u8g2.drawStr(14, 62, "PRESS ANY BUTTON");
  } else {
    // Background Stars
    for (int i = 0; i < STAR_COUNT; i++) {
      u8g2.drawPixel(stars[i].x, stars[i].y);
    }

    // HUD Header
    u8g2.setFont(u8g2_font_5x7_tr);
    u8g2.setCursor(2, 6);
    u8g2.print("SC:");
    u8g2.print(score);
    u8g2.setCursor(52, 6);
    u8g2.print("W:");
    u8g2.print(wave);
    u8g2.setCursor(94, 6);
    u8g2.print("HI:");
    u8g2.print(highScore);
    u8g2.drawLine(0, 7, 128, 7);

    // Draw Player Ship (16x12, 2 bytes wide, MSB first)
    u8g2.drawBitmap((int)playerX, 52, 2, 12, bitmap_player);

    // Draw Bullets
    for (int i = 0; i < MAX_BULLETS; i++) {
      if (bullets[i].active) {
        u8g2.drawVLine(bullets[i].x, bullets[i].y, 3);
      }
    }

    // Draw 10 Aliens with animated flapping wings (16x10, 2 bytes wide, MSB first)
    const unsigned char* alienBitmap = ((animTick / 8) % 2 == 0) ? bitmap_alien_a : bitmap_alien_b;
    for (int i = 0; i < ALIEN_COUNT; i++) {
      if (aliens[i].alive) {
        u8g2.drawBitmap((int)aliens[i].x, (int)aliens[i].y, 2, 10, alienBitmap);
      }
    }
  }

  u8g2.sendBuffer();
}
