use crate::protocol::{decode_packet, Packet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DemuxEvent {
    Packet(Packet),
    Bootloader(String),
    LogLine(String),
}

pub struct StreamDemuxer {
    buffer: Vec<u8>,
}

impl StreamDemuxer {
    pub fn new() -> Self {
        Self {
            buffer: Vec::with_capacity(2048),
        }
    }

    /// Appends incoming raw bytes and returns all recognized demux events.
    pub fn feed(&mut self, data: &[u8]) -> Vec<DemuxEvent> {
        self.buffer.extend_from_slice(data);
        let mut events = Vec::new();

        loop {
            if self.buffer.is_empty() {
                break;
            }

            // 1. If buffer starts with SOF (0xAA), try decoding a structured protocol packet
            if self.buffer[0] == crate::protocol::SOF {
                match decode_packet(&self.buffer) {
                    Ok((packet, consumed)) => {
                        events.push(DemuxEvent::Packet(packet));
                        self.buffer.drain(0..consumed);
                        continue;
                    }
                    Err(crate::protocol::ProtocolError::Incomplete) => {
                        // Wait for remaining packet bytes to arrive
                        break;
                    }
                    Err(_) => {
                        // Invalid packet header/CRC starting at this SOF, drop the bad SOF
                        self.buffer.remove(0);
                        continue;
                    }
                }
            }

            // 2. Not starting with SOF: check for newline to extract log or bootloader line
            if let Some(nl_idx) = self.buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = &self.buffer[0..nl_idx];
                let line_str = String::from_utf8_lossy(line_bytes)
                    .trim_end_matches('\r')
                    .to_string();

                if !line_str.is_empty() {
                    if Self::is_bootloader_line(&line_str) {
                        events.push(DemuxEvent::Bootloader(line_str));
                    } else {
                        events.push(DemuxEvent::LogLine(line_str));
                    }
                }

                self.buffer.drain(0..=nl_idx);
                continue;
            }

            // 3. If there is an SOF later in the buffer, drop stale non-packet prefix up to SOF
            if let Some(sof_pos) = self.buffer.iter().position(|&b| b == crate::protocol::SOF) {
                let line_bytes = &self.buffer[0..sof_pos];
                let line_str = String::from_utf8_lossy(line_bytes)
                    .trim_end_matches('\r')
                    .trim_end()
                    .to_string();
                if !line_str.is_empty() {
                    events.push(DemuxEvent::LogLine(line_str));
                }
                self.buffer.drain(0..sof_pos);
                continue;
            }

            // 3. Prevent buffer explosion if binary garbage without newlines arrives
            if self.buffer.len() > 4096 {
                self.buffer.drain(0..1024);
            }

            break;
        }

        events
    }

    fn is_bootloader_line(s: &str) -> bool {
        let lower = s.to_lowercase();
        lower.contains("rst:")
            || lower.contains("boot:")
            || lower.contains("ets ")
            || lower.contains("flash read")
            || lower.contains("waiting for download")
            || lower.contains("chip is esp32")
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{encode_packet, Command, PROTOCOL_VERSION};

    #[test]
    fn test_demux_log_line() {
        let mut demux = StreamDemuxer::new();
        let events = demux.feed(b"[INFO] PixelForge firmware initialized\r\n");
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0],
            DemuxEvent::LogLine("[INFO] PixelForge firmware initialized".to_string())
        );
    }

    #[test]
    fn test_demux_bootloader_line() {
        let mut demux = StreamDemuxer::new();
        let events = demux.feed(b"rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n");
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], DemuxEvent::Bootloader(_)));
    }

    #[test]
    fn test_demux_packet() {
        let mut demux = StreamDemuxer::new();
        let packet_bytes = encode_packet(Command::Ping.as_u8(), &[]);
        let events = demux.feed(&packet_bytes);
        assert_eq!(events.len(), 1);
        if let DemuxEvent::Packet(pkt) = &events[0] {
            assert_eq!(pkt.msg_type, Command::Ping.as_u8());
            assert_eq!(pkt.version, PROTOCOL_VERSION);
        } else {
            panic!("Expected packet event");
        }
    }

    #[test]
    fn test_demux_interleaved_traffic() {
        let mut demux = StreamDemuxer::new();
        let mut stream = Vec::new();
        stream.extend_from_slice(b"boot:0x13\n");
        stream.extend_from_slice(&encode_packet(Command::ClearDisplay.as_u8(), &[]));
        stream.extend_from_slice(b"Display cleared successfully\r\n");

        let events = demux.feed(&stream);
        assert_eq!(events.len(), 3);
        assert!(matches!(events[0], DemuxEvent::Bootloader(_)));
        assert!(matches!(events[1], DemuxEvent::Packet(_)));
        assert_eq!(
            events[2],
            DemuxEvent::LogLine("Display cleared successfully".to_string())
        );
    }
}
