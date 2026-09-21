use serde::{Deserialize, Serialize};

pub const SOF: u8 = 0xAA;
pub const EOF: u8 = 0x55;
pub const PROTOCOL_VERSION: u8 = 0x01;

pub const CANONICAL_WIDTH: u16 = 128;
pub const CANONICAL_HEIGHT: u16 = 64;
pub const CANONICAL_FRAME_SIZE: usize = 1024; // 128 * 64 / 8 bytes

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    Ping = 0x01,
    GetDeviceInfo = 0x02,
    SendFrame = 0x03,
    ClearDisplay = 0x04,
}

impl Command {
    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResponseType {
    Pong = 0x81,
    DeviceInfo = 0x82,
    FrameAck = 0x83,
    ClearAck = 0x84,
    Error = 0xFF,
}

impl ResponseType {
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0x81 => Some(ResponseType::Pong),
            0x82 => Some(ResponseType::DeviceInfo),
            0x83 => Some(ResponseType::FrameAck),
            0x84 => Some(ResponseType::ClearAck),
            0xFF => Some(ResponseType::Error),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceInfo {
    pub protocol_version: u8,
    pub firmware_version: String,
    pub device_name: String,
    pub display_width: u16,
    pub display_height: u16,
    pub color_depth: u8,
    pub display_controller: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Packet {
    pub msg_type: u8,
    pub version: u8,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolError {
    Incomplete,
    InvalidSof(u8),
    InvalidVersion(u8),
    CrcMismatch { expected: u8, actual: u8 },
    InvalidEof(u8),
    PayloadTooLarge(usize),
}

impl std::fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProtocolError::Incomplete => write!(f, "Packet incomplete"),
            ProtocolError::InvalidSof(b) => write!(f, "Invalid SOF byte: 0x{:02X}", b),
            ProtocolError::InvalidVersion(v) => write!(f, "Unsupported protocol version: {}", v),
            ProtocolError::CrcMismatch { expected, actual } => {
                write!(f, "CRC mismatch: expected 0x{:02X}, calculated 0x{:02X}", expected, actual)
            }
            ProtocolError::InvalidEof(b) => write!(f, "Invalid EOF byte: 0x{:02X}", b),
            ProtocolError::PayloadTooLarge(len) => write!(f, "Payload too large: {} bytes", len),
        }
    }
}

impl std::error::Error for ProtocolError {}

/// Computes CRC-8 (SMBus / ATM / ITU-T standard).
/// Polynomial: 0x07 (x^8 + x^2 + x + 1)
/// Initial value: 0x00, Reflected: false, Final XOR: 0x00
pub fn compute_crc8(data: &[u8]) -> u8 {
    let mut crc: u8 = 0x00;
    for &byte in data {
        crc ^= byte;
        for _ in 0..8 {
            if (crc & 0x80) != 0 {
                crc = (crc << 1) ^ 0x07;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// Encodes a full packet into a byte vector with SOF, header, payload, CRC-8, and EOF.
pub fn encode_packet(msg_type: u8, payload: &[u8]) -> Vec<u8> {
    let length = payload.len() as u16;
    let mut buf = Vec::with_capacity(7 + payload.len());
    buf.push(SOF);
    buf.push(msg_type);
    buf.push(PROTOCOL_VERSION);
    buf.push((length >> 8) as u8);
    buf.push((length & 0xFF) as u8);
    buf.extend_from_slice(payload);

    // CRC covers: MSG_TYPE, VERSION, LENGTH_H, LENGTH_L, and PAYLOAD
    let crc = compute_crc8(&buf[1..buf.len()]);
    buf.push(crc);
    buf.push(EOF);
    buf
}

/// Attempts to decode a packet from a byte buffer.
/// Returns Ok((Packet, bytes_consumed)) if a valid packet is found,
/// or Err(ProtocolError::Incomplete) if more bytes are needed.
/// Automatically skips leading garbage bytes before SOF.
pub fn decode_packet(buffer: &[u8]) -> Result<(Packet, usize), ProtocolError> {
    // 1. Scan for SOF
    let mut start_idx = 0;
    while start_idx < buffer.len() && buffer[start_idx] != SOF {
        start_idx += 1;
    }

    if start_idx == buffer.len() {
        return Err(ProtocolError::Incomplete);
    }

    let slice = &buffer[start_idx..];

    // Minimum packet size: SOF(1) + TYPE(1) + VER(1) + LEN(2) + CRC(1) + EOF(1) = 7 bytes
    if slice.len() < 7 {
        return Err(ProtocolError::Incomplete);
    }

    let msg_type = slice[1];
    let version = slice[2];
    if version != PROTOCOL_VERSION {
        return Err(ProtocolError::InvalidVersion(version));
    }

    let payload_len = ((slice[3] as usize) << 8) | (slice[4] as usize);
    let total_packet_len = 7 + payload_len;

    // Check for extreme sizes
    if payload_len > 65535 {
        return Err(ProtocolError::PayloadTooLarge(payload_len));
    }

    if slice.len() < total_packet_len {
        return Err(ProtocolError::Incomplete);
    }

    // CRC covers slice[1 .. 5 + payload_len]
    let expected_crc = slice[5 + payload_len];
    let actual_crc = compute_crc8(&slice[1..5 + payload_len]);
    if expected_crc != actual_crc {
        return Err(ProtocolError::CrcMismatch {
            expected: expected_crc,
            actual: actual_crc,
        });
    }

    let eof = slice[6 + payload_len];
    if eof != EOF {
        return Err(ProtocolError::InvalidEof(eof));
    }

    let payload = slice[5..5 + payload_len].to_vec();
    let packet = Packet {
        msg_type,
        version,
        payload,
    };

    Ok((packet, start_idx + total_packet_len))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crc8_standard_vectors() {
        // Standard check: "123456789" with Poly 0x07, Init 0x00 -> 0xF4 (CRC-8/SMBus)
        let sample = b"123456789";
        assert_eq!(compute_crc8(sample), 0xF4);

        // Empty slice -> 0x00
        assert_eq!(compute_crc8(&[]), 0x00);

        // Single byte 0x00 -> 0x00
        assert_eq!(compute_crc8(&[0x00]), 0x00);

        // Single byte 0x01 -> 0x07
        assert_eq!(compute_crc8(&[0x01]), 0x07);
    }

    #[test]
    fn test_encode_decode_ping() {
        let encoded = encode_packet(Command::Ping.as_u8(), &[]);
        assert_eq!(encoded.len(), 7);
        assert_eq!(encoded[0], SOF);
        assert_eq!(encoded[1], 0x01); // Ping
        assert_eq!(encoded[2], PROTOCOL_VERSION);
        assert_eq!(encoded[3], 0x00); // Length high
        assert_eq!(encoded[4], 0x00); // Length low
        // CRC of [0x01, 0x01, 0x00, 0x00]
        let crc = compute_crc8(&[0x01, 0x01, 0x00, 0x00]);
        assert_eq!(encoded[5], crc);
        assert_eq!(encoded[6], EOF);

        let (decoded, consumed) = decode_packet(&encoded).expect("Should decode ping");
        assert_eq!(consumed, 7);
        assert_eq!(decoded.msg_type, 0x01);
        assert_eq!(decoded.version, PROTOCOL_VERSION);
        assert!(decoded.payload.is_empty());
    }

    #[test]
    fn test_decode_with_leading_garbage() {
        let mut stream = vec![0x12, 0x34, 0x56, 0xAA]; // garbage then SOF
        let packet_bytes = encode_packet(Command::ClearDisplay.as_u8(), &[]);
        // replace SOF in packet_bytes since stream already has 0xAA
        stream.extend_from_slice(&packet_bytes[1..]);

        let (decoded, consumed) = decode_packet(&stream).expect("Should recover and decode");
        assert_eq!(consumed, 3 + 7);
        assert_eq!(decoded.msg_type, Command::ClearDisplay.as_u8());
    }

    #[test]
    fn test_decode_crc_mismatch() {
        let mut encoded = encode_packet(Command::Ping.as_u8(), &[]);
        // Corrupt payload length or CRC
        encoded[5] ^= 0xFF;
        let res = decode_packet(&encoded);
        assert!(matches!(res, Err(ProtocolError::CrcMismatch { .. })));
    }

    #[test]
    fn test_decode_incomplete() {
        let encoded = encode_packet(Command::Ping.as_u8(), &[]);
        let partial = &encoded[..4];
        let res = decode_packet(partial);
        assert_eq!(res, Err(ProtocolError::Incomplete));
    }
}
