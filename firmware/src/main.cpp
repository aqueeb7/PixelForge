#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "protocol.h"
#include "display.h"

ProtocolHandler protocol;
DisplayDriver display;

static uint32_t totalFramesRendered = 0;
static uint32_t lastFrameRenderTime = 0;
static float smoothedFps = 0.0f;

// Autonomous Reel Animation Engine Variables
#define MAX_REEL_FRAMES 150
static uint8_t* reelFrames[MAX_REEL_FRAMES] = {nullptr};
static uint16_t reelFrameCount = 0;
static uint16_t reelTargetFps = 15;
static uint32_t reelFrameIntervalMs = 66;
static bool isPlayingReel = false;
static uint16_t currentReelFrameIdx = 0;
static uint32_t lastReelFrameTime = 0;

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

            char jsonBuffer[256];
            serializeJson(doc, jsonBuffer);
            protocol.sendDeviceInfo(jsonBuffer);
            break;
        }

        case CMD_CLEAR_DISPLAY:
            display.clear();
            protocol.sendClearAck(0x00);
            break;

        case CMD_SEND_FRAME:
            if (packet.length != CANONICAL_FRAME_SIZE) {
                // Length mismatch
                protocol.sendFrameAck(0x01);
            } else {
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
                for (int i = 0; i < MAX_REEL_FRAMES; i++) {
                    if (reelFrames[i] != nullptr) {
                        free(reelFrames[i]);
                        reelFrames[i] = nullptr;
                    }
                }
                uint16_t reqCount = ((uint16_t)packet.payload[0] << 8) | packet.payload[1];
                uint16_t reqFps = ((uint16_t)packet.payload[2] << 8) | packet.payload[3];
                reelFrameCount = min((int)reqCount, MAX_REEL_FRAMES);
                reelTargetFps = reqFps > 0 ? reqFps : 15;
                reelFrameIntervalMs = 1000 / reelTargetFps;

                int allocated = 0;
                for (int i = 0; i < reelFrameCount; i++) {
                    reelFrames[i] = (uint8_t*)malloc(CANONICAL_FRAME_SIZE);
                    if (reelFrames[i] != nullptr) {
                        allocated++;
                    } else {
                        reelFrameCount = allocated;
                        break;
                    }
                }
                currentReelFrameIdx = 0;
                if (reelFrameCount > 0) {
                    uint8_t ackPayload[2] = {
                        (uint8_t)(reelFrameCount >> 8),
                        (uint8_t)(reelFrameCount & 0xFF)
                    };
                    protocol.sendPacket(RESP_REEL_UPLOAD_ACK, ackPayload, 2);
                } else {
                    protocol.sendError(0x05, "Insufficient RAM on ESP32 for reel");
                }
            } else {
                protocol.sendError(0x02, "Invalid reel start payload");
            }
            break;
        }

        case CMD_APPEND_REEL_FRAME: {
            if (packet.length >= 2 + CANONICAL_FRAME_SIZE) {
                uint16_t fIdx = ((uint16_t)packet.payload[0] << 8) | packet.payload[1];
                if (fIdx < reelFrameCount && reelFrames[fIdx] != nullptr) {
                    memcpy(reelFrames[fIdx], &packet.payload[2], CANONICAL_FRAME_SIZE);
                    protocol.sendPacket(RESP_REEL_FRAME_ACK, nullptr, 0);
                } else if (fIdx >= reelFrameCount) {
                    // Gracefully absorb surplus frames that exceed ESP32 capacity
                    protocol.sendPacket(RESP_REEL_FRAME_ACK, nullptr, 0);
                } else {
                    protocol.sendError(0x03, "Reel frame index out of range or unallocated");
                }
            } else {
                protocol.sendError(0x04, "Invalid reel frame payload length");
            }
            break;
        }

        case CMD_PLAY_REEL: {
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
    // Give serial a brief settling time
    delay(50);

    display.init();
    display.clear();
}

void loop() {
    protocol.update();

    if (protocol.hasPacket()) {
        handleCommand(protocol.getPacket());
        protocol.consumePacket();
    }

    // Autonomous Reel Playback Engine
    if (isPlayingReel && reelFrameCount > 0) {
        uint32_t now = millis();
        if (now - lastReelFrameTime >= reelFrameIntervalMs) {
            lastReelFrameTime = now;
            if (reelFrames[currentReelFrameIdx] != nullptr) {
                display.renderCanonicalFrame(reelFrames[currentReelFrameIdx]);
            }
            currentReelFrameIdx = (currentReelFrameIdx + 1) % reelFrameCount;
            totalFramesRendered++;
        }
    }
}
