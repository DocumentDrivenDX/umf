// SPDX-License-Identifier: MIT OR Apache-2.0
//! Small helpers over UMF's lossless core value representation.

use umf_core::{Context, EngineError, Utf16, Value};

/// Admit and copy a raw operation argument using the core carrier's duplicate,
/// numeric, depth, value-count, and cooperative work checks.
pub fn admit_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    umf_core::copy_json(value, ctx)
}

/// Parse source text into an admitted core value. This is syntax parsing only;
/// semantic document validation is provided by [`crate::CodegenEngine`].
pub fn read_source_value(
    source: &Utf16,
    format: umf_core::serialization::Format,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    umf_core::serialization::read_json_value(source.units(), format, ctx)
}

pub fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(members) = value else {
        return None;
    };
    members
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

pub fn string_member<'a>(value: &'a Value, name: &str) -> Option<&'a Utf16> {
    match member(value, name)? {
        Value::String(value) => Some(value),
        _ => None,
    }
}

pub fn object_members(value: &Value) -> Option<&[(Utf16, Value)]> {
    match value {
        Value::Object(members) => Some(members),
        _ => None,
    }
}

pub fn array_items(value: &Value) -> Option<&[Value]> {
    match value {
        Value::Array(items) => Some(items),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::admit_json;
    use umf_core::{Context, Utf16, Value};

    #[test]
    fn raw_value_admission_does_not_apply_the_source_text_ceiling() {
        // Raw bundle/output values are not source documents. The source parser
        // has its own byte limit; this boundary charges cooperative work and
        // validates the JSON tree without rejecting a large individual string.
        let text = Utf16::from("x".repeat(4_000_001));
        let value = Value::String(text.clone());
        assert_eq!(admit_json(&value, &mut Context::ordinary()).unwrap(), value);
    }
}

/// JavaScript's own enumerable string-key order: canonical array indices first
/// in numeric order, then other keys in original insertion order. This is a
/// compiler interpretation helper; the lossless carrier retains original order.
pub(crate) fn js_object_members<'a>(
    value: &'a Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<&'a (Utf16, Value)>, EngineError> {
    let fields = object_members(value).unwrap_or(&[]);
    ctx.charge_work(fields.len().saturating_mul(64), Utf16::default())?;
    let mut numeric = std::collections::BTreeMap::new();
    let mut other = Vec::with_capacity(fields.len());
    for field in fields {
        ctx.charge_work(1, Utf16::default())?;
        let units = field.0.units();
        let mut number = 0u64;
        let mut is_index =
            !units.is_empty() && units.len() <= 10 && (units.len() == 1 || units[0] != 48);
        if is_index {
            for unit in units {
                if !(48..=57).contains(unit) {
                    is_index = false;
                    break;
                }
                number = number * 10 + u64::from(unit - 48);
            }
        }
        if is_index && number < u64::from(u32::MAX) {
            numeric.insert(number, field);
        } else {
            other.push(field);
        }
    }
    let mut result = Vec::with_capacity(fields.len());
    for (_, field) in numeric {
        ctx.charge_work(1, Utf16::default())?;
        result.push(field);
    }
    result.extend(other);
    Ok(result)
}

/// Recover the retained JavaScript copy walk's first depth/value refusal path.
/// The core copy kernel may reserve a complete array at its parent. R3 keeps
/// that kernel and projects only its refusal pointer in source traversal order.
/// Frames borrow the tree; one mutable pointer and a depth-bounded stack avoid
/// materializing or recursively dropping a second document.
pub(crate) fn source_limit_path(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Utf16>, EngineError> {
    enum Children<'a> {
        Array(&'a [Value]),
        Object(Vec<&'a (Utf16, Value)>),
    }
    impl Children<'_> {
        fn len(&self) -> usize {
            match self {
                Self::Array(v) => v.len(),
                Self::Object(v) => v.len(),
            }
        }
    }
    struct Frame<'a> {
        children: Children<'a>,
        next: usize,
        depth: usize,
        path_len: usize,
    }
    fn children<'a>(
        v: &'a Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Children<'a>>, EngineError> {
        Ok(match v {
            Value::Array(v) if !v.is_empty() => Some(Children::Array(v)),
            Value::Object(fields) if !fields.is_empty() => {
                Some(Children::Object(js_object_members(v, ctx)?))
            }
            _ => None,
        })
    }
    fn child<'a>(
        children: &Children<'a>,
        index: usize,
        path: &mut Vec<u16>,
        ctx: &mut Context<'_>,
    ) -> Result<&'a Value, EngineError> {
        let index_key;
        let (key, child) = match children {
            Children::Array(v) => {
                index_key = Utf16::from(index.to_string());
                (&index_key, &v[index])
            }
            Children::Object(v) => {
                let (key, child) = v[index];
                (key, child)
            }
        };
        ctx.charge_work(
            key.len().saturating_mul(2).saturating_add(1),
            Utf16::default(),
        )?;
        path.push(47);
        for (index, u) in key.units().iter().enumerate() {
            if index % 1024 == 0 {
                ctx.charge_work(1, Utf16::default())?;
            }
            match u {
                126 => path.extend([126, 48]),
                47 => path.extend([126, 49]),
                u => path.push(*u),
            }
        }
        Ok(child)
    }
    let limits = ctx.limits();
    let mut values = 0usize;
    let mut path = Vec::new();
    let mut frames: Vec<Frame<'_>> = Vec::new();
    let mut current = value;
    let mut depth = 0usize;
    loop {
        ctx.charge_work(1, Utf16::default())?;
        values = values.saturating_add(1);
        if values > limits.max_values || depth > limits.max_depth {
            return Ok(Some(Utf16::new(path)));
        }
        if let Some(children) = children(current, ctx)? {
            ctx.charge_work(1, Utf16::default())?;
            let path_len = path.len();
            let next = child(&children, 0, &mut path, ctx)?;
            frames.push(Frame {
                children,
                next: 1,
                depth,
                path_len,
            });
            current = next;
            depth += 1;
            continue;
        }
        loop {
            let Some(mut frame) = frames.pop() else {
                return Ok(None);
            };
            path.truncate(frame.path_len);
            if frame.next < frame.children.len() {
                current = child(&frame.children, frame.next, &mut path, ctx)?;
                depth = frame.depth + 1;
                frame.next += 1;
                frames.push(frame);
                break;
            }
        }
    }
}

#[cfg(test)]
mod refusal_path_tests {
    use super::*;
    #[test]
    fn source_value_limit_path_uses_js_keys_and_exact_array_item() {
        let value = Value::Object(vec![
            (Utf16::from("2"), Value::Array(vec![Value::Null])),
            (Utf16::from("1"), Value::Array(vec![Value::Null])),
        ]);
        let mut ctx = Context::with_limits(
            umf_core::ResourceProfile::Cooperative,
            umf_core::Limits {
                max_values: 4,
                ..umf_core::Limits::ordinary()
            },
        )
        .unwrap();
        assert_eq!(
            source_limit_path(&value, &mut ctx).unwrap(),
            Some(Utf16::from("/2/0"))
        );
    }
}
