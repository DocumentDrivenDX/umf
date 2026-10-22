// SPDX-License-Identifier: MIT OR Apache-2.0
//! Deterministic JCS-style canonical JSON for source-bound bundle digests.
//!
//! Callers admit the full operation input before using these crate-private
//! helpers. Keys sort by UTF-16 code units; nonfinite numbers and ill-formed
//! UTF-16 refuse at the canonical UTF-8 boundary.

use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use umf_core::{Context, EngineError, Utf16, Value};

const MAX_DEPTH: usize = 128;
const POLL_UNITS: usize = 1024;

#[derive(Default)]
struct Cost {
    output_bytes: usize,
    temporary_bytes: u64,
}

fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn add_usize(target: &mut usize, amount: usize) -> Result<(), EngineError> {
    *target = target
        .checked_add(amount)
        .ok_or_else(|| error("LIMIT", "Canonical output size overflow"))?;
    Ok(())
}

fn checked_product(value: usize, factor: usize) -> Result<usize, EngineError> {
    value
        .checked_mul(factor)
        .ok_or_else(|| error("LIMIT", "Canonical size estimate overflow"))
}

fn add_u64(target: &mut u64, amount: usize) -> Result<(), EngineError> {
    let amount =
        u64::try_from(amount).map_err(|_| error("LIMIT", "Canonical work estimate overflow"))?;
    *target = target
        .checked_add(amount)
        .ok_or_else(|| error("LIMIT", "Canonical work estimate overflow"))?;
    Ok(())
}

fn preflight_string(
    text: &Utf16,
    cost: &mut Cost,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    // Worst-case JSON escaping is six ASCII bytes per input code unit.
    let escaped = checked_product(text.len(), 6)?
        .checked_add(2)
        .ok_or_else(|| error("LIMIT", "Canonical size estimate overflow"))?;
    add_usize(&mut cost.output_bytes, escaped)?;
    // Poll and validate before any input-derived output allocation.
    let units = text.units();
    let mut index = 0;
    let mut next_poll = 0;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            next_poll = index.saturating_add(POLL_UNITS);
        }
        match units[index] {
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
            {
                index += 2
            }
            0xd800..=0xdfff => {
                return Err(error(
                    "CANONICAL_INVALID_UNICODE",
                    "Unpaired UTF-16 surrogate cannot be emitted as canonical UTF-8",
                ))
            }
            _ => index += 1,
        }
    }
    Ok(())
}

fn preflight(
    value: &Value,
    depth: usize,
    cost: &mut Cost,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > MAX_DEPTH {
        return Err(error("LIMIT", "Canonical JSON nesting depth exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => add_usize(&mut cost.output_bytes, 4),
        Value::Bool(true) => add_usize(&mut cost.output_bytes, 4),
        Value::Bool(false) => add_usize(&mut cost.output_bytes, 5),
        Value::Number(n) => {
            if !n.is_finite() {
                return Err(error("NUMBER", "Nonfinite number cannot be canonicalized"));
            }
            add_usize(&mut cost.output_bytes, 32)
        }
        Value::String(text) => preflight_string(text, cost, ctx),
        Value::Array(items) => {
            let framing = items
                .len()
                .checked_add(2)
                .ok_or_else(|| error("LIMIT", "Canonical size estimate overflow"))?;
            add_usize(&mut cost.output_bytes, framing)?;
            for item in items {
                preflight(item, depth + 1, cost, ctx)?;
            }
            Ok(())
        }
        Value::Object(members) => {
            let framing = checked_product(members.len(), 2)?
                .checked_add(2)
                .ok_or_else(|| error("LIMIT", "Canonical size estimate overflow"))?;
            add_usize(&mut cost.output_bytes, framing)?;
            let sort_bytes = checked_product(
                checked_product(members.len(), 2)?,
                std::mem::size_of::<usize>(),
            )?;
            add_u64(&mut cost.temporary_bytes, sort_bytes)?;
            for (key, item) in members {
                preflight_string(key, cost, ctx)?;
                preflight(item, depth + 1, cost, ctx)?;
            }
            Ok(())
        }
    }
}

fn write_string(text: &Utf16, out: &mut Vec<u8>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    out.push(b'"');
    let units = text.units();
    let mut index = 0;
    let mut next_poll = 0;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            next_poll = index.saturating_add(POLL_UNITS);
        }
        let unit = units[index];
        if (0xd800..=0xdbff).contains(&unit) {
            let Some(low) = units
                .get(index + 1)
                .copied()
                .filter(|low| (0xdc00..=0xdfff).contains(low))
            else {
                return Err(error(
                    "CANONICAL_INVALID_UNICODE",
                    "Unpaired UTF-16 surrogate cannot be emitted as canonical UTF-8",
                ));
            };
            let scalar = 0x10000 + (((unit as u32 - 0xd800) << 10) | (low as u32 - 0xdc00));
            let ch = char::from_u32(scalar).expect("valid UTF-16 pair");
            let mut bytes = [0; 4];
            out.extend_from_slice(ch.encode_utf8(&mut bytes).as_bytes());
            index += 2;
            continue;
        }
        if (0xdc00..=0xdfff).contains(&unit) {
            return Err(error(
                "CANONICAL_INVALID_UNICODE",
                "Unpaired UTF-16 surrogate cannot be emitted as canonical UTF-8",
            ));
        }
        match unit {
            0x22 => out.extend_from_slice(b"\\\""),
            0x5c => out.extend_from_slice(b"\\\\"),
            0x08 => out.extend_from_slice(b"\\b"),
            0x09 => out.extend_from_slice(b"\\t"),
            0x0a => out.extend_from_slice(b"\\n"),
            0x0c => out.extend_from_slice(b"\\f"),
            0x0d => out.extend_from_slice(b"\\r"),
            0..=0x1f => {
                const HEX: &[u8; 16] = b"0123456789abcdef";
                out.extend_from_slice(b"\\u00");
                out.push(HEX[((unit >> 4) & 0xf) as usize]);
                out.push(HEX[(unit & 0xf) as usize]);
            }
            _ => {
                let ch = char::from_u32(unit as u32).expect("non-surrogate BMP unit");
                let mut bytes = [0; 4];
                out.extend_from_slice(ch.encode_utf8(&mut bytes).as_bytes());
            }
        }
        index += 1;
    }
    out.push(b'"');
    Ok(())
}

fn compare_key(a: &Utf16, b: &Utf16, ctx: &mut Context<'_>) -> Result<Ordering, EngineError> {
    for (index, (left, right)) in a.units().iter().zip(b.units()).enumerate() {
        if index % POLL_UNITS == 0 {
            ctx.charge_work(1, Utf16::default())?;
        }
        match left.cmp(right) {
            Ordering::Equal => {}
            order => return Ok(order),
        }
    }
    ctx.charge_work(1, Utf16::default())?;
    Ok(a.len().cmp(&b.len()))
}

/// Stable bottom-up merge sort makes comparison work cancellable. Both index
/// buffers are allocated only after the enclosing operation precharges them.
fn sorted_member_indices(
    members: &[(Utf16, Value)],
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    let mut order = (0..members.len()).collect::<Vec<_>>();
    let mut scratch = vec![0usize; members.len()];
    let mut width = 1usize;
    while width < order.len() {
        let mut start = 0usize;
        while start < order.len() {
            let middle = start.saturating_add(width).min(order.len());
            let end = middle.saturating_add(width).min(order.len());
            let (mut left, mut right, mut output) = (start, middle, start);
            while left < middle && right < end {
                let li = order[left];
                let ri = order[right];
                if compare_key(&members[li].0, &members[ri].0, ctx)? != Ordering::Greater {
                    scratch[output] = li;
                    left += 1;
                } else {
                    scratch[output] = ri;
                    right += 1;
                }
                output += 1;
            }
            while left < middle {
                scratch[output] = order[left];
                left += 1;
                output += 1;
            }
            while right < end {
                scratch[output] = order[right];
                right += 1;
                output += 1;
            }
            start = end;
        }
        order.copy_from_slice(&scratch);
        width = width.saturating_mul(2);
    }
    Ok(order)
}

fn emit(value: &Value, out: &mut Vec<u8>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => out.extend_from_slice(b"null"),
        Value::Bool(true) => out.extend_from_slice(b"true"),
        Value::Bool(false) => out.extend_from_slice(b"false"),
        Value::Number(number) => {
            let text = if *number == 0.0 {
                "0".to_owned()
            } else {
                umf_core::ecma_number_to_string(*number)
            };
            out.extend_from_slice(text.as_bytes());
        }
        Value::String(text) => write_string(text, out, ctx)?,
        Value::Array(items) => {
            out.push(b'[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(b',');
                }
                emit(item, out, ctx)?;
            }
            out.push(b']');
        }
        Value::Object(members) => {
            let ordered = sorted_member_indices(members, ctx)?;
            for pair in ordered.windows(2) {
                if members[pair[0]].0 == members[pair[1]].0 {
                    return Err(error(
                        "DUPLICATE_KEY",
                        "Duplicate object key in canonical JSON",
                    ));
                }
            }
            out.push(b'{');
            for (index, member) in ordered.iter().enumerate() {
                if index > 0 {
                    out.push(b',');
                }
                let (key, item) = &members[*member];
                write_string(key, out, ctx)?;
                out.push(b':');
                emit(item, out, ctx)?;
            }
            out.push(b'}');
        }
    }
    Ok(())
}

/// Canonicalize a raw value after core admission and copy. The private
/// `*_admitted` variant is for operation paths that have already copied input.
pub fn canonical_json(value: &Value, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    let admitted = umf_core::copy_json(value, ctx)?;
    canonical_json_admitted(&admitted, ctx)
}

pub(crate) fn canonical_json_admitted(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let mut cost = Cost::default();
    preflight(value, 0, &mut cost, ctx)?;
    let output_capacity = cost.output_bytes;
    let reservation = u64::try_from(output_capacity)
        .ok()
        .and_then(|bytes| bytes.checked_add(cost.temporary_bytes))
        .ok_or_else(|| error("LIMIT", "Canonical reservation overflow"))?;
    ctx.charge_work_u64(reservation, Utf16::default())?;
    let mut output = Vec::with_capacity(output_capacity);
    emit(value, &mut output, ctx)?;
    Ok(output)
}

/// SHA-256 of a raw value's canonical representation after core admission.
pub fn canonical_sha256(value: &Value, ctx: &mut Context<'_>) -> Result<[u8; 32], EngineError> {
    let admitted = umf_core::copy_json(value, ctx)?;
    canonical_sha256_admitted(&admitted, ctx)
}

/// SHA-256 of an admitted value's canonical representation. Hash input is
/// polled in bounded chunks after canonical output has been constructed.
pub(crate) fn canonical_sha256_admitted(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<[u8; 32], EngineError> {
    let canonical = canonical_json_admitted(value, ctx)?;
    let mut hasher = Sha256::new();
    for chunk in canonical.chunks(4096) {
        ctx.charge_work(chunk.len(), Utf16::default())?;
        hasher.update(chunk);
    }
    Ok(hasher.finalize().into())
}

/// Hash source text as UTF-8 without a second whole-source allocation. Input
/// Unicode is checked before hashing, matching the retained TypeScript digest.
pub fn sha256_source_text(source: &Utf16, ctx: &mut Context<'_>) -> Result<[u8; 32], EngineError> {
    let units = source.units();
    let mut index = 0;
    let mut next_poll = 0;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            next_poll = index.saturating_add(POLL_UNITS);
        }
        match units[index] {
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
            {
                index += 2
            }
            0xd800..=0xdfff => {
                return Err(error(
                    "INPUT",
                    "Source contains an unpaired UTF-16 surrogate",
                ))
            }
            _ => index += 1,
        }
    }
    let mut hasher = Sha256::new();
    index = 0;
    next_poll = 0;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            next_poll = index.saturating_add(POLL_UNITS);
        }
        let unit = units[index];
        let (scalar, step) = if (0xd800..=0xdbff).contains(&unit) {
            let low = units[index + 1];
            (
                0x10000 + (((unit as u32 - 0xd800) << 10) | (low as u32 - 0xdc00)),
                2,
            )
        } else {
            (unit as u32, 1)
        };
        let ch = char::from_u32(scalar).expect("source preflight confirmed Unicode scalar");
        let mut buffer = [0; 4];
        hasher.update(ch.encode_utf8(&mut buffer).as_bytes());
        index += step;
    }
    Ok(hasher.finalize().into())
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_json, canonical_json_admitted, canonical_sha256_admitted, preflight_string,
        sha256_source_text, write_string, Cost,
    };
    use sha2::{Digest, Sha256};
    use umf_core::{Context, EngineError, Utf16, Value};

    #[test]
    fn sorts_utf16_keys_and_normalizes_negative_zero() {
        let value = Value::Object(vec![
            (Utf16::from("b"), Value::Number(-0.0)),
            (Utf16::from("a"), Value::String(Utf16::from("x\n"))),
        ]);
        assert_eq!(
            canonical_json_admitted(&value, &mut Context::ordinary()).unwrap(),
            br#"{"a":"x\n","b":0}"#
        );
    }

    #[test]
    fn refuses_lone_surrogates_and_duplicate_members_and_nonfinite_numbers() {
        assert_eq!(
            canonical_json_admitted(
                &Value::String(Utf16::new(vec![0xd800])),
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "CANONICAL_INVALID_UNICODE"
        );
        let duplicate = Value::Object(vec![
            (Utf16::from("x"), Value::Null),
            (Utf16::from("x"), Value::Bool(true)),
        ]);
        assert_eq!(
            canonical_json_admitted(&duplicate, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "DUPLICATE_KEY"
        );
        assert_eq!(
            canonical_json_admitted(&Value::Number(f64::NAN), &mut Context::ordinary())
                .unwrap_err()
                .code,
            "NUMBER"
        );
    }

    #[test]
    fn hash_is_stable_for_differently_ordered_objects() {
        let left = Value::Object(vec![
            (Utf16::from("a"), Value::Number(1.0)),
            (Utf16::from("b"), Value::Bool(true)),
        ]);
        let right = Value::Object(vec![
            (Utf16::from("b"), Value::Bool(true)),
            (Utf16::from("a"), Value::Number(1.0)),
        ]);
        assert_eq!(
            canonical_sha256_admitted(&left, &mut Context::ordinary()).unwrap(),
            canonical_sha256_admitted(&right, &mut Context::ordinary()).unwrap()
        );
    }

    #[test]
    fn cancellation_is_polled_during_preflight_before_output_allocation() {
        let value = Value::Array((0..10_000).map(|_| Value::Null).collect());
        let mut polls = 0usize;
        let mut cancellation = || {
            polls += 1;
            polls > 32
        };
        let mut ctx = Context::ordinary().with_cancellation(&mut cancellation);
        assert_eq!(
            canonical_json_admitted(&value, &mut ctx).unwrap_err().code,
            "CANCELLED"
        );
        assert!(polls > 32);
    }

    #[test]
    fn source_digest_hashes_utf8_and_rejects_lone_surrogates() {
        assert_eq!(
            sha256_source_text(&Utf16::from("abc"), &mut Context::ordinary()).unwrap(),
            Sha256::digest(b"abc").as_slice(),
        );
        assert_eq!(
            sha256_source_text(&Utf16::new(vec![0xd800]), &mut Context::ordinary())
                .unwrap_err()
                .code,
            "INPUT"
        );
    }

    #[test]
    fn odd_ascii_prefix_then_astral_text_polls_in_all_utf16_loops() {
        let mut units = vec![b'a' as u16];
        for _ in 0..4096 {
            units.extend_from_slice(&[0xd83d, 0xde00]);
        }
        let text = Utf16::new(units);

        let mut preflight_polls = 0usize;
        let mut cancel_preflight = || {
            preflight_polls += 1;
            preflight_polls > 1
        };
        let mut preflight_ctx = Context::ordinary().with_cancellation(&mut cancel_preflight);
        assert_eq!(
            preflight_string(&text, &mut Cost::default(), &mut preflight_ctx)
                .unwrap_err()
                .code,
            "CANCELLED"
        );
        assert!(preflight_polls > 1);

        let mut emit_polls = 0usize;
        let mut cancel_emit = || {
            emit_polls += 1;
            emit_polls > 1
        };
        let mut emit_ctx = Context::ordinary().with_cancellation(&mut cancel_emit);
        assert_eq!(
            write_string(&text, &mut Vec::new(), &mut emit_ctx)
                .unwrap_err()
                .code,
            "CANCELLED"
        );
        assert!(emit_polls > 1);

        // Eight polls cover the Unicode preflight pass; cancellation after
        // the ninth proves the second (hash emission) pass also advances over
        // surrogate pairs rather than waiting for an impossible modulo index.
        let mut hash_polls = 0usize;
        let mut cancel_hash = || {
            hash_polls += 1;
            hash_polls > 9
        };
        let mut hash_ctx = Context::ordinary().with_cancellation(&mut cancel_hash);
        assert_eq!(
            sha256_source_text(&text, &mut hash_ctx).unwrap_err().code,
            "CANCELLED"
        );
        assert!(hash_polls > 9);
    }

    #[test]
    fn odd_prefix_astral_text_meter_refusal_occurs_before_full_scan() {
        let mut units = vec![b'a' as u16];
        for _ in 0..4096 {
            units.extend_from_slice(&[0xd83d, 0xde00]);
        }
        let text = Utf16::new(units);
        let mut charged = 0usize;
        let mut meter = |amount: usize| {
            charged += amount;
            if charged > 2 {
                Err(EngineError::new("METER", Utf16::default(), "test limit"))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert_eq!(
            preflight_string(&text, &mut Cost::default(), &mut ctx)
                .unwrap_err()
                .code,
            "METER"
        );
        assert!(charged <= 3);
    }

    #[test]
    fn public_canonical_api_admits_duplicate_nonfinite_and_unicode_inputs() {
        let duplicate = Value::Object(vec![
            (Utf16::from("x"), Value::Null),
            (Utf16::from("x"), Value::Bool(true)),
        ]);
        assert_eq!(
            canonical_json(&duplicate, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "DUPLICATE_KEY"
        );
        assert_eq!(
            canonical_json(&Value::Number(f64::NAN), &mut Context::ordinary())
                .unwrap_err()
                .code,
            "NUMBER"
        );
        assert_eq!(
            canonical_json(
                &Value::String(Utf16::new(vec![0xd800])),
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "CANONICAL_INVALID_UNICODE"
        );
    }

    #[test]
    fn public_canonical_api_enforces_context_depth_and_precharges_output_capacity() {
        let mut deep = Value::Null;
        for _ in 0..130 {
            deep = Value::Array(vec![deep]);
        }
        assert_eq!(
            canonical_json(&deep, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "LIMIT"
        );

        let input = Value::String(Utf16::new(vec![b'x' as u16; 100_000]));
        let mut saw_output_reservation = false;
        let mut meter = |amount: usize| {
            if amount > 500_000 {
                saw_output_reservation = true;
                Err(EngineError::new(
                    "PRECHARGE_STOP",
                    Utf16::default(),
                    "stopped before output allocation",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert_eq!(
            canonical_json(&input, &mut ctx).unwrap_err().code,
            "PRECHARGE_STOP"
        );
        assert!(saw_output_reservation);
    }
}
