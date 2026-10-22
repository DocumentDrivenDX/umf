// SPDX-License-Identifier: MIT OR Apache-2.0
//! Literal-only Python source rendering helpers shared by both generators.

use umf_core::{Context, EngineError, Utf16, Value};

pub(crate) const PYTHON_RUNTIME: &str = include_str!("python_runtime.py");
pub(crate) const TABLE_RUNTIME: &str = include_str!("table_runtime.py");

const POLL: usize = 1024;

/// Match the TypeScript renderer's JSON-style Python literal escaping while
/// retaining source UTF-16 until a literal is emitted. Ill-formed surrogate
/// units are represented by Python `\\uXXXX` escapes, never replacement text.
pub(crate) fn string_literal(text: &Utf16, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let units = text.units();
    let estimated = units
        .len()
        .checked_mul(6)
        .and_then(|n| n.checked_add(2))
        .ok_or_else(|| {
            EngineError::new("LIMIT", Utf16::default(), "Python literal size overflow")
        })?;
    ctx.charge_work(estimated, Utf16::default())?;
    let mut out = String::with_capacity(estimated);
    out.push('"');
    let mut index = 0;
    let mut next_poll = POLL;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            ctx.check_cancelled(Utf16::default())?;
            next_poll = index.saturating_add(POLL);
        }
        let unit = units[index];
        match unit {
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x08 => out.push_str("\\b"),
            0x09 => out.push_str("\\t"),
            0x0a => out.push_str("\\n"),
            0x0c => out.push_str("\\f"),
            0x0d => out.push_str("\\r"),
            0..=0x1f | 0x2028 | 0x2029 => out.push_str(&format!("\\u{unit:04x}")),
            0xd800..=0xdbff => {
                if let Some(low @ 0xdc00..=0xdfff) = units.get(index + 1).copied() {
                    let scalar = 0x10000 + (((unit as u32 - 0xd800) << 10) | (low as u32 - 0xdc00));
                    out.push(char::from_u32(scalar).expect("well-formed surrogate pair"));
                    index += 1;
                } else {
                    out.push_str(&format!("\\u{unit:04x}"));
                }
            }
            0xdc00..=0xdfff => out.push_str(&format!("\\u{unit:04x}")),
            _ => out.push(char::from_u32(unit as u32).expect("non-surrogate UTF-16 unit")),
        }
        index += 1;
    }
    out.push('"');
    Ok(out)
}

pub(crate) fn value_literal(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => Ok("None".into()),
        Value::Bool(true) => Ok("True".into()),
        Value::Bool(false) => Ok("False".into()),
        Value::Number(n) => {
            if !n.is_finite() {
                return Err(EngineError::new(
                    "NUMBER",
                    Utf16::default(),
                    "Nonfinite Python metadata literal",
                ));
            }
            Ok(umf_core::ecma_number_to_string(*n))
        }
        Value::String(s) => string_literal(s, ctx),
        Value::Array(items) => {
            ctx.charge_work(items.len().saturating_add(2), Utf16::default())?;
            let mut out = String::from("[");
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push_str(", ");
                }
                let rendered = value_literal(item, ctx)?;
                append_text(&mut out, &rendered, ctx)?;
            }
            out.push(']');
            Ok(out)
        }
        Value::Object(members) => {
            ctx.charge_work(members.len().saturating_add(2), Utf16::default())?;
            let mut out = String::from("{");
            for (index, (key, value)) in crate::value::js_object_members(value, ctx)?
                .into_iter()
                .enumerate()
            {
                if index > 0 {
                    out.push_str(", ");
                }
                let rendered = string_literal(key, ctx)?;
                append_text(&mut out, &rendered, ctx)?;
                out.push_str(": ");
                let rendered = value_literal(value, ctx)?;
                append_text(&mut out, &rendered, ctx)?;
            }
            out.push('}');
            Ok(out)
        }
    }
}

/// Meter the copy before reserving and poll during potentially large output copies.
pub(crate) fn append_text(
    out: &mut String,
    text: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(text.len(), Utf16::default())?;
    out.reserve(text.len());
    let mut start = 0;
    while start < text.len() {
        ctx.check_cancelled(Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        let mut end = (start + 4096).min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        out.push_str(&text[start..end]);
        start = end;
    }
    Ok(())
}

pub(crate) fn utf16_cmp(a: &Utf16, b: &Utf16) -> std::cmp::Ordering {
    a.units().cmp(b.units())
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(crate) fn source_bytes(text: &Utf16) -> Result<Vec<u8>, EngineError> {
    text.to_utf8().map(String::into_bytes).map_err(|_| {
        EngineError::new(
            "INPUT",
            Utf16::default(),
            "Source text is not valid UTF-8 scalar text",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn python_literals_preserve_astral_and_lone_surrogate_code_units() {
        let mut ctx = Context::ordinary();
        let value = Utf16::new(vec![b'a' as u16, 0xd83d, 0xde00, 0xd800]);
        assert_eq!(string_literal(&value, &mut ctx).unwrap(), r#""a😀\ud800""#);
    }

    #[test]
    fn python_literals_escape_separators_and_controls() {
        let mut ctx = Context::ordinary();
        let value = Utf16::from("x\u{2028}\u{2029}\n\t");
        assert_eq!(
            string_literal(&value, &mut ctx).unwrap(),
            r#""x\u2028\u2029\n\t""#
        );
    }
}

#[cfg(test)]
mod cooperative_render_tests {
    use super::*;
    #[test]
    fn long_utf16_literals_poll_after_precharge() {
        let text = Utf16::new(vec![0xd800; 32768]);
        let mut polls = 0;
        let mut cancel = || {
            polls += 1;
            polls > 5
        };
        let error = string_literal(
            &text,
            &mut Context::ordinary().with_cancellation(&mut cancel),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "CANCELLED");
        assert!(polls > 5);
    }
    #[test]
    fn long_rendered_copies_poll_during_copy() {
        let mut polls = 0;
        let mut cancel = || {
            polls += 1;
            polls > 5
        };
        let mut output = String::new();
        let error = append_text(
            &mut output,
            &"x".repeat(131072),
            &mut Context::ordinary().with_cancellation(&mut cancel),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert!(output.len() < 131072);
    }
    #[test]
    fn nested_literal_emission_retains_host_meter_failure() {
        let value = Value::Array(vec![Value::Bool(true); 100]);
        let mut charges = 0;
        let mut meter = |_: usize| {
            charges += 1;
            if charges == 20 {
                Err(EngineError::new("NUMBER", Utf16::from("/host"), "injected"))
            } else {
                Ok(())
            }
        };
        let error =
            value_literal(&value, &mut Context::ordinary().with_meter(&mut meter)).unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.path, Utf16::from("/host"));
        assert_eq!(error.code, "NUMBER");
    }
}
