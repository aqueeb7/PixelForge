#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "protocol.h"
#include "display.h"

ProtocolHandler protocol;
DisplayDriver display;

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
            }
            break;

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
}
