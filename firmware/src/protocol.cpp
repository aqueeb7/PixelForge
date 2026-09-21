#include "protocol.h"

ProtocolHandler::ProtocolHandler() {
    reset();
}

void ProtocolHandler::reset() {
    state = WAIT_SOF;
    bytesRead = 0;
    expectedCrc = 0;
    packetReady = false;
    currentPacket.length = 0;
}

bool ProtocolHandler::hasPacket() const {
    return packetReady;
}

const RxPacket& ProtocolHandler::getPacket() const {
    return currentPacket;
}

void ProtocolHandler::consumePacket() {
    packetReady = false;
    reset();
}

void ProtocolHandler::update() {
    if (packetReady) {
        return; // Wait until current packet is consumed by main dispatcher
    }

    while (Serial.available() > 0) {
        uint8_t byteIn = Serial.read();

        switch (state) {
            case WAIT_SOF:
                if (byteIn == PROTOCOL_SOF) {
                    state = READ_HEADER;
                    bytesRead = 0;
                }
                break;

            case READ_HEADER:
                headerBuf[bytesRead++] = byteIn;
                if (bytesRead == 4) {
                    currentPacket.msgType = headerBuf[0];
                    currentPacket.version = headerBuf[1];
                    currentPacket.length = ((uint16_t)headerBuf[2] << 8) | headerBuf[3];

                    // Check version
                    if (currentPacket.version != PROTOCOL_VERSION) {
                        reset();
                        break;
                    }

                    // Check length sanity
                    if (currentPacket.length > sizeof(currentPacket.payload)) {
                        reset();
                        break;
                    }

                    if (currentPacket.length == 0) {
                        state = READ_CRC;
                    } else {
                        state = READ_PAYLOAD;
                        bytesRead = 0;
                    }
                }
                break;

            case READ_PAYLOAD:
                currentPacket.payload[bytesRead++] = byteIn;
                if (bytesRead == currentPacket.length) {
                    state = READ_CRC;
                }
                break;

            case READ_CRC: {
                expectedCrc = byteIn;

                // Compute CRC over headerBuf (4 bytes) + payload
                uint8_t crc = 0x00;
                for (size_t i = 0; i < 4; i++) {
                    crc ^= headerBuf[i];
                    for (uint8_t b = 0; b < 8; b++) {
                        if (crc & 0x80) crc = (crc << 1) ^ 0x07;
                        else crc <<= 1;
                    }
                }
                for (size_t i = 0; i < currentPacket.length; i++) {
                    crc ^= currentPacket.payload[i];
                    for (uint8_t b = 0; b < 8; b++) {
                        if (crc & 0x80) crc = (crc << 1) ^ 0x07;
                        else crc <<= 1;
                    }
                }

                if (crc != expectedCrc) {
                    // CRC mismatch: reject packet and resync
                    reset();
                } else {
                    state = READ_EOF;
                }
                break;
            }

            case READ_EOF:
                if (byteIn == PROTOCOL_EOF) {
                    packetReady = true;
                    return;
                } else {
                    // Invalid EOF: resync
                    reset();
                }
                break;
        }
    }
}

void ProtocolHandler::sendPacket(uint8_t msgType, const uint8_t* payload, uint16_t length) {
    uint8_t header[5];
    header[0] = PROTOCOL_SOF;
    header[1] = msgType;
    header[2] = PROTOCOL_VERSION;
    header[3] = (length >> 8) & 0xFF;
    header[4] = length & 0xFF;

    // Compute CRC over [msgType, version, lenH, lenL, payload]
    uint8_t crc = 0x00;
    for (size_t i = 1; i < 5; i++) {
        crc ^= header[i];
        for (uint8_t b = 0; b < 8; b++) {
            if (crc & 0x80) crc = (crc << 1) ^ 0x07;
            else crc <<= 1;
        }
    }
    if (payload != nullptr && length > 0) {
        for (size_t i = 0; i < length; i++) {
            crc ^= payload[i];
            for (uint8_t b = 0; b < 8; b++) {
                if (crc & 0x80) crc = (crc << 1) ^ 0x07;
                else crc <<= 1;
            }
        }
    }

    Serial.write(header, 5);
    if (payload != nullptr && length > 0) {
        Serial.write(payload, length);
    }
    Serial.write(crc);
    Serial.write(PROTOCOL_EOF);
    Serial.flush();
}

void ProtocolHandler::sendPong() {
    uint8_t status = 0x00; // OK
    sendPacket(RESP_PONG, &status, 1);
}

void ProtocolHandler::sendDeviceInfo(const char* jsonStr) {
    sendPacket(RESP_DEVICE_INFO, (const uint8_t*)jsonStr, strlen(jsonStr));
}

void ProtocolHandler::sendFrameAck(uint8_t status) {
    sendPacket(RESP_FRAME_ACK, &status, 1);
}

void ProtocolHandler::sendClearAck(uint8_t status) {
    sendPacket(RESP_CLEAR_ACK, &status, 1);
}

void ProtocolHandler::sendTelemetry(uint32_t freeHeap, uint32_t minFreeHeap, uint32_t totalHeap,
                                    uint32_t uptimeSec, uint16_t fpsX10, uint8_t contrast,
                                    uint8_t wifiStatus, uint32_t frameCounter) {
    uint8_t payload[24];
    payload[0] = (freeHeap >> 24) & 0xFF;
    payload[1] = (freeHeap >> 16) & 0xFF;
    payload[2] = (freeHeap >> 8) & 0xFF;
    payload[3] = freeHeap & 0xFF;

    payload[4] = (minFreeHeap >> 24) & 0xFF;
    payload[5] = (minFreeHeap >> 16) & 0xFF;
    payload[6] = (minFreeHeap >> 8) & 0xFF;
    payload[7] = minFreeHeap & 0xFF;

    payload[8] = (totalHeap >> 24) & 0xFF;
    payload[9] = (totalHeap >> 16) & 0xFF;
    payload[10] = (totalHeap >> 8) & 0xFF;
    payload[11] = totalHeap & 0xFF;

    payload[12] = (uptimeSec >> 24) & 0xFF;
    payload[13] = (uptimeSec >> 16) & 0xFF;
    payload[14] = (uptimeSec >> 8) & 0xFF;
    payload[15] = uptimeSec & 0xFF;

    payload[16] = (fpsX10 >> 8) & 0xFF;
    payload[17] = fpsX10 & 0xFF;

    payload[18] = contrast;
    payload[19] = wifiStatus;

    payload[20] = (frameCounter >> 24) & 0xFF;
    payload[21] = (frameCounter >> 16) & 0xFF;
    payload[22] = (frameCounter >> 8) & 0xFF;
    payload[23] = frameCounter & 0xFF;

    sendPacket(RESP_TELEMETRY_DATA, payload, 24);
}

void ProtocolHandler::sendRestartAck(uint8_t status) {
    sendPacket(RESP_RESTART_ACK, &status, 1);
}

void ProtocolHandler::sendError(uint8_t errCode, const char* errMsg) {
    size_t msgLen = strlen(errMsg);
    uint8_t buf[128];
    buf[0] = errCode;
    size_t copyLen = msgLen > 120 ? 120 : msgLen;
    memcpy(&buf[1], errMsg, copyLen);
    sendPacket(RESP_ERROR, buf, 1 + copyLen);
}
