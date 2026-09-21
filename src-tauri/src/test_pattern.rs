use crate::protocol::{CANONICAL_FRAME_SIZE, CANONICAL_HEIGHT, CANONICAL_WIDTH};

/// Sets a pixel at (x, y) in a 128x64 row-major MSB-first 1024-byte bitmap.
pub fn set_pixel(buf: &mut [u8], x: usize, y: usize, on: bool) {
    if x >= CANONICAL_WIDTH as usize || y >= CANONICAL_HEIGHT as usize {
        return;
    }
    let byte_idx = y * 16 + (x / 8);
    let bit_mask = 0x80 >> (x % 8);
    if on {
        buf[byte_idx] |= bit_mask;
    } else {
        buf[byte_idx] &= !bit_mask;
    }
}

/// Gets a pixel state at (x, y) from a 128x64 row-major MSB-first bitmap.
pub fn get_pixel(buf: &[u8], x: usize, y: usize) -> bool {
    if x >= CANONICAL_WIDTH as usize || y >= CANONICAL_HEIGHT as usize {
        return false;
    }
    let byte_idx = y * 16 + (x / 8);
    let bit_mask = 0x80 >> (x % 8);
    (buf[byte_idx] & bit_mask) != 0
}

/// Generates a deterministic 1024-byte canonical test pattern:
/// - 1px outer boundary
/// - 8x8 corner markers in all 4 corners
/// - Center crosshairs (horizontal line at y=31, vertical line at x=63)
/// - Q1 (Top-Left): 2x2 alternating checkerboard
/// - Q2 (Top-Right): Horizontal alternating stripes
/// - Q3 (Bottom-Left): Vertical alternating stripes
/// - Q4 (Bottom-Right): Diagonal stripes
pub fn generate_test_pattern() -> Vec<u8> {
    let mut buf = vec![0u8; CANONICAL_FRAME_SIZE];

    // 1. Outer 1px border
    for x in 0..128 {
        set_pixel(&mut buf, x, 0, true);
        set_pixel(&mut buf, x, 63, true);
    }
    for y in 0..64 {
        set_pixel(&mut buf, 0, y, true);
        set_pixel(&mut buf, 127, y, true);
    }

    // 2. Corner markers: 8x8 filled boxes at all 4 corners
    for y in 0..8 {
        for x in 0..8 {
            set_pixel(&mut buf, x, y, true);
            set_pixel(&mut buf, 127 - x, y, true);
            set_pixel(&mut buf, x, 63 - y, true);
            set_pixel(&mut buf, 127 - x, 63 - y, true);
        }
    }

    // 3. Center crosshairs
    for x in 0..128 {
        set_pixel(&mut buf, x, 31, true);
    }
    for y in 0..64 {
        set_pixel(&mut buf, 63, y, true);
    }

    // 4. Quadrants
    for y in 8..31 {
        // Q1 (Top-Left): 2x2 checkerboard
        for x in 8..63 {
            let is_on = ((x / 2) + (y / 2)) % 2 == 0;
            set_pixel(&mut buf, x, y, is_on);
        }
        // Q2 (Top-Right): Horizontal stripes
        for x in 64..120 {
            let is_on = y % 2 == 0;
            set_pixel(&mut buf, x, y, is_on);
        }
    }

    for y in 32..56 {
        // Q3 (Bottom-Left): Vertical stripes
        for x in 8..63 {
            let is_on = x % 2 == 0;
            set_pixel(&mut buf, x, y, is_on);
        }
        // Q4 (Bottom-Right): Diagonal stripes
        for x in 64..120 {
            let is_on = (x + y) % 3 == 0;
            set_pixel(&mut buf, x, y, is_on);
        }
    }

    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_dimensions_and_size() {
        let pattern = generate_test_pattern();
        assert_eq!(pattern.len(), CANONICAL_FRAME_SIZE);

        // Check 4 corners are on
        assert!(get_pixel(&pattern, 0, 0));
        assert!(get_pixel(&pattern, 127, 0));
        assert!(get_pixel(&pattern, 0, 63));
        assert!(get_pixel(&pattern, 127, 63));

        // Check center intersection
        assert!(get_pixel(&pattern, 63, 31));

        // Check outer borders
        for x in 0..128 {
            assert!(get_pixel(&pattern, x, 0));
            assert!(get_pixel(&pattern, x, 63));
        }
        for y in 0..64 {
            assert!(get_pixel(&pattern, 0, y));
            assert!(get_pixel(&pattern, 127, y));
        }
    }
}
