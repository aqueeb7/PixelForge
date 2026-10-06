#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "config.h"
#include "protocol.h"
#include "display.h"

ProtocolHandler protocol;
DisplayDriver display;

static uint32_t totalFramesRendered = 0;
static uint32_t lastFrameRenderTime = 0;
static float smoothedFps = 0.0f;

// Autonomous Reel Animation Engine Variables
#define MAX_RAM_FRAMES 120
#define MAX_FLASH_REEL_FRAMES 1500
static uint8_t* reelFrames[MAX_RAM_FRAMES] = {nullptr};
static uint8_t streamFrameBuf[CANONICAL_FRAME_SIZE];
static uint16_t reelFrameCount = 0;
static uint16_t reelTargetFps = 15;
static uint32_t reelFrameIntervalMs = 66;
static bool isPlayingReel = false;
static uint16_t currentReelFrameIdx = 0;
static uint32_t lastReelFrameTime = 0;

static File activeReelWriteFile;
static File activeReelReadFile;
static bool littleFsReady = false;

// Helper to free memory allocated for RAM cache
void freeReelMemory() {
    for (int i = 0; i < MAX_RAM_FRAMES; i++) {
        if (reelFrames[i] != nullptr) {
            free(reelFrames[i]);
            reelFrames[i] = nullptr;
        }
    }
}

void openReelReadStream() {
    if (activeReelReadFile) {
        activeReelReadFile.close();
    }
    if (littleFsReady && LittleFS.exists("/reel.pfr")) {
        activeReelReadFile = LittleFS.open("/reel.pfr", "r");
    }
}

// Loads autonomous animation reel from LittleFS Flash partition
bool loadReelFromFlash() {
    if (!littleFsReady || !LittleFS.exists("/reel.pfr")) {
        return false;
    }
    File f = LittleFS.open("/reel.pfr", "r");
    if (!f || f.size() < 8) {
        if (f) f.close();
        return false;
    }

    uint8_t hdr[8];
    if (f.read(hdr, 8) != 8) {
        f.close();
        return false;
    }

    // Verify magic header "PFR1"
    if (hdr[0] != 'P' || hdr[1] != 'F' || hdr[2] != 'R' || hdr[3] != '1') {
        f.close();
        return false;
    }

    uint16_t savedCount = ((uint16_t)hdr[4] << 8) | hdr[5];
    uint16_t savedFps = ((uint16_t)hdr[6] << 8) | hdr[7];

    freeReelMemory();
    reelFrameCount = min((int)savedCount, MAX_FLASH_REEL_FRAMES);
    reelTargetFps = savedFps > 0 ? savedFps : 15;
    reelFrameIntervalMs = 1000 / reelTargetFps;

    // Cache initial frames in RAM for zero latency
    uint16_t ramFrames = min((int)reelFrameCount, MAX_RAM_FRAMES);
    for (int i = 0; i < ramFrames; i++) {
        reelFrames[i] = (uint8_t*)malloc(CANONICAL_FRAME_SIZE);
        if (reelFrames[i] != nullptr) {
            f.read(reelFrames[i], CANONICAL_FRAME_SIZE);
        } else {
            break;
        }
    }
    f.close();

    if (reelFrameCount > 0) {
        openReelReadStream();
        isPlayingReel = true;
        currentReelFrameIdx = 0;
        lastReelFrameTime = millis();
        return true;
    }
    return false;
}

void handleCommand(const RxPacket& packet) {
    switch (packet.msgType) {
        case CMD_PING:
            protocol.sendPong();
            break;

        case CMD_GET_DEVICE_INFO: {
            JsonDocument doc;
            doc["protocol_version"] = PROTOCOL_VERSION;
            doc["firmware_version"] = FIRMWARE_VERSION;
            doc["device_name"] = DEVICE_NAME;
            doc["display_width"] = DISPLAY_WIDTH;
            doc["display_height"] = DISPLAY_HEIGHT;
            doc["color_depth"] = DISPLAY_COLOR_DEPTH;
            doc["display_controller"] = DISPLAY_CONTROLLER_NAME;
            doc["flash_storage"] = littleFsReady ? "LittleFS" : "None";

            char jsonBuffer[256];
            serializeJson(doc, jsonBuffer);
            protocol.sendDeviceInfo(jsonBuffer);
            break;
        }

        case CMD_CLEAR_DISPLAY:
            if (activeReelWriteFile) {
                activeReelWriteFile.flush();
                activeReelWriteFile.close();
            }
            isPlayingReel = false;
            display.clear();
            protocol.sendClearAck(0x00);
            break;

        case CMD_SEND_FRAME:
            if (packet.length != CANONICAL_FRAME_SIZE) {
                protocol.sendFrameAck(0x01);
            } else {
                isPlayingReel = false;
                display.renderCanonicalFrame(packet.payload);
                protocol.sendFrameAck(0x00);

                totalFramesRendered++;
                uint32_t now = millis();
                if (lastFrameRenderTime > 0 && now > lastFrameRenderTime) {
                    float instantFps = 1000.0f / (float)(now - lastFrameRenderTime);
                    smoothedFps = (smoothedFps * 0.7f) + (instantFps * 0.3f);
                }
                lastFrameRenderTime = now;
            }
            break;

        case CMD_GET_TELEMETRY: {
            uint32_t freeH = ESP.getFreeHeap();
            uint32_t minH = ESP.getMinFreeHeap();
            uint32_t totalH = ESP.getHeapSize();
            uint32_t uptimeSec = millis() / 1000;
            uint16_t fpsX10 = (uint16_t)(smoothedFps * 10.0f);
            protocol.sendTelemetry(freeH, minH, totalH, uptimeSec, fpsX10, 255, 0, totalFramesRendered);
            break;
        }

        case CMD_RESTART_DEVICE: {
            protocol.sendRestartAck(0x00);
            delay(50);
            ESP.restart();
            break;
        }

        case CMD_START_REEL_UPLOAD: {
            if (packet.length >= 4) {
                isPlayingReel = false;
                freeReelMemory();

                uint16_t reqCount = ((uint16_t)packet.payload[0] << 8) | packet.payload[1];
                uint16_t reqFps = ((uint16_t)packet.payload[2] << 8) | packet.payload[3];
                reelFrameCount = min((int)reqCount, MAX_FLASH_REEL_FRAMES);
                reelTargetFps = reqFps > 0 ? reqFps : 15;
                reelFrameIntervalMs = 1000 / reelTargetFps;

                // Cache up to MAX_RAM_FRAMES in RAM for low latency
                uint16_t ramFrames = min((int)reelFrameCount, MAX_RAM_FRAMES);
                for (int i = 0; i < ramFrames; i++) {
                    reelFrames[i] = (uint8_t*)malloc(CANONICAL_FRAME_SIZE);
                    if (reelFrames[i] == nullptr) break;
                }
                currentReelFrameIdx = 0;

                // Open persistent flash file to save this reel non-volatile across power cycles
                if (littleFsReady) {
                    if (activeReelWriteFile) activeReelWriteFile.close();
                    if (activeReelReadFile) activeReelReadFile.close();
                    activeReelWriteFile = LittleFS.open("/reel.pfr", "w");
                    if (activeReelWriteFile) {
                        uint8_t hdr[8] = {
                            'P', 'F', 'R', '1',
                            (uint8_t)(reelFrameCount >> 8), (uint8_t)(reelFrameCount & 0xFF),
                            (uint8_t)(reelTargetFps >> 8), (uint8_t)(reelTargetFps & 0xFF)
                        };
                        activeReelWriteFile.write(hdr, 8);
                    }
                }

                if (reelFrameCount > 0) {
                    uint8_t ackPayload[2] = {
                        (uint8_t)(reelFrameCount >> 8),
                        (uint8_t)(reelFrameCount & 0xFF)
                    };
                    protocol.sendPacket(RESP_REEL_UPLOAD_ACK, ackPayload, 2);
                } else {
                    protocol.sendError(0x05, "Insufficient memory on ESP32 for reel");
                }
            } else {
                protocol.sendError(0x02, "Invalid reel start payload");
            }
            break;
        }

        case CMD_APPEND_REEL_FRAME: {
            if (packet.length >= 2 + CANONICAL_FRAME_SIZE) {
                uint16_t fIdx = ((uint16_t)packet.payload[0] << 8) | packet.payload[1];
                if (fIdx < reelFrameCount) {
                    if (fIdx < MAX_RAM_FRAMES && reelFrames[fIdx] != nullptr) {
                        memcpy(reelFrames[fIdx], &packet.payload[2], CANONICAL_FRAME_SIZE);
                    }

                    // Always write frame to persistent LittleFS file
                    if (activeReelWriteFile) {
                        activeReelWriteFile.write(&packet.payload[2], CANONICAL_FRAME_SIZE);
                    }

                    protocol.sendPacket(RESP_REEL_FRAME_ACK, nullptr, 0);
                } else {
                    protocol.sendPacket(RESP_REEL_FRAME_ACK, nullptr, 0);
                }
            } else {
                protocol.sendError(0x04, "Invalid reel frame payload length");
            }
            break;
        }

        case CMD_PLAY_REEL: {
            if (activeReelWriteFile) {
                activeReelWriteFile.flush();
                activeReelWriteFile.close();
            }
            openReelReadStream();

            if (packet.length >= 2) {
                uint16_t reqFps = ((uint16_t)packet.payload[0] << 8) | packet.payload[1];
                if (reqFps > 0) {
                    reelTargetFps = reqFps;
                    reelFrameIntervalMs = 1000 / reelTargetFps;
                }
            }
            isPlayingReel = true;
            currentReelFrameIdx = 0;
            lastReelFrameTime = millis();
            protocol.sendPacket(RESP_PLAY_REEL_ACK, nullptr, 0);
            break;
        }

        case CMD_STOP_REEL: {
            if (activeReelWriteFile) {
                activeReelWriteFile.flush();
                activeReelWriteFile.close();
            }
            if (activeReelReadFile) {
                activeReelReadFile.close();
            }
            isPlayingReel = false;
            protocol.sendPacket(RESP_STOP_REEL_ACK, nullptr, 0);
            break;
        }

        default:
            protocol.sendError(0x01, "Unsupported command");
            break;
    }
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(50);

    display.init();
    display.clear();

    // Mount LittleFS flash file system (auto-formats partition on first run if unformatted)
    littleFsReady = LittleFS.begin(true);

    // If an autonomous reel was previously uploaded and saved to flash, auto-play immediately!
    if (littleFsReady) {
        loadReelFromFlash();
    }
}

void loop() {
    protocol.update();

    if (protocol.hasPacket()) {
        handleCommand(protocol.getPacket());
        protocol.consumePacket();
    }

    // Autonomous Reel Playback Engine (loops autonomously across power cycles)
    if (isPlayingReel && reelFrameCount > 0) {
        uint32_t now = millis();
        if (now - lastReelFrameTime >= reelFrameIntervalMs) {
            lastReelFrameTime = now;
            if (currentReelFrameIdx < MAX_RAM_FRAMES && reelFrames[currentReelFrameIdx] != nullptr) {
                display.renderCanonicalFrame(reelFrames[currentReelFrameIdx]);
            } else if (activeReelReadFile) {
                uint32_t offset = 8 + (uint32_t)currentReelFrameIdx * CANONICAL_FRAME_SIZE;
                if (activeReelReadFile.seek(offset)) {
                    activeReelReadFile.read(streamFrameBuf, CANONICAL_FRAME_SIZE);
                    display.renderCanonicalFrame(streamFrameBuf);
                }
            }
            currentReelFrameIdx = (currentReelFrameIdx + 1) % reelFrameCount;
            totalFramesRendered++;
        }
    }
}
