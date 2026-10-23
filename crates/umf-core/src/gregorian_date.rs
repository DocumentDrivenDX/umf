// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit, host-independent Gregorian civil-date profile.
//!
//! This profile is opt-in and does not give a bare core `date` value calendar
//! semantics. Inputs and retained source use UMF's UTF-16 representation so
//! length and malformed-string behavior match the TypeScript reference.

use std::{error::Error, fmt};

use crate::value::{Utf16, Value};

/// Exact operation profile selected by callers that need this calendar.
pub const GREGORIAN_DATE_PROFILE: &str = "umf-gregorian-date/1.0.0";

/// Parsed components together with the exact, unmodified source token.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GregorianDate {
    profile: &'static str,
    original_text: Utf16,
    year: u16,
    month: u8,
    day: u8,
}

impl GregorianDate {
    pub const fn profile(&self) -> &'static str {
        self.profile
    }

    pub fn original_text(&self) -> &Utf16 {
        &self.original_text
    }

    pub const fn year(&self) -> u16 {
        self.year
    }

    pub const fn month(&self) -> u8 {
        self.month
    }

    pub const fn day(&self) -> u8 {
        self.day
    }
}

/// The two refusal classes specified by CONTRACT-066.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GregorianDateError {
    TypeError,
    RangeError,
}

impl GregorianDateError {
    pub const fn name(self) -> &'static str {
        match self {
            Self::TypeError => "TypeError",
            Self::RangeError => "RangeError",
        }
    }
}

impl fmt::Display for GregorianDateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.name())
    }
}

impl Error for GregorianDateError {}

/// Parse an exact `YYYY-MM-DD` token under the selected Gregorian profile.
///
/// The UTF-16 length check intentionally precedes all syntax and calendar
/// checks, matching the retained TypeScript helper's refusal order.
pub fn parse_gregorian_date(token: &Value) -> Result<GregorianDate, GregorianDateError> {
    let Value::String(text) = token else {
        return Err(GregorianDateError::TypeError);
    };
    let units = text.units();
    if units.len() != 10 {
        return Err(GregorianDateError::RangeError);
    }
    if units[4] != b'-' as u16 || units[7] != b'-' as u16 {
        return Err(GregorianDateError::RangeError);
    }
    let year = decimal(units, 0, 4).ok_or(GregorianDateError::RangeError)?;
    let month = decimal(units, 5, 2).ok_or(GregorianDateError::RangeError)?;
    let day = decimal(units, 8, 2).ok_or(GregorianDateError::RangeError)?;
    if year == 0 || !(1..=12).contains(&month) {
        return Err(GregorianDateError::RangeError);
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_length = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return Err(GregorianDateError::RangeError),
    };
    if day == 0 || day > month_length {
        return Err(GregorianDateError::RangeError);
    }
    Ok(GregorianDate {
        profile: GREGORIAN_DATE_PROFILE,
        original_text: text.clone(),
        year: year as u16,
        month: month as u8,
        day: day as u8,
    })
}

/// Truncate an exact date under the selected profile. The complete date is
/// parsed before the unit is examined, preserving contract precedence.
pub fn truncate_gregorian_date(token: &Value, unit: &Value) -> Result<Utf16, GregorianDateError> {
    let source = parse_gregorian_date(token)?;
    let Value::String(unit_text) = unit else {
        return Err(GregorianDateError::RangeError);
    };
    let units = unit_text.units();
    let unit_name = if ascii_equals(units, "year") {
        "year"
    } else if ascii_equals(units, "quarter") {
        "quarter"
    } else if ascii_equals(units, "month") {
        "month"
    } else if ascii_equals(units, "day") {
        "day"
    } else {
        return Err(GregorianDateError::RangeError);
    };
    if unit_name == "day" {
        return Ok(source.original_text);
    }
    let month = match unit_name {
        "year" => 1,
        "quarter" => 1 + 3 * ((source.month - 1) / 3),
        "month" => source.month,
        _ => unreachable!("unit_name is exhaustive"),
    };
    let output = format!("{:04}-{:02}-01", source.year, month);
    // The same profile owns output validation; no host date implementation is used.
    let parsed = parse_gregorian_date(&Value::string_utf8(output))?;
    Ok(parsed.original_text)
}

fn decimal(units: &[u16], start: usize, length: usize) -> Option<u32> {
    units[start..start + length]
        .iter()
        .try_fold(0, |value, unit| {
            if !(b'0' as u16..=b'9' as u16).contains(unit) {
                return None;
            }
            Some(value * 10 + u32::from(*unit - b'0' as u16))
        })
}

fn ascii_equals(units: &[u16], expected: &str) -> bool {
    units.len() == expected.len()
        && units
            .iter()
            .zip(expected.bytes())
            .all(|(unit, byte)| *unit == u16::from(byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> Value {
        Value::string_utf8(value)
    }

    #[test]
    fn parses_and_preserves_the_selected_profile_and_original_utf16() {
        let parsed = parse_gregorian_date(&text("2000-02-29")).unwrap();
        assert_eq!(parsed.profile(), GREGORIAN_DATE_PROFILE);
        assert_eq!(parsed.original_text(), &Utf16::from("2000-02-29"));
        assert_eq!((parsed.year(), parsed.month(), parsed.day()), (2000, 2, 29));
        for token in ["0001-01-01", "0099-12-31", "0400-02-29", "9999-12-31"] {
            assert_eq!(
                parse_gregorian_date(&text(token)).unwrap().original_text(),
                &Utf16::from(token)
            );
        }
    }

    #[test]
    fn truncates_each_unit_and_is_idempotent() {
        for (unit, expected) in [
            ("year", "2026-01-01"),
            ("quarter", "2026-10-01"),
            ("month", "2026-10-01"),
            ("day", "2026-10-15"),
        ] {
            let result = truncate_gregorian_date(&text("2026-10-15"), &text(unit)).unwrap();
            assert_eq!(result.to_utf8().unwrap(), expected);
            assert_eq!(
                truncate_gregorian_date(&Value::String(result.clone()), &text(unit)).unwrap(),
                result
            );
        }
        for (month, quarter) in [
            (1, 1),
            (3, 1),
            (4, 4),
            (6, 4),
            (7, 7),
            (9, 7),
            (10, 10),
            (12, 10),
        ] {
            let token = format!("2000-{month:02}-15");
            let expected = format!("2000-{quarter:02}-01");
            assert_eq!(
                truncate_gregorian_date(&text(&token), &text("quarter"))
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                expected
            );
        }
    }

    #[test]
    fn preserves_contract_refusal_classes_and_utf16_length_order() {
        for token in [
            "0000-01-01",
            "10000-01-01",
            "-001-01-01",
            "1900-02-29",
            "2100-02-29",
            "2000-02-30",
            "2026-04-31",
            "2026-00-01",
            "2026-13-01",
            "2026-01-00",
            "2026-01-32",
            "2026-1-01",
            "2026-01-1",
            "2026-01-01\n",
            " 2026-01-01",
            "２０２６-01-01",
            "2026-W01-1",
            "2026-001",
            "2026-01-01T00:00:00Z",
        ] {
            assert_eq!(
                parse_gregorian_date(&text(token)),
                Err(GregorianDateError::RangeError),
                "{token:?}"
            );
        }
        for value in [
            Value::Null,
            Value::Bool(true),
            Value::Number(1.0),
            Value::Array(vec![]),
            Value::Object(vec![]),
        ] {
            assert_eq!(
                parse_gregorian_date(&value),
                Err(GregorianDateError::TypeError)
            );
        }
        let malformed_ten_units = Value::String(Utf16::new(vec![
            0xD800,
            b'0' as u16,
            b'2' as u16,
            b'6' as u16,
            b'-' as u16,
            b'0' as u16,
            b'1' as u16,
            b'-' as u16,
            b'0' as u16,
            b'1' as u16,
        ]));
        assert_eq!(
            parse_gregorian_date(&malformed_ten_units),
            Err(GregorianDateError::RangeError)
        );
        let too_long_with_surrogate = Value::String(Utf16::new(vec![
            b'2' as u16,
            b'0' as u16,
            b'2' as u16,
            b'6' as u16,
            b'-' as u16,
            b'0' as u16,
            b'1' as u16,
            b'-' as u16,
            b'0' as u16,
            b'1' as u16,
            0xD800,
        ]));
        assert_eq!(
            parse_gregorian_date(&too_long_with_surrogate),
            Err(GregorianDateError::RangeError)
        );
        for unit in ["week", "MONTH", "", "day\n"] {
            assert_eq!(
                truncate_gregorian_date(&text("2026-10-15"), &text(unit)),
                Err(GregorianDateError::RangeError)
            );
        }
        assert_eq!(
            truncate_gregorian_date(&text("bad"), &text("week")),
            Err(GregorianDateError::RangeError)
        );
        assert_eq!(
            truncate_gregorian_date(&text("2026-10-15"), &Value::Null),
            Err(GregorianDateError::RangeError)
        );
    }
}
