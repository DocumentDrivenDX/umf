//! Python carrier canonicalization for the explicitly selected CONTRACT-075
//! access temporal profile. Python admits carrier classes and extracts fields;
//! this module owns calendar validation, offset arithmetic and output text.

use std::fmt;

use crate::{
    gregorian_date::parse_gregorian_date, rfc3339_exact_instant::parse_rfc3339_exact_instant,
    value::Value,
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
