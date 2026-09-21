use std::io::{Read, Write};
use std::time::Duration;
use serialport::SerialPort;

use super::transport::{DeviceTransport, TransportError};

pub struct SerialTransport {
    port: Option<Box<dyn SerialPort>>,
    port_name: String,
    baud_rate: u32,
}

impl SerialTransport {
    pub fn new(port_name: &str, baud_rate: u32) -> Self {
        Self {
            port: None,
            port_name: port_name.to_string(),
            baud_rate,
        }
    }

    pub fn open(&mut self, timeout: Duration) -> Result<(), TransportError> {
        let port = serialport::new(&self.port_name, self.baud_rate)
            .timeout(timeout)
            .open()
            .map_err(|e| TransportError::IoError(format!("Failed to open port '{}': {}", self.port_name, e)))?;

        self.port = Some(port);
        Ok(())
    }

    pub fn port_name(&self) -> &str {
        &self.port_name
    }

    pub fn baud_rate(&self) -> u32 {
        self.baud_rate
    }
}

impl DeviceTransport for SerialTransport {
    fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let port = self.port.as_mut().ok_or(TransportError::NotConnected)?;
        port.write_all(data)
            .map_err(|e| TransportError::IoError(e.to_string()))?;
        port.flush()
            .map_err(|e| TransportError::IoError(e.to_string()))?;
        Ok(())
    }

    fn receive(&mut self, buf: &mut [u8]) -> Result<usize, TransportError> {
        let port = self.port.as_mut().ok_or(TransportError::NotConnected)?;
        match port.read(buf) {
            Ok(bytes_read) => Ok(bytes_read),
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Err(TransportError::Timeout),
            Err(e) => Err(TransportError::IoError(e.to_string())),
        }
    }

    fn set_baud_rate(&mut self, baud: u32) -> Result<(), TransportError> {
        let port = self.port.as_mut().ok_or(TransportError::NotConnected)?;
        port.set_baud_rate(baud)
            .map_err(|_| TransportError::BaudRateUnsupported(baud))?;
        self.baud_rate = baud;
        Ok(())
    }

    fn set_timeout(&mut self, timeout: Duration) -> Result<(), TransportError> {
        let port = self.port.as_mut().ok_or(TransportError::NotConnected)?;
        port.set_timeout(timeout)
            .map_err(|e| TransportError::IoError(e.to_string()))?;
        Ok(())
    }

    fn toggle_dtr_rts(&mut self, dtr: bool, rts: bool) -> Result<(), TransportError> {
        let port = self.port.as_mut().ok_or(TransportError::NotConnected)?;
        port.write_data_terminal_ready(dtr)
            .map_err(|e| TransportError::IoError(format!("DTR error: {}", e)))?;
        port.write_request_to_send(rts)
            .map_err(|e| TransportError::IoError(format!("RTS error: {}", e)))?;
        Ok(())
    }

    fn clear_buffers(&mut self) -> Result<(), TransportError> {
        let port = self.port.as_mut().ok_or(TransportError::NotConnected)?;
        port.clear(serialport::ClearBuffer::All)
            .map_err(|e| TransportError::IoError(e.to_string()))?;
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), TransportError> {
        self.port = None;
        Ok(())
    }
}
