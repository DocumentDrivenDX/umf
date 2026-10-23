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
pub const MAX_CURSOR: usize = 16_384;
const MAX_CURSOR_JSON: usize = 12_239;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OperationValuesError {
    Json,
    FrameBound,
    CursorCapacity,
    Cursor,
}
impl fmt::Display for OperationValuesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Json => "invalid operation JSON",
            Self::FrameBound => "native wire frame bound exceeded",
            Self::CursorCapacity => "cursor capacity exceeded",
            Self::Cursor => "invalid cursor",
        })
    }
}
impl std::error::Error for OperationValuesError {}

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
fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut key_block = [0u8; 64];
    if key.len() > 64 {
        key_block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }
    let mut inner = Vec::with_capacity(64 + message.len());
    let mut outer = Vec::with_capacity(96);
    for byte in key_block {
        inner.push(byte ^ 0x36);
        outer.push(byte ^ 0x5c);
    }
    inner.extend_from_slice(message);
    outer.extend_from_slice(&Sha256::digest(inner));
    Sha256::digest(outer).into()
}
fn constant_eq(left: &[u8], right: &[u8]) -> bool {
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
}
