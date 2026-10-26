// SPDX-License-Identifier: MIT OR Apache-2.0
//! Core cardinality inspection and explicit author declaration.
//!
//! This module reads and writes only the core ideal. It does not classify a
//! physical or native representation. The caller supplies the engine and its
//! semantic resources so document admission uses the selected core schema.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    value::{copy_json, Utf16, Value},
};

const CARDINALITIES: [&str; 4] = ["one", "array", "map", "unspecified"];
const CURRENT_CORE: &str = "0.10.0";

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn text(value: &str) -> Value {
    Value::string_utf8(value)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
#[cfg(test)]
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(members) => members
            .iter_mut()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}
fn is_nonempty_string(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::String(value)) if !value.is_empty())
}
fn schema_diagnostics(
    errors: &[crate::schema::StructuralError],
    request_schema: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let mut items = Vec::with_capacity(errors.len());
    for error in errors {
        ctx.charge_work(
            error.instance_path.len()
                + error.schema_path.len()
                + error.keyword.encode_utf16().count()
                + error.message.len(),
            Utf16::default(),
        )?;
        let mut schema_path = error.schema_path.clone();
        let mut message = error.message.clone();
        let request_ref = "#/$defs/request/".encode_utf16().collect::<Vec<_>>();
        if request_schema {
            if let Some(start) = schema_path
                .units()
                .windows(request_ref.len())
                .position(|w| w == request_ref)
            {
                let mut units = schema_path.units().to_vec();
                units.splice(start..start + request_ref.len(), "#/".encode_utf16());
                schema_path = Utf16::new(units);
            }
        }
        if let Ok(text) = message.to_utf8() {
            if text.contains("fewer than 1 length") {
                message =
                    Utf16::from(text.replace("fewer than 1 length", "fewer than 1 characters"));
            }
        }
        let (params, message) = if request_schema && error.keyword == "enum" {
            // Ajv's public error envelope intentionally omits the schema's
            // allowed values for enum failures.
            (
                Value::Object(vec![]),
                Utf16::from("must pass \"enum\" keyword validation"),
            )
        } else if request_schema && error.keyword == "type" {
            let expected = get(&error.params, "type").and_then(string);
            let message = expected.map_or(message, |kind| Utf16::from(format!("must be {kind}")));
            (copy(&error.params, ctx)?, message)
        } else {
            (copy(&error.params, ctx)?, message)
        };
        items.push(Value::Object(vec![
            (
                key("instancePath"),
                Value::String(error.instance_path.clone()),
            ),
            (key("schemaPath"), Value::String(schema_path)),
            (key("keyword"), text(&error.keyword)),
            (key("params"), params),
            (key("message"), Value::String(message)),
        ]));
    }
    crate::serialization::stringify_compact_metered(&Value::Array(items), ctx)
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message.into())
}
fn validate(
    engine: &Engine,
    value: &Value,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
    error_path: &str,
) -> Result<(), EngineError> {
    let result = engine.validate_document(value, registry, capabilities, ctx)?;
    if result.valid {
        return Ok(());
    }
    let diagnostics = Value::Array(
        result
            .diagnostics
            .into_iter()
            .map(|d| {
                Value::Object(vec![
                    (key("code"), Value::String(d.code)),
                    (key("path"), Value::String(d.path)),
                    (key("message"), Value::String(d.message)),
                    (
                        key("severity"),
                        text(match d.severity {
                            crate::error::Severity::Error => "error",
                            crate::error::Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let message = crate::serialization::stringify_compact_metered(&diagnostics, ctx)?;
    Err(EngineError::new(code, Utf16::from(error_path), message))
}
fn copy(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(value, ctx)
}
fn validate_operation_schema(
    engine: &Engine,
    value: &Value,
    schema_source: &str,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let parse = |source: &str, ctx: &mut Context<'_>| {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            ctx,
        )
    };
    // Resolve the versioned operation schema's source/target references against
    // the exact current core resources selected by the caller's Engine.
    let schema = parse(schema_source, ctx)?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = CompiledSchema::compile(&schema, &resources, ctx)?;
    let errors = compiled.validate_codegen_errors(value, ctx)?;
    if errors.is_empty() {
        return Ok(());
    }
    let message = schema_diagnostics(&errors, false, ctx)?;
    Err(EngineError::new(code, Utf16::default(), message))
}
fn validate_request_schema(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &DECLARATION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let defs = get(&schema, "$defs")
        .and_then(|v| match v {
            Value::Object(v) => Some(v),
            _ => None,
        })
        .ok_or_else(|| {
            err(
                "CORE_CARDINALITY_REQUEST",
                "Request schema has no definitions",
                "",
            )
        })?;
    let request_defs = Value::Object(
        ["cardinality", "itemType", "request"]
            .into_iter()
            .filter_map(|name| defs.iter().find(|(k, _)| k == &key(name)).cloned())
            .collect(),
    );
    let wrapper = obj(vec![
        (
            "$schema",
            text("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("$defs", request_defs),
        ("$ref", text("#/$defs/request")),
    ]);
    let compiled = CompiledSchema::compile(&wrapper, &SchemaResources::default(), ctx)?;
    let mut errors = compiled.validate_codegen_errors(value, ctx)?;
    if errors.is_empty() {
        return Ok(());
    }
    // The schema evaluator reports errors inside `then`, while Ajv also emits
    // the enclosing `if` diagnostic after those branch errors. Derive this
    // from the versioned request schema's conditional semantics, so the
    // normalization applies to any request rejected by that condition.
    let has_then_branch_error = errors.iter().any(|error| {
        error
            .schema_path
            .to_utf8()
            .ok()
            .is_some_and(|path| path.starts_with("#/$defs/request/allOf/0/then/"))
    });
    if has_then_branch_error {
        ctx.charge_work(128, Utf16::default())?;
        let conditional_error = crate::schema::StructuralError {
            instance_path: Utf16::default(),
            python_source_path: false,
            schema_path: Utf16::from("#/$defs/request/allOf/0/if"),
            keyword: "if".to_owned(),
            params: obj(vec![("failingKeyword", text("then"))]),
            message: Utf16::from("must match \"then\" schema"),
            compiler_property_name: None,
            python_params: None,
            python_error: None,
            python_physical_instance_path: None,
            python_instance_override: None,
        };
        let insertion_index = errors
            .iter()
            .rposition(|error| {
                error
                    .schema_path
                    .to_utf8()
                    .ok()
                    .is_some_and(|path| path.starts_with("#/$defs/request/allOf/0/then/"))
            })
            .map_or(errors.len(), |index| index + 1);
        errors.insert(insertion_index, conditional_error);
    }
    let message = schema_diagnostics(&errors, true, ctx)?;
    Err(EngineError::new(
        "CORE_CARDINALITY_REQUEST",
        Utf16::default(),
        message,
    ))
}
const INSPECTION_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-operation-v6.schema.json");
const DECLARATION_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-operation-v4.schema.json");

#[derive(Clone, Debug, PartialEq)]
pub struct Identity {
    pub module: Utf16,
    pub element: Utf16,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Meaning {
    Known {
        cardinality: String,
        item_type: Option<Value>,
    },
    Missing,
    Inapplicable,
    Unknown {
        value: Value,
    },
}

fn meaning_value(meaning: &Meaning, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match meaning {
        Meaning::Known {
            cardinality,
            item_type,
        } => {
            let mut fields = vec![
                (key("state"), text("known")),
                (key("cardinality"), text(cardinality)),
            ];
            if let Some(item) = item_type {
                fields.push((key("itemType"), copy(item, ctx)?));
            }
            Ok(Value::Object(fields))
        }
        Meaning::Missing => Ok(obj(vec![("state", text("missing"))])),
        Meaning::Inapplicable => Ok(obj(vec![("state", text("inapplicable"))])),
        Meaning::Unknown { value } => Ok(obj(vec![
            ("state", text("unknown")),
            ("value", copy(value, ctx)?),
        ])),
    }
}

struct Located {
    source: Value,
    module_index: usize,
    element_index: usize,
    element: Value,
    path: String,
}
fn locate(
    input: &Value,
    identity: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<Located, EngineError> {
    if identity.module.is_empty() || identity.element.is_empty() {
        return Err(err(
            "CORE_CARDINALITY_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    let source = copy(input, ctx)?;
    locate_admitted(source, identity, engine, registry, caps, ctx, code)
}

/// Locate against a source already admitted by an opaque host adapter. This
/// keeps host reflection and semantic validation in one invocation Context
/// without charging a second recursive source copy.
fn locate_admitted(
    source: Value,
    identity: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<Located, EngineError> {
    if identity.module.is_empty() || identity.element.is_empty() {
        return Err(err(
            "CORE_CARDINALITY_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    validate(engine, &source, registry, caps, ctx, code, "")?;
    ctx.charge_work(
        identity.module.len() + identity.element.len(),
        Utf16::default(),
    )?;
    let found = {
        let modules = get(&source, "modules")
            .and_then(|v| match v {
                Value::Array(v) => Some(v),
                _ => None,
            })
            .ok_or_else(|| err(code, "Validated document has no modules", ""))?;
        let mut selected = None;
        'modules: for (mi, module) in modules.iter().enumerate() {
            if get(module, "id") != Some(&Value::String(identity.module.clone())) {
                continue;
            }
            if let Some(elements) = get(module, "elements").and_then(|v| match v {
                Value::Array(v) => Some(v),
                _ => None,
            }) {
                for (ei, element) in elements.iter().enumerate() {
                    if get(element, "id") == Some(&Value::String(identity.element.clone())) {
                        selected = Some((mi, ei));
                        break 'modules;
                    }
                }
            }
            break;
        }
        selected
    }
    .ok_or_else(|| err("CORE_CARDINALITY_MISSING", "Element identity is absent", ""))?;
    let element = get(&source, "modules")
        .and_then(|v| match v {
            Value::Array(v) => v.get(found.0),
            _ => None,
        })
        .and_then(|module| get(module, "elements"))
        .and_then(|v| match v {
            Value::Array(v) => v.get(found.1),
            _ => None,
        })
        .ok_or_else(|| err(code, "Validated document identity disappeared", ""))?;
    let element = copy(element, ctx)?;
    Ok(Located {
        source,
        module_index: found.0,
        element_index: found.1,
        element,
        path: format!("/modules/{}/elements/{}/cardinality", found.0, found.1),
    })
}

fn cardinality_state(element: &Value, ctx: &mut Context<'_>) -> Result<Meaning, EngineError> {
    match get(element, "cardinality") {
        None => {
            if string(get(element, "kind").unwrap_or(&Value::Null)).as_deref() == Some("field") {
                Ok(Meaning::Missing)
            } else {
                Ok(Meaning::Inapplicable)
            }
        }
        Some(Value::String(value)) => match value.to_utf8() {
            Ok(value) if CARDINALITIES.contains(&value.as_str()) => Ok(Meaning::Known {
                cardinality: value,
                item_type: get(element, "itemType")
                    .map(|item| copy(item, ctx))
                    .transpose()?,
            }),
            _ => Ok(Meaning::Unknown {
                value: copy(get(element, "cardinality").unwrap(), ctx)?,
            }),
        },
        Some(value) => Ok(Meaning::Unknown {
            value: copy(value, ctx)?,
        }),
    }
}

/// Inspect the explicitly selected core element. Provenance is always unverified.
pub fn inspect_core_cardinality(
    input: &Value,
    identity: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let found = locate(
        input,
        identity,
        engine,
        registry,
        caps,
        ctx,
        "CORE_CARDINALITY_SOURCE",
    )?;
    inspect_core_cardinality_from_located(found, identity, engine, ctx)
}

/// Inspect a source value already admitted by a Rust-driven host adapter.
pub(crate) fn inspect_core_cardinality_after_admission(
    source: Value,
    identity: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let found = locate_admitted(
        source,
        identity,
        engine,
        registry,
        caps,
        ctx,
        "CORE_CARDINALITY_SOURCE",
    )?;
    inspect_core_cardinality_from_located(found, identity, engine, ctx)
}

fn inspect_core_cardinality_from_located(
    found: Located,
    identity: &Identity,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let result = obj(vec![
        ("operation", text("inspect-core-cardinality")),
        ("version", text("6.0.0")),
        ("source", found.source),
        (
            "identity",
            obj(vec![
                ("module", Value::String(identity.module.clone())),
                ("element", Value::String(identity.element.clone())),
            ]),
        ),
        ("path", text(&found.path)),
        (
            "meaning",
            meaning_value(&cardinality_state(&found.element, ctx)?, ctx)?,
        ),
        ("provenance", text("unverified")),
    ]);
    validate_operation_schema(
        engine,
        &result,
        INSPECTION_SCHEMA,
        ctx,
        "CORE_CARDINALITY_RESULT",
    )?;
    Ok(result)
}

#[derive(Clone, Debug, PartialEq)]
pub enum ItemTypeAction {
    Keep,
    Set(Value),
    Clear,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Request {
    pub cardinality: String,
    pub item_type: ItemTypeAction,
}

fn parse_request(request: &Value, ctx: &mut Context<'_>) -> Result<Request, EngineError> {
    let members = match request {
        Value::Object(m) => m,
        _ => {
            return Err(err(
                "CORE_CARDINALITY_REQUEST",
                "Expected request object",
                "",
            ));
        }
    };
    if members
        .iter()
        .any(|(k, _)| ![key("cardinality"), key("itemType")].contains(k))
    {
        return Err(err(
            "CORE_CARDINALITY_REQUEST",
            "Unexpected request property",
            "",
        ));
    }
    let cardinality = get(request, "cardinality")
        .and_then(string)
        .ok_or_else(|| err("CORE_CARDINALITY_REQUEST", "Expected cardinality", ""))?;
    if !CARDINALITIES.contains(&cardinality.as_str()) {
        return Err(err(
            "CORE_CARDINALITY_REQUEST",
            "Expected one, array, map or unspecified",
            "",
        ));
    }
    let item_type = match get(request, "itemType") {
        None => ItemTypeAction::Keep,
        Some(Value::Null) => ItemTypeAction::Clear,
        Some(Value::Object(_v))
            if is_nonempty_string(get(request, "itemType").and_then(|v| get(v, "module")))
                && is_nonempty_string(get(request, "itemType").and_then(|v| get(v, "element"))) =>
        {
            ItemTypeAction::Set(copy(get(request, "itemType").unwrap(), ctx)?)
        }
        _ => {
            return Err(err(
                "CORE_CARDINALITY_REQUEST",
                "Expected itemType reference or null",
                "",
            ));
        }
    };
    if matches!(item_type, ItemTypeAction::Set(_))
        && !["array", "map"].contains(&cardinality.as_str())
    {
        return Err(err(
            "CORE_CARDINALITY_REQUEST",
            "Item type requires array or map cardinality",
            "",
        ));
    }
    Ok(Request {
        cardinality,
        item_type,
    })
}

/// Rust-owned ordered request admission for host adapters that must copy later
/// arguments only after the request has passed semantic schema checks.
pub fn admit_core_cardinality_request(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let copied = copy(request, ctx)?;
    admit_core_cardinality_request_admitted(copied, ctx).map(|admitted| admitted.value)
}

/// Request paired with its parsed form after host JSON admission. The value is
/// already a Rust-owned copy and must remain private to one invocation.
pub(crate) struct AdmittedRequest {
    value: Value,
    parsed: Request,
}

pub(crate) fn admit_core_cardinality_request_admitted(
    copied: Value,
    ctx: &mut Context<'_>,
) -> Result<AdmittedRequest, EngineError> {
    validate_request_schema(&copied, ctx)?;
    let parsed = parse_request(&copied, ctx)?;
    Ok(AdmittedRequest {
        value: copied,
        parsed,
    })
}

fn set_member(object: &mut Value, name: &str, value: Option<Value>) -> Result<(), EngineError> {
    let members = match object {
        Value::Object(m) => m,
        _ => return Err(err("CORE_CARDINALITY_SOURCE", "Expected object", "")),
    };
    if let Some(i) = members.iter().position(|(k, _)| k == &key(name)) {
        if let Some(value) = value {
            members[i].1 = value;
        } else {
            members.remove(i);
        }
    } else if let Some(value) = value {
        members.push((key(name), value));
    }
    Ok(())
}
fn replace_element(
    source: &mut Value,
    mi: usize,
    ei: usize,
    element: Value,
) -> Result<(), EngineError> {
    let modules = match source {
        Value::Object(m) => m
            .iter_mut()
            .find(|(k, _)| k == &key("modules"))
            .and_then(|(_, v)| match v {
                Value::Array(a) => Some(a),
                _ => None,
            }),
        _ => None,
    }
    .ok_or_else(|| err("CORE_CARDINALITY_SOURCE", "Missing modules", "/modules"))?;
    let elements = match modules
        .get_mut(mi)
        .and_then(|m| match m {
            Value::Object(m) => {
                m.iter_mut()
                    .find(|(k, _)| k == &key("elements"))
                    .and_then(|(_, v)| match v {
                        Value::Array(a) => Some(a),
                        _ => None,
                    })
            }
            _ => None,
        })
        .and_then(|e| e.get_mut(ei))
    {
        Some(e) => e,
        None => {
            return Err(err(
                "CORE_CARDINALITY_SOURCE",
                "Missing selected element",
                "/modules",
            ));
        }
    };
    *elements = element;
    Ok(())
}

/// Apply an explicit author decision, preserving source, prior meaning and unknown members.
pub fn declare_core_cardinality(
    input: &Value,
    identity: &Identity,
    request_value: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_request_schema(request_value, ctx)?;
    let request = parse_request(request_value, ctx)?;
    let retained_request = copy(request_value, ctx)?;
    let found = locate(
        input,
        identity,
        engine,
        registry,
        caps,
        ctx,
        "CORE_CARDINALITY_SOURCE",
    )?;
    declare_core_cardinality_from_located(
        found,
        identity,
        request,
        retained_request,
        engine,
        registry,
        caps,
        ctx,
    )
}

/// Apply a declaration after the host adapter has copied and admitted request
/// and source in predecessor order. This avoids re-copying either root.
pub(crate) fn declare_core_cardinality_after_admission(
    source: Value,
    identity: &Identity,
    request: AdmittedRequest,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let found = locate_admitted(
        source,
        identity,
        engine,
        registry,
        caps,
        ctx,
        "CORE_CARDINALITY_SOURCE",
    )?;
    declare_core_cardinality_from_located(
        found,
        identity,
        request.parsed,
        request.value,
        engine,
        registry,
        caps,
        ctx,
    )
}

fn declare_core_cardinality_from_located(
    found: Located,
    identity: &Identity,
    request: Request,
    retained_request: Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if get(&found.source, "umf").and_then(string).as_deref() != Some(CURRENT_CORE) {
        return Err(err(
            "CORE_CARDINALITY_VERSION",
            "Current core 0.10.0 source required",
            "",
        ));
    }
    if string(get(&found.element, "kind").unwrap_or(&Value::Null)).as_deref() != Some("field") {
        return Err(err(
            "CORE_CARDINALITY_ROLE",
            "Cardinality applies only to an explicit Field",
            &found.path,
        ));
    }
    if let Some(value) = get(&found.element, "cardinality") {
        if !string(value).is_some_and(|s| CARDINALITIES.contains(&s.as_str())) {
            return Err(err(
                "CORE_CARDINALITY_UNKNOWN",
                "Unknown cardinality cannot be overwritten by this operation",
                &found.path,
            ));
        }
    }
    let mut element = copy(&found.element, ctx)?;
    set_member(
        &mut element,
        "cardinality",
        Some(text(&request.cardinality)),
    )?;
    match &request.item_type {
        ItemTypeAction::Keep => (),
        ItemTypeAction::Set(item) => set_member(&mut element, "itemType", Some(copy(item, ctx)?))?,
        ItemTypeAction::Clear => set_member(&mut element, "itemType", None)?,
    }
    let mut target = copy(&found.source, ctx)?;
    replace_element(
        &mut target,
        found.module_index,
        found.element_index,
        element,
    )?;
    validate(
        engine,
        &target,
        registry,
        caps,
        ctx,
        "CORE_CARDINALITY_CONFLICT",
        &found.path,
    )?;
    let result = obj(vec![
        ("operation", text("declare-core-cardinality")),
        ("version", text("4.0.0")),
        ("source", found.source),
        ("target", target),
        (
            "identity",
            obj(vec![
                ("module", Value::String(identity.module.clone())),
                ("element", Value::String(identity.element.clone())),
            ]),
        ),
        ("request", retained_request),
        (
            "provenance",
            obj(vec![
                ("origin", text("authored")),
                ("idealPath", text(&found.path)),
                ("cardinality", text(&request.cardinality)),
                (
                    "binding",
                    obj(vec![
                        ("id", text("umf.core.cardinality.authoring")),
                        ("version", text("4.0.0")),
                    ]),
                ),
                ("basis", text("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    validate_operation_schema(
        engine,
        &result,
        DECLARATION_SCHEMA,
        ctx,
        "CORE_CARDINALITY_RESULT",
    )?;
    Ok(result)
}

fn canonical(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "LIMIT",
            "Cardinality canonicalization depth exceeded",
            "",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => Ok(Value::Array(
            items
                .iter()
                .map(|item| canonical(item, ctx, depth + 1))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(members) => {
            let mut m = Vec::with_capacity(members.len());
            for (k, v) in members {
                ctx.charge_work(k.len(), Utf16::default())?;
                m.push((k.clone(), canonical(v, ctx, depth + 1)?));
            }
            // Insertion sort keeps work admission fallible. Charge each key
            // comparison by its common-prefix scan so adversarial long keys
            // cannot hide quadratic work inside `sort_by`.
            for i in 1..m.len() {
                let mut j = i;
                while j > 0 {
                    let left = m[j - 1].0.units();
                    let right = m[j].0.units();
                    ctx.charge_work(left.len().min(right.len()) + 1, Utf16::default())?;
                    if m[j - 1].0 <= m[j].0 {
                        break;
                    }
                    m.swap(j - 1, j);
                    j -= 1;
                }
            }
            Ok(Value::Object(m))
        }
        _ => copy(value, ctx),
    }
}

fn prepare_verified_cardinality_receipt(
    receipt: Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if string(get(&receipt, "operation").unwrap_or(&Value::Null)).as_deref()
        != Some("declare-core-cardinality")
        || string(get(&receipt, "version").unwrap_or(&Value::Null)).as_deref() != Some("4.0.0")
    {
        return Err(err(
            "CORE_CARDINALITY_RECEIPT",
            "Malformed cardinality declaration",
            "",
        ));
    }
    validate_operation_schema(
        engine,
        &receipt,
        DECLARATION_SCHEMA,
        ctx,
        "CORE_CARDINALITY_RECEIPT",
    )
    .map_err(|error| {
        if error.is_control_failure() || error.code == "LIMIT" {
            return error;
        }
        err(
            "CORE_CARDINALITY_RECEIPT",
            "Malformed cardinality declaration",
            "",
        )
    })?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("CORE_CARDINALITY_RECEIPT", "Missing source", ""))?;
    let ident = get(&receipt, "identity")
        .ok_or_else(|| err("CORE_CARDINALITY_RECEIPT", "Missing identity", ""))?;
    let identity = Identity {
        module: get(ident, "module")
            .and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            })
            .ok_or_else(|| err("CORE_CARDINALITY_RECEIPT", "Missing module", ""))?,
        element: get(ident, "element")
            .and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            })
            .ok_or_else(|| err("CORE_CARDINALITY_RECEIPT", "Missing element", ""))?,
    };
    let request = get(&receipt, "request")
        .ok_or_else(|| err("CORE_CARDINALITY_RECEIPT", "Missing request", ""))?;
    let expected =
        declare_core_cardinality(source, &identity, request, engine, registry, caps, ctx)?;
    if canonical(&receipt, ctx, 0)? != canonical(&expected, ctx, 0)? {
        return Err(err(
            "CORE_CARDINALITY_RECEIPT",
            "Declaration does not match its archived input",
            "",
        ));
    }
    Ok(receipt)
}

/// Rust-owned receipt admission and recomputation phase used before host
/// adapters copy the later `current` argument. The returned value is retained
/// privately by the adapter until `finish_core_cardinality_verification`.
pub fn prepare_core_cardinality_verification(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy(receipt, ctx)?;
    prepare_core_cardinality_verification_after_admission(receipt, engine, registry, caps, ctx)
}

/// Validate an already-admitted receipt before a host adapter reflects the
/// later current-document argument.
pub(crate) fn prepare_core_cardinality_verification_after_admission(
    receipt: Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    prepare_verified_cardinality_receipt(receipt, engine, registry, caps, ctx)
}

/// Complete the staged verification after the host has copied `current`.
/// Revalidate the receipt here because this operation is also reachable via
/// the generic wire protocol, where callers can construct arbitrary payloads.
pub fn finish_core_cardinality_verification(
    prepared: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = copy(prepared, ctx)?;
    let current = copy(current, ctx)?;
    let receipt = prepare_verified_cardinality_receipt(prepared, engine, registry, caps, ctx)?;
    finish_verified_cardinality_current(receipt, current, ctx)
}

/// Complete a host-staged verification using values already admitted in the
/// same invocation Context. `prepared` is the private result of the preceding
/// receipt-validation phase, not caller input.
pub(crate) fn finish_core_cardinality_verification_after_admission(
    prepared: Value,
    current: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    finish_verified_cardinality_current(prepared, current, ctx)
}

fn finish_verified_cardinality_current(
    receipt: Value,
    current: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let target = get(&receipt, "target")
        .ok_or_else(|| err("CORE_CARDINALITY_RECEIPT", "Missing target", ""))?;
    if canonical(&current, ctx, 0)? != canonical(target, ctx, 0)? {
        return Err(err(
            "CORE_CARDINALITY_STALE",
            "Document changed since cardinality was declared",
            "",
        ));
    }
    Ok(receipt)
}

/// Verify a retained declaration and reject forged, altered or stale receipts.
pub fn verify_core_cardinality_declaration(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy(receipt, ctx)?;
    let current = copy(current, ctx)?;
    let prepared = prepare_verified_cardinality_receipt(receipt, engine, registry, caps, ctx)?;
    finish_verified_cardinality_current(prepared, current, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
    };

    struct NoCapabilities;
    impl Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _token: u64,
            _payload: &Value,
            _context: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }
    fn parse(source: &str) -> Value {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse(include_str!("../../../spec/core/schema.json")),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn source() -> Value {
        parse(
            r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","nullability":"required","extensions":{"future":{"opaque":"retain"}}},{"id":"v","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
        )
    }
    fn run_inspect(source: &Value) -> Value {
        inspect_core_cardinality(
            source,
            &Identity {
                module: "m".into(),
                element: "e".into(),
            },
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn run_declare(source: &Value, request: &Value) -> Value {
        declare_core_cardinality(
            source,
            &Identity {
                module: "m".into(),
                element: "e".into(),
            },
            request,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    #[test]
    fn inspection_keeps_missing_unknown_and_known_distinct() {
        assert_eq!(
            get(&run_inspect(&source()), "meaning"),
            Some(&obj(vec![("state", text("missing"))]))
        );
        let mut future = source();
        // Mutate through the ordered representation; an unknown value remains visible.
        let Value::Object(root) = &mut future else {
            panic!()
        };
        let modules = root.iter_mut().find(|(k, _)| k == &key("modules")).unwrap();
        let Value::Array(modules) = &mut modules.1 else {
            panic!()
        };
        let Value::Object(fields) = &mut modules[0] else {
            panic!()
        };
        let elems = fields
            .iter_mut()
            .find(|(k, _)| k == &key("elements"))
            .unwrap();
        let Value::Array(elems) = &mut elems.1 else {
            panic!()
        };
        let Value::Object(fields) = &mut elems[0] else {
            panic!()
        };
        fields.push((key("cardinality"), text("future-shape")));
        assert_eq!(
            get(&run_inspect(&future), "meaning"),
            Some(&obj(vec![
                ("state", text("unknown")),
                ("value", text("future-shape"))
            ]))
        );
    }

    #[test]
    fn unknown_lone_surrogate_cardinality_is_preserved_as_utf16() {
        let mut value = source();
        let modules = get_mut(&mut value, "modules").unwrap();
        let Value::Array(modules) = modules else {
            panic!()
        };
        let elements = get_mut(&mut modules[0], "elements").unwrap();
        let Value::Array(elements) = elements else {
            panic!()
        };
        if let Value::Object(fields) = &mut elements[0] {
            fields.push((key("cardinality"), Value::String(Utf16::new(vec![0xd800]))));
        }
        let inspection = run_inspect(&value);
        let meaning = get(&inspection, "meaning").unwrap();
        assert_eq!(get(meaning, "state"), Some(&text("unknown")));
        let Some(Value::String(value)) = get(meaning, "value") else {
            panic!()
        };
        assert_eq!(value.units(), &[0xd800]);
    }
    #[test]
    fn declaration_preserves_unknowns_and_supports_keep_set_clear() {
        let original = source();
        let request = obj(vec![
            ("cardinality", text("array")),
            (
                "itemType",
                obj(vec![
                    ("module", text("m")),
                    ("element", text("v")),
                    ("future", obj(vec![("opaque", text("x"))])),
                ]),
            ),
        ]);
        let receipt = run_declare(&original, &request);
        assert_eq!(get(&original, "umf"), Some(&text("0.10.0")));
        assert_eq!(
            get(
                get(&get(&receipt, "target").unwrap(), "modules").unwrap(),
                "0"
            ),
            None
        ); // arrays are never keyed by object names
        let target = get(&receipt, "target").unwrap();
        let Value::Array(modules) = get(target, "modules").unwrap() else {
            panic!()
        };
        let Value::Array(elements) = get(&modules[0], "elements").unwrap() else {
            panic!()
        };
        assert_eq!(get(&elements[0], "cardinality"), Some(&text("array")));
        assert!(get(get(&elements[0], "itemType").unwrap(), "future").is_some());
        let keep = run_declare(target, &obj(vec![("cardinality", text("map"))]));
        let Value::Array(modules) = get(get(&keep, "target").unwrap(), "modules").unwrap() else {
            panic!()
        };
        let Value::Array(elements) = get(&modules[0], "elements").unwrap() else {
            panic!()
        };
        assert!(get(&elements[0], "itemType").is_some());
        let clear = run_declare(
            target,
            &obj(vec![
                ("cardinality", text("one")),
                ("itemType", Value::Null),
            ]),
        );
        let Value::Array(modules) = get(get(&clear, "target").unwrap(), "modules").unwrap() else {
            panic!()
        };
        let Value::Array(elements) = get(&modules[0], "elements").unwrap() else {
            panic!()
        };
        assert!(get(&elements[0], "itemType").is_none());
        assert_eq!(
            get(&get(&clear, "provenance").unwrap(), "nativePath"),
            Some(&Value::Null)
        );
    }
    #[test]
    fn receipt_verification_rejects_forgery_and_staleness() {
        let request = obj(vec![("cardinality", text("one"))]);
        let receipt = run_declare(&source(), &request);
        let mut tampered = copy(&receipt, &mut Context::ordinary()).unwrap();
        *get_mut(get_mut(&mut tampered, "provenance").unwrap(), "basis").unwrap() = text("forged");
        assert_eq!(
            verify_core_cardinality_declaration(
                &tampered,
                get(&receipt, "target").unwrap(),
                &engine(),
                &Registry::new(),
                &mut NoCapabilities,
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "CORE_CARDINALITY_RECEIPT"
        );
        assert!(verify_core_cardinality_declaration(
            &receipt,
            get(&receipt, "target").unwrap(),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary()
        )
        .is_ok());
        let mut stale = get(&receipt, "target").unwrap().clone();
        let Value::Object(fields) = &mut stale else {
            panic!()
        };
        fields.iter_mut().find(|(k, _)| k == &key("id")).unwrap().1 = text("changed");
        let error = verify_core_cardinality_declaration(
            &receipt,
            &stale,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_STALE");
    }

    #[test]
    fn staged_request_admission_is_rust_owned_and_precedes_later_inputs() {
        let admitted = admit_core_cardinality_request(
            &obj(vec![("cardinality", text("one"))]),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(get(&admitted, "cardinality"), Some(&text("one")));
        let error = admit_core_cardinality_request(
            &obj(vec![("cardinality", text("future"))]),
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_REQUEST");
    }

    #[test]
    fn staged_receipt_preflight_precedes_later_current_admission() {
        let receipt = run_declare(&source(), &obj(vec![("cardinality", text("one"))]));
        let prepared = prepare_core_cardinality_verification(
            &receipt,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            finish_core_cardinality_verification(
                &prepared,
                get(&receipt, "target").unwrap(),
                &engine(),
                &Registry::new(),
                &mut NoCapabilities,
                &mut Context::ordinary(),
            )
            .unwrap(),
            receipt
        );

        let mut forged = copy(&receipt, &mut Context::ordinary()).unwrap();
        let archived = get_mut(&mut forged, "source").unwrap();
        let modules = get_mut(archived, "modules").unwrap();
        let Value::Array(modules) = modules else {
            panic!()
        };
        let Value::Array(elements) = get_mut(&mut modules[0], "elements").unwrap() else {
            panic!()
        };
        if let Value::Object(fields) = &mut elements[0] {
            fields.push((key("cardinality"), text("future-container")));
        }
        let error = prepare_core_cardinality_verification(
            &forged,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_UNKNOWN");
        assert_eq!(
            error.path.to_utf8().unwrap(),
            "/modules/0/elements/0/cardinality"
        );
    }

    #[test]
    fn staged_verifier_accepts_receipt_near_text_limit_when_reference_does() {
        let mut source = source();
        let modules = get_mut(&mut source, "modules").unwrap();
        let Value::Array(modules) = modules else {
            panic!()
        };
        let elements = get_mut(&mut modules[0], "elements").unwrap();
        let Value::Array(elements) = elements else {
            panic!()
        };
        let extensions = get_mut(&mut elements[0], "extensions").unwrap();
        let future = get_mut(extensions, "future").unwrap();
        *get_mut(future, "opaque").unwrap() =
            Value::String(Utf16::from("x".repeat(3_750_000).as_str()));

        let request = obj(vec![("cardinality", text("one"))]);
        let identity = Identity {
            module: "m".into(),
            element: "e".into(),
        };
        let receipt = declare_core_cardinality(
            &source,
            &identity,
            &request,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();

        let reference = verify_core_cardinality_declaration(
            &receipt,
            get(&receipt, "target").unwrap(),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        let prepared = prepare_core_cardinality_verification(
            &receipt,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        let staged = finish_core_cardinality_verification(
            &prepared,
            get(&receipt, "target").unwrap(),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(staged, reference);
    }

    #[test]
    fn verification_propagates_archived_declaration_errors_and_control_failures() {
        let receipt = run_declare(&source(), &obj(vec![("cardinality", text("one"))]));
        let mut forged = copy(&receipt, &mut Context::ordinary()).unwrap();
        let archived = get_mut(&mut forged, "source").unwrap();
        let modules = get_mut(archived, "modules").unwrap();
        let Value::Array(modules) = modules else {
            panic!()
        };
        let Value::Array(elements) = get_mut(&mut modules[0], "elements").unwrap() else {
            panic!()
        };
        if let Value::Object(fields) = &mut elements[0] {
            fields.push((key("cardinality"), text("future-container")));
        }
        let error = verify_core_cardinality_declaration(
            &forged,
            get(&receipt, "target").unwrap(),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_UNKNOWN");
        assert_eq!(
            error.path.to_utf8().unwrap(),
            "/modules/0/elements/0/cardinality"
        );

        let mut cancelled = || true;
        let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
        let error = verify_core_cardinality_declaration(
            &receipt,
            get(&receipt, "target").unwrap(),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "CANCELLED");
        assert!(error.is_control_failure());
    }

    #[test]
    fn verification_charges_current_copy_and_canonical_depth() {
        let receipt = run_declare(&source(), &obj(vec![("cardinality", text("one"))]));
        let mut limits = crate::context::Limits::ordinary();
        limits.max_values = 2;
        let mut ctx =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(
            verify_core_cardinality_declaration(
                &receipt,
                get(&receipt, "target").unwrap(),
                &engine(),
                &Registry::new(),
                &mut NoCapabilities,
                &mut ctx
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );

        let mut limits = crate::context::Limits::ordinary();
        limits.max_depth = 2;
        let mut ctx =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(
            verify_core_cardinality_declaration(
                &receipt,
                get(&receipt, "target").unwrap(),
                &engine(),
                &Registry::new(),
                &mut NoCapabilities,
                &mut ctx
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );
    }

    #[test]
    fn canonical_key_copy_and_long_prefix_sort_work_are_metered() {
        let prefix = "a".repeat(127);
        let value = Value::Object(vec![
            (Utf16::from(format!("{prefix}b")), Value::Bool(true)),
            (Utf16::from(format!("{prefix}c")), Value::Bool(false)),
        ]);
        let mut total = 0usize;
        let mut meter = |amount: usize| {
            total += amount;
            if total > 300 {
                Err(EngineError::new(
                    "WORK_DENIED",
                    Utf16::default(),
                    "canonical budget",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = canonical(&value, &mut ctx, 0).unwrap_err();
        assert_eq!(error.code, "WORK_DENIED");
        assert!(total > 300);
    }

    #[test]
    fn source_refusal_retains_all_diagnostics_and_empty_error_path() {
        let invalid = obj(vec![("id", text("x")), ("extra", Value::Bool(true))]);
        let error = inspect_core_cardinality(
            &invalid,
            &Identity {
                module: "m".into(),
                element: "e".into(),
            },
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_SOURCE");
        assert_eq!(error.path.to_utf8().unwrap(), "");
        let diagnostics: Value = crate::serialization::read_json_value(
            &error
                .message
                .to_utf8()
                .unwrap()
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap();
        let Value::Array(items) = diagnostics else {
            panic!("diagnostics must be an ordered array")
        };
        assert!(items.len() > 1, "expected multiple schema diagnostics");
    }

    #[test]
    fn empty_identity_refuses_before_copying_invalid_source() {
        let invalid = obj(vec![("unknown", Value::Bool(true))]);
        let mut metered = 0usize;
        let mut meter = |amount: usize| {
            metered += amount;
            Ok(())
        };
        let error = inspect_core_cardinality(
            &invalid,
            &Identity {
                module: Utf16::default(),
                element: Utf16::from("e"),
            },
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_IDENTITY");
        assert_eq!(
            metered, 0,
            "source copy must not start before identity admission"
        );
    }

    #[test]
    fn target_conflict_refusal_keeps_selected_path_and_ordered_diagnostics() {
        let error = declare_core_cardinality(
            &source(),
            &Identity {
                module: "m".into(),
                element: "e".into(),
            },
            &obj(vec![
                ("cardinality", text("array")),
                (
                    "itemType",
                    obj(vec![("module", text("missing")), ("element", text("gone"))]),
                ),
            ]),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_CONFLICT");
        assert_eq!(
            error.path.to_utf8().unwrap(),
            "/modules/0/elements/0/cardinality"
        );
        let diagnostics: Value = crate::serialization::read_json_value(
            &error
                .message
                .to_utf8()
                .unwrap()
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap();
        let Value::Array(items) = diagnostics else {
            panic!("diagnostics must be ordered")
        };
        assert!(!items.is_empty());
    }

    #[test]
    fn returned_operations_are_copy_isolated_and_meter_failures_propagate() {
        let original = source();
        let mut inspected = run_inspect(&original);
        if let Some(source) = get_mut(&mut inspected, "source") {
            *get_mut(source, "id").unwrap() = text("mutated-result");
        }
        assert_eq!(get(&original, "id"), Some(&text("author")));

        let mut calls = 0usize;
        let mut meter = |_: usize| {
            calls += 1;
            if calls > 2 {
                Err(EngineError::new("WORK_DENIED", Utf16::default(), "denied"))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = inspect_core_cardinality(
            &original,
            &Identity {
                module: "m".into(),
                element: "e".into(),
            },
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "WORK_DENIED");
    }
    #[test]
    fn request_schema_refusal_precedes_source_inspection() {
        let invalid_source = obj(vec![]);
        let invalid_request = obj(vec![("cardinality", text("future"))]);
        let error = declare_core_cardinality(
            &invalid_source,
            &Identity {
                module: "missing".into(),
                element: "missing".into(),
            },
            &invalid_request,
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "CORE_CARDINALITY_REQUEST");
    }
    #[test]
    fn frozen_typescript_vectors_match_rust_inspection_and_authorship() {
        let vectors = parse(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r5-cardinality/vectors.json"
        ));
        let identity_value = get(&vectors, "identity").unwrap();
        let identity = Identity {
            module: match get(identity_value, "module") {
                Some(Value::String(v)) => v.clone(),
                _ => panic!(),
            },
            element: match get(identity_value, "element") {
                Some(Value::String(v)) => v.clone(),
                _ => panic!(),
            },
        };
        for name in ["missing", "known", "unknown", "inapplicable"] {
            let source_name = if name == "missing" { "document" } else { name };
            let source = get(&vectors, source_name).unwrap();
            let actual = inspect_core_cardinality(
                source,
                &identity,
                &engine(),
                &Registry::new(),
                &mut NoCapabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            assert_eq!(
                get(&actual, "meaning"),
                get(get(&vectors, "expectedMeaning").unwrap(), name),
                "{name}"
            );
            assert_eq!(
                get(&actual, "path"),
                get(&vectors, "expectedPath"),
                "{name} path"
            );
        }
        let receipt = declare_core_cardinality(
            get(&vectors, "document").unwrap(),
            &identity,
            get(&vectors, "request").unwrap(),
            &engine(),
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        let target = get(&receipt, "target").unwrap();
        assert_eq!(target, get(&vectors, "known").unwrap());
        let provenance = get(&receipt, "provenance").unwrap();
        for name in ["origin", "basis", "nativePath", "binding"] {
            assert_eq!(
                get(provenance, name),
                get(get(&vectors, "expectedProvenance").unwrap(), name),
                "provenance {name}"
            );
        }
    }

    #[test]
    fn request_schema_diagnostics_match_ajv_envelopes() {
        let cases = [
            (
                Value::Null,
                r##"[{"instancePath":"","schemaPath":"#/type","keyword":"type","params":{"type":"object"},"message":"must be object"}]"##,
            ),
            (
                obj(vec![]),
                r##"[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"cardinality"},"message":"must have required property 'cardinality'"}]"##,
            ),
            (
                obj(vec![
                    ("cardinality", text("one")),
                    ("future", Value::Bool(true)),
                ]),
                r##"[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","params":{"additionalProperty":"future"},"message":"must NOT have additional properties"}]"##,
            ),
            (
                obj(vec![("cardinality", text("bogus"))]),
                r##"[{"instancePath":"/cardinality","schemaPath":"#/$defs/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"}]"##,
            ),
            (
                obj(vec![
                    ("cardinality", text("one")),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("e"))]),
                    ),
                ]),
                r##"[{"instancePath":"/cardinality","schemaPath":"#/allOf/0/then/properties/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"},{"instancePath":"","schemaPath":"#/allOf/0/if","keyword":"if","params":{"failingKeyword":"then"},"message":"must match \"then\" schema"}]"##,
            ),
            (
                obj(vec![
                    ("cardinality", text("bogus")),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("e"))]),
                    ),
                ]),
                r##"[{"instancePath":"/cardinality","schemaPath":"#/allOf/0/then/properties/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"},{"instancePath":"","schemaPath":"#/allOf/0/if","keyword":"if","params":{"failingKeyword":"then"},"message":"must match \"then\" schema"},{"instancePath":"/cardinality","schemaPath":"#/$defs/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"}]"##,
            ),
            (
                obj(vec![
                    ("cardinality", Value::Null),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("e"))]),
                    ),
                ]),
                r##"[{"instancePath":"/cardinality","schemaPath":"#/allOf/0/then/properties/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"},{"instancePath":"","schemaPath":"#/allOf/0/if","keyword":"if","params":{"failingKeyword":"then"},"message":"must match \"then\" schema"},{"instancePath":"/cardinality","schemaPath":"#/$defs/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"}]"##,
            ),
            (
                obj(vec![
                    ("cardinality", Value::Number(1.0)),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("e"))]),
                    ),
                ]),
                r##"[{"instancePath":"/cardinality","schemaPath":"#/allOf/0/then/properties/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"},{"instancePath":"","schemaPath":"#/allOf/0/if","keyword":"if","params":{"failingKeyword":"then"},"message":"must match \"then\" schema"},{"instancePath":"/cardinality","schemaPath":"#/$defs/cardinality/enum","keyword":"enum","params":{},"message":"must pass \"enum\" keyword validation"}]"##,
            ),
        ];
        for (input, expected) in cases {
            let error = validate_request_schema(&input, &mut Context::ordinary()).unwrap_err();
            assert_eq!(error.code, "CORE_CARDINALITY_REQUEST");
            assert_eq!(error.message.to_utf8().unwrap(), expected);
        }
    }

    #[test]
    fn frozen_typescript_request_matrix_matches_rust_declaration() {
        let packet = parse(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json"
        ));
        let controls = get(
            get(&packet, "hostAdmissionControls").unwrap(),
            "requestSchemaControls",
        )
        .unwrap();
        let document = get(&packet, "document").unwrap();
        let identity_value = get(&packet, "identity").unwrap();
        let identity = Identity {
            module: string(get(identity_value, "module").unwrap())
                .unwrap()
                .into(),
            element: string(get(identity_value, "element").unwrap())
                .unwrap()
                .into(),
        };
        let requests = [
            ("null", Value::Null),
            ("empty", obj(vec![])),
            ("number", Value::Number(42.0)),
            ("boolean", Value::Bool(true)),
            ("array", Value::Array(vec![])),
            (
                "extra",
                obj(vec![
                    ("cardinality", text("one")),
                    ("future", Value::Bool(true)),
                ]),
            ),
            (
                "invalidCardinality",
                obj(vec![("cardinality", text("bogus"))]),
            ),
            ("nullCardinality", obj(vec![("cardinality", Value::Null)])),
            (
                "numberCardinality",
                obj(vec![("cardinality", Value::Number(1.0))]),
            ),
            (
                "conditionalOne",
                obj(vec![
                    ("cardinality", text("one")),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("v"))]),
                    ),
                ]),
            ),
            (
                "arrayNullItem",
                obj(vec![
                    ("cardinality", text("array")),
                    ("itemType", Value::Null),
                ]),
            ),
            (
                "arrayEmptyItem",
                obj(vec![
                    ("cardinality", text("array")),
                    ("itemType", obj(vec![])),
                ]),
            ),
            (
                "arrayModuleEmpty",
                obj(vec![
                    ("cardinality", text("array")),
                    (
                        "itemType",
                        obj(vec![("module", text("")), ("element", text("v"))]),
                    ),
                ]),
            ),
            (
                "arrayElementEmpty",
                obj(vec![
                    ("cardinality", text("array")),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text(""))]),
                    ),
                ]),
            ),
            (
                "arrayItemExtra",
                obj(vec![
                    ("cardinality", text("array")),
                    (
                        "itemType",
                        obj(vec![
                            ("module", text("m")),
                            ("element", text("v")),
                            ("future", Value::Bool(true)),
                        ]),
                    ),
                ]),
            ),
            (
                "arrayItemArray",
                obj(vec![
                    ("cardinality", text("array")),
                    ("itemType", Value::Array(vec![])),
                ]),
            ),
            (
                "mapItemNumber",
                obj(vec![
                    ("cardinality", text("map")),
                    ("itemType", Value::Number(1.0)),
                ]),
            ),
            (
                "conditionalUnspecified",
                obj(vec![
                    ("cardinality", text("unspecified")),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("v"))]),
                    ),
                ]),
            ),
            (
                "conditionalNull",
                obj(vec![
                    ("cardinality", Value::Null),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("v"))]),
                    ),
                ]),
            ),
            (
                "conditionalNumber",
                obj(vec![
                    ("cardinality", Value::Number(1.0)),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("v"))]),
                    ),
                ]),
            ),
            (
                "conditionalBogus",
                obj(vec![
                    ("cardinality", text("bogus")),
                    (
                        "itemType",
                        obj(vec![("module", text("m")), ("element", text("v"))]),
                    ),
                ]),
            ),
            (
                "arrayItemNumberKeys",
                obj(vec![
                    ("cardinality", text("array")),
                    (
                        "itemType",
                        obj(vec![
                            ("module", Value::Number(1.0)),
                            ("element", Value::Number(2.0)),
                        ]),
                    ),
                ]),
            ),
        ];
        for (name, request) in requests {
            let actual = match declare_core_cardinality(
                document,
                &identity,
                &request,
                &engine(),
                &Registry::new(),
                &mut NoCapabilities,
                &mut Context::ordinary(),
            ) {
                Ok(value) => obj(vec![("ok", Value::Bool(true)), ("value", value)]),
                Err(error) => obj(vec![
                    ("ok", Value::Bool(false)),
                    (
                        "error",
                        obj(vec![
                            ("code", text(&error.code)),
                            ("message", Value::String(error.message)),
                            ("path", Value::String(error.path)),
                        ]),
                    ),
                ]),
            };
            assert_eq!(get(controls, name), Some(&actual), "request: {name}");
        }
    }
}
