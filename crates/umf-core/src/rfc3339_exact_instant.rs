// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit RFC3339 exact-instant operation profile.
//!
//! No host date, clock, timezone, locale, floating-point timestamp, or core
//! timestamp default participates in this parser.

use std::{error::Error, fmt};

use crate::value::{Utf16, Value};

/// Exact operation profile selected by callers that need this instant recipe.
pub const RFC3339_EXACT_INSTANT_PROFILE: &str = "umf-rfc3339-exact-instant/1.0.0";
/// Maximum accepted token length, matching the retained TypeScript helper.
pub const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES: usize = 1_048_576;

/// Parsed instant while retaining the source spelling and offset knowledge.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rfc3339ExactInstant {
    profile: &'static str,
    original_text: Utf16,
    utc_seconds: String,
    fractional_digits: String,
    original_offset: String,
    local_offset_known: bool,
}

impl Rfc3339ExactInstant {
    pub const fn profile(&self) -> &'static str {
        self.profile
    }

    pub fn original_text(&self) -> &Utf16 {
        &self.original_text
    }

    pub fn utc_seconds(&self) -> &str {
        &self.utc_seconds
    }

    pub fn fractional_digits(&self) -> &str {
        &self.fractional_digits
    }

    pub fn original_offset(&self) -> &str {
        &self.original_offset
    }

    pub const fn local_offset_known(&self) -> bool {
        self.local_offset_known
    }
}

/// The two refusal classes specified by CONTRACT-065.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Rfc3339ExactInstantError {
    TypeError,
    TokenLimit,
    Syntax,
    Calendar,
    Offset,
}

impl Rfc3339ExactInstantError {
    pub const fn name(self) -> &'static str {
        match self {
            Self::TypeError => "TypeError",
            Self::TokenLimit | Self::Syntax | Self::Calendar | Self::Offset => "RangeError",
        }
    }

    pub const fn message(self) -> &'static str {
        match self {
            Self::TypeError => "RFC3339 exact instant requires text",
            Self::TokenLimit => "RFC3339 exact instant token limit",
            Self::Syntax => "RFC3339 exact instant syntax",
            Self::Calendar => "RFC3339 exact instant calendar",
            Self::Offset => "RFC3339 exact instant offset",
        }
    }
}

impl fmt::Display for Rfc3339ExactInstantError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}

impl Error for Rfc3339ExactInstantError {}

/// Parse a selected ASCII RFC3339 subset without converting its fraction to a
/// finite-precision timestamp or using any host temporal API.
pub fn parse_rfc3339_exact_instant(
    token: &Value,
) -> Result<Rfc3339ExactInstant, Rfc3339ExactInstantError> {
    let Value::String(text) = token else {
        return Err(Rfc3339ExactInstantError::TypeError);
    };
    let units = text.units();
    if units.len() > RFC3339_EXACT_INSTANT_MAXIMUM_BYTES {
        return Err(Rfc3339ExactInstantError::TokenLimit);
    }
    // The shortest legal form is the fixed 19-unit local datetime plus Z.
    if units.len() < 20 {
        return Err(Rfc3339ExactInstantError::Syntax);
    }
    if !ascii_digits(units, 0, 4)
        || !ascii_digit_at(units, 5)
        || !ascii_digit_at(units, 6)
        || !ascii_digit_at(units, 8)
        || !ascii_digit_at(units, 9)
        || !ascii_digit_at(units, 11)
        || !ascii_digit_at(units, 12)
        || !ascii_digit_at(units, 14)
        || !ascii_digit_at(units, 15)
        || !ascii_digit_at(units, 17)
        || !ascii_digit_at(units, 18)
        || units[4] != b'-' as u16
        || units[7] != b'-' as u16
        || !matches!(units[10], unit if unit == b'T' as u16 || unit == b't' as u16)
        || units[13] != b':' as u16
        || units[16] != b':' as u16
    {
        return Err(Rfc3339ExactInstantError::Syntax);
    }

    let (offset_start, original_offset, offset_minutes, local_offset_known, offset_out_of_range) =
        parse_offset(units)?;
    let fraction = if offset_start == 19 {
        &units[19..offset_start]
    } else {
        if units[19] != b'.' as u16 || offset_start <= 20 {
            return Err(Rfc3339ExactInstantError::Syntax);
        }
        let digits = &units[20..offset_start];
        if !digits.iter().all(|unit| ascii_digit(*unit)) {
            return Err(Rfc3339ExactInstantError::Syntax);
        }
        digits
    };
    // A Z suffix begins at 19 with no fraction. Numeric suffixes begin at
    // least 19 and can only follow either the fixed datetime or fraction.
    if offset_start == 19 && fraction.len() != 0 {
        return Err(Rfc3339ExactInstantError::Syntax);
    }

    let year = number(units, 0, 4);
    let month = number(units, 5, 2);
    let day = number(units, 8, 2);
    let hour = number(units, 11, 2);
    let minute = number(units, 14, 2);
    let second = number(units, 17, 2);
    if !(1..=9999).contains(&year) {
        return Err(Rfc3339ExactInstantError::Calendar);
    }
    let days_in_month = month_length(year, month).ok_or(Rfc3339ExactInstantError::Calendar)?;
    if day == 0 || day > days_in_month || hour > 23 || minute > 59 || second > 59 {
        return Err(Rfc3339ExactInstantError::Calendar);
    }
    if offset_out_of_range {
        return Err(Rfc3339ExactInstantError::Offset);
    }

    let mut days = prior_year_days(year) - prior_year_days(1970) + i64::from(day) - 1;
    for prior_month in 1..month {
        days += i64::from(month_length(year, prior_month).expect("validated month"));
    }
    let utc_seconds =
        days * 86_400 + i64::from(hour) * 3_600 + i64::from(minute) * 60 + i64::from(second)
            - offset_minutes * 60;

    let original_text = text.clone();
    let mut fraction_end = fraction.len();
    while fraction_end > 0 && fraction[fraction_end - 1] == b'0' as u16 {
        fraction_end -= 1;
    }
    let fractional_digits = ascii_string(&fraction[..fraction_end]);
    Ok(Rfc3339ExactInstant {
        profile: RFC3339_EXACT_INSTANT_PROFILE,
        original_text,
        utc_seconds: utc_seconds.to_string(),
        fractional_digits,
        original_offset,
        local_offset_known,
    })
}

/// Compare two explicitly selected tokens by exact normalized instant parts.
pub fn same_rfc3339_exact_instant(
    left: &Value,
    right: &Value,
) -> Result<bool, Rfc3339ExactInstantError> {
    let left = parse_rfc3339_exact_instant(left)?;
    let right = parse_rfc3339_exact_instant(right)?;
    Ok(left.utc_seconds == right.utc_seconds && left.fractional_digits == right.fractional_digits)
}

fn parse_offset(
    units: &[u16],
) -> Result<(usize, String, i64, bool, bool), Rfc3339ExactInstantError> {
    if let Some(last) = units.last().copied() {
        if last == b'Z' as u16 || last == b'z' as u16 {
            return Ok((
                units.len() - 1,
                String::from(char::from_u32(last as u32).unwrap()),
                0,
                true,
                false,
            ));
        }
    }
    if units.len() < 25 {
        return Err(Rfc3339ExactInstantError::Syntax);
    }
    let start = units.len() - 6;
    let sign = units[start];
    if (sign != b'+' as u16 && sign != b'-' as u16)
        || units[start + 3] != b':' as u16
        || !ascii_digits(units, start + 1, 2)
        || !ascii_digits(units, start + 4, 2)
    {
        return Err(Rfc3339ExactInstantError::Syntax);
    }
    let hours = number(units, start + 1, 2);
    let minutes = number(units, start + 4, 2);
    let offset_out_of_range = hours > 23 || minutes > 59;
    let magnitude = i64::from(hours * 60 + minutes);
    let offset_minutes = if sign == b'-' as u16 {
        -magnitude
    } else {
        magnitude
    };
    let offset = ascii_string(&units[start..]);
    Ok((
        start,
        offset.clone(),
        offset_minutes,
        offset != "-00:00",
        offset_out_of_range,
    ))
}

fn month_length(year: u32, month: u32) -> Option<u32> {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => Some(31),
        4 | 6 | 9 | 11 => Some(30),
        2 if leap(year) => Some(29),
        2 => Some(28),
        _ => None,
    }
}

fn leap(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn prior_year_days(year: u32) -> i64 {
    let prior = i64::from(year) - 1;
    prior * 365 + prior / 4 - prior / 100 + prior / 400
}

fn ascii_digit(unit: u16) -> bool {
    (b'0' as u16..=b'9' as u16).contains(&unit)
}

fn ascii_digit_at(units: &[u16], index: usize) -> bool {
    units.get(index).is_some_and(|unit| ascii_digit(*unit))
}

fn ascii_digits(units: &[u16], start: usize, length: usize) -> bool {
    units
        .get(start..start + length)
        .is_some_and(|units| units.iter().all(|unit| ascii_digit(*unit)))
}

fn number(units: &[u16], start: usize, length: usize) -> u32 {
    units[start..start + length]
        .iter()
        .fold(0, |value, unit| value * 10 + u32::from(*unit - b'0' as u16))
}

fn ascii_string(units: &[u16]) -> String {
    units
        .iter()
        .map(|unit| char::from_u32(*unit as u32).expect("ASCII-validated input"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> Value {
        Value::string_utf8(value)
    }

    #[test]
    fn parses_exact_instants_and_retains_source_offset_and_fraction() {
        let token = "1969-12-31t23:59:59.5000z";
        let parsed = parse_rfc3339_exact_instant(&text(token)).unwrap();
        assert_eq!(parsed.profile(), RFC3339_EXACT_INSTANT_PROFILE);
        assert_eq!(parsed.original_text(), &Utf16::from(token));
        assert_eq!(parsed.utc_seconds(), "-1");
        assert_eq!(parsed.fractional_digits(), "5");
        assert_eq!(parsed.original_offset(), "z");
        assert!(parsed.local_offset_known());
    }

    #[test]
    fn equality_uses_exact_fraction_after_offset_normalization() {
        assert!(same_rfc3339_exact_instant(
            &text("2024-01-01T00:00:00.123456789Z"),
            &text("2023-12-31T19:00:00.1234567890-05:00")
        )
        .unwrap());
        assert!(!same_rfc3339_exact_instant(
            &text("2024-01-01T00:00:00.1234567Z"),
            &text("2024-01-01T00:00:00.1234568Z")
        )
        .unwrap());
        assert!(same_rfc3339_exact_instant(
            &text("1970-01-01T00:00:00-00:00"),
            &text("1970-01-01T00:00:00+00:00")
        )
        .unwrap());
        let unknown = parse_rfc3339_exact_instant(&text("1970-01-01T00:00:00-00:00")).unwrap();
        assert!(!unknown.local_offset_known());
        assert_eq!(unknown.original_offset(), "-00:00");
    }

    #[test]
    fn normalizes_pre_epoch_and_crosses_authored_year_boundaries() {
        assert_eq!(
            parse_rfc3339_exact_instant(&text("0001-01-01T00:00:00+23:59"))
                .unwrap()
                .utc_seconds(),
            "-62135683140"
        );
        assert_eq!(
            parse_rfc3339_exact_instant(&text("9999-12-31T23:59:59-23:59"))
                .unwrap()
                .utc_seconds(),
            "253402387139"
        );
        assert_eq!(
            parse_rfc3339_exact_instant(&text("2000-02-29T00:00:00Z"))
                .unwrap()
                .utc_seconds(),
            "951782400"
        );
        assert_eq!(
            parse_rfc3339_exact_instant(&text("1969-12-31T23:59:59.5000Z"))
                .unwrap()
                .utc_seconds(),
            "-1"
        );
    }

    #[test]
    fn refuses_types_syntax_calendar_offsets_and_leap_seconds() {
        for value in [
            Value::Null,
            Value::Bool(false),
            Value::Number(1.0),
            Value::Array(vec![]),
        ] {
            assert_eq!(
                parse_rfc3339_exact_instant(&value),
                Err(Rfc3339ExactInstantError::TypeError)
            );
        }
        for token in [
            "1900-02-29T00:00:00Z",
            "0000-01-01T00:00:00Z",
            "2016-12-31T23:59:60Z",
            "2024-01-01T24:00:00Z",
        ] {
            assert_eq!(
                parse_rfc3339_exact_instant(&text(token)),
                Err(Rfc3339ExactInstantError::Calendar),
                "{token:?}"
            );
        }
        for token in ["2024-01-01T00:00:00+00:60", "2024-01-01T00:00:00+24:00"] {
            assert_eq!(
                parse_rfc3339_exact_instant(&text(token)),
                Err(Rfc3339ExactInstantError::Offset),
                "{token:?}"
            );
        }
        for token in [
            "2024-01-01T00:00:00",
            "2024-01-01T00:00:00Z\n",
            "2024-01-01 00:00:00Z",
            "2024-01-01T00:00:00.Z",
            "2024-01-01T00:00:00.1",
            "2024-01-01T00:00:00+01:00x",
            "２０２４-01-01T00:00:00Z",
        ] {
            assert_eq!(
                parse_rfc3339_exact_instant(&text(token)),
                Err(Rfc3339ExactInstantError::Syntax),
                "{token:?}"
            );
        }
        let oversized = "x".repeat(RFC3339_EXACT_INSTANT_MAXIMUM_BYTES + 1);
        assert_eq!(
            parse_rfc3339_exact_instant(&text(&oversized)),
            Err(Rfc3339ExactInstantError::TokenLimit)
        );
    }

    #[test]
    fn retains_arbitrary_bounded_fraction_exactly_and_trims_only_trailing_zeroes() {
        let fraction = format!("{}1", "0".repeat(RFC3339_EXACT_INSTANT_MAXIMUM_BYTES - 22));
        let token = format!("1970-01-01T00:00:00.{fraction}Z");
        let parsed = parse_rfc3339_exact_instant(&text(&token)).unwrap();
        assert_eq!(
            token.encode_utf16().count(),
            RFC3339_EXACT_INSTANT_MAXIMUM_BYTES
        );
        assert_eq!(parsed.fractional_digits(), fraction);
        let zeroes = "0".repeat(RFC3339_EXACT_INSTANT_MAXIMUM_BYTES - 21);
        let token = format!("1970-01-01T00:00:00.{zeroes}Z");
        let parsed = parse_rfc3339_exact_instant(&text(&token)).unwrap();
        assert!(parsed.fractional_digits().is_empty());
    }
}
