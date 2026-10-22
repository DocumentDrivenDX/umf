// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded row-scope authoring normalization.
//!
//! The host supplies every binding used to interpret the compact authoring
//! form. Unknown source members are retained in `source` and diagnosed.

use crate::{
    resources::CodegenEngine,
    value::{admit_json, array_items, member, string_member},
};
use umf_core::{Context, EngineError, Utf16, Value};

fn s(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn o(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn arr(items: Vec<Value>) -> Value {
    Value::Array(items)
}
fn diagnostic(code: &str, path: &str, message: &str) -> Value {
    o(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
    ])
}
fn diagnostic_at(code: &str, path: Utf16, message: &str) -> Value {
    o(vec![
        ("code", s(code)),
        ("path", Value::String(path)),
        ("message", s(message)),
    ])
}
fn source_json_refusal() -> Value {
    o(vec![
        ("valid", Value::Bool(false)),
        (
            "diagnostics",
            arr(vec![diagnostic(
                "ROW_SCOPE_JSON",
                "/row_scope",
                "Source is not faithfully JSON-compatible; no source content was read or interpreted",
            )]),
        ),
        ("sourceToOutput", o(vec![])),
    ])
}
fn is_object(v: &Value) -> bool {
    matches!(v, Value::Object(_))
}
fn eqstr(v: &Value, text: &str) -> bool {
    matches!(v,Value::String(s) if s==&Utf16::from(text))
}
fn escaped_pointer(text: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(text.len());
    for unit in text.units() {
        match *unit {
            0x007e => out.extend([0x007e, 0x0030]),
            0x002f => out.extend([0x007e, 0x0031]),
            other => out.push(other),
        }
    }
    Utf16::new(out)
}
fn appended_component(base: &str, component: &Utf16) -> Utf16 {
    let mut units = Utf16::from(base).into_units();
    units.push(b'/' as u16);
    units.extend(escaped_pointer(component).into_units());
    Utf16::new(units)
}
fn command_name(value: &Utf16) -> Option<&'static str> {
    ["select", "insert", "update", "delete"]
        .into_iter()
        .find(|command| value == &Utf16::from(*command))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::Number(n) => *n != 0.0 && !n.is_nan(),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn member16<'a>(value: &'a Value, key: &Utf16) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value)
    } else {
        None
    }
}
#[derive(Clone, Copy)]
struct NonJsonProperty {
    suffix: &'static str,
    message: &'static str,
}
struct JsonProperty {
    value: Value,
    non_json: Option<NonJsonProperty>,
}
/// JSON objects still have the predecessor's ordinary JavaScript property
/// lookup behavior. Native prototype functions remain inert: only their
/// truthiness is carried, and a reached policy copy refuses them as NON_JSON.
fn js_property(
    value: &Value,
    key: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<JsonProperty>, EngineError> {
    ctx.charge_work(
        key.len().saturating_mul(128).saturating_add(16),
        Utf16::default(),
    )?;
    let ordinary = |value| JsonProperty {
        value,
        non_json: None,
    };
    if let Some(value) = member16(value, key) {
        return Ok(Some(ordinary(copied(value, ctx)?)));
    }
    let units = key.units();
    let mut index = 0usize;
    let is_index = !units.is_empty()
        && units.len() <= 10
        && (units.len() == 1 || units[0] != 48)
        && units.iter().all(|u| (48..=57).contains(u));
    if is_index {
        for u in units {
            index = index
                .saturating_mul(10)
                .saturating_add(usize::from(*u - 48));
        }
    }
    if key == &Utf16::from("length") {
        let length = match value {
            Value::Array(v) => Some(v.len()),
            Value::String(v) => Some(v.len()),
            _ => None,
        };
        if let Some(length) = length {
            return Ok(Some(ordinary(Value::Number(length as f64))));
        }
    }
    if is_index {
        match value {
            Value::Array(values) if index < values.len() => {
                return Ok(Some(ordinary(copied(&values[index], ctx)?)))
            }
            Value::String(text) if index < text.len() => {
                return Ok(Some(ordinary(Value::String(Utf16::new(vec![
                    text.units()[index],
                ])))))
            }
            _ => {}
        }
    }
    if value == &Value::Null {
        return Ok(None);
    }
    if key == &Utf16::from("__proto__") {
        let (suffix, message) = match value {
            Value::Array(_) => ("", "Custom object prototype"),
            Value::String(_) => (
                "/length",
                "Hidden fields and accessors cannot be serialized faithfully",
            ),
            Value::Number(_) => (
                "/toLocaleString",
                "Hidden fields and accessors cannot be serialized faithfully",
            ),
            _ => (
                "/toString",
                "Hidden fields and accessors cannot be serialized faithfully",
            ),
        };
        return Ok(Some(JsonProperty {
            value: Value::Bool(true),
            non_json: Some(NonJsonProperty { suffix, message }),
        }));
    }
    let object_methods = "toString toLocaleString valueOf hasOwnProperty propertyIsEnumerable isPrototypeOf __defineGetter__ __defineSetter__ __lookupGetter__ __lookupSetter__ constructor";
    let extra = match value {
        Value::Array(_) => "values concat fill join pop push reverse shift slice sort splice unshift every forEach some indexOf lastIndexOf filter flat flatMap reduce reduceRight map keys entries find findLast findIndex findLastIndex includes copyWithin at toReversed toSorted toSpliced with",
        Value::String(_) => "anchor big bold blink fixed fontcolor fontsize italics link small strike sub sup charAt charCodeAt codePointAt concat indexOf lastIndexOf replace replaceAll repeat padStart padEnd slice substr at substring toLowerCase toUpperCase localeCompare toLocaleLowerCase toLocaleUpperCase trim startsWith endsWith includes match search matchAll split normalize trimStart trimLeft trimEnd trimRight isWellFormed toWellFormed",
        Value::Number(_) => "toFixed toExponential toPrecision",
        _ => "",
    };
    if object_methods
        .split(' ')
        .chain(extra.split(' '))
        .any(|name| !name.is_empty() && key == &Utf16::from(name))
    {
        return Ok(Some(JsonProperty {
            value: Value::Bool(true),
            non_json: Some(NonJsonProperty {
                suffix: "",
                message: "Value is not JSON-compatible",
            }),
        }));
    }
    Ok(None)
}

/// Compare two JSON pointers in the admitted object's actual value traversal
/// order. Native inherited values have no core Value node; a later structural
/// refusal must not replace the earlier NON_JSON refusal at that location.
fn pointer_precedes(
    value: &Value,
    left: &Utf16,
    right: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(
        left.len().saturating_add(right.len()).saturating_mul(4),
        Utf16::default(),
    )?;
    let parts = |path: &Utf16| {
        path.units()
            .split(|u| *u == 47)
            .skip(1)
            .map(|part| {
                let mut out = Vec::new();
                let mut i = 0;
                while i < part.len() {
                    if part[i] == 126 && i + 1 < part.len() && matches!(part[i + 1], 48 | 49) {
                        out.push(if part[i + 1] == 48 { 126 } else { 47 });
                        i += 2;
                    } else {
                        out.push(part[i]);
                        i += 1;
                    }
                }
                Utf16::new(out)
            })
            .collect::<Vec<_>>()
    };
    let left = parts(left);
    let right = parts(right);
    let mut current = value;
    for (l, r) in left.iter().zip(&right) {
        ctx.charge_work(1, Utf16::default())?;
        if l != r {
            return Ok(match current {
                Value::Array(_) => {
                    l.to_utf8().ok().and_then(|n| n.parse::<usize>().ok())
                        < r.to_utf8().ok().and_then(|n| n.parse::<usize>().ok())
                }
                Value::Object(_) => {
                    let mut first = None;
                    for (key, _) in crate::value::js_object_members(current, ctx)? {
                        ctx.charge_work(
                            key.len().saturating_add(l.len()).saturating_add(r.len()),
                            Utf16::default(),
                        )?;
                        if key == l {
                            first = Some(true);
                            break;
                        }
                        if key == r {
                            first = Some(false);
                            break;
                        }
                    }
                    first.unwrap_or(false)
                }
                _ => false,
            });
        }
        current = match current {
            Value::Array(values) => l
                .to_utf8()
                .ok()
                .and_then(|n| n.parse::<usize>().ok())
                .and_then(|i| values.get(i))
                .unwrap_or(&Value::Null),
            Value::Object(fields) => fields
                .iter()
                .find(|(key, _)| key == l)
                .map(|(_, v)| v)
                .unwrap_or(&Value::Null),
            _ => &Value::Null,
        };
    }
    Ok(left.len() <= right.len())
}

fn js_strict_equal(left: Option<&Value>, right: Option<&Value>) -> bool {
    match (left, right) {
        (None, None) | (Some(Value::Null), Some(Value::Null)) => true,
        (Some(Value::Bool(a)), Some(Value::Bool(b))) => a == b,
        (Some(Value::Number(a)), Some(Value::Number(b))) => a == b,
        (Some(Value::String(a)), Some(Value::String(b))) => a == b,
        _ => false,
    }
}
fn js_error_description(
    value: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    Ok(match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Object(_)) => "an instance of Object".into(),
        Some(Value::Array(_)) => "an instance of Array".into(),
        Some(value) => umf_core::serialization::stringify_compact_metered(value, ctx)?
            .to_utf8()
            .map_err(|_| EngineError::new("INPUT", Utf16::default(), "Invalid Unicode"))?,
    })
}

fn charge_tree(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::String(s) => ctx.charge_work(s.len().saturating_add(1), Utf16::default()),
        Value::Array(items) => {
            ctx.charge_work(items.len().saturating_add(1), Utf16::default())?;
            for item in items {
                charge_tree(item, ctx)?;
            }
            Ok(())
        }
        Value::Object(fields) => {
            ctx.charge_work(fields.len().saturating_add(1), Utf16::default())?;
            for (key, item) in fields {
                ctx.charge_work(key.len(), Utf16::default())?;
                charge_tree(item, ctx)?;
            }
            Ok(())
        }
        _ => ctx.charge_work(1, Utf16::default()),
    }
}
/// JSON text cannot use fewer UTF-8 bytes than its serialized UTF-16 units.
/// Detect the deployment source ceiling before allocating an oversized string;
/// the deployment compiler still performs its exact UTF-8 check below it.
fn serialized_text_exceeds(
    value: &Value,
    limit: usize,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    fn string_units(
        text: &Utf16,
        total: &mut usize,
        limit: usize,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        *total = total.saturating_add(2);
        let mut i = 0;
        let mut poll_at = 0;
        while i < text.len() {
            if i >= poll_at {
                ctx.charge_work(1024.min(text.len() - i), Utf16::default())?;
                poll_at = i.saturating_add(1024);
            }
            let u = text.units()[i];
            let units = match u {
                34 | 92 | 8 | 9 | 10 | 12 | 13 => 2,
                0..=31 => 6,
                0xd800..=0xdbff
                    if text
                        .units()
                        .get(i + 1)
                        .is_some_and(|u| (0xdc00..=0xdfff).contains(u)) =>
                {
                    i += 1;
                    2
                }
                0xd800..=0xdfff => 6,
                _ => 1,
            };
            *total = total.saturating_add(units);
            if *total > limit {
                return Ok(true);
            }
            i += 1;
        }
        Ok(*total > limit)
    }
    ctx.charge_work(1, Utf16::default())?;
    let mut pending = vec![value];
    let mut total = 0usize;
    while let Some(value) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::String(text) => {
                if string_units(text, &mut total, limit, ctx)? {
                    return Ok(true);
                }
            }
            Value::Array(items) => {
                total = total.saturating_add(2 + items.len().saturating_sub(1));
                ctx.charge_work(items.len(), Utf16::default())?;
                pending.extend(items);
            }
            Value::Object(fields) => {
                total = total.saturating_add(2 + fields.len() + fields.len().saturating_sub(1));
                ctx.charge_work(fields.len(), Utf16::default())?;
                for (key, value) in fields {
                    if string_units(key, &mut total, limit, ctx)? {
                        return Ok(true);
                    }
                    pending.push(value);
                }
            }
            Value::Number(n) => {
                ctx.charge_work(32, Utf16::default())?;
                total = total.saturating_add(umf_core::ecma_number_to_string(*n).len());
            }
            Value::Bool(true) | Value::Null => total = total.saturating_add(4),
            Value::Bool(false) => total = total.saturating_add(5),
        }
        if total > limit {
            return Ok(true);
        }
    }
    Ok(false)
}

fn copied(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    charge_tree(value, ctx)?;
    Ok(value.clone())
}
fn field_ref(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copied(value, ctx)
}

fn rule(kind: &str) -> Value {
    o(vec![("kind", s(kind))])
}
fn rule_with(kind: &str, key: &str, value: Value) -> Value {
    o(vec![("kind", s(kind)), (key, value)])
}

impl CodegenEngine<'_> {
    /// Normalize `{input, context}` row-scope authoring into native policy
    /// vocabulary. Context bindings are trusted host data; source text never
    /// supplies a field or role reference by itself.
    pub fn normalize_row_scope(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let request = match admit_json(request, ctx) {
            Ok(value) => value,
            Err(error)
                if !error.is_control_failure()
                    && [
                        "INPUT",
                        "LIMIT",
                        "NUMBER",
                        "DUPLICATE_KEY",
                        "NON_JSON",
                        "VALUE_INVALID",
                    ]
                    .contains(&error.code.as_str())
                    && error
                        .path
                        .to_utf8()
                        .is_ok_and(|path| path == "/input" || path.starts_with("/input/")) =>
            {
                return Ok(source_json_refusal());
            }
            Err(error) => return Err(error),
        };
        let Some(source) = member(&request, "input") else {
            return Ok(source_json_refusal());
        };
        let source = copied(source, ctx)?;
        let context = member(&request, "context").unwrap_or(&Value::Null);
        let mut diagnostics = Vec::new();
        let mut mapping: Vec<(Utf16, Value)> = Vec::new();
        let map = |mapping: &mut Vec<(Utf16, Value)>, from: String, to: String| {
            let key = Utf16::from(from);
            if let Some((_, targets)) = mapping.iter_mut().find(|(k, _)| *k == key) {
                if let Value::Array(a) = targets {
                    if !a.iter().any(|v| eqstr(v, &to)) {
                        a.push(s(&to));
                    }
                }
            } else {
                mapping.push((key, arr(vec![s(&to)])));
            }
        };
        let wrapped =
            is_object(&source) && is_object(member(&source, "row_scope").unwrap_or(&Value::Null));
        let block = if wrapped {
            member(&source, "row_scope").unwrap()
        } else {
            &source
        };
        if wrapped {
            if matches!(&source, Value::Object(_)) {
                for (key, _) in crate::value::js_object_members(&source, ctx)? {
                    ctx.charge_work(128, Utf16::default())?;
                    ctx.charge_work(128, Utf16::default())?;
                    if key != &Utf16::from("row_scope") {
                        diagnostics.push(diagnostic_at(
                            "ROW_SCOPE_UNKNOWN",
                            appended_component("", key),
                            "Unknown source content is retained and not interpreted",
                        ));
                    }
                }
            }
        }
        if !is_object(block) {
            diagnostics.push(diagnostic(
                "ROW_SCOPE_SHAPE",
                "/row_scope",
                "Expected a row_scope object",
            ));
            return Ok(o(vec![
                ("valid", Value::Bool(false)),
                ("source", source),
                ("diagnostics", arr(diagnostics)),
                ("sourceToOutput", Value::Object(mapping)),
            ]));
        }
        let base = if wrapped { "/row_scope" } else { "" };
        let allowed = [
            "owner_column",
            "commands",
            "via",
            "batch",
            "groups",
            "open_reference_read",
        ];
        if matches!(block, Value::Object(_)) {
            for (key, _) in crate::value::js_object_members(block, ctx)? {
                ctx.charge_work(key.len().saturating_add(256), Utf16::default())?;
                let name = key.to_utf8().ok();
                if name.as_deref().is_none_or(|name| !allowed.contains(&name)) {
                    diagnostics.push(diagnostic_at(
                        "ROW_SCOPE_UNKNOWN",
                        appended_component(base, key),
                        "Unknown row_scope content is retained and not interpreted",
                    ));
                }
            }
        }
        let mut origins: Vec<String> = Vec::new();
        let mut non_json_origins = std::collections::BTreeMap::new();
        let owner = string_member(block, "owner_column");
        let owner_field = if let Some(name) = owner {
            let columns = member(context, "ownerColumns");
            if columns.is_none() || columns == Some(&Value::Null) {
                let prefix = if columns.is_none() {
                    "undefined"
                } else {
                    "null"
                };
                return Err(EngineError::new(
                    "ROW_SCOPE_FAILED",
                    Utf16::default(),
                    format!(
                        "{prefix} is not an object (evaluating 'context.ownerColumns[ownerName]')"
                    ),
                ));
            }
            js_property(columns.unwrap(), name, ctx)?
        } else {
            None
        };
        if member(block, "owner_column").is_some()
            && owner_field
                .as_ref()
                .is_none_or(|property| !truthy(&property.value))
        {
            diagnostics.push(diagnostic(
                "ROW_SCOPE_OWNER",
                &format!("{}/owner_column", base),
                "Owner column must resolve to an exact current-Record Field binding",
            ));
        }
        if let Some(info) = owner_field.as_ref().and_then(|property| property.non_json) {
            non_json_origins.insert(format!("{base}/owner_column"), ("/field", info));
        }
        let owner_rule = match owner_field.as_ref() {
            Some(f) if truthy(&f.value) => {
                Some(rule_with("owner", "field", field_ref(&f.value, ctx)?))
            }
            _ => None,
        };
        if let (Some(name), Some(_r)) = (owner, owner_rule.as_ref()) {
            let _ = name;
            origins.push(format!("{}/owner_column", base));
        }
        let commands = parse_commands(
            member(block, "commands"),
            &format!("{}/commands", base),
            true,
            &mut diagnostics,
            ctx,
        )?;
        let batch_commands = parse_commands(
            member(block, "batch"),
            &format!("{}/batch", base),
            true,
            &mut diagnostics,
            ctx,
        )?;
        let mut via_rules = Vec::new();
        if let Some(via) = member(block, "via") {
            if let Some(items) = array_items(via) {
                for (i, item) in items.iter().enumerate() {
                    ctx.charge_work(128, Utf16::default())?;
                    ctx.charge_work(128, Utf16::default())?;
                    let path = format!("{}/via/{}", base, i);
                    let table = string_member(item, "table");
                    let person = string_member(item, "person_column");
                    let key = string_member(item, "key_column");
                    if table.is_none() || person.is_none() || key.is_none() {
                        diagnostics.push(diagnostic(
                            "ROW_SCOPE_VIA",
                            &path,
                            "Via declaration requires table, person_column and key_column",
                        ));
                        continue;
                    }
                    if matches!(item, Value::Object(_)) {
                        for (k, _) in crate::value::js_object_members(item, ctx)? {
                            ctx.charge_work(128, Utf16::default())?;
                            ctx.charge_work(128, Utf16::default())?;
                            let n = k.to_utf8().ok();
                            if n.as_deref().is_none_or(|n| {
                                !["table", "person_column", "key_column"].contains(&n)
                            }) {
                                diagnostics.push(diagnostic_at(
                                    "ROW_SCOPE_UNKNOWN",
                                    appended_component(&path, k),
                                    "Unknown via content is retained and not interpreted",
                                ));
                            }
                        }
                    }
                    let via_context = member(context, "via");
                    let bindings = match via_context {
                        Some(Value::Array(bindings)) => bindings,
                        None | Some(Value::Null) => {
                            let prefix = if via_context.is_none() {
                                "undefined"
                            } else {
                                "null"
                            };
                            return Err(EngineError::new(
                                "ROW_SCOPE_FAILED",
                                Utf16::default(),
                                format!(
                                    "{prefix} is not an object (evaluating 'context.via.filter')"
                                ),
                            ));
                        }
                        Some(value) => {
                            let description = js_error_description(member(value, "filter"), ctx)?;
                            return Err(EngineError::new("ROW_SCOPE_FAILED", Utf16::default(),
                                format!("context.via.filter is not a function. (In 'context.via.filter((b) => b.name === item.table)', 'context.via.filter' is {description})")));
                        }
                    };
                    ctx.charge_work(bindings.len(), Utf16::default())?;
                    let mut matches = Vec::new();
                    for binding in bindings {
                        ctx.charge_work(1, Utf16::default())?;
                        if binding == &Value::Null {
                            return Err(EngineError::new(
                                "ROW_SCOPE_FAILED",
                                Utf16::default(),
                                "null is not an object (evaluating 'b.name')",
                            ));
                        }
                        if string_member(binding, "name") == table {
                            matches.push(binding);
                        }
                    }
                    if matches.len() != 1 {
                        diagnostics.push(diagnostic(
                            "ROW_SCOPE_VIA_BINDING",
                            &format!("{}/table", path),
                            "Via table must resolve to exactly one host-supplied binding",
                        ));
                        continue;
                    }
                    let b = matches[0];
                    if string_member(b, "personColumnName") != person
                        || string_member(b, "keyColumnName") != key
                    {
                        diagnostics.push(diagnostic("ROW_SCOPE_VIA_FIELDS",&path,"Via field names do not match the exact host-supplied source/target pair"));
                        continue;
                    }
                    let related = o(vec![
                        ("kind", s("related")),
                        (
                            "record",
                            field_ref(member(b, "record").unwrap_or(&Value::Null), ctx)?,
                        ),
                        (
                            "matches",
                            arr(vec![o(vec![
                                (
                                    "source",
                                    field_ref(
                                        member(b, "sourceField").unwrap_or(&Value::Null),
                                        ctx,
                                    )?,
                                ),
                                (
                                    "target",
                                    field_ref(member(b, "keyField").unwrap_or(&Value::Null), ctx)?,
                                ),
                            ])]),
                        ),
                        (
                            "rule",
                            rule_with(
                                "owner",
                                "field",
                                field_ref(member(b, "personField").unwrap_or(&Value::Null), ctx)?,
                            ),
                        ),
                    ]);
                    via_rules.push((path, related));
                }
            } else {
                diagnostics.push(diagnostic(
                    "ROW_SCOPE_VIA",
                    &format!("{}/via", base),
                    "Expected a list of explicit via declarations",
                ));
            }
        }
        let person_base = if via_rules.is_empty() {
            match owner_rule.as_ref() {
                Some(value) => copied(value, ctx)?,
                None => rule("deny"),
            }
        } else {
            let mut rules = Vec::new();
            if let Some(r) = owner_rule.as_ref() {
                rules.push(copied(r, ctx)?);
            }
            for (_, value) in &via_rules {
                rules.push(copied(value, ctx)?);
            }
            rule_with("any", "rules", arr(rules))
        };
        let open =
            member(block, "open_reference_read").is_some_and(|v| matches!(v, Value::Bool(true)));
        if let Some(v) = member(block, "open_reference_read") {
            if !matches!(v, Value::Bool(_)) {
                diagnostics.push(diagnostic(
                    "ROW_SCOPE_OPEN_READ",
                    &format!("{}/open_reference_read", base),
                    "Expected a boolean",
                ));
            }
        }
        if open && !member(context, "openReferenceRead").is_some_and(truthy) {
            diagnostics.push(diagnostic("ROW_SCOPE_OPEN_READ_BINDING",&format!("{}/open_reference_read",base),"Open read requires an explicit host declaration that this is a public reference table"));
        }
        let mut occurrence_paths: Vec<(&str, Vec<(String, String)>)> = Vec::new();
        let mut person = Vec::new();
        let mut batch = Vec::new();
        for command in ["select", "insert", "update", "delete"] {
            ctx.charge_work(128, Utf16::default())?;
            let p = if open
                && member(context, "openReferenceRead").is_some_and(truthy)
                && command == "select"
                && commands.iter().any(|x| *x == command)
            {
                rule("allow")
            } else if commands.iter().any(|x| *x == command) {
                copied(&person_base, ctx)?
            } else {
                rule("deny")
            };
            let b = if batch_commands.iter().any(|x| *x == command) {
                rule("allow")
            } else {
                rule("deny")
            };
            let mut paths = Vec::new();
            if commands.contains(&command)
                && !(open
                    && member(context, "openReferenceRead").is_some_and(truthy)
                    && command == "select")
            {
                if owner_rule.is_some() {
                    paths.push((
                        format!("{base}/owner_column"),
                        if via_rules.is_empty() {
                            String::new()
                        } else {
                            "/rules/0".into()
                        },
                    ));
                }
                for (i, (from, _)) in via_rules.iter().enumerate() {
                    ctx.charge_work(1, Utf16::default())?;
                    paths.push((
                        from.clone(),
                        format!("/rules/{}", i + usize::from(owner_rule.is_some())),
                    ));
                }
            }
            occurrence_paths.push((command, paths));
            person.push((Utf16::from(command), p));
            batch.push((Utf16::from(command), b));
        }
        for cmd in &commands {
            ctx.charge_work(128, Utf16::default())?;
            let i = first_command_index(member(block, "commands"), cmd).unwrap_or(0);
            map(
                &mut mapping,
                format!("{}/commands/{}", base, i),
                format!("/policy/person/{}", cmd),
            );
        }
        for cmd in &batch_commands {
            ctx.charge_work(128, Utf16::default())?;
            let i = first_command_index(member(block, "batch"), cmd).unwrap_or(0);
            map(
                &mut mapping,
                format!("{}/batch/{}", base, i),
                format!("/policy/batch/{}", cmd),
            );
        }
        if open
            && member(context, "openReferenceRead").is_some_and(truthy)
            && commands.iter().any(|x| *x == "select")
        {
            map(
                &mut mapping,
                format!("{}/open_reference_read", base),
                "/policy/person/select".into(),
            );
        }
        // Group aliases are host-authorized role names, and can only decorate
        // commands already enabled by the person command subset.
        // Each `any` wrapper adds an object and a rules-array level. Keeping
        // 64 wrappers already exceeds ordinary depth128 admission once the
        // policy's person/command ancestors are included. Omitted outer
        // wrappers have the identical rules/0 prefix up to that first limit;
        // no omitted role can be inspected or published. Provenance still
        // follows every source occurrence below.
        const MAX_MATERIALIZED_GROUP_WRAPPERS: usize = 64;
        let mut materialized_groups = [0usize; 4];
        if let Some(groups) = member(block, "groups") {
            if let Some(items) = array_items(groups) {
                for (i, item) in items.iter().enumerate() {
                    let path = format!("{}/groups/{}", base, i);
                    let name = string_member(item, "name");
                    let list = member(item, "commands");
                    if name.is_none() || array_items(list.unwrap_or(&Value::Null)).is_none() {
                        diagnostics.push(diagnostic(
                            "ROW_SCOPE_GROUP",
                            &path,
                            "Group grant requires name and commands",
                        ));
                        continue;
                    }
                    if matches!(item, Value::Object(_)) {
                        for (k, _) in crate::value::js_object_members(item, ctx)? {
                            ctx.charge_work(k.len().saturating_add(256), Utf16::default())?;
                            let n = k.to_utf8().ok();
                            if n.as_deref()
                                .is_none_or(|n| !["name", "commands"].contains(&n))
                            {
                                diagnostics.push(diagnostic_at(
                                    "ROW_SCOPE_UNKNOWN",
                                    appended_component(&path, k),
                                    "Unknown group content is retained and not interpreted",
                                ));
                            }
                        }
                    }
                    let role = match member(context, "groups") {
                        Some(groups) => js_property(groups, name.unwrap(), ctx)?,
                        None => None,
                    };
                    if !role
                        .as_ref()
                        .is_some_and(|property| truthy(&property.value))
                    {
                        diagnostics.push(diagnostic(
                            "ROW_SCOPE_GROUP_ALIAS",
                            &format!("{}/name", path),
                            "Group must resolve through a trusted host alias",
                        ));
                        continue;
                    }
                    let selected = parse_commands(
                        list,
                        &format!("{path}/commands"),
                        false,
                        &mut diagnostics,
                        ctx,
                    )?;
                    for c in selected {
                        ctx.charge_work(128, Utf16::default())?;
                        let j = first_command_index(list, c).unwrap_or(0);
                        if let Some(info) = role.as_ref().and_then(|property| property.non_json) {
                            non_json_origins
                                .insert(format!("{path}/commands/{j}"), ("/role", info));
                        }
                        if !commands.contains(&c) {
                            diagnostics.push(diagnostic("ROW_SCOPE_GROUP_COMMAND",&format!("{}/commands",path),"Group grant cannot add a command omitted from the person command subset"));
                            continue;
                        }
                        if let Some((_, rule)) =
                            person.iter_mut().find(|(k, _)| k == &Utf16::from(c))
                        {
                            let command_index = ["select", "insert", "update", "delete"]
                                .iter()
                                .position(|command| *command == c)
                                .expect("known command");
                            if materialized_groups[command_index] < MAX_MATERIALIZED_GROUP_WRAPPERS
                            {
                                materialized_groups[command_index] += 1;
                                let prior = std::mem::replace(rule, Value::Null);
                                *rule = rule_with(
                                    "any",
                                    "rules",
                                    arr(vec![
                                        prior,
                                        rule_with(
                                            "memberOfRole",
                                            "role",
                                            copied(&role.as_ref().unwrap().value, ctx)?,
                                        ),
                                    ]),
                                );
                            }
                        }
                        if let Some((_, paths)) = occurrence_paths
                            .iter_mut()
                            .find(|(command, _)| *command == c)
                        {
                            for (_, suffix) in paths.iter_mut() {
                                ctx.charge_work(suffix.len().saturating_add(8), Utf16::default())?;
                                *suffix = format!("/rules/0{suffix}");
                            }
                            paths.push((format!("{path}/commands/{j}"), "/rules/1".into()));
                        }
                        origins.push(format!("{}/commands/{}", path, j));
                    }
                }
            } else {
                diagnostics.push(diagnostic(
                    "ROW_SCOPE_GROUPS",
                    &format!("{}/groups", base),
                    "Expected a list of named group grants",
                ));
            }
        }
        for _ in &commands {
            ctx.charge_work(128, Utf16::default())?;
            if let Some(_r) = &owner_rule {
                origins.push(format!("{}/owner_column", base));
            }
            for (path, _r) in &via_rules {
                ctx.charge_work(128, Utf16::default())?;
                origins.push(path.clone());
            }
        }
        let policy = o(vec![
            ("mode", s("native-rls")),
            ("person", Value::Object(person)),
            ("batch", Value::Object(batch)),
        ]);
        // Provenance paths are found by walking the rule tree, preserving all
        // occurrences when a rule is shared by more than one command.
        for from in origins {
            ctx.charge_work(128, Utf16::default())?;
            for (command, paths) in &occurrence_paths {
                ctx.charge_work(128, Utf16::default())?;
                ctx.charge_work(paths.len().saturating_add(from.len()), Utf16::default())?;
                for (origin, suffix) in paths {
                    if origin == &from {
                        map(
                            &mut mapping,
                            from.clone(),
                            format!("/policy/person/{command}{suffix}"),
                        );
                    }
                }
            }
        }
        if diagnostics.is_empty() {
            let non_json = occurrence_paths.iter().find_map(|(command, paths)| {
                paths.iter().find_map(|(from, suffix)| {
                    non_json_origins
                        .get(from)
                        .map(|(field, info)| (format!("/person/{command}{suffix}{field}"), *info))
                })
            });
            diagnostics.extend(self.admit_row_policy(&policy, context, non_json, ctx)?);
        }
        let valid = diagnostics.is_empty();
        let mut result = vec![("valid", Value::Bool(valid)), ("source", source)];
        if valid {
            result.push(("policy", policy));
        }
        result.push(("diagnostics", arr(diagnostics)));
        result.push(("sourceToOutput", Value::Object(mapping)));
        let result = o(result);
        charge_tree(&result, ctx)?;
        Ok(result)
    }

    fn admit_row_policy(
        &self,
        policy: &Value,
        context: &Value,
        non_json: Option<(String, NonJsonProperty)>,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Value>, EngineError> {
        let source = member(context, "lifecycleDocument").ok_or_else(|| {
            EngineError::new("NON_JSON", Utf16::default(), "Value is not JSON-compatible")
        })?;
        let mut doc = copied(source, ctx)?;
        let row_error =
            |message: &str| EngineError::new("ROW_SCOPE_FAILED", Utf16::default(), message);
        let modules_value = member(&doc, "modules");
        if matches!(doc, Value::Null) {
            return Err(row_error(
                "null is not an object (evaluating 'document.modules')",
            ));
        }
        let modules = match modules_value {
            Some(Value::Array(modules)) => modules,
            None => {
                return Err(row_error(
                    "undefined is not an object (evaluating 'document.modules.find')",
                ))
            }
            Some(Value::Null) => {
                return Err(row_error(
                    "null is not an object (evaluating 'document.modules.find')",
                ))
            }
            Some(value) => {
                let find = member(value, "find");
                let description = js_error_description(find, ctx)?;
                return Err(row_error(&format!("document.modules.find is not a function. (In 'document.modules.find((m) => m.id === context.record.module)', 'document.modules.find' is {description})")));
            }
        };
        let table_id = member(context, "tableId");
        let mut mi = None;
        for (index, module) in modules.iter().enumerate() {
            ctx.charge_work(128, Utf16::default())?;
            if matches!(module, Value::Null) {
                return Err(row_error("null is not an object (evaluating 'm.id')"));
            }
            let record = member(context, "record");
            match record {
                None => {
                    return Err(row_error(
                        "undefined is not an object (evaluating 'context.record.module')",
                    ))
                }
                Some(Value::Null) => {
                    return Err(row_error(
                        "null is not an object (evaluating 'context.record.module')",
                    ))
                }
                _ => {}
            }
            if js_strict_equal(
                member(module, "id"),
                record.and_then(|record| member(record, "module")),
            ) {
                mi = Some(index);
                break;
            }
        }
        let Some(mi) = mi else {
            return Ok(vec![diagnostic(
                "ROW_SCOPE_ADMISSION_TARGET",
                "/context/tableId",
                "Lifecycle table target was not found",
            )]);
        };
        let mut found = false;
        let mut found_table_index = 0;
        if let Some(Value::Array(modules)) = member_mut(&mut doc, "modules") {
            if let Some(module) = modules.get_mut(mi) {
                if let Some(ext) = member_mut(module, "extensions") {
                    if let Some(payload) = member_mut(ext, "umf.tables") {
                        if let Some(tables) = member_mut(payload, "tables")
                            .and_then(|value| value.and_then_mut_array())
                        {
                            for (table_index, table) in tables.iter_mut().enumerate() {
                                ctx.charge_work(128, Utf16::default())?;
                                if js_strict_equal(member(table, "id"), table_id) {
                                    found_table_index = table_index;
                                    let policy = copied(policy, ctx)?;
                                    if let Value::Object(fields) = table {
                                        if let Some((_, value)) = fields
                                            .iter_mut()
                                            .find(|(key, _)| key == &Utf16::from("policy"))
                                        {
                                            *value = policy;
                                        } else {
                                            fields.push((Utf16::from("policy"), policy));
                                        }
                                    }
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        if !found {
            return Ok(vec![diagnostic(
                "ROW_SCOPE_ADMISSION_TARGET",
                "/context/tableId",
                "Lifecycle table target was not found",
            )]);
        }
        if let Some((policy_path, info)) = non_json {
            let invalid_path = Utf16::from(format!("/modules/{mi}/extensions/umf.tables/tables/{found_table_index}/policy{policy_path}{}", info.suffix));
            // Copy precedes structural checks in the predecessor. Preserve
            // first-refusal order when a generated limit and native property
            // both occur, using actual member/array order rather than sorting.
            let admitted = admit_json(&doc, ctx);
            let admitted = match admitted {
                Err(mut error) if !error.is_control_failure() && error.code == "LIMIT" => {
                    if let Some(path) = crate::value::source_limit_path(&doc, ctx)? {
                        error.path = path;
                    }
                    Err(error)
                }
                result => result,
            };
            match admitted {
                Err(error) if error.is_control_failure() => return Err(error),
                Err(error) if pointer_precedes(&doc, &error.path, &invalid_path, ctx)? => {
                    return Ok(vec![diagnostic_at(
                        &error.code,
                        error.path,
                        if error.code == "LIMIT" {
                            "JSON structural limit exceeded"
                        } else {
                            "Value is not JSON-compatible"
                        },
                    )])
                }
                _ => {}
            }
            return Ok(vec![diagnostic_at("NON_JSON", invalid_path, info.message)]);
        }
        let inspect = self.inspect_table_lifecycle(&doc, ctx)?;
        let mut result = Vec::new();
        if !matches!(member(&inspect, "valid"), Some(Value::Bool(true)))
            || !matches!(member(&inspect, "complete"), Some(Value::Bool(true)))
        {
            for d in
                array_items(member(&inspect, "diagnostics").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                result.push(o(vec![
                    (
                        "code",
                        copied(member(d, "code").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        "path",
                        copied(member(d, "path").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        "message",
                        copied(member(d, "message").unwrap_or(&Value::Null), ctx)?,
                    ),
                ]));
            }
            return Ok(result);
        }
        // Deployment is compiled from the exact substituted lifecycle document.
        if serialized_text_exceeds(&doc, 4_000_000, ctx)? {
            return Ok(vec![diagnostic(
                "TABLE_DEPLOYMENT_INPUT",
                "",
                "Invalid Unicode or source resource limit",
            )]);
        }
        let configuration = copied(
            member(context, "deploymentConfiguration").unwrap_or(&Value::Null),
            ctx,
        )?;
        let source = umf_core::serialization::stringify_compact_metered(&doc, ctx)?;
        ctx.charge_work(
            source.len().saturating_mul(5).saturating_add(128),
            Utf16::default(),
        )?;
        let text = source.to_utf8().map_err(|_| {
            EngineError::new(
                "CANONICAL_INVALID_UNICODE",
                Utf16::default(),
                "Lifecycle source contains invalid Unicode",
            )
        })?;
        let req = o(vec![("text", s(&text)), ("configuration", configuration)]);
        let deployed = self.compile_table_deployment(&req, ctx)?;
        if !matches!(member(&deployed,"status"),Some(v) if eqstr(v,"compiled")) {
            for d in
                array_items(member(&deployed, "diagnostics").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                result.push(o(vec![
                    (
                        "code",
                        copied(member(d, "code").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        "path",
                        copied(member(d, "path").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        "message",
                        copied(member(d, "message").unwrap_or(&Value::Null), ctx)?,
                    ),
                ]));
            }
        }
        Ok(result)
    }
}

trait MutArray {
    fn and_then_mut_array(&mut self) -> Option<&mut Vec<Value>>;
}
impl MutArray for Value {
    fn and_then_mut_array(&mut self) -> Option<&mut Vec<Value>> {
        if let Value::Array(v) = self {
            Some(v)
        } else {
            None
        }
    }
}
fn member_mut<'a>(v: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    if let Value::Object(items) = v {
        items
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn parse_commands(
    value: Option<&Value>,
    path: &str,
    missing_empty: bool,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<Vec<&'static str>, EngineError> {
    let Some(v) = value else {
        if missing_empty {
            return Ok(vec![]);
        }
        diagnostics.push(diagnostic(
            "ROW_SCOPE_COMMANDS",
            path,
            "Expected an explicit command list",
        ));
        return Ok(vec![]);
    };
    let Some(items) = array_items(v) else {
        diagnostics.push(diagnostic(
            "ROW_SCOPE_COMMANDS",
            path,
            "Expected an explicit command list",
        ));
        return Ok(vec![]);
    };
    let mut out: Vec<&'static str> = Vec::new();
    for (i, item) in items.iter().enumerate() {
        charge_tree(item, ctx)?;
        ctx.charge_work(
            out.len().saturating_add(path.len()).saturating_add(128),
            Utf16::default(),
        )?;
        let Value::String(text_value) = item else {
            diagnostics.push(diagnostic(
                "ROW_SCOPE_COMMAND",
                &format!("{}/{}", path, i),
                "Unknown command",
            ));
            continue;
        };
        let Some(c) = command_name(text_value) else {
            diagnostics.push(diagnostic(
                "ROW_SCOPE_COMMAND",
                &format!("{}/{}", path, i),
                "Unknown command",
            ));
            continue;
        };
        if out.contains(&c) {
            diagnostics.push(diagnostic(
                "ROW_SCOPE_DUPLICATE",
                &format!("{}/{}", path, i),
                "Duplicate command",
            ));
        } else {
            out.push(c)
        }
    }
    Ok(out)
}
fn first_command_index(value: Option<&Value>, command: &str) -> Option<usize> {
    array_items(value?).and_then(|items| items.iter().position(|item| eqstr(item, command)))
}
