// SPDX-License-Identifier: MIT OR Apache-2.0
//! Core scalar label inspection. This reports authored value-family labels only;
//! it does not infer native type, role, or container item type.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

const INSPECTION_SCHEMA: &str =
    include_str!("../../../spec/core/scalar-type-inspection-v0.3.schema.json");
/// Current generated core vocabulary order. The generated core schema is the
/// authority; the Rust integration test checks this mirror for drift.
const SCALARS: [&str; 11] = [
    "boolean",
    "integer",
    "decimal",
    "float",
    "string",
    "binary",
    "date",
    "time",
    "timestamp",
    "bits128",
    "uuid",
];

/// Return the generated core scalar vocabulary only for the exact current
/// core version, matching `scalarTypesForVersion`'s lookup semantics.
pub fn scalar_types_for_version(version: &Utf16) -> Vec<Utf16> {
    if version != &Utf16::from("0.10.0") {
        return Vec::new();
    }
    SCALARS.iter().map(|value| Utf16::from(*value)).collect()
}

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn raw(v: &Value) -> Option<Utf16> {
    match v {
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}
fn is_text(v: Option<&Value>, expected: &str) -> bool {
    v.and_then(raw).is_some_and(|value| value == k(expected))
}
fn err(c: &str, m: impl Into<String>, p: &str) -> EngineError {
    EngineError::new(c, k(p), m.into())
}
fn validate_source(
    v: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let result = engine.validate_document(v, registry, caps, ctx)?;
    if result.valid {
        return Ok(());
    }
    let diagnostics = Value::Array(
        result
            .diagnostics
            .into_iter()
            .map(|d| {
                obj(vec![
                    ("code", Value::String(d.code)),
                    ("path", Value::String(d.path)),
                    ("message", Value::String(d.message)),
                    (
                        "severity",
                        t(match d.severity {
                            crate::error::Severity::Error => "error",
                            crate::error::Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let message = crate::serialization::stringify_compact_metered(&diagnostics, ctx)?;
    Err(err(
        "CORE_SCALAR_TYPE_SOURCE",
        message.to_utf8().unwrap_or_default(),
        "",
    ))
}
fn validate_result(v: &Value, engine: &Engine, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &INSPECTION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    let errors = compiled.validate(v, ctx)?;
    if let Some(e) = errors.first() {
        return Err(err(
            "CORE_SCALAR_TYPE_RESULT",
            e.message.to_utf8().unwrap_or_default(),
            &e.instance_path.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(())
}

/// Inspect one explicit core element identity. Source and result are independently owned.
pub fn inspect_core_scalar_type(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;
    let fields = match &identity {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "CORE_SCALAR_TYPE_IDENTITY",
                "Expected explicit module and element identities",
                "",
            ));
        }
    };
    if fields
        .iter()
        .any(|(name, _)| name != &k("module") && name != &k("element"))
    {
        return Err(err(
            "CORE_SCALAR_TYPE_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    let module = get(&identity, "module")
        .and_then(raw)
        .filter(|x| !x.is_empty());
    let element_id = get(&identity, "element")
        .and_then(raw)
        .filter(|x| !x.is_empty());
    let (Some(module), Some(element_id)) = (module, element_id) else {
        return Err(err(
            "CORE_SCALAR_TYPE_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    };
    if !is_text(get(&source, "umf"), "0.10.0") {
        return Err(err(
            "CORE_SCALAR_TYPE_VERSION",
            "Current core 0.10.0 document required",
            "",
        ));
    }
    validate_source(&source, engine, registry, caps, ctx)?;
    let modules = match get(&source, "modules") {
        Some(Value::Array(a)) => a,
        _ => {
            return Err(err(
                "CORE_SCALAR_TYPE_MISSING",
                "Element identity is absent",
                "",
            ));
        }
    };
    let found = modules.iter().enumerate().find_map(|(mi, m)| {
        if get(m, "id").and_then(raw).as_ref() != Some(&module) {
            return None;
        }
        let elements = match get(m, "elements") {
            Some(Value::Array(a)) => a,
            _ => return None,
        };
        elements
            .iter()
            .enumerate()
            .find(|(_, e)| get(e, "id").and_then(raw).as_ref() == Some(&element_id))
            .map(|(ei, e)| (mi, ei, e))
    });
    let (mi, ei, element) =
        found.ok_or_else(|| err("CORE_SCALAR_TYPE_MISSING", "Element identity is absent", ""))?;
    let value = get(element, "scalarType");
    let meaning = if !is_text(get(element, "kind"), "field") {
        let mut fields = vec![("state", t("inapplicable"))];
        if let Some(v) = value {
            fields.push(("authoredScalarType", copy_json(v, ctx)?));
        }
        obj(fields)
    } else if value.is_none() {
        obj(vec![("state", t("missing"))])
    } else {
        let v = value.unwrap();
        let label = SCALARS
            .iter()
            .find(|candidate| raw(v).as_ref() == Some(&k(candidate)));
        if let Some(label) = label {
            obj(vec![("state", t("known")), ("scalarType", t(label))])
        } else {
            obj(vec![("state", t("unknown")), ("value", copy_json(v, ctx)?)])
        }
    };
    let result = obj(vec![
        ("operation", t("inspect-core-scalar-type")),
        ("version", t("0.3.0")),
        ("source", source),
        (
            "identity",
            obj(vec![
                ("module", Value::String(module)),
                ("element", Value::String(element_id)),
            ]),
        ),
        (
            "path",
            t(&format!("/modules/{mi}/elements/{ei}/scalarType")),
        ),
        ("meaning", meaning),
        ("provenance", t("unverified")),
    ]);
    validate_result(&result, engine, ctx)?;
    Ok(result)
}
