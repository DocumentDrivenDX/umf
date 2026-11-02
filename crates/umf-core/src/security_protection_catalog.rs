// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned protection catalog wire inspection.
use crate::{
    context::Context,
    error::EngineError,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::{collections::BTreeSet, sync::OnceLock};

const PACKAGE: &str = include_str!("../../../spec/extensions/security-protection/package.json");
const TEXT_LIMIT: usize = 4_000_000;
const LITERAL_LIMIT: usize = 4096;

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(items)) => items,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn diagnostic(code: &str, path: Utf16, message: Value, severity: &str) -> Value {
    object(vec![
        ("code", string(code)),
        ("path", Value::String(path)),
        ("message", message),
        ("severity", string(severity)),
    ])
}
fn path_child(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => units.extend_from_slice(&[0x7e, b'0' as u16]),
            0x2f => units.extend_from_slice(&[0x7e, b'1' as u16]),
            x => units.push(x),
        }
    }
    Utf16::new(units)
}
fn path_index(path: &Utf16, index: usize) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    units.extend(index.to_string().encode_utf16());
    Utf16::new(units)
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn catalog_schema() -> Result<CompiledSchema, EngineError> {
    static SCHEMA: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    SCHEMA
        .get_or_init(|| {
            let mut ctx = Context::ordinary();
            let package = parse(PACKAGE, &mut ctx)?;
            let schema = get(&package, "schema").ok_or_else(|| {
                EngineError::new(
                    "PROTECTION_SCHEMA",
                    Utf16::default(),
                    "Embedded protection schema missing",
                )
            })?;
            CompiledSchema::compile_consumer(schema, &SchemaResources::default(), false, &mut ctx)
        })
        .clone()
}
fn charge_text(
    value: &Value,
    total: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    match value {
        Value::String(s) => {
            *total = total.saturating_add(s.len());
            ctx.charge_work(s.len(), Utf16::default())?;
        }
        Value::Array(items) => {
            for item in items {
                if !charge_text(item, total, ctx)? {
                    return Ok(false);
                }
            }
        }
        Value::Object(items) => {
            for (key, item) in items {
                *total = total.saturating_add(key.len());
                ctx.charge_work(key.len(), Utf16::default())?;
                if *total > TEXT_LIMIT || !charge_text(item, total, ctx)? {
                    return Ok(false);
                }
            }
        }
        _ => {}
    }
    Ok(*total <= TEXT_LIMIT)
}
fn unknown(
    value: &Value,
    known: &[&str],
    path: &Utf16,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Ok(());
    };
    for (key, _) in fields {
        ctx.charge_work(key.len(), Utf16::default())?;
        if !known.iter().any(|name| key == &Utf16::from(*name)) {
            diagnostics.push(diagnostic(
                "PROTECTION_UNKNOWN",
                path_child(path, key),
                string("Uninterpreted protection member retained"),
                "warning",
            ));
        }
    }
    Ok(())
}
fn known_refs(
    value: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    unknown(
        value,
        &["documentId", "moduleId", "elementId"],
        path,
        diagnostics,
        ctx,
    )
}
fn literal_bound(
    value: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let serialized = serialization::stringify_compact_metered(value, ctx)?;
    if serialized.len() > LITERAL_LIMIT {
        diagnostics.push(diagnostic(
            "PROTECTION_BOUND",
            path.clone(),
            string("resource-exhausted: canonical literal exceeds4096 UTF-16 units"),
            "error",
        ));
    }
    Ok(())
}
fn constant(
    value: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(field) = get(value, "field") {
        known_refs(
            field,
            &path_child(path, &Utf16::from("field")),
            diagnostics,
            ctx,
        )?;
    }
    if let Some(literal) = get(value, "value") {
        literal_bound(
            literal,
            &path_child(path, &Utf16::from("value")),
            diagnostics,
            ctx,
        )?;
    }
    Ok(())
}
fn has_errors(diagnostics: &[Value]) -> bool {
    diagnostics
        .iter()
        .any(|d| text(get(d, "severity")) == Some(&Utf16::from("error")))
}
fn report(source: Value, diagnostics: Vec<Value>) -> Value {
    let valid = !has_errors(&diagnostics);
    object(vec![
        ("source", source),
        ("valid", Value::Bool(valid)),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}
fn inspect_owned(source: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut total = 0;
    if !charge_text(&source, &mut total, ctx)? {
        return Ok(report(
            source,
            vec![diagnostic(
                "PROTECTION_BOUND",
                Utf16::default(),
                string("resource-exhausted: source key/string text exceeds4000000 UTF-16 units"),
                "error",
            )],
        ));
    }
    let schema = catalog_schema()?;
    let mut diagnostics = Vec::new();
    let mut schema_errors = schema.validate(&source, ctx)?;
    for error in schema_errors.drain(..) {
        diagnostics.push(diagnostic(
            "PROTECTION_STRUCTURE",
            error.instance_path,
            Value::String(error.message),
            "error",
        ));
    }
    if diagnostics.is_empty() {
        let root = Utf16::default();
        unknown(
            &source,
            &[
                "vocabulary",
                "version",
                "id",
                "revision",
                "transforms",
                "native",
            ],
            &root,
            &mut diagnostics,
            ctx,
        )?;
        let mut identities = BTreeSet::<(Utf16, Utf16)>::new();
        for (i, entry) in array(get(&source, "transforms")).iter().enumerate() {
            let transform_path = path_child(&root, &Utf16::from("transforms"));
            let path = path_index(&transform_path, i);
            let id = text(get(entry, "id")).cloned().unwrap_or_default();
            let version = text(get(entry, "version")).cloned().unwrap_or_default();
            ctx.charge_work(id.len().saturating_add(version.len()), Utf16::default())?;
            if !identities.insert((id, version)) {
                diagnostics.push(diagnostic(
                    "PROTECTION_DUPLICATE",
                    path.clone(),
                    string("Duplicate transform id/version pair"),
                    "error",
                ));
            }
            unknown(
                entry,
                &[
                    "id",
                    "version",
                    "kind",
                    "inputDomain",
                    "outputDomain",
                    "determinism",
                    "reversibility",
                    "disclosureProfile",
                    "queryUse",
                    "parameters",
                    "function",
                    "algorithm",
                    "saltCustody",
                    "custody",
                    "reverseAction",
                ],
                &path,
                &mut diagnostics,
                ctx,
            )?;
            for name in ["inputDomain", "outputDomain"] {
                if let Some(reference) = get(entry, name) {
                    known_refs(
                        reference,
                        &path_child(&path, &Utf16::from(name)),
                        &mut diagnostics,
                        ctx,
                    )?;
                }
            }
            if let Some(query) = get(entry, "queryUse") {
                unknown(
                    query,
                    &["predicate", "order", "group", "join", "aggregate"],
                    &path_child(&path, &Utf16::from("queryUse")),
                    &mut diagnostics,
                    ctx,
                )?;
            }
            let parameters_path = path_child(&path, &Utf16::from("parameters"));
            let mut names = BTreeSet::<Utf16>::new();
            let mut duplicate_parameter = false;
            for (j, parameter) in array(get(entry, "parameters")).iter().enumerate() {
                let ppath = path_index(&parameters_path, j);
                let name = text(get(parameter, "name")).cloned().unwrap_or_default();
                ctx.charge_work(name.len(), Utf16::default())?;
                if !names.insert(name) {
                    duplicate_parameter = true;
                }
                unknown(
                    parameter,
                    &["name", "field", "value"],
                    &ppath,
                    &mut diagnostics,
                    ctx,
                )?;
                constant(parameter, &ppath, &mut diagnostics, ctx)?;
            }
            if duplicate_parameter {
                diagnostics.push(diagnostic(
                    "PROTECTION_DUPLICATE",
                    parameters_path,
                    string("Duplicate exact identity"),
                    "error",
                ));
            }
            for (j, profile) in array(get(entry, "disclosureProfile")).iter().enumerate() {
                if matches!(profile, Value::String(_)) {
                    continue;
                }
                let ppath = path_index(&path_child(&path, &Utf16::from("disclosureProfile")), j);
                let kind = text(get(profile, "kind"));
                unknown(
                    profile,
                    if kind == Some(&Utf16::from("range")) {
                        &["kind", "bucket"]
                    } else {
                        &["kind", "length"]
                    },
                    &ppath,
                    &mut diagnostics,
                    ctx,
                )?;
                if kind == Some(&Utf16::from("range")) {
                    if let Some(bucket) = get(profile, "bucket") {
                        let bpath = path_child(&ppath, &Utf16::from("bucket"));
                        unknown(bucket, &["field", "value"], &bpath, &mut diagnostics, ctx)?;
                        constant(bucket, &bpath, &mut diagnostics, ctx)?;
                    }
                }
            }
            if let Some(salt) = get(entry, "saltCustody") {
                let kind = text(get(salt, "kind"));
                unknown(
                    salt,
                    if kind == Some(&Utf16::from("none")) {
                        &["kind"]
                    } else {
                        &["kind", "owner", "keyRef"]
                    },
                    &path_child(&path, &Utf16::from("saltCustody")),
                    &mut diagnostics,
                    ctx,
                )?;
            }
            if let Some(custody) = get(entry, "custody") {
                let cpath = path_child(&path, &Utf16::from("custody"));
                unknown(
                    custody,
                    &[
                        "owner",
                        "vaultRef",
                        "keyRef",
                        "formatPreserving",
                        "storageEffect",
                        "propagation",
                        "vaultWriteAction",
                    ],
                    &cpath,
                    &mut diagnostics,
                    ctx,
                )?;
                if let Some(propagation) = get(custody, "propagation") {
                    unknown(
                        propagation,
                        &["history", "snapshots", "exports", "feeds", "caches"],
                        &path_child(&cpath, &Utf16::from("propagation")),
                        &mut diagnostics,
                        ctx,
                    )?;
                }
            }
        }
    }
    diagnostics.push(diagnostic("PROTECTION_UNIMPLEMENTED",Utf16::default(),string("Wire structure and local bounds only; domain/function/query closure, action binding and native custody remain unimplemented"),"warning"));
    Ok(report(source, diagnostics))
}
pub fn inspect_protection_catalog(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = match copy_json(input, ctx) {
        Ok(v) => v,
        Err(error) if error.is_control_failure() => return Err(error),
        Err(error) => {
            return Ok(report(
                Value::Null,
                vec![diagnostic(
                    &error.code,
                    error.path,
                    Value::String(error.message),
                    "error",
                )],
            ))
        }
    };
    inspect_owned(source, ctx)
}
pub fn require_protection_interpretation(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspection = inspect_protection_catalog(input, ctx)?;
    let failure = array(get(&inspection, "diagnostics"))
        .iter()
        .find(|d| text(get(d, "severity")) == Some(&Utf16::from("error")))
        .or_else(|| array(get(&inspection, "diagnostics")).first());
    if let Some(diagnostic) = failure {
        let code = text(get(diagnostic, "code"))
            .and_then(|s| s.to_utf8().ok())
            .unwrap_or_else(|| "PROTECTION_UNIMPLEMENTED".into());
        let message = text(get(diagnostic, "message"))
            .cloned()
            .unwrap_or_else(|| Utf16::from("Protection interpretation refused"));
        let path = text(get(diagnostic, "path")).cloned().unwrap_or_default();
        return Err(EngineError::new(code, path, message));
    }
    Ok(inspection)
}
