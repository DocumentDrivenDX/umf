// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit Core Record Type authoring over retained core-kind receipts.
//! This candidate operates on the UMF ideal; it does not classify native data.
use crate::{
    context::Context,
    core_kind,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    value::{copy_json, Utf16, Value},
};

const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const REFERENCE_SCHEMA: &str =
    include_str!("../../../spec/core/semantic-type-reference.schema.json");
const RECORD_TYPE_SCHEMA: &str =
    include_str!("../../../spec/core/record-type-operation-v6.schema.json");

/// Static v6 result validator retained by the opt-in Record Type runtime.
#[derive(Debug)]
pub struct RecordTypeOperationSchema(CompiledSchema);

pub fn prepare_record_type_operation_schema(
    ctx: &mut Context<'_>,
) -> Result<RecordTypeOperationSchema, EngineError> {
    let parse = |source: &str, ctx: &mut Context<'_>| {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            ctx,
        )
    };
    let resources = SchemaResources {
        entries: vec![
            (k("urn:umf:core:0.10.0"), parse(CORE_SCHEMA, ctx)?),
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                parse(REFERENCE_SCHEMA, ctx)?,
            ),
            (
                k("urn:umf:core:kind-operation:6.0.0"),
                parse(KIND_SCHEMA, ctx)?,
            ),
        ],
    };
    Ok(RecordTypeOperationSchema(CompiledSchema::compile(
        &parse(RECORD_TYPE_SCHEMA, ctx)?,
        &resources,
        ctx,
    )?))
}

fn validate_operation_schema(
    value: &Value,
    ctx: &mut Context<'_>,
    code: &str,
    prepared: Option<&RecordTypeOperationSchema>,
) -> Result<(), EngineError> {
    let owned;
    let schema = if let Some(prepared) = prepared {
        &prepared.0
    } else {
        owned = prepare_record_type_operation_schema(ctx)?;
        &owned.0
    };
    let errors = schema.validate(value, ctx)?;
    if errors.is_empty() {
        return Ok(());
    }
    let json = Value::Array(
        errors
            .into_iter()
            .map(|e| {
                obj(vec![
                    ("instancePath", Value::String(e.instance_path)),
                    ("schemaPath", Value::String(e.schema_path)),
                    ("keyword", t(&e.keyword)),
                    ("message", Value::String(e.message)),
                    ("params", e.params),
                ])
            })
            .collect(),
    );
    let message = crate::serialization::stringify_compact_metered(&json, ctx)?;
    Err(EngineError::new(code, Utf16::default(), message))
}

fn validate_target(
    target: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let validation = engine.validate_document(target, registry, caps, ctx)?;
    if validation.valid {
        return Ok(());
    }
    let json = Value::Array(
        validation
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
    let message = crate::serialization::stringify_compact_metered(&json, ctx)?;
    Err(EngineError::new(
        "CORE_RECORD_TYPE_TARGET",
        Utf16::default(),
        message,
    ))
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
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m.iter_mut().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn s(v: &Value) -> Option<String> {
    if let Value::String(x) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn raw(v: &Value) -> Option<Utf16> {
    if let Value::String(x) = v {
        Some(x.clone())
    } else {
        None
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

/// Recompute an authored Record Type receipt. Both arguments are retained v6 kind receipts.
pub fn declare_core_record_type(
    field_input: &Value,
    record_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    declare_core_record_type_inner(field_input, record_input, engine, registry, caps, ctx, None)
}

pub fn declare_core_record_type_prepared(
    field_input: &Value,
    record_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: &RecordTypeOperationSchema,
) -> Result<Value, EngineError> {
    declare_core_record_type_inner(
        field_input,
        record_input,
        engine,
        registry,
        caps,
        ctx,
        Some(schemas),
    )
}

fn declare_core_record_type_inner(
    field_input: &Value,
    record_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: Option<&RecordTypeOperationSchema>,
) -> Result<Value, EngineError> {
    let field_copy = copy_json(field_input, ctx)?;
    let record_copy = copy_json(record_input, ctx)?;
    let field_target = get(&field_copy, "target")
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?;
    let field_author = core_kind::verify_core_kind_declaration(
        &field_copy,
        field_target,
        engine,
        registry,
        caps,
        ctx,
    )?;
    let source = copy_json(
        get(&field_author, "target")
            .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?,
        ctx,
    )?;
    let record_author = core_kind::verify_core_kind_declaration(
        &record_copy,
        &source,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if s(get(
        get(&field_author, "provenance").unwrap_or(&Value::Null),
        "kind",
    )
    .unwrap_or(&Value::Null))
    .as_deref()
        != Some("field")
        || s(get(
            get(&record_author, "provenance").unwrap_or(&Value::Null),
            "kind",
        )
        .unwrap_or(&Value::Null))
        .as_deref()
            != Some("record")
    {
        return Err(err(
            "CORE_RECORD_TYPE_KIND",
            "Expected authored Field and record definition",
        ));
    }
    let field_identity = get(&field_author, "identity")
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?;
    let module_id = raw(get(field_identity, "module").unwrap_or(&Value::Null))
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?;
    let element_id = raw(get(field_identity, "element").unwrap_or(&Value::Null))
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?;
    let modules = match get(&source, "modules") {
        Some(Value::Array(a)) => a,
        _ => {
            return Err(err(
                "CORE_RECORD_TYPE_KIND",
                "Expected authored Field and record definition",
            ));
        }
    };
    let mi = modules
        .iter()
        .position(|m| get(m, "id").and_then(raw).as_ref() == Some(&module_id))
        .ok_or_else(|| {
            err(
                "CORE_RECORD_TYPE_KIND",
                "Expected authored Field and record definition",
            )
        })?;
    let elements = match get(&modules[mi], "elements") {
        Some(Value::Array(a)) => a,
        _ => {
            return Err(err(
                "CORE_RECORD_TYPE_KIND",
                "Expected authored Field and record definition",
            ));
        }
    };
    let ei = elements
        .iter()
        .position(|e| get(e, "id").and_then(raw).as_ref() == Some(&element_id))
        .ok_or_else(|| {
            err(
                "CORE_RECORD_TYPE_KIND",
                "Expected authored Field and record definition",
            )
        })?;
    let field = &elements[ei];
    if get(field, "facets").is_some() {
        return Err(err(
            "CORE_RECORD_TYPE_FACETS",
            "A faceted value Field cannot also assert a record type",
        ));
    }
    if get(field, "scalarType").is_some() {
        return Err(err(
            "CORE_RECORD_TYPE_SCALAR",
            "Scalar family cannot also assert a record type",
        ));
    }
    if matches!(get(field,"references"),Some(Value::Array(refs)) if refs.iter().any(|r|s(get(r,"role").unwrap_or(&Value::Null)).as_deref()==Some("record-type")))
    {
        return Err(err(
            "CORE_RECORD_TYPE_EXISTING",
            "Existing record-type reference requires separate provenance reconciliation",
        ));
    }
    if get(field, "cardinality")
        .is_some_and(|v| !matches!(s(v).as_deref(), Some("one" | "unspecified")))
    {
        return Err(err(
            "CORE_RECORD_TYPE_CARDINALITY",
            "Direct record type requires non-container meaning; declare the item/value Field record type separately",
        ));
    }
    let rid = get(&record_author, "identity")
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?;
    let reference = obj(vec![
        ("role", t("record-type")),
        (
            "module",
            Value::String(
                raw(get(rid, "module").unwrap_or(&Value::Null))
                    .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?,
            ),
        ),
        (
            "element",
            Value::String(
                raw(get(rid, "element").unwrap_or(&Value::Null))
                    .ok_or_else(|| err("CORE_KIND_RECEIPT", "Malformed kind declaration"))?,
            ),
        ),
    ]);
    let mut target = copy_json(&source, ctx)?;
    let selected = get_mut(&mut target, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get_mut(mi)
            } else {
                None
            }
        })
        .and_then(|m| get_mut(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get_mut(ei)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            err(
                "CORE_RECORD_TYPE_KIND",
                "Expected authored Field and record definition",
            )
        })?;
    let refs = match get_mut(selected, "references") {
        Some(Value::Array(a)) => a,
        Some(_) => return Err(err("CORE_RECORD_TYPE_TARGET", "Invalid document")),
        None => {
            if let Value::Object(m) = selected {
                m.push((k("references"), Value::Array(Vec::new())));
            }
            match get_mut(selected, "references") {
                Some(Value::Array(a)) => a,
                _ => unreachable!(),
            }
        }
    };
    let reference_index = refs.len();
    refs.push(reference.clone());
    validate_target(&target, engine, registry, caps, ctx)?;
    let record_path = s(get(
        get(&record_author, "provenance").unwrap_or(&Value::Null),
        "idealPath",
    )
    .unwrap_or(&Value::Null))
    .unwrap_or_default();
    let record_path = record_path
        .strip_suffix("/kind")
        .unwrap_or(&record_path)
        .to_owned();
    let result = obj(vec![
        ("operation", t("declare-core-record-type")),
        ("version", t("6.0.0")),
        ("source", source),
        ("target", target),
        ("fieldAuthor", field_author),
        ("recordAuthor", record_author),
        ("reference", reference),
        (
            "provenance",
            obj(vec![
                ("origin", t("authored")),
                (
                    "idealPath",
                    t(&format!(
                        "/modules/{mi}/elements/{ei}/references/{reference_index}"
                    )),
                ),
                ("recordPath", t(&record_path)),
                ("nativePath", Value::Null),
                ("basis", t("explicit-record-type-declaration")),
                (
                    "binding",
                    obj(vec![
                        ("id", t("umf.core.record-type.authoring")),
                        ("version", t("6.0.0")),
                    ]),
                ),
            ]),
        ),
    ]);
    validate_operation_schema(&result, ctx, "CORE_RECORD_TYPE_RESULT", schemas)?;
    Ok(result)
}

pub fn prepare_core_record_type_verification(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    prepare_core_record_type_verification_inner(receipt, engine, registry, caps, ctx, None)
}

pub fn prepare_core_record_type_verification_prepared(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: &RecordTypeOperationSchema,
) -> Result<Value, EngineError> {
    prepare_core_record_type_verification_inner(receipt, engine, registry, caps, ctx, Some(schemas))
}

fn prepare_core_record_type_verification_inner(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: Option<&RecordTypeOperationSchema>,
) -> Result<Value, EngineError> {
    let copied = copy_json(receipt, ctx)?;
    if let Err(error) = validate_operation_schema(&copied, ctx, "CORE_RECORD_TYPE_RECEIPT", schemas)
    {
        if error.is_control_failure() || error.code == "LIMIT" {
            return Err(error);
        }
        return Err(err(
            "CORE_RECORD_TYPE_RECEIPT",
            "Malformed record-type declaration",
        ));
    }
    let names = [
        "operation",
        "version",
        "source",
        "target",
        "fieldAuthor",
        "recordAuthor",
        "reference",
        "provenance",
    ];
    let strict = matches!(&copied,Value::Object(m) if m.len()==names.len() && names.iter().all(|n|get(&copied,n).is_some()));
    if !strict
        || s(get(&copied, "operation").unwrap_or(&Value::Null)).as_deref()
            != Some("declare-core-record-type")
        || s(get(&copied, "version").unwrap_or(&Value::Null)).as_deref() != Some("6.0.0")
    {
        return Err(err(
            "CORE_RECORD_TYPE_RECEIPT",
            "Malformed record-type declaration",
        ));
    }
    let expected = if let Some(schemas) = schemas {
        declare_core_record_type_prepared(
            get(&copied, "fieldAuthor").unwrap(),
            get(&copied, "recordAuthor").unwrap(),
            engine,
            registry,
            caps,
            ctx,
            schemas,
        )?
    } else {
        declare_core_record_type(
            get(&copied, "fieldAuthor").unwrap(),
            get(&copied, "recordAuthor").unwrap(),
            engine,
            registry,
            caps,
            ctx,
        )?
    };
    if canonical(&copied, ctx, 0)? != canonical(&expected, ctx, 0)? {
        return Err(err(
            "CORE_RECORD_TYPE_RECEIPT",
            "Receipt differs from recomputed declaration",
        ));
    }
    Ok(copied)
}

pub fn finish_core_record_type_verification(
    receipt: Value,
    current: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if canonical(&current, ctx, 0)?
        != canonical(get(&receipt, "target").unwrap_or(&Value::Null), ctx, 0)?
    {
        return Err(err(
            "CORE_RECORD_TYPE_STALE",
            "Document changed after type declaration",
        ));
    }
    Ok(receipt)
}

pub fn verify_core_record_type_declaration(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = prepare_core_record_type_verification(receipt, engine, registry, caps, ctx)?;
    let copied = copy_json(current, ctx)?;
    finish_core_record_type_verification(prepared, copied, ctx)
}

fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Record Type canonicalization depth exceeded",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(a) => Ok(Value::Array(
            a.iter()
                .map(|v| canonical(v, ctx, depth + 1))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(m) => {
            let mut entries = m
                .iter()
                .map(|(k, v)| Ok((k.clone(), canonical(v, ctx, depth + 1)?)))
                .collect::<Result<Vec<_>, EngineError>>()?;
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(entries))
        }
        v => Ok(v.clone()),
    }
}
