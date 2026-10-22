// SPDX-License-Identifier: MIT OR Apache-2.0
//! Literal-only Python access target. This module has no host I/O and emits
//! imports from the reviewed runtime allow-list only.

use crate::value::string_member;
use umf_core::{Context, EngineError, Utf16, Value};

fn member<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    crate::value::member(v, key)
}
fn text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn get_metered(v: &Value, key: &str, ctx: &mut Context<'_>) -> Result<Option<String>, EngineError> {
    if let Some(value) = member(v, key) {
        if let Value::String(text) = value {
            ctx.charge_work(text.units().len(), Utf16::default())?;
        }
        Ok(text(value))
    } else {
        Ok(None)
    }
}
fn charge_string_copy(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if let Value::String(text) = value {
        ctx.charge_work(text.units().len(), Utf16::default())?;
    }
    Ok(())
}
fn clone_metered(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    charge_string_copy(value, ctx)?;
    Ok(value.clone())
}
fn arr(v: &Value) -> &[Value] {
    crate::value::array_items(v).unwrap_or(&[])
}
fn quote(s: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(s.len(), Utf16::default())?;
    crate::generation::python::string_literal(&Utf16::from(s), ctx)
}
fn source_comment(ir: &Value, item: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let source_id = get_metered(ir, "sourceId", ctx)?.unwrap_or_default();
    let pointer = get_metered(item, "pointer", ctx)?.unwrap_or_default();
    ctx.charge_work(
        source_id
            .len()
            .saturating_add(pointer.len())
            .saturating_add(14),
        Utf16::default(),
    )?;
    quote(&format!("UMF source {source_id}#{pointer}"), ctx)
}
fn py(v: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    crate::generation::python::value_literal(v, ctx)
}
fn compact_json(v: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    // The compact serializer meters strings and collection loops, preserving
    // insertion order and exact UTF-16 units before conversion to escaped text.
    let encoded = umf_core::serialization::stringify_compact_metered(v, ctx)?;
    encoded.to_utf8().map_err(|_| {
        EngineError::new(
            "INPUT",
            Utf16::default(),
            "Invalid JSON metadata scalar text",
        )
    })
}
fn precharge_tree(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::String(text) => ctx.charge_work(
            text.units()
                .len()
                .checked_mul(6)
                .and_then(|n| n.checked_add(1))
                .ok_or_else(|| {
                    EngineError::new("LIMIT", Utf16::default(), "Python emission work overflow")
                })?,
            Utf16::default(),
        )?,
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items {
                precharge_tree(item, ctx)?;
            }
        }
        Value::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for (key, item) in items {
                ctx.charge_work(
                    key.units()
                        .len()
                        .checked_mul(6)
                        .and_then(|n| n.checked_add(1))
                        .ok_or_else(|| {
                            EngineError::new(
                                "LIMIT",
                                Utf16::default(),
                                "Python emission work overflow",
                            )
                        })?,
                    Utf16::default(),
                )?;
                precharge_tree(item, ctx)?;
            }
        }
        _ => ctx.charge_work(1, Utf16::default())?,
    }
    Ok(())
}
fn scan_find<'a, T: std::borrow::Borrow<Value>>(
    values: &'a [T],
    ctx: &mut Context<'_>,
    predicate: impl Fn(&Value) -> bool,
) -> Result<Option<&'a Value>, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    for item in values {
        ctx.charge_work(1, Utf16::default())?;
        let value = item.borrow();
        if predicate(value) {
            return Ok(Some(value));
        }
    }
    Ok(None)
}
fn scan_filter<'a, T: std::borrow::Borrow<Value>>(
    values: &'a [T],
    ctx: &mut Context<'_>,
    mut predicate: impl FnMut(&Value) -> bool,
) -> Result<Vec<&'a Value>, EngineError> {
    let mut found = Vec::new();
    for item in values {
        ctx.charge_work(1, Utf16::default())?;
        let value = item.borrow();
        if predicate(value) {
            ctx.charge_work(std::mem::size_of::<&Value>(), Utf16::default())?;
            found.push(value);
        }
    }
    Ok(found)
}
fn scan_any(
    values: &[Value],
    ctx: &mut Context<'_>,
    mut predicate: impl FnMut(&Value) -> bool,
) -> Result<bool, EngineError> {
    for value in values {
        ctx.charge_work(1, Utf16::default())?;
        if predicate(value) {
            return Ok(true);
        }
    }
    Ok(false)
}
fn ref_eq(a: &Value, b: &Value) -> bool {
    member(a, "module") == member(b, "module") && member(a, "element") == member(b, "element")
}
fn text_is(v: &Value, key: &str, expected: &str) -> bool {
    matches!(member(v, key), Some(Value::String(text)) if text.units().iter().copied().eq(expected.encode_utf16()))
}
fn snake(s: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(s.len(), Utf16::default())?;
    let mut o = String::new();
    let cs = s.chars().collect::<Vec<_>>();
    for (i, c) in cs.iter().enumerate() {
        if c.is_ascii_uppercase()
            && i > 0
            && (cs[i - 1].is_ascii_lowercase() || cs[i - 1].is_ascii_digit())
        {
            o.push('_')
        }
        o.push(c.to_ascii_lowercase())
    }
    Ok(o)
}
fn class_name(value: &str) -> String {
    super::diff_class_name(value)
}
fn scalar(f: &Value) -> &'static str {
    if member(f, "vectorDimensions").is_some() {
        "Vector"
    } else {
        if text_is(f, "scalarType", "boolean") {
            "bool"
        } else if text_is(f, "scalarType", "integer") {
            "int"
        } else if text_is(f, "scalarType", "decimal") {
            "Decimal"
        } else if text_is(f, "scalarType", "float") {
            "float"
        } else if text_is(f, "scalarType", "string") {
            "str"
        } else if text_is(f, "scalarType", "binary") {
            "bytes"
        } else if text_is(f, "scalarType", "date") {
            "date"
        } else if text_is(f, "scalarType", "timestamp") {
            "datetime"
        } else {
            "object"
        }
    }
}
fn field_carrier<'a>(
    field: &'a Value,
    fields: &'a [Value],
    mode: &str,
    validated: bool,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut current = field;
    let mut chain = Vec::new();
    let mut active = std::collections::BTreeSet::new();
    let mut result = loop {
        ctx.charge_work(1, Utf16::default())?;
        if member(current, "vectorDimensions").is_some() || member(current, "item").is_none() {
            break scalar(current).to_owned();
        }
        if let Some(marker) = string_member(current, "pointer") {
            ctx.charge_work(marker.units().len(), Utf16::default())?;
        }
        let marker = string_member(current, "pointer")
            .cloned()
            .unwrap_or_default();
        if !active.insert(marker) {
            break "object".to_owned();
        }
        let reference = member(current, "item").unwrap_or(&Value::Null);
        let mut found = None;
        for candidate in fields {
            ctx.charge_work(1, Utf16::default())?;
            if ref_eq(member(candidate, "ref").unwrap_or(&Value::Null), reference) {
                found = Some(candidate);
                break;
            }
        }
        let Some(child) = found else {
            break "object".to_owned();
        };
        chain.push((current, child));
        current = child;
    };
    while let Some((parent, child)) = chain.pop() {
        let validator_name = if validated {
            validator(child, mode, ctx)?
        } else {
            String::new()
        };
        let estimate = result
            .len()
            .saturating_add(validator_name.len())
            .saturating_add(128)
            .saturating_mul(2);
        ctx.charge_work(estimate, Utf16::default())?;
        if estimate > 33_554_432 {
            return Err(EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Generated source size limit exceeded",
            ));
        }
        if validated {
            result = format!("Annotated[{result}, BeforeValidator({validator_name})]");
        }
        if member(
            member(child, if mode == "create" { "create" } else { "row" }).unwrap_or(&Value::Null),
            "null",
        ) == Some(&Value::Bool(true))
        {
            result.push_str(" | None");
        }
        result = if text_is(parent, "cardinality", "array") {
            format!("list[{result}] | tuple[{result}, ...]")
        } else if text_is(parent, "cardinality", "map") {
            format!(
                "dict[{}, {result}]",
                if validated {
                    "Annotated[str, BeforeValidator(validate_string)]"
                } else {
                    "str"
                }
            )
        } else {
            scalar(parent).into()
        };
    }
    Ok(result)
}
fn validator(f: &Value, mode: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let mut name = format!(
        "validate_field_{}",
        get_metered(f, "viewPointer", ctx)?
            .or(get_metered(f, "pointer", ctx)?)
            .unwrap_or_default()
            .replace(|c: char| !c.is_ascii_alphanumeric(), "_")
    );
    if matches!(
        get_metered(f, "cardinality", ctx)?.as_deref(),
        Some("array" | "map")
    ) {
        name.push('_');
        name.push_str(mode);
    }
    Ok(name)
}
fn key_name(record: &Value, key: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let record_name = get_metered(record, "python", ctx)?.unwrap_or_default();
    let keys = arr(member(record, "keys").unwrap_or(&Value::Null));
    if keys
        .first()
        .is_some_and(|first| member(first, "id") == member(key, "id"))
    {
        return Ok(format!("{record_name}Key"));
    }
    let id = member(key, "id");
    if let Some(Value::String(id)) = id {
        ctx.charge_work(id.units().len(), Utf16::default())?;
    }
    let normalized = match id {
        Some(Value::String(id)) => id
            .units()
            .iter()
            .map(|unit| {
                if (*unit >= u16::from(b'A') && *unit <= u16::from(b'Z'))
                    || (*unit >= u16::from(b'a') && *unit <= u16::from(b'z'))
                    || (*unit >= u16::from(b'0') && *unit <= u16::from(b'9'))
                {
                    char::from_u32(u32::from(*unit)).unwrap_or('_')
                } else {
                    '_'
                }
            })
            .collect::<String>(),
        _ => String::new(),
    };
    Ok(format!("{record_name}{}Key", class_name(&normalized)))
}
fn pointer_segment_number(segment: &[u16]) -> Option<u64> {
    if segment.is_empty() {
        return None;
    }
    let mut number = 0u64;
    for unit in segment {
        if !(u16::from(b'0')..=u16::from(b'9')).contains(unit) {
            return None;
        }
        number = number
            .checked_mul(10)?
            .checked_add(u64::from(*unit - u16::from(b'0')))?;
    }
    Some(number)
}
fn pointer_order(a: &[u16], b: &[u16]) -> std::cmp::Ordering {
    let mut aa = a.split(|unit| *unit == u16::from(b'/')).skip(1);
    let mut bb = b.split(|unit| *unit == u16::from(b'/')).skip(1);
    loop {
        match (aa.next(), bb.next()) {
            (Some(x), Some(y)) if x == y => continue,
            (Some(x), Some(y)) => {
                let ordering = match (pointer_segment_number(x), pointer_segment_number(y)) {
                    (Some(x), Some(y)) => x.cmp(&y),
                    _ => x.cmp(y),
                };
                if ordering != std::cmp::Ordering::Equal {
                    return ordering;
                }
            }
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
        }
    }
}
fn symbol_cmp(
    a: &Value,
    b: &Value,
    ctx: &mut Context<'_>,
) -> Result<std::cmp::Ordering, EngineError> {
    let a_pointer = string_member(a, "pointer")
        .map(|value| value.units())
        .unwrap_or(&[]);
    let b_pointer = string_member(b, "pointer")
        .map(|value| value.units())
        .unwrap_or(&[]);
    let a_role = string_member(a, "role")
        .map(|value| value.units())
        .unwrap_or(&[]);
    let b_role = string_member(b, "role")
        .map(|value| value.units())
        .unwrap_or(&[]);
    let a_symbol = string_member(a, "symbol")
        .map(|value| value.units())
        .unwrap_or(&[]);
    let b_symbol = string_member(b, "symbol")
        .map(|value| value.units())
        .unwrap_or(&[]);
    let charge = a_pointer
        .len()
        .saturating_add(b_pointer.len())
        .saturating_add(a_role.len())
        .saturating_add(b_role.len())
        .saturating_add(a_symbol.len())
        .saturating_add(b_symbol.len())
        .saturating_add(1);
    ctx.charge_work(charge, Utf16::default())?;
    Ok(pointer_order(a_pointer, b_pointer)
        .then_with(|| a_role.cmp(b_role))
        .then_with(|| a_symbol.cmp(b_symbol)))
}
fn sort_symbols(symbols: &mut [Value], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    // Stable bottom-up mergesort over indices keeps comparison fallible and
    // avoids allocating String sort keys. The allocation bound is charged
    // before either index buffer is grown.
    let len = symbols.len();
    ctx.charge_work(len.saturating_mul(3), Utf16::default())?;
    let mut order = (0..len).collect::<Vec<_>>();
    let mut temporary = vec![0usize; len];
    let mut width = 1usize;
    while width < len {
        let mut start = 0usize;
        while start < len {
            let middle = start.saturating_add(width).min(len);
            let end = middle.saturating_add(width).min(len);
            let (mut left, mut right, mut output) = (start, middle, start);
            while left < middle && right < end {
                ctx.charge_work(1, Utf16::default())?;
                if symbol_cmp(&symbols[order[left]], &symbols[order[right]], ctx)?
                    != std::cmp::Ordering::Greater
                {
                    temporary[output] = order[left];
                    left += 1;
                } else {
                    temporary[output] = order[right];
                    right += 1;
                }
                output += 1;
            }
            while left < middle {
                ctx.charge_work(1, Utf16::default())?;
                temporary[output] = order[left];
                left += 1;
                output += 1;
            }
            while right < end {
                ctx.charge_work(1, Utf16::default())?;
                temporary[output] = order[right];
                right += 1;
                output += 1;
            }
            start = end;
        }
        std::mem::swap(&mut order, &mut temporary);
        width = width.saturating_mul(2);
        if width == usize::MAX {
            break;
        }
    }
    // Apply the sorted permutation in-place without cloning the Values.
    let mut destination = vec![0usize; len];
    for (target, source) in order.into_iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        destination[source] = target;
    }
    for index in 0..len {
        while destination[index] != index {
            ctx.charge_work(1, Utf16::default())?;
            let target = destination[index];
            symbols.swap(index, target);
            destination.swap(index, target);
        }
    }
    Ok(())
}
fn ordered_fields<'a>(
    fields: &'a [Value],
    emitted: &mut std::collections::BTreeSet<String>,
    ctx: &mut Context<'_>,
) -> Result<Vec<&'a Value>, EngineError> {
    ctx.charge_work(fields.len(), Utf16::default())?;
    let mut out = Vec::with_capacity(fields.len());
    let mut active = std::collections::BTreeSet::new();
    for root in fields {
        let mut pending = vec![(root, false)];
        while let Some((field, exit)) = pending.pop() {
            ctx.charge_work(1, Utf16::default())?;
            let name = validator(field, "row", ctx)?;
            if exit {
                active.remove(&name);
                emitted.insert(name);
                out.push(field);
                continue;
            }
            if emitted.contains(&name) {
                continue;
            }
            if !active.insert(name.clone()) {
                return Err(EngineError::new(
                    "INPUT",
                    Utf16::default(),
                    "Unresolved recursive item carrier",
                ));
            }
            pending.push((field, true));
            if let Some(item) = member(field, "item") {
                for candidate in fields {
                    ctx.charge_work(1, Utf16::default())?;
                    if ref_eq(member(candidate, "ref").unwrap_or(&Value::Null), item) {
                        pending.push((candidate, false));
                        break;
                    }
                }
            }
        }
    }
    Ok(out)
}
fn core_literal(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if value == &Value::Null {
        return Ok("None".into());
    }
    for (name, constructor) in [
        ("integerToken", "int"),
        ("decimalToken", "Decimal"),
        ("binaryHex", "bytes.fromhex"),
    ] {
        if let Some(Value::String(v)) = member(value, name) {
            return Ok(format!(
                "{constructor}({})",
                crate::generation::python::string_literal(v, ctx)?
            ));
        }
    }
    if let Some(v @ Value::String(_)) = member(value, "string") {
        return py(v, ctx);
    }
    if let Some(v @ Value::Bool(_)) = member(value, "boolean") {
        return py(v, ctx);
    }
    Err(EngineError::new(
        "GENERATION_FAILED",
        Utf16::default(),
        "Unresolved literal cannot be emitted",
    ))
}
fn codec_field<'a>(
    field: &'a Value,
    record_fields: &'a [Value],
    all_fields: &[&'a Value],
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut chain = Vec::new();
    let mut current = field;
    let mut active = std::collections::BTreeSet::new();
    loop {
        ctx.charge_work(1, Utf16::default())?;
        if let Some(pointer) = string_member(current, "pointer") {
            ctx.charge_work(pointer.units().len(), Utf16::default())?;
        }
        let pointer = string_member(current, "pointer")
            .cloned()
            .unwrap_or_default();
        if !active.insert(pointer) {
            return Err(EngineError::new(
                "INPUT",
                Utf16::default(),
                "Unresolved recursive item carrier",
            ));
        }
        chain.push(current);
        let Some(reference) = member(current, "item") else {
            break;
        };
        let mut found = None;
        for candidate in record_fields.iter().chain(all_fields.iter().copied()) {
            ctx.charge_work(1, Utf16::default())?;
            if ref_eq(member(candidate, "ref").unwrap_or(&Value::Null), reference) {
                found = Some(candidate);
                break;
            }
        }
        current = found
            .ok_or_else(|| EngineError::new("INPUT", Utf16::default(), "Missing item carrier"))?;
    }
    let mut item = String::from("None");
    while let Some(field) = chain.pop() {
        let kind = if member(field, "vectorDimensions").is_some() {
            "identity".into()
        } else if member(field, "item").is_some() {
            get_metered(field, "cardinality", ctx)?.unwrap_or_default()
        } else if text_is(field, "scalarType", "timestamp") && text_is(field, "temporal", "instant")
        {
            "instant".into()
        } else {
            "identity".into()
        };
        let name = py(member(field, "python").unwrap_or(&Value::Null), ctx)?;
        let id = py(
            member(member(field, "ref").unwrap_or(&Value::Null), "element").unwrap_or(&Value::Null),
            ctx,
        )?;
        let kind = quote(&kind, ctx)?;
        ctx.charge_work(
            item.len()
                .saturating_add(name.len())
                .saturating_add(id.len())
                .saturating_add(kind.len())
                .saturating_add(64),
            Utf16::default(),
        )?;
        item =
            format!("{{\"python\": {name}, \"field\": {id}, \"kind\": {kind}, \"item\": {item}}}");
    }
    Ok(item)
}
fn selected_root(
    record: &Value,
    key_id: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let keys = arr(member(record, "keys").unwrap_or(&Value::Null));
    let key = if let Some(id) = key_id {
        scan_find(keys, ctx, |key| member(key, "id") == Some(id))?
    } else {
        keys.first()
    };
    let reference = member(record, "ref").unwrap_or(&Value::Null);
    let fields = key
        .map(|key| arr(member(key, "fields").unwrap_or(&Value::Null)))
        .unwrap_or(&[]);
    let mut rendered = Vec::new();
    for field in fields {
        ctx.charge_work(1, Utf16::default())?;
        let resolved = scan_find(
            arr(member(record, "fields").unwrap_or(&Value::Null)),
            ctx,
            |candidate| ref_eq(member(candidate, "ref").unwrap_or(&Value::Null), field),
        )?;
        rendered.push(format!("FieldRef(source=UMF_GENERATED_SOURCE, module={}, element={}, field={}, field_module={}, logical_name={})",py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(field,"element").unwrap_or(&Value::Null),ctx)?,py(member(field,"module").unwrap_or(&Value::Null),ctx)?,py(resolved.and_then(|f|member(f,"logicalName")).unwrap_or(&Value::Null),ctx)?));
    }
    Ok(format!("RecordRef(source=UMF_GENERATED_SOURCE, key_id={}, module={}, element={}, logical_namespace={}, logical_name={}, key=({}{comma}))",py(key.and_then(|key|member(key,"id")).unwrap_or(&Value::Null),ctx)?,py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(record,"namespace").unwrap_or(&Value::Null),ctx)?,py(member(record,"logicalName").unwrap_or(&Value::Null),ctx)?,rendered.join_metered(", ",ctx)?,comma=if fields.is_empty(){""}else{","}))
}
trait MeteredJoin {
    fn join_metered(&self, separator: &str, ctx: &mut Context<'_>) -> Result<String, EngineError>;
}
impl MeteredJoin for [String] {
    fn join_metered(&self, separator: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
        let mut out = String::new();
        ctx.charge_work(self.len(), Utf16::default())?;
        for (index, text) in self.iter().enumerate() {
            if index > 0 {
                crate::generation::python::append_text(&mut out, separator, ctx)?;
            }
            crate::generation::python::append_text(&mut out, text, ctx)?;
        }
        Ok(out)
    }
}
fn render_lines(
    lines: &[String],
    trim_end: bool,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let end = if trim_end {
        let mut last_nonempty = None;
        for (index, line) in lines.iter().enumerate().rev() {
            ctx.charge_work(1, Utf16::from(path))?;
            if !line.trim_end().is_empty() {
                last_nonempty = Some(index);
                break;
            }
        }
        last_nonempty.map_or(0, |i| i + 1)
    } else {
        lines.len()
    };
    let mut units = 1usize;
    for (index, line) in lines[..end].iter().enumerate() {
        ctx.charge_work(1, Utf16::from(path))?;
        let text = if trim_end && index + 1 == end {
            line.trim_end()
        } else {
            line.as_str()
        };
        units = units
            .checked_add(text.encode_utf16().count())
            .ok_or_else(|| {
                EngineError::new("LIMIT", Utf16::from(path), "Generated source size overflow")
            })?;
    }
    units = units.checked_add(end.saturating_sub(1)).ok_or_else(|| {
        EngineError::new("LIMIT", Utf16::from(path), "Generated source size overflow")
    })?;
    ctx.charge_work(units, Utf16::from(path))?;
    if units > 33_554_432 {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::from(path),
            "Generated source size limit exceeded",
        ));
    }
    let mut joined = String::new();
    for (index, line) in lines[..end].iter().enumerate() {
        if index > 0 {
            joined.push('\n');
        }
        crate::generation::python::append_text(&mut joined, line, ctx)?;
    }
    let body = if trim_end {
        ctx.charge_work(joined.len(), Utf16::from(path))?;
        joined.trim_end().to_owned()
    } else {
        joined
    };
    ctx.charge_work(body.len().saturating_add(1), Utf16::from(path))?;
    Ok(Utf16::from(body + "\n"))
}

#[derive(Clone)]
pub(crate) struct Emitted {
    pub files: Vec<(String, Utf16)>,
    pub symbols: Vec<Value>,
}

/// Render the admitted private IR into the literal-only Python target.
pub(crate) fn emit(
    ir: &Value,
    request: &Value,
    digest: &str,
    document_digest: &str,
    runtime: &str,
    ctx: &mut Context<'_>,
) -> Result<Emitted, EngineError> {
    // Quote/metadata construction below is proportional to the admitted IR.
    // Charge the whole traversal before allocating emitter vectors or strings.
    precharge_tree(ir, ctx)?;
    precharge_tree(request, ctx)?;
    let package = get_metered(request, "package", ctx)?.unwrap_or_default();
    let records = arr(member(ir, "records").unwrap_or(&Value::Null));
    let mut models=vec!["# SPDX-License-Identifier: MIT OR Apache-2.0".into(),"# Generated from pinned UMF inputs. Regenerate; do not edit.".into(),"from __future__ import annotations".into(),"from datetime import date, datetime".into(),"from decimal import Decimal".into(),"from typing import Annotated, ClassVar, TYPE_CHECKING, TypeVar, final".into(),"from pydantic import BeforeValidator, TypeAdapter".into(),"from umf_access.dsl import FieldRef, GeneratedSource".into(),"from umf_access.types import MISSING, StrictModel, Vector".into(),"from umf_access.values import validate_integer, validate_decimal, validate_string, validate_date, validate_instant, validate_local, validate_boolean, validate_binary, validate_length, validate_range, validate_allowed, validate_vector, validate_float32, FieldValidator".into(),"_AliasTag = TypeVar(\"_AliasTag\")".into(),format!("UMF_GENERATED_SOURCE = GeneratedSource(document_id={}, core_version=\"0.10.0\", document_sha256={}, input_digest={}, runtime_abi=\"umf-access-runtime/0.1\")",py(member(ir,"documentId").unwrap_or(&Value::Null),ctx)?,quote(document_digest,ctx)?,quote(digest,ctx)?)];
    let mut keys = vec![
        "# SPDX-License-Identifier: MIT OR Apache-2.0".into(),
        "# Generated from pinned UMF inputs. Regenerate; do not edit.".into(),
        "from __future__ import annotations".into(),
        "from umf_access.dsl import GeneratedSource".into(),
        "from typing import Annotated, ClassVar, Mapping, TypeVar, final".into(),
        "from datetime import date, datetime".into(),
        "from decimal import Decimal".into(),
        "from types import MappingProxyType".into(),
        "from pydantic import BeforeValidator".into(),
        "from .models import *".into(),
        "from .models import UMF_GENERATED_SOURCE".into(),
    ];
    let mut fields:Vec<String>=vec!["# SPDX-License-Identifier: MIT OR Apache-2.0".into(),"# Generated from pinned UMF inputs. Regenerate; do not edit.".into(),"from __future__ import annotations".into(),"from datetime import date, datetime".into(),"from decimal import Decimal".into(),"from typing import TypedDict, overload, ClassVar, Mapping, Generic, TypeVar, cast, Never".into(),"from pydantic import BaseModel".into(),"from umf_access.types import MISSING".into(),"from types import MappingProxyType".into(),"from umf_access.dsl import Join, RequiredJoin, OptionalJoin, RequiredNavigation, OptionalNavigation, ManyNavigation, JoinProjection, Column, FieldRef, RecordRef, Query, Terminal, Related, Param, Selection, AliasOwner, RecordAlias, alias_column, alias_record, alias_relationship".into(),"from .models import *".into(),"from .models import UMF_GENERATED_SOURCE".into(),"from .keys import *".into(),"from umf_access.dsl.search import KeywordIndex, VectorIndex, RankedQuery, SearchLeg, RANKED_MODEL_PROFILE, require_ranked_model_profile".into(),"from umf_access.types import Vector".into(),"require_ranked_model_profile(RANKED_MODEL_PROFILE, \"umf.ranked-generated-model/0.1\")".into(),"_AliasTag = TypeVar(\"_AliasTag\")".into(),"_RankedRow = TypeVar(\"_RankedRow\")".into(),"_ProjectionT = TypeVar(\"_ProjectionT\", bound=BaseModel)".into()];
    for i in 1..=8 {
        fields.push(format!("_RankedT{i} = TypeVar(\"_RankedT{i}\")"));
    }
    fields.push(String::new());
    let mut codec: Vec<String> = vec![
        "# SPDX-License-Identifier: MIT OR Apache-2.0".into(),
        "# Generated from pinned UMF inputs. Regenerate; do not edit.".into(),
        "from __future__ import annotations".into(),
        "from .models import *".into(),
        "from .keys import *".into(),
        "from umf_access.codec_support import CodecField, encode_model, decode_model".into(),
        "".into(),
    ];
    let mut symbols = Vec::new();
    let mut action_file: Option<Vec<String>> = None;
    models.push("if TYPE_CHECKING:".into());
    for record in records {
        if member(record, "selected") == Some(&Value::Bool(false)) {
            continue;
        }
        let name = get_metered(record, "python", ctx)?.unwrap_or_default();
        models.push(format!(
            "    from .fields import {name}Columns, {name}Query, {name}Alias{}",
            if scan_any(
                arr(member(ir, "search").unwrap_or(&Value::Null)),
                ctx,
                |x| ref_eq(
                    member(x, "record").unwrap_or(&Value::Null),
                    member(record, "ref").unwrap_or(&Value::Null)
                )
            )? {
                format!(", {name}Search")
            } else {
                String::new()
            }
        ));
    }
    models.push(String::new());
    let mut emitted_validators = std::collections::BTreeSet::new();
    let mut flattened_fields = Vec::new();
    for record in records {
        for field in arr(member(record, "fields").unwrap_or(&Value::Null)) {
            ctx.charge_work(1, Utf16::default())?;
            flattened_fields.push(field);
        }
    }
    for record in records {
        let fs = arr(member(record, "fields").unwrap_or(&Value::Null));
        for f in ordered_fields(fs, &mut emitted_validators, ctx)? {
            ctx.charge_work(
                1,
                member(f, "pointer")
                    .and_then(text)
                    .map(Utf16::from)
                    .unwrap_or_default(),
            )?;
            let collection = member(f, "item").is_some() && member(f, "vectorDimensions").is_none();
            let contextual = collection || member(f, "vectorDimensions").is_some();
            let modes = if contextual {
                vec!["row", "create"]
            } else {
                vec!["row"]
            };
            for mode in modes {
                let vp = validator(f, mode, ctx)?;
                let facets = member(f, "facets").unwrap_or(&Value::Null);
                let kind = if member(f, "vectorDimensions").is_some() {
                    "vector".into()
                } else if member(f, "vectorComponent") == Some(&Value::Bool(true)) {
                    "float32".into()
                } else if text_is(f, "scalarType", "timestamp") {
                    get_metered(f, "temporal", ctx)?.unwrap_or_else(|| "local".into())
                } else {
                    get_metered(f, "scalarType", ctx)?
                        .or(get_metered(f, "cardinality", ctx)?)
                        .unwrap_or_default()
                };
                let mut args = vec![format!("kind={}", quote(&kind, ctx)?)];
                if collection {
                    let carrier = field_carrier(f, fs, mode, true, ctx)?;
                    let adapter = format!("_adapter{vp}");
                    models.push(format!(
                        "{adapter}: TypeAdapter[{carrier}] = TypeAdapter({carrier})"
                    ));
                    args.push(format!("adapter={adapter}"));
                }
                if text_is(f, "scalarType", "integer") {
                    let width = member(facets, "integerWidth").unwrap_or(&Value::Null);
                    args.push(format!(
                        "bits={}",
                        py(member(width, "bits").unwrap_or(&Value::Null), ctx)?
                    ));
                    args.push(format!(
                        "signed={}",
                        py(member(width, "signed").unwrap_or(&Value::Bool(true)), ctx)?
                    ));
                }
                if text_is(f, "scalarType", "decimal") {
                    args.push(format!(
                        "precision={}",
                        py(member(facets, "precision").unwrap_or(&Value::Null), ctx)?
                    ));
                    args.push(format!(
                        "scale={}",
                        py(member(facets, "scale").unwrap_or(&Value::Null), ctx)?
                    ));
                }
                if let Some(d) = member(f, "vectorDimensions") {
                    args.push(format!("dimensions={}", py(d, ctx)?));
                }
                if let Some(size) =
                    member(facets, "length").or_else(|| member(facets, "collectionSize"))
                {
                    args.push(format!(
                        "minimum={}",
                        py(member(size, "min").unwrap_or(&Value::Null), ctx)?
                    ));
                    args.push(format!(
                        "maximum={}",
                        py(member(size, "max").unwrap_or(&Value::Null), ctx)?
                    ));
                }
                if let Some(range) = member(facets, "range") {
                    args.push(format!(
                        "range_min={}",
                        member(range, "min")
                            .map(|v| core_literal(v, ctx))
                            .transpose()?
                            .unwrap_or_else(|| "None".into())
                    ));
                    args.push(format!(
                        "range_max={}",
                        member(range, "max")
                            .map(|v| core_literal(v, ctx))
                            .transpose()?
                            .unwrap_or_else(|| "None".into())
                    ));
                    args.push(format!(
                        "min_inclusive={}",
                        py(
                            member(range, "minInclusive").unwrap_or(&Value::Bool(true)),
                            ctx
                        )?
                    ));
                    args.push(format!(
                        "max_inclusive={}",
                        py(
                            member(range, "maxInclusive").unwrap_or(&Value::Bool(true)),
                            ctx
                        )?
                    ));
                }
                if let Some(allowed) = member(
                    member(f, "properties").unwrap_or(&Value::Null),
                    "allowedValues",
                ) {
                    if let Value::Array(values) = allowed {
                        args.push(format!(
                            "allowed=({}{comma})",
                            values
                                .iter()
                                .map(|v| core_literal(v, ctx))
                                .collect::<Result<Vec<_>, _>>()?
                                .join_metered(", ", ctx)?,
                            comma = if values.is_empty() { "" } else { "," }
                        ));
                    }
                }
                models.push(format!(
                    "{vp} = FieldValidator({})",
                    args.join_metered(", ", ctx)?
                ));
                models.push(String::new());
            }
        }
    }
    let mut validators = Vec::new();
    let mut validator_names = std::collections::BTreeSet::new();
    for record in records {
        for field in arr(member(record, "fields").unwrap_or(&Value::Null)) {
            let name = validator(field, "row", ctx)?;
            if validator_names.insert(name.clone()) {
                validators.push(name);
            }
        }
    }
    keys.splice(
        11..11,
        validators
            .iter()
            .map(|v| format!("from .models import {v}")),
    );
    keys.extend([
        "from umf_access.types import MISSING, StrictModel, Vector".into(),
        format!("BUNDLE_INPUT_DIGEST = {}", quote(digest, ctx)?),
        "".into(),
    ]);
    let projections = arr(member(request, "projections").unwrap_or(&Value::Null));
    let projection_names = projections
        .iter()
        .enumerate()
        .map(|(pi, p)| {
            ctx.charge_work(13 + pi.to_string().len(), Utf16::default())?;
            let pointer = format!("/projections/{pi}");
            let pointer_value = Value::String(Utf16::from(pointer.as_str()));
            let explicit = scan_find(
                arr(member(request, "names").unwrap_or(&Value::Null)),
                ctx,
                |n| {
                    member(n, "sourceId") == member(ir, "sourceId")
                        && member(n, "pointer") == Some(&pointer_value)
                },
            )?;
            let explicit = match explicit {
                Some(value) => get_metered(value, "python", ctx)?,
                None => None,
            };
            let name = match explicit {
                Some(name) => name,
                None => class_name(&get_metered(p, "name", ctx)?.unwrap_or_default()),
            };
            Ok::<_, EngineError>(name)
        })
        .collect::<Result<Vec<_>, _>>()?;
    for rec in records {
        ctx.charge_work(1, Utf16::default())?;
        precharge_tree(rec, ctx)?;
        let rname = get_metered(rec, "python", ctx)?.unwrap_or_default();
        let reference = member(rec, "ref").unwrap_or(&Value::Null);
        let selected = member(rec, "selected") != Some(&Value::Bool(false));
        let all_fields = arr(member(rec, "fields").unwrap_or(&Value::Null));
        let fs = scan_filter(all_fields, ctx, |f| {
            member(f, "owned") != Some(&Value::Bool(false))
        })?;
        let ks = arr(member(rec, "keys").unwrap_or(&Value::Null));
        let searches = scan_filter(
            arr(member(ir, "search").unwrap_or(&Value::Null)),
            ctx,
            |x| ref_eq(member(x, "record").unwrap_or(&Value::Null), reference),
        )?;
        if selected {
            fields.push(format!("class {rname}Columns:"));
        }
        for key in ks {
            let kn = key_name(rec, key, ctx)?;
            keys.extend(["@final".into(),format!("class {kn}(StrictModel):"),"    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE".into(),"    UMF_KEY: ClassVar[bool] = True".into(),format!("    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({{\"documentId\": {}, \"coreVersion\": \"0.10.0\", \"module\": {}, \"element\": {}, \"key\": {}}})",py(member(ir,"documentId").unwrap_or(&Value::Null),ctx)?,py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(key,"id").unwrap_or(&Value::Null),ctx)?)]);
            for rf in arr(member(key, "fields").unwrap_or(&Value::Null)) {
                precharge_tree(rf, ctx)?;
                if let Some(f) = scan_find(&fs, ctx, |f| {
                    ref_eq(member(f, "ref").unwrap_or(&Value::Null), rf)
                })? {
                    let name = get_metered(f, "python", ctx)?.unwrap_or_default();
                    let vp = validator(f, "row", ctx)?;
                    let ty = scalar(f);
                    keys.push(format!(
                        "    {name}: Annotated[{ty}, BeforeValidator({vp})]"
                    ));
                    symbols.push(Value::Object(vec![
                        (
                            Utf16::from("sourceId"),
                            clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                        ),
                        (
                            Utf16::from("pointer"),
                            clone_metered(member(f, "pointer").unwrap_or(&Value::Null), ctx)?,
                        ),
                        (
                            Utf16::from("path"),
                            Value::String(Utf16::from(format!("{package}/keys.py"))),
                        ),
                        (
                            Utf16::from("symbol"),
                            Value::String(Utf16::from(format!("{kn}.{name}"))),
                        ),
                        (Utf16::from("role"), Value::String(Utf16::from("key"))),
                    ]));
                }
            }
            let key_field_tuple = arr(member(key, "fields").unwrap_or(&Value::Null))
                .iter()
                .map(|rf| {
                    let field_name = match scan_find(&fs, ctx, |f| {
                        ref_eq(member(f, "ref").unwrap_or(&Value::Null), rf)
                    })? {
                        Some(field) => get_metered(field, "python", ctx)?.unwrap_or_default(),
                        None => String::new(),
                    };
                    Ok::<_, EngineError>(format!(
                        "({}, {}, {})",
                        py(member(rf, "module").unwrap_or(&Value::Null), ctx)?,
                        py(member(rf, "element").unwrap_or(&Value::Null), ctx)?,
                        quote(&field_name, ctx)?
                    ))
                })
                .collect::<Result<Vec<_>, EngineError>>()?
                .join_metered(", ", ctx)?;
            keys.push(format!("    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = ({key_field_tuple}{comma})",comma=if key_field_tuple.is_empty(){""}else{","}));
            keys.extend([format!("    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {}",quote(digest,ctx)?),format!("    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (\"umf_access\", {}, \"umf-access-runtime/0.1\")",quote(runtime,ctx)?),"    UMF_FINAL: ClassVar[bool] = True".into(),"".into()]);
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/keys.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(kn.clone())),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("key"))),
            ]));
        }
        if !selected {
            continue;
        }
        models.extend([
            "@final".into(),
            format!("class {rname}(StrictModel):"),
            "    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE".into(),
            format!("    c: ClassVar[{rname}Columns]"),
            format!("    objects: ClassVar[{rname}Query]"),
            "    @classmethod".into(),
            format!("    def alias(cls, tag: type[_AliasTag]) -> {rname}Alias[_AliasTag]:"),
            format!("        from .fields import {rname}Alias"),
            format!("        return {rname}Alias(tag)"),
        ]);
        if !searches.is_empty() {
            models.push(format!("    s: ClassVar[{rname}Search]"));
        }
        for f in &fs {
            precharge_tree(f, ctx)?;
            let name = get_metered(f, "python", ctx)?.unwrap_or_default();
            let ty = field_carrier(f, all_fields, "row", true, ctx)?;
            let vp = validator(f, "row", ctx)?;
            let row = member(f, "row").unwrap_or(&Value::Null);
            let nullable = member(row, "null") == Some(&Value::Bool(true));
            let missing = member(row, "missing") == Some(&Value::Bool(true));
            let typ = format!(
                "Annotated[{ty}, BeforeValidator({vp})]{}{}",
                if nullable { " | None" } else { "" },
                if missing { " | MISSING" } else { "" }
            );
            models.push(format!(
                "    {name}: {typ}{}",
                if missing { " = MISSING" } else { "" }
            ));
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(f, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/models.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("{rname}.{name}"))),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("row"))),
            ]));
            let fm = member(f, "ref").unwrap_or(&Value::Null);
            let module = py(member(fm, "module").unwrap_or(&Value::Null), ctx)?;
            let element = py(member(fm, "element").unwrap_or(&Value::Null), ctx)?;
            let logical = py(member(f, "logicalName").unwrap_or(&Value::Null), ctx)?;
            let column_type = format!(
                "{}{}",
                field_carrier(f, all_fields, "row", false, ctx)?,
                if nullable { " | None" } else { "" }
            );
            fields.push(format!("    {name}: Column[{rname}, {column_type}] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module={}, element={}, field={}, field_module={}, temporal={}, logical_name={}))",py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,element,module,py(member(f,"temporal").unwrap_or(&Value::Null),ctx)?,logical));
            fields.push(format!("    {}", source_comment(ir, f, ctx)?));
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(f, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/fields.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("{rname}.c.{name}"))),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("fields"))),
            ]));
        }
        let relations = scan_filter(
            arr(member(ir, "relations").unwrap_or(&Value::Null)),
            ctx,
            |rel| ref_eq(member(rel, "owner").unwrap_or(&Value::Null), reference),
        )?;
        for relation in &relations {
            precharge_tree(relation, ctx)?;
            let target_ref = member(relation, "target").unwrap_or(&Value::Null);
            let Some(target) = scan_find(records, ctx, |candidate| {
                ref_eq(member(candidate, "ref").unwrap_or(&Value::Null), target_ref)
            })?
            else {
                continue;
            };
            let Some(key) = scan_find(
                arr(member(target, "keys").unwrap_or(&Value::Null)),
                ctx,
                |key| member(key, "id") == member(relation, "key"),
            )?
            else {
                continue;
            };
            let key_model = key_name(target, key, ctx)?;
            let target_name = get_metered(target, "python", ctx)?.unwrap_or_default();
            let target_keys = arr(member(target, "keys").unwrap_or(&Value::Null));
            let to_one = member(relation, "toOne") == Some(&Value::Bool(true));
            let target_selected = member(target, "selected") == Some(&Value::Bool(true));
            let optional = member(relation, "optional") == Some(&Value::Bool(true));
            let field_ref=format!("FieldRef(source=UMF_GENERATED_SOURCE, module={}, element={}, field={}, field_module={}, logical_name={})",py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(relation,"id").unwrap_or(&Value::Null),ctx)?,py(member(relation,"module").unwrap_or(&Value::Null),ctx)?,py(member(relation,"logicalName").unwrap_or(&Value::Null),ctx)?);
            let nav = if to_one && target_selected {
                !ks.is_empty() && !target_keys.is_empty()
            } else {
                selected
                    && target_selected
                    && ks.first().is_some_and(|key| {
                        !arr(member(key, "fields").unwrap_or(&Value::Null)).is_empty()
                    })
                    && target_keys.first().is_some_and(|key| {
                        !arr(member(key, "fields").unwrap_or(&Value::Null)).is_empty()
                    })
                    && !arr(member(key, "fields").unwrap_or(&Value::Null)).is_empty()
            };
            let relation_class = if to_one && target_selected {
                if optional {
                    if nav {
                        "OptionalNavigation"
                    } else {
                        "OptionalJoin"
                    }
                } else if nav {
                    "RequiredNavigation"
                } else {
                    "RequiredJoin"
                }
            } else if nav {
                "ManyNavigation"
            } else {
                "Related"
            };
            let inverse_name = if let Some(id) = member(rec, "inverseKey") {
                scan_find(ks, ctx, |k| member(k, "id") == Some(id))?
                    .map(|key| key_name(rec, key, ctx))
                    .transpose()?
                    .unwrap_or_else(|| "Never".into())
            } else {
                "Never".into()
            };
            let relation_types = if nav {
                format!(
                    "{rname}, {target_name}, {}, {}, {key_model}, {}",
                    key_name(rec, &ks[0], ctx)?,
                    key_name(target, &target_keys[0], ctx)?,
                    inverse_name
                )
            } else if to_one && target_selected {
                format!("{rname}, {target_name}, {key_model}")
            } else {
                format!("{rname}, {key_model}")
            };
            let mut arguments = if to_one && target_selected {
                format!(
                    "{field_ref}, {}, optional={}",
                    selected_root(target, member(relation, "key"), ctx)?,
                    py(
                        member(relation, "optional").unwrap_or(&Value::Bool(false)),
                        ctx
                    )?
                )
            } else {
                format!(
                    "{field_ref}, key_target={}",
                    selected_root(target, member(relation, "key"), ctx)?
                )
            };
            if nav {
                let inverse = if let Some(key) = member(rec, "inverseKey") {
                    selected_root(rec, Some(key), ctx)?
                } else {
                    "None".into()
                };
                arguments.push_str(&format!(
                    ", source_query={}, target_query={}, inverse_key_target={inverse}",
                    selected_root(rec, None, ctx)?,
                    selected_root(target, None, ctx)?
                ));
            }
            let name = get_metered(relation, "python", ctx)?.unwrap_or_default();
            fields.push(format!(
                "    {name}: {relation_class}[{relation_types}] = {relation_class}({arguments})"
            ));
            fields.push(format!("    {}", source_comment(ir, relation, ctx)?));
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(relation, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/fields.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("{rname}.c.{name}"))),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("fields"))),
            ]));
        }
        if fs.is_empty() && relations.is_empty() {
            fields.push("    pass".into());
        }
        fields.push(String::new());
        fields.push(format!("class {rname}Update(TypedDict, total=False):"));
        let mutable = scan_filter(&fs, ctx, |f| {
            member(f, "mutable") == Some(&Value::Bool(true))
                && member(f, "generated") != Some(&Value::Bool(true))
        })?;
        for f in &mutable {
            precharge_tree(f, ctx)?;
            let base = field_carrier(f, all_fields, "row", false, ctx)?;
            let ty = format!(
                "{base}{}",
                if member(member(f, "create").unwrap_or(&Value::Null), "null")
                    == Some(&Value::Bool(true))
                {
                    " | None"
                } else {
                    ""
                }
            );
            fields.push(format!(
                "    {}: {} | Param[{}]",
                get_metered(f, "python", ctx)?.unwrap_or_default(),
                ty,
                ty
            ));
        }
        if mutable.is_empty() {
            fields.push("    pass".into());
        }
        let mut requested_projections = Vec::new();
        for (pi, projection) in arr(member(request, "projections").unwrap_or(&Value::Null))
            .iter()
            .enumerate()
        {
            ctx.charge_work(1, Utf16::default())?;
            if !ref_eq(
                member(projection, "record").unwrap_or(&Value::Null),
                reference,
            ) {
                continue;
            }
            ctx.charge_work(13 + pi.to_string().len(), Utf16::default())?;
            let pointer = format!("/projections/{pi}");
            let pointer_value = Value::String(Utf16::from(pointer.as_str()));
            let explicit = scan_find(
                arr(member(request, "names").unwrap_or(&Value::Null)),
                ctx,
                |n| {
                    member(n, "sourceId") == member(ir, "sourceId")
                        && member(n, "pointer") == Some(&pointer_value)
                },
            )?;
            let explicit = match explicit {
                Some(value) => get_metered(value, "python", ctx)?,
                None => None,
            };
            let name = match explicit {
                Some(name) => name,
                None => class_name(&get_metered(projection, "name", ctx)?.unwrap_or_default()),
            };
            requested_projections.push((name, pointer));
        }

        if !searches.is_empty() {
            fields.extend([String::new(),format!("class {rname}RankedQuery(RankedQuery[{rname}, _RankedRow], Generic[_RankedRow]):")]);
            if !requested_projections.is_empty() {
                let mut types = Vec::new();
                for (name, _) in &requested_projections {
                    ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
                    types.push(format!("type[{name}]"));
                    fields.extend(["    @overload".into(),format!("    def into(self, projection: type[{name}]) -> {rname}RankedQuery[{name}]: ...")]);
                }
                fields.extend(["    @overload".into(),format!("    def into(self, projection: JoinProjection[{rname}, _ProjectionT]) -> {rname}RankedQuery[_ProjectionT]: ...")]);
                types.push(format!("JoinProjection[{rname}, _ProjectionT]"));
                fields.extend([
                    format!(
                        "    def into(self, projection: {}) -> object:",
                        types.join_metered(" | ", ctx)?
                    ),
                    format!(
                        "        return {rname}RankedQuery._from_query(self._into(projection))"
                    ),
                ]);
            }

            for n in 1..=8 {
                let args = (1..=n)
                    .map(|i| format!("c{i}: Column[{rname}, _RankedT{i}]"))
                    .collect::<Vec<_>>()
                    .join_metered(", ", ctx)?;
                let ts = (1..=n)
                    .map(|i| format!("_RankedT{i}"))
                    .collect::<Vec<_>>()
                    .join_metered(", ", ctx)?;
                fields.extend([
                    "    @overload".into(),
                    format!(
                        "    def select(self, {args}, /) -> {rname}RankedQuery[tuple[{ts}]]: ..."
                    ),
                ]);
            }
            let selected_key = ks
                .first()
                .map(|k| key_name(rec, k, ctx))
                .transpose()?
                .unwrap_or_else(|| "object".into());
            fields.extend([format!("    def select(self, *columns: object) -> object:"),"        return self._select(*columns)".into(),String::new(),format!("class {rname}SelectedQuery(Query[{rname}, _RankedRow, {selected_key}], Generic[_RankedRow]):"),format!("    def search(self, leg: SearchLeg[{rname}], *, allow_partial: bool = False) -> {rname}RankedQuery[_RankedRow]:"),format!("        return {rname}RankedQuery._from_query(super().search(leg, allow_partial=allow_partial))")]);
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/fields.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("{rname}RankedQuery"))),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("fields"))),
            ]));
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/fields.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("{rname}SelectedQuery"))),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("fields"))),
            ]));
            for n in 1..=8 {
                let args = (1..=n)
                    .map(|i| format!("c{i}: Selection[{rname}, _RankedT{i}]"))
                    .collect::<Vec<_>>()
                    .join_metered(", ", ctx)?;
                let ts = (1..=n)
                    .map(|i| format!("_RankedT{i}"))
                    .collect::<Vec<_>>()
                    .join_metered(", ", ctx)?;
                fields.extend([
                    "    @overload".into(),
                    format!(
                        "    def select(self, {args}, /) -> {rname}SelectedQuery[tuple[{ts}]]: ..."
                    ),
                ]);
            }
            fields.extend([
                format!("    def select(self, *columns: object) -> object:"),
                format!(
                    "        return {rname}SelectedQuery(self.ref, self._select(*columns).steps)"
                ),
            ]);
            if requested_projections.len() == 1 {
                let name = &requested_projections[0].0;
                fields.push(format!(
                    "    def into(self, model: type[{name}]) -> {rname}SelectedQuery[{name}]:"
                ));
                fields.push(format!(
                    "        return {rname}SelectedQuery(self.ref, self._into(model).steps)"
                ));
            } else if requested_projections.len() > 1 {
                for (name, _) in &requested_projections {
                    fields.push("    @overload".into());
                    fields.push(format!("    def into(self, model: type[{name}]) -> {rname}SelectedQuery[{name}]: ..."));
                }
                fields.push(format!(
                    "    def into(self, model: {}) -> object:",
                    requested_projections
                        .iter()
                        .map(|(name, _)| format!("type[{name}]"))
                        .collect::<Vec<_>>()
                        .join_metered(" | ", ctx)?
                ));
                fields.push(format!(
                    "        return {rname}SelectedQuery(self.ref, self._into(model).steps)"
                ));
            }
        }
        fields.push(String::new());
        fields.push(if searches.is_empty() {
            format!(
                "class {rname}Query(Query[{rname}, {rname}, {}]):",
                if ks.is_empty() {
                    "object".to_owned()
                } else {
                    format!("{rname}Key")
                }
            )
        } else {
            format!("class {rname}Query({rname}SelectedQuery[{rname}]):")
        });
        fields.push(format!("    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({{{}}})",mutable.iter().map(|f|Ok::<_,EngineError>(format!("{}: FieldRef(source=UMF_GENERATED_SOURCE, module={}, element={}, field={}, field_module={}, logical_name={})",quote(&get_metered(f,"python",ctx)?.unwrap_or_default(),ctx)?,py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(member(f,"ref").unwrap_or(&Value::Null),"element").unwrap_or(&Value::Null),ctx)?,py(member(member(f,"ref").unwrap_or(&Value::Null),"module").unwrap_or(&Value::Null),ctx)?,py(member(f,"logicalName").unwrap_or(&Value::Null),ctx)?))).collect::<Result<Vec<_>,_>>()?.join_metered(", ",ctx)?));
        let signature = mutable
            .iter()
            .map(|f| {
                let name = get_metered(f, "python", ctx)?.unwrap_or_default();
                let base = field_carrier(f, all_fields, "row", false, ctx)?;
                let ty = format!(
                    "{base}{}",
                    if member(member(f, "create").unwrap_or(&Value::Null), "null")
                        == Some(&Value::Bool(true))
                    {
                        " | None"
                    } else {
                        ""
                    }
                );
                Ok::<_, EngineError>(format!("{name}: {ty} | Param[{ty}] | MISSING = MISSING"))
            })
            .collect::<Result<Vec<_>, _>>()?
            .join_metered(", ", ctx)?;
        fields.push(format!(
            "    def update(self{}) -> Terminal[object]:",
            if signature.is_empty() {
                String::new()
            } else {
                format!(", *, {signature}")
            }
        ));
        fields.push(format!(
            "        return self._update_present({{{}}})",
            mutable
                .iter()
                .map(|f| {
                    let n = get_metered(f, "python", ctx)?.unwrap_or_default();
                    Ok::<_, EngineError>(format!("{}: {}", quote(&n, ctx)?, n))
                })
                .collect::<Result<Vec<_>, _>>()?
                .join_metered(", ", ctx)?
        ));
        let has_search = !searches.is_empty();
        if !has_search && requested_projections.len() == 1 {
            let name = &requested_projections[0].0;
            let keytype = ks
                .first()
                .map(|k| key_name(rec, k, ctx))
                .transpose()?
                .unwrap_or_else(|| "object".into());
            fields.push(format!(
                "    def into(self, model: type[{name}]) -> Query[{rname}, {name}, {keytype}]:"
            ));
            fields.push("        return self._into(model)".into());
        } else if !has_search && requested_projections.len() > 1 {
            for (name, _) in &requested_projections {
                fields.push("    @overload".into());
                fields.push(format!(
                    "    def into(self, model: type[{name}]) -> Query[{rname}, {name}, {}]: ...",
                    ks.first()
                        .map(|k| key_name(rec, k, ctx))
                        .transpose()?
                        .unwrap_or_else(|| "object".into())
                ));
            }
            fields.push(format!(
                "    def into(self, model: {}) -> object:",
                requested_projections
                    .iter()
                    .map(|(n, _)| format!("type[{n}]"))
                    .collect::<Vec<_>>()
                    .join_metered(" | ", ctx)?
            ));
            fields.push("        return self._into(model)".into());
        }
        fields.push(String::new());
        fields.push(format!("{rname}.c = {rname}Columns()"));
        let key = ks.first();
        let keyid = key.map(|k| member(k, "id").unwrap_or(&Value::Null));
        let key_fields = key
            .map(|k| arr(member(k, "fields").unwrap_or(&Value::Null)))
            .unwrap_or(&[]);
        let refs=key_fields.iter().map(|f|Ok::<_,EngineError>(format!("FieldRef(source=UMF_GENERATED_SOURCE, module={}, element={}, field={}, field_module={}, logical_name={})",py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(f,"element").unwrap_or(&Value::Null),ctx)?,py(member(f,"module").unwrap_or(&Value::Null),ctx)?,py(scan_find(&fs,ctx,|x|ref_eq(member(x,"ref").unwrap_or(&Value::Null),f))?.and_then(|x|member(x,"logicalName")).unwrap_or(&Value::Null),ctx)?))).collect::<Result<Vec<_>,_>>()?.join_metered(", ",ctx)?;
        fields.push(format!("{rname}.objects = {rname}Query(RecordRef(source=UMF_GENERATED_SOURCE, key_id={}, module={}, element={}, logical_namespace={}, logical_name={}, key=({},)))",keyid.map(|x|py(x,ctx)).transpose()?.unwrap_or("None".into()),py(member(reference,"module").unwrap_or(&Value::Null),ctx)?,py(member(reference,"element").unwrap_or(&Value::Null),ctx)?,py(member(rec,"namespace").unwrap_or(&Value::Null),ctx)?,py(member(rec,"logicalName").unwrap_or(&Value::Null),ctx)?,refs));
        fields.push(String::new());
        fields.extend([
            format!("class {rname}AliasColumns(Generic[_AliasTag]):"),
            "    def __init__(self, tag: type[_AliasTag]) -> None:".into(),
        ]);
        if fs.is_empty() {
            fields.push("        pass".into());
        }
        for f in &fs {
            precharge_tree(f, ctx)?;
            let name = get_metered(f, "python", ctx)?.unwrap_or_default();
            let ty = field_carrier(f, all_fields, "row", false, ctx)?;
            let nullable = member(member(f, "row").unwrap_or(&Value::Null), "null")
                == Some(&Value::Bool(true));
            fields.push(format!("        self.{name}: Column[AliasOwner[{rname}, _AliasTag], {ty}{}] = alias_column({rname}.c.{name}, tag)",if nullable{" | None"}else{""}));
        }
        for relation in &relations {
            precharge_tree(relation, ctx)?;
            ctx.charge_work(1, Utf16::default())?;
            if let Some(target) = scan_find(records, ctx, |candidate| {
                ref_eq(
                    member(candidate, "ref").unwrap_or(&Value::Null),
                    member(relation, "target").unwrap_or(&Value::Null),
                )
            })? {
                let key = scan_find(
                    arr(member(target, "keys").unwrap_or(&Value::Null)),
                    ctx,
                    |key| member(key, "id") == member(relation, "key"),
                )?
                .ok_or_else(|| {
                    EngineError::new("INPUT", Utf16::default(), "Missing relationship Key")
                })?;
                let key_model = key_name(target, key, ctx)?;
                let name = get_metered(relation, "python", ctx)?.unwrap_or_default();
                let relation_type = if member(relation, "toOne") == Some(&Value::Bool(true))
                    && member(target, "selected") == Some(&Value::Bool(true))
                {
                    format!(
                        "{}[AliasOwner[{rname}, _AliasTag], {}, {key_model}]",
                        if member(relation, "optional") == Some(&Value::Bool(true)) {
                            "OptionalJoin"
                        } else {
                            "RequiredJoin"
                        },
                        get_metered(target, "python", ctx)?.unwrap_or_default()
                    )
                } else {
                    format!("Related[AliasOwner[{rname}, _AliasTag], {key_model}]")
                };
                fields.push(format!("        self.{name}: {relation_type} = alias_relationship({rname}.c.{name}, tag)"));
            }
        }
        fields.extend([
            String::new(),
            format!("class {rname}Alias(RecordAlias[{rname}, _AliasTag]):"),
            "    def __init__(self, tag: type[_AliasTag]) -> None:".into(),
            format!("        super().__init__(alias_record({rname}.objects.ref, tag), tag)"),
            "    @property".into(),
            format!("    def c(self) -> {rname}AliasColumns[_AliasTag]:"),
            format!("        return {rname}AliasColumns(self.tag)"),
            "    @property".into(),
            format!(
                "    def objects(self) -> Query[AliasOwner[{rname}, _AliasTag], {rname}, {}]:",
                if ks.is_empty() {
                    "object".into()
                } else {
                    format!("{rname}Key")
                }
            ),
            "        return Query(self.ref)".into(),
            String::new(),
        ]);
        symbols.push(Value::Object(vec![
            (
                Utf16::from("sourceId"),
                clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("pointer"),
                clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("path"),
                Value::String(Utf16::from(format!("{package}/fields.py"))),
            ),
            (
                Utf16::from("symbol"),
                Value::String(Utf16::from(format!("{rname}Alias"))),
            ),
            (Utf16::from("role"), Value::String(Utf16::from("fields"))),
        ]));
        symbols.push(Value::Object(vec![
            (
                Utf16::from("sourceId"),
                clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("pointer"),
                clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("path"),
                Value::String(Utf16::from(format!("{package}/fields.py"))),
            ),
            (
                Utf16::from("symbol"),
                Value::String(Utf16::from(format!("{rname}AliasColumns"))),
            ),
            (Utf16::from("role"), Value::String(Utf16::from("fields"))),
        ]));
        if !searches.is_empty() {
            fields.push(String::new());
            fields.push(format!("class {rname}Search:"));
            for search in &searches {
                let decl = member(search, "declaration").unwrap_or(&Value::Null);
                let typ = if text_is(decl, "kind", "vector") {
                    "VectorIndex"
                } else {
                    "KeywordIndex"
                };
                let name = get_metered(search, "python", ctx)?.unwrap_or_default();
                fields.extend([
                    format!("    {name}: {typ}[{rname}]"),
                    format!("    {}", source_comment(ir, search, ctx)?),
                ]);
                symbols.push(Value::Object(vec![
                    (
                        Utf16::from("sourceId"),
                        clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("pointer"),
                        clone_metered(member(search, "pointer").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("path"),
                        Value::String(Utf16::from(format!("{package}/fields.py"))),
                    ),
                    (
                        Utf16::from("symbol"),
                        Value::String(Utf16::from(format!("{rname}.s.{name}"))),
                    ),
                    (Utf16::from("role"), Value::String(Utf16::from("search"))),
                ]));
            }
            fields.push(format!("{rname}.s = {rname}Search()"));
            for search in &searches {
                let decl = member(search, "declaration").unwrap_or(&Value::Null);
                let typ = if text_is(decl, "kind", "vector") {
                    "VectorIndex"
                } else {
                    "KeywordIndex"
                };
                let meta = Value::Object(vec![
                    (
                        Utf16::from("source"),
                        Value::Object(vec![
                            (
                                Utf16::from("documentId"),
                                clone_metered(
                                    member(ir, "documentId").unwrap_or(&Value::Null),
                                    ctx,
                                )?,
                            ),
                            (
                                Utf16::from("documentSha256"),
                                Value::String(Utf16::from(document_digest)),
                            ),
                            (
                                Utf16::from("module"),
                                member(member(search, "record").unwrap_or(&Value::Null), "module")
                                    .cloned()
                                    .unwrap_or(Value::Null),
                            ),
                            (
                                Utf16::from("pointer"),
                                clone_metered(
                                    member(search, "pointer").unwrap_or(&Value::Null),
                                    ctx,
                                )?,
                            ),
                        ]),
                    ),
                    (Utf16::from("declaration"), decl.clone()),
                    (
                        Utf16::from("bindings"),
                        member(search, "bindings")
                            .cloned()
                            .unwrap_or_else(|| Value::Array(vec![])),
                    ),
                ]);
                fields.push(format!(
                    "{rname}.s.{} = {typ}({rname}.objects.ref, {})",
                    get_metered(search, "python", ctx)?.unwrap_or_default(),
                    quote(&compact_json(&meta, ctx)?, ctx)?
                ));
            }
        }
        models.push(format!(
            "    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = ({}{comma})",
            fs.iter()
                .map(|f| Ok::<_, EngineError>(format!(
                    "({}, {}, {})",
                    py(
                        member(member(f, "ref").unwrap_or(&Value::Null), "module")
                            .unwrap_or(&Value::Null),
                        ctx
                    )?,
                    py(
                        member(member(f, "ref").unwrap_or(&Value::Null), "element")
                            .unwrap_or(&Value::Null),
                        ctx
                    )?,
                    quote(&get_metered(f, "python", ctx)?.unwrap_or_default(), ctx)?
                )))
                .collect::<Result<Vec<_>, EngineError>>()?
                .join_metered(", ", ctx)?,
            comma = if fs.is_empty() { "" } else { "," }
        ));
        models.extend([format!("    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {}",quote(digest,ctx)?),format!("    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (\"umf_access\", {}, \"umf-access-runtime/0.1\")",quote(runtime,ctx)?),"    UMF_FINAL: ClassVar[bool] = True".into(),"".into()]);
        for suffix in ["Create", "Patch"] {
            models.extend([
                "@final".into(),
                format!("class {rname}{suffix}(StrictModel):"),
                "    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE".into(),
            ]);
            let selected = scan_filter(&fs, ctx, |f| {
                member(f, "owned") != Some(&Value::Bool(false))
                    && member(f, "generated") != Some(&Value::Bool(true))
                    && (suffix == "Create" || member(f, "mutable") == Some(&Value::Bool(true)))
            })?;
            for f in selected {
                precharge_tree(f, ctx)?;
                let name = get_metered(f, "python", ctx)?.unwrap_or_default();
                let ty = field_carrier(f, all_fields, "create", true, ctx)?;
                let vp = validator(f, "create", ctx)?;
                let state = member(f, "create").unwrap_or(&Value::Null);
                let nullable = member(state, "null") == Some(&Value::Bool(true));
                let missing =
                    suffix == "Patch" || member(state, "missing") == Some(&Value::Bool(true));
                models.push(format!(
                    "    {name}: Annotated[{ty}, BeforeValidator({vp})]{}{}{}",
                    if nullable { " | None" } else { "" },
                    if missing { " | MISSING" } else { "" },
                    if missing { " = MISSING" } else { "" }
                ));
                symbols.push(Value::Object(vec![
                    (
                        Utf16::from("sourceId"),
                        clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("pointer"),
                        clone_metered(member(f, "pointer").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("path"),
                        Value::String(Utf16::from(format!("{package}/models.py"))),
                    ),
                    (
                        Utf16::from("symbol"),
                        Value::String(Utf16::from(format!("{rname}{suffix}.{name}"))),
                    ),
                    (
                        Utf16::from("role"),
                        Value::String(Utf16::from(if suffix == "Create" {
                            "create"
                        } else {
                            "patch"
                        })),
                    ),
                ]));
            }
            let selected_create_fields = scan_filter(&fs, ctx, |f| {
                member(f, "owned") != Some(&Value::Bool(false))
                    && member(f, "generated") != Some(&Value::Bool(true))
                    && (suffix == "Create" || member(f, "mutable") == Some(&Value::Bool(true)))
            })?;
            let create_fields = selected_create_fields
                .iter()
                .map(|f| {
                    Ok::<_, EngineError>(format!(
                        "({}, {}, {})",
                        py(
                            member(member(f, "ref").unwrap_or(&Value::Null), "module")
                                .unwrap_or(&Value::Null),
                            ctx
                        )?,
                        py(
                            member(member(f, "ref").unwrap_or(&Value::Null), "element")
                                .unwrap_or(&Value::Null),
                            ctx
                        )?,
                        quote(&get_metered(f, "python", ctx)?.unwrap_or_default(), ctx)?
                    ))
                })
                .collect::<Result<Vec<_>, EngineError>>()?
                .join_metered(", ", ctx)?;
            models.push(format!("    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = ({create_fields}{comma})",comma=if create_fields.is_empty(){""}else{","}));
            models.extend([format!("    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {}",quote(digest,ctx)?),format!("    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (\"umf_access\", {}, \"umf-access-runtime/0.1\")",quote(runtime,ctx)?),"    UMF_FINAL: ClassVar[bool] = True".into(),"".into()]);
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/models.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("{rname}{suffix}"))),
                ),
                (
                    Utf16::from("role"),
                    Value::String(Utf16::from(if suffix == "Create" {
                        "create"
                    } else {
                        "patch"
                    })),
                ),
            ]));
        }
        symbols.push(Value::Object(vec![
            (
                Utf16::from("sourceId"),
                clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("pointer"),
                clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("path"),
                Value::String(Utf16::from(format!("{package}/models.py"))),
            ),
            (
                Utf16::from("symbol"),
                Value::String(Utf16::from(rname.clone())),
            ),
            (Utf16::from("role"), Value::String(Utf16::from("row"))),
        ]));
        symbols.push(Value::Object(vec![
            (
                Utf16::from("sourceId"),
                clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("pointer"),
                clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("path"),
                Value::String(Utf16::from(format!("{package}/fields.py"))),
            ),
            (
                Utf16::from("symbol"),
                Value::String(Utf16::from(format!("{rname}Columns"))),
            ),
            (Utf16::from("role"), Value::String(Utf16::from("fields"))),
        ]));
        symbols.push(Value::Object(vec![
            (
                Utf16::from("sourceId"),
                clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("pointer"),
                clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                Utf16::from("path"),
                Value::String(Utf16::from(format!("{package}/fields.py"))),
            ),
            (
                Utf16::from("symbol"),
                Value::String(Utf16::from(format!("{rname}Update"))),
            ),
            (Utf16::from("role"), Value::String(Utf16::from("update"))),
        ]));
        for (suffix, mode) in [("Create", "create"), ("Patch", "patch"), ("", "row")] {
            let chosen = scan_filter(&fs, ctx, |f| {
                member(f, "owned") != Some(&Value::Bool(false))
                    && (suffix != "Patch" || member(f, "mutable") == Some(&Value::Bool(true)))
                    && (suffix != "Create" || member(f, "generated") != Some(&Value::Bool(true)))
            })?;
            let mut entries = Vec::with_capacity(chosen.len());
            for field in chosen {
                precharge_tree(field, ctx)?;
                entries.push(codec_field(field, all_fields, &flattened_fields, ctx)?);
            }
            let meta = format!("_codec_{}{suffix}", rname);
            let entries_text = entries.join_metered(", ", ctx)?;
            codec.push(format!(
                "{meta}: tuple[CodecField, ...] = ({}{comma})",
                entries_text,
                comma = if entries.is_empty() { "" } else { "," }
            ));
            let fun = if suffix == "Create" {
                format!("encode_{rname}_create")
            } else if suffix == "Patch" {
                format!("encode_{rname}_patch")
            } else {
                format!("decode_{rname}")
            };
            if suffix.is_empty() {
                codec.push(format!(
                    "def {fun}(columns: list[str], row: list[object]) -> {rname}:"
                ));
                codec.push(format!(
                    "    return decode_model({rname}, columns, row, {meta})"
                ));
            } else {
                codec.push(format!(
                    "def {fun}(value: {rname}{suffix}) -> dict[str, object]:"
                ));
                codec.push(format!(
                    "    return encode_model({rname}{suffix}, value, {meta})"
                ));
            }
            codec.push(String::new());
            let role = if suffix == "Create" {
                "codec"
            } else if suffix == "Patch" {
                "codec"
            } else {
                "codec"
            };
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(rec, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/codecs.py"))),
                ),
                (Utf16::from("symbol"), Value::String(Utf16::from(fun))),
                (Utf16::from("role"), Value::String(Utf16::from(role))),
            ]));
            let _ = mode;
        }
        for (pi, projection) in projections.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            if !ref_eq(
                member(projection, "record").unwrap_or(&Value::Null),
                reference,
            ) {
                continue;
            }
            let pointer = format!("/projections/{pi}");
            let requested = get_metered(projection, "name", ctx)?.unwrap_or_default();
            let pointer_value = Value::String(Utf16::from(pointer.as_str()));
            let explicit = scan_find(
                arr(member(request, "names").unwrap_or(&Value::Null)),
                ctx,
                |n| {
                    member(n, "sourceId") == member(ir, "sourceId")
                        && member(n, "pointer") == Some(&pointer_value)
                },
            )?;
            let explicit = match explicit {
                Some(value) => get_metered(value, "python", ctx)?,
                None => None,
            };
            let name = explicit.unwrap_or_else(|| class_name(&requested));
            let root = scan_find(records, ctx, |r| {
                ref_eq(
                    member(r, "ref").unwrap_or(&Value::Null),
                    member(projection, "record").unwrap_or(&Value::Null),
                )
            })?
            .ok_or_else(|| {
                EngineError::new(
                    "ACCESS_UNSUPPORTED",
                    Utf16::from(pointer.clone()),
                    "Projection owner is not in the admitted record closure",
                )
            })?;
            let element = get_metered(root, "python", ctx)?.unwrap_or_default();
            let mut projection_fields = Vec::new();
            let mut projection_resolved = Vec::new();
            let mut projection_model_fields = Vec::new();
            for ref_value in arr(member(projection, "fields").unwrap_or(&Value::Null)) {
                let own = scan_find(
                    arr(member(root, "fields").unwrap_or(&Value::Null)),
                    ctx,
                    |f| {
                        member(f, "owned") != Some(&Value::Bool(false))
                            && ref_eq(member(f, "ref").unwrap_or(&Value::Null), ref_value)
                    },
                )?;
                let (field_owner, field) = if let Some(field) = own {
                    (root, field)
                } else {
                    let mut candidates = Vec::new();
                    for candidate_record in records {
                        ctx.charge_work(1, Utf16::default())?;
                        if member(candidate_record, "selected") != Some(&Value::Bool(true)) {
                            continue;
                        }
                        for candidate_field in
                            arr(member(candidate_record, "fields").unwrap_or(&Value::Null))
                        {
                            ctx.charge_work(1, Utf16::default())?;
                            if member(candidate_field, "owned") != Some(&Value::Bool(false))
                                && ref_eq(
                                    member(candidate_field, "ref").unwrap_or(&Value::Null),
                                    ref_value,
                                )
                            {
                                candidates.push((candidate_record, candidate_field));
                            }
                        }
                    }
                    if candidates.len() != 1 {
                        return Err(EngineError::new(
                            "INPUT",
                            Utf16::from(pointer.clone()),
                            "Ambiguous joined projection Field",
                        ));
                    }
                    candidates[0]
                };
                projection_resolved.push((field_owner, field));
                let fname = get_metered(field, "python", ctx)?.unwrap_or_default();
                let carrier = field_carrier(
                    field,
                    arr(member(field_owner, "fields").unwrap_or(&Value::Null)),
                    "row",
                    true,
                    ctx,
                )?;
                let nullable = member(member(field, "row").unwrap_or(&Value::Null), "null")
                    == Some(&Value::Bool(true))
                    || member(field_owner, "ref") != member(root, "ref");
                let missing = member(member(field, "row").unwrap_or(&Value::Null), "missing")
                    == Some(&Value::Bool(true));
                projection_model_fields.push(format!(
                    "    {fname}: Annotated[{carrier}, BeforeValidator({})]{}{}{}",
                    validator(field, "row", ctx)?,
                    if nullable { " | None" } else { "" },
                    if missing { " | MISSING" } else { "" },
                    if missing { " = MISSING" } else { "" }
                ));
                let fr = member(field, "ref").unwrap_or(&Value::Null);
                projection_fields.push(format!("FieldRef(source=UMF_GENERATED_SOURCE, module={}, element={}, field={}, field_module={}, logical_name={})",py(member(member(field_owner,"ref").unwrap_or(&Value::Null),"module").unwrap_or(&Value::Null),ctx)?,py(member(member(field_owner,"ref").unwrap_or(&Value::Null),"element").unwrap_or(&Value::Null),ctx)?,py(member(fr,"element").unwrap_or(&Value::Null),ctx)?,py(member(fr,"module").unwrap_or(&Value::Null),ctx)?,py(member(field,"logicalName").unwrap_or(&Value::Null),ctx)?));
                symbols.push(Value::Object(vec![
                    (
                        Utf16::from("sourceId"),
                        clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("pointer"),
                        clone_metered(member(field, "pointer").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("path"),
                        Value::String(Utf16::from(format!("{package}/models.py"))),
                    ),
                    (
                        Utf16::from("symbol"),
                        Value::String(Utf16::from(format!("{name}.{fname}"))),
                    ),
                    (
                        Utf16::from("role"),
                        Value::String(Utf16::from("projection")),
                    ),
                ]));
            }
            models.extend([
                "@final".into(),
                format!("class {name}(StrictModel):"),
                "    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE".into(),
                format!("    UMF_PROJECTION_OWNER: ClassVar[type[{element}]] = {element}"),
                "    @classmethod".into(),
                format!("    def _umf_projection_model(cls) -> type[{name}]:"),
                "        return cls".into(),
                format!(
                    "    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = ({},)",
                    projection_fields.join_metered(", ", ctx)?
                ),
            ]);
            models.extend(projection_model_fields);
            let field_names = projection_resolved
                .iter()
                .map(|(_, f)| {
                    Ok::<_, EngineError>(format!(
                        "({}, {}, {})",
                        py(
                            member(member(f, "ref").unwrap_or(&Value::Null), "module")
                                .unwrap_or(&Value::Null),
                            ctx
                        )?,
                        py(
                            member(member(f, "ref").unwrap_or(&Value::Null), "element")
                                .unwrap_or(&Value::Null),
                            ctx
                        )?,
                        quote(&get_metered(f, "python", ctx)?.unwrap_or_default(), ctx)?
                    ))
                })
                .collect::<Result<Vec<_>, _>>()?
                .join_metered(", ", ctx)?;
            models.extend([format!("    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = ({field_names},)"),format!("    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {}",quote(digest,ctx)?),format!("    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (\"umf_access\", {}, \"umf-access-runtime/0.1\")",quote(runtime,ctx)?),"    UMF_FINAL: ClassVar[bool] = True".into(),"".into()]);
            fields.push(format!(
                "{name}Projection: JoinProjection[{element}, {name}] = JoinProjection({name})"
            ));
            let codec_fields = projection_resolved
                .iter()
                .map(|(_, field)| {
                    codec_field(
                        field,
                        arr(member(root, "fields").unwrap_or(&Value::Null)),
                        &flattened_fields,
                        ctx,
                    )
                })
                .collect::<Result<Vec<_>, EngineError>>()?
                .join_metered(", ", ctx)?;
            codec.push(format!(
                "_codec_{name}: tuple[CodecField, ...] = ({codec_fields}{comma})",
                comma = if codec_fields.is_empty() { "" } else { "," }
            ));
            codec.push(format!(
                "def decode_{name}(columns: list[str], row: list[object]) -> {name}:"
            ));
            codec.push(format!(
                "    return decode_model({name}, columns, row, _codec_{name})"
            ));
            codec.push(String::new());
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(root, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/codecs.py"))),
                ),
                (
                    Utf16::from("symbol"),
                    Value::String(Utf16::from(format!("decode_{name}"))),
                ),
                (Utf16::from("role"), Value::String(Utf16::from("codec"))),
            ]));
            symbols.push(Value::Object(vec![
                (
                    Utf16::from("sourceId"),
                    clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("pointer"),
                    clone_metered(member(root, "pointer").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    Utf16::from("path"),
                    Value::String(Utf16::from(format!("{package}/models.py"))),
                ),
                (Utf16::from("symbol"), Value::String(Utf16::from(name))),
                (
                    Utf16::from("role"),
                    Value::String(Utf16::from("projection")),
                ),
            ]));
        }
    }
    let actions = arr(member(ir, "actions").unwrap_or(&Value::Null));
    if !actions.is_empty() {
        let mut lines=vec!["# SPDX-License-Identifier: MIT OR Apache-2.0".into(),"# Generated from pinned UMF inputs. Regenerate; do not edit.".into(),"from __future__ import annotations".into(),"from datetime import date, datetime".into(),"from decimal import Decimal".into(),"from typing import Annotated, ClassVar, Generic, Literal, Never, final, cast".into(),"from pydantic import BeforeValidator, TypeAdapter".into(),"from umf_access.types import MISSING, StrictModel, Vector, ActionRef, ActionSource, KeyTypeRef, RecordTypeRef".into(),"from umf_access.protocols import ActionExecutor, ReplayingActionExecutor, ActionEndpoint, ReplayingActionEndpoint, ActionRejected, Committed, OutcomeDetails, ExecutorT, ReplayingExecutorT".into(),"from umf_access.codec_support import seal_model, initialize_action_rejection".into(),"from .keys import *".into()];
        let selected_records = scan_filter(records, ctx, |r| {
            member(r, "selected") == Some(&Value::Bool(true))
        })?;
        for r in selected_records {
            lines.push(format!(
                "from .models import {}",
                get_metered(r, "python", ctx)?.unwrap_or_default()
            ));
        }
        for r in records {
            for field in arr(member(r, "fields").unwrap_or(&Value::Null)) {
                lines.push(format!(
                    "from .models import {}",
                    validator(field, "row", ctx)?
                ));
            }
        }
        lines.push(String::new());
        for action in actions {
            precharge_tree(action, ctx)?;
            let name = get_metered(action, "python", ctx)?.unwrap_or_default();
            for (suffix, key) in [("Input", "parameters"), ("Output", "outputs")] {
                lines.extend([
                    "@final".into(),
                    format!("class {name}{suffix}(StrictModel):"),
                ]);
                for p in arr(member(action, key).unwrap_or(&Value::Null)) {
                    precharge_tree(p, ctx)?;
                    let pname = get_metered(p, "python", ctx)?.unwrap_or_default();
                    let required = member(p, "required") == Some(&Value::Bool(true));
                    let typ = if let Some(target) = member(p, "entity") {
                        let record = scan_find(records, ctx, |r| {
                            ref_eq(member(r, "ref").unwrap_or(&Value::Null), target)
                        })?
                        .ok_or_else(|| {
                            EngineError::new("INPUT", Utf16::default(), "Missing entity record")
                        })?;
                        let key = scan_find(
                            arr(member(record, "keys").unwrap_or(&Value::Null)),
                            ctx,
                            |key| member(key, "id") == member(p, "entityKey"),
                        )?
                        .ok_or_else(|| {
                            EngineError::new("INPUT", Utf16::default(), "Missing entity Key")
                        })?;
                        key_name(record, key, ctx)?
                    } else if let Some(field) = member(p, "field") {
                        let mut owner_fields = &[][..];
                        'owner: for record in records {
                            ctx.charge_work(1, Utf16::default())?;
                            for candidate in arr(member(record, "fields").unwrap_or(&Value::Null)) {
                                ctx.charge_work(1, Utf16::default())?;
                                if member(candidate, "pointer") == member(field, "pointer")
                                    && member(candidate, "viewPointer")
                                        == member(field, "viewPointer")
                                {
                                    owner_fields =
                                        arr(member(record, "fields").unwrap_or(&Value::Null));
                                    break 'owner;
                                }
                            }
                        }
                        let carrier = field_carrier(field, owner_fields, "row", true, ctx)?;
                        let nullable = member(member(field, "row").unwrap_or(&Value::Null), "null")
                            == Some(&Value::Bool(true));
                        format!(
                            "Annotated[{carrier}, BeforeValidator({})]{}",
                            validator(field, "row", ctx)?,
                            if nullable { " | None" } else { "" }
                        )
                    } else {
                        "object".into()
                    };
                    lines.push(format!(
                        "    {pname}: {typ}{}{}",
                        if required { "" } else { " | MISSING" },
                        if required { "" } else { " = MISSING" }
                    ));
                }
                lines.extend([format!("    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {}",quote(digest,ctx)?),format!("    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (\"umf_access\", {}, \"umf-access-runtime/0.1\")",quote(runtime,ctx)?),"    UMF_FINAL: ClassVar[bool] = True".into(),String::new()]);
            }
            let output = if text_is(action, "kind", "recipe") {
                "None".to_owned()
            } else {
                format!("{name}Output")
            };
            let output_cls = if output == "None" {
                "type(None)".into()
            } else {
                output.clone()
            };
            let mut key_types = |member_name: &str| -> Result<Vec<String>, EngineError> {
                let mut out: Vec<String> = Vec::new();
                for reference in arr(member(action, member_name).unwrap_or(&Value::Null)) {
                    if let Some(record) = scan_find(records, ctx, |r| {
                        ref_eq(member(r, "ref").unwrap_or(&Value::Null), reference)
                    })? {
                        if let Some(key) = scan_find(
                            arr(member(record, "keys").unwrap_or(&Value::Null)),
                            ctx,
                            |k| member(k, "id") == member(reference, "key"),
                        )? {
                            let name = key_name(record, key, ctx)?;
                            let mut duplicate = false;
                            for existing in &out {
                                ctx.charge_work(
                                    existing.len().saturating_add(name.len()).saturating_add(1),
                                    Utf16::default(),
                                )?;
                                if existing == &name {
                                    duplicate = true;
                                    break;
                                }
                            }
                            if !duplicate {
                                ctx.charge_work(name.len(), Utf16::default())?;
                                out.push(name);
                            }
                        }
                    }
                }
                Ok(out)
            };
            let created = key_types("createdKeys")?;
            let changed = key_types("changedKeys")?;
            let typed = |names: &[String], ctx: &mut Context<'_>| -> Result<String, EngineError> {
                if names.is_empty() {
                    Ok("()".into())
                } else {
                    let joined = names.join_metered(" | ", ctx)?;
                    ctx.charge_work(7, Utf16::default())?;
                    Ok(format!("{joined}, ..."))
                }
            };
            lines.extend(["@final".into(),format!("class {name}Committed(Committed[{output}]):"),format!("    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {}",quote(digest,ctx)?),format!("    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (\"umf_access\", {}, \"umf-access-runtime/0.1\")",quote(runtime,ctx)?),format!("    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ({}{comma})",created.join_metered(", ",ctx)?,comma=if created.is_empty(){""}else{","}),format!("    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ({}{comma})",changed.join_metered(", ",ctx)?,comma=if changed.is_empty(){""}else{","}),"    @property".into(),format!("    def created(self) -> tuple[{}]:",typed(&created,ctx)?),format!("        return cast(tuple[{}], super().created)",typed(&created,ctx)?),"    @property".into(),format!("    def changed(self) -> tuple[{}]:",typed(&changed,ctx)?),format!("        return cast(tuple[{}], super().changed)",typed(&changed,ctx)?),String::new()]);
            let failures = arr(member(action, "failures").unwrap_or(&Value::Null));
            let mut codes = Vec::new();
            for failure in failures {
                ctx.charge_work(1, Utf16::default())?;
                if let Some(Value::String(code)) = member(failure, "code") {
                    ctx.charge_work(code.units().len(), Utf16::default())?;
                    codes.push(code.clone());
                }
            }
            let mut has_entity_missing = false;
            for code in &codes {
                ctx.charge_work(1, Utf16::default())?;
                if code
                    .units()
                    .iter()
                    .copied()
                    .eq("ENTITY_MISSING".encode_utf16())
                {
                    has_entity_missing = true;
                    break;
                }
            }
            if !has_entity_missing {
                ctx.charge_work(13, Utf16::default())?;
                codes.push(Utf16::from("ENTITY_MISSING"));
            }
            let mut unique = std::collections::BTreeSet::new();
            let mut deduplicated = Vec::new();
            for code in codes {
                ctx.charge_work(1, Utf16::default())?;
                ctx.charge_work(code.units().len(), Utf16::default())?;
                if unique.insert(code.clone()) {
                    deduplicated.push(code);
                }
            }
            let codes = deduplicated;
            let literal = codes
                .iter()
                .map(|c| crate::generation::python::string_literal(c, ctx))
                .collect::<Result<Vec<_>, _>>()?
                .join_metered(", ", ctx)?;
            let mut retry = String::from("{\"ENTITY_MISSING\": False");
            for f in failures {
                let Some(Value::String(code)) = member(f, "code") else {
                    continue;
                };
                let encoded_code = crate::generation::python::string_literal(code, ctx)?;
                ctx.charge_work(encoded_code.len().saturating_add(16), Utf16::default())?;
                retry.push_str(&format!(
                    ", {}: {}",
                    encoded_code,
                    if member(f, "retryable") == Some(&Value::Bool(true)) {
                        "True"
                    } else {
                        "False"
                    }
                ));
            }
            retry.push('}');
            lines.extend(["@final".into(),"@seal_model".into(),format!("class {name}Rejected(ActionRejected):"),format!("    code: Literal[{literal}]"),"    retryable: bool".into(),format!("    def __init__(self, code: Literal[{literal}], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:"),format!("        self.retryable = initialize_action_rejection(self, code, {retry}, retryable)"),"        super().__init__(code, self.retryable, original)".into(),String::new()]);
            let module = member(action, "module").unwrap_or(&Value::Null);
            let id = member(action, "id").unwrap_or(&Value::Null);
            let source_pointer = member(action, "pointer").unwrap_or(&Value::Null);
            let inputs = arr(member(action, "parameters").unwrap_or(&Value::Null));
            let input_fields = inputs
                .iter()
                .map(|p| {
                    Ok::<_, EngineError>(format!(
                        "({}, {})",
                        py(member(p, "id").unwrap_or(&Value::Null), ctx)?,
                        quote(&get_metered(p, "python", ctx)?.unwrap_or_default(), ctx)?
                    ))
                })
                .collect::<Result<Vec<_>, EngineError>>()?
                .join_metered(", ", ctx)?;
            let mut key_texts = Vec::new();
            for r in records {
                ctx.charge_work(1, Utf16::default())?;
                for k in arr(member(r, "keys").unwrap_or(&Value::Null)) {
                    precharge_tree(k, ctx)?;
                    key_texts.push(format!(
                        "KeyTypeRef({}, {}, {}, {})",
                        py(
                            member(member(r, "ref").unwrap_or(&Value::Null), "module")
                                .unwrap_or(&Value::Null),
                            ctx
                        )?,
                        py(
                            member(member(r, "ref").unwrap_or(&Value::Null), "element")
                                .unwrap_or(&Value::Null),
                            ctx
                        )?,
                        py(member(k, "id").unwrap_or(&Value::Null), ctx)?,
                        key_name(r, k, ctx)?
                    ));
                }
            }
            let keys = key_texts.join_metered(", ", ctx)?;
            let rec_types = scan_filter(records, ctx, |r| {
                member(r, "selected") == Some(&Value::Bool(true))
            })?
            .into_iter()
            .map(|r| {
                Ok::<_, EngineError>(format!(
                    "RecordTypeRef({}, {}, {})",
                    py(
                        member(member(r, "ref").unwrap_or(&Value::Null), "module")
                            .unwrap_or(&Value::Null),
                        ctx
                    )?,
                    py(
                        member(member(r, "ref").unwrap_or(&Value::Null), "element")
                            .unwrap_or(&Value::Null),
                        ctx
                    )?,
                    get_metered(r, "python", ctx)?.unwrap_or_default()
                ))
            })
            .collect::<Result<Vec<_>, EngineError>>()?
            .join_metered(", ", ctx)?;
            let input_comma = if inputs.is_empty() { "" } else { "," };
            lines.extend([format!("{name}: ActionRef[{name}Input, {output}] = ActionRef(module={}, action={}, input_type={name}Input, output_type={output_cls}, source=ActionSource(document_id={}, core_version=\"0.10.0\", module={}, action={}, document_sha256={}, action_pointer={}, invocation_id=\"umf.actions.tx\", invocation_version=\"1\"), input_fields=({input_fields}{input_comma}), key_types=({keys},), record_types=({rec_types},))",py(module,ctx)?,py(id,ctx)?,py(member(ir,"documentId").unwrap_or(&Value::Null),ctx)?,py(module,ctx)?,py(id,ctx)?,quote(document_digest,ctx)?,py(source_pointer,ctx)?),String::new()]);
            for (symbol, role) in [
                (format!("{name}Input"), "action-input"),
                (format!("{name}Output"), "action-output"),
                (format!("{name}Committed"), "action-committed"),
                (format!("{name}Rejected"), "action-failure"),
                (name.clone(), "action-ref"),
            ] {
                symbols.push(Value::Object(vec![
                    (
                        Utf16::from("sourceId"),
                        clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("pointer"),
                        clone_metered(member(action, "pointer").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        Utf16::from("path"),
                        Value::String(Utf16::from(format!("{package}/actions.py"))),
                    ),
                    (Utf16::from("symbol"), Value::String(Utf16::from(symbol))),
                    (Utf16::from("role"), Value::String(Utf16::from(role))),
                ]));
            }
        }
        for (client, endpoint_type, executor, ctor) in [
            ("Actions", "ActionEndpoint", "ExecutorT", "ActionEndpoint"),
            (
                "ReplayingActions",
                "ReplayingActionEndpoint",
                "ReplayingExecutorT",
                "ReplayingActionEndpoint",
            ),
        ] {
            ctx.charge_work(
                client
                    .len()
                    .saturating_add(executor.len())
                    .saturating_add(24),
                Utf16::default(),
            )?;
            lines.push(format!("class {client}(Generic[{executor}]):"));
            for action in actions {
                let name = get_metered(action, "python", ctx)?.unwrap_or_default();
                let endpoint = snake(&name, ctx)?;
                ctx.charge_work(
                    endpoint
                        .len()
                        .saturating_mul(2)
                        .saturating_add(name.len().saturating_mul(2))
                        .saturating_add(endpoint_type.len())
                        .saturating_add(executor.len())
                        .saturating_add(48),
                    Utf16::default(),
                )?;
                lines.push(format!(
                    "    {endpoint}: {endpoint_type}[{name}Input, {name}Committed, {executor}]"
                ));
            }
            ctx.charge_work(executor.len().saturating_add(40), Utf16::default())?;
            lines.push(format!(
                "    def __init__(self, executor: {executor}) -> None:"
            ));
            for action in actions {
                let name = get_metered(action, "python", ctx)?.unwrap_or_default();
                let endpoint = snake(&name, ctx)?;
                ctx.charge_work(
                    name.len()
                        .saturating_mul(2)
                        .saturating_add(endpoint.len())
                        .saturating_add(64),
                    Utf16::default(),
                )?;
                lines.push(format!(
                    "        self.{endpoint} = {ctor}(executor, {name}, {name}Rejected, {name}Committed)"
                ));
            }
            lines.push(String::new());
        }
        action_file = Some(lines);
    }
    let mut key_exports = Vec::new();
    for r in records {
        ctx.charge_work(1, Utf16::default())?;
        for k in arr(member(r, "keys").unwrap_or(&Value::Null)) {
            ctx.charge_work(1, Utf16::default())?;
            key_exports.push(Value::String(Utf16::from(key_name(r, k, ctx)?)));
        }
    }
    key_exports.push(Value::String(Utf16::from("BUNDLE_INPUT_DIGEST")));
    keys.push(format!(
        "__all__ = {}",
        py(&Value::Array(key_exports), ctx)?
    ));
    keys.push(String::new());
    for name in &projection_names {
        models.push(format!("{name}.model_rebuild()"));
    }
    let mut model_exports = Vec::new();
    for r in records {
        ctx.charge_work(1, Utf16::default())?;
        if member(r, "selected") == Some(&Value::Bool(false)) {
            continue;
        }
        let name = get_metered(r, "python", ctx)?.unwrap_or_default();
        model_exports.push(Value::String(Utf16::from(name.clone())));
        model_exports.push(Value::String(Utf16::from(format!("{name}Create"))));
        model_exports.push(Value::String(Utf16::from(format!("{name}Patch"))));
    }
    for name in &projection_names {
        ctx.charge_work(name.len(), Utf16::default())?;
        model_exports.push(Value::String(Utf16::from(name.clone())));
    }
    models.push(format!(
        "__all__ = {}",
        py(&Value::Array(model_exports), ctx)?
    ));
    let mut init: Vec<String> = vec![
        "# SPDX-License-Identifier: MIT OR Apache-2.0".into(),
        "# Generated from pinned UMF inputs. Regenerate; do not edit.".into(),
        "from __future__ import annotations".into(),
        "from umf_access.types import MISSING as MISSING".into(),
        "from .models import *".into(),
        "from .models import UMF_GENERATED_SOURCE".into(),
        "from .keys import *".into(),
        "from . import fields as _fields".into(),
    ];
    init.extend(
        projection_names
            .iter()
            .map(|name| format!("from .fields import {name}Projection")),
    );
    let mut files = vec![
        (
            "models.py".into(),
            render_lines(&models, true, "/files/models.py", ctx)?,
        ),
        (
            "keys.py".into(),
            render_lines(&keys, true, "/files/keys.py", ctx)?,
        ),
        (
            "fields.py".into(),
            render_lines(&fields, true, "/files/fields.py", ctx)?,
        ),
        (
            "codecs.py".into(),
            render_lines(&codec, true, "/files/codecs.py", ctx)?,
        ),
        (
            "__init__.py".into(),
            render_lines(&init, false, "/files/__init__.py", ctx)?,
        ),
        ("py.typed".into(), Utf16::from("\n")),
    ];
    if let Some(lines) = action_file {
        init.push("from .actions import *".into());
        if let Some((_, text)) = files.iter_mut().find(|(path, _)| path == "__init__.py") {
            *text = render_lines(&init, false, "/files/__init__.py", ctx)?;
        }
        files.push((
            "actions.py".into(),
            render_lines(&lines, true, "/files/actions.py", ctx)?,
        ));
    }
    symbols.push(Value::Object(vec![
        (
            Utf16::from("sourceId"),
            clone_metered(member(ir, "sourceId").unwrap_or(&Value::Null), ctx)?,
        ),
        (Utf16::from("pointer"), Value::String(Utf16::default())),
        (
            Utf16::from("path"),
            Value::String(Utf16::from(format!("{package}/keys.py"))),
        ),
        (
            Utf16::from("symbol"),
            Value::String(Utf16::from("BUNDLE_INPUT_DIGEST")),
        ),
        (Utf16::from("role"), Value::String(Utf16::from("key"))),
    ]));
    sort_symbols(&mut symbols, ctx)?;
    let _ = &mut fields;
    Ok(Emitted { files, symbols })
}

#[cfg(test)]
mod emitter_control_tests {
    use super::*;
    fn fields(count: usize, cardinality: &str) -> Vec<Value> {
        (0..count)
            .map(|index| {
                let mut values = vec![
                    (
                        Utf16::from("pointer"),
                        Value::String(Utf16::from(format!("/field/{index}"))),
                    ),
                    (
                        Utf16::from("python"),
                        Value::String(Utf16::from(format!("f{index}"))),
                    ),
                    (
                        Utf16::from("ref"),
                        Value::Object(vec![
                            (Utf16::from("module"), Value::String(Utf16::from("m"))),
                            (
                                Utf16::from("element"),
                                Value::String(Utf16::from(format!("f{index}"))),
                            ),
                        ]),
                    ),
                    (
                        Utf16::from("scalarType"),
                        Value::String(Utf16::from("string")),
                    ),
                    (
                        Utf16::from("cardinality"),
                        Value::String(Utf16::from(cardinality)),
                    ),
                ];
                if index + 1 < count {
                    values.push((
                        Utf16::from("item"),
                        Value::Object(vec![
                            (Utf16::from("module"), Value::String(Utf16::from("m"))),
                            (
                                Utf16::from("element"),
                                Value::String(Utf16::from(format!("f{}", index + 1))),
                            ),
                        ]),
                    ));
                }
                Value::Object(values)
            })
            .collect()
    }
    #[test]
    fn carrier_search_and_codec_follow_control_inside_graph() {
        let values = fields(80, "map");
        let refs = values.iter().collect::<Vec<_>>();
        for codec in [false, true] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 20 {
                    Err(EngineError::new(
                        "NUMBER",
                        Utf16::from("/host"),
                        "late injected meter failure",
                    ))
                } else {
                    Ok(())
                }
            };
            let mut ctx = Context::ordinary().with_meter(&mut meter);
            let error = if codec {
                codec_field(&values[0], &values, &refs, &mut ctx)
            } else {
                field_carrier(&values[0], &values, "row", true, &mut ctx)
            }
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, "NUMBER");
            assert_eq!(error.path, Utf16::from("/host"));
        }
    }
    #[test]
    fn expanded_array_carrier_refuses_before_oversized_allocation() {
        let values = fields(40, "array");
        let error =
            field_carrier(&values[0], &values, "row", true, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "LIMIT");
    }
    #[test]
    fn child_first_validator_order_and_codec_render_are_iterative() {
        let values = fields(160, "map");
        let ordered = ordered_fields(
            &values,
            &mut std::collections::BTreeSet::new(),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            member(ordered[0], "pointer"),
            member(&values[159], "pointer")
        );
        assert_eq!(ordered.len(), 160);
        let refs = values.iter().collect::<Vec<_>>();
        let text = codec_field(&values[0], &values, &refs, &mut Context::ordinary()).unwrap();
        assert_eq!(text.matches("\"item\":").count(), 160);
        assert!(text.contains("\"kind\": \"identity\", \"item\": None"));
    }
    #[test]
    fn render_lines_late_meter_errors_keep_their_original_origin() {
        let lines = (0..80).map(|i| format!("line {i}")).collect::<Vec<_>>();
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 25 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/meter"),
                        "injected host-looking failure",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = render_lines(
                &lines,
                true,
                "/files/control.py",
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/meter"));
        }
    }
    #[test]
    fn symbol_sort_polls_late_and_preserves_control_error_origin() {
        let symbols = (0..64)
            .rev()
            .map(|index| {
                Value::Object(vec![
                    (
                        Utf16::from("pointer"),
                        Value::String(Utf16::from(format!("/records/{index}"))),
                    ),
                    (Utf16::from("role"), Value::String(Utf16::from("fields"))),
                    (
                        Utf16::from("symbol"),
                        Value::String(Utf16::from(format!("Record{index}"))),
                    ),
                ])
            })
            .collect::<Vec<_>>();
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 100 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/symbol-sort"),
                        "injected sort comparison failure",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = sort_symbols(
                &mut symbols.clone(),
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/symbol-sort"));
        }
    }
    #[test]
    fn raw_utf16_key_id_survives_python_literal_emission() {
        let raw = Utf16::new(vec![0x61, 0xd800]);
        let key = Value::Object(vec![(Utf16::from("id"), Value::String(raw.clone()))]);
        let record = Value::Object(vec![
            (Utf16::from("python"), Value::String(Utf16::from("Order"))),
            (
                Utf16::from("keys"),
                Value::Array(vec![Value::Object(vec![(
                    Utf16::from("id"),
                    Value::String(Utf16::from("primary")),
                )])]),
            ),
        ]);
        let mut ctx = Context::ordinary();
        assert!(key_name(&record, &key, &mut ctx)
            .unwrap()
            .starts_with("Order"));
        let literal = crate::generation::python::string_literal(&raw, &mut ctx).unwrap();
        assert!(literal.contains("\\ud800"));
    }
}
