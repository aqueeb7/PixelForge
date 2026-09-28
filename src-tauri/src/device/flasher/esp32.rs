use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use super::{DeviceFlasher, FlashProgress};
use crate::device::telemetry::ChipDossier;

pub struct Esp32Flasher {
    port_name: String,
    baud_rate: u32,
}

impl Esp32Flasher {
    pub fn new(port_name: &str, baud_rate: u32) -> Self {
        Self {
            port_name: port_name.to_string(),
            baud_rate,
        }
    }

    pub fn baud_rate(&self) -> u32 {
        self.baud_rate
    }

    /// Performs the transistor cross-coupled auto-reset sequence on DTR/RTS
    /// to force the ESP32 into ROM download bootloader mode.
    fn pulse_bootloader_reset(&self) -> Result<(), String> {
        let mut port = serialport::new(&self.port_name, 115200)
            .timeout(Duration::from_millis(500))
            .open()
            .map_err(|e| format!("Auto-reset failed to open port: {}", e))?;

        // 1. Pull both EN and GPIO0 LOW
        port.write_data_terminal_ready(true).map_err(|e| e.to_string())?;
        port.write_request_to_send(true).map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(150));

        // 2. Release EN HIGH while holding GPIO0 LOW (latches bootloader)
        port.write_data_terminal_ready(false).map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(100));

        // 3. Release GPIO0
        port.write_request_to_send(false).map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(50));

        Ok(())
    }

    /// Resets the ESP32 normally into user application mode.
    fn pulse_normal_reset(&self) -> Result<(), String> {
        let mut port = serialport::new(&self.port_name, 115200)
            .timeout(Duration::from_millis(500))
            .open()
            .map_err(|e| format!("Normal reset failed to open port: {}", e))?;

        port.write_request_to_send(false).map_err(|e| e.to_string())?;
        port.write_data_terminal_ready(true).map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(120));
        port.write_data_terminal_ready(false).map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(50));

        Ok(())
    }

    /// Resolves the python executable path, preferring the system python.
    fn python_cmd() -> String {
        // Try python, then python3 — whichever is available
        for candidate in &["python", "python3"] {
            if let Ok(out) = Command::new(candidate).arg("--version").output() {
                if out.status.success() {
                    return candidate.to_string();
                }
            }
        }
        "python".to_string()
    }

    /// Runs the real esptool flashing pipeline via `python -m esptool`.
    /// This is the same mechanism Arduino IDE uses internally.
    ///
    /// Full flash sequence:
    ///   0x1000  bootloader.bin
    ///   0x8000  partitions.bin
    ///   0x10000 firmware.bin
    pub fn flash_with_esptool(
        &self,
        bootloader_path: &str,
        partitions_path: &str,
        firmware_path: &str,
        on_progress: &dyn Fn(FlashProgress),
    ) -> Result<(), String> {
        let python = Self::python_cmd();

        on_progress(FlashProgress {
            stage: format!("Connecting to ESP32 on {}...", self.port_name),
            percent: 2,
            speed_kbs: 0.0,
            bytes_written: 0,
            bytes_total: 0,
        });

        // esptool write_flash arguments
        let args = vec![
            "-m".to_string(),
            "esptool".to_string(),
            "--chip".to_string(), "esp32".to_string(),
            "--port".to_string(), self.port_name.clone(),
            "--baud".to_string(), self.baud_rate.to_string(),
            "--before".to_string(), "default_reset".to_string(),
            "--after".to_string(), "hard_reset".to_string(),
            "write_flash".to_string(),
            "--flash_mode".to_string(), "dio".to_string(),
            "--flash_freq".to_string(), "40m".to_string(),
            "--flash_size".to_string(), "detect".to_string(),
            "0x1000".to_string(),  bootloader_path.to_string(),
            "0x8000".to_string(),  partitions_path.to_string(),
            "0x10000".to_string(), firmware_path.to_string(),
        ];

        let mut child = Command::new(&python)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to launch esptool (python -m esptool): {}. Ensure Python is installed.", e))?;

        // Stream stdout+stderr to parse progress
        let stderr = child.stderr.take().unwrap();
        let reader = BufReader::new(stderr);

        let mut last_percent: u8 = 2;
        let mut last_stage = String::new();

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };

            // Parse esptool progress lines:
            // "Writing at 0x00010000... (5 %)"
            // "Hash of data verified."
            // "Leaving..."
            let trimmed = line.trim();

            if trimmed.contains("Connecting") {
                last_stage = "Connecting to ESP32...".to_string();
                last_percent = 5;
            } else if trimmed.contains("Chip is") {
                last_stage = format!("Detected: {}", trimmed);
                last_percent = 8;
            } else if trimmed.contains("Uploading stub") || trimmed.contains("Running stub") {
                last_stage = "Loading flash stub...".to_string();
                last_percent = 12;
            } else if trimmed.contains("Configuring flash") {
                last_stage = "Configuring flash...".to_string();
                last_percent = 15;
            } else if trimmed.contains("Writing at") {
                // "Writing at 0x0001f0e0... (20 %)"
                if let Some(pct_start) = trimmed.rfind('(') {
                    if let Some(pct_end) = trimmed.rfind('%') {
                        let pct_str = trimmed[pct_start + 1..pct_end].trim();
                        if let Ok(pct) = pct_str.parse::<u8>() {
                            // Scale 0–100% write into 15–92% overall
                            last_percent = 15 + (pct as f32 * 0.77) as u8;
                            last_stage = format!("Flashing... {}%", pct);
                        }
                    }
                }
            } else if trimmed.contains("Hash of data verified") {
                last_stage = "Verifying checksum...".to_string();
                last_percent = 95;
            } else if trimmed.contains("Leaving") || trimmed.contains("Hard resetting") {
                last_stage = "Resetting ESP32 into app mode...".to_string();
                last_percent = 99;
            }

            if !last_stage.is_empty() {
                on_progress(FlashProgress {
                    stage: last_stage.clone(),
                    percent: last_percent,
                    speed_kbs: 0.0,
                    bytes_written: 0,
                    bytes_total: 0,
                });
            }
        }

        let status = child.wait().map_err(|e| format!("esptool process error: {}", e))?;

        if !status.success() {
            return Err(format!(
                "esptool exited with error code {:?}. Check that:\n\
                 • The correct COM port is selected\n\
                 • No other program (Arduino IDE, Serial Monitor) is using the port\n\
                 • Your USB cable supports data (not charge-only)",
                status.code()
            ));
        }

        on_progress(FlashProgress {
            stage: "✅ Firmware flashed successfully! ESP32 is restarting...".to_string(),
            percent: 100,
            speed_kbs: 0.0,
            bytes_written: 0,
            bytes_total: 0,
        });

        Ok(())
    }
}

impl DeviceFlasher for Esp32Flasher {
    fn detect_chip(&mut self) -> Result<ChipDossier, String> {
        Ok(ChipDossier::default_esp32_d0wd())
    }

    fn erase_flash(&mut self, on_progress: Box<dyn Fn(FlashProgress) + Send>) -> Result<(), String> {
        let python = Self::python_cmd();
        on_progress(FlashProgress {
            stage: format!("Erasing flash on {}...", self.port_name),
            percent: 10,
            speed_kbs: 0.0,
            bytes_written: 0,
            bytes_total: 0,
        });

        let status = Command::new(&python)
            .args([
                "-m", "esptool",
                "--chip", "esp32",
                "--port", &self.port_name,
                "--baud", &self.baud_rate.to_string(),
                "erase_flash",
            ])
            .status()
            .map_err(|e| format!("Failed to launch esptool: {}", e))?;

        if !status.success() {
            return Err("esptool erase_flash failed. Check port and connection.".to_string());
        }

        on_progress(FlashProgress {
            stage: "Flash erased successfully".to_string(),
            percent: 100,
            speed_kbs: 0.0,
            bytes_written: 0,
            bytes_total: 0,
        });

        Ok(())
    }

    fn write_image(
        &mut self,
        _offset: u32,
        data: &[u8],
        on_progress: Box<dyn Fn(FlashProgress) + Send>,
    ) -> Result<(), String> {
        if data.is_empty() {
            return Err("Cannot flash empty binary image".to_string());
        }

        // Write data to a temp file, then flash it via esptool
        let tmp_path = std::env::temp_dir().join("pixelforge_flash_tmp.bin");
        std::fs::write(&tmp_path, data)
            .map_err(|e| format!("Failed to write temp firmware file: {}", e))?;

        let python = Self::python_cmd();

        on_progress(FlashProgress {
            stage: format!("Connecting to ESP32 on {}...", self.port_name),
            percent: 5,
            speed_kbs: 0.0,
            bytes_written: 0,
            bytes_total: data.len(),
        });

        let status = Command::new(&python)
            .args([
                "-m", "esptool",
                "--chip", "esp32",
                "--port", &self.port_name,
                "--baud", &self.baud_rate.to_string(),
                "write_flash",
                "0x10000",
                tmp_path.to_str().unwrap_or("firmware.bin"),
            ])
            .status()
            .map_err(|e| format!("Failed to launch esptool: {}", e))?;

        let _ = std::fs::remove_file(&tmp_path);

        if !status.success() {
            return Err("esptool write_flash failed. Check port and connection.".to_string());
        }

        on_progress(FlashProgress {
            stage: "✅ Firmware written successfully!".to_string(),
            percent: 100,
            speed_kbs: 0.0,
            bytes_written: data.len(),
            bytes_total: data.len(),
        });

        Ok(())
    }

    fn reset_device(&mut self, boot_to_app: bool) -> Result<(), String> {
        if boot_to_app {
            self.pulse_normal_reset()
        } else {
            self.pulse_bootloader_reset()
        }
    }
}
