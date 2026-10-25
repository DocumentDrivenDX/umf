// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit core Record membership inspection. This exposes authored members
//! without treating them as physical columns, native authority, or provenance.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

const INSPECTION_SCHEMA: &str =
    include_str!("../../../spec/core/record-members-inspection-v0.3.schema.json");

/// Pinned 0.3.0 result validator retained by operation runtimes.
pub struct RecordMembersInspectionSchema(crate::schema::CompiledSchema);

/// Compile the checked-in result schema against this Engine's fixed resources.
pub fn prepare_record_members_inspection_schema(
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<RecordMembersInspectionSchema, EngineError> {
    let schema = crate::serialization::read_json_value(
        &INSPECTION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    Ok(RecordMembersInspectionSchema(
        crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?,
    ))
}

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn text(value: &str) -> Value {
    Value::string_utf8(value)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn raw(value: &Value) -> Option<Utf16> {
    match value {
        Value::String(value) => Some(value.clone()),
        _ => None,
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn err_utf16(code: &str, message: Utf16, path: Utf16) -> EngineError {
    EngineError::new(code, path, message)
}
fn validate_source(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<crate::error::Diagnostic>, EngineError> {
    let validation = engine.validate_document(source, registry, capabilities, ctx)?;
    if validation.valid {
        return Ok(validation.diagnostics);
    }
    let diagnostics = Value::Array(
        validation
            .diagnostics
            .into_iter()
            .map(|diagnostic| {
                object(vec![
                    ("code", Value::String(diagnostic.code)),
                    ("path", Value::String(diagnostic.path)),
                    ("message", Value::String(diagnostic.message)),
                    (
                        "severity",
                        text(match diagnostic.severity {
                            Severity::Error => "error",
                            Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let message = crate::serialization::stringify_compact_metered(&diagnostics, ctx)?;
    Err(err_utf16(
        "CORE_RECORD_MEMBERS_SOURCE",
        message,
        Utf16::default(),
    ))
}
fn validate_result(
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
    prepared: Option<&RecordMembersInspectionSchema>,
) -> Result<(), EngineError> {
    let owned;
    let compiled = if let Some(prepared) = prepared {
        &prepared.0
    } else {
        let schema = crate::serialization::read_json_value(
            &INSPECTION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            ctx,
        )?;
        let resources = engine.schema_resources_with_context(ctx)?;
        owned = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
        &owned
    };
    let errors = compiled.validate(value, ctx)?;
    if let Some(error) = errors.first() {
        return Err(err_utf16(
            "CORE_RECORD_MEMBERS_RESULT",
            error.message.clone(),
            error.instance_path.clone(),
        ));
    }
    Ok(())
}
fn equals_text(value: Option<&Value>, expected: &str) -> bool {
    value
        .and_then(raw)
        .is_some_and(|value| value == k(expected))
}

/// Inspect one explicitly selected core element. The complete source remains owned in the result.
pub fn inspect_core_record_members(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    inspect_core_record_members_inner(
        input,
        identity_input,
        engine,
        registry,
        capabilities,
        ctx,
        None,
    )
}

/// Retained-schema form used by immutable operation runtimes.
pub fn inspect_core_record_members_prepared(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schema: &RecordMembersInspectionSchema,
) -> Result<Value, EngineError> {
    inspect_core_record_members_inner(
        input,
        identity_input,
        engine,
        registry,
        capabilities,
        ctx,
        Some(schema),
    )
}

fn inspect_core_record_members_inner(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schema: Option<&RecordMembersInspectionSchema>,
) -> Result<Value, EngineError> {
    let source = copy_json(input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;
    let identity_fields = match &identity {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "CORE_RECORD_MEMBERS_IDENTITY",
                "Expected explicit module and element identities",
                "",
            ));
        }
    };
    if identity_fields
        .iter()
        .any(|(key, _)| key != &k("module") && key != &k("element"))
    {
        return Err(err(
            "CORE_RECORD_MEMBERS_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    let module = get(&identity, "module")
        .and_then(raw)
        .filter(|value| !value.is_empty());
    let element_id = get(&identity, "element")
        .and_then(raw)
        .filter(|value| !value.is_empty());
    let (Some(module), Some(element_id)) = (module, element_id) else {
        return Err(err(
            "CORE_RECORD_MEMBERS_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    };
    if !equals_text(get(&source, "umf"), "0.10.0") {
        return Err(err(
            "CORE_RECORD_MEMBERS_VERSION",
            "Current core 0.10.0 document required",
            "",
        ));
    }
    let diagnostics = validate_source(&source, engine, registry, capabilities, ctx)?;
    let modules = match get(&source, "modules") {
        Some(Value::Array(modules)) => modules,
        _ => {
            return Err(err(
                "CORE_RECORD_MEMBERS_MISSING",
                "Element identity is absent",
                "",
            ));
        }
    };
    let found = modules
        .iter()
        .enumerate()
        .find_map(|(module_index, current)| {
            if get(current, "id").and_then(raw).as_ref() != Some(&module) {
                return None;
            }
            let elements = match get(current, "elements") {
                Some(Value::Array(elements)) => elements,
                _ => return None,
            };
            elements
                .iter()
                .enumerate()
                .find(|(_, candidate)| {
                    get(candidate, "id").and_then(raw).as_ref() == Some(&element_id)
                })
                .map(|(element_index, candidate)| (module_index, element_index, candidate))
        });
    let (module_index, element_index, element) = found.ok_or_else(|| {
        err(
            "CORE_RECORD_MEMBERS_MISSING",
            "Element identity is absent",
            "",
        )
    })?;
    let path = format!("/modules/{module_index}/elements/{element_index}/members");
    let meaning = if !equals_text(get(element, "kind"), "record") {
        object(vec![("state", text("inapplicable"))])
    } else if get(element, "members").is_none() {
        object(vec![("state", text("missing"))])
    } else {
        let members = copy_json(get(element, "members").expect("present members"), ctx)?;
        let prefix = Utf16::from(format!("{path}/"));
        let uninterpreted: Vec<Value> = diagnostics
            .iter()
            .filter(|diagnostic| {
                diagnostic.severity == Severity::Warning
                    && diagnostic.code == k("UNKNOWN_KEY_QUALIFIER")
                    && (diagnostic.path == Utf16::from(path.as_str())
                        || diagnostic.path.units().starts_with(prefix.units()))
            })
            .map(|diagnostic| Value::String(diagnostic.path.clone()))
            .collect();
        let state = if uninterpreted.is_empty() {
            "known"
        } else {
            "partial"
        };
        object(vec![
            ("state", text(state)),
            ("members", members),
            ("uninterpretedPaths", Value::Array(uninterpreted)),
        ])
    };
    let result = object(vec![
        ("operation", text("inspect-core-record-members")),
        ("version", text("0.3.0")),
        ("source", source),
        ("identity", identity),
        ("path", text(&path)),
        ("meaning", meaning),
        ("provenance", text("unverified")),
    ]);
    validate_result(&result, engine, ctx, schema)?;
    Ok(result)
}
