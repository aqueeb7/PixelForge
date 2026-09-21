#pragma once
#include <Arduino.h>
#include "config.h"
#include "crc8.h"

#define PROTOCOL_SOF 0xAA
#define PROTOCOL_EOF 0x55

// Host Commands
enum CommandType : uint8_t {
    CMD_PING = 0x01,
    CMD_GET_DEVICE_INFO = 0x02,
    CMD_SEND_FRAME = 0x03,
    CMD_CLEAR_DISPLAY = 0x04
};

// Device Responses (High-bit convention: 0x80 | CMD)
enum ResponseType : uint8_t {
    RESP_PONG = 0x81,
    RESP_DEVICE_INFO = 0x82,
    RESP_FRAME_ACK = 0x83,
    RESP_CLEAR_ACK = 0x84,
    RESP_ERROR = 0xFF
};

struct RxPacket {
    uint8_t msgType;
    uint8_t version;
    uint16_t length;
    uint8_t payload[CANONICAL_FRAME_SIZE + 64]; // Fits canonical 1024-byte frame
};

class ProtocolHandler {
public:
    ProtocolHandler();
    void update();
    bool hasPacket() const;
    const RxPacket& getPacket() const;
    void consumePacket();

    void sendPacket(uint8_t msgType, const uint8_t* payload, uint16_t length);
    void sendPong();
    void sendDeviceInfo(const char* jsonStr);
    void sendFrameAck(uint8_t status);
    void sendClearAck(uint8_t status);
    void sendError(uint8_t errCode, const char* errMsg);

private:
    enum State {
        WAIT_SOF,
        READ_HEADER,
        READ_PAYLOAD,
        READ_CRC,
        READ_EOF
    };

    State state;
    RxPacket currentPacket;
    uint16_t bytesRead;
    uint8_t headerBuf[4]; // msgType, version, lenH, lenL
    uint8_t expectedCrc;
    bool packetReady;

    void reset();
};
