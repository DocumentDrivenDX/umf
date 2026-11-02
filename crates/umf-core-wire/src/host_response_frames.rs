// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed V3 host-response descriptor and UTF-16 frame validation.

use umf_core::{Utf16, Value};

pub const HOST_RESPONSE_FRAME_UNITS: usize = 8_192;
const DESCRIPTOR_PREFIX: &str = "UMF-HOST-READ-V3";
const V4_DESCRIPTOR_PREFIX: &str = "UMF-HOST-READ-V4";
const FRAME_PREFIX: &str = "UMF-HOST-FRAME-V3";
pub const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

pub fn safe_integer_as_usize(value: f64) -> Result<usize, &'static str> {
    if !value.is_finite()
        || value < 0.0
        || value.fract() != 0.0
        || value > MAX_SAFE_INTEGER
        || value > usize::MAX as f64
    {
        return Err("host-response metadata is not a safe integer");
    }
    Ok(value as usize)
}

pub fn verify_string_array_units(expected: usize, observed: usize) -> Result<(), &'static str> {
    if expected == observed {
        Ok(())
    } else {
        Err("host-response array unit count did not match descriptor")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostReadResponseDescriptor {
    Null,
    Bool(bool),
    Abort,
    ResourceLimit {
        path: &'static str,
    },
    String {
        token: u64,
        units: usize,
    },
    StringArray {
        token: u64,
        items: usize,
        units: usize,
    },
}

impl HostReadResponseDescriptor {
    pub fn parse(value: &str) -> Result<Self, &'static str> {
        let mut fields = value.split('|');
        let prefix = fields
            .next()
            .ok_or("missing host-response descriptor prefix")?;
        if prefix == V4_DESCRIPTOR_PREFIX {
            if fields.next() != Some("resource") {
                return Err("unknown V4 host-response kind");
            }
            let path = match fields.next() {
                Some("records") => "/records",
                Some("actions") => "/actions",
                _ => return Err("invalid V4 host-response resource path"),
            };
            if fields.next().is_some() {
                return Err("extra V4 host-response descriptor fields");
            }
            return Ok(Self::ResourceLimit { path });
        }
        if prefix != DESCRIPTOR_PREFIX {
            return Err("invalid host-response descriptor prefix");
        }
        let kind = fields.next().ok_or("missing host-response kind")?;
        let parsed = match kind {
            "null" => Self::Null,
            "bool" => match fields.next() {
                Some("true") => Self::Bool(true),
                Some("false") => Self::Bool(false),
                _ => return Err("invalid host-response boolean"),
            },
            "abort" => Self::Abort,
            "string" => Self::String {
                token: parse_token(fields.next())?,
                units: parse_usize(fields.next())?,
            },
            "array" => Self::StringArray {
                token: parse_token(fields.next())?,
                items: parse_usize(fields.next())?,
                units: parse_usize(fields.next())?,
            },
            _ => return Err("unknown host-response kind"),
        };
        if fields.next().is_some() {
            return Err("extra host-response descriptor fields");
        }
        Ok(parsed)
    }

    /// Exact old tagged-wire preflight debit from small descriptor metadata,
    /// before any response string frames or Rust response-value arrays exist.
    pub fn tagged_wire_token_count(self) -> Result<usize, &'static str> {
        fn add(left: usize, right: usize) -> Result<usize, &'static str> {
            left.checked_add(right)
                .ok_or("tagged wire token count overflow")
        }
        match self {
            Self::Null => Ok(4),
            Self::Bool(_) => Ok(6),
            Self::Abort => Ok(40),
            Self::ResourceLimit { .. } => Ok(64),
            Self::String { units, .. } => add(7, units),
            Self::StringArray { items, units, .. } => add(
                add(
                    7,
                    items
                        .checked_mul(7)
                        .ok_or("tagged wire token count overflow")?,
                )?,
                units,
            ),
        }
    }
}

fn parse_token(value: Option<&str>) -> Result<u64, &'static str> {
    let token = value
        .ok_or("missing host-response token")?
        .parse::<u64>()
        .map_err(|_| "invalid host-response token")?;
    if token == 0 {
        return Err("host-response token must be nonzero");
    }
    Ok(token)
}

fn parse_usize(value: Option<&str>) -> Result<usize, &'static str> {
    value
        .ok_or("missing host-response length")?
        .parse::<usize>()
        .map_err(|_| "invalid host-response length")
}

/// Incrementally assembles one host string without a total-size ceiling.
/// Each received frame is limited to `HOST_RESPONSE_FRAME_UNITS` UTF-16 units.
pub struct HostReadStringFrames {
    token: u64,
    total_units: usize,
    offset: usize,
    units: Vec<u16>,
    expect_pair_at_next_frame: bool,
}

impl HostReadStringFrames {
    pub fn new(token: u64, total_units: usize) -> Result<Self, &'static str> {
        if token == 0 {
            return Err("host-response token must be nonzero");
        }
        Ok(Self {
            token,
            total_units,
            offset: 0,
            units: Vec::new(),
            expect_pair_at_next_frame: false,
        })
    }

    pub fn request(&self) -> Option<(u64, usize, usize)> {
        (self.offset < self.total_units).then_some((
            self.token,
            self.offset,
            HOST_RESPONSE_FRAME_UNITS,
        ))
    }

    pub fn validate_frame_header(
        &self,
        token: u64,
        offset: usize,
        count: usize,
    ) -> Result<(), &'static str> {
        if token != self.token {
            return Err("host-response frame token mismatch");
        }
        if offset != self.offset {
            return Err("host-response frame offset mismatch");
        }
        let remaining = self.total_units.saturating_sub(self.offset);
        let requested = remaining.min(HOST_RESPONSE_FRAME_UNITS);
        if count == 0 || count > requested {
            return Err("host-response frame count is invalid");
        }
        if count < requested && (requested - count != 1 || remaining <= HOST_RESPONSE_FRAME_UNITS) {
            return Err("host-response frame has an unexpected short count");
        }
        Ok(())
    }

    pub fn append(&mut self, token: u64, offset: usize, units: &[u16]) -> Result<(), &'static str> {
        self.validate_frame_header(token, offset, units.len())?;
        let remaining = self.total_units.saturating_sub(self.offset);
        let requested = remaining.min(HOST_RESPONSE_FRAME_UNITS);
        if self.expect_pair_at_next_frame {
            if units.len() < 2 || !is_surrogate_pair(units[0], units[1]) {
                return Err("split surrogate pair was not resumed");
            }
            self.expect_pair_at_next_frame = false;
        }
        if units.len() < requested {
            self.expect_pair_at_next_frame = true;
        }
        self.units
            .try_reserve(units.len())
            .map_err(|_| "host-response frame allocation failed")?;
        self.units.extend_from_slice(units);
        self.offset = self
            .offset
            .checked_add(units.len())
            .ok_or("host-response frame offset overflow")?;
        if self.offset > self.total_units {
            return Err("host-response frame exceeded its declared length");
        }
        Ok(())
    }

    /// Parse and append one bounded ASCII frame. The complete frame is
    /// validated before the destination buffer is grown, and no JS typed
    /// array or full tagged response is needed by either binding.
    pub fn append_ascii_frame(&mut self, frame: &str) -> Result<(), &'static str> {
        let mut fields = frame.splitn(5, '|');
        if fields.next() != Some(FRAME_PREFIX) {
            return Err("invalid host-response frame prefix");
        }
        let token = parse_token(fields.next())?;
        let offset = parse_usize(fields.next())?;
        let count = parse_usize(fields.next())?;
        let hex = fields.next().ok_or("missing host-response frame data")?;
        self.validate_frame_header(token, offset, count)?;
        if count.checked_mul(4) != Some(hex.len()) || !hex.is_ascii() {
            return Err("host-response frame hex length is invalid");
        }
        // Validate the entire payload before allocating or mutating state.
        for pair in hex.as_bytes().chunks_exact(4) {
            if pair.iter().any(|byte| !byte.is_ascii_hexdigit()) {
                return Err("host-response frame contains invalid hex");
            }
        }
        let bytes = hex.as_bytes();
        let mut decoded = [0_u16; HOST_RESPONSE_FRAME_UNITS];
        for (index, chunk) in bytes.chunks_exact(4).enumerate() {
            let high = (hex_nibble(chunk[0])? << 12)
                | (hex_nibble(chunk[1])? << 8)
                | (hex_nibble(chunk[2])? << 4)
                | hex_nibble(chunk[3])?;
            decoded[index] = high;
        }
        self.append(token, offset, &decoded[..count])
    }

    pub fn finish(self) -> Result<Utf16, &'static str> {
        if self.offset != self.total_units || self.expect_pair_at_next_frame {
            return Err("host-response frames did not complete exactly");
        }
        Ok(Utf16::new(self.units))
    }
}

fn hex_nibble(byte: u8) -> Result<u16, &'static str> {
    match byte {
        b'0'..=b'9' => Ok((byte - b'0') as u16),
        b'a'..=b'f' => Ok((byte - b'a' + 10) as u16),
        b'A'..=b'F' => Ok((byte - b'A' + 10) as u16),
        _ => Err("host-response frame contains invalid hex"),
    }
}

fn is_surrogate_pair(high: u16, low: u16) -> bool {
    (0xd800..=0xdbff).contains(&high) && (0xdc00..=0xdfff).contains(&low)
}

/// Count the JSON tokens that the current tagged-wire encoder emits for a
/// value. This lets bindings preserve transport-meter accounting without
/// constructing the tagged response string.
pub fn tagged_wire_token_count(value: &Value) -> Result<usize, &'static str> {
    fn add(left: usize, right: usize) -> Result<usize, &'static str> {
        left.checked_add(right)
            .ok_or("tagged wire token count overflow")
    }
    fn count(value: &Value) -> Result<usize, &'static str> {
        match value {
            Value::Null => Ok(4),
            Value::Bool(_) | Value::Number(_) => Ok(6),
            Value::String(text) => add(text.len(), 7),
            Value::Array(items) => {
                let mut total = 7;
                for item in items {
                    total = add(total, count(item)?)?;
                }
                Ok(total)
            }
            Value::Object(members) => {
                let mut total = 7;
                for (key, item) in members {
                    total = add(total, 6)?;
                    total = add(total, key.len())?;
                    total = add(total, count(item)?)?;
                }
                Ok(total)
            }
        }
    }
    count(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{decode, encode, transport_context};
    use umf_core::Context;

    #[test]
    fn response_descriptors_are_closed_and_exact() {
        assert_eq!(
            HostReadResponseDescriptor::parse("UMF-HOST-READ-V3|string|7|8193"),
            Ok(HostReadResponseDescriptor::String {
                token: 7,
                units: 8193
            })
        );
        assert_eq!(
            HostReadResponseDescriptor::parse("UMF-HOST-READ-V3|array|4|2|9"),
            Ok(HostReadResponseDescriptor::StringArray {
                token: 4,
                items: 2,
                units: 9
            })
        );
        assert!(HostReadResponseDescriptor::parse("UMF-HOST-READ-V3|string|0|1").is_err());
        assert!(HostReadResponseDescriptor::parse("UMF-HOST-READ-V3|array|4|2").is_err());
        assert!(HostReadResponseDescriptor::parse("UMF-HOST-READ-V3|string|1|1|extra").is_err());
        assert_eq!(
            HostReadResponseDescriptor::parse("UMF-HOST-READ-V4|resource|records"),
            Ok(HostReadResponseDescriptor::ResourceLimit { path: "/records" })
        );
        assert_eq!(
            HostReadResponseDescriptor::parse("UMF-HOST-READ-V4|resource|actions"),
            Ok(HostReadResponseDescriptor::ResourceLimit { path: "/actions" })
        );
        for malformed in [
            "UMF-HOST-READ-V4|resource|unknown",
            "UMF-HOST-READ-V4|resource|records|extra",
            "UMF-HOST-READ-V3|resource|records",
            "UMF-HOST-READ-V4|array|1|1|1",
        ] {
            assert!(
                HostReadResponseDescriptor::parse(malformed).is_err(),
                "{malformed}"
            );
        }
    }

    #[test]
    fn tagged_token_accounting_matches_closed_host_response_shapes() {
        assert_eq!(tagged_wire_token_count(&Value::Null), Ok(4));
        assert_eq!(tagged_wire_token_count(&Value::Bool(true)), Ok(6));
        assert_eq!(
            tagged_wire_token_count(&Value::String(Utf16::from("a😀"))),
            Ok(10)
        );
        assert_eq!(
            tagged_wire_token_count(&Value::Array(vec![Value::String(Utf16::from("x"))])),
            Ok(15)
        );
    }

    #[test]
    fn descriptor_debit_is_exact_before_frames_are_requested() {
        let responses = [
            ("UMF-HOST-READ-V3|null", Value::Null),
            ("UMF-HOST-READ-V3|bool|true", Value::Bool(true)),
            (
                "UMF-HOST-READ-V3|abort",
                Value::Object(vec![(
                    Utf16::from("kind"),
                    Value::String(Utf16::from("umf.host-abort/3")),
                )]),
            ),
            (
                "UMF-HOST-READ-V3|string|1|3",
                Value::String(Utf16::from("abc")),
            ),
            (
                "UMF-HOST-READ-V3|array|1|2|3",
                Value::Array(vec![
                    Value::String(Utf16::from("a")),
                    Value::String(Utf16::from("bc")),
                ]),
            ),
        ];
        for (descriptor, value) in responses {
            assert_eq!(
                HostReadResponseDescriptor::parse(descriptor)
                    .unwrap()
                    .tagged_wire_token_count(),
                tagged_wire_token_count(&value)
            );
        }
        assert!(verify_string_array_units(3, 3).is_ok());
        assert!(verify_string_array_units(4, 3).is_err());
    }

    #[test]
    fn tagged_token_count_matches_the_existing_decoder_preflight_meter() {
        let values = [
            Value::Null,
            Value::Bool(false),
            Value::String(Utf16::new(vec![b'a' as u16, 0xd800, 0xd83d, 0xde00])),
            Value::Array(vec![
                Value::String(Utf16::from("one")),
                Value::String(Utf16::from("two")),
            ]),
            Value::Object(vec![(
                Utf16::from("kind"),
                Value::String(Utf16::from("umf.host-abort/3")),
            )]),
        ];
        for value in values {
            let mut encode_context = transport_context();
            let wire = encode(&value, &mut encode_context).unwrap();
            let mut charges = Vec::new();
            let mut meter = |amount| {
                charges.push(amount);
                Ok(())
            };
            let mut decode_context = Context::ordinary().with_meter(&mut meter);
            decode(&wire, &mut decode_context).unwrap();
            drop(decode_context);
            assert_eq!(
                charges.first().copied(),
                Some(tagged_wire_token_count(&value).unwrap()),
                "value: {value:?}"
            );
        }
    }

    #[test]
    fn string_frames_enforce_token_offsets_count_and_surrogate_boundaries() {
        let mut frames = HostReadStringFrames::new(9, HOST_RESPONSE_FRAME_UNITS + 1).unwrap();
        let (token, offset, count) = frames.request().unwrap();
        assert_eq!((token, offset, count), (9, 0, HOST_RESPONSE_FRAME_UNITS));
        // The JavaScript frame writer shortens a frame before a pair that
        // would otherwise be split at its upper boundary.
        let first = vec![b'a' as u16; HOST_RESPONSE_FRAME_UNITS - 1];
        frames.append(token, offset, &first).unwrap();
        let (token, offset, count) = frames.request().unwrap();
        assert_eq!(
            (token, offset, count),
            (9, HOST_RESPONSE_FRAME_UNITS - 1, HOST_RESPONSE_FRAME_UNITS)
        );
        frames.append(token, offset, &[0xd83d, 0xde00]).unwrap();
        let result = frames.finish().unwrap();
        assert_eq!(result.len(), HOST_RESPONSE_FRAME_UNITS + 1);

        let mut bad_token = HostReadStringFrames::new(9, 1).unwrap();
        assert!(bad_token.append(8, 0, &[b'x' as u16]).is_err());
        let mut bad_offset = HostReadStringFrames::new(9, 1).unwrap();
        assert!(bad_offset.append(9, 1, &[b'x' as u16]).is_err());
        let bad_count = HostReadStringFrames::new(9, 1).unwrap();
        assert!(
            bad_count
                .validate_frame_header(9, 0, HOST_RESPONSE_FRAME_UNITS + 1)
                .is_err()
        );
        assert!(safe_integer_as_usize(MAX_SAFE_INTEGER).is_ok());
        assert!(safe_integer_as_usize(MAX_SAFE_INTEGER + 1.0).is_err());
        assert!(safe_integer_as_usize(f64::NAN).is_err());
    }

    #[test]
    fn short_frame_is_only_valid_when_next_frame_resumes_surrogate_pair() {
        let mut frames = HostReadStringFrames::new(3, HOST_RESPONSE_FRAME_UNITS + 1).unwrap();
        frames
            .append(3, 0, &vec![b'a' as u16; HOST_RESPONSE_FRAME_UNITS - 1])
            .unwrap();
        assert!(
            frames
                .append(
                    3,
                    HOST_RESPONSE_FRAME_UNITS - 1,
                    &[b'x' as u16, b'y' as u16]
                )
                .is_err()
        );
    }

    #[test]
    fn ascii_hex_frames_preserve_utf16_and_reject_invalid_metadata_or_payload() {
        let mut frames = HostReadStringFrames::new(7, 3).unwrap();
        frames
            .append_ascii_frame("UMF-HOST-FRAME-V3|7|0|3|0041d800d83d")
            .unwrap();
        assert_eq!(
            frames.finish().unwrap(),
            Utf16::new(vec![0x41, 0xd800, 0xd83d])
        );

        for invalid in [
            "UMF-HOST-FRAME-V2|7|0|1|0041",
            "UMF-HOST-FRAME-V3|8|0|1|0041",
            "UMF-HOST-FRAME-V3|7|1|1|0041",
            "UMF-HOST-FRAME-V3|7|0|2|0041",
            "UMF-HOST-FRAME-V3|7|0|1|00xz",
            "UMF-HOST-FRAME-V3|7|0|1|0041extra",
            "UMF-HOST-FRAME-V3|7|0|8193|",
        ] {
            let mut frame = HostReadStringFrames::new(7, 3).unwrap();
            assert!(
                frame.append_ascii_frame(invalid).is_err(),
                "accepted {invalid}"
            );
            assert_eq!(frame.offset, 0, "invalid frame mutated assembly state");
        }
    }
}
