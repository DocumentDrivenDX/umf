// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in operation matching the TypeScript exact JSON-number admission helper.
use crate::{
    context::Context,
    ecma_coercion::{to_number, Primitive},
    error::EngineError,
    value::Utf16,
};

fn number_error(message: &str) -> EngineError {
    EngineError::new("NUMBER", Utf16::default(), message)
}

/// Check whether a string's JavaScript numeric conversion preserves its exact
/// decimal value and remains inside the predecessor's interoperable profile.
/// This intentionally does not validate JSON token syntax: `+1`, `01`, and an
/// empty string have the same behavior as the TypeScript helper.
pub fn assert_exact_json_number(token: &Utf16, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_text(token.len(), Utf16::default())?;
    let number = to_number(Primitive::String(token), ctx)?;
    if !number.is_finite()
        || (number.fract() == 0.0 && number.abs() > 9_007_199_254_740_991.0)
        || (number == 0.0 && number.is_sign_negative())
    {
        return Err(number_error("Noninteroperable JSON number"));
    }

    ctx.charge_work(
        token.len().saturating_mul(2).saturating_add(64),
        Utf16::default(),
    )?;
    let source = crate::serialization::decimal_canonical(&token.to_utf8().unwrap_or_default());
    let Some(source) = source else {
        if token.is_empty() || decimal_mantissa_is_zero(token) == Some(true) {
            return Ok(());
        }
        if number == 0.0 && decimal_mantissa_is_zero(token) == Some(false) {
            return Err(number_error("Parsing would change the decimal value"));
        }
        return Err(number_error("Unsupported numeric spelling"));
    };
    let converted = crate::serialization::decimal_canonical(&crate::ecma_number_to_string(number));
    if source != converted.unwrap_or_default() {
        return Err(number_error("Parsing would change the decimal value"));
    }
    Ok(())
}

/// Recognize zero-valued decimal source even if its exponent exceeds the
/// machine integer range. The predecessor normalizes an all-zero mantissa
/// before doing exponent arithmetic.
fn decimal_mantissa_is_zero(token: &Utf16) -> Option<bool> {
    let text = token.to_utf8().ok()?;
    let text = text.strip_prefix(['+', '-']).unwrap_or(&text);
    let (mantissa, exponent) = match text.split_once(['e', 'E']) {
        Some((mantissa, exponent)) => (mantissa, Some(exponent)),
        None => (text, None),
    };
    if text.matches(['e', 'E']).count() > 1 || mantissa.is_empty() {
        return None;
    }
    if let Some(exponent) = exponent {
        let exponent = exponent.strip_prefix(['+', '-']).unwrap_or(exponent);
        if exponent.is_empty() || !exponent.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
    }
    let mut dot = false;
    let mut digit = false;
    for byte in mantissa.bytes() {
        match byte {
            b'0' => digit = true,
            b'1'..=b'9' => return Some(false),
            b'.' if !dot => dot = true,
            _ => return None,
        }
    }
    if digit {
        Some(true)
    } else {
        None
    }
}
