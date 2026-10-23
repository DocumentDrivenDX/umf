// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact conversions for the bounded JavaScript integer/decimal adapter.
//!
//! This module deliberately handles only the five CONTRACT-049 operations.
//! It does not define float literals, database codecs, or a general numeric
//! coercion policy. Bigints cross a host boundary as decimal text and never as
//! an ordinary JSON number.

use num_bigint::BigInt;
use num_traits::Zero;
use std::str::FromStr;

use crate::{
    context::Context,
    error::EngineError,
    literal::{exact_coefficient, format_bigint_decimal_for_numeric},
    value::{ecma_number_to_string, Utf16},
};

const MAX_EXPONENT_TEXT: usize = 32;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

fn numeric_error(message: &str) -> EngineError {
    EngineError::new("JAVASCRIPT_NUMERIC", Utf16::default(), message)
}

fn limit_error(message: &str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), message)
}

#[derive(Debug, Eq, PartialEq)]
struct DecimalIdentity {
    negative: bool,
    digits: String,
    exponent: BigInt,
}

fn admitted_text<'a>(token: &'a str, ctx: &mut Context<'_>) -> Result<&'a str, EngineError> {
    let units = token.encode_utf16().count();
    if units > ctx.limits().max_text_units {
        return Err(limit_error("Numeric token exceeds text limit"));
    }
    // Numeric tokens are ASCII JSON number text, so UTF-8 bytes equal UTF-16
    // units after this check. Charge before scanning or allocating a copy.
    ctx.charge_work(units, Utf16::default())?;
    if !token.is_ascii() {
        return Err(numeric_error("Expected exact JSON numeric token"));
    }
    Ok(token)
}

/// Validate the JSON-number grammar and retain a normalized value identity.
/// The source spelling itself is never rewritten by callers.
fn decimal_identity(token: &str, ctx: &mut Context<'_>) -> Result<DecimalIdentity, EngineError> {
    let token = admitted_text(token, ctx)?;
    let bytes = token.as_bytes();
    if bytes.is_empty() {
        return Err(numeric_error("Expected exact JSON numeric token"));
    }
    let mut i = 0;
    let negative = bytes[0] == b'-';
    if negative {
        i += 1;
    }
    let int_start = i;
    match bytes.get(i) {
        Some(b'0') => {
            i += 1;
            if bytes.get(i).is_some_and(u8::is_ascii_digit) {
                return Err(numeric_error("Expected exact JSON numeric token"));
            }
        }
        Some(b'1'..=b'9') => {
            i += 1;
            while bytes.get(i).is_some_and(u8::is_ascii_digit) {
                i += 1;
            }
        }
        _ => return Err(numeric_error("Expected exact JSON numeric token")),
    }
    let int_end = i;
    let mut frac_start = i;
    let mut frac_len = 0usize;
    if bytes.get(i) == Some(&b'.') {
        i += 1;
        frac_start = i;
        while bytes.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        frac_len = i - frac_start;
        if frac_len == 0 {
            return Err(numeric_error("Expected exact JSON numeric token"));
        }
    }
    let mut explicit_exponent = BigInt::zero();
    if matches!(bytes.get(i), Some(b'e' | b'E')) {
        i += 1;
        let exponent_start = i;
        if matches!(bytes.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let digits_start = i;
        while bytes.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == digits_start {
            return Err(numeric_error("Expected exact JSON numeric token"));
        }
        if i - exponent_start > MAX_EXPONENT_TEXT {
            return Err(limit_error("Numeric exponent exceeds bounded domain"));
        }
        explicit_exponent = BigInt::from_str(&token[exponent_start..i])
            .map_err(|_| numeric_error("Expected exact JSON numeric token"))?;
    }
    if i != bytes.len() {
        return Err(numeric_error("Expected exact JSON numeric token"));
    }

    let mut digits = String::with_capacity(int_end - int_start + frac_len);
    digits.push_str(&token[int_start..int_end]);
    if frac_len > 0 {
        digits.push_str(&token[frac_start..frac_start + frac_len]);
    }
    let significant = digits.trim_start_matches('0');
    if significant.is_empty() {
        return Ok(DecimalIdentity {
            negative,
            digits: "0".to_owned(),
            exponent: BigInt::zero(),
        });
    }
    let trailing = significant.len() - significant.trim_end_matches('0').len();
    let normalized = &significant[..significant.len() - trailing];
    let exponent = explicit_exponent - BigInt::from(frac_len) + BigInt::from(trailing);
    Ok(DecimalIdentity {
        negative,
        digits: normalized.to_owned(),
        exponent,
    })
}

fn binary_identity(value: f64, ctx: &mut Context<'_>) -> Result<DecimalIdentity, EngineError> {
    if value == 0.0 {
        return Ok(DecimalIdentity {
            negative: value.is_sign_negative(),
            digits: "0".to_owned(),
            exponent: BigInt::zero(),
        });
    }
    let bits = value.to_bits();
    let exponent_bits = ((bits >> 52) & 0x7ff) as i32;
    let mut significand = BigInt::from(bits & ((1u64 << 52) - 1));
    let binary_shift = if exponent_bits == 0 {
        -1074
    } else {
        significand += BigInt::from(1u64 << 52);
        exponent_bits - 1023 - 52
    };
    let decimal_exponent;
    if binary_shift >= 0 {
        significand <<= binary_shift as usize;
        decimal_exponent = 0i32;
    } else {
        let scale = (-binary_shift) as u32;
        // A binary64 has at most 1074 denominator bits; this is a fixed bound.
        significand *= BigInt::from(5u8).pow(scale);
        decimal_exponent = -(scale as i32);
    }
    let coefficient = significand.to_str_radix(10);
    let token = format!(
        "{}{}e{}",
        if value.is_sign_negative() { "-" } else { "" },
        coefficient,
        decimal_exponent
    );
    decimal_identity(&token, ctx)
}

/// Construct a decimal carrier after exact JSON number-token validation.
/// The complete caller spelling, including exponent, zeros and signed zero,
/// is returned unchanged.
pub fn exact_decimal(token: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    decimal_identity(token, ctx)?;
    Ok(token.to_owned())
}

/// Validate a canonical decimal integer string received from a host bigint.
/// The host wrapper is responsible for requiring the host's bigint type.
pub fn integer_from_bigint(token: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let token = admitted_text(token, ctx)?;
    let digits = token.strip_prefix('-').unwrap_or(token);
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) ||
       (digits.len() > 1 && digits.starts_with('0')) || (token.starts_with('-') && digits == "0") {
        return Err(numeric_error("Expected canonical bigint decimal spelling"));
    }
    Ok(token.to_owned())
}

/// Recover a bigint from any integral JSON number-token spelling.
pub fn integer_to_bigint(token: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let identity = decimal_identity(token, ctx)?;
    if identity.negative && identity.digits == "0" {
        return Err(numeric_error("bigint cannot preserve negative zero"));
    }
    let coefficient = exact_coefficient(&Utf16::from(token), 0, None, ctx)?;
    format_bigint_decimal_for_numeric(&coefficient, ctx)
}

/// Admit a finite JavaScript binary64 under the explicit integer or decimal
/// policy. Decimal admission requires the ECMAScript shortest spelling to
/// identify exactly the same mathematical decimal as the binary64 bits.
pub fn admit_javascript_number(
    value: f64,
    scalar_type: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    if !value.is_finite() || (value == 0.0 && value.is_sign_negative()) {
        return Err(numeric_error("Expected finite number without negative zero"));
    }
    let token = ecma_number_to_string(value);
    match scalar_type {
        "integer" => {
            if value.fract() != 0.0 || value.abs() > MAX_SAFE_INTEGER {
                return Err(numeric_error("Integer number must be safe"));
            }
            decimal_identity(&token, ctx)?;
        }
        "decimal" => {
            if decimal_identity(&token, ctx)? != binary_identity(value, ctx)? {
                return Err(numeric_error(
                    "Number spelling changes its exact decimal value; supply an exact decimal token",
                ));
            }
        }
        _ => return Err(numeric_error("Expected integer or decimal family")),
    }
    Ok(token)
}

/// Convert an exact integer/decimal token to binary64 only when its exact
/// mathematical value equals the resulting finite number. Integer values also
/// have the CONTRACT-049 safe-number restriction.
pub fn numeric_to_number_lossless(
    token: &str,
    integer: bool,
    ctx: &mut Context<'_>,
) -> Result<f64, EngineError> {
    let identity = decimal_identity(token, ctx)?;
    let value = token
        .parse::<f64>()
        .map_err(|_| numeric_error("Number conversion would change the exact value"))?;
    if !value.is_finite() || (value == 0.0 && value.is_sign_negative()) {
        return Err(numeric_error(
            "Number cannot preserve this value in the admitted profile",
        ));
    }
    if integer {
        if value.abs() > MAX_SAFE_INTEGER || value.fract() != 0.0 {
            return Err(numeric_error("Integer number must be safe"));
        }
        let exact = exact_coefficient(&Utf16::from(token), 0, None, ctx)?;
        let recovered = BigInt::from(value as i64);
        if exact != recovered {
            return Err(numeric_error("Number conversion would change the exact value"));
        }
    }
    if identity != binary_identity(value, ctx)? {
        return Err(numeric_error("Number conversion would change the exact value"));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spelling_and_bigint_rules_match_contract() {
        let mut ctx = Context::ordinary();
        assert_eq!(exact_decimal("1.2300E+02", &mut ctx).unwrap(), "1.2300E+02");
        assert_eq!(integer_to_bigint("12300e-2", &mut ctx).unwrap(), "123");
        assert_eq!(integer_from_bigint("9223372036854775807", &mut ctx).unwrap(), "9223372036854775807");
        for token in ["10", "-20", "1000000"] {
            assert_eq!(integer_from_bigint(token, &mut Context::ordinary()).unwrap(), token);
        }
        assert_eq!(integer_from_bigint("-0", &mut Context::ordinary()).unwrap_err().code, "JAVASCRIPT_NUMERIC");
        assert_eq!(integer_to_bigint("-0", &mut ctx).unwrap_err().code, "JAVASCRIPT_NUMERIC");
        let long_exponent = format!("1e{}", "9".repeat(33));
        for token in ["01", "+1", ".1", "1.", "1e", "NaN", long_exponent.as_str()].iter() {
            assert!(exact_decimal(token, &mut Context::ordinary()).is_err(), "{token}");
        }
    }

    #[test]
    fn large_bigint_text_is_refused_before_numeric_parsing_when_work_is_unavailable() {
        let mut reject = |_amount: usize| Err(EngineError::new("RESOURCE_LIMIT", Utf16::default(), "budget"));
        let mut ctx = Context::ordinary().with_host_control(&mut reject);
        let token = "9".repeat(100_000);
        assert_eq!(integer_from_bigint(&token, &mut ctx).unwrap_err().code, "RESOURCE_LIMIT");
    }

    #[test]
    fn expanded_integer_output_is_precharged_before_radix_formatting() {
        let mut reject_large = |amount: usize| {
            if amount > 20_000_000 {
                Err(EngineError::new("RESOURCE_LIMIT", Utf16::default(), "budget"))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut reject_large);
        assert_eq!(integer_to_bigint("1e99999", &mut ctx).unwrap_err().code, "RESOURCE_LIMIT");
    }

    #[test]
    fn binary64_admission_and_recovery_are_exact() {
        for value in [0.5, -0.125, 1.25, 9_007_199_254_740_992.0] {
            let token = admit_javascript_number(value, "decimal", &mut Context::ordinary()).unwrap();
            assert_eq!(numeric_to_number_lossless(&token, false, &mut Context::ordinary()).unwrap(), value);
        }
        for value in [0.1, 0.2, 0.3, f64::MIN_POSITIVE / 2.0, f64::MAX, -0.0, f64::INFINITY, f64::NAN] {
            assert!(admit_javascript_number(value, "decimal", &mut Context::ordinary()).is_err());
        }
        let exact = "0.1000000000000000055511151231257827021181583404541015625";
        assert_eq!(numeric_to_number_lossless(exact, false, &mut Context::ordinary()).unwrap(), 0.1);
        let subnormal = format!("{}e-1074", BigInt::from(5u8).pow(1074));
        assert_eq!(numeric_to_number_lossless(&subnormal, false, &mut Context::ordinary()).unwrap(), f64::from_bits(1));
        for token in ["0.1", "1e400", "1e-400", "-0.000", "9007199254740993"] {
            assert!(numeric_to_number_lossless(token, false, &mut Context::ordinary()).is_err(), "{token}");
        }
    }
}
