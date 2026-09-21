use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportError {
    NotConnected,
    IoError(String),
    Timeout,
    BaudRateUnsupported(u32),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransportError::NotConnected => write!(f, "Device is not connected"),
            TransportError::IoError(e) => write!(f, "Transport I/O error: {}", e),
            TransportError::Timeout => write!(f, "Transport operation timed out"),
            TransportError::BaudRateUnsupported(b) => write!(f, "Baud rate {} unsupported", b),
        }
    }
}

impl std::error::Error for TransportError {}

/// DeviceTransport abstraction.
/// Decouples higher-level protocol, diagnostics, and flasher logic from the physical serial port,
/// enabling physical devices and the forthcoming Spec 008 Hardware Simulator to implement the same contract.
pub trait DeviceTransport: Send {
    fn is_connected(&self) -> bool;
    fn send(&mut self, data: &[u8]) -> Result<(), TransportError>;
    fn receive(&mut self, buf: &mut [u8]) -> Result<usize, TransportError>;
    fn set_baud_rate(&mut self, baud: u32) -> Result<(), TransportError>;
    fn set_timeout(&mut self, timeout: Duration) -> Result<(), TransportError>;
    fn toggle_dtr_rts(&mut self, dtr: bool, rts: bool) -> Result<(), TransportError>;
    fn clear_buffers(&mut self) -> Result<(), TransportError>;
    fn disconnect(&mut self) -> Result<(), TransportError>;
}
