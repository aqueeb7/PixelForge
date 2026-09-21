#include "display.h"

#if defined(OLED_CONTROLLER_SSD1306)
DisplayDriver::DisplayDriver()
    : u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE, /* clock=*/ OLED_SCL, /* data=*/ OLED_SDA) {}
#else
DisplayDriver::DisplayDriver()
    : u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE, /* clock=*/ OLED_SCL, /* data=*/ OLED_SDA) {}
#endif

bool DisplayDriver::init() {
    Wire.begin(OLED_SDA, OLED_SCL);
    // U8g2 expects the 8-bit I2C address (0x3C << 1 = 0x78)
    u8g2.setI2CAddress(OLED_I2C_ADDR << 1);
    bool ok = u8g2.begin();
    u8g2.clearBuffer();
    u8g2.sendBuffer();
    return ok;
}

void DisplayDriver::clear() {
    u8g2.clearBuffer();
    u8g2.sendBuffer();
}

void DisplayDriver::renderCanonicalFrame(const uint8_t* canonicalFrame) {
    u8g2.clearBuffer();

    // Canonical layout: 128 cols x 64 rows, 16 bytes per row, MSB-first
    for (uint16_t y = 0; y < DISPLAY_HEIGHT; y++) {
        uint16_t rowOffset = y * 16;
        for (uint16_t xByte = 0; xByte < 16; xByte++) {
            uint8_t b = canonicalFrame[rowOffset + xByte];
            if (b == 0) continue; // Skip empty bytes for speed

            uint16_t baseX = xByte * 8;
            for (uint8_t bit = 0; bit < 8; bit++) {
                if (b & (0x80 >> bit)) {
                    u8g2.drawPixel(baseX + bit, y);
                }
            }
        }
    }

    u8g2.sendBuffer();
}
