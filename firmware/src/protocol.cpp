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

void ProtocolHandler::sendError(uint8_t errCode, const char* errMsg) {
    size_t msgLen = strlen(errMsg);
    uint8_t buf[128];
    buf[0] = errCode;
    size_t copyLen = msgLen > 120 ? 120 : msgLen;
    memcpy(&buf[1], errMsg, copyLen);
    sendPacket(RESP_ERROR, buf, 1 + copyLen);
}
