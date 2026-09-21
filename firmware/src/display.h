#pragma once
#include <Arduino.h>
#include <U8g2lib.h>
#include <Wire.h>
#include "config.h"

class DisplayDriver {
public:
    DisplayDriver();
    bool init();
    void clear();
    void renderCanonicalFrame(const uint8_t* canonicalFrame);

private:
#if defined(OLED_CONTROLLER_SSD1306)
    U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2;
#else
    // Default: SH1106 for 1.3" I2C OLED
    U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2;
#endif
};
