//! Canonical operation JSON and authenticated page-cursor primitives.
use crate::{
    context::Context,
    native_json::{NativeJsonNode, NativeJsonTree},
    value::Utf16,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::{fmt, fmt::Write as _};

pub const PROFILE_VERSION: &str = "umf-operation-values/0.1.0";
pub const COUNT_TOKEN_PROFILE_VERSION: &str = "umf-operation-count-token/0.1.0";
pub const MAX_CURSOR: usize = 16_384;
const MAX_CURSOR_JSON: usize = 12_239;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OperationValuesError {
    Json,
    FrameBound,
    CursorCapacity,
    Cursor,
    NativeKeyAbsent,
}
impl fmt::Display for OperationValuesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Json => "invalid operation JSON",
            Self::FrameBound => "native wire frame bound exceeded",
            Self::CursorCapacity => "cursor capacity exceeded",
            Self::Cursor => "invalid cursor",
            Self::NativeKeyAbsent => "native cursor key is absent",
        })
    }
}

impl std::error::Error for OperationValuesError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KeyLiteralMode {
    String,
    Boolean,
    PassThrough,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeTokenKind {
    Integer,
    NonnegativeInteger,
    Decimal,
    Uuid,
    Bits128,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeTokenDecision {
    Accepted,
    Refused,
    DecimalInvalidOperation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeResultKind {
    Date,
    Timestamp,
    FloatDecimal,
    FloatIeee754Binary64Hex,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeResultDecision {
    Accepted,
    Candidate,
    Refused,
}

/// Admit closed built-in native result carriers without host callbacks.
/// Timestamp returns `Candidate` after lexical admission because the Python
/// adapter deliberately retains its interpreter-version-specific
/// `datetime.fromisoformat` calendar/time check.
pub fn native_result_classify(
    context: &mut Context<'_>,
    kind: NativeResultKind,
    token: &str,
) -> Result<NativeResultDecision, crate::error::EngineError> {
    context.charge_work(token.len(), Utf16::default())?;
    Ok(match kind {
        NativeResultKind::Date => result_decision(valid_date_token(token)),
        NativeResultKind::Timestamp => {
            if valid_timestamp_shape(token) {
                NativeResultDecision::Candidate
            } else {
                NativeResultDecision::Refused
            }
        }
        NativeResultKind::FloatDecimal => result_decision(valid_float_token(token)),
        NativeResultKind::FloatIeee754Binary64Hex => result_decision(valid_binary64_hex(token)),
    })
}

fn result_decision(valid: bool) -> NativeResultDecision {
    if valid {
        NativeResultDecision::Accepted
    } else {
        NativeResultDecision::Refused
    }
}

fn valid_date_token(token: &str) -> bool {
    let bytes = token.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..10].iter().all(u8::is_ascii_digit)
    {
        return false;
    }
    let year = u16::from(bytes[0] - b'0') * 1000
        + u16::from(bytes[1] - b'0') * 100
        + u16::from(bytes[2] - b'0') * 10
        + u16::from(bytes[3] - b'0');
    let month = (bytes[5] - b'0') * 10 + (bytes[6] - b'0');
    let day = (bytes[8] - b'0') * 10 + (bytes[9] - b'0');
    if year == 0 || !(1..=12).contains(&month) {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=month_days).contains(&day)
}

fn valid_timestamp_shape(token: &str) -> bool {
    let bytes = token.as_bytes();
    bytes.len() == 27
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'.'
        && bytes[26] == b'Z'
        && [0..4, 5..7, 8..10, 11..13, 14..16, 17..19, 20..26]
            .iter()
            .all(|range| bytes[range.clone()].iter().all(u8::is_ascii_digit))
}

fn valid_float_token(token: &str) -> bool {
    let bytes = token.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let mut index = usize::from(bytes[0] == b'-');
    let integer_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == integer_start || (index - integer_start > 1 && bytes[integer_start] == b'0') {
        return false;
    }
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let fraction_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == fraction_start {
            return false;
        }
    }
    if index < bytes.len() && matches!(bytes[index], b'e' | b'E') {
        index += 1;
        if index < bytes.len() && matches!(bytes[index], b'+' | b'-') {
            index += 1;
        }
        let exponent_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == exponent_start {
            return false;
        }
    }
    index == bytes.len() && token.parse::<f64>().is_ok_and(f64::is_finite)
}

fn valid_binary64_hex(token: &str) -> bool {
    if token.len() != 16
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return false;
    }
    let bits = token.bytes().fold(0u64, |bits, byte| {
        let digit = match byte {
            b'0'..=b'9' => u64::from(byte - b'0'),
            _ => u64::from(byte - b'a' + 10),
        };
        (bits << 4) | digit
    });
    bits & 0x7ff0_0000_0000_0000 != 0x7ff0_0000_0000_0000
}

/// Classify the closed text grammar for exact native result tokens.
/// The caller owns carrier extraction and UTF-8 admission; this function has no
/// host callbacks and does not normalize or rewrite the original token.
pub fn native_token_classify(
    context: &mut Context<'_>,
    kind: NativeTokenKind,
    token: &str,
) -> Result<NativeTokenDecision, crate::error::EngineError> {
    context.charge_work(token.len(), Utf16::default())?;
    Ok(match kind {
        NativeTokenKind::Integer => decision(valid_integer_token(token)),
        // Count results have the same exact integer grammar but additionally
        // reject every leading minus, including the predecessor's `-0` case.
        NativeTokenKind::NonnegativeInteger => {
            decision(!token.starts_with('-') && valid_integer_token(token))
        }
        NativeTokenKind::Decimal => valid_decimal_token(token),
        NativeTokenKind::Uuid => decision(valid_uuid_token(token)),
        NativeTokenKind::Bits128 => decision(
            token.len() == 32
                && token
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
        ),
    })
}

/// Classify the exact nonnegative integer-token subset used by native count
/// results. This deliberately rejects every leading minus, including `-0`.
pub fn count_token_nonnegative(
    context: &mut Context<'_>,
    token: &str,
) -> Result<NativeTokenDecision, crate::error::EngineError> {
    native_token_classify(context, NativeTokenKind::NonnegativeInteger, token)
}

fn decision(valid: bool) -> NativeTokenDecision {
    if valid {
        NativeTokenDecision::Accepted
    } else {
        NativeTokenDecision::Refused
    }
}

fn valid_integer_token(token: &str) -> bool {
    let digits = token.strip_prefix('-').unwrap_or(token);
    !digits.is_empty()
        && digits.bytes().all(|byte| byte.is_ascii_digit())
        && (digits == "0" || !digits.starts_with('0'))
}

fn valid_decimal_token(token: &str) -> NativeTokenDecision {
    let bytes = token.as_bytes();
    if bytes.is_empty() {
        return NativeTokenDecision::Refused;
    }
    let mut i = usize::from(bytes[0] == b'-');
    let integer_start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == integer_start || (i - integer_start > 1 && bytes[integer_start] == b'0') {
        return NativeTokenDecision::Refused;
    }
    let integer_end = i;
    let mut fraction_end = i;
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        let fraction_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == fraction_start {
            return NativeTokenDecision::Refused;
        }
        fraction_end = i;
    }
    let fraction_start = if fraction_end == integer_end {
        integer_end
    } else {
        integer_end + 1
    };
    let base_exponent = -((fraction_end - fraction_start) as i128);
    let coefficient_digits = bytes[integer_start..integer_end]
        .iter()
        .chain(bytes[fraction_start..fraction_end].iter());
    let mut significant_digits = 0usize;
    let mut nonzero_seen = false;
    for byte in coefficient_digits {
        if nonzero_seen || *byte != b'0' {
            significant_digits += 1;
            nonzero_seen = true;
        }
    }
    valid_decimal_exponent_tail(bytes, token, i, base_exponent, significant_digits.max(1))
}

fn valid_decimal_exponent_tail(
    bytes: &[u8],
    token: &str,
    mut i: usize,
    base_exponent: i128,
    significant_digits: usize,
) -> NativeTokenDecision {
    let mut decimal_exponent = base_exponent;
    let mut constructor_overflow = false;
    if i < bytes.len() && matches!(bytes[i], b'e' | b'E') {
        i += 1;
        let negative_exponent = i < bytes.len() && bytes[i] == b'-';
        if i < bytes.len() && matches!(bytes[i], b'+' | b'-') {
            i += 1;
        }
        let exponent_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == exponent_start {
            return NativeTokenDecision::Refused;
        }
        let exponent = &token[exponent_start..i];
        let significant = exponent.trim_start_matches('0');
        let magnitude = if significant.is_empty() {
            0
        } else if let Ok(value) = significant.parse::<i128>() {
            value
        } else {
            constructor_overflow = true;
            0
        };
        let signed_magnitude = if negative_exponent {
            -magnitude
        } else {
            magnitude
        };
        if let Some(combined) = decimal_exponent.checked_add(signed_magnitude) {
            decimal_exponent = combined;
        } else {
            constructor_overflow = true;
        }
    }
    if i != bytes.len() {
        return NativeTokenDecision::Refused;
    }
    if constructor_overflow {
        // Grammar-valid but unrepresentable Decimal exponents set the Python
        // InvalidOperation flag. The adapter restores that host-visible effect.
        return NativeTokenDecision::DecimalInvalidOperation;
    }
    if decimal_exponent > 999_999_999_999_999_999i128
        || decimal_exponent < -1_999_999_999_999_999_997i128
    {
        return NativeTokenDecision::DecimalInvalidOperation;
    }
    let Some(adjusted_exponent) = decimal_exponent.checked_add(significant_digits as i128 - 1)
    else {
        return NativeTokenDecision::DecimalInvalidOperation;
    };
    if adjusted_exponent > 999_999_999_999_999_999i128 {
        NativeTokenDecision::DecimalInvalidOperation
    } else {
        NativeTokenDecision::Accepted
    }
}

fn valid_uuid_token(token: &str) -> bool {
    token.len() == 36
        && token.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

pub fn key_literal_mode(
    carrier: &Utf16,
    value_is_none: bool,
) -> Result<KeyLiteralMode, OperationValuesError> {
    if value_is_none {
        return Err(OperationValuesError::NativeKeyAbsent);
    }
    Ok(match carrier.to_utf8().ok().as_deref() {
        Some("string") => KeyLiteralMode::String,
        Some("boolean") => KeyLiteralMode::Boolean,
        _ => KeyLiteralMode::PassThrough,
    })
}

fn parse(raw: &str) -> Result<NativeJsonTree, OperationValuesError> {
    let source: Vec<u16> = raw.encode_utf16().collect();
    NativeJsonTree::parse_json(&source, &mut Context::ordinary())
        .map_err(|_| OperationValuesError::Json)
}

fn append(out: &mut String, text: &str, limit: Option<usize>) -> Result<(), OperationValuesError> {
    if limit.is_some_and(|limit| out.len().saturating_add(text.len()) > limit) {
        return Err(OperationValuesError::FrameBound);
    }
    out.push_str(text);
    Ok(())
}
fn write_string(
    value: &str,
    out: &mut String,
    limit: Option<usize>,
) -> Result<(), OperationValuesError> {
    append(out, "\"", limit)?;
    for c in value.chars() {
        match c {
            '"' => append(out, "\\\"", limit)?,
            '\\' => append(out, "\\\\", limit)?,
            '\u{0008}' => append(out, "\\b", limit)?,
            '\u{000c}' => append(out, "\\f", limit)?,
            '\n' => append(out, "\\n", limit)?,
            '\r' => append(out, "\\r", limit)?,
            '\t' => append(out, "\\t", limit)?,
            c if c < ' ' => {
                let escape = format!("\\u{:04x}", c as u32);
                append(out, &escape, limit)?;
            }
            c => {
                let mut encoded = [0; 4];
                append(out, c.encode_utf8(&mut encoded), limit)?;
            }
        }
    }
    append(out, "\"", limit)
}
fn write_node(
    node: &NativeJsonNode,
    out: &mut String,
    limit: Option<usize>,
) -> Result<(), OperationValuesError> {
    match node {
        NativeJsonNode::Null => append(out, "null", limit),
        NativeJsonNode::Boolean(value) => append(out, if *value { "true" } else { "false" }, limit),
        NativeJsonNode::Number(token) => append(out, token, limit),
        NativeJsonNode::String(value) => write_string(
            &value.to_utf8().map_err(|_| OperationValuesError::Json)?,
            out,
            limit,
        ),
        NativeJsonNode::Array(items) => {
            append(out, "[", limit)?;
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    append(out, ",", limit)?;
                }
                write_node(item, out, limit)?;
            }
            append(out, "]", limit)
        }
        NativeJsonNode::Object(members) => {
            let mut sorted = members
                .iter()
                .map(|(key, value)| {
                    key.to_utf8()
                        .map(|key| (key, value))
                        .map_err(|_| OperationValuesError::Json)
                })
                .collect::<Result<Vec<_>, _>>()?;
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            append(out, "{", limit)?;
            for (index, (key, value)) in sorted.iter().enumerate() {
                if index > 0 {
                    append(out, ",", limit)?;
                }
                write_string(key, out, limit)?;
                append(out, ":", limit)?;
                write_node(value, out, limit)?;
            }
            append(out, "}", limit)
        }
    }
}
fn canonical_tree(tree: &NativeJsonTree) -> Result<String, OperationValuesError> {
    let mut output = String::new();
    write_node(tree.root(), &mut output, None)?;
    Ok(output)
}
pub fn canonical(raw: &str) -> Result<String, OperationValuesError> {
    canonical_tree(&parse(raw)?)
}
pub fn bounded_size(raw: &str, limit: usize) -> Result<usize, OperationValuesError> {
    bounded_size_node(parse(raw)?.root(), limit)
}
pub fn bounded_size_node(
    node: &NativeJsonNode,
    limit: usize,
) -> Result<usize, OperationValuesError> {
    let mut output = String::new();
    write_node(node, &mut output, Some(limit))?;
    Ok(output.len())
}
pub fn digest(raw: &str) -> Result<String, OperationValuesError> {
    Ok(hex(&Sha256::digest(canonical(raw)?.as_bytes())))
}
pub fn loads(raw: &str) -> Result<String, OperationValuesError> {
    parse(raw)?;
    Ok(raw.to_owned())
}
fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(out, "{b:02x}");
    }
    out
}
pub(crate) fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut key_block = [0u8; 64];
    if key.len() > 64 {
        key_block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }
    let mut inner = Sha256::new();
    for byte in key_block {
        inner.update([byte ^ 0x36]);
    }
    inner.update(message);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    for byte in key_block {
        outer.update([byte ^ 0x5c]);
    }
    outer.update(inner_digest);
    outer.finalize().into()
}
pub(crate) fn constant_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right) {
        difference |= a ^ b;
    }
    difference == 0
}
fn cursor_envelope(scope: &str, after: &str) -> Result<NativeJsonNode, OperationValuesError> {
    let scope = parse(scope)?;
    let after = parse(after)?;
    Ok(NativeJsonNode::Object(vec![
        (
            Utf16::from_utf8("version"),
            NativeJsonNode::String(Utf16::from_utf8("umf.table-cursor/0.1")),
        ),
        (Utf16::from_utf8("scope"), scope.root().clone()),
        (Utf16::from_utf8("after"), after.root().clone()),
    ]))
}
pub fn token_encode(
    secret: &[u8],
    scope: &str,
    after: &str,
) -> Result<String, OperationValuesError> {
    if scope.len().saturating_add(after.len()).saturating_add(52) > MAX_CURSOR_JSON {
        return Err(OperationValuesError::CursorCapacity);
    }
    let envelope = cursor_envelope(scope, after)?;
    let mut raw = String::new();
    write_node(&envelope, &mut raw, Some(MAX_CURSOR_JSON))
        .map_err(|_| OperationValuesError::CursorCapacity)?;
    let encoded = URL_SAFE_NO_PAD.encode(raw.as_bytes());
    let signature = hex(&hmac_sha256(secret, encoded.as_bytes()));
    let token = format!("{encoded}.{signature}");
    if token.len() > MAX_CURSOR {
        return Err(OperationValuesError::CursorCapacity);
    }
    Ok(token)
}
fn member<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    let NativeJsonNode::Object(fields) = node else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key.to_utf8().is_ok_and(|key| key == name))
        .map(|(_, value)| value)
}
pub fn token_decode(secret: &[u8], token: &str) -> Result<String, OperationValuesError> {
    if token.len() > MAX_CURSOR {
        return Err(OperationValuesError::Cursor);
    }
    let (encoded, signature) = token.split_once('.').ok_or(OperationValuesError::Cursor)?;
    if encoded.is_empty()
        || signature.len() != 64
        || token.matches('.').count() != 1
        || !encoded
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || !signature
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(OperationValuesError::Cursor);
    }
    let expected = hex(&hmac_sha256(secret, encoded.as_bytes()));
    if !constant_eq(signature.as_bytes(), expected.as_bytes()) {
        return Err(OperationValuesError::Cursor);
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| OperationValuesError::Cursor)?;
    let raw = std::str::from_utf8(&bytes).map_err(|_| OperationValuesError::Cursor)?;
    let tree = parse(raw).map_err(|_| OperationValuesError::Cursor)?;
    let root = tree.root();
    let NativeJsonNode::Object(fields) = root else {
        return Err(OperationValuesError::Cursor);
    };
    if fields.len() != 3
        || member(root, "version")
            != Some(&NativeJsonNode::String(Utf16::from_utf8(
                "umf.table-cursor/0.1",
            )))
        || !matches!(member(root, "scope"), Some(NativeJsonNode::Object(_)))
        || !matches!(member(root, "after"), Some(NativeJsonNode::Array(_)))
    {
        return Err(OperationValuesError::Cursor);
    }
    // Validation must not normalize externally signed bytes. The predecessor
    // returns the parsed payload with its original object insertion order.
    Ok(raw.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_date_timestamp_and_float_carrier_admission_is_bounded() {
        let classify =
            |kind, token| native_result_classify(&mut Context::ordinary(), kind, token).unwrap();
        for token in ["0001-01-01", "2000-02-29", "9999-12-31"] {
            assert_eq!(
                classify(NativeResultKind::Date, token),
                NativeResultDecision::Accepted,
                "{token}"
            );
        }
        for token in ["0000-01-01", "1900-02-29", "2026-2-03"] {
            assert_eq!(
                classify(NativeResultKind::Date, token),
                NativeResultDecision::Refused,
                "{token}"
            );
        }
        for token in ["0001-01-01T00:00:00.000000Z", "2026-01-01T24:00:00.000000Z"] {
            assert_eq!(
                classify(NativeResultKind::Timestamp, token),
                NativeResultDecision::Candidate,
                "{token}"
            );
        }
        for token in [
            "2026-01-01T00:00:00.1234567Z",
            "2026-01-01T00:00:00.123456+01:00",
        ] {
            assert_eq!(
                classify(NativeResultKind::Timestamp, token),
                NativeResultDecision::Refused,
                "{token}"
            );
        }
        for token in ["0", "-0", "5e-324", "-1e-9999"] {
            assert_eq!(
                classify(NativeResultKind::FloatDecimal, token),
                NativeResultDecision::Accepted,
                "{token}"
            );
        }
        for token in ["NaN", "1e9999", "01", "1.0 "] {
            assert_eq!(
                classify(NativeResultKind::FloatDecimal, token),
                NativeResultDecision::Refused,
                "{token}"
            );
        }
        for token in ["0000000000000001", "7fefffffffffffff"] {
            assert_eq!(
                classify(NativeResultKind::FloatIeee754Binary64Hex, token),
                NativeResultDecision::Accepted,
                "{token}"
            );
        }
        for token in ["7ff0000000000000", "FFFFFFFFFFFFFFFF", "3ff000000000000"] {
            assert_eq!(
                classify(NativeResultKind::FloatIeee754Binary64Hex, token),
                NativeResultDecision::Refused,
                "{token}"
            );
        }
    }

    #[test]
    fn strict_duplicate_nonfinite_and_reserved_content_handling() {
        for source in [r#"{"a":1,"a":2}"#, r#"{"x":NaN}"#] {
            assert_eq!(loads(source), Err(OperationValuesError::Json));
        }
        for source in [
            r#"{"$serde_json::private::Number":"12"}"#,
            r#"{"\u0024serde_json::private::Number":"12"}"#,
        ] {
            assert_eq!(
                canonical(source).unwrap(),
                r#"{"$serde_json::private::Number":"12"}"#
            );
        }
        assert_eq!(
            canonical(r#"{"a":18446744073709551616000}"#).unwrap(),
            r#"{"a":18446744073709551616000}"#
        );
    }
    #[test]
    fn token_vector_and_order() {
        let t = token_encode(b"x", r#"{"b":2,"a":1}"#, "[]").unwrap();
        assert_eq!(
            token_decode(b"x", &t).unwrap(),
            r#"{"after":[],"scope":{"a":1,"b":2},"version":"umf.table-cursor/0.1"}"#
        );
        assert_eq!(token_decode(b"y", &t), Err(OperationValuesError::Cursor));
    }

    #[test]
    fn token_decode_preserves_signed_payload_order() {
        let raw = r#"{"after":[],"scope":{"z":1,"a":2},"version":"umf.table-cursor/0.1"}"#;
        let encoded = URL_SAFE_NO_PAD.encode(raw.as_bytes());
        let signature = hex(&hmac_sha256(b"secret", encoded.as_bytes()));
        let token = format!("{encoded}.{signature}");
        assert_eq!(token_decode(b"secret", &token).unwrap(), raw);
    }

    #[test]
    fn key_literal_mode_keeps_exact_carrier_dispatch_and_absence() {
        assert_eq!(
            key_literal_mode(&Utf16::from_utf8("string"), false),
            Ok(KeyLiteralMode::String)
        );
        assert_eq!(
            key_literal_mode(&Utf16::from_utf8("boolean"), false),
            Ok(KeyLiteralMode::Boolean)
        );
        assert_eq!(
            key_literal_mode(&Utf16::from_utf8("integer"), false),
            Ok(KeyLiteralMode::PassThrough)
        );
        assert_eq!(
            key_literal_mode(&Utf16::new(vec![0xd800]), true),
            Err(OperationValuesError::NativeKeyAbsent)
        );
    }

    #[test]
    fn typed_native_token_grammar_is_exact_and_does_not_normalize() {
        let classify =
            |kind, token| native_token_classify(&mut Context::ordinary(), kind, token).unwrap();
        for (kind, token) in [
            (NativeTokenKind::Integer, "0"),
            (NativeTokenKind::Integer, "-123456789012345678901234567890"),
            (NativeTokenKind::NonnegativeInteger, "0"),
            (
                NativeTokenKind::NonnegativeInteger,
                "123456789012345678901234567890",
            ),
            (NativeTokenKind::Decimal, "-0.000e-123"),
            (NativeTokenKind::Decimal, "1e999999999999999999"),
            (NativeTokenKind::Decimal, "1.0e999999999999999999"),
            (NativeTokenKind::Decimal, "0.01e1000000000000000000"),
            (NativeTokenKind::Decimal, "1e-1999999999999999997"),
            (
                NativeTokenKind::Uuid,
                "00000000-0000-0000-0000-000000000001",
            ),
            (NativeTokenKind::Bits128, "0123456789abcdef0123456789abcdef"),
        ] {
            assert_eq!(
                classify(kind, token),
                NativeTokenDecision::Accepted,
                "{token}"
            );
        }
        for (kind, token) in [
            (NativeTokenKind::Integer, "01"),
            (NativeTokenKind::NonnegativeInteger, "-0"),
            (NativeTokenKind::NonnegativeInteger, "-1"),
            (NativeTokenKind::NonnegativeInteger, "01"),
            (NativeTokenKind::NonnegativeInteger, ""),
            (NativeTokenKind::Decimal, "01"),
            (
                NativeTokenKind::Uuid,
                "00000000-0000-0000-0000-00000000000A",
            ),
            (NativeTokenKind::Bits128, "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"),
        ] {
            assert_eq!(
                classify(kind, token),
                NativeTokenDecision::Refused,
                "{token}"
            );
        }
        for token in [
            "1e1000000000000000000",
            "1e-1999999999999999998",
            "0.1e-1999999999999999997",
            "99.99e999999999999999999",
        ] {
            assert_eq!(
                classify(NativeTokenKind::Decimal, token),
                NativeTokenDecision::DecimalInvalidOperation,
                "{token}"
            );
        }
        assert_eq!(
            classify(NativeTokenKind::Decimal, "1e"),
            NativeTokenDecision::Refused
        );
        assert_eq!(
            classify(NativeTokenKind::Decimal, "1e100000000000000000000x"),
            NativeTokenDecision::Refused
        );
    }
}
