// SPDX-License-Identifier: MIT OR Apache-2.0
//! Small, explicit ECMAScript primitive coercion helpers used by the closed
//! constraint interpreter. This module does not implement object ToPrimitive;
//! the interpreter owns that step and passes the resulting primitive here.

use std::cmp::Ordering;

use crate::{context::Context, error::EngineError, value::Utf16};

#[derive(Clone, Copy, Debug)]
pub(crate) enum Primitive<'a> {
    Undefined,
    Null,
    Bool(bool),
    Number(f64),
    String(&'a Utf16),
}

/// ECMAScript Abstract Relational Comparison for already-primitive operands.
/// `None` represents an unordered comparison (one numeric operand is NaN).
pub(crate) fn abstract_relational_compare(
    a: Primitive<'_>,
    b: Primitive<'_>,
    ctx: &mut Context<'_>,
) -> Result<Option<Ordering>, EngineError> {
    match (a, b) {
        (Primitive::String(left), Primitive::String(right)) => {
            ctx.charge_work(left.len().saturating_add(right.len()), Utf16::default())?;
            Ok(Some(left.units().cmp(right.units())))
        }
        (left, right) => {
            ctx.charge_work(1, Utf16::default())?;
            let left = to_number(left, ctx)?;
            let right = to_number(right, ctx)?;
            Ok(left.partial_cmp(&right))
        }
    }
}

fn to_number(value: Primitive<'_>, ctx: &mut Context<'_>) -> Result<f64, EngineError> {
    match value {
        Primitive::Undefined => Ok(f64::NAN),
        Primitive::Null => Ok(0.0),
        Primitive::Bool(false) => Ok(0.0),
        Primitive::Bool(true) => Ok(1.0),
        Primitive::Number(value) => Ok(value),
        Primitive::String(value) => string_to_number(value, ctx),
    }
}

fn string_to_number(value: &Utf16, ctx: &mut Context<'_>) -> Result<f64, EngineError> {
    let units = value.units();
    // Admit the initial whitespace scan before touching the source. More
    // detailed grammar/conversion work is charged once the trimmed slice is
    // known, still before scanning it or allocating a conversion buffer.
    ctx.charge_work(units.len().saturating_add(1), Utf16::default())?;
    let mut start = 0;
    let mut end = units.len();
    while start < end && is_ecma_whitespace(units[start]) {
        start += 1;
    }
    while start < end && is_ecma_whitespace(units[end - 1]) {
        end -= 1;
    }
    if start == end {
        return Ok(0.0);
    }
    let token = &units[start..end];
    if equals_ascii(token, b"Infinity") || equals_ascii(token, b"+Infinity") {
        return Ok(f64::INFINITY);
    }
    if equals_ascii(token, b"-Infinity") {
        return Ok(f64::NEG_INFINITY);
    }

    if let Some(radix) = unsigned_radix_prefix(token) {
        let bits_per_digit = if radix == 2 {
            1
        } else if radix == 8 {
            3
        } else {
            4
        };
        let digits = &token[2..];
        // Radix parsing validates every digit, then visits each significant
        // bit to derive the correctly rounded binary64 result.
        let work = digits
            .len()
            .saturating_mul(2usize.saturating_add(bits_per_digit))
            .saturating_add(1);
        ctx.charge_work(work, Utf16::default())?;
        return parse_radix_integer(digits, radix, ctx);
    }
    // Decimal grammar scan, conversion-buffer construction, and binary64
    // parser work are all admitted before the first of those passes.
    ctx.charge_work(
        token.len().saturating_mul(3).saturating_add(1),
        Utf16::default(),
    )?;
    if !is_decimal_numeric_literal(token) {
        return Ok(f64::NAN);
    }

    // The grammar check above guarantees ASCII. Allocate only after work has
    // been admitted; Rust's binary64 parser performs correctly-rounded decimal
    // conversion, including signed zero and overflow to infinity.
    let mut decimal = String::with_capacity(token.len());
    for unit in token {
        decimal.push(*unit as u8 as char);
    }
    Ok(decimal.parse::<f64>().unwrap_or(f64::NAN))
}

fn equals_ascii(units: &[u16], ascii: &[u8]) -> bool {
    units.len() == ascii.len()
        && units
            .iter()
            .zip(ascii)
            .all(|(unit, byte)| *unit == u16::from(*byte))
}

fn unsigned_radix_prefix(token: &[u16]) -> Option<u32> {
    if token.len() < 2 || token[0] != b'0' as u16 {
        return None;
    }
    match token[1] {
        0x78 | 0x58 => Some(16), // x/X
        0x62 | 0x42 => Some(2),  // b/B
        0x6f | 0x4f => Some(8),  // o/O
        _ => None,
    }
}

fn parse_radix_integer(
    digits: &[u16],
    radix: u32,
    ctx: &mut Context<'_>,
) -> Result<f64, EngineError> {
    if digits.is_empty() {
        return Ok(f64::NAN);
    }
    let bits_per_digit = match radix {
        2 => 1usize,
        8 => 3,
        16 => 4,
        _ => unreachable!(),
    };
    let mut first_nonzero = None;
    for (index, unit) in digits.iter().copied().enumerate() {
        if index % 4096 == 0 {
            ctx.charge_work(0, Utf16::default())?;
        }
        let Some(digit) = digit_value(unit) else {
            return Ok(f64::NAN);
        };
        if digit >= radix {
            return Ok(f64::NAN);
        }
        if first_nonzero.is_none() && digit != 0 {
            first_nonzero = Some(index);
        }
    }
    let Some(first_index) = first_nonzero else {
        return Ok(0.0);
    };
    let first_digit = digit_value(digits[first_index]).unwrap();
    let leading_bits = (u32::BITS - first_digit.leading_zeros()) as usize;
    let significant_digits = digits.len() - first_index;
    let bit_length = (significant_digits - 1)
        .saturating_mul(bits_per_digit)
        .saturating_add(leading_bits);

    let mut top = 0u64;
    let mut seen = 0usize;
    let mut guard = false;
    let mut sticky = false;
    let mut bit_position = 0usize;
    let mut poll_counter = 0usize;
    for (index, unit) in digits.iter().copied().enumerate().skip(first_index) {
        let digit = digit_value(unit).unwrap();
        let count = if index == first_index {
            leading_bits
        } else {
            bits_per_digit
        };
        for bit in (0..count).rev() {
            poll_counter += 1;
            if poll_counter % 16_384 == 0 {
                ctx.charge_work(0, Utf16::default())?;
            }
            let set = (digit & (1 << bit)) != 0;
            if seen < 53 {
                top = (top << 1) | u64::from(set);
                seen += 1;
            } else if seen == 53 {
                guard = set;
                seen += 1;
            } else {
                sticky |= set;
                seen += 1;
            }
            bit_position += 1;
        }
    }
    debug_assert_eq!(bit_position, bit_length);

    let mut shift = bit_length.saturating_sub(53);
    if guard && (sticky || top & 1 == 1) {
        top += 1;
        if top == (1u64 << 53) {
            top >>= 1;
            shift += 1;
        }
    }
    let highest_exponent = shift.saturating_add(52);
    if highest_exponent > 1023 {
        return Ok(f64::INFINITY);
    }
    Ok((top as f64) * 2.0f64.powi(shift as i32))
}

fn digit_value(unit: u16) -> Option<u32> {
    match unit {
        0x30..=0x39 => Some(u32::from(unit - 0x30)),
        0x41..=0x46 => Some(u32::from(unit - 0x41 + 10)),
        0x61..=0x66 => Some(u32::from(unit - 0x61 + 10)),
        _ => None,
    }
}

fn is_decimal_numeric_literal(token: &[u16]) -> bool {
    let mut index = 0;
    if matches!(token.first(), Some(0x2b | 0x2d)) {
        index += 1;
    }
    let before = take_digits(token, &mut index);
    let mut after = false;
    if token.get(index) == Some(&(b'.' as u16)) {
        index += 1;
        after = take_digits(token, &mut index);
    }
    if !before && !after {
        return false;
    }
    if matches!(token.get(index), Some(0x65 | 0x45)) {
        index += 1;
        if matches!(token.get(index), Some(0x2b | 0x2d)) {
            index += 1;
        }
        if !take_digits(token, &mut index) {
            return false;
        }
    }
    index == token.len()
}

fn take_digits(token: &[u16], index: &mut usize) -> bool {
    let start = *index;
    while token
        .get(*index)
        .is_some_and(|unit| (0x30..=0x39).contains(unit))
    {
        *index += 1;
    }
    *index != start
}

fn is_ecma_whitespace(unit: u16) -> bool {
    matches!(
        unit,
        0x0009..=0x000d
            | 0x0020
            | 0x00a0
            | 0x1680
            | 0x2000..=0x200a
            | 0x2028
            | 0x2029
            | 0x202f
            | 0x205f
            | 0x3000
            | 0xfeff
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cmp(left: Primitive<'_>, right: Primitive<'_>) -> Option<Ordering> {
        abstract_relational_compare(left, right, &mut Context::ordinary()).unwrap()
    }

    fn string(value: &str) -> Utf16 {
        Utf16::from(value)
    }

    #[test]
    fn primitive_relational_comparison_uses_utf16_for_two_strings() {
        let astral = Utf16::new(vec![0xd800, 0xdc00]);
        let bmp = Utf16::new(vec![0xe000]);
        let ten = string("10");
        let two = string("2");
        assert_eq!(
            cmp(Primitive::String(&astral), Primitive::String(&bmp)),
            Some(Ordering::Less)
        );
        assert_eq!(
            cmp(Primitive::String(&ten), Primitive::String(&two)),
            Some(Ordering::Less)
        );
    }

    #[test]
    fn string_numeric_literal_supports_decimal_radix_whitespace_and_infinity() {
        for (source, expected) in [
            ("", 0.0),
            (" \u{feff}\t", 0.0),
            (".5", 0.5),
            ("1.", 1.0),
            ("+1.25e2", 125.0),
            ("0x20000000000001", 9_007_199_254_740_992.0),
            ("0b101010", 42.0),
            ("0o52", 42.0),
            ("Infinity", f64::INFINITY),
            ("-Infinity", f64::NEG_INFINITY),
        ] {
            let value = string(source);
            let result = to_number(Primitive::String(&value), &mut Context::ordinary()).unwrap();
            assert_eq!(result, expected, "source={source:?}");
        }
        let negative_zero = string("-0");
        assert!(
            to_number(Primitive::String(&negative_zero), &mut Context::ordinary())
                .unwrap()
                .is_sign_negative()
        );
    }

    #[test]
    fn invalid_string_numeric_literals_and_nan_are_unordered() {
        for source in ["+0x1", "0x", "1_0", "1e", "NaN", "\u{85}1", "\u{200b}"] {
            let value = string(source);
            assert!(
                to_number(Primitive::String(&value), &mut Context::ordinary())
                    .unwrap()
                    .is_nan(),
                "source={source:?}"
            );
        }
        assert_eq!(cmp(Primitive::Undefined, Primitive::Number(0.0)), None);
        assert_eq!(cmp(Primitive::Number(f64::NAN), Primitive::Null), None);
        let one = string("1");
        assert_eq!(
            cmp(Primitive::Bool(true), Primitive::String(&one)),
            Some(Ordering::Equal)
        );
    }

    #[test]
    fn radix_conversion_rounds_to_binary64_ties_to_even_and_overflows() {
        let tie_even = string("0x20000000000001");
        let tie_odd = string("0x20000000000003");
        let overflow = string(format!("0x1{}", "0".repeat(260)).as_str());
        assert_eq!(
            to_number(Primitive::String(&tie_even), &mut Context::ordinary()).unwrap(),
            9_007_199_254_740_992.0
        );
        assert_eq!(
            to_number(Primitive::String(&tie_odd), &mut Context::ordinary()).unwrap(),
            9_007_199_254_740_996.0
        );
        assert_eq!(
            to_number(Primitive::String(&overflow), &mut Context::ordinary()).unwrap(),
            f64::INFINITY
        );
    }

    #[test]
    fn string_numeric_conversion_charges_before_scanning_and_propagates_control_errors() {
        let value = string("123.5");
        let mut meter = |_amount| Err(EngineError::new("METER_STOP", Utf16::default(), "stopped"));
        let error = to_number(
            Primitive::String(&value),
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "METER_STOP");
    }

    #[test]
    fn frozen_native_ecmascript_string_numeric_corpus_matches_all_1548_cases() {
        const RECEIPT: &str = include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r2/sol-ecma-coercion-predecessor.json"
        );
        let receipt: serde_json::Value = serde_json::from_str(RECEIPT).unwrap();
        assert_eq!(
            receipt["generatorSha256"].as_str(),
            Some("f1c9e46da42971cf5ff7a5890d69560be37203a9858025c3e9940329a886b5ff")
        );
        let cases = receipt["cases"].as_array().unwrap();
        assert_eq!(cases.len(), 1548);
        for case in cases {
            let source = case["sourceUnits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_u64().unwrap() as u16)
                .collect::<Vec<_>>();
            let source = Utf16::new(source);
            let expected_bits =
                u64::from_str_radix(case["expectedBits"].as_str().unwrap(), 16).unwrap();
            let expected = f64::from_bits(expected_bits);
            let actual = abstract_relational_compare(
                Primitive::String(&source),
                Primitive::Number(expected),
                &mut Context::ordinary(),
            )
            .unwrap();
            let expected_ordering = if case["expectedNaN"].as_bool().unwrap() {
                None
            } else {
                Some(Ordering::Equal)
            };
            assert_eq!(
                actual,
                expected_ordering,
                "{}",
                case["id"].as_str().unwrap()
            );
        }
    }
}
