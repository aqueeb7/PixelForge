pub mod esp32;

use serde::{Deserialize, Serialize};
use super::telemetry::ChipDossier;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgress {
    pub stage: String,
    pub percent: u8,
    pub speed_kbs: f32,
    pub bytes_written: usize,
    pub bytes_total: usize,
}

pub trait DeviceFlasher: Send {
    fn detect_chip(&mut self) -> Result<ChipDossier, String>;
    fn erase_flash(&mut self, on_progress: Box<dyn Fn(FlashProgress) + Send>) -> Result<(), String>;
    fn write_image(
        &mut self,
        offset: u32,
        data: &[u8],
        on_progress: Box<dyn Fn(FlashProgress) + Send>,
    ) -> Result<(), String>;
    fn reset_device(&mut self, boot_to_app: bool) -> Result<(), String>;
}
