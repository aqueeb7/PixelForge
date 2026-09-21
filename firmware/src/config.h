#pragma once
#include <Arduino.h>

// ==============================================================================
// PixelForge Hardware Configuration (Spec 002)
// ==============================================================================

// Wiring:
// OLED VCC -> ESP32 3V3
// OLED GND -> ESP32 GND
// OLED SCL -> GPIO 22
// OLED SDA -> GPIO 21
#define OLED_SDA 21
#define OLED_SCL 22
#define OLED_I2C_ADDR 0x3C

#define SERIAL_BAUD_RATE 115200

// ==============================================================================
// Display Controller Abstraction (U8g2)
// ==============================================================================
// 1.3" I2C OLED displays commonly use SH1106 or SSD1306.
// Select the appropriate controller macro below:
#define OLED_CONTROLLER_SH1106
// #define OLED_CONTROLLER_SSD1306

#if defined(OLED_CONTROLLER_SH1106)
  #define DISPLAY_CONTROLLER_NAME "SH1106"
#elif defined(OLED_CONTROLLER_SSD1306)
  #define DISPLAY_CONTROLLER_NAME "SSD1306"
#else
  #define DISPLAY_CONTROLLER_NAME "GENERIC_OLED"
#endif

// Canonical specifications
#define DISPLAY_WIDTH 128
#define DISPLAY_HEIGHT 64
#define DISPLAY_COLOR_DEPTH 1
#define CANONICAL_FRAME_SIZE 1024 // 128 * 64 / 8

#define PROTOCOL_VERSION 1
#define FIRMWARE_VERSION "0.1.0"
#define DEVICE_NAME "PixelForge-ESP32"
