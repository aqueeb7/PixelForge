---
trigger: always_on
---

# ESP32 Rules

PixelForge targets an ESP32 connected to a monochrome I2C OLED.

Initial target:

OLED:
128x64
I2C
1-bit monochrome

---

# Firmware Architecture

The ESP32 firmware should be treated as a small device runtime.

Responsibilities:

WiFi
Device discovery
Command reception
Frame validation
Frame storage
OLED rendering
Animation playback

---

# Firmware must NOT

- depend on the desktop application's internal implementation
- assume a specific frontend
- require recompiling for every new drawing
- contain individual user drawings in source code

The firmware should be generic.

---

# Communication

Define a protocol before implementing complex communication.

Every message should have:

message type
version
payload length
payload

The protocol must allow future commands.

Possible commands:

PING
DEVICE_INFO
SEND_FRAME
SEND_ANIMATION
PLAY
STOP
CLEAR
SET_BRIGHTNESS

Do not implement all commands immediately.

---

# Hardware

Never assume GPIO pins.

The actual user's OLED wiring must be stored in the hardware profile.

Initial hardware profile should document:

SDA
SCL
VCC
GND
OLED controller
I2C address

The known display address should be verified before being treated as
a permanent hardware assumption.