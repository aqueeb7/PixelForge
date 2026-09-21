#pragma once
#include <Arduino.h>

/**
 * CRC-8 (SMBus / ATM / ITU-T standard).
 * Polynomial: 0x07 (x^8 + x^2 + x + 1)
 * Initial value: 0x00
 * Input reflected: false
 * Output reflected: false
 * Final XOR: 0x00
 */
inline uint8_t compute_crc8(const uint8_t* data, size_t len) {
    uint8_t crc = 0x00;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t b = 0; b < 8; b++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x07;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}
