// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact elapsed duration and deadline arithmetic for portable declarations.

use crate::rfc3339_exact_instant::Rfc3339ExactInstant;
use std::{error::Error, fmt};

pub const EXACT_DURATION_PROFILE: &str = "umf.exact-duration/1";
const NANOS_PER_SECOND: i128 = 1_000_000_000;
const MAX_TOKEN_BYTES: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DurationUnit {
    Nanosecond,
    Microsecond,
    Millisecond,
    Second,
    Minute,
    Hour,
    FixedDay,
}

impl DurationUnit {
    const fn nanoseconds(self) -> i128 {
        match self {
            Self::Nanosecond => 1,
            Self::Microsecond => 1_000,
            Self::Millisecond => 1_000_000,
            Self::Second => NANOS_PER_SECOND,
            Self::Minute => 60 * NANOS_PER_SECOND,
            Self::Hour => 3600 * NANOS_PER_SECOND,
            Self::FixedDay => 86400 * NANOS_PER_SECOND,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DurationSource {
    ElapsedText(String),
    Count { text: String, unit: DurationUnit },
}

/// A signed elapsed span. Equality of values is given by `nanoseconds()`;
/// `source()` retains the input independently.
#[derive(Clone, Debug)]
pub struct ExactDuration {
    nanoseconds: i128,
    source: DurationSource,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DurationError {
    Syntax,
    Limit,
    Overflow,
}

impl fmt::Display for DurationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Syntax => "unsupported elapsed duration syntax",
            Self::Limit => "elapsed duration token limit exceeded",
            Self::Overflow => "elapsed duration or deadline out of range",
        })
    }
}

impl Error for DurationError {}

impl ExactDuration {
    /// Admit the time-only grammar `-?PT([0-9]+H)?([0-9]+M)?([0-9]+(.[0-9]{1,9})?S)?`,
    /// with at least one component.
    pub fn parse(text: &str) -> Result<Self, DurationError> {
        use DurationError::{Overflow, Syntax};
        check_limit(text)?;
        let (negative, unsigned) = split_sign(text);
        let mut remainder = unsigned.strip_prefix("PT").ok_or(Syntax)?;
        if remainder.is_empty() {
            return Err(Syntax);
        }

        let mut previous_rank = 0;
        let mut magnitude = 0_u128;
        while !remainder.is_empty() {
            let (digits, rest) = take_digits(remainder);
            if digits.is_empty() {
                return Err(Syntax);
            }
            let (fraction, rest) = if let Some(rest) = rest.strip_prefix('.') {
                let (fraction, rest) = take_digits(rest);
                if fraction.is_empty() || fraction.len() > 9 {
                    return Err(Syntax);
                }
                (fraction, rest)
            } else {
                ("", rest)
            };
            let (rank, unit) = match rest.as_bytes().first() {
                Some(b'H') if fraction.is_empty() => (1, DurationUnit::Hour),
                Some(b'M') if fraction.is_empty() => (2, DurationUnit::Minute),
                Some(b'S') => (3, DurationUnit::Second),
                _ => return Err(Syntax),
            };
            if rank <= previous_rank {
                return Err(Syntax);
            }
            previous_rank = rank;
            let whole = digits.parse::<u128>().map_err(|_| Overflow)?;
            magnitude = whole
                .checked_mul(unit.nanoseconds() as u128)
                .and_then(|value| magnitude.checked_add(value))
                .ok_or(Overflow)?;
            if !fraction.is_empty() {
                magnitude = magnitude
                    .checked_add(fraction_nanoseconds(fraction) as u128)
                    .ok_or(Overflow)?;
            }
            remainder = &rest[1..];
        }

        Ok(Self {
            nanoseconds: signed_value(magnitude, negative)?,
            source: DurationSource::ElapsedText(text.into()),
        })
    }

    /// Admit an exact ASCII decimal integer with an explicit unit.
    pub fn from_count(text: &str, unit: DurationUnit) -> Result<Self, DurationError> {
        check_limit(text)?;
        let (_, digits) = split_sign(text);
        if digits.is_empty() || !digits.bytes().all(|digit| digit.is_ascii_digit()) {
            return Err(DurationError::Syntax);
        }
        let nanoseconds = text
            .parse::<i128>()
            .ok()
            .and_then(|count| count.checked_mul(unit.nanoseconds()))
            .ok_or(DurationError::Overflow)?;
        Ok(Self {
            nanoseconds,
            source: DurationSource::Count {
                text: text.into(),
                unit,
            },
        })
    }

    pub const fn nanoseconds(&self) -> i128 {
        self.nanoseconds
    }

    pub fn canonical_nanoseconds(&self) -> String {
        self.nanoseconds.to_string()
    }

    pub fn source(&self) -> &DurationSource {
        &self.source
    }

    /// Add an elapsed span while preserving any precision beyond nanoseconds
    /// in the anchor. The deadline's whole UTC seconds must fit signed 64 bits.
    pub fn deadline(&self, anchor: &Rfc3339ExactInstant) -> Result<Deadline, DurationError> {
        let seconds: i128 = anchor
            .utc_seconds()
            .parse()
            .map_err(|_| DurationError::Overflow)?;
        let fraction = anchor.fractional_digits();
        let (prefix, tail) = fraction.split_at(fraction.len().min(9));
        let nanos = fraction_nanoseconds(prefix) + self.nanoseconds.rem_euclid(NANOS_PER_SECOND);
        let seconds = seconds
            + self.nanoseconds.div_euclid(NANOS_PER_SECOND)
            + nanos.div_euclid(NANOS_PER_SECOND);
        let nanos = nanos.rem_euclid(NANOS_PER_SECOND);
        let fraction = format!("{nanos:09}{tail}");
        Ok(Deadline {
            utc_seconds: i64::try_from(seconds).map_err(|_| DurationError::Overflow)?,
            fractional_digits: fraction.trim_end_matches('0').into(),
        })
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Deadline {
    utc_seconds: i64,
    fractional_digits: String,
}

impl Deadline {
    pub const fn utc_seconds(&self) -> i64 {
        self.utc_seconds
    }

    pub fn fractional_digits(&self) -> &str {
        &self.fractional_digits
    }
}

fn split_sign(text: &str) -> (bool, &str) {
    match text.strip_prefix('-') {
        Some(unsigned) => (true, unsigned),
        None => (false, text),
    }
}

fn take_digits(text: &str) -> (&str, &str) {
    let end = text.bytes().take_while(u8::is_ascii_digit).count();
    text.split_at(end)
}

fn fraction_nanoseconds(digits: &str) -> i128 {
    let n = digits
        .bytes()
        .fold(0_i128, |n, digit| n * 10 + i128::from(digit - b'0'));
    n * 10_i128.pow(9 - digits.len() as u32)
}

fn signed_value(magnitude: u128, negative: bool) -> Result<i128, DurationError> {
    match (negative, i128::try_from(magnitude)) {
        (true, _) if magnitude == i128::MIN.unsigned_abs() => Ok(i128::MIN),
        (true, Ok(value)) => Ok(-value),
        (false, Ok(value)) => Ok(value),
        _ => Err(DurationError::Overflow),
    }
}

fn check_limit(text: &str) -> Result<(), DurationError> {
    if text.len() > MAX_TOKEN_BYTES {
        return Err(DurationError::Limit);
    }
    Ok(())
}
