//! Python carrier canonicalization for the explicitly selected CONTRACT-075
//! access temporal profile. Python admits carrier classes and extracts fields;
//! this module owns calendar validation, offset arithmetic and output text.

use std::fmt;

use crate::{
    gregorian_date::parse_gregorian_date,
    rfc3339_exact_instant::parse_rfc3339_exact_instant,
    value::{Utf16, Value},
};

const MICROS_PER_SECOND: i64 = 1_000_000;
const SECONDS_PER_DAY: i64 = 86_400;
const MICROS_PER_DAY: i64 = SECONDS_PER_DAY * MICROS_PER_SECOND;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessTemporalError {
    Kind,
    CarrierShape,
    Calendar,
    Offset,
    NormalizedRange,
}

impl fmt::Display for AccessTemporalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Kind => "unsupported access temporal kind",
            Self::CarrierShape => "access temporal fields do not match the selected kind",
            Self::Calendar => "invalid Gregorian access temporal fields",
            Self::Offset => "fixed offset is outside the supported range",
            Self::NormalizedRange => "normalized instant is outside years 0001 through 9999",
        })
    }
}

impl std::error::Error for AccessTemporalError {}

/// Canonicalize fields extracted from exact Python date/datetime carriers.
/// `offset_microseconds` is east-positive, matching `datetime.utcoffset()`.
pub fn canonicalize_access_temporal(
    kind: &str,
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
    microsecond: u32,
    offset_microseconds: Option<i64>,
) -> Result<String, AccessTemporalError> {
    if !matches!(kind, "date" | "local" | "instant") {
        return Err(AccessTemporalError::Kind);
    }
    if kind == "date" {
        if offset_microseconds.is_some()
            || hour != 0
            || minute != 0
            || second != 0
            || microsecond != 0
        {
            return Err(AccessTemporalError::CarrierShape);
        }
        let token = format!("{year:04}-{month:02}-{day:02}");
        let parsed = parse_gregorian_date(&Value::string_utf8(&token))
            .map_err(|_| AccessTemporalError::Calendar)?;
        return Ok(format!(
            "{:04}-{:02}-{:02}",
            parsed.year(),
            parsed.month(),
            parsed.day()
        ));
    }
    if microsecond > 999_999 {
        return Err(AccessTemporalError::Calendar);
    }

    let token = format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{microsecond:06}Z"
    );
    let parsed = parse_rfc3339_exact_instant(&Value::string_utf8(&token))
        .map_err(|_| AccessTemporalError::Calendar)?;
    let local_seconds = parsed
        .utc_seconds()
        .parse::<i64>()
        .map_err(|_| AccessTemporalError::Calendar)?;
    let fraction_text = parsed.fractional_digits();
    let fraction = if fraction_text.is_empty() {
        0
    } else {
        fraction_text
            .parse::<u32>()
            .map_err(|_| AccessTemporalError::Calendar)?
            * 10_u32.pow(6 - fraction_text.len() as u32)
    };
    let local_microseconds = local_seconds
        .checked_mul(MICROS_PER_SECOND)
        .and_then(|value| value.checked_add(i64::from(fraction)))
        .ok_or(AccessTemporalError::Calendar)?;

    match kind {
        "local" => {
            if offset_microseconds.is_some() {
                return Err(AccessTemporalError::CarrierShape);
            }
            Ok(format!(
                "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{microsecond:06}"
            ))
        }
        "instant" => {
            let offset = offset_microseconds.ok_or(AccessTemporalError::CarrierShape)?;
            if offset.unsigned_abs() >= MICROS_PER_DAY as u64 {
                return Err(AccessTemporalError::Offset);
            }
            let utc_microseconds = local_microseconds
                .checked_sub(offset)
                .ok_or(AccessTemporalError::NormalizedRange)?;
            let utc_seconds = utc_microseconds.div_euclid(MICROS_PER_SECOND);
            let utc_microsecond = utc_microseconds.rem_euclid(MICROS_PER_SECOND) as u32;
            let (year, month, day, hour, minute, second) = civil_from_epoch_seconds(utc_seconds);
            if !(1..=9999).contains(&year) {
                return Err(AccessTemporalError::NormalizedRange);
            }
            Ok(format!(
                "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{utc_microsecond:06}Z"
            ))
        }
        _ => Err(AccessTemporalError::Kind),
    }
}

/// Convert exact whole seconds since the Unix epoch to Gregorian components.
fn civil_from_epoch_seconds(seconds: i64) -> (i64, i64, i64, i64, i64, i64) {
    let days = seconds.div_euclid(SECONDS_PER_DAY);
    let within_day = seconds.rem_euclid(SECONDS_PER_DAY);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    (
        year,
        month,
        day,
        within_day / 3_600,
        (within_day % 3_600) / 60,
        within_day % 60,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalizes_python_offset_seconds_and_microseconds() {
        assert_eq!(
            canonicalize_access_temporal(
                "instant",
                2024,
                1,
                2,
                12,
                0,
                0,
                123_456,
                Some(3_600_000_000 + 30_000_000 + 1),
            ),
            Ok("2024-01-02T10:59:30.123455Z".to_owned())
        );
        assert_eq!(
            canonicalize_access_temporal("instant", 2024, 1, 2, 12, 0, 0, 100_000, Some(0)),
            Ok("2024-01-02T12:00:00.100000Z".to_owned())
        );
    }

    #[test]
    fn validates_dates_and_datetimes_with_the_shared_kernels() {
        assert_eq!(
            canonicalize_access_temporal("date", 2000, 2, 29, 0, 0, 0, 0, None),
            Ok("2000-02-29".to_owned())
        );
        assert_eq!(
            canonicalize_access_temporal("local", 2024, 2, 29, 12, 34, 56, 1, None),
            Ok("2024-02-29T12:34:56.000001".to_owned())
        );
        assert_eq!(
            canonicalize_access_temporal("date", 1900, 2, 29, 0, 0, 0, 0, None),
            Err(AccessTemporalError::Calendar)
        );
    }

    #[test]
    fn microsecond_fields_enforce_python_range_before_formatting() {
        assert_eq!(
            canonicalize_access_temporal("instant", 2024, 1, 2, 12, 0, 0, 999_999, Some(0)),
            Ok("2024-01-02T12:00:00.999999Z".to_owned())
        );
        for microsecond in [1_000_000, 1_234_567, u32::MAX] {
            assert_eq!(
                canonicalize_access_temporal("instant", 2024, 1, 2, 12, 0, 0, microsecond, Some(0)),
                Err(AccessTemporalError::Calendar)
            );
        }
    }

    #[test]
    fn normalized_range_and_offset_boundaries_refuse() {
        assert_eq!(
            canonicalize_access_temporal("instant", 1, 1, 1, 0, 0, 0, 0, Some(1)),
            Err(AccessTemporalError::NormalizedRange)
        );
        assert_eq!(
            canonicalize_access_temporal("instant", 9999, 12, 31, 23, 59, 59, 999_999, Some(-1)),
            Err(AccessTemporalError::NormalizedRange)
        );
        assert_eq!(
            canonicalize_access_temporal("instant", 2024, 1, 1, 0, 0, 0, 0, Some(MICROS_PER_DAY)),
            Err(AccessTemporalError::Offset)
        );
    }

    #[test]
    fn kind_refusal_precedes_invalid_calendar_fields() {
        assert_eq!(
            canonicalize_access_temporal("other", 0, 0, 0, 255, 255, 255, 1_000_000, None),
            Err(AccessTemporalError::Kind)
        );
    }

    #[test]
    fn civil_conversion_handles_euclidean_era_boundaries() {
        assert_eq!(civil_from_epoch_seconds(-1), (1969, 12, 31, 23, 59, 59));
        assert_eq!(
            civil_from_epoch_seconds(-146_097 * SECONDS_PER_DAY),
            (1570, 1, 1, 0, 0, 0)
        );
    }
}

/// Selected-token result for the CONTRACT-075 portable profile.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParsedAccessTemporal {
    pub profile: &'static str,
    pub kind: &'static str,
    pub original_text: Utf16,
    pub canonical_text: String,
    pub microsecond: Option<u32>,
    pub utc_seconds: Option<String>,
    pub original_offset: Option<String>,
}

pub const ACCESS_TEMPORAL_PROFILE: &str = "umf-access-temporal/0.1.0";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessTemporalParseError {
    Type,
    Kind,
    TokenLimit,
    Syntax,
    DateLength,
    DateSyntax,
    Calendar,
    Clock,
    LocalOffset,
    KnownOffsetRequired,
    Offset,
    NormalizedRange,
}

impl AccessTemporalParseError {
    pub const fn name(self) -> &'static str {
        if matches!(self, Self::Type) {
            "TypeError"
        } else {
            "RangeError"
        }
    }
    pub const fn message(self) -> &'static str {
        match self {
            Self::Type => "Access temporal requires text",
            Self::Kind => "Access temporal kind",
            Self::TokenLimit => "Access temporal token limit",
            Self::Syntax => "Access temporal syntax or precision",
            Self::DateLength => "Gregorian date requires ten ASCII characters",
            Self::DateSyntax => "Gregorian date syntax",
            Self::Calendar => "Gregorian date calendar",
            Self::Clock => "Access temporal clock",
            Self::LocalOffset => "Access local requires no offset",
            Self::KnownOffsetRequired => "Access instant requires known offset",
            Self::Offset => "RFC3339 exact instant offset",
            Self::NormalizedRange => "Access instant UTC year range",
        }
    }
}

impl fmt::Display for AccessTemporalParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}
impl std::error::Error for AccessTemporalParseError {}

/// Parse the selected access temporal token without consulting host time APIs.
/// Input values are already admitted tagged JSON values; raw host objects are
/// intentionally outside this core boundary.
pub fn parse_access_temporal(
    kind: &Value,
    token: &Value,
) -> Result<ParsedAccessTemporal, AccessTemporalParseError> {
    let Value::String(text) = token else {
        return Err(AccessTemporalParseError::Type);
    };
    let selected = match kind {
        Value::String(value) if value == &Utf16::from("date") => "date",
        Value::String(value) if value == &Utf16::from("instant") => "instant",
        Value::String(value) if value == &Utf16::from("local") => "local",
        _ => return Err(AccessTemporalParseError::Kind),
    };
    let units = text.units();
    if units.len() > 32 {
        return Err(AccessTemporalParseError::TokenLimit);
    }
    if selected == "date" {
        let _date_parts = parse_access_date(units)?;
        let original_text = text.clone();
        let canonical_text = ascii(units);
        return Ok(ParsedAccessTemporal {
            profile: ACCESS_TEMPORAL_PROFILE,
            kind: selected,
            original_text,
            canonical_text,
            microsecond: None,
            utc_seconds: None,
            original_offset: None,
        });
    }
    let shape = datetime_shape(units)?;
    let (year, month, day) = parse_access_date(&units[..10])?;
    let hour = number(units, 11, 2);
    let minute = number(units, 14, 2);
    let second = number(units, 17, 2);
    if hour > 23 || minute > 59 || second > 59 {
        return Err(AccessTemporalParseError::Clock);
    }
    let microsecond = shape.fraction.map_or(0, |range| {
        let fraction = &units[range];
        let raw = fraction.iter().fold(0u32, |value, unit| {
            value * 10 + u32::from(*unit - b'0' as u16)
        });
        raw * 10u32.pow((6 - fraction.len()) as u32)
    });
    let original_text = text.clone();
    if selected == "local" {
        if shape.offset.is_some() {
            return Err(AccessTemporalParseError::LocalOffset);
        }
        let canonical_text = format!(
            "{}T{:02}:{:02}:{:02}.{:06}",
            date_text(year, month, day),
            hour,
            minute,
            second,
            microsecond
        );
        return Ok(ParsedAccessTemporal {
            profile: ACCESS_TEMPORAL_PROFILE,
            kind: selected,
            original_text,
            canonical_text,
            microsecond: Some(microsecond),
            utc_seconds: None,
            original_offset: None,
        });
    }
    let offset_range = shape
        .offset
        .ok_or(AccessTemporalParseError::KnownOffsetRequired)?;
    let offset = ascii(&units[offset_range.clone()]);
    if offset == "-00:00" {
        return Err(AccessTemporalParseError::KnownOffsetRequired);
    }
    if offset != "Z" {
        let oh = number(units, offset_range.start + 1, 2);
        let om = number(units, offset_range.start + 4, 2);
        if oh > 23 || om > 59 {
            return Err(AccessTemporalParseError::Offset);
        }
    }
    // The exact CONTRACT-075 shape, date, clock, and offset checks above cover
    // every RFC3339 parser refusal branch for this selected grammar. A failure
    // here is therefore only a defensive fallback for an internal invariant
    // drift, not a separately reachable public RangeError branch.
    let instant =
        parse_rfc3339_exact_instant(token).map_err(|_| AccessTemporalParseError::Syntax)?;
    let utc_seconds = instant
        .utc_seconds()
        .parse::<i64>()
        .map_err(|_| AccessTemporalParseError::NormalizedRange)?;
    if !(-62_135_596_800..=253_402_300_799).contains(&utc_seconds) {
        return Err(AccessTemporalParseError::NormalizedRange);
    }
    let canonical_text = access_utc_text(utc_seconds, microsecond);
    Ok(ParsedAccessTemporal {
        profile: ACCESS_TEMPORAL_PROFILE,
        kind: selected,
        original_text,
        canonical_text,
        microsecond: Some(microsecond),
        utc_seconds: Some(instant.utc_seconds().to_owned()),
        original_offset: Some(offset),
    })
}

struct DateTimeShape {
    fraction: Option<std::ops::Range<usize>>,
    offset: Option<std::ops::Range<usize>>,
}

fn datetime_shape(units: &[u16]) -> Result<DateTimeShape, AccessTemporalParseError> {
    if units.len() < 19
        || units[10] != b'T' as u16
        || units[13] != b':' as u16
        || units[16] != b':' as u16
        || !ascii_digits(units, 0, 4)
        || units[4] != b'-' as u16
        || !ascii_digits(units, 5, 2)
        || units[7] != b'-' as u16
        || !ascii_digits(units, 8, 2)
        || !ascii_digits(units, 11, 2)
        || !ascii_digits(units, 14, 2)
        || !ascii_digits(units, 17, 2)
    {
        return Err(AccessTemporalParseError::Syntax);
    }
    let mut cursor = 19;
    let fraction = if units.get(cursor) == Some(&(b'.' as u16)) {
        cursor += 1;
        let start = cursor;
        while units.get(cursor).is_some_and(|unit| ascii_digit(*unit)) {
            cursor += 1;
        }
        let length = cursor - start;
        if !(1..=6).contains(&length) {
            return Err(AccessTemporalParseError::Syntax);
        }
        Some(start..cursor)
    } else {
        None
    };
    let offset = if cursor == units.len() {
        None
    } else if units.len() == cursor + 1 && units[cursor] == b'Z' as u16 {
        Some(cursor..units.len())
    } else if units.len() == cursor + 6
        && matches!(units[cursor], s if s == b'+' as u16 || s == b'-' as u16)
        && units[cursor + 3] == b':' as u16
        && ascii_digits(units, cursor + 1, 2)
        && ascii_digits(units, cursor + 4, 2)
    {
        Some(cursor..units.len())
    } else {
        return Err(AccessTemporalParseError::Syntax);
    };
    Ok(DateTimeShape { fraction, offset })
}

fn parse_access_date(units: &[u16]) -> Result<(u32, u32, u32), AccessTemporalParseError> {
    if units.len() != 10 {
        return Err(AccessTemporalParseError::DateLength);
    }
    if !ascii_digits(units, 0, 4)
        || units[4] != b'-' as u16
        || !ascii_digits(units, 5, 2)
        || units[7] != b'-' as u16
        || !ascii_digits(units, 8, 2)
    {
        return Err(AccessTemporalParseError::DateSyntax);
    }
    let date = parse_gregorian_date(&Value::String(Utf16::new(units.to_vec())))
        .map_err(|_| AccessTemporalParseError::Calendar)?;
    Ok((
        u32::from(date.year()),
        u32::from(date.month()),
        u32::from(date.day()),
    ))
}
fn ascii_digits(units: &[u16], start: usize, length: usize) -> bool {
    units
        .get(start..start + length)
        .is_some_and(|s| s.iter().all(|u| ascii_digit(*u)))
}
fn ascii_digit(unit: u16) -> bool {
    (b'0' as u16..=b'9' as u16).contains(&unit)
}
fn number(units: &[u16], start: usize, length: usize) -> u32 {
    units[start..start + length]
        .iter()
        .fold(0, |n, u| n * 10 + u32::from(*u - b'0' as u16))
}
fn ascii(units: &[u16]) -> String {
    units
        .iter()
        .map(|u| char::from_u32(*u as u32).expect("ASCII-validated text"))
        .collect()
}
fn date_text(year: u32, month: u32, day: u32) -> String {
    format!("{year:04}-{month:02}-{day:02}")
}
fn access_utc_text(seconds: i64, microsecond: u32) -> String {
    let (year, month, day, hour, minute, second) = civil_from_epoch_seconds(seconds);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{microsecond:06}Z")
}
