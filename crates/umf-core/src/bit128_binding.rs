// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native owner for the retained `umf-binding-3` Bit128 carrier semantics.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    registry::Registry,
    serialization::{read_json_value, Format},
    value::{Utf16, Value},
};

const TOKEN: u64 = 0x4249_5431_2803;
const MANIFEST: &str = include_str!("../../../spec/extensions/binding-128/package.json");

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn utf8_boundary(value: &Utf16) -> Result<String, EngineError> {
    value.to_utf8().map_err(|_| {
        EngineError::new(
            "BIT128_UTF16",
            Utf16::default(),
            "Ill-formed UTF-16 cannot be emitted as a native identifier",
        )
    })
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    get_utf16(value, &key(name))
}
fn get_utf16<'a>(value: &'a Value, name: &Utf16) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == name).map(|(_, v)| v),
        _ => None,
    }
}
fn array(value: Option<&Value>) -> Option<&[Value]> {
    match value {
        Some(Value::Array(values)) => Some(values),
        _ => None,
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn eq(value: Option<&Value>, expected: &str) -> bool {
    text(value) == Some(&key(expected))
}
fn same_ref(left: &Value, right: &Value) -> bool {
    get(left, "module") == get(right, "module") && get(left, "element") == get(right, "element")
}
fn pointer(value: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(value.len());
    for unit in value.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Utf16::new(units)
}
fn unknown_fields(
    value: &Value,
    allowed: &[&str],
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Ok(());
    };
    for (name, _) in fields {
        ctx.charge_work(name.len().max(1), Utf16::default())?;
        if !allowed.iter().any(|field| name == &key(field)) {
            let mut diagnostic_path = key(path).into_units();
            diagnostic_path.push(b'/' as u16);
            diagnostic_path.extend(pointer(name).into_units());
            diagnostics.push(diagnostic_at(
                "BINDING_UNKNOWN",
                Utf16::new(diagnostic_path),
                "Unknown carrier meaning retained",
                Severity::Warning,
            ));
        }
    }
    Ok(())
}
fn elements(source: &Value) -> Vec<(&Value, Utf16, Utf16)> {
    let mut found = Vec::new();
    for module in array(get(source, "modules")).unwrap_or(&[]) {
        let Some(module_id) = text(get(module, "id")) else {
            continue;
        };
        for element in array(get(module, "elements")).unwrap_or(&[]) {
            if let Some(element_id) = text(get(element, "id")) {
                found.push((element, module_id.clone(), element_id.clone()));
            }
        }
    }
    found
}
fn member_name(value: &Value) -> Option<Utf16> {
    text(get(value, "column")).cloned()
}
fn eq_text(value: Option<&Utf16>, expected: &str) -> bool {
    value == Some(&key(expected))
}
fn layout_error(message: &str) -> EngineError {
    EngineError::new("BIT128_LAYOUT", Utf16::default(), message)
}
fn object_has_only(value: &Value, allowed: &[&str]) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    fields
        .iter()
        .all(|(name, _)| allowed.iter().any(|field| name == &key(field)))
}
fn exact_ref(value: &Value) -> bool {
    matches!(value, Value::Object(fields) if fields.len() == 2 && object_has_only(value, &["module", "element"]) && text(get(value, "module")).is_some() && text(get(value, "element")).is_some())
}
fn field_by_ref<'a>(source: &'a Value, identity: &Value) -> Option<&'a Value> {
    elements(source)
        .into_iter()
        .find(|(_, module, element)| {
            text(get(identity, "module")) == Some(module)
                && text(get(identity, "element")) == Some(element)
        })
        .map(|(field, _, _)| field)
}
fn binding_row<'a>(payload: &'a Value, identity: &Value) -> Option<&'a Value> {
    array(get(payload, "fields"))?
        .iter()
        .find(|row| same_ref(row, identity))
}
fn carrier_slots(carrier: &Value) -> Vec<Utf16> {
    if eq(get(carrier, "kind"), "words64") {
        ["highColumn", "lowColumn"]
            .iter()
            .filter_map(|name| text(get(carrier, name)).cloned())
            .collect()
    } else {
        text(get(carrier, "column")).cloned().into_iter().collect()
    }
}
fn native_name(name: &Utf16, system: &str, _record: bool) -> bool {
    let Ok(name) = name.to_utf8() else {
        return false;
    };
    let ident = || {
        let mut chars = name.chars();
        chars
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
            && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
    };
    if name.is_empty() || name.contains('\0') {
        return false;
    }
    match system {
        "postgresql" => ident() && name.len() <= 63,
        "sqlserver" => ident() && name.len() <= 128,
        "avro" => {
            ident()
                && ![
                    "null", "boolean", "int", "long", "float", "double", "bytes", "string",
                ]
                .contains(&name.as_str())
        }
        "tablespec" => {
            let mut chars = name.chars();
            chars.next().is_some_and(|c| c.is_ascii_alphabetic())
                && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
                && name.len() <= 128
        }
        _ => !name.is_empty(),
    }
}

fn has_members(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Object(fields)) if !fields.is_empty())
}

fn shape_field(
    source: &Value,
    payload: &Value,
    identity: &Value,
    stack: &mut Vec<String>,
    visits: &mut usize,
    used_fields: &mut Vec<(Utf16, Utf16)>,
    used_groups: &mut Vec<(Utf16, Utf16)>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *visits = visits.saturating_add(1);
    ctx.charge_work(1, Utf16::default())?;
    if *visits > 10_000 || !exact_ref(identity) {
        return Err(layout_error("Exact bounded shape identity required"));
    }
    let module = text(get(identity, "module")).unwrap().clone();
    let element_id = text(get(identity, "element")).unwrap().clone();
    let key_string = format!(
        "{}:{}",
        utf8_boundary(&module)?,
        utf8_boundary(&element_id)?
    );
    if stack.contains(&key_string) || stack.len() > 64 {
        return Err(layout_error("Cyclic or excessive shape recursion"));
    }
    let field = field_by_ref(source, identity)
        .filter(|field| eq(get(field, "kind"), "field"))
        .ok_or_else(|| layout_error("Shape needs a logical Field"))?;
    if has_members(get(field, "extensions")) {
        return Err(layout_error("Unknown Field extension semantics"));
    }
    if !eq(get(field, "nullability"), "required")
        && !eq(get(field, "nullability"), "absent-allowed")
    {
        return Err(layout_error("Known shape availability required"));
    }
    if !used_fields
        .iter()
        .any(|(m, e)| m == &module && e == &element_id)
    {
        used_fields.push((module.clone(), element_id.clone()));
    }
    stack.push(key_string.clone());
    if eq(get(field, "cardinality"), "array") || eq(get(field, "cardinality"), "map") {
        if get(field, "scalarType").is_some()
            || array(get(field, "references")).is_some_and(|r| !r.is_empty())
        {
            return Err(layout_error(
                "Container cannot also declare scalar or record meaning",
            ));
        }
        let item = get(field, "itemType")
            .ok_or_else(|| layout_error("Explicit container item Field required"))?;
        shape_field(
            source,
            payload,
            item,
            stack,
            visits,
            used_fields,
            used_groups,
            ctx,
        )?;
    } else if eq(get(field, "cardinality"), "one") {
        let references = array(get(field, "references")).unwrap_or(&[]);
        if !references.is_empty() {
            if references.len() != 1
                || !eq(get(&references[0], "role"), "record-type")
                || get(field, "scalarType").is_some()
            {
                return Err(layout_error("One explicit group reference required"));
            }
            let group_ref = Value::Object(vec![
                (
                    key("module"),
                    get(&references[0], "module")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
                (
                    key("element"),
                    get(&references[0], "element")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
            ]);
            if !exact_ref(&group_ref) {
                return Err(layout_error("Exact group reference required"));
            }
            let group_id = (
                text(get(&group_ref, "module")).unwrap().clone(),
                text(get(&group_ref, "element")).unwrap().clone(),
            );
            let group_key = format!(
                "{}:{}",
                utf8_boundary(&group_id.0)?,
                utf8_boundary(&group_id.1)?
            );
            let group = field_by_ref(source, &group_ref)
                .filter(|g| eq(get(g, "kind"), "group"))
                .ok_or_else(|| layout_error("Explicit known group required"))?;
            if has_members(get(group, "extensions")) || stack.contains(&group_key) {
                return Err(layout_error("Cyclic or unknown group meaning"));
            }
            let group_rows = array(get(payload, "groups")).unwrap_or(&[]);
            let layout = group_rows
                .iter()
                .find(|row| same_ref(row, &group_ref))
                .ok_or_else(|| layout_error("Explicit group member layout required"))?;
            if !object_has_only(layout, &["module", "element", "members"])
                || !matches!(layout, Value::Object(fields) if fields.len() == 3)
                || array(get(layout, "members")).is_none_or(|members| members.is_empty())
            {
                return Err(layout_error("Nonempty exact group member layout required"));
            }
            if !used_groups
                .iter()
                .any(|(m, e)| m == &group_id.0 && e == &group_id.1)
            {
                used_groups.push(group_id);
            }
            stack.push(group_key);
            let mut group_members = Vec::new();
            for member in array(get(layout, "members")).unwrap_or(&[]) {
                if !exact_ref(member) {
                    return Err(layout_error("Exact group member Field identity required"));
                }
                let pair = (
                    text(get(member, "module")).unwrap().clone(),
                    text(get(member, "element")).unwrap().clone(),
                );
                if group_members.contains(&pair) {
                    return Err(layout_error("Duplicate group member"));
                }
                group_members.push(pair);
                shape_field(
                    source,
                    payload,
                    member,
                    stack,
                    visits,
                    used_fields,
                    used_groups,
                    ctx,
                )?;
            }
            stack.pop();
        } else {
            let row = binding_row(payload, identity)
                .ok_or_else(|| layout_error("Each scalar leaf requires a carrier"))?;
            if eq(get(field, "scalarType"), "uuid") || eq(get(field, "scalarType"), "bits128") {
                if !eq(get(row, "storage"), "scalar-carrier") {
                    return Err(layout_error("128-bit leaf needs explicit carrier"));
                }
            } else {
                if !eq(get(row, "storage"), "column") || text(get(row, "column")).is_none() {
                    return Err(layout_error("Scalar leaf needs explicit native column"));
                }
                validate_model_scalar(field)?;
            }
        }
    } else {
        return Err(layout_error("Known shape cardinality required"));
    }
    let _ = payload;
    stack.pop();
    Ok(())
}

fn validate_model_scalar(field: &Value) -> Result<(), EngineError> {
    let scalar = text(get(field, "scalarType"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if ![
        "boolean",
        "integer",
        "decimal",
        "string",
        "binary",
        "float",
        "date",
        "time",
        "timestamp",
    ]
    .contains(&scalar.as_str())
    {
        return Err(layout_error(
            "Scalar has no qualified exact value semantics",
        ));
    }
    let facets = get(field, "facets").unwrap_or(&Value::Null);
    if scalar == "decimal" {
        let precision = match get(facets, "precision") {
            Some(Value::Number(n)) if n.fract() == 0.0 => *n,
            _ => 0.0,
        };
        let scale = match get(facets, "scale") {
            Some(Value::Number(n)) if n.fract() == 0.0 => *n,
            _ => -1.0,
        };
        if !(1.0..=38.0).contains(&precision) || scale < 0.0 || scale > precision {
            return Err(layout_error(
                "Decimal requires precision/scale within 38 digits",
            ));
        }
    }
    if scalar == "integer" && get(facets, "integerWidth").is_none() {
        return Err(layout_error("Integer needs explicit bounded width"));
    }
    Ok(())
}

pub fn validate_model_layout(
    payload: &Value,
    logical: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let target = get(payload, "target").unwrap_or(&Value::Null);
    let system = text(get(target, "system"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let version = text(get(target, "version"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let subset = text(get(target, "subset"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let mixed = subset == "uuid-model2";
    if !mixed && subset != "uuid-model1" {
        return Err(layout_error("Explicit uuid-model1 subset required"));
    }
    let target_supported = (system == "postgresql"
        && (version == "17" || version.starts_with("17.")))
        || (system == "sqlserver" && version == "2022")
        || (system == "avro" && version == "1.12.0")
        || (system == "parquet" && version == "2.11.0")
        || (system == "tablespec" && version == "1.0");
    if !target_supported {
        return Err(layout_error("Unsupported versioned model target"));
    }
    let bound_elements = array(get(payload, "elements")).unwrap_or(&[]);
    let bound_fields = array(get(payload, "fields")).unwrap_or(&[]);
    let group_rows = array(get(payload, "groups")).unwrap_or(&[]);
    for (index, row) in group_rows.iter().enumerate() {
        if !matches!(row, Value::Object(fields) if fields.len() == 3)
            || !object_has_only(row, &["module", "element", "members"])
            || text(get(row, "module")).is_none()
            || text(get(row, "element")).is_none()
            || array(get(row, "members")).is_none()
            || group_rows[..index].iter().any(|prior| same_ref(prior, row))
        {
            return Err(layout_error("Duplicate or inexact group layout"));
        }
    }
    for element in bound_elements {
        if let Some(table) = text(get(element, "table")) {
            if !native_name(table, &system, true) {
                return Err(layout_error("Invalid model native Record name"));
            }
        }
    }
    for row in bound_fields {
        if eq(get(row, "storage"), "scalar-carrier") {
            let carrier = get(row, "carrier").unwrap_or(&Value::Null);
            let carrier_kind = text(get(carrier, "kind"))
                .and_then(|v| v.to_utf8().ok())
                .unwrap_or_default();
            if ![
                "native-uuid",
                "bytes16",
                "uuid-text",
                "hex128-text",
                "words64",
            ]
            .contains(&carrier_kind.as_str())
            {
                return Err(layout_error("Unknown model carrier"));
            }
            for name in carrier_slots(carrier) {
                if !native_name(&name, &system, false) {
                    return Err(layout_error("Invalid model native slot name"));
                }
            }
            if (carrier_kind == "words64"
                && (!matches!(get(carrier, "signed"), Some(Value::Bool(true)))
                    && system != "parquet"
                    || system == "tablespec"))
                || (system == "tablespec"
                    && carrier_kind != "uuid-text"
                    && carrier_kind != "hex128-text")
            {
                return Err(layout_error(
                    "Selected carrier is outside the versioned model target",
                ));
            }
        }
    }
    let source_elements = elements(logical);
    let records: Vec<_> = source_elements
        .iter()
        .filter(|(element, _, _)| eq(get(element, "kind"), "record"))
        .collect();
    if records.is_empty() {
        return Err(layout_error("At least one Record required"));
    }
    let mut bound_members: Vec<(Utf16, Utf16)> = Vec::new();
    let mut used_fields = Vec::new();
    let mut used_groups = Vec::new();
    let mut shape_visits = 0usize;
    let mut table_names: Vec<Utf16> = Vec::new();
    for (record, module, record_id) in &records {
        if has_members(get(*record, "extensions")) {
            return Err(layout_error(
                "Record extension meaning needs a separately qualified layout",
            ));
        }
        let identity = Value::Object(vec![
            (key("module"), Value::String((*module).clone())),
            (key("element"), Value::String((*record_id).clone())),
        ]);
        let binding = bound_elements
            .iter()
            .find(|row| same_ref(row, &identity))
            .ok_or_else(|| {
                layout_error("Each Record requires an unpartitioned exact table binding")
            })?;
        let table = text(get(binding, "table")).ok_or_else(|| {
            layout_error("Each Record requires an unpartitioned exact table binding")
        })?;
        if get(binding, "partition").is_some_and(|value| !matches!(value, Value::Null)) {
            return Err(layout_error(
                "Each Record requires an unpartitioned exact table binding",
            ));
        }
        let table_key = if system == "sqlserver" {
            Utf16::from(utf8_boundary(table)?.to_lowercase())
        } else {
            table.clone()
        };
        if table_names.contains(&table_key) {
            return Err(layout_error(
                "Distinct Records cannot share a table in this profile",
            ));
        }
        table_names.push(table_key);
        let members = array(get(*record, "members"))
            .filter(|members| !members.is_empty())
            .ok_or_else(|| layout_error("Nonempty explicit Record membership required"))?;
        let mut native_slots: Vec<Utf16> = Vec::new();
        for member in members {
            if !exact_ref(member) {
                return Err(layout_error("Expected exact Field identity"));
            }
            let field = field_by_ref(logical, member)
                .filter(|field| eq(get(field, "kind"), "field"))
                .ok_or_else(|| {
                    layout_error("Every member requires an explicit supported carrier")
                })?;
            let row = binding_row(payload, member).ok_or_else(|| {
                layout_error("Every member requires an explicit supported carrier")
            })?;
            if mixed {
                shape_field(
                    logical,
                    payload,
                    member,
                    &mut Vec::new(),
                    &mut shape_visits,
                    &mut used_fields,
                    &mut used_groups,
                    ctx,
                )?;
            }
            if !mixed {
                if !eq(get(row, "storage"), "scalar-carrier") {
                    return Err(layout_error(
                        "Every member requires an explicit 128-bit scalar carrier",
                    ));
                }
                if !eq(get(field, "cardinality"), "one")
                    || (!eq(get(field, "nullability"), "required")
                        && !eq(get(field, "nullability"), "absent-allowed"))
                {
                    return Err(layout_error("Singular known availability required"));
                }
                if has_members(get(field, "extensions")) {
                    return Err(layout_error(
                        "Field extension meaning requires separate native qualification",
                    ));
                }
                let carrier = get(row, "carrier").unwrap_or(&Value::Null);
                native_slots.extend(carrier_slots(carrier));
            } else if eq(get(row, "storage"), "scalar-carrier") {
                let carrier = get(row, "carrier").unwrap_or(&Value::Null);
                native_slots.extend(carrier_slots(carrier));
            } else {
                native_slots.extend(text(get(row, "column")).cloned());
            }
            let module = text(get(member, "module")).unwrap().clone();
            let element = text(get(member, "element")).unwrap().clone();
            if bound_members
                .iter()
                .any(|(m, e)| m == &module && e == &element)
            {
                return Err(layout_error(
                    "Each bound Field must have exactly one Record owner",
                ));
            }
            bound_members.push((module, element));
        }
        for model_key in array(get(*record, "keys")).unwrap_or(&[]) {
            if !object_has_only(model_key, &["id", "name", "fields", "primary"]) {
                return Err(layout_error("Unknown Key layout qualifier"));
            }
            let components = array(get(model_key, "fields"))
                .filter(|rows| !rows.is_empty())
                .ok_or_else(|| layout_error("Key requires explicit Field components"))?;
            let mut key_components = Vec::new();
            for reference in components {
                if !exact_ref(reference)
                    || !members.iter().any(|member| same_ref(member, reference))
                {
                    return Err(layout_error("Key components must belong to the Record"));
                }
                if mixed {
                    let field = field_by_ref(logical, reference)
                        .ok_or_else(|| layout_error("Key Field missing"))?;
                    if eq(get(field, "cardinality"), "array")
                        || eq(get(field, "cardinality"), "map")
                        || array(get(field, "references")).is_some_and(|refs| !refs.is_empty())
                    {
                        return Err(layout_error("Container/group Keys are undefined"));
                    }
                }
                let pair = (
                    text(get(reference, "module")).unwrap().clone(),
                    text(get(reference, "element")).unwrap().clone(),
                );
                if key_components.contains(&pair) {
                    return Err(layout_error("Repeated Key component"));
                }
                key_components.push(pair);
            }
        }
        let mut normalized = native_slots.clone();
        if system == "sqlserver" {
            normalized = native_slots
                .iter()
                .map(|name| Ok(Utf16::from(utf8_boundary(name)?.to_lowercase())))
                .collect::<Result<Vec<_>, EngineError>>()?;
        }
        normalized.sort();
        normalized.dedup();
        if normalized.len() != native_slots.len() {
            return Err(layout_error("Native column collision"));
        }
    }
    if bound_elements.len() != records.len() {
        return Err(layout_error(
            "Only exact Record table bindings are admitted",
        ));
    }
    if !mixed
        && (bound_members.len() != bound_fields.len()
            || bound_fields.iter().any(|row| {
                !bound_members.iter().any(|(module, element)| {
                    text(get(row, "module")) == Some(module)
                        && text(get(row, "element")) == Some(element)
                })
            }))
    {
        return Err(layout_error(
            "Each bound Field must have exactly one Record owner",
        ));
    }
    if mixed {
        if bound_members.len()
            != records
                .iter()
                .map(|(r, _, _)| array(get(*r, "members")).map_or(0, |m| m.len()))
                .sum::<usize>()
            || bound_fields.iter().any(|row| {
                !used_fields.iter().any(|(module, element)| {
                    text(get(row, "module")) == Some(module)
                        && text(get(row, "element")) == Some(element)
                })
            })
            || array(get(payload, "groups"))
                .unwrap_or(&[])
                .iter()
                .any(|row| {
                    !used_groups.iter().any(|(module, element)| {
                        text(get(row, "module")) == Some(module)
                            && text(get(row, "element")) == Some(element)
                    })
                })
        {
            return Err(layout_error(
                "Unbound or unmatched shape meaning would be lost",
            ));
        }
        for (element, module, id) in &source_elements {
            if eq(get(element, "kind"), "field")
                && !used_fields.iter().any(|(m, e)| m == module && e == id)
                || eq(get(element, "kind"), "group")
                    && !used_groups.iter().any(|(m, e)| m == module && e == id)
            {
                return Err(layout_error("Unbound shape element would be lost"));
            }
        }
    } else {
        let all_elements = source_elements.len();
        let field_count = source_elements
            .iter()
            .filter(|(element, _, _)| eq(get(element, "kind"), "field"))
            .count();
        if all_elements != records.len() + field_count {
            return Err(layout_error("Unlowered group requires separate layout"));
        }
        if field_count != bound_members.len() {
            return Err(layout_error("Unbound source Field would be lost"));
        }
    }
    for index in array(get(payload, "indexes")).unwrap_or(&[]) {
        let name = text(get(index, "name"))
            .ok_or_else(|| layout_error("Explicit native index name required"))?;
        if !native_name(name, &system, false) {
            return Err(layout_error("Invalid native index name"));
        }
        let kind = text(get(index, "kind"))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if !["btree", "unique"].contains(&kind.as_str())
            || kind == "unique" && !matches!(get(index, "unique"), Some(Value::Bool(true)))
        {
            return Err(layout_error(
                "Only explicit Field btree/unique indexes supported",
            ));
        }
        let on = array(get(index, "on"))
            .filter(|items| !items.is_empty())
            .ok_or_else(|| layout_error("Index requires explicit Fields"))?;
        let mut owner: Option<(Utf16, Utf16)> = None;
        let mut indexed_fields = Vec::new();
        for item in on {
            if !matches!(item, Value::Object(fields) if fields.len() == 1)
                || !object_has_only(item, &["field"])
            {
                return Err(layout_error("Document index paths require another profile"));
            }
            let reference =
                get(item, "field").ok_or_else(|| layout_error("Explicit index Field required"))?;
            if !exact_ref(reference) {
                return Err(layout_error("Exact index Field identity required"));
            }
            let identity = (
                text(get(reference, "module")).unwrap().clone(),
                text(get(reference, "element")).unwrap().clone(),
            );
            let record = records
                .iter()
                .find(|(record, _, _)| {
                    array(get(*record, "members")).is_some_and(|members| {
                        members.iter().any(|member| same_ref(member, reference))
                    })
                })
                .ok_or_else(|| layout_error("Index Field must belong to a Record"))?;
            let record_id = (record.1.clone(), record.2.clone());
            if owner.as_ref().is_some_and(|old| old != &record_id) {
                return Err(layout_error("Index Fields must belong to one Record"));
            }
            owner = Some(record_id);
            if indexed_fields.contains(&identity) {
                return Err(layout_error("Index requires distinct Fields"));
            }
            indexed_fields.push(identity);
            let field = field_by_ref(logical, reference)
                .ok_or_else(|| layout_error("Index Field missing"))?;
            if mixed
                && (eq(get(field, "cardinality"), "array")
                    || eq(get(field, "cardinality"), "map")
                    || array(get(field, "references")).is_some_and(|refs| !refs.is_empty()))
            {
                return Err(layout_error("Document index paths require another profile"));
            }
        }
    }
    let mut matched_relationships = 0usize;
    for source_module in array(get(logical, "modules")).unwrap_or(&[]) {
        let module_id = text(get(source_module, "id"))
            .ok_or_else(|| layout_error("Relationship module identity required"))?;
        for declaration in array(get(source_module, "relationships")).unwrap_or(&[]) {
            let declaration_id = text(get(declaration, "id"))
                .ok_or_else(|| layout_error("Relationship identity required"))?;
            let rows: Vec<_> = array(get(payload, "relationships"))
                .unwrap_or(&[])
                .iter()
                .filter(|row| {
                    text(get(row, "module")) == Some(module_id)
                        && text(get(row, "id")) == Some(declaration_id)
                })
                .collect();
            if rows.len() != 1 {
                return Err(layout_error(
                    "Each relationship requires exactly one explicit layout",
                ));
            }
            let row = rows[0];
            if eq(get(row, "storage"), "junction") {
                validate_association(declaration, row, logical, payload, &records)?;
                matched_relationships += 1;
                continue;
            }
            matched_relationships += 1;
            if !object_has_only(row, &["module", "id", "storage", "fields"])
                || !eq(get(row, "storage"), "foreign_key")
                || !matches!(get(declaration, "directed"), Some(Value::Bool(true)))
                || get(declaration, "associationRecord").is_some()
            {
                return Err(layout_error(
                    "Relationship needs a supported directed foreign-key layout",
                ));
            }
            let sources = array(get(declaration, "source"))
                .filter(|ends| ends.len() == 1)
                .ok_or_else(|| layout_error("Relationship needs one source endpoint"))?;
            let targets = array(get(declaration, "target"))
                .filter(|ends| ends.len() == 1)
                .ok_or_else(|| layout_error("Relationship needs one target endpoint"))?;
            let source_ref = &sources[0];
            let target_ref = &targets[0];
            let source_record = records
                .iter()
                .find(|(_, m, id)| {
                    text(get(source_ref, "module")) == Some(m)
                        && text(get(source_ref, "element")) == Some(id)
                })
                .ok_or_else(|| layout_error("Source Record not bound"))?;
            let target_record = records
                .iter()
                .find(|(_, m, id)| {
                    text(get(target_ref, "module")) == Some(m)
                        && text(get(target_ref, "element")) == Some(id)
                })
                .ok_or_else(|| layout_error("Target Record not bound"))?;
            let target_key_id = text(get(target_ref, "key"))
                .ok_or_else(|| layout_error("Explicit target Key required"))?;
            let target_key = array(get(target_record.0, "keys"))
                .unwrap_or(&[])
                .iter()
                .find(|k| text(get(k, "id")) == Some(target_key_id))
                .ok_or_else(|| layout_error("Target Key not found"))?;
            let target_components = array(get(target_key, "fields")).unwrap_or(&[]);
            let source_components = array(get(row, "fields"))
                .filter(|fields| fields.len() == target_components.len())
                .ok_or_else(|| layout_error("Foreign-key component arity differs"))?;
            let source_members = array(get(source_record.0, "members")).unwrap_or(&[]);
            let mut nullabilities = Vec::new();
            for (source_field_ref, target_field_ref) in
                source_components.iter().zip(target_components)
            {
                if !exact_ref(source_field_ref)
                    || !source_members
                        .iter()
                        .any(|member| same_ref(member, source_field_ref))
                {
                    return Err(layout_error("Foreign-key Field not owned by source"));
                }
                let source_field = field_by_ref(logical, source_field_ref)
                    .ok_or_else(|| layout_error("Source Field missing"))?;
                let target_field = field_by_ref(logical, target_field_ref)
                    .ok_or_else(|| layout_error("Target Key Field missing"))?;
                let source_binding = binding_row(payload, source_field_ref)
                    .ok_or_else(|| layout_error("Source carrier missing"))?;
                let target_binding = binding_row(payload, target_field_ref)
                    .ok_or_else(|| layout_error("Target carrier missing"))?;
                if get(source_field, "scalarType") != get(target_field, "scalarType")
                    || get(
                        get(source_binding, "carrier").unwrap_or(&Value::Null),
                        "kind",
                    ) != get(
                        get(target_binding, "carrier").unwrap_or(&Value::Null),
                        "kind",
                    )
                    || get(source_field, "facets") != get(target_field, "facets")
                    || get(
                        get(source_binding, "carrier").unwrap_or(&Value::Null),
                        "signed",
                    ) != get(
                        get(target_binding, "carrier").unwrap_or(&Value::Null),
                        "signed",
                    )
                {
                    return Err(layout_error("Foreign-key carrier/domain mismatch"));
                }
                let nullability = get(source_field, "nullability")
                    .cloned()
                    .unwrap_or(Value::Null);
                if !nullabilities.contains(&nullability) {
                    nullabilities.push(nullability);
                }
            }
            if nullabilities.len() > 1 {
                return Err(layout_error(
                    "Composite foreign-key availability must agree across every component",
                ));
            }
        }
    }
    if matched_relationships != array(get(payload, "relationships")).map_or(0, |rows| rows.len()) {
        return Err(layout_error("Unmatched relationship layout"));
    }
    Ok(())
}

fn validate_association(
    declaration: &Value,
    row: &Value,
    logical: &Value,
    payload: &Value,
    records: &[&(&Value, Utf16, Utf16)],
) -> Result<usize, EngineError> {
    if !object_has_only(
        row,
        &["module", "id", "storage", "record", "source", "target"],
    ) {
        return Err(layout_error("Unknown association layout qualifier"));
    }
    let record_ref =
        get(row, "record").ok_or_else(|| layout_error("Association Record required"))?;
    if !exact_ref(record_ref)
        || !records.iter().any(|(_, m, id)| {
            text(get(record_ref, "module")) == Some(m)
                && text(get(record_ref, "element")) == Some(id)
        })
    {
        return Err(layout_error("Association Record must resolve"));
    }
    if let Some(expected) = get(declaration, "associationRecord") {
        if !same_ref(expected, record_ref) {
            return Err(layout_error(
                "Association Record must agree with declaration",
            ));
        }
    }
    let record = field_by_ref(logical, record_ref)
        .ok_or_else(|| layout_error("Association Record missing"))?;
    let record_members = array(get(record, "members")).unwrap_or(&[]);
    let mut mapped_fields = Vec::new();
    let mut expanded = 0usize;
    for side in ["source", "target"] {
        let declared = array(get(declaration, side)).unwrap_or(&[]);
        let ends = array(get(row, side))
            .filter(|ends| ends.len() == declared.len())
            .ok_or_else(|| layout_error("Every endpoint alternative needs one mapping"))?;
        let mut records_seen = Vec::new();
        for (position, end) in ends.iter().enumerate() {
            if !object_has_only(end, &["record", "key", "fields"])
                || !matches!(end,Value::Object(fields) if fields.len()==3)
            {
                return Err(layout_error("Unknown endpoint mapping"));
            }
            let endpoint =
                get(end, "record").ok_or_else(|| layout_error("Endpoint Record required"))?;
            if !exact_ref(endpoint)
                || !same_ref(endpoint, &declared[position])
                || records_seen.iter().any(|r: &Value| same_ref(r, endpoint))
            {
                return Err(layout_error("Endpoint identity mismatch"));
            }
            records_seen.push(endpoint.clone());
            if side == "target" && get(end, "key") != get(&declared[position], "key") {
                return Err(layout_error("Endpoint Key mismatch"));
            }
            let endpoint_record = records
                .iter()
                .find(|(_, m, id)| {
                    text(get(endpoint, "module")) == Some(m)
                        && text(get(endpoint, "element")) == Some(id)
                })
                .ok_or_else(|| layout_error("Endpoint Record not bound"))?;
            let target_key =
                text(get(end, "key")).ok_or_else(|| layout_error("Endpoint Key required"))?;
            let key_row = array(get(endpoint_record.0, "keys"))
                .unwrap_or(&[])
                .iter()
                .find(|k| text(get(k, "id")) == Some(target_key))
                .ok_or_else(|| layout_error("Endpoint Key not found"))?;
            let target_fields = array(get(key_row, "fields")).unwrap_or(&[]);
            let mapped = array(get(end, "fields"))
                .filter(|fields| fields.len() == target_fields.len())
                .ok_or_else(|| layout_error("Endpoint key arity mismatch"))?;
            expanded += 1;
            for field in mapped {
                if !exact_ref(field)
                    || !record_members.iter().any(|m| same_ref(m, field))
                    || mapped_fields.iter().any(|old| same_ref(old, field))
                {
                    return Err(layout_error(
                        "Association endpoint slots must be exact and disjoint",
                    ));
                }
                mapped_fields.push(field.clone());
            }
        }
    }
    let _ = payload;
    Ok(expanded)
}
fn diagnostic(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    diagnostic_at(code, key(path), message, severity)
}
fn diagnostic_at(code: &str, path: Utf16, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: key(code),
        path,
        python_source_path: false,
        message: key(message),
        severity,
        python_text_origin: None,
    }
}
fn report(diagnostics: Vec<Diagnostic>) -> Validation {
    let valid = !diagnostics.iter().any(|d| d.severity == Severity::Error);
    let complete = diagnostics.is_empty();
    Validation {
        valid,
        complete,
        diagnostics,
    }
}
pub fn resources(ctx: &mut Context<'_>) -> Result<(Engine, Registry), EngineError> {
    fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let units: Vec<u16> = source.encode_utf16().collect();
        ctx.charge_text(units.len(), Utf16::default())?;
        read_json_value(&units, Format::Json, ctx)
    }
    let engine = Engine::new(
        ResourceSet::new(
            read(include_str!("../../../spec/core/schema.json"), ctx)?,
            read(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let schema_resources = engine.schema_resources_with_context(ctx)?;
    let manifest = read(MANIFEST, ctx)?;
    let mut registry = Registry::new();
    registry.register(
        &manifest,
        Some(TOKEN),
        engine.package_schema(),
        &schema_resources,
        ctx,
    )?;
    Ok((engine, registry))
}
struct Bit128Capabilities;
impl Capabilities for Bit128Capabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token == TOKEN {
            Ok(Vec::new())
        } else {
            Err(key("Unexpected Bit128 binding capability"))
        }
    }
}
struct NoExtensions;
impl Capabilities for NoExtensions {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

/// Inspect one binding-3 document against its exact current core logical source.
pub fn inspect_bit128_binding(
    binding: &Value,
    logical: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let (engine, registry) = resources(ctx)?;
    let mut capabilities = Bit128Capabilities;
    let binding_report = engine.validate_document(binding, &registry, &mut capabilities, ctx)?;
    let mut diagnostics: Vec<_> = binding_report
        .diagnostics
        .into_iter()
        .filter(|d| d.code != key("SEMANTICS_UNCHECKED"))
        .collect();
    if !binding_report.valid {
        return Ok(report(diagnostics));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let vocab = get(
        get(binding, "vocabularies").unwrap_or(&Value::Null),
        "umf.binding",
    );
    if !eq(get(vocab.unwrap_or(&Value::Null), "version"), "0.3.0")
        || !eq(get(payload, "profile"), "umf-binding-3")
        || array(get(binding, "modules")).is_some_and(|modules| !modules.is_empty())
    {
        diagnostics.push(diagnostic(
            "BINDING_PROFILE",
            "/extensions",
            "Expected separate binding3 document",
            Severity::Error,
        ));
        return Ok(report(diagnostics));
    }
    let mut no_extensions = NoExtensions;
    let logical_validation =
        engine.validate_document(logical, &Registry::new(), &mut no_extensions, ctx)?;
    if !eq(get(logical, "umf"), "0.10.0")
        || !logical_validation.valid
        || get(
            get(payload, "logical").unwrap_or(&Value::Null),
            "documentId",
        ) != get(logical, "id")
        || get(
            get(payload, "logical").unwrap_or(&Value::Null),
            "coreVersion",
        ) != get(logical, "umf")
    {
        diagnostics.push(diagnostic(
            "BINDING_MODEL",
            "/extensions/umf.binding/logical",
            "Exact valid current core source required",
            Severity::Error,
        ));
        return Ok(report(diagnostics));
    }
    let target = get(payload, "target").unwrap_or(&Value::Null);
    let subset = text(get(target, "subset"))
        .and_then(|value| value.to_utf8().ok())
        .unwrap_or_default();
    unknown_fields(
        payload,
        if subset == "uuid-model2" {
            &[
                "profile",
                "logical",
                "target",
                "elements",
                "fields",
                "relationships",
                "indexes",
                "groups",
            ]
        } else {
            &[
                "profile",
                "logical",
                "target",
                "elements",
                "fields",
                "relationships",
                "indexes",
            ]
        },
        "/extensions/umf.binding",
        &mut diagnostics,
        ctx,
    )?;
    unknown_fields(
        get(payload, "logical").unwrap_or(&Value::Null),
        &["documentId", "coreVersion"],
        "/extensions/umf.binding/logical",
        &mut diagnostics,
        ctx,
    )?;
    unknown_fields(
        target,
        &["system", "version", "subset"],
        "/extensions/umf.binding/target",
        &mut diagnostics,
        ctx,
    )?;
    let source_elements = elements(logical);
    let identity_exists = |row: &Value| {
        source_elements.iter().any(|(element, module, id)| {
            text(get(row, "module")) == Some(module) && text(get(row, "element")) == Some(id)
        })
    };
    let mut table_bindings: Vec<(Utf16, Utf16, Utf16)> = Vec::new();
    for (index, row) in array(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if !identity_exists(row)
            || table_bindings.iter().any(|(module, element, _)| {
                text(get(row, "module")) == Some(module)
                    && text(get(row, "element")) == Some(element)
            })
        {
            diagnostics.push(diagnostic(
                "BINDING_REFERENCE",
                &format!("/elements/{index}"),
                "Missing or duplicate exact logical element",
                Severity::Error,
            ));
        }
        if let (Some(module), Some(element), Some(table)) = (
            text(get(row, "module")),
            text(get(row, "element")),
            text(get(row, "table")),
        ) {
            table_bindings.push((module.clone(), element.clone(), table.clone()));
        }
        unknown_fields(
            row,
            &["module", "element", "table", "partition"],
            &format!("/elements/{index}"),
            &mut diagnostics,
            ctx,
        )?;
    }
    let mut field_ids: Vec<(Utf16, Utf16)> = Vec::new();
    let mut slots: Vec<(Utf16, Utf16)> = Vec::new();
    for (index, row) in array(get(payload, "fields"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        let path = format!("/fields/{index}");
        if field_ids.iter().any(|(module, element)| {
            text(get(row, "module")) == Some(module) && text(get(row, "element")) == Some(element)
        }) {
            diagnostics.push(diagnostic(
                "BINDING_DUPLICATE",
                &path,
                "Duplicate field binding",
                Severity::Error,
            ));
        }
        if let (Some(module), Some(element)) = (text(get(row, "module")), text(get(row, "element")))
        {
            field_ids.push((module.clone(), element.clone()));
        }
        let source_element = source_elements
            .iter()
            .find(|(element, module, id)| {
                text(get(row, "module")) == Some(module) && text(get(row, "element")) == Some(id)
            })
            .map(|(element, _, _)| *element);
        if source_element.is_none()
            || !eq(get(source_element.unwrap_or(&Value::Null), "kind"), "field")
        {
            diagnostics.push(diagnostic(
                "BINDING_REFERENCE",
                &path,
                "Explicit logical Field required",
                Severity::Error,
            ));
        }
        let field = source_element.unwrap_or(&Value::Null);
        let storage = text(get(row, "storage"))
            .and_then(|value| value.to_utf8().ok())
            .unwrap_or_default();
        let mut table = table_bindings
            .iter()
            .find(|(m, e, _)| {
                text(get(row, "module")) == Some(m) && text(get(row, "element")) == Some(e)
            })
            .map(|(_, _, table)| table.clone());
        // A field binding may inherit its target table from its owning Record.
        // Keep the fallback exact and unambiguous: absent or multiple Record
        // owners do not establish a target table.
        if table.is_none() && subset != "uuid-model2" {
            let owners: Vec<_> = source_elements
                .iter()
                .filter(|(record, _, _)| {
                    eq(get(record, "kind"), "record")
                        && array(get(record, "members")).is_some_and(|members| {
                            members.iter().any(|member| same_ref(member, row))
                        })
                })
                .collect();
            if let [(_, owner_module, owner_element)] = owners.as_slice() {
                table = table_bindings
                    .iter()
                    .find(|(module, element, _)| module == owner_module && element == owner_element)
                    .map(|(_, _, table)| table.clone());
            }
        }
        if table.is_none() && subset != "uuid-model2" {
            diagnostics.push(diagnostic(
                "BINDING_TABLE",
                &path,
                "Explicit target table/record binding required",
                Severity::Error,
            ));
        }
        let mut columns: Vec<Utf16> = Vec::new();
        if storage == "scalar-carrier" {
            unknown_fields(
                row,
                &["module", "element", "storage", "carrier"],
                &path,
                &mut diagnostics,
                ctx,
            )?;
            if !eq(get(field, "cardinality"), "one")
                || !(eq(get(field, "nullability"), "required")
                    || eq(get(field, "nullability"), "absent-allowed"))
                || !(eq(get(field, "scalarType"), "uuid")
                    || eq(get(field, "scalarType"), "bits128"))
            {
                diagnostics.push(diagnostic(
                    "BINDING_DOMAIN",
                    &path,
                    "Known singular available 128-bit Field required",
                    Severity::Error,
                ));
            }
            let carrier = get(row, "carrier").unwrap_or(&Value::Null);
            let carrier_kind = text(get(carrier, "kind"))
                .and_then(|value| value.to_utf8().ok())
                .unwrap_or_default();
            if ![
                "native-uuid",
                "bytes16",
                "uuid-text",
                "hex128-text",
                "words64",
            ]
            .contains(&carrier_kind.as_str())
            {
                diagnostics.push(diagnostic(
                    "BINDING_UNKNOWN",
                    &format!("{path}/carrier/kind"),
                    "Unknown carrier retained",
                    Severity::Warning,
                ));
            }
            unknown_fields(
                carrier,
                if carrier_kind == "words64" {
                    &["kind", "highColumn", "lowColumn", "signed"]
                } else {
                    &["kind", "column"]
                },
                &format!("{path}/carrier"),
                &mut diagnostics,
                ctx,
            )?;
            if ((carrier_kind == "native-uuid" || carrier_kind == "uuid-text")
                && !eq(get(field, "scalarType"), "uuid"))
                || (carrier_kind == "hex128-text" && !eq(get(field, "scalarType"), "bits128"))
            {
                diagnostics.push(diagnostic(
                    "BINDING_DOMAIN",
                    &path,
                    "Carrier does not match logical domain",
                    Severity::Error,
                ));
            }
            if carrier_kind == "words64" {
                columns.extend(
                    [
                        text(get(carrier, "highColumn")).cloned(),
                        text(get(carrier, "lowColumn")).cloned(),
                    ]
                    .into_iter()
                    .flatten(),
                );
            } else if let Some(column) = member_name(carrier) {
                columns.push(column);
            }
        } else {
            unknown_fields(
                row,
                &[
                    "module",
                    "element",
                    "field",
                    "storage",
                    "column",
                    "documentColumn",
                    "path",
                ],
                &path,
                &mut diagnostics,
                ctx,
            )?;
            if storage == "column" {
                columns.extend(text(get(row, "column")).cloned());
                if get(row, "column").is_none()
                    || get(row, "path").is_some()
                    || get(row, "documentColumn").is_some()
                {
                    diagnostics.push(diagnostic(
                        "BINDING_PATH",
                        &path,
                        "Malformed native storage declaration",
                        Severity::Error,
                    ));
                }
            } else {
                columns.extend(text(get(row, "documentColumn")).cloned());
                if get(row, "documentColumn").is_none()
                    || array(get(row, "path")).is_none_or(|path| path.is_empty())
                    || get(row, "column").is_some()
                {
                    diagnostics.push(diagnostic(
                        "BINDING_PATH",
                        &path,
                        "Malformed native storage declaration",
                        Severity::Error,
                    ));
                }
            }
        }
        for column in columns {
            let table_key = table.clone().unwrap_or_else(|| {
                key(&format!(
                    "{}:{}",
                    text(get(row, "module"))
                        .and_then(|value| value.to_utf8().ok())
                        .unwrap_or_default(),
                    text(get(row, "element"))
                        .and_then(|value| value.to_utf8().ok())
                        .unwrap_or_default()
                ))
            });
            if slots
                .iter()
                .any(|(old_table, old_column)| old_table == &table_key && old_column == &column)
            {
                diagnostics.push(diagnostic(
                    "BINDING_SLOT_COLLISION",
                    &path,
                    "Physical slot reused",
                    Severity::Error,
                ));
            }
            slots.push((table_key, column));
        }
    }
    if subset == "uuid-model1" || subset == "uuid-model2" {
        for item in logical_validation
            .diagnostics
            .into_iter()
            .filter(|d| d.severity == Severity::Warning)
        {
            if !diagnostics
                .iter()
                .any(|existing| existing.code == item.code && existing.path == item.path)
            {
                diagnostics.push(item);
            }
        }
        if let Err(error) = validate_model_layout(payload, logical, ctx) {
            if error.is_control_failure() {
                return Err(error);
            }
            diagnostics.push(Diagnostic {
                code: error.code.into(),
                path: error.path,
                python_source_path: false,
                message: error.message,
                severity: Severity::Error,
                python_text_origin: None,
            });
        }
    } else if array(get(payload, "indexes")).is_some_and(|items| !items.is_empty())
        || array(get(payload, "relationships")).is_some_and(|items| !items.is_empty())
    {
        diagnostics.push(diagnostic("BINDING_UNQUALIFIED_LAYOUT", "/indexes", "Index and relationship carrier execution is not admitted; declarations remain retained", Severity::Warning));
    }
    Ok(report(diagnostics))
}

fn exact_binding_row<'a>(payload: &'a Value, identity: &Value) -> Result<&'a Value, EngineError> {
    array(get(payload, "fields"))
        .and_then(|rows| rows.iter().find(|row| same_ref(row, identity)))
        .ok_or_else(|| {
            EngineError::new(
                "BIT128_CARRIER",
                Utf16::default(),
                "Explicit Field carrier required",
            )
        })
}

fn bit_value_for_literal(
    literal: &Value,
    scalar_type: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Value>, EngineError> {
    if matches!(literal, Value::Null) {
        return Ok(None);
    }
    let (member, input) = if eq(Some(scalar_type), "uuid") {
        ("uuid", get(literal, "uuid"))
    } else {
        ("bits128Hex", get(literal, "bits128Hex"))
    };
    if !matches!(literal, Value::Object(fields) if fields.len() == 1)
        || !object_has_only(literal, &[member])
        || input.is_none()
    {
        return Err(EngineError::new(
            "BIT128_VALUE",
            Utf16::default(),
            "Expected exact 128-bit logical literal",
        ));
    }
    let input = input.unwrap();
    if member == "uuid" {
        let parsed = crate::bit128::parse_uuid(input, ctx)?;
        Ok(Some(crate::bit128::uuid_to_bits128(&parsed, ctx)?))
    } else {
        Ok(Some(crate::bit128::parse_bits128(input, ctx)?))
    }
}

/// Encode one admitted core 128-bit Field literal into its exact physical slots.
pub fn encode_carrier_value(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (engine, _registry) = resources(ctx)?;
    let inspected = inspect_bit128_binding(binding, logical, ctx)?;
    if !inspected.valid || !inspected.complete {
        return Err(EngineError::new(
            "BIT128_BINDING",
            Utf16::default(),
            "Complete valid Bit128 binding required",
        ));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let row = exact_binding_row(payload, identity)?;
    let carrier = get(row, "carrier").unwrap_or(&Value::Null);
    let kind = text(get(carrier, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if !eq(get(row, "storage"), "scalar-carrier") {
        return Err(EngineError::new(
            "BIT128_CARRIER",
            Utf16::default(),
            "Explicit scalar carrier required",
        ));
    }
    let field = field_by_ref(logical, identity).ok_or_else(|| {
        EngineError::new(
            "BIT128_IDENTITY",
            Utf16::default(),
            "Exact Field identity required",
        )
    })?;
    let validation = engine.validate_core_field_value_public(logical, identity, literal, ctx)?;
    if !validation.valid {
        return Err(EngineError::new(
            "BIT128_VALUE",
            Utf16::default(),
            "Invalid logical Field value",
        ));
    }
    let scalar_type = get(field, "scalarType").unwrap_or(&Value::Null);
    let bits = bit_value_for_literal(literal, scalar_type, ctx)?;
    let slots = carrier_slots(carrier);
    let mut result = Vec::with_capacity(slots.len());
    if let Some(bits) = bits {
        if kind == "words64" {
            let signed = get(carrier, "signed").cloned().unwrap_or(Value::Null);
            let words = crate::bit128::bits128_to_words(&bits, &signed, ctx)?;
            for name in ["highColumn", "lowColumn"] {
                result.push((
                    text(get(carrier, name)).unwrap().clone(),
                    get(&words, if name == "highColumn" { "high" } else { "low" })
                        .unwrap()
                        .clone(),
                ));
            }
        } else {
            let slot = if kind == "native-uuid" || kind == "uuid-text" {
                let uuid = crate::bit128::uuid_from_bits128(&bits, ctx)?;
                get(&uuid, "canonicalText").unwrap().clone()
            } else {
                get(&bits, "hex").unwrap().clone()
            };
            result.push((text(get(carrier, "column")).unwrap().clone(), slot));
        }
    } else {
        for slot in slots {
            result.push((slot, Value::Null));
        }
    }
    Ok(Value::Object(result))
}

/// Decode an exact complete set of carrier slots and validate the resulting logical literal.
pub fn decode_carrier_value(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    slots: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (engine, _registry) = resources(ctx)?;
    let inspected = inspect_bit128_binding(binding, logical, ctx)?;
    if !inspected.valid || !inspected.complete {
        return Err(EngineError::new(
            "BIT128_BINDING",
            Utf16::default(),
            "Complete valid Bit128 binding required",
        ));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let row = exact_binding_row(payload, identity)?;
    let carrier = get(row, "carrier").unwrap_or(&Value::Null);
    let kind = text(get(carrier, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if !eq(get(row, "storage"), "scalar-carrier") {
        return Err(EngineError::new(
            "BIT128_CARRIER",
            Utf16::default(),
            "Explicit scalar carrier required",
        ));
    }
    let field = field_by_ref(logical, identity).ok_or_else(|| {
        EngineError::new(
            "BIT128_IDENTITY",
            Utf16::default(),
            "Exact Field identity required",
        )
    })?;
    let names = carrier_slots(carrier);
    let Value::Object(entries) = slots else {
        return Err(EngineError::new(
            "BIT128_VALUE",
            Utf16::default(),
            "Exact complete carrier slots required",
        ));
    };
    if entries.len() != names.len()
        || names
            .iter()
            .any(|name| !entries.iter().any(|(candidate, _)| candidate == name))
    {
        return Err(EngineError::new(
            "BIT128_VALUE",
            Utf16::default(),
            "Exact complete carrier slots required",
        ));
    }
    let values: Vec<_> = names
        .iter()
        .map(|name| get_utf16(slots, name).unwrap())
        .collect();
    let null_count = values
        .iter()
        .filter(|value| matches!(value, Value::Null))
        .count();
    let literal = if null_count > 0 {
        if null_count != values.len() {
            return Err(EngineError::new(
                "BIT128_VALUE",
                Utf16::default(),
                "Partial absent pair",
            ));
        }
        Value::Null
    } else {
        let bits = if kind == "words64" {
            let words = Value::Object(vec![
                (key("high"), values[0].clone()),
                (key("low"), values[1].clone()),
            ]);
            crate::bit128::bits128_from_words(
                &words,
                get(carrier, "signed").unwrap_or(&Value::Null),
                ctx,
            )?
        } else if kind == "native-uuid" || kind == "uuid-text" {
            let uuid = crate::bit128::parse_uuid(values[0], ctx)?;
            crate::bit128::uuid_to_bits128(&uuid, ctx)?
        } else {
            crate::bit128::parse_bits128(values[0], ctx)?
        };
        if eq(get(field, "scalarType"), "uuid") {
            let uuid = crate::bit128::uuid_from_bits128(&bits, ctx)?;
            Value::Object(vec![(
                key("uuid"),
                get(&uuid, "canonicalText").unwrap().clone(),
            )])
        } else {
            Value::Object(vec![(
                key("bits128Hex"),
                get(&bits, "hex").unwrap().clone(),
            )])
        }
    };
    let validation = engine.validate_core_field_value_public(logical, identity, &literal, ctx)?;
    if !validation.valid {
        return Err(EngineError::new(
            "BIT128_VALUE",
            Utf16::default(),
            "Decoded value violates Field",
        ));
    }
    Ok(literal)
}

fn model_record<'a, 'b>(
    binding: &'a Value,
    logical: &'b Value,
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<(&'a Value, &'b Value, &'a Value), EngineError> {
    if !exact_ref(identity) {
        return Err(EngineError::new(
            "BIT128_RECORD_IDENTITY",
            Utf16::default(),
            "Exact Record identity required",
        ));
    }
    let validation = inspect_bit128_binding(binding, logical, ctx)?;
    if !validation.valid || !validation.complete {
        return Err(EngineError::new(
            "BIT128_RECORD_SOURCE",
            Utf16::default(),
            "Incomplete carrier layout",
        ));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let subset = get(get(payload, "target").unwrap_or(&Value::Null), "subset");
    if !eq(subset, "uuid-model1") && !eq(subset, "uuid-model2") {
        return Err(EngineError::new(
            "BIT128_RECORD_SOURCE",
            Utf16::default(),
            "Complete versioned UUID model layout required",
        ));
    }
    let record = elements(logical)
        .into_iter()
        .find(|(element, module, element_id)| {
            eq(get(element, "kind"), "record")
                && text(get(identity, "module")) == Some(module)
                && text(get(identity, "element")) == Some(element_id)
        })
        .map(|(record, _, _)| record)
        .ok_or_else(|| {
            EngineError::new("BIT128_RECORD_IDENTITY", Utf16::default(), "Unknown Record")
        })?;
    let table = array(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .find(|row| same_ref(row, identity))
        .ok_or_else(|| {
            EngineError::new(
                "BIT128_RECORD_IDENTITY",
                Utf16::default(),
                "Record is not bound",
            )
        })?;
    Ok((payload, record, table))
}

fn require_file_record_target(payload: &Value) -> Result<(), EngineError> {
    let target = get(payload, "target").unwrap_or(&Value::Null);
    let system = text(get(target, "system"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let version = text(get(target, "version"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if system == "avro" && version == "1.12.0"
        || system == "parquet" && version == "2.11.0"
        || system == "tablespec" && version == "1.0"
    {
        Ok(())
    } else {
        Err(EngineError::new(
            "BIT128_FILE_TARGET",
            Utf16::default(),
            "File/model target required",
        ))
    }
}

fn file_field_name(row: &Value) -> Utf16 {
    let carrier = get(row, "carrier").unwrap_or(&Value::Null);
    if eq(get(carrier, "kind"), "words64") {
        let high = text(get(carrier, "highColumn"))
            .cloned()
            .unwrap_or_default();
        let mut units = high.into_units();
        units.extend("__pair".encode_utf16());
        Utf16::new(units)
    } else {
        text(get(row, "column")).cloned().unwrap_or_default()
    }
}

fn is_shape_field(field: &Value) -> bool {
    !eq(get(field, "cardinality"), "one")
        || array(get(field, "references")).is_some_and(|references| !references.is_empty())
}

fn canonical_json_text(value: &Value) -> String {
    fn canonical(value: &Value) -> Value {
        match value {
            Value::Array(items) => Value::Array(items.iter().map(canonical).collect()),
            Value::Object(fields) => {
                let mut fields: Vec<_> = fields.iter().collect();
                fields.sort_by(|left, right| left.0.cmp(&right.0));
                Value::Object(
                    fields
                        .into_iter()
                        .map(|(name, item)| (name.clone(), canonical(item)))
                        .collect(),
                )
            }
            _ => value.clone(),
        }
    }
    json_text(&canonical(value))
}

fn scalar_literal_token(
    engine: &Engine,
    logical: &Value,
    identity: &Value,
    field: &Value,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validation = if ["float", "date", "time", "timestamp"]
        .iter()
        .any(|scalar| eq(get(field, "scalarType"), scalar))
    {
        engine
            .validate_schema_literal_with_refinements_public(logical, field, literal, false, ctx)?
    } else {
        engine.validate_core_field_value_public(logical, identity, literal, ctx)?
    };
    if !validation.valid {
        return Err(EngineError::new(
            "BIT128_FILE_VALUE",
            Utf16::default(),
            "Invalid logical Field value",
        ));
    }
    if matches!(literal, Value::Null) {
        return Ok(Value::Null);
    }
    let scalar = text(get(field, "scalarType"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let member = match scalar.as_str() {
        "boolean" => "boolean",
        "integer" => "integerToken",
        "decimal" => "decimalToken",
        "string" => "string",
        "binary" => "binaryHex",
        "float" => "floatToken",
        "date" => "date",
        "time" => "time",
        "timestamp" => "timestamp",
        _ => return Err(layout_error("Supported exact scalar value required")),
    };
    if scalar == "boolean" {
        return Ok(string_value(
            if matches!(get(literal, member), Some(Value::Bool(true))) {
                "true"
            } else {
                "false"
            },
        ));
    }
    let token = text(get(literal, member))
        .ok_or_else(|| layout_error("Exact scalar token required"))?
        .to_utf8()
        .map_err(|_| layout_error("Scalar token must be UTF-8"))?;
    if scalar == "binary" {
        return Ok(string_value(token.to_ascii_lowercase()));
    }
    if scalar != "decimal" {
        return Ok(string_value(token));
    }
    let scale = get(get(field, "facets").unwrap_or(&Value::Null), "scale")
        .and_then(|v| match v {
            Value::Number(number) if number.is_finite() && *number >= 0.0 => Some(*number as usize),
            _ => None,
        })
        .ok_or_else(|| layout_error("Explicit decimal scale required"))?;
    let (negative, mut digits, source_scale) = crate::serialization::decimal_canonical(&token)
        .ok_or_else(|| layout_error("Canonical decimal token required"))?;
    if source_scale > scale as i64 {
        return Err(layout_error("Decimal scale exceeds declared scale"));
    }
    digits.extend(std::iter::repeat('0').take(scale.saturating_sub(source_scale as usize)));
    if scale > 0 && digits.len() <= scale {
        digits.insert_str(0, &"0".repeat(scale + 1 - digits.len()));
    }
    let mut canonical = if scale == 0 {
        digits
    } else {
        let split = digits.len() - scale;
        format!("{}.{}", &digits[..split], &digits[split..])
    };
    if negative
        && canonical
            .bytes()
            .any(|byte| byte.is_ascii_digit() && byte != b'0')
    {
        canonical.insert(0, '-');
    }
    Ok(string_value(canonical))
}

fn decode_scalar_literal(
    engine: &Engine,
    logical: &Value,
    identity: &Value,
    field: &Value,
    token: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let literal = if matches!(token, Value::Null) {
        Value::Null
    } else {
        let scalar = text(get(field, "scalarType"))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let member = match scalar.as_str() {
            "boolean" => "boolean",
            "integer" => "integerToken",
            "decimal" => "decimalToken",
            "string" => "string",
            "binary" => "binaryHex",
            "float" => "floatToken",
            "date" => "date",
            "time" => "time",
            "timestamp" => "timestamp",
            _ => return Err(layout_error("Supported exact scalar value required")),
        };
        let value = if scalar == "boolean" {
            match text(Some(token)).and_then(|v| v.to_utf8().ok()).as_deref() {
                Some("true") => Value::Bool(true),
                Some("false") => Value::Bool(false),
                _ => return Err(layout_error("Canonical boolean token required")),
            }
        } else {
            Value::String(
                text(Some(token))
                    .cloned()
                    .ok_or_else(|| layout_error("Exact scalar token required"))?,
            )
        };
        Value::Object(vec![(key(member), value)])
    };
    let validation = if ["float", "date", "time", "timestamp"]
        .iter()
        .any(|scalar| eq(get(field, "scalarType"), scalar))
    {
        engine
            .validate_schema_literal_with_refinements_public(logical, field, &literal, false, ctx)?
    } else {
        engine.validate_core_field_value_public(logical, identity, &literal, ctx)?
    };
    if !validation.valid {
        return Err(EngineError::new(
            "BIT128_FILE_VALUE",
            Utf16::default(),
            "Decoded scalar violates Field",
        ));
    }
    Ok(literal)
}

fn shape_value(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    if depth > 64 {
        return Err(layout_error("Shape value nesting exceeds 64"));
    }
    let field =
        field_by_ref(logical, identity).ok_or_else(|| layout_error("Shape Field missing"))?;
    if matches!(input, Value::Null) {
        if !eq(get(field, "nullability"), "absent-allowed") {
            return Err(layout_error("Required shape value cannot be null"));
        }
        return Ok(Value::Null);
    }
    let cardinality = text(get(field, "cardinality"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if cardinality == "array" || cardinality == "map" {
        let member = if cardinality == "array" {
            "array"
        } else {
            "map"
        };
        if !matches!(input, Value::Object(fields) if fields.len() == 1)
            || !object_has_only(input, &[member])
        {
            return Err(layout_error("Exact array/map literal required"));
        }
        let nested = get(input, member).ok_or_else(|| layout_error("Container value required"))?;
        let count = if cardinality == "array" {
            array(Some(nested)).map_or(0, <[Value]>::len)
        } else {
            match nested {
                Value::Object(fields) => fields.len(),
                _ => return Err(layout_error("Map value must be an object")),
            }
        };
        if let Some(size) = get(
            get(field, "facets").unwrap_or(&Value::Null),
            "collectionSize",
        ) {
            if let Some(Value::Number(min)) = get(size, "min") {
                if (count as f64) < *min {
                    return Err(layout_error("Container is below its minimum size"));
                }
            }
            if let Some(Value::Number(max)) = get(size, "max") {
                if (count as f64) > *max {
                    return Err(layout_error("Container exceeds its maximum size"));
                }
            }
        }
        let item =
            get(field, "itemType").ok_or_else(|| layout_error("Container item Field required"))?;
        if cardinality == "array" {
            let encoded = array(Some(nested))
                .unwrap()
                .iter()
                .map(|value| shape_value(binding, logical, item, value, engine, ctx, depth + 1))
                .collect::<Result<Vec<_>, _>>()?;
            return Ok(array_value(encoded));
        }
        let Value::Object(entries) = nested else {
            unreachable!()
        };
        let encoded = entries
            .iter()
            .map(|(name, value)| {
                Ok((
                    name.clone(),
                    shape_value(binding, logical, item, value, engine, ctx, depth + 1)?,
                ))
            })
            .collect::<Result<Vec<_>, EngineError>>()?;
        return Ok(Value::Object(encoded));
    }
    if let Some(references) = array(get(field, "references")) {
        if !references.is_empty() {
            if references.len() != 1 || !eq(get(&references[0], "role"), "record-type") {
                return Err(layout_error("Exact group reference required"));
            }
            if !matches!(input, Value::Object(fields) if fields.len() == 1)
                || !object_has_only(input, &["group"])
            {
                return Err(layout_error("Exact group literal required"));
            }
            let group_value = array(get(input, "group"))
                .ok_or_else(|| layout_error("Group member array required"))?;
            let group_ref = object_value(vec![
                (
                    "module",
                    get(&references[0], "module")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
                (
                    "element",
                    get(&references[0], "element")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
            ]);
            let layout = array(get(
                get(binding, "extensions")
                    .and_then(|e| get(e, "umf.binding"))
                    .unwrap_or(&Value::Null),
                "groups",
            ))
            .unwrap_or(&[])
            .iter()
            .find(|row| same_ref(row, &group_ref))
            .ok_or_else(|| layout_error("Group member layout required"))?;
            let members = array(get(layout, "members")).unwrap_or(&[]);
            if group_value.len() != members.len() {
                return Err(layout_error("Exact complete group value required"));
            }
            let mut output = Vec::new();
            for (index, member) in members.iter().enumerate() {
                let entry = group_value
                    .iter()
                    .find(|entry| same_ref(get(entry, "field").unwrap_or(&Value::Null), member))
                    .ok_or_else(|| layout_error("Missing group member value"))?;
                if !matches!(entry, Value::Object(fields) if fields.len() == 2)
                    || !object_has_only(entry, &["field", "value"])
                {
                    return Err(layout_error("Malformed group member value"));
                }
                output.push((
                    key(&format!("m{index}")),
                    shape_value(
                        binding,
                        logical,
                        member,
                        get(entry, "value").unwrap(),
                        engine,
                        ctx,
                        depth + 1,
                    )?,
                ));
            }
            return Ok(Value::Object(output));
        }
    }
    let row = binding_row(
        get(
            get(binding, "extensions").unwrap_or(&Value::Null),
            "umf.binding",
        )
        .unwrap_or(&Value::Null),
        identity,
    )
    .ok_or_else(|| layout_error("Leaf binding required"))?;
    if eq(get(row, "storage"), "scalar-carrier") {
        let encoded = encode_carrier_value(binding, logical, identity, input, ctx)?;
        let carrier = get(row, "carrier").unwrap_or(&Value::Null);
        if eq(get(carrier, "kind"), "words64") {
            return Ok(encoded);
        }
        return Ok(get(
            &encoded,
            &text(get(carrier, "column"))
                .unwrap()
                .to_utf8()
                .unwrap_or_default(),
        )
        .cloned()
        .unwrap_or(Value::Null));
    }
    scalar_literal_token(engine, logical, identity, field, input, ctx)
}

fn unshape_value(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    if depth > 64 {
        return Err(layout_error("Shape value nesting exceeds 64"));
    }
    let field =
        field_by_ref(logical, identity).ok_or_else(|| layout_error("Shape Field missing"))?;
    if matches!(input, Value::Null) {
        if !eq(get(field, "nullability"), "absent-allowed") {
            return Err(layout_error("Required shape value is absent"));
        }
        return Ok(Value::Null);
    }
    let cardinality = text(get(field, "cardinality"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if cardinality == "array" || cardinality == "map" {
        let item =
            get(field, "itemType").ok_or_else(|| layout_error("Container item Field required"))?;
        if cardinality == "array" {
            let items =
                array(Some(input)).ok_or_else(|| layout_error("Native array value required"))?;
            return Ok(object_value(vec![(
                "array",
                array_value(
                    items
                        .iter()
                        .map(|value| {
                            unshape_value(binding, logical, item, value, engine, ctx, depth + 1)
                        })
                        .collect::<Result<Vec<_>, _>>()?,
                ),
            )]));
        }
        let Value::Object(entries) = input else {
            return Err(layout_error("Native map value required"));
        };
        let values = entries
            .iter()
            .map(|(name, value)| {
                Ok((
                    name.clone(),
                    unshape_value(binding, logical, item, value, engine, ctx, depth + 1)?,
                ))
            })
            .collect::<Result<Vec<_>, EngineError>>()?;
        return Ok(object_value(vec![("map", Value::Object(values))]));
    }
    if let Some(references) = array(get(field, "references")) {
        if !references.is_empty() {
            let group_ref = object_value(vec![
                (
                    "module",
                    get(&references[0], "module")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
                (
                    "element",
                    get(&references[0], "element")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
            ]);
            let payload = get(
                get(binding, "extensions").unwrap_or(&Value::Null),
                "umf.binding",
            )
            .unwrap_or(&Value::Null);
            let layout = array(get(payload, "groups"))
                .unwrap_or(&[])
                .iter()
                .find(|row| same_ref(row, &group_ref))
                .ok_or_else(|| layout_error("Group member layout required"))?;
            let members = array(get(layout, "members")).unwrap_or(&[]);
            let Value::Object(entries) = input else {
                return Err(layout_error("Native group object required"));
            };
            if entries.len() != members.len() {
                return Err(layout_error("Exact native group object required"));
            }
            let values = members
                .iter()
                .enumerate()
                .map(|(index, member)| {
                    let name = format!("m{index}");
                    let native = get(input, &name)
                        .ok_or_else(|| layout_error("Missing native group member"))?;
                    Ok(object_value(vec![
                        ("field", member.clone()),
                        (
                            "value",
                            unshape_value(
                                binding,
                                logical,
                                member,
                                native,
                                engine,
                                ctx,
                                depth + 1,
                            )?,
                        ),
                    ]))
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            return Ok(object_value(vec![("group", array_value(values))]));
        }
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let row =
        binding_row(payload, identity).ok_or_else(|| layout_error("Leaf binding required"))?;
    if eq(get(row, "storage"), "scalar-carrier") {
        let carrier = get(row, "carrier").unwrap_or(&Value::Null);
        let slots = if eq(get(carrier, "kind"), "words64") {
            let Value::Object(entries) = input else {
                return Err(layout_error("Complete physical pair object required"));
            };
            let names = carrier_slots(carrier);
            if entries.len() != names.len()
                || names
                    .iter()
                    .any(|name| !entries.iter().any(|(candidate, _)| candidate == name))
            {
                return Err(layout_error("Complete physical pair object required"));
            }
            input.clone()
        } else {
            if !matches!(input, Value::String(_)) {
                return Err(layout_error("Exact carrier string token required"));
            }
            object_value(vec![("value", input.clone())])
        };
        let actual = if eq(get(carrier, "kind"), "words64") {
            slots
        } else {
            let name = text(get(carrier, "column")).unwrap();
            Value::Object(vec![(name.clone(), get(&slots, "value").unwrap().clone())])
        };
        return decode_carrier_value(binding, logical, identity, &actual, ctx);
    }
    decode_scalar_literal(engine, logical, identity, field, input, ctx)
}

/// Encode a complete logical Record into its exact native carrier-slot map.
pub fn encode_record(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    values: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (payload, record, _table) = model_record(binding, logical, identity, ctx)?;
    let (engine, _) = resources(ctx)?;
    let members = array(get(record, "members")).unwrap_or(&[]);
    let Value::Array(values) = values else {
        return Err(layout_error("Exact complete logical row required"));
    };
    if values.len() != members.len() {
        return Err(layout_error("Exact complete logical row required"));
    }
    let mut seen = Vec::new();
    let mut slots = Vec::new();
    for item in values {
        if !matches!(item, Value::Object(fields) if fields.len() == 2)
            || !object_has_only(item, &["field", "value"])
        {
            return Err(layout_error("Malformed logical row Field"));
        }
        let field_id =
            get(item, "field").ok_or_else(|| layout_error("Logical row Field required"))?;
        if !exact_ref(field_id) || seen.iter().any(|prior| same_ref(prior, field_id)) {
            return Err(layout_error("Malformed or duplicate logical row Field"));
        }
        seen.push(field_id.clone());
        let field = field_by_ref(logical, field_id)
            .ok_or_else(|| layout_error("Record member Field missing"))?;
        let row = binding_row(payload, field_id)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        if !members.iter().any(|member| same_ref(member, field_id)) {
            return Err(layout_error("Field is not a Record member"));
        }
        let literal =
            get(item, "value").ok_or_else(|| layout_error("Logical Field value required"))?;
        if eq(get(row, "storage"), "scalar-carrier") {
            if let Value::Object(entries) =
                encode_carrier_value(binding, logical, field_id, literal, ctx)?
            {
                slots.extend(entries);
            }
        } else if is_shape_field(field) {
            let column = text(get(row, "column"))
                .ok_or_else(|| layout_error("Composite root column required"))?
                .clone();
            let encoded = shape_value(binding, logical, field_id, literal, &engine, ctx, 0)?;
            slots.push((
                column,
                if matches!(encoded, Value::Null) {
                    Value::Null
                } else {
                    string_value(canonical_json_text(&encoded))
                },
            ));
        } else {
            let column = text(get(row, "column"))
                .ok_or_else(|| layout_error("Scalar column required"))?
                .clone();
            slots.push((
                column,
                scalar_literal_token(&engine, logical, field_id, field, literal, ctx)?,
            ));
        }
    }
    if seen.len() != members.len()
        || members
            .iter()
            .any(|member| !seen.iter().any(|item| same_ref(item, member)))
    {
        return Err(layout_error("Missing Record member Field"));
    }
    let mut ordered_slots = Vec::new();
    for member in members {
        let row = binding_row(payload, member)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        let names = if eq(get(row, "storage"), "scalar-carrier") {
            carrier_slots(get(row, "carrier").unwrap_or(&Value::Null))
        } else {
            vec![text(get(row, "column"))
                .cloned()
                .ok_or_else(|| layout_error("Carrier slot missing"))?]
        };
        for name in names {
            let value = slots
                .iter()
                .find(|(candidate, _)| candidate == &name)
                .map(|(_, value)| value.clone())
                .ok_or_else(|| layout_error("Record member value missing"))?;
            ordered_slots.push((name, value));
        }
    }
    Ok(Value::Object(ordered_slots))
}

/// Decode an exact native carrier-slot map into a complete logical Record row.
pub fn decode_record(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    slots: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (payload, record, _table) = model_record(binding, logical, identity, ctx)?;
    let (engine, _) = resources(ctx)?;
    let members = array(get(record, "members")).unwrap_or(&[]);
    let Value::Object(entries) = slots else {
        return Err(layout_error("Exact complete native row required"));
    };
    let mut expected = Vec::new();
    for member in members {
        let row = binding_row(payload, member)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        let names = if eq(get(row, "storage"), "scalar-carrier") {
            carrier_slots(get(row, "carrier").unwrap_or(&Value::Null))
        } else {
            vec![text(get(row, "column"))
                .cloned()
                .ok_or_else(|| layout_error("Carrier slot missing"))?]
        };
        for name in names {
            if expected.contains(&name) {
                return Err(layout_error("Physical slot collision in Record"));
            }
            expected.push(name);
        }
    }
    if entries.len() != expected.len()
        || expected
            .iter()
            .any(|name| !entries.iter().any(|(candidate, _)| candidate == name))
    {
        return Err(layout_error("Exact complete native row required"));
    }
    let mut logical_values = Vec::new();
    for member in members {
        let row = binding_row(payload, member)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        let field = field_by_ref(logical, member)
            .ok_or_else(|| layout_error("Record member Field missing"))?;
        let decoded = if eq(get(row, "storage"), "scalar-carrier") {
            let names = carrier_slots(get(row, "carrier").unwrap_or(&Value::Null));
            let native = Value::Object(
                names
                    .iter()
                    .map(|name| {
                        Ok((
                            name.clone(),
                            get_utf16(slots, name)
                                .ok_or_else(|| layout_error("Native slot missing"))?
                                .clone(),
                        ))
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?,
            );
            decode_carrier_value(binding, logical, member, &native, ctx)?
        } else {
            let column =
                text(get(row, "column")).ok_or_else(|| layout_error("Carrier slot missing"))?;
            let token =
                get_utf16(slots, column).ok_or_else(|| layout_error("Native slot missing"))?;
            if is_shape_field(field) {
                let native = if matches!(token, Value::Null) {
                    Value::Null
                } else {
                    let token = text(Some(token))
                        .ok_or_else(|| layout_error("Stored composite JSON token required"))?;
                    read_json_value(token.units(), Format::Json, ctx)?
                };
                let recovered = unshape_value(binding, logical, member, &native, &engine, ctx, 0)?;
                let _ = shape_value(binding, logical, member, &recovered, &engine, ctx, 0)?;
                recovered
            } else {
                decode_scalar_literal(&engine, logical, member, field, token, ctx)?
            }
        };
        logical_values.push(object_value(vec![
            ("field", member.clone()),
            ("value", decoded),
        ]));
    }
    Ok(array_value(logical_values))
}

/// Encode a complete logical row into the JSON-safe Avro/Parquet/TableSpec datum.
pub fn encode_file_record(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    values: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (payload, record, _table) = model_record(binding, logical, identity, ctx)?;
    require_file_record_target(payload)?;
    let (engine, _) = resources(ctx)?;
    let members = array(get(record, "members")).unwrap_or(&[]);
    let Value::Array(values) = values else {
        return Err(layout_error("Exact complete logical row required"));
    };
    if values.len() != members.len() {
        return Err(layout_error("Exact complete logical row required"));
    }
    let mut seen = Vec::new();
    let mut slots = Vec::new();
    for item in values {
        if !matches!(item, Value::Object(fields) if fields.len() == 2)
            || !object_has_only(item, &["field", "value"])
        {
            return Err(layout_error("Malformed logical row Field"));
        }
        let field_id =
            get(item, "field").ok_or_else(|| layout_error("Logical row Field required"))?;
        if !exact_ref(field_id) || seen.iter().any(|previous| same_ref(previous, field_id)) {
            return Err(layout_error("Malformed or duplicate logical row Field"));
        }
        seen.push(field_id.clone());
        let field = field_by_ref(logical, field_id)
            .ok_or_else(|| layout_error("Record member Field missing"))?;
        let row = binding_row(payload, field_id)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        if !members.iter().any(|member| same_ref(member, field_id)) {
            return Err(layout_error("Field is not a Record member"));
        }
        let literal =
            get(item, "value").ok_or_else(|| layout_error("Logical Field value required"))?;
        if eq(get(row, "storage"), "scalar-carrier") {
            let encoded = encode_carrier_value(binding, logical, field_id, literal, ctx)?;
            if let Value::Object(entries) = encoded {
                slots.extend(entries);
            }
        } else if is_shape_field(field) {
            let column = text(get(row, "column"))
                .ok_or_else(|| layout_error("Composite root column required"))?
                .clone();
            let encoded = shape_value(binding, logical, field_id, literal, &engine, ctx, 0)?;
            slots.push((
                column,
                if matches!(encoded, Value::Null) {
                    Value::Null
                } else {
                    string_value(canonical_json_text(&encoded))
                },
            ));
        } else {
            let column = text(get(row, "column"))
                .ok_or_else(|| layout_error("Scalar column required"))?
                .clone();
            slots.push((
                column,
                scalar_literal_token(&engine, logical, field_id, field, literal, ctx)?,
            ));
        }
    }
    if seen.len() != members.len()
        || members
            .iter()
            .any(|member| !seen.iter().any(|item| same_ref(item, member)))
    {
        return Err(layout_error("Missing Record member Field"));
    }
    let mut datum = Vec::new();
    for member in members {
        let row = binding_row(payload, member)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        let name = file_field_name(row);
        let carrier = get(row, "carrier").unwrap_or(&Value::Null);
        if eq(get(carrier, "kind"), "words64") {
            let high = text(get(carrier, "highColumn"))
                .ok_or_else(|| layout_error("Pair high slot missing"))?;
            let low = text(get(carrier, "lowColumn"))
                .ok_or_else(|| layout_error("Pair low slot missing"))?;
            let high_value = slots
                .iter()
                .find(|(slot, _)| slot == high)
                .map(|(_, value)| value)
                .ok_or_else(|| layout_error("Pair high value missing"))?;
            let low_value = slots
                .iter()
                .find(|(slot, _)| slot == low)
                .map(|(_, value)| value)
                .ok_or_else(|| layout_error("Pair low value missing"))?;
            let value = if matches!(high_value, Value::Null) {
                Value::Null
            } else {
                Value::Object(vec![
                    (high.clone(), high_value.clone()),
                    (low.clone(), low_value.clone()),
                ])
            };
            datum.push((name, value));
        } else if eq(get(row, "storage"), "column") {
            let slot =
                text(get(row, "column")).ok_or_else(|| layout_error("Carrier slot missing"))?;
            let value = slots
                .iter()
                .find(|(candidate, _)| candidate == slot)
                .map(|(_, value)| value.clone())
                .ok_or_else(|| layout_error("Carrier value missing"))?;
            let field = field_by_ref(logical, member)
                .ok_or_else(|| layout_error("Record member Field missing"))?;
            if is_shape_field(field) {
                if matches!(value, Value::Null) {
                    datum.push((name, Value::Null));
                } else if eq(
                    get(get(payload, "target").unwrap_or(&Value::Null), "system"),
                    "tablespec",
                ) {
                    datum.push((name, value));
                } else {
                    let token = text(Some(&value))
                        .ok_or_else(|| layout_error("Stored composite JSON token required"))?;
                    let native = read_json_value(token.units(), Format::Json, ctx)?;
                    datum.push((name, native));
                }
            } else {
                datum.push((name, value));
            }
        } else {
            let slot =
                text(get(carrier, "column")).ok_or_else(|| layout_error("Carrier slot missing"))?;
            let value = slots
                .iter()
                .find(|(candidate, _)| candidate == slot)
                .map(|(_, value)| value.clone())
                .ok_or_else(|| layout_error("Carrier value missing"))?;
            datum.push((name, value));
        }
    }
    Ok(Value::Object(datum))
}

/// Decode a complete JSON-safe native row and recover exact logical carrier literals.
pub fn decode_file_record(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    datum: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (payload, record, _table) = model_record(binding, logical, identity, ctx)?;
    require_file_record_target(payload)?;
    let (engine, _) = resources(ctx)?;
    let members = array(get(record, "members")).unwrap_or(&[]);
    let Value::Object(entries) = datum else {
        return Err(layout_error("Exact complete native datum required"));
    };
    let names: Vec<_> = members
        .iter()
        .map(|member| {
            binding_row(payload, member)
                .map(file_field_name)
                .ok_or_else(|| layout_error("Record member binding missing"))
        })
        .collect::<Result<_, _>>()?;
    if entries.len() != names.len()
        || names
            .iter()
            .any(|name| !entries.iter().any(|(candidate, _)| candidate == name))
    {
        return Err(layout_error("Exact complete native datum required"));
    }
    let mut logical_values = Vec::new();
    for member in members {
        let row = binding_row(payload, member)
            .ok_or_else(|| layout_error("Record member binding missing"))?;
        let field = field_by_ref(logical, member)
            .ok_or_else(|| layout_error("Record member Field missing"))?;
        let carrier = get(row, "carrier").unwrap_or(&Value::Null);
        let name = file_field_name(row);
        let value =
            get_utf16(datum, &name).ok_or_else(|| layout_error("Native datum Field missing"))?;
        let decoded = if eq(get(row, "storage"), "scalar-carrier") {
            let mut native = Vec::new();
            if eq(get(carrier, "kind"), "words64") {
                if matches!(value, Value::Null) {
                    native.push((
                        text(get(carrier, "highColumn")).unwrap().clone(),
                        Value::Null,
                    ));
                    native.push((
                        text(get(carrier, "lowColumn")).unwrap().clone(),
                        Value::Null,
                    ));
                } else {
                    let high = text(get(carrier, "highColumn")).unwrap().clone();
                    let low = text(get(carrier, "lowColumn")).unwrap().clone();
                    if !matches!(value, Value::Object(fields) if fields.len() == 2 && fields.iter().any(|(key, _)| key == &high) && fields.iter().any(|(key, _)| key == &low))
                    {
                        return Err(layout_error("Exact complete pair group required"));
                    }
                    native.push((
                        high.clone(),
                        get_utf16(value, &high)
                            .filter(|v| matches!(v, Value::String(_)))
                            .cloned()
                            .ok_or_else(|| {
                                layout_error("Present pair requires exact high token")
                            })?,
                    ));
                    native.push((
                        low.clone(),
                        get_utf16(value, &low)
                            .filter(|v| matches!(v, Value::String(_)))
                            .cloned()
                            .ok_or_else(|| layout_error("Present pair requires exact low token"))?,
                    ));
                }
            } else {
                if !matches!(value, Value::Null | Value::String(_)) {
                    return Err(layout_error("Exact string token or null required"));
                }
                native.push((text(get(carrier, "column")).unwrap().clone(), value.clone()));
            }
            decode_carrier_value(binding, logical, member, &Value::Object(native), ctx)?
        } else if is_shape_field(field) {
            let native = if matches!(value, Value::Null) {
                Value::Null
            } else if eq(
                get(get(payload, "target").unwrap_or(&Value::Null), "system"),
                "tablespec",
            ) {
                let token = text(Some(value))
                    .ok_or_else(|| layout_error("TableSpec composite JSON token required"))?;
                let parsed = read_json_value(token.units(), Format::Json, ctx)?;
                if matches!(parsed, Value::Null) {
                    return Err(layout_error("JSON null is not a file absence token"));
                }
                parsed
            } else {
                value.clone()
            };
            let recovered = unshape_value(binding, logical, member, &native, &engine, ctx, 0)?;
            let _ = shape_value(binding, logical, member, &recovered, &engine, ctx, 0)?;
            recovered
        } else {
            decode_scalar_literal(&engine, logical, member, field, value, ctx)?
        };
        logical_values.push(object_value(vec![
            ("field", member.clone()),
            ("value", decoded),
        ]));
    }
    Ok(array_value(logical_values))
}

/// Construct the current one-Field Bit128 carrier schema proposal and retain
/// every requested preservation obligation and source diagnostic.
pub fn project_carrier_schema(
    binding: &Value,
    logical: &Value,
    identity: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !exact_ref(identity)
        || !matches!(policy, Value::Object(fields) if fields.len() == 2)
        || !object_has_only(policy, &["lossPolicy", "obligations"])
        || !(eq(get(policy, "lossPolicy"), "strict") || eq(get(policy, "lossPolicy"), "report"))
    {
        return Err(layout_error(
            "Explicit Field identity, loss policy and obligations required",
        ));
    }
    let obligations = array(get(policy, "obligations"))
        .filter(|rows| !rows.is_empty())
        .ok_or_else(|| layout_error("At least one preservation obligation required"))?;
    let allowed = [
        "bits",
        "availability",
        "equality",
        "ordering",
        "enforcement",
    ];
    let mut seen = Vec::new();
    for obligation in obligations {
        let name = text(Some(obligation))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if !allowed.contains(&name.as_str()) || seen.iter().any(|prior: &String| prior == &name) {
            return Err(layout_error("Unknown or duplicate preservation obligation"));
        }
        seen.push(name);
    }
    let inspected = inspect_bit128_binding(binding, logical, ctx)?;
    if !inspected.valid || !inspected.complete {
        return Err(EngineError::new(
            "BIT128_PROJECTION",
            Utf16::default(),
            "Complete valid Bit128 binding required",
        ));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let target = get(payload, "target").unwrap_or(&Value::Null);
    let system = text(get(target, "system"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let version = text(get(target, "version"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let profile = match system.as_str() {
        "postgresql" if version == "17" || version.starts_with("17.") => "sql",
        "sqlserver" if version == "2022" => "sql",
        "avro" if version == "1.12.0" => "avro",
        "parquet" if version == "2.11.0" => "parquet",
        "tablespec" if version == "1.0" => "tablespec",
        _ => {
            return Err(EngineError::new(
                "BIT128_PROJECTION",
                Utf16::default(),
                "Unsupported versioned carrier target",
            ))
        }
    };
    let row = exact_binding_row(payload, identity)?;
    if !eq(get(row, "storage"), "scalar-carrier") {
        return Err(layout_error("Selected scalar carrier Field required"));
    }
    let carrier = get(row, "carrier").unwrap_or(&Value::Null);
    let kind = text(get(carrier, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let field =
        field_by_ref(logical, identity).ok_or_else(|| layout_error("Selected Field missing"))?;
    if !eq(get(field, "kind"), "field") {
        return Err(layout_error("Selected Field identity required"));
    }
    let required = eq(get(field, "nullability"), "required");
    let pair = kind == "words64";
    let native_uuid = kind == "native-uuid";
    let slots = carrier_slots(carrier);
    let names: Vec<String> = slots
        .iter()
        .map(utf8_boundary)
        .collect::<Result<Vec<_>, _>>()?;
    let owner = elements(logical).into_iter().find(|(record, _, _)| {
        eq(get(record, "kind"), "record")
            && array(get(record, "members"))
                .is_some_and(|members| members.iter().any(|member| same_ref(member, identity)))
    });
    let table_row = array(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .find(|bound| {
            owner.as_ref().is_some_and(|(_, module, element)| {
                text(get(bound, "module")) == Some(module)
                    && text(get(bound, "element")) == Some(element)
            })
        })
        .or_else(|| {
            array(get(payload, "elements"))
                .unwrap_or(&[])
                .iter()
                .find(|bound| same_ref(bound, identity))
        })
        .ok_or_else(|| layout_error("Exact table/Record binding required"))?;
    let table =
        text(get(table_row, "table")).ok_or_else(|| layout_error("Exact native table required"))?;
    if profile == "avro" {
        let name = utf8_boundary(table)?;
        let valid = !name.is_empty()
            && name
                .chars()
                .next()
                .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
            && name
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
            && ![
                "null", "boolean", "int", "long", "float", "double", "bytes", "string",
            ]
            .contains(&name.as_str())
            && names.iter().all(|name| {
                !name.is_empty()
                    && name
                        .chars()
                        .next()
                        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
                    && name
                        .chars()
                        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
            });
        if !valid {
            return Err(layout_error("Invalid native Avro name"));
        }
    }
    let subset_supported = eq(get(target, "subset"), "uuid-carrier1");
    let q = |name: &str| {
        if system == "postgresql" {
            format!("\"{}\"", name.replace('"', "\"\""))
        } else {
            format!("[{}]", name.replace(']', "]]"))
        }
    };
    let mut supported = subset_supported;
    let candidate_text;
    if profile == "sql" {
        if pair && !matches!(get(carrier, "signed"), Some(Value::Bool(true))) {
            supported = false;
        }
        let typ = if pair {
            "bigint"
        } else if native_uuid {
            if system == "postgresql" {
                "uuid"
            } else {
                "uniqueidentifier"
            }
        } else if kind == "bytes16" {
            if system == "postgresql" {
                "bytea"
            } else {
                "varbinary(16)"
            }
        } else if kind == "uuid-text" {
            if system == "postgresql" {
                "varchar(36)"
            } else {
                "varchar(36)"
            }
        } else {
            if system == "postgresql" {
                "varchar(32)"
            } else {
                "varchar(32)"
            }
        };
        let mut columns: Vec<String> = names
            .iter()
            .map(|name| {
                format!(
                    "{} {}{}",
                    q(name),
                    typ,
                    if required {
                        " NOT NULL"
                    } else if system == "sqlserver" {
                        " NULL"
                    } else {
                        ""
                    }
                )
            })
            .collect();
        if kind == "bytes16" {
            columns.push(format!(
                "CHECK ({}({}) = 16)",
                if system == "postgresql" {
                    "octet_length"
                } else {
                    "DATALENGTH"
                },
                q(&names[0])
            ));
        }
        if pair && !required {
            columns.push(if system == "postgresql" {
                format!(
                    "CHECK (({} IS NULL) = ({} IS NULL))",
                    q(&names[0]),
                    q(&names[1])
                )
            } else {
                format!(
                    "CHECK (({} IS NULL AND {} IS NULL) OR ({} IS NOT NULL AND {} IS NOT NULL))",
                    q(&names[0]),
                    q(&names[1]),
                    q(&names[0]),
                    q(&names[1])
                )
            });
        }
        candidate_text = format!(
            "CREATE TABLE {} ({});",
            q(&utf8_boundary(table)?),
            columns.join(", ")
        );
    } else if profile == "avro" {
        let native_type = if pair {
            string_value("long")
        } else if native_uuid {
            object_value(vec![
                ("type", string_value("fixed")),
                (
                    "name",
                    string_value(if table == &key("Umf128Value") {
                        "Umf128ValueField"
                    } else {
                        "Umf128Value"
                    }),
                ),
                ("size", Value::Number(16.0)),
                ("logicalType", string_value("uuid")),
            ])
        } else if kind == "bytes16" {
            object_value(vec![
                ("type", string_value("fixed")),
                ("name", string_value("Umf128Value")),
                ("size", Value::Number(16.0)),
            ])
        } else if kind == "uuid-text" {
            object_value(vec![
                ("type", string_value("string")),
                ("logicalType", string_value("uuid")),
            ])
        } else {
            string_value("string")
        };
        let fields = names
            .iter()
            .map(|name| {
                object_value(vec![
                    ("name", string_value(name)),
                    (
                        "type",
                        if required {
                            native_type.clone()
                        } else {
                            array_value(vec![string_value("null"), native_type.clone()])
                        },
                    ),
                ])
            })
            .collect();
        candidate_text = json_text(&object_value(vec![
            ("type", string_value("record")),
            ("name", Value::String(table.clone())),
            ("fields", array_value(fields)),
        ]));
        if pair && !matches!(get(carrier, "signed"), Some(Value::Bool(true))) {
            supported = false;
        }
    } else if profile == "parquet" {
        let columns = names
            .iter()
            .map(|name| {
                let mut row = vec![
                    ("name", string_value(name)),
                    (
                        "physicalType",
                        string_value(if pair {
                            "INT64"
                        } else if native_uuid || kind == "bytes16" {
                            "FIXED_LEN_BYTE_ARRAY"
                        } else {
                            "BYTE_ARRAY"
                        }),
                    ),
                ];
                if native_uuid || kind == "bytes16" {
                    row.push(("length", Value::Number(16.0)));
                }
                row.push((
                    "logicalType",
                    if native_uuid {
                        string_value("UUID")
                    } else if pair {
                        string_value("INTEGER")
                    } else if kind == "bytes16" {
                        Value::Null
                    } else {
                        string_value("STRING")
                    },
                ));
                if pair {
                    row.push(("bitWidth", Value::Number(64.0)));
                    row.push((
                        "isSigned",
                        get(carrier, "signed")
                            .cloned()
                            .unwrap_or(Value::Bool(false)),
                    ));
                }
                row.push(("nullable", Value::Bool(!required)));
                object_value(row)
            })
            .collect();
        candidate_text = json_text(&object_value(vec![
            ("name", Value::String(table.clone())),
            ("columns", array_value(columns)),
        ]));
    } else {
        if pair || native_uuid || kind == "bytes16" {
            supported = false;
        }
        let columns = names
            .iter()
            .map(|name| {
                let mut row = vec![
                    ("name", string_value(name)),
                    ("data_type", string_value("VARCHAR")),
                ];
                if kind == "uuid-text" || kind == "hex128-text" {
                    row.push((
                        "length",
                        Value::Number(if kind == "uuid-text" { 36.0 } else { 32.0 }),
                    ));
                }
                row.push((
                    "nullable",
                    object_value(vec![("default", Value::Bool(!required))]),
                ));
                object_value(row)
            })
            .collect();
        candidate_text = json_text(&object_value(vec![
            ("version", string_value("1.0")),
            ("table_name", Value::String(table.clone())),
            ("columns", array_value(columns)),
        ]));
    }
    let mut outcomes = Vec::new();
    for obligation in obligations {
        let name = text(Some(obligation))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let (outcome, reason) = if !supported {
            (
                "not-expressible",
                "Selected carrier is outside the versioned target subset",
            )
        } else if name == "ordering" {
            (
                "unknown",
                "Native order is not qualified as portable unsigned byte order",
            )
        } else if name == "equality" && !native_uuid && !pair && kind != "bytes16" {
            (
                "unknown",
                "Native text collation/external-write canonicality requires separate qualification",
            )
        } else if name == "enforcement" && (kind == "uuid-text" || kind == "hex128-text") {
            (
                "not-expressible",
                "Text carrier schema does not enforce complete canonical logical grammar",
            )
        } else if name == "enforcement"
            && (get(field, "allowedValues").is_some()
                || get(field, "default").is_some()
                || get(field, "facets").is_some())
        {
            (
                "not-expressible",
                "Field refinements/defaults are retained but not emitted by this bounded proposal",
            )
        } else if name == "availability"
            && pair
            && !required
            && (system == "avro" || system == "parquet")
        {
            (
                "not-expressible",
                "Independent nullable slots do not enforce all-or-none absence",
            )
        } else if name != "bits" && system == "tablespec" {
            (
                "unknown",
                "Declared TableSpec schema does not certify Spark/native value semantics",
            )
        } else {
            ("exact", "Explicit carrier recipe preserves all 128 bits")
        };
        outcomes.push(object_value(vec![
            ("obligation", string_value(name)),
            ("outcome", string_value(outcome)),
            ("reason", string_value(reason)),
        ]));
    }
    if array(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .any(|row| {
            get(row, "partition").is_some_and(|value| !matches!(value, Value::Null))
                && (same_ref(row, identity)
                    || owner.as_ref().is_some_and(|(_, module, element)| {
                        text(get(row, "module")) == Some(module)
                            && text(get(row, "element")) == Some(element)
                    }))
        })
    {
        outcomes.push(object_value(vec![
            ("obligation", string_value("enforcement")),
            ("outcome", string_value("not-expressible")),
            (
                "reason",
                string_value(
                    "Selected partition layout retained but not emitted by the one-Field proposal",
                ),
            ),
        ]));
    }
    for (member, meaning) in [
        ("allowedValues", "allowed values"),
        ("default", "default"),
        ("facets", "facets"),
    ] {
        if get(field, member).is_some()
            && !outcomes.iter().any(|row| {
                eq(get(row, "obligation"), "enforcement") && !eq(get(row, "outcome"), "exact")
            })
        {
            outcomes.push(object_value(vec![
                ("obligation", string_value("enforcement")),
                ("outcome", string_value("not-expressible")),
                (
                    "reason",
                    string_value(format!("{meaning} retained in source but not emitted")),
                ),
            ]));
        }
    }
    let mut source_diags = Vec::new();
    let (engine, _) = resources(ctx)?;
    let mut no_extensions = NoExtensions;
    let source_validation =
        engine.validate_document(logical, &Registry::new(), &mut no_extensions, ctx)?;
    source_diags.extend(source_validation.diagnostics.into_iter().map(|d| {
        Value::Object(vec![
            (key("code"), Value::String(d.code)),
            (key("path"), Value::String(d.path)),
            (key("message"), Value::String(d.message)),
            (
                key("severity"),
                string_value(if d.severity == Severity::Error {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ])
    }));
    let module_index = array(get(logical, "modules"))
        .unwrap_or(&[])
        .iter()
        .position(|module| text(get(module, "id")) == text(get(identity, "module")))
        .ok_or_else(|| layout_error("Field module missing"))?;
    let module = &array(get(logical, "modules")).unwrap()[module_index];
    let element_index = array(get(module, "elements"))
        .unwrap_or(&[])
        .iter()
        .position(|element| text(get(element, "id")) == text(get(identity, "element")))
        .ok_or_else(|| layout_error("Field element missing"))?;
    let ideal_path = format!("/modules/{module_index}/elements/{element_index}");
    if kind == "uuid-text" || kind == "hex128-text" {
        source_diags.push(Value::Object(vec![(key("code"), string_value("BIT128_TEXT_NOT_ENFORCED")), (key("path"), string_value(&ideal_path)), (key("message"), string_value("Canonical carrier writes preserve bits; the target schema does not establish complete text grammar, collation or external-writer enforcement")), (key("severity"), string_value("warning"))]));
    }
    if pair && !required && (system == "avro" || system == "parquet") {
        source_diags.push(Value::Object(vec![(key("code"), string_value("BIT128_PAIR_PRESENCE_NOT_ENFORCED")), (key("path"), string_value(&ideal_path)), (key("message"), string_value("The native schema permits partial-null pairs; the portable decoder refuses them")), (key("severity"), string_value("warning"))]));
    }
    if system == "tablespec" {
        source_diags.push(Value::Object(vec![(key("code"), string_value("BIT128_TABLESPEC_MODEL_ONLY")), (key("path"), string_value(&ideal_path)), (key("message"), string_value("This target is the captured native model; checked-in JSON Schema agreement and Spark execution are not established")), (key("severity"), string_value("warning"))]));
    }
    let losses = outcomes.iter().any(|row| !eq(get(row, "outcome"), "exact"));
    let blocked = !supported || losses && eq(get(policy, "lossPolicy"), "strict");
    let status = if blocked {
        "blocked"
    } else if losses {
        "reported"
    } else {
        "projected"
    };
    let candidate = object_value(vec![
        ("format", string_value(profile)),
        ("text", string_value(&candidate_text)),
    ]);
    let mapping = object_value(vec![
        ("idealPath", string_value(&ideal_path)),
        (
            "targetSlots",
            array_value(
                names
                    .iter()
                    .map(|name| {
                        let name = Utf16::from(name.as_str());
                        Ok(string_value(format!(
                            "/tables/{}/columns/{}",
                            utf8_boundary(&pointer(table))?,
                            utf8_boundary(&pointer(&name))?
                        )))
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?,
            ),
        ),
        ("bindingVersion", string_value("0.3.0")),
        ("target", target.clone()),
    ]);
    ctx.charge_text(candidate_text.encode_utf16().count(), Utf16::default())?;
    let mut result = vec![
        (
            key("operation"),
            string_value("project-bit128-carrier-schema"),
        ),
        (key("version"), string_value("1.0.0")),
        (key("source"), logical.clone()),
        (key("binding"), binding.clone()),
        (key("identity"), identity.clone()),
        (key("policy"), policy.clone()),
        (key("outcomes"), array_value(outcomes)),
        (key("status"), string_value(status)),
        (key("diagnostics"), array_value(source_diags)),
        (key("mapping"), mapping),
    ];
    if status != "blocked" {
        result.push((key("candidate"), candidate));
    }
    Ok(Value::Object(result))
}

pub fn recover_carrier_projection(
    report_value: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !eq(
        get(report_value, "operation"),
        "project-bit128-carrier-schema",
    ) || !eq(get(report_value, "version"), "1.0.0")
    {
        return Err(EngineError::new(
            "BIT128_PROJECTION",
            Utf16::default(),
            "Versioned Bit128 carrier report required",
        ));
    }
    let expected = project_carrier_schema(
        get(report_value, "binding").ok_or_else(|| layout_error("Report binding required"))?,
        get(report_value, "source").ok_or_else(|| layout_error("Report source required"))?,
        get(report_value, "identity").ok_or_else(|| layout_error("Report identity required"))?,
        get(report_value, "policy").ok_or_else(|| layout_error("Report policy required"))?,
        ctx,
    )?;
    if &expected != report_value
        || text(Some(native_text))
            != get(&expected, "candidate").and_then(|candidate| text(get(candidate, "text")))
    {
        return Err(EngineError::new(
            "BIT128_PROJECTION",
            Utf16::default(),
            "Stale/forged projection or changed native artifact",
        ));
    }
    Ok(object_value(vec![
        ("logical", get(&expected, "source").unwrap().clone()),
        ("binding", get(&expected, "binding").unwrap().clone()),
    ]))
}

fn json_string(value: &Utf16) -> String {
    let mut output = String::from("\"");
    for unit in value.units() {
        match *unit {
            0x22 => output.push_str("\\\""),
            0x5c => output.push_str("\\\\"),
            0x08 => output.push_str("\\b"),
            0x0c => output.push_str("\\f"),
            0x0a => output.push_str("\\n"),
            0x0d => output.push_str("\\r"),
            0x09 => output.push_str("\\t"),
            0x20..=0x7e => output.push(char::from_u32(*unit as u32).unwrap()),
            other => output.push_str(&format!("\\u{other:04x}")),
        }
    }
    output.push('"');
    output
}
fn json_text(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => serde_json::Number::from_f64(*value)
            .map(|n| n.to_string())
            .unwrap_or_else(|| "null".into()),
        Value::String(value) => json_string(value),
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(json_text).collect::<Vec<_>>().join(",")
        ),
        Value::Object(fields) => format!(
            "{{{}}}",
            fields
                .iter()
                .map(|(name, value)| format!("{}:{}", json_string(name), json_text(value)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

#[cfg(test)]
mod utf16_render_tests {
    use super::{json_text, Utf16, Value};

    #[test]
    fn json_text_retains_isolated_surrogates_in_unknown_names_and_values() {
        let value = Value::Object(vec![(
            Utf16::new(vec![b'x' as u16, 0xd800]),
            Value::String(Utf16::new(vec![b'y' as u16, 0xdc00])),
        )]);
        assert_eq!(json_text(&value), r#"{"x\ud800":"y\udc00"}"#);
    }
}

fn string_value(text: impl AsRef<str>) -> Value {
    Value::string_utf8(text)
}
fn array_value(items: Vec<Value>) -> Value {
    Value::Array(items)
}
fn object_value(items: Vec<(&str, Value)>) -> Value {
    Value::Object(items.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn native_slots(field_row: &Value) -> Vec<Utf16> {
    carrier_slots(get(field_row, "carrier").unwrap_or(&Value::Null))
}
fn model_identity(module: &Utf16, element: &Utf16) -> Value {
    object_value(vec![
        ("module", Value::String(module.clone())),
        ("element", Value::String(element.clone())),
    ])
}
fn shape_output(
    source: &Value,
    payload: &Value,
    identity: &Value,
    avro: bool,
    name: &str,
    namespace: &str,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > 64 {
        return Err(layout_error("Shape expansion exceeds depth limit"));
    }
    let field = field_by_ref(source, identity)
        .filter(|f| eq(get(f, "kind"), "field"))
        .ok_or_else(|| layout_error("Shape Field missing"))?;
    let cardinality = text(get(field, "cardinality"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let mut result = if cardinality == "array" {
        let item =
            get(field, "itemType").ok_or_else(|| layout_error("Array item identity required"))?;
        if avro {
            object_value(vec![
                ("type", string_value("array")),
                (
                    "items",
                    shape_output(
                        source,
                        payload,
                        item,
                        true,
                        "element",
                        &format!("{namespace}_item"),
                        depth + 1,
                        ctx,
                    )?,
                ),
            ])
        } else {
            object_value(vec![
                ("name", string_value(name)),
                (
                    "nullable",
                    Value::Bool(!eq(get(field, "nullability"), "required")),
                ),
                ("physicalType", string_value("GROUP")),
                ("logicalType", string_value("LIST")),
                (
                    "item",
                    shape_output(
                        source,
                        payload,
                        item,
                        false,
                        "element",
                        namespace,
                        depth + 1,
                        ctx,
                    )?,
                ),
            ])
        }
    } else if cardinality == "map" {
        let item =
            get(field, "itemType").ok_or_else(|| layout_error("Map item identity required"))?;
        if avro {
            object_value(vec![
                ("type", string_value("map")),
                (
                    "values",
                    shape_output(
                        source,
                        payload,
                        item,
                        true,
                        "value",
                        &format!("{namespace}_value"),
                        depth + 1,
                        ctx,
                    )?,
                ),
            ])
        } else {
            object_value(vec![
                ("name", string_value(name)),
                (
                    "nullable",
                    Value::Bool(!eq(get(field, "nullability"), "required")),
                ),
                ("physicalType", string_value("GROUP")),
                ("logicalType", string_value("MAP")),
                (
                    "value",
                    shape_output(
                        source,
                        payload,
                        item,
                        false,
                        "value",
                        namespace,
                        depth + 1,
                        ctx,
                    )?,
                ),
            ])
        }
    } else if let Some(reference) = array(get(field, "references")).and_then(|rows| rows.first()) {
        let group_ref = Value::Object(vec![
            (
                key("module"),
                get(reference, "module").cloned().unwrap_or(Value::Null),
            ),
            (
                key("element"),
                get(reference, "element").cloned().unwrap_or(Value::Null),
            ),
        ]);
        let row = array(get(payload, "groups"))
            .unwrap_or(&[])
            .iter()
            .find(|row| same_ref(row, &group_ref))
            .ok_or_else(|| layout_error("Group layout missing"))?;
        let members = array(get(row, "members")).unwrap_or(&[]);
        if avro {
            let fields = members
                .iter()
                .enumerate()
                .map(|(i, member)| {
                    Ok(object_value(vec![
                        ("name", string_value(format!("m{i}"))),
                        (
                            "type",
                            shape_output(
                                source,
                                payload,
                                member,
                                true,
                                &format!("m{i}"),
                                &format!("{namespace}_m{i}"),
                                depth + 1,
                                ctx,
                            )?,
                        ),
                    ]))
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            object_value(vec![
                ("type", string_value("record")),
                ("name", string_value(namespace)),
                ("namespace", string_value("umf.composition")),
                ("fields", array_value(fields)),
            ])
        } else {
            let children = members
                .iter()
                .enumerate()
                .map(|(i, member)| {
                    shape_output(
                        source,
                        payload,
                        member,
                        false,
                        &format!("m{i}"),
                        namespace,
                        depth + 1,
                        ctx,
                    )
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            object_value(vec![
                ("name", string_value(name)),
                (
                    "nullable",
                    Value::Bool(!eq(get(field, "nullability"), "required")),
                ),
                ("children", array_value(children)),
            ])
        }
    } else {
        let row = binding_row(payload, identity)
            .ok_or_else(|| layout_error("Shape leaf binding missing"))?;
        let carrier = get(row, "carrier").unwrap_or(&Value::Null);
        let kind = text(get(carrier, "kind"))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if avro {
            if kind == "words64" {
                let fields = ["highColumn", "lowColumn"]
                    .iter()
                    .map(|slot| {
                        object_value(vec![
                            ("name", get(carrier, slot).cloned().unwrap_or(Value::Null)),
                            ("type", string_value("long")),
                        ])
                    })
                    .collect();
                object_value(vec![
                    ("type", string_value("record")),
                    ("name", string_value(namespace)),
                    ("namespace", string_value("umf.composition")),
                    ("fields", array_value(fields)),
                ])
            } else if kind == "native-uuid" || kind == "bytes16" {
                let mut fixed = vec![
                    ("type", string_value("fixed")),
                    ("name", string_value(namespace)),
                    ("namespace", string_value("umf.composition")),
                    ("size", Value::Number(16.0)),
                ];
                if kind == "native-uuid" {
                    fixed.push(("logicalType", string_value("uuid")));
                }
                object_value(fixed)
            } else if kind == "uuid-text" {
                object_value(vec![
                    ("type", string_value("string")),
                    ("logicalType", string_value("uuid")),
                ])
            } else {
                string_value("string")
            }
        } else if kind == "words64" {
            let children = ["highColumn", "lowColumn"]
                .iter()
                .map(|slot| {
                    object_value(vec![
                        ("name", get(carrier, slot).cloned().unwrap_or(Value::Null)),
                        ("nullable", Value::Bool(false)),
                        ("physicalType", string_value("INT64")),
                        ("logicalType", string_value("INTEGER")),
                        ("bitWidth", Value::Number(64.0)),
                        (
                            "isSigned",
                            get(carrier, "signed")
                                .cloned()
                                .unwrap_or(Value::Bool(false)),
                        ),
                    ])
                })
                .collect();
            object_value(vec![
                ("name", string_value(name)),
                (
                    "nullable",
                    Value::Bool(!eq(get(field, "nullability"), "required")),
                ),
                ("children", array_value(children)),
            ])
        } else {
            let native = kind == "native-uuid" || kind == "bytes16";
            let mut fields = vec![
                ("name", string_value(name)),
                (
                    "nullable",
                    Value::Bool(!eq(get(field, "nullability"), "required")),
                ),
                (
                    "physicalType",
                    string_value(if native {
                        "FIXED_LEN_BYTE_ARRAY"
                    } else {
                        "BYTE_ARRAY"
                    }),
                ),
            ];
            if native {
                fields.push(("length", Value::Number(16.0)));
            }
            fields.push((
                "logicalType",
                if kind == "native-uuid" {
                    string_value("UUID")
                } else if kind == "bytes16" {
                    Value::Null
                } else {
                    string_value("STRING")
                },
            ));
            object_value(fields)
        }
    };
    if avro && !eq(get(field, "nullability"), "required") {
        result = array_value(vec![string_value("null"), result]);
    }
    Ok(result)
}
fn table_for(payload: &Value, record: &Value) -> Result<Utf16, EngineError> {
    array(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .find(|row| same_ref(row, record))
        .and_then(|row| text(get(row, "table")))
        .cloned()
        .ok_or_else(|| layout_error("Explicit native Record table required"))
}

fn sql_literal_slots(
    engine: &Engine,
    binding: &Value,
    logical: &Value,
    identity: &Value,
    field: &Value,
    row: &Value,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Value)>, EngineError> {
    if eq(get(row, "storage"), "scalar-carrier") {
        let encoded = encode_carrier_value(binding, logical, identity, literal, ctx)?;
        let names = native_slots(row);
        return names
            .iter()
            .map(|name| {
                Ok((
                    name.clone(),
                    get_utf16(&encoded, name)
                        .cloned()
                        .ok_or_else(|| layout_error("Missing encoded default slot"))?,
                ))
            })
            .collect();
    }
    if is_shape_field(field) {
        return Err(EngineError::new(
            "BIT128_MODEL_DEFAULT",
            Utf16::default(),
            "Composite defaults need a separately qualified SQL expression",
        ));
    }
    let column = text(get(row, "column"))
        .cloned()
        .ok_or_else(|| layout_error("Scalar SQL column required"))?;
    Ok(vec![(
        column,
        scalar_literal_token(engine, logical, identity, field, literal, ctx)?,
    )])
}

fn sql_literal_expression(
    token: &Value,
    field: &Value,
    row: &Value,
    postgres: bool,
) -> Result<String, EngineError> {
    if matches!(token, Value::Null) {
        return Ok("NULL".into());
    }
    let token = text(Some(token))
        .and_then(|v| v.to_utf8().ok())
        .ok_or_else(|| layout_error("Exact native SQL literal token required"))?;
    let carrier = get(row, "carrier").unwrap_or(&Value::Null);
    let kind = text(get(carrier, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let scalar = text(get(field, "scalarType"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if eq(get(row, "storage"), "scalar-carrier") {
        return Ok(match kind.as_str() {
            "words64" => token,
            "bytes16" if postgres => format!("decode('{}','hex')", token),
            "bytes16" => format!("0x{}", token),
            _ => format!("'{}'", token.replace('\'', "''")),
        });
    }
    Ok(match scalar.as_str() {
        "boolean" if postgres => token,
        "boolean" => {
            if token == "true" {
                "1".into()
            } else {
                "0".into()
            }
        }
        "integer" | "decimal" => format!("'{}'", token.replace('\'', "''")),
        "binary" if postgres => format!("decode('{}','hex')", token),
        "binary" => format!("0x{}", token),
        _ => format!(
            "{}'{}'",
            if postgres { "" } else { "N" },
            token.replace('\'', "''")
        ),
    })
}

fn sql_index_bytes(field: &Value, row: &Value) -> Result<usize, EngineError> {
    let carrier = get(row, "carrier").unwrap_or(&Value::Null);
    let kind = text(get(carrier, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if kind == "json" || is_shape_field(field) {
        return Err(EngineError::new(
            "MODEL_KEY_WIDTH",
            Utf16::default(),
            "Composite document indexes require an explicit path profile",
        ));
    }
    if kind == "scalar-carrier" {
        return Err(layout_error("Invalid scalar carrier kind"));
    }
    if eq(get(row, "storage"), "scalar-carrier") {
        return Ok(match kind.as_str() {
            "uuid-text" => 74,
            "hex128-text" => 66,
            _ => 16,
        });
    }
    let scalar = text(get(field, "scalarType"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let facets = get(field, "facets").unwrap_or(&Value::Null);
    if scalar == "string" || scalar == "binary" {
        let max = get(get(facets, "length").unwrap_or(&Value::Null), "max")
            .and_then(|value| match value {
                Value::Number(n) if *n > 0.0 && n.fract() == 0.0 => Some(*n as usize),
                _ => None,
            })
            .ok_or_else(|| {
                EngineError::new(
                    "MODEL_KEY_WIDTH",
                    Utf16::default(),
                    "Indexed strings/binary require bounded lengths",
                )
            })?;
        return Ok(max * if scalar == "string" { 4 } else { 1 });
    }
    if !["boolean", "integer", "decimal"].contains(&scalar.as_str()) {
        return Err(EngineError::new(
            "MODEL_KEY_WIDTH",
            Utf16::default(),
            "Lexical float/temporal tokens have no qualified index equality",
        ));
    }
    if scalar == "integer" {
        let width = get(facets, "integerWidth").unwrap_or(&Value::Null);
        if matches!(get(width, "bits"), Some(Value::Number(bits)) if *bits > 63.0) {
            return Ok(40);
        }
    }
    Ok(17)
}

fn collect_composite_mappings(
    source: &Value,
    payload: &Value,
    record_id: &Value,
    root_id: &Value,
    node_id: &Value,
    column: &Utf16,
    system: &str,
    path: &[Value],
    output: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let field = field_by_ref(source, node_id).ok_or_else(|| layout_error("Shape Field missing"))?;
    let row = binding_row(payload, node_id);
    let slots = row
        .filter(|binding| {
            eq(get(binding, "storage"), "scalar-carrier")
                && eq(
                    get(get(binding, "carrier").unwrap_or(&Value::Null), "kind"),
                    "words64",
                )
        })
        .map(native_slots)
        .unwrap_or_default();
    let storage = if system == "avro" || system == "parquet" {
        "native-nested"
    } else {
        "json-column"
    };
    output.push(object_value(vec![
        ("record", record_id.clone()),
        ("root", root_id.clone()),
        ("field", node_id.clone()),
        ("column", Value::String(column.clone())),
        ("storage", string_value(storage)),
        ("path", array_value(path.to_vec())),
        (
            "slots",
            array_value(
                slots
                    .iter()
                    .map(|slot| Value::String(slot.clone()))
                    .collect(),
            ),
        ),
    ]));
    if eq(get(field, "cardinality"), "array") || eq(get(field, "cardinality"), "map") {
        let item =
            get(field, "itemType").ok_or_else(|| layout_error("Shape item Field missing"))?;
        let segment = if eq(get(field, "cardinality"), "array") {
            object_value(vec![("kind", string_value("array-item"))])
        } else {
            object_value(vec![("kind", string_value("map-value"))])
        };
        let mut next = path.to_vec();
        next.push(segment);
        collect_composite_mappings(
            source, payload, record_id, root_id, item, column, system, &next, output, ctx,
        )?;
    } else if let Some(reference) = array(get(field, "references")).and_then(|rows| rows.first()) {
        let group = object_value(vec![
            (
                "module",
                get(reference, "module").cloned().unwrap_or(Value::Null),
            ),
            (
                "element",
                get(reference, "element").cloned().unwrap_or(Value::Null),
            ),
        ]);
        let layout = array(get(payload, "groups"))
            .unwrap_or(&[])
            .iter()
            .find(|row| same_ref(row, &group))
            .ok_or_else(|| layout_error("Composite group layout missing"))?;
        for (index, member) in array(get(layout, "members"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let mut next = path.to_vec();
            next.push(object_value(vec![
                ("kind", string_value("member")),
                ("name", string_value(format!("m{index}"))),
            ]));
            collect_composite_mappings(
                source, payload, record_id, root_id, member, column, system, &next, output, ctx,
            )?;
        }
    }
    Ok(())
}

/// Construct the current versioned native model proposal from the admitted source/layout.
pub fn project_model(
    binding: &Value,
    logical: &Value,
    loss_policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !eq(Some(loss_policy), "strict") && !eq(Some(loss_policy), "report") {
        return Err(EngineError::new(
            "BIT128_MODEL_POLICY",
            Utf16::default(),
            "Explicit strict/report policy required",
        ));
    }
    let inspected = inspect_bit128_binding(binding, logical, ctx)?;
    if !inspected.valid || !inspected.complete {
        return Err(EngineError::new(
            "BIT128_MODEL_SOURCE",
            Utf16::default(),
            "Complete valid Bit128 model source required",
        ));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let target = get(payload, "target").unwrap_or(&Value::Null);
    let system = text(get(target, "system"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let version = text(get(target, "version"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let subset = text(get(target, "subset"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let sql = system == "postgresql" && (version == "17" || version.starts_with("17."))
        || system == "sqlserver" && version == "2022";
    let avro = system == "avro" && version == "1.12.0";
    let parquet = system == "parquet" && version == "2.11.0";
    let tablespec = system == "tablespec" && version == "1.0";
    if !(sql || avro || parquet || tablespec) {
        return Err(EngineError::new(
            "BIT128_MODEL_TARGET",
            Utf16::default(),
            "Unsupported versioned model target",
        ));
    }
    let source_elements = elements(logical);
    let records: Vec<_> = source_elements
        .iter()
        .filter(|(e, _, _)| eq(get(e, "kind"), "record"))
        .collect();
    let mut residuals = Vec::new();
    let mut mapping_rows = Vec::new();
    let mut composite_mappings = Vec::new();
    let mut native_records = Vec::new();
    let mut sql_statements = Vec::new();
    let sql_engine = if sql { Some(resources(ctx)?.0) } else { None };
    if system == "sqlserver" {
        for statement in [
            "SET ANSI_NULLS ON;",
            "SET QUOTED_IDENTIFIER ON;",
            "SET ANSI_PADDING ON;",
            "SET ANSI_WARNINGS ON;",
            "SET ARITHABORT ON;",
            "SET CONCAT_NULL_YIELDS_NULL ON;",
            "SET NUMERIC_ROUNDABORT OFF;",
        ] {
            sql_statements.push(statement.to_string());
        }
    }
    let q = |name: &str| {
        if system == "postgresql" {
            format!("\"{}\"", name.replace('"', "\"\""))
        } else {
            format!("[{}]", name.replace(']', "]]"))
        }
    };
    let mut table_names = Vec::new();
    for (ri, (record, module, record_id)) in records.iter().enumerate() {
        let identity = model_identity(module, record_id);
        let table = table_for(payload, &identity)?
            .to_utf8()
            .map_err(|_| layout_error("Invalid native table name"))?;
        let members = array(get(*record, "members")).unwrap_or(&[]);
        let mut defs = Vec::new();
        let mut file_fields = Vec::new();
        let mut parquet_fields = Vec::new();
        let mut table_columns = Vec::new();
        let mut field_mappings = Vec::new();
        let mut column_names = Vec::new();
        if tablespec && table_names.iter().any(|name: &String| name == &table) {
            return Err(layout_error("Duplicate TableSpec table name"));
        }
        table_names.push(table.clone());
        for (fi, member) in members.iter().enumerate() {
            let field = field_by_ref(logical, member)
                .ok_or_else(|| layout_error("Record member Field missing"))?;
            let row = binding_row(payload, member)
                .ok_or_else(|| layout_error("Record member binding missing"))?;
            let carrier = get(row, "carrier").unwrap_or(&Value::Null);
            let is_carrier = eq(get(row, "storage"), "scalar-carrier");
            let is_json = !is_carrier
                && (!eq(get(field, "cardinality"), "one")
                    || array(get(field, "references")).is_some_and(|refs| !refs.is_empty()));
            if subset == "uuid-model2" && is_json {
                let root_id = member.clone();
                let column = text(get(row, "column"))
                    .ok_or_else(|| layout_error("Composite root column required"))?;
                collect_composite_mappings(
                    logical,
                    payload,
                    &identity,
                    &root_id,
                    &root_id,
                    column,
                    &system,
                    &[],
                    &mut composite_mappings,
                    ctx,
                )?;
            }
            let kind = if is_json {
                "json".to_string()
            } else if is_carrier {
                text(get(carrier, "kind"))
                    .and_then(|v| v.to_utf8().ok())
                    .unwrap_or_default()
            } else {
                "scalar".to_string()
            };
            let slots = if is_carrier {
                native_slots(row)
            } else {
                text(get(row, "column")).cloned().into_iter().collect()
            };
            let slot_text: Vec<String> = slots
                .iter()
                .map(utf8_boundary)
                .collect::<Result<Vec<_>, _>>()?;
            let field_id = object_value(vec![
                ("module", get(member, "module").unwrap().clone()),
                ("element", get(member, "element").unwrap().clone()),
            ]);
            let name = if kind == "words64" {
                format!("{}__pair", slot_text[0])
            } else {
                slot_text.first().cloned().unwrap_or_default()
            };
            let required = eq(get(field, "nullability"), "required");
            field_mappings.push(object_value(vec![
                ("identity", field_id.clone()),
                (
                    "slots",
                    array_value(slot_text.iter().map(|s| string_value(s)).collect()),
                ),
                (
                    "paths",
                    array_value(
                        slot_text
                            .iter()
                            .map(|s| {
                                if (avro || parquet) && kind == "words64" {
                                    array_value(vec![
                                        string_value(format!("{}__pair", slot_text[0])),
                                        string_value(s),
                                    ])
                                } else {
                                    array_value(vec![string_value(s)])
                                }
                            })
                            .collect(),
                    ),
                ),
            ]));
            if !sql {
                column_names.push(name.clone());
            }
            if tablespec {
                if !["uuid-text", "hex128-text", "scalar", "json"].contains(&kind.as_str()) {
                    return Err(layout_error(
                        "Selected TableSpec target admits only explicit canonical string carriers",
                    ));
                }
                let mut column = vec![
                    ("name", string_value(&name)),
                    ("data_type", string_value("VARCHAR")),
                    (
                        "nullable",
                        object_value(vec![("default", Value::Bool(!required))]),
                    ),
                ];
                if kind == "uuid-text" || kind == "hex128-text" {
                    column.insert(
                        2,
                        (
                            "length",
                            Value::Number(if kind == "uuid-text" { 36.0 } else { 32.0 }),
                        ),
                    );
                }
                table_columns.push(object_value(column));
            } else if avro {
                let primitive = if kind == "json" {
                    shape_output(
                        logical,
                        payload,
                        member,
                        true,
                        &name,
                        &format!("composition_{ri}_{fi}"),
                        0,
                        ctx,
                    )?
                } else if kind == "words64" {
                    if !matches!(get(carrier, "signed"), Some(Value::Bool(true))) {
                        return Err(layout_error("Avro long cannot store unsigned64"));
                    }
                    let pair_fields = slot_text
                        .iter()
                        .map(|slot| {
                            object_value(vec![
                                ("name", string_value(slot)),
                                ("type", string_value("long")),
                            ])
                        })
                        .collect();
                    object_value(vec![
                        ("type", string_value("record")),
                        ("name", string_value(format!("umf_{ri}_{fi}_pair"))),
                        ("namespace", string_value(format!("umf.model.r{ri}.values"))),
                        ("fields", array_value(pair_fields)),
                    ])
                } else if kind == "native-uuid" || kind == "bytes16" {
                    let mut fixed = vec![
                        ("type", string_value("fixed")),
                        (
                            "name",
                            string_value(format!(
                                "umf_{ri}_{fi}_{}",
                                if kind == "native-uuid" {
                                    "uuid"
                                } else {
                                    "bytes"
                                }
                            )),
                        ),
                        ("namespace", string_value(format!("umf.model.r{ri}.values"))),
                        ("size", Value::Number(16.0)),
                    ];
                    if kind == "native-uuid" {
                        fixed.push(("logicalType", string_value("uuid")));
                    }
                    object_value(fixed)
                } else if kind == "uuid-text" {
                    object_value(vec![
                        ("type", string_value("string")),
                        ("logicalType", string_value("uuid")),
                    ])
                } else {
                    string_value("string")
                };
                let typ = if kind == "json" {
                    primitive
                } else if required {
                    primitive
                } else {
                    array_value(vec![string_value("null"), primitive])
                };
                file_fields.push(object_value(vec![
                    ("name", string_value(&name)),
                    ("type", typ),
                ]));
            } else if !sql {
                if kind == "json" {
                    parquet_fields.push(shape_output(
                        logical, payload, member, false, &name, "", 0, ctx,
                    )?);
                } else {
                    if kind == "words64" {
                        let children = slot_text
                            .iter()
                            .map(|slot| {
                                object_value(vec![
                                    ("name", string_value(slot)),
                                    ("nullable", Value::Bool(false)),
                                    ("physicalType", string_value("INT64")),
                                    ("logicalType", string_value("INTEGER")),
                                    ("bitWidth", Value::Number(64.0)),
                                    (
                                        "isSigned",
                                        get(carrier, "signed")
                                            .cloned()
                                            .unwrap_or(Value::Bool(false)),
                                    ),
                                ])
                            })
                            .collect();
                        parquet_fields.push(object_value(vec![
                            ("name", string_value(&name)),
                            ("nullable", Value::Bool(!required)),
                            ("children", array_value(children)),
                        ]));
                    } else {
                        let native = kind == "native-uuid" || kind == "bytes16";
                        let mut fields = vec![
                            ("name", string_value(&name)),
                            ("nullable", Value::Bool(!required)),
                            (
                                "physicalType",
                                string_value(if native {
                                    "FIXED_LEN_BYTE_ARRAY"
                                } else {
                                    "BYTE_ARRAY"
                                }),
                            ),
                        ];
                        if native {
                            fields.push(("length", Value::Number(16.0)));
                        }
                        fields.push((
                            "logicalType",
                            if kind == "native-uuid" {
                                string_value("UUID")
                            } else if kind == "bytes16" {
                                Value::Null
                            } else {
                                string_value("STRING")
                            },
                        ));
                        parquet_fields.push(object_value(fields));
                    }
                }
            }
            if sql {
                let scalar_type = text(get(field, "scalarType"))
                    .and_then(|v| v.to_utf8().ok())
                    .unwrap_or_default();
                let facets = get(field, "facets").unwrap_or(&Value::Null);
                let typ = if kind == "json" {
                    if system == "postgresql" {
                        "jsonb".to_string()
                    } else {
                        "nvarchar(max)".to_string()
                    }
                } else if kind == "scalar" && scalar_type == "boolean" {
                    if system == "postgresql" {
                        "boolean".to_string()
                    } else {
                        "bit".to_string()
                    }
                } else if kind == "scalar" && scalar_type == "integer" {
                    let width = get(facets, "integerWidth").unwrap_or(&Value::Null);
                    let bits = match get(width, "bits") {
                        Some(Value::Number(n)) => *n,
                        _ => 0.0,
                    };
                    let signed = matches!(get(width, "signed"), Some(Value::Bool(true)));
                    if bits <= 63.0 || bits == 64.0 && signed {
                        "bigint".to_string()
                    } else if system == "postgresql" {
                        "numeric(39,0)".to_string()
                    } else {
                        "varchar(40) COLLATE Latin1_General_100_BIN2".to_string()
                    }
                } else if kind == "scalar" && scalar_type == "decimal" {
                    let precision = match get(facets, "precision") {
                        Some(Value::Number(n)) => *n as usize,
                        _ => 38,
                    };
                    let scale = match get(facets, "scale") {
                        Some(Value::Number(n)) => *n as usize,
                        _ => 0,
                    };
                    format!("decimal({precision},{scale})")
                } else if kind == "scalar" && scalar_type == "binary" {
                    if system == "postgresql" {
                        "bytea".to_string()
                    } else {
                        let max = get(get(facets, "length").unwrap_or(&Value::Null), "max")
                            .and_then(|value| match value {
                                Value::Number(n) if *n > 0.0 && *n <= 8000.0 => Some(*n as usize),
                                _ => None,
                            });
                        max.map_or_else(
                            || "varbinary(max)".to_string(),
                            |length| format!("varbinary({length})"),
                        )
                    }
                } else if kind == "scalar" {
                    if system == "postgresql" {
                        "text".to_string()
                    } else {
                        let max = get(get(facets, "length").unwrap_or(&Value::Null), "max")
                            .and_then(|value| match value {
                                Value::Number(n) if *n > 0.0 && *n <= 2000.0 => Some(*n as usize),
                                _ => None,
                            });
                        max.map_or_else(
                            || "nvarchar(max) COLLATE Latin1_General_100_BIN2".to_string(),
                            |length| {
                                format!("nvarchar({}) COLLATE Latin1_General_100_BIN2", length * 2)
                            },
                        )
                    }
                } else if kind == "words64" {
                    "bigint".to_string()
                } else if kind == "native-uuid" {
                    if system == "postgresql" {
                        "uuid".to_string()
                    } else {
                        "uniqueidentifier".to_string()
                    }
                } else if kind == "bytes16" {
                    if system == "postgresql" {
                        "bytea".to_string()
                    } else {
                        "varbinary(17)".to_string()
                    }
                } else if kind == "uuid-text" {
                    if system == "postgresql" {
                        "text".to_string()
                    } else {
                        "nvarchar(37) COLLATE Latin1_General_100_BIN2".to_string()
                    }
                } else if system == "postgresql" {
                    "text".to_string()
                } else {
                    "nvarchar(33) COLLATE Latin1_General_100_BIN2".to_string()
                };
                let default_tokens = if let Some(default) = get(field, "default") {
                    if let Some(value) = get(default, "value") {
                        Some(sql_literal_slots(
                            sql_engine.as_ref().unwrap(),
                            binding,
                            logical,
                            member,
                            field,
                            row,
                            value,
                            ctx,
                        )?)
                    } else {
                        None
                    }
                } else {
                    None
                };
                if let Some(default) = get(field, "default") {
                    if !eq(get(default, "on"), "missing") {
                        residuals.push(object_value(vec![
                            (
                                "path",
                                string_value(format!("{}/default", json_text(&field_id))),
                            ),
                            (
                                "reason",
                                string_value(
                                    "SQL DEFAULT does not replace explicitly supplied NULL",
                                ),
                            ),
                        ]));
                    }
                }
                for (slot_index, slot) in slot_text.iter().enumerate() {
                    let normalized = if system == "sqlserver" {
                        slot.to_lowercase()
                    } else {
                        slot.clone()
                    };
                    if column_names.contains(&normalized) {
                        return Err(layout_error("Native column collision"));
                    }
                    column_names.push(normalized);
                    let default_sql = default_tokens
                        .as_ref()
                        .and_then(|tokens| tokens.get(slot_index))
                        .map(|(name, value)| {
                            let _ = name;
                            sql_literal_expression(value, field, row, system == "postgresql")
                                .map(|sql| format!(" DEFAULT {sql}"))
                        })
                        .transpose()?
                        .unwrap_or_default();
                    defs.push(format!(
                        "{} {}{}{}",
                        q(slot),
                        &typ,
                        if required { " NOT NULL" } else { " NULL" },
                        default_sql
                    ));
                }
                if kind == "words64" && !required {
                    defs.push(format!(
                        "({} IS NULL AND {} IS NULL) OR ({} IS NOT NULL AND {} IS NOT NULL)",
                        q(&slot_text[0]),
                        q(&slot_text[1]),
                        q(&slot_text[0]),
                        q(&slot_text[1])
                    ));
                }
                if kind == "bytes16" {
                    defs.push(format!(
                        "CHECK ({}({}) = 16)",
                        if system == "postgresql" {
                            "octet_length"
                        } else {
                            "DATALENGTH"
                        },
                        q(&slot_text[0])
                    ));
                }
                if kind == "uuid-text" || kind == "hex128-text" {
                    let column = q(&slot_text[0]);
                    let uuid = kind == "uuid-text";
                    let length = if uuid { 36 } else { 32 };
                    if system == "postgresql" {
                        defs.push(format!(
                            "CHECK (octet_length({column}) = {length} AND {column} ~ '{}')",
                            if uuid {
                                "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                            } else {
                                "^[0-9a-f]{32}$"
                            }
                        ));
                    } else {
                        let plain = if uuid {
                            format!("REPLACE({column},'-','')")
                        } else {
                            column.clone()
                        };
                        let hyphens = if uuid {
                            format!(
                                " AND SUBSTRING({column},9,1) = '-' AND SUBSTRING({column},14,1) = '-' AND SUBSTRING({column},19,1) = '-' AND SUBSTRING({column},24,1) = '-' AND DATALENGTH({plain}) = 64"
                            )
                        } else {
                            String::new()
                        };
                        defs.push(format!(
                            "CHECK (DATALENGTH({column}) = {} AND {plain} NOT LIKE '%[^0-9a-f]%' COLLATE Latin1_General_100_BIN2{hyphens})",
                            length * 2
                        ));
                    }
                }
                if let Some(allowed) = array(get(field, "allowedValues")) {
                    let clauses = allowed
                        .iter()
                        .map(|literal| {
                            let values = sql_literal_slots(
                                sql_engine.as_ref().unwrap(),
                                binding,
                                logical,
                                member,
                                field,
                                row,
                                literal,
                                ctx,
                            )?;
                            let terms = values
                                .iter()
                                .map(|(name, value)| {
                                    let expression = sql_literal_expression(
                                        value,
                                        field,
                                        row,
                                        system == "postgresql",
                                    )?;
                                    Ok(if matches!(value, Value::Null) {
                                        format!("{} IS NULL", q(&utf8_boundary(&name)?))
                                    } else {
                                        format!("{} = {}", q(&utf8_boundary(&name)?), expression)
                                    })
                                })
                                .collect::<Result<Vec<_>, EngineError>>()?;
                            Ok(format!("({})", terms.join(" AND ")))
                        })
                        .collect::<Result<Vec<_>, EngineError>>()?;
                    let expression = if clauses.is_empty() {
                        if required {
                            "1 = 0".to_string()
                        } else {
                            slot_text
                                .iter()
                                .map(|name| format!("{} IS NULL", q(name)))
                                .collect::<Vec<_>>()
                                .join(" AND ")
                        }
                    } else {
                        clauses.join(" OR ")
                    };
                    defs.push(format!("CHECK ({expression})"));
                }
                if kind == "json" {
                    if system == "sqlserver" {
                        defs.push(format!("CHECK (ISJSON({}) = 1)", q(&slot_text[0])));
                    }
                    residuals.push(object_value(vec![("path",string_value(json_text(&field_id)),),("reason",string_value("JSON composite storage preserves structure; recursive domains, bounds, group presence and pair integrity require complete-value codec validation"))]));
                }
                if kind == "scalar" {
                    residuals.push(object_value(vec![("path",string_value(json_text(&field_id)),),("reason",string_value("Mixed scalar facets, equality/collation and ordering require portable codec checks; native type is not full semantic equivalence"))]));
                }
                if kind == "uuid-text" || kind == "hex128-text" {
                    residuals.push(object_value(vec![
                        ("path", string_value(json_text(&field_id))),
                        (
                            "reason",
                            string_value(
                                "Text carrier grammar and collation require separate qualification",
                            ),
                        ),
                    ]));
                }
            }
            if (kind == "scalar" || kind == "uuid-text" || kind == "hex128-text" || tablespec)
                && !sql
            {
                residuals.push(object_value(vec![("path",string_value(json_text(&field_id))),("reason",string_value(if tablespec{"Native TableSpec/Spark strings do not enforce canonical grammar or CSV requiredness; complete-row codec validation is required"}else{"Exact-text scalar storage does not enforce logical scalar semantics, grammar or arithmetic; complete-row codec validation is required"}))]));
            }
            if !sql
                && (get(field, "default").is_some()
                    || get(field, "allowedValues").is_some()
                    || get(field, "facets").is_some())
            {
                residuals.push(object_value(vec![("path",string_value(json_text(&field_id))),("reason",string_value("Native Field constraints/defaults are retained and checked by codecs, not enforced by this file schema"))]));
            }
            if sql && get(field, "facets").is_some() {
                residuals.push(object_value(vec![
                    (
                        "path",
                        string_value(format!("{}/facets", json_text(&field_id))),
                    ),
                    ("reason", string_value("Unqualified refinements retained")),
                ]));
            }
            if avro && kind == "native-uuid" {
                residuals.push(object_value(vec![("path",string_value(json_text(&field_id))),("reason",string_value("Apache Avro1.12 ignores fixed UUID logical annotation; exact fixed16 data survives"))]));
            }
        }
        let native_record = if tablespec {
            let mut row_fields = vec![
                ("version", string_value("1.0")),
                ("table_name", string_value(&table)),
                ("columns", array_value(table_columns)),
            ];
            let keys = array(get(*record, "keys")).unwrap_or(&[]);
            if let Some(primary) = keys
                .iter()
                .find(|keyrow| matches!(get(keyrow, "primary"), Some(Value::Bool(true))))
            {
                let fields = array(get(primary, "fields"))
                    .unwrap_or(&[])
                    .iter()
                    .flat_map(|reference| {
                        binding_row(payload, reference)
                            .map(native_slots)
                            .unwrap_or_default()
                    })
                    .map(Value::String)
                    .collect();
                row_fields.push(("primary_key", array_value(fields)));
            }
            let unique: Vec<_> = keys
                .iter()
                .filter(|keyrow| !matches!(get(keyrow, "primary"), Some(Value::Bool(true))))
                .map(|keyrow| {
                    array_value(
                        array(get(keyrow, "fields"))
                            .unwrap_or(&[])
                            .iter()
                            .flat_map(|reference| {
                                binding_row(payload, reference)
                                    .map(native_slots)
                                    .unwrap_or_default()
                            })
                            .map(Value::String)
                            .collect(),
                    )
                })
                .collect();
            if !unique.is_empty() {
                row_fields.push(("unique_constraints", array_value(unique)));
            }
            object_value(row_fields)
        } else if avro {
            object_value(vec![
                ("type", string_value("record")),
                ("name", string_value(&table)),
                ("namespace", string_value(format!("umf.model.r{ri}"))),
                ("fields", array_value(file_fields)),
            ])
        } else {
            object_value(vec![
                ("name", string_value(&table)),
                ("columns", array_value(parquet_fields)),
            ])
        };
        native_records.push(native_record);
        mapping_rows.push(object_value(vec![
            ("record", identity.clone()),
            ("table", string_value(&table)),
            ("fields", array_value(field_mappings)),
        ]));
        if sql {
            sql_statements.push(format!(
                "CREATE TABLE {} (\n  {}\n);",
                q(&table),
                defs.join(",\n  ")
            ));
        }
    }
    if sql {
        let mut object_names: Vec<String> = Vec::new();
        for name in &table_names {
            let normalized = if system == "sqlserver" {
                name.to_lowercase()
            } else {
                name.clone()
            };
            if object_names.contains(&normalized) {
                return Err(layout_error("Native object names collide"));
            }
            object_names.push(normalized);
        }
        let mut reserve_object = |name: &str| -> Result<(), EngineError> {
            let normalized = if system == "sqlserver" {
                name.to_lowercase()
            } else {
                name.to_string()
            };
            if object_names.contains(&normalized) {
                return Err(layout_error("Native object names collide"));
            }
            object_names.push(normalized);
            Ok(())
        };
        for (ri, (record, _, _)) in records.iter().enumerate() {
            let table = table_for(payload, &model_identity(&records[ri].1, &records[ri].2))?
                .to_utf8()
                .unwrap_or_default();
            for (ki, keyrow) in array(get(*record, "keys"))
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                let refs = array(get(keyrow, "fields")).unwrap_or(&[]);
                let fields: Vec<_> = refs
                    .iter()
                    .map(|reference| {
                        let field = field_by_ref(logical, reference)
                            .ok_or_else(|| layout_error("Key Field missing"))?;
                        let binding = binding_row(payload, reference)
                            .ok_or_else(|| layout_error("Key carrier missing"))?;
                        Ok((field, binding))
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?;
                let widths = fields
                    .iter()
                    .map(|(field, binding)| sql_index_bytes(field, binding))
                    .collect::<Result<Vec<_>, _>>()?;
                let slots: Vec<_> = refs
                    .iter()
                    .flat_map(|reference| {
                        binding_row(payload, reference)
                            .map(native_slots)
                            .unwrap_or_default()
                    })
                    .collect();
                if slots.len() > 16 || system == "sqlserver" && widths.iter().sum::<usize>() > 900 {
                    return Err(layout_error("Key/index exceeds conservative column limit"));
                }
                let nullable = fields
                    .iter()
                    .any(|(field, _)| !eq(get(field, "nullability"), "required"));
                let primary = matches!(get(keyrow, "primary"), Some(Value::Bool(true)));
                if primary && nullable {
                    return Err(layout_error("Primary Key requires nonnull Fields"));
                }
                let name = format!("umf_key_{ri}_{ki}");
                reserve_object(&name)?;
                let cols = slots
                    .iter()
                    .map(|slot| Ok(q(&utf8_boundary(slot)?)))
                    .collect::<Result<Vec<_>, EngineError>>()?
                    .join(", ");
                if primary || !nullable {
                    sql_statements.push(format!(
                        "ALTER TABLE {} ADD CONSTRAINT {} {}{} ({});",
                        q(&table),
                        q(&name),
                        if primary { "PRIMARY KEY" } else { "UNIQUE" },
                        if system == "sqlserver" && !primary {
                            " NONCLUSTERED"
                        } else {
                            ""
                        },
                        cols
                    ));
                } else {
                    sql_statements.push(format!(
                        "CREATE UNIQUE INDEX {} ON {} ({}) WHERE {};",
                        q(&name),
                        q(&table),
                        cols,
                        slots
                            .iter()
                            .map(|slot| Ok(format!("{} IS NOT NULL", q(&utf8_boundary(&slot)?))))
                            .collect::<Result<Vec<_>, EngineError>>()?
                            .join(" AND ")
                    ));
                }
            }
        }
        for (ii, index) in array(get(payload, "indexes"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let name = text(get(index, "name"))
                .ok_or_else(|| layout_error("Index name required"))?
                .clone();
            let on = array(get(index, "on")).unwrap_or(&[]);
            let field_refs: Vec<_> = on.iter().filter_map(|item| get(item, "field")).collect();
            let owner = records
                .iter()
                .find(|(record, _, _)| {
                    array(get(*record, "members")).is_some_and(|members| {
                        field_refs
                            .iter()
                            .all(|field| members.iter().any(|member| same_ref(member, field)))
                    })
                })
                .ok_or_else(|| layout_error("Index Record missing"))?;
            let table = utf8_boundary(&table_for(payload, &model_identity(&owner.1, &owner.2))?)?;
            let cols = field_refs
                .iter()
                .flat_map(|reference| {
                    binding_row(payload, reference)
                        .map(native_slots)
                        .unwrap_or_default()
                })
                .map(|slot| Ok(q(&utf8_boundary(&slot)?)))
                .collect::<Result<Vec<_>, EngineError>>()?
                .join(", ");
            let unique = matches!(get(index, "unique"), Some(Value::Bool(true)))
                || eq(get(index, "kind"), "unique");
            reserve_object(&utf8_boundary(&name)?)?;
            let index_fields: Vec<_> = field_refs
                .iter()
                .map(|reference| {
                    let field = field_by_ref(logical, reference)
                        .ok_or_else(|| layout_error("Index Field missing"))?;
                    let binding = binding_row(payload, reference)
                        .ok_or_else(|| layout_error("Index carrier missing"))?;
                    Ok((field, binding))
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            let widths = index_fields
                .iter()
                .map(|(field, binding)| sql_index_bytes(field, binding))
                .collect::<Result<Vec<_>, _>>()?;
            let slots: Vec<_> = field_refs
                .iter()
                .flat_map(|reference| {
                    binding_row(payload, reference)
                        .map(native_slots)
                        .unwrap_or_default()
                })
                .collect();
            if slots.len() > 16 || system == "sqlserver" && widths.iter().sum::<usize>() > 900 {
                return Err(layout_error("Index exceeds conservative column limit"));
            }
            if unique
                && field_refs.iter().any(|reference| {
                    field_by_ref(logical, reference)
                        .is_some_and(|field| !eq(get(field, "nullability"), "required"))
                })
            {
                sql_statements.push(format!(
                    "CREATE UNIQUE INDEX {} ON {} ({}) WHERE {};",
                    q(&utf8_boundary(&name)?),
                    q(&table),
                    cols,
                    slots
                        .iter()
                        .map(|slot| Ok(format!("{} IS NOT NULL", q(&utf8_boundary(slot)?))))
                        .collect::<Result<Vec<_>, EngineError>>()?
                        .join(" AND ")
                ));
            } else {
                sql_statements.push(format!(
                    "CREATE {}INDEX {} ON {} ({});",
                    if unique { "UNIQUE " } else { "" },
                    q(&utf8_boundary(&name)?),
                    q(&table),
                    cols
                ));
            }
            let _ = ii;
        }
        let mut fk_index = 0usize;
        for module in array(get(logical, "modules")).unwrap_or(&[]) {
            let module_id = text(get(module, "id"))
                .ok_or_else(|| layout_error("Relationship module id required"))?;
            for declaration in array(get(module, "relationships")).unwrap_or(&[]) {
                let id = text(get(declaration, "id"))
                    .ok_or_else(|| layout_error("Relationship id required"))?;
                let row = array(get(payload, "relationships"))
                    .unwrap_or(&[])
                    .iter()
                    .find(|r| {
                        text(get(r, "module")) == Some(module_id) && text(get(r, "id")) == Some(id)
                    })
                    .ok_or_else(|| layout_error("Relationship layout missing"))?;
                if eq(get(row, "storage"), "junction") {
                    let association_record = get(row, "record")
                        .ok_or_else(|| layout_error("Association Record required"))?;
                    let association = records
                        .iter()
                        .find(|(_, module, element)| {
                            text(get(association_record, "module")) == Some(module)
                                && text(get(association_record, "element")) == Some(element)
                        })
                        .ok_or_else(|| layout_error("Association Record missing"))?;
                    let association_table = utf8_boundary(&table_for(
                        payload,
                        &model_identity(&association.1, &association.2),
                    )?)?;
                    for side in ["source", "target"] {
                        let endpoints = array(get(row, side)).unwrap_or(&[]);
                        let endpoint_slots: Vec<Vec<String>> = endpoints
                            .iter()
                            .map(|endpoint| -> Result<Vec<String>, EngineError> {
                                array(get(endpoint, "fields"))
                                    .unwrap_or(&[])
                                    .iter()
                                    .flat_map(|reference| {
                                        binding_row(payload, reference)
                                            .map(native_slots)
                                            .unwrap_or_default()
                                    })
                                    .map(|slot| Ok(q(&utf8_boundary(&slot)?)))
                                    .collect::<Result<Vec<_>, EngineError>>()
                            })
                            .collect::<Result<Vec<_>, EngineError>>()?;
                        let alternatives = endpoint_slots
                            .iter()
                            .enumerate()
                            .map(|(selected, _)| {
                                format!(
                                    "({})",
                                    endpoint_slots
                                        .iter()
                                        .enumerate()
                                        .flat_map(|(index, slots)| {
                                            slots.iter().map(move |slot| {
                                                format!(
                                                    "{} IS {}",
                                                    slot,
                                                    if index == selected {
                                                        "NOT NULL"
                                                    } else {
                                                        "NULL"
                                                    }
                                                )
                                            })
                                        })
                                        .collect::<Vec<_>>()
                                        .join(" AND ")
                                )
                            })
                            .collect::<Vec<_>>();
                        if !alternatives.is_empty() {
                            sql_statements.push(format!(
                                "ALTER TABLE {} ADD CHECK ({});",
                                q(&association_table),
                                alternatives.join(" OR ")
                            ));
                        }
                    }
                    residuals.push(object_value(vec![("path",string_value(format!("/relationships/{}/{}",utf8_boundary(module_id)?,utf8_boundary(id)?))),("reason",string_value("Association endpoint existence and exclusive alternatives are native constraints; distinct endpoint multiplicity, inverse presentation and lifecycle require portable dataset/consumer validation"))]));
                    continue;
                }
                let sources = array(get(declaration, "source")).unwrap_or(&[]);
                let targets = array(get(declaration, "target")).unwrap_or(&[]);
                if sources.len() != 1
                    || targets.len() != 1
                    || get(declaration, "targetMultiplicity")
                        .and_then(|m| get(m, "max"))
                        .is_some_and(|m| !eq(Some(m), "1") && !eq(Some(m), "*"))
                {
                    return Err(layout_error(
                        "To-many targets require an explicit association Record",
                    ));
                }
                if get(declaration, "targetMultiplicity")
                    .and_then(|m| get(m, "max"))
                    .is_some_and(|m| eq(Some(m), "*"))
                {
                    return Err(layout_error(
                        "To-many targets require an explicit association Record",
                    ));
                }
                let src = &sources[0];
                let dst = &targets[0];
                let sr = records
                    .iter()
                    .find(|(_, m, e)| {
                        text(get(src, "module")) == Some(m) && text(get(src, "element")) == Some(e)
                    })
                    .ok_or_else(|| layout_error("Source Record missing"))?;
                let tr = records
                    .iter()
                    .find(|(_, m, e)| {
                        text(get(dst, "module")) == Some(m) && text(get(dst, "element")) == Some(e)
                    })
                    .ok_or_else(|| layout_error("Target Record missing"))?;
                let source_table =
                    utf8_boundary(&table_for(payload, &model_identity(&sr.1, &sr.2))?)?;
                let target_table =
                    utf8_boundary(&table_for(payload, &model_identity(&tr.1, &tr.2))?)?;
                let target_key = array(get(tr.0, "keys"))
                    .unwrap_or(&[])
                    .iter()
                    .find(|k| text(get(k, "id")) == text(get(dst, "key")))
                    .ok_or_else(|| layout_error("Target Key missing"))?;
                let target_fields = array(get(target_key, "fields")).unwrap_or(&[]);
                let source_fields = array(get(row, "fields")).unwrap_or(&[]);
                let from = source_fields
                    .iter()
                    .flat_map(|r| {
                        binding_row(payload, r)
                            .map(native_slots)
                            .unwrap_or_default()
                    })
                    .map(|n| Ok(q(&utf8_boundary(&n)?)))
                    .collect::<Result<Vec<_>, EngineError>>()?
                    .join(", ");
                let to = target_fields
                    .iter()
                    .flat_map(|r| {
                        binding_row(payload, r)
                            .map(native_slots)
                            .unwrap_or_default()
                    })
                    .map(|n| Ok(q(&utf8_boundary(&n)?)))
                    .collect::<Result<Vec<_>, EngineError>>()?
                    .join(", ");
                if source_fields.iter().any(|reference| {
                    field_by_ref(logical, reference)
                        .is_some_and(|f| !eq(get(f, "nullability"), "required"))
                }) {
                    let cols: Vec<_> = source_fields
                        .iter()
                        .flat_map(|r| {
                            binding_row(payload, r)
                                .map(native_slots)
                                .unwrap_or_default()
                        })
                        .map(|n| Ok(q(&utf8_boundary(&n)?)))
                        .collect::<Result<Vec<_>, EngineError>>()?;
                    let nulls = cols
                        .iter()
                        .map(|n| format!("{} IS NULL", n))
                        .collect::<Vec<_>>()
                        .join(" AND ");
                    let values = cols
                        .iter()
                        .map(|n| format!("{} IS NOT NULL", n))
                        .collect::<Vec<_>>()
                        .join(" AND ");
                    sql_statements.push(format!(
                        "ALTER TABLE {} ADD CHECK (({}) OR ({}));",
                        q(&source_table),
                        nulls,
                        values
                    ));
                }
                let relation_path = format!(
                    "/relationships/{}/{}",
                    utf8_boundary(module_id)?,
                    utf8_boundary(id)?
                );
                let source_nullable = source_fields.iter().any(|reference| {
                    field_by_ref(logical, reference)
                        .is_some_and(|field| !eq(get(field, "nullability"), "required"))
                });
                if get(declaration, "targetMultiplicity")
                    .and_then(|m| get(m, "min"))
                    .is_some_and(|value| matches!(value, Value::Number(n) if *n == 1.0))
                    && source_nullable
                {
                    residuals.push(object_value(vec![
                        ("path", string_value(&relation_path)),
                        ("reason", string_value("Nullable source Fields cannot establish required target participation")),
                    ]));
                }
                let constraint_name = format!("umf_fk_{fk_index}");
                reserve_object(&constraint_name)?;
                sql_statements.push(format!("ALTER TABLE {} {}ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) ON DELETE NO ACTION ON UPDATE NO ACTION;",q(&source_table),if system=="sqlserver"{"WITH CHECK "}else{""},q(&format!("umf_fk_{fk_index}")),from,q(&target_table),to));
                let source_max = get(declaration, "sourceMultiplicity").and_then(|m| get(m, "max"));
                if matches!(source_max, Some(Value::Number(n)) if *n == 1.0) {
                    let fields: Vec<_> = source_fields
                        .iter()
                        .map(|reference| {
                            let field = field_by_ref(logical, reference)
                                .ok_or_else(|| layout_error("Source Field missing"))?;
                            let binding = binding_row(payload, reference)
                                .ok_or_else(|| layout_error("Source carrier missing"))?;
                            Ok((field, binding))
                        })
                        .collect::<Result<Vec<_>, EngineError>>()?;
                    let widths = fields
                        .iter()
                        .map(|(field, binding)| sql_index_bytes(field, binding))
                        .collect::<Result<Vec<_>, _>>()?;
                    let slots: Vec<_> = source_fields
                        .iter()
                        .flat_map(|reference| {
                            binding_row(payload, reference)
                                .map(native_slots)
                                .unwrap_or_default()
                        })
                        .collect();
                    if slots.len() > 16
                        || system == "sqlserver" && widths.iter().sum::<usize>() > 900
                    {
                        return Err(layout_error("Key/index exceeds conservative column limit"));
                    }
                    let name = format!("umf_reverse_{fk_index}");
                    reserve_object(&name)?;
                    let cols = slots
                        .iter()
                        .map(|slot| Ok(q(&utf8_boundary(slot)?)))
                        .collect::<Result<Vec<_>, EngineError>>()?
                        .join(", ");
                    if fields
                        .iter()
                        .any(|(field, _)| !eq(get(field, "nullability"), "required"))
                    {
                        sql_statements.push(format!(
                            "CREATE UNIQUE INDEX {} ON {} ({}) WHERE {};",
                            q(&name),
                            q(&source_table),
                            cols,
                            slots
                                .iter()
                                .map(|slot| Ok(format!(
                                    "{} IS NOT NULL",
                                    q(&utf8_boundary(&slot)?)
                                )))
                                .collect::<Result<Vec<_>, EngineError>>()?
                                .join(" AND ")
                        ));
                    } else {
                        sql_statements.push(format!(
                            "ALTER TABLE {} ADD CONSTRAINT {} UNIQUE{} ({});",
                            q(&source_table),
                            q(&name),
                            if system == "sqlserver" {
                                " NONCLUSTERED"
                            } else {
                                ""
                            },
                            cols
                        ));
                    }
                } else if matches!(source_max, Some(Value::Number(_))) {
                    residuals.push(object_value(vec![
                        ("path", string_value(&relation_path)),
                        ("reason", string_value("Finite reverse participation bound is not enforced by the foreign key")),
                    ]));
                }
                if get(declaration, "sourceMultiplicity")
                    .and_then(|m| get(m, "min"))
                    .is_some_and(|value| matches!(value, Value::Number(n) if *n > 0.0))
                {
                    residuals.push(object_value(vec![
                        ("path", string_value(&relation_path)),
                        ("reason", string_value("Every target having a source requires consumer transaction enforcement")),
                    ]));
                }
                fk_index += 1;
                let lifecycle = get(declaration, "targetLifecycle");
                if lifecycle.is_some_and(|v| !eq(Some(v), "unspecified")) {
                    residuals.push(object_value(vec![("path",string_value(format!("/relationships/{}/{}",utf8_boundary(module_id)?,utf8_boundary(id)?))),("reason",string_value("NO ACTION does not establish authored lifecycle/ownership semantics"))]));
                }
            }
        }
    }
    if !sql
        && records
            .iter()
            .any(|(record, _, _)| array(get(*record, "keys")).is_some_and(|k| !k.is_empty()))
    {
        residuals.push(object_value(vec![("path",string_value("/keys")),("reason",string_value("Native file/model schema does not enforce collection uniqueness; logical Keys remain in source"))]));
    }
    if !sql && array(get(payload, "indexes")).is_some_and(|rows| !rows.is_empty()) {
        residuals.push(object_value(vec![
            ("path", string_value("/indexes")),
            (
                "reason",
                string_value(
                    "Native file/model layout does not implement authored secondary indexes",
                ),
            ),
        ]));
    }
    if !sql && array(get(payload, "relationships")).is_some_and(|rows| !rows.is_empty()) {
        residuals.push(object_value(vec![("path",string_value("/relationships")),("reason",string_value("Native file/model storage does not enforce referenced row existence, cardinality or lifecycle"))]));
    }
    let status = if !residuals.is_empty() && eq(Some(loss_policy), "strict") {
        "blocked"
    } else if !residuals.is_empty() {
        "reported"
    } else {
        "projected"
    };
    let format = if sql {
        "sql"
    } else if avro {
        "avro"
    } else if parquet {
        "parquet"
    } else {
        "tablespec"
    };
    let candidate_text = if sql {
        format!("{}\n", sql_statements.join("\n"))
    } else {
        json_text(&object_value(vec![
            ("profile", string_value("umf-128-native-model/1")),
            ("system", string_value(&system)),
            ("records", array_value(native_records)),
        ]))
    };
    ctx.charge_text(candidate_text.encode_utf16().count(), Utf16::default())?;
    let mut fields = vec![
        ("operation", string_value("project-bit128-model")),
        ("version", string_value("1.0.0")),
        ("source", logical.clone()),
        ("binding", binding.clone()),
        ("lossPolicy", loss_policy.clone()),
        ("status", string_value(status)),
        (
            "nativeRequirements",
            array_value(if system == "sqlserver" {
                vec![object_value(vec![
                    ("scope", string_value("connection")),
                    (
                        "statements",
                        array_value(
                            [
                                "SET ANSI_NULLS ON;",
                                "SET QUOTED_IDENTIFIER ON;",
                                "SET ANSI_PADDING ON;",
                                "SET ANSI_WARNINGS ON;",
                                "SET ARITHABORT ON;",
                                "SET CONCAT_NULL_YIELDS_NULL ON;",
                                "SET NUMERIC_ROUNDABORT OFF;",
                            ]
                            .iter()
                            .map(string_value)
                            .collect(),
                        ),
                    ),
                ])]
            } else {
                vec![]
            }),
        ),
        ("residuals", array_value(residuals)),
        ("mappings", array_value(mapping_rows)),
    ];
    if subset == "uuid-model2" {
        fields.push(("compositeMappings", array_value(composite_mappings)));
    }
    if status != "blocked" {
        fields.push((
            "candidate",
            object_value(vec![
                ("format", string_value(format)),
                ("text", string_value(candidate_text)),
            ]),
        ));
    }
    Ok(Value::Object(
        fields.into_iter().map(|(k, v)| (key(k), v)).collect(),
    ))
}

/// Recompute a model proposal from its retained UMF source and reject stale or
/// edited reports/native text before recovering the exact input documents.
pub fn recover_model(
    report: &Value,
    current_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !eq(get(report, "operation"), "project-bit128-model") || !eq(get(report, "version"), "1.0.0")
    {
        return Err(EngineError::new(
            "BIT128_MODEL_STALE",
            Utf16::default(),
            "Versioned Bit128 model report required",
        ));
    }
    let source = get(report, "source").ok_or_else(|| layout_error("Report source required"))?;
    let binding = get(report, "binding").ok_or_else(|| layout_error("Report binding required"))?;
    let policy = get(report, "lossPolicy").ok_or_else(|| layout_error("Loss policy required"))?;
    let expected = project_model(binding, source, policy, ctx)?;
    if report != &expected
        || text(Some(current_text))
            != get(&expected, "candidate").and_then(|candidate| text(get(candidate, "text")))
    {
        return Err(EngineError::new(
            "BIT128_MODEL_STALE",
            Utf16::default(),
            "Changed source, report or native artifact",
        ));
    }
    Ok(object_value(vec![
        ("logical", source.clone()),
        ("binding", binding.clone()),
    ]))
}
