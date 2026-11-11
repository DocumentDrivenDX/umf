// SPDX-License-Identifier: MIT OR Apache-2.0
//! Default callable Rust routes for the public `umf.binding` helpers.
use umf_core::{
    binding_index_projection::BindingIndexProjectionResources,
    binding_inspection::{inspect_binding, validate_binding_semantics, BindingInspectionResources},
    bit128_binding::inspect_bit128_binding,
    error::{EngineError, Validation},
    serialization::{self, Format},
    value::{Utf16, Value},
    Context,
};

use crate::{decode, encode, field, result_envelope, text_field};

pub const PROFILE: &str = "umf.binding-public/1.0.0";

fn err(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(text)) => Ok(text),
        _ => Err(err("REQUEST", "Expected required text field")),
    }
}
fn version(binding: &Value) -> Option<&Utf16> {
    get(
        get(get(binding, "vocabularies")?, "umf.binding")?,
        "version",
    )
    .and_then(|v| match v {
        Value::String(s) => Some(s),
        _ => None,
    })
}
fn inspect(
    binding: &Value,
    logical: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    if version(binding).is_some_and(|v| v == &Utf16::from("0.3.0")) {
        inspect_bit128_binding(binding, logical, ctx)
    } else {
        let resources = BindingInspectionResources::new(ctx)?;
        inspect_binding(&resources, binding, logical, ctx)
    }
}
fn diagnostic_value(d: umf_core::Diagnostic) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::String(d.code)),
        (Utf16::from("path"), Value::String(d.path)),
        (Utf16::from("message"), Value::String(d.message)),
        (
            Utf16::from("severity"),
            Value::string_utf8(match d.severity {
                umf_core::Severity::Error => "error",
                umf_core::Severity::Warning => "warning",
            }),
        ),
    ])
}
fn validation_value(v: Validation) -> Value {
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(v.valid)),
        (Utf16::from("complete"), Value::Bool(v.complete)),
        (
            Utf16::from("diagnostics"),
            Value::Array(v.diagnostics.into_iter().map(diagnostic_value).collect()),
        ),
    ])
}
fn diagnostics_message(v: &Validation, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let rows = v
        .diagnostics
        .iter()
        .cloned()
        .map(diagnostic_value)
        .collect();
    let value = Value::Array(rows);
    serialization::stringify_compact_metered(&value, ctx)
}
fn require_inspection(
    binding: &Value,
    logical: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let checked = inspect(binding, logical, ctx)?;
    if !checked.valid {
        return Err(EngineError::new(
            "BINDING_DOCUMENT",
            Utf16::default(),
            diagnostics_message(&checked, ctx)?,
        ));
    }
    Ok(checked)
}
fn set_member(value: &mut Value, name: &str, next: Value) -> Result<(), EngineError> {
    match value {
        Value::Object(fields) => {
            if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from(name)) {
                *old = next;
            } else {
                fields.push((Utf16::from(name), next));
            }
            Ok(())
        }
        _ => Err(err(
            "BINDING_DOCUMENT",
            "Expected an object while updating binding",
        )),
    }
}
fn remove_member(value: &mut Value, name: &str) -> Option<Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    let index = fields.iter().position(|(k, _)| k == &Utf16::from(name))?;
    Some(fields.remove(index).1)
}
fn object_member_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn same_json(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut pending = vec![(a, b)];
    while let Some((left, right)) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match (left, right) {
            (Value::Null, Value::Null) => {}
            (Value::Bool(a), Value::Bool(b)) if a == b => {}
            (Value::Number(a), Value::Number(b)) if a == b => {}
            (Value::String(a), Value::String(b)) => {
                ctx.charge_work(a.len().max(b.len()), Utf16::default())?;
                if a != b {
                    return Ok(false);
                }
            }
            (Value::Array(a), Value::Array(b)) if a.len() == b.len() => {
                pending.extend(a.iter().zip(b).rev())
            }
            (Value::Object(a), Value::Object(b)) if a.len() == b.len() => {
                for (key, value) in a.iter().rev() {
                    ctx.charge_work(key.len(), Utf16::default())?;
                    let mut found = None;
                    for (candidate, other) in b {
                        ctx.charge_work(candidate.len(), Utf16::default())?;
                        if candidate == key {
                            found = Some(other);
                            break;
                        }
                    }
                    let Some(other) = found else {
                        return Ok(false);
                    };
                    pending.push((value, other));
                }
            }
            _ => return Ok(false),
        }
    }
    Ok(true)
}
fn migrate(binding: &Value, logical: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut original = umf_core::value::copy_json(binding, ctx)?;
    let model = umf_core::value::copy_json(logical, ctx)?;
    let checked = inspect(&original, &model, ctx)?;
    if !checked.valid {
        return Err(EngineError::new(
            "BINDING_DOCUMENT",
            Utf16::default(),
            diagnostics_message(&checked, ctx)?,
        ));
    }
    let payload = get(
        get(&original, "extensions")
            .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?,
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?;
    if get(payload, "profile") != Some(&Value::string_utf8("umf-binding-1"))
        || version(&original) != Some(&Utf16::from("0.1.0"))
        || get(&model, "umf") != Some(&Value::string_utf8("0.10.0"))
    {
        return Err(err(
            "BINDING_MIGRATION",
            "Migration requires binding 0.1.0 and the paired relationship core 0.10.0 model",
        ));
    }
    let relationships = get(payload, "relationships")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    let mut next_relationships = Vec::with_capacity(relationships.len());
    let mut mappings = Vec::with_capacity(relationships.len());
    for (index, entry) in relationships.iter().enumerate() {
        ctx.charge_work(
            1,
            Utf16::from(format!("/extensions/umf.binding/relationships/{index}")),
        )?;
        let path = format!("/extensions/umf.binding/relationships/{index}");
        let Some(name) = get(entry, "name").and_then(|v| {
            if let Value::String(s) = v {
                Some(s)
            } else {
                None
            }
        }) else {
            return Err(EngineError::new(
                "BINDING_MIGRATION_COLLISION",
                Utf16::default(),
                "Existing ID-shaped unknown content cannot be overwritten",
            ));
        };
        if get(entry, "id").is_some() {
            return Err(EngineError::new(
                "BINDING_MIGRATION_COLLISION",
                Utf16::from(path),
                "Existing ID-shaped unknown content cannot be overwritten",
            ));
        }
        let module = get(entry, "module").ok_or_else(|| {
            EngineError::new(
                "BINDING_MIGRATION_REFERENCE",
                Utf16::from(path.clone()),
                "Exactly one authored relationship name must match",
            )
        })?;
        let module_id = text(Some(module), "module")?;
        let modules = get(&model, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a.as_slice())
                } else {
                    None
                }
            })
            .unwrap_or(&[]);
        let mut matches = Vec::new();
        for m in modules {
            ctx.charge_work(module_id.len().saturating_add(1), Utf16::from(path.clone()))?;
            if text(get(m, "id"), "id")? != module_id {
                continue;
            }
            for relationship in get(m, "relationships")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a.as_slice())
                    } else {
                        None
                    }
                })
                .unwrap_or(&[])
            {
                ctx.charge_work(name.len().saturating_add(1), Utf16::from(path.clone()))?;
                if get(relationship, "name") == Some(&Value::String(name.clone())) {
                    matches.push(relationship);
                }
            }
        }
        if matches.len() != 1 {
            return Err(EngineError::new(
                "BINDING_MIGRATION_REFERENCE",
                Utf16::from(path),
                "Exactly one authored relationship name must match",
            ));
        }
        let id = get(matches[0], "id").cloned().ok_or_else(|| {
            err(
                "BINDING_MIGRATION_REFERENCE",
                "Matched relationship has no ID",
            )
        })?;
        let mut stable = umf_core::value::copy_json(entry, ctx)?;
        remove_member(&mut stable, "name");
        set_member(&mut stable, "id", id)?;
        mappings.push(Value::Object(vec![
            (Utf16::from("path"), Value::string_utf8(path)),
            (
                Utf16::from("original"),
                umf_core::value::copy_json(entry, ctx)?,
            ),
            (
                Utf16::from("stable"),
                umf_core::value::copy_json(&stable, ctx)?,
            ),
        ]));
        next_relationships.push(stable);
    }
    let extensions = object_member_mut(&mut original, "extensions")
        .ok_or_else(|| err("BINDING_DOCUMENT", "extensions must be an object"))?;
    let payload_mut = object_member_mut(extensions, "umf.binding")
        .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?;
    set_member(payload_mut, "profile", Value::string_utf8("umf-binding-2"))?;
    set_member(
        payload_mut,
        "relationships",
        Value::Array(next_relationships),
    )?;
    let vocabularies = object_member_mut(&mut original, "vocabularies")
        .ok_or_else(|| err("BINDING_DOCUMENT", "vocabularies must be an object"))?;
    let binding_vocab = object_member_mut(vocabularies, "umf.binding")
        .ok_or_else(|| err("BINDING_DOCUMENT", "binding vocabulary is missing"))?;
    set_member(binding_vocab, "version", Value::string_utf8("0.2.0"))?;
    let validation = inspect(&original, &model, ctx)?;
    if !validation.valid {
        return Err(EngineError::new(
            "BINDING_MIGRATION",
            Utf16::default(),
            diagnostics_message(&validation, ctx)?,
        ));
    }
    Ok(Value::Object(vec![
        (
            Utf16::from("document"),
            umf_core::value::copy_json(&original, ctx)?,
        ),
        (
            Utf16::from("receipt"),
            Value::Object(vec![
                (
                    Utf16::from("profile"),
                    Value::string_utf8("umf-binding-migration-1"),
                ),
                (
                    Utf16::from("original"),
                    umf_core::value::copy_json(binding, ctx)?,
                ),
                (Utf16::from("logical"), model),
                (Utf16::from("migrated"), original),
                (Utf16::from("mappings"), Value::Array(mappings)),
            ]),
        ),
    ]))
}
fn rollback(
    current: &Value,
    logical: &Value,
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if get(receipt, "profile") != Some(&Value::string_utf8("umf-binding-migration-1")) {
        return Err(err("BINDING_RECEIPT", "Unsupported migration receipt"));
    }
    let retained_original = get(receipt, "original")
        .ok_or_else(|| err("BINDING_RECEIPT", "Migration receipt is incomplete"))?;
    let retained_logical = get(receipt, "logical")
        .ok_or_else(|| err("BINDING_RECEIPT", "Migration receipt is incomplete"))?;
    let expected = migrate(retained_original, retained_logical, ctx)?;
    let expected_receipt = get(&expected, "receipt")
        .ok_or_else(|| err("BINDING_RECEIPT", "Migration receipt is incomplete"))?;
    if !same_json(expected_receipt, receipt, ctx)? {
        return Err(err(
            "BINDING_RECEIPT",
            "Receipt does not reproduce its retained migration",
        ));
    }
    require_inspection(current, logical, ctx)?;
    let payload = get(
        get(current, "extensions")
            .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?,
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?;
    let migrated = get(receipt, "migrated")
        .ok_or_else(|| err("BINDING_RECEIPT", "Migration receipt is incomplete"))?;
    let same_identity = get(payload, "profile") == Some(&Value::string_utf8("umf-binding-2"))
        && get(current, "id") == get(migrated, "id")
        && get(current, "umf") == get(migrated, "umf")
        && get(logical, "id") == get(retained_logical, "id")
        && get(logical, "umf") == get(retained_logical, "umf");
    if !same_identity {
        return Err(err(
            "BINDING_ROLLBACK",
            "Current binding/model identities differ from migration",
        ));
    }
    let relationships = get(payload, "relationships")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    let mappings = get(receipt, "mappings")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    let mut residuals = Vec::new();
    for (index, row) in relationships.iter().enumerate() {
        ctx.charge_work(
            1,
            Utf16::from(format!("/extensions/umf.binding/relationships/{index}")),
        )?;
        let mut represented = false;
        for mapping in mappings {
            ctx.charge_work(
                1,
                Utf16::from(format!("/extensions/umf.binding/relationships/{index}")),
            )?;
            if let Some(stable) = get(mapping, "stable") {
                if same_json(stable, row, ctx)? {
                    represented = true;
                    break;
                }
            }
        }
        if !represented {
            residuals.push(Value::Object(vec![
                (Utf16::from("path"), Value::string_utf8(format!("/extensions/umf.binding/relationships/{index}"))),
                (Utf16::from("reason"), Value::string_utf8("ID-only or edited relationship choice is not representable in the restored name-based binding")),
                (Utf16::from("value"), umf_core::value::copy_json(row, ctx)?),
            ]));
        }
    }
    if !same_json(current, migrated, ctx)? {
        residuals.push(Value::Object(vec![
            (Utf16::from("path"), Value::String(Utf16::default())),
            (Utf16::from("reason"), Value::string_utf8("Complete current binding retained: rollback restores original content and does not discard later edits")),
            (Utf16::from("value"), umf_core::value::copy_json(current, ctx)?),
        ]));
    }
    Ok(Value::Object(vec![
        (
            Utf16::from("document"),
            umf_core::value::copy_json(retained_original, ctx)?,
        ),
        (Utf16::from("residuals"), Value::Array(residuals)),
    ]))
}
fn format(name: &str) -> Result<Format, EngineError> {
    match name {
        "json" => Ok(Format::Json),
        "yaml" => Ok(Format::Yaml),
        _ => Err(err("FORMAT", "Format must be json or yaml")),
    }
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if text(field(request, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("REQUEST", "Wrong Binding public profile"));
    }
    let operation = text_field(request, "op").ok_or_else(|| err("REQUEST", "op is required"))?;
    match operation.as_str() {
        "inspectRawTableBinding" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            let target =
                field(request, "target").ok_or_else(|| err("REQUEST", "target is required"))?;
            let module =
                field(request, "module").ok_or_else(|| err("REQUEST", "module is required"))?;
            let resources = BindingInspectionResources::new(ctx)?;
            Ok(validation_value(
                umf_core::binding_inspection::inspect_raw_table_binding(
                    &resources, binding, logical, target, module, ctx,
                )?,
            ))
        }
        "inspectBinding" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            Ok(validation_value(inspect(binding, logical, ctx)?))
        }
        "getBinding" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            require_inspection(binding, logical, ctx)?;
            if version(binding).is_some_and(|v| v == &Utf16::from("0.3.0")) {
                return Err(err(
                    "BINDING_PROFILE",
                    "Legacy native generators do not admit scalar-carrier bindings",
                ));
            }
            let payload = get(
                get(binding, "extensions")
                    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?,
                "umf.binding",
            )
            .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension is missing"))?;
            umf_core::value::copy_json(payload, ctx)
        }
        "readBindingDocument" => {
            let source = text(field(request, "source"), "source")?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            let fmt = format(text_field(request, "format").as_deref().unwrap_or("yaml"))?;
            let binding = serialization::read_json_value(source.units(), fmt, ctx)?;
            require_inspection(&binding, logical, ctx)?;
            Ok(binding)
        }
        "writeBindingDocument" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            let fmt = format(text_field(request, "format").as_deref().unwrap_or("yaml"))?;
            require_inspection(binding, logical, ctx)?;
            Ok(Value::String(serialization::write_json_value(
                binding, fmt, ctx,
            )?))
        }
        "projectBindingIndexes" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            let policy = text(field(request, "lossPolicy"), "lossPolicy")?
                .to_utf8()
                .map_err(|_| err("REQUEST", "lossPolicy must be UTF-8"))?;
            if policy != "strict" && policy != "report" {
                return Err(err("REQUEST", "lossPolicy must be strict or report"));
            }
            let resources = BindingIndexProjectionResources::new(ctx)?;
            umf_core::binding_index_projection::project_binding_indexes(
                &resources, binding, logical, &policy, ctx,
            )
        }
        "migrateBindingRelationships" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            migrate(binding, logical, ctx)
        }
        "rollbackBindingRelationships" => {
            let current =
                field(request, "current").ok_or_else(|| err("REQUEST", "current is required"))?;
            let logical =
                field(request, "logical").ok_or_else(|| err("REQUEST", "logical is required"))?;
            let receipt =
                field(request, "receipt").ok_or_else(|| err("REQUEST", "receipt is required"))?;
            rollback(current, logical, receipt, ctx)
        }
        "validateBit128Dataset" => {
            let binding =
                field(request, "binding").ok_or_else(|| err("REQUEST", "binding is required"))?;
            let source =
                field(request, "source").ok_or_else(|| err("REQUEST", "source is required"))?;
            let input =
                field(request, "input").ok_or_else(|| err("REQUEST", "input is required"))?;
            umf_core::bit128_dataset::validate_bit128_dataset(binding, source, input, ctx)
        }
        "validateBindingSemantics" => {
            let payload =
                field(request, "payload").ok_or_else(|| err("REQUEST", "payload is required"))?;
            let document =
                field(request, "document").ok_or_else(|| err("REQUEST", "document is required"))?;
            let path = text(field(request, "path"), "path")?;
            let scope = text(field(request, "scope"), "scope")?
                .to_utf8()
                .map_err(|_| err("REQUEST", "scope must be UTF-8"))?;
            let diagnostics = validate_binding_semantics(payload, document, path, &scope, ctx)?;
            Ok(Value::Array(
                diagnostics.into_iter().map(diagnostic_value).collect(),
            ))
        }
        _ => Err(err("REQUEST", "Unknown Binding public operation")),
    }
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        let response = execute(&request, &mut ctx)?;
        encode(&response, &mut ctx)
    })();
    result_envelope(result)
}
