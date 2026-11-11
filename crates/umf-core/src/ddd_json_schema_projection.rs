// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-retaining DDD 0.1.0 to JSON Schema Draft 2020-12 projection.
use std::collections::BTreeMap;

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    json_schema_adapter,
    registry::Registry,
    serialization::{self, read_json_value, stringify_compact_metered, Format},
    value::{copy_json, Utf16, Value},
};

const DIALECT: &str = "https://json-schema.org/draft/2020-12/schema";
const DDD_EXTENSION: &str = "umf.ddd";
const DDD_TOKEN: u64 = 0x4444_4401;
const DDD_MANIFEST: &str = include_str!("../../../spec/extensions/ddd/package.json");

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LossPolicy {
    Strict,
    AllowReportedLoss,
}

#[derive(Clone, Debug)]
pub struct Bindings {
    pub id: Utf16,
    pub schema_id: Utf16,
    pub root_module: Utf16,
    pub root_element: Utf16,
    pub closed_objects: bool,
    pub loss_policy: LossPolicy,
    pub relations: Vec<(Utf16, Utf16)>,
}

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m
            .iter()
            .find(|(key, _)| key.units().iter().copied().eq(k.encode_utf16()))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn strval(s: &str) -> Value {
    Value::string_utf8(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn array_str(values: &[Utf16]) -> Value {
    Value::Array(values.iter().cloned().map(Value::String).collect())
}
fn escape_pointer(value: &Utf16) -> Result<String, EngineError> {
    let raw = value
        .to_utf8()
        .map_err(|_| err("DDD_BINDINGS", "Binding path must be valid Unicode"))?;
    Ok(raw.replace('~', "~0").replace('/', "~1"))
}

fn child_path(base: &Utf16, part: &str) -> Utf16 {
    Utf16::from(format!(
        "{}/{}",
        base.to_utf8().unwrap_or_default(),
        part.replace('~', "~0").replace('/', "~1")
    ))
}
fn value_text(value: Option<&Value>) -> Option<Utf16> {
    text(value).cloned()
}
fn array(value: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(a)) = value {
        Some(a)
    } else {
        None
    }
}
fn reference(value: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        value_text(get(value, "module"))?,
        value_text(get(value, "element"))?,
    ))
}
fn kind(value: &Value) -> Option<String> {
    text(get(value, "kind")).and_then(|v| v.to_utf8().ok())
}
fn diagnostic(code: &str, path: Utf16, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path,
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn report(diagnostics: Vec<Diagnostic>) -> Validation {
    let valid = !diagnostics.iter().any(|d| d.severity == Severity::Error);
    Validation {
        valid,
        complete: true,
        diagnostics,
    }
}

/// Validate the DDD package schema and all package semantics without host code.
pub fn inspect_ddd_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let resources = validation_resources(ctx)?;
    let mut validation = resources.engine.validate_document(
        document,
        &resources.registry,
        &mut DddCapabilities,
        ctx,
    )?;
    let vocabulary_version = text(
        get(
            get(document, "vocabularies").unwrap_or(&Value::Null),
            DDD_EXTENSION,
        )
        .and_then(|v| get(v, "version")),
    )
    .and_then(|v| v.to_utf8().ok());
    let has_bounded_context = array(get(document, "modules"))
        .unwrap_or(&[])
        .iter()
        .any(|module| {
            kind(
                get(
                    get(module, "extensions").unwrap_or(&Value::Null),
                    DDD_EXTENSION,
                )
                .unwrap_or(&Value::Null),
            )
            .as_deref()
                == Some("bounded-context")
        });
    if vocabulary_version.as_deref() != Some("0.1.0") || !has_bounded_context {
        validation.valid = false;
        validation.complete = false;
        validation.diagnostics.push(diagnostic(
            "DDD_PROFILE",
            Utf16::default(),
            "Expected umf.ddd 0.1.0 and a bounded context",
            Severity::Error,
        ));
    }
    Ok(validation)
}

/// Return a copied DDD definition after native profile and semantic validation.
pub fn get_ddd_definition(
    document: &Value,
    module_id: &Utf16,
    element_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validation = inspect_ddd_document(document, ctx)?;
    if !validation.valid {
        let profile = validation
            .diagnostics
            .iter()
            .find(|d| d.code == Utf16::from("DDD_PROFILE"));
        return Err(EngineError::new(
            if profile.is_some() {
                "DDD_PROFILE"
            } else {
                "DDD_DOCUMENT"
            },
            profile.map(|d| d.path.clone()).unwrap_or_default(),
            if let Some(profile) = profile {
                profile.message.to_utf8().unwrap_or_default()
            } else {
                "Invalid DDD model".to_owned()
            },
        ));
    }
    let modules = array(get(document, "modules")).unwrap_or(&[]);
    let module = modules
        .iter()
        .find(|module| text(get(module, "id")) == Some(module_id));
    let element = module
        .and_then(|module| array(get(module, "elements")))
        .and_then(|elements| {
            elements
                .iter()
                .find(|element| text(get(element, "id")) == Some(element_id))
        });
    let definition = element
        .and_then(|element| get(get(element, "extensions")?, DDD_EXTENSION))
        .ok_or_else(|| {
            EngineError::new("DDD_REFERENCE", Utf16::default(), "Missing DDD definition")
        })?;
    copy_json(definition, ctx)
}

/// Atomically replace one DDD definition, retaining all unrelated source data.
pub fn edit_ddd_definition(
    document: &Value,
    module_id: &Utf16,
    element_id: &Utf16,
    replacement: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let initial = inspect_ddd_document(document, ctx)?;
    if !initial.valid || !initial.complete {
        return Err(EngineError::new(
            "UNSAFE_EDIT",
            Utf16::default(),
            "All present semantics must be validated before editing",
        ));
    }
    let mut candidate = copy_json(document, ctx)?;
    let modules = match get_mut(&mut candidate, "modules") {
        Some(Value::Array(modules)) => modules,
        _ => {
            return Err(EngineError::new(
                "MISSING_ELEMENT",
                Utf16::default(),
                "Extension instance not found",
            ))
        }
    };
    let module = modules
        .iter_mut()
        .find(|module| text(get(module, "id")) == Some(module_id));
    let element = module.and_then(|module| match get_mut(module, "elements") {
        Some(Value::Array(elements)) => elements
            .iter_mut()
            .find(|element| text(get(element, "id")) == Some(element_id)),
        _ => None,
    });
    let extensions = element.and_then(|element| get_mut(element, "extensions"));
    let payload = match extensions {
        Some(Value::Object(fields)) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(DDD_EXTENSION))
            .map(|(_, value)| value),
        _ => None,
    }
    .ok_or_else(|| {
        EngineError::new(
            "MISSING_ELEMENT",
            Utf16::default(),
            "Extension instance not found",
        )
    })?;
    *payload = copy_json(replacement, ctx)?;
    let checked = inspect_ddd_document(&candidate, ctx)?;
    if !checked.valid || !checked.complete {
        let diagnostics = Value::Array(
            checked
                .diagnostics
                .iter()
                .map(|d| {
                    object(vec![
                        ("code", Value::String(d.code.clone())),
                        ("path", Value::String(d.path.clone())),
                        ("message", Value::String(d.message.clone())),
                        (
                            "severity",
                            strval(if d.severity == Severity::Error {
                                "error"
                            } else {
                                "warning"
                            }),
                        ),
                    ])
                })
                .collect(),
        );
        return Err(EngineError::new(
            "INVALID_EDIT",
            Utf16::default(),
            stringify_compact_metered(&diagnostics, ctx)?,
        ));
    }
    Ok(candidate)
}

fn get_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

pub fn validate_ddd_payload(
    document: &Value,
    payload: &Value,
    path: &Utf16,
    scope: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    semantic_diagnostics(
        payload,
        &SemanticContext {
            document: copy_json(document, ctx)?,
            source_document: None,
            source_payload: None,
            path: path.clone(),
            scope: scope.to_owned(),
        },
        ctx,
    )
}

struct DddValidationResources {
    engine: Engine,
    registry: Registry,
}
fn validation_resources(ctx: &mut Context<'_>) -> Result<DddValidationResources, EngineError> {
    fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let units = source.encode_utf16().collect::<Vec<_>>();
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
    let resources = engine.schema_resources_with_context(ctx)?;
    let manifest = read(DDD_MANIFEST, ctx)?;
    let mut registry = Registry::new();
    registry.register(
        &manifest,
        Some(DDD_TOKEN),
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    Ok(DddValidationResources { engine, registry })
}
struct DddCapabilities;
impl Capabilities for DddCapabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token != DDD_TOKEN {
            return Err(Utf16::from("Unexpected DDD validator capability"));
        }
        Err(Utf16::from(
            "DDD inspection requires the invocation Context",
        ))
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != DDD_TOKEN {
            return Err(CapabilityError::Host(Utf16::from(
                "Unexpected DDD validator capability",
            )));
        }
        semantic_diagnostics(payload, context, ctx).map_err(CapabilityError::Engine)
    }
}

fn add_ddd_diag(
    out: &mut Vec<Diagnostic>,
    base: &Utf16,
    code: &str,
    suffix: &str,
    message: &str,
    severity: Severity,
) {
    let prefix = base.to_utf8().unwrap_or_default();
    out.push(diagnostic(
        code,
        Utf16::from(format!("{prefix}{suffix}")),
        message,
        severity,
    ));
}

fn resolve_ddd_reference(
    document: &Value,
    reference: &(Utf16, Utf16),
    base: &Utf16,
    suffix: &str,
    out: &mut Vec<Diagnostic>,
) -> Option<Value> {
    let modules = array(get(document, "modules")).unwrap_or(&[]);
    let found = modules
        .iter()
        .find(|module| text(get(module, "id")) == Some(&reference.0))
        .and_then(|module| {
            array(get(module, "elements")).and_then(|elements| {
                elements
                    .iter()
                    .find(|element| text(get(element, "id")) == Some(&reference.1))
            })
        })
        .and_then(|element| {
            get(
                get(element, "extensions").unwrap_or(&Value::Null),
                DDD_EXTENSION,
            )
        })
        .cloned();
    if found.is_none() {
        add_ddd_diag(
            out,
            base,
            "DDD_REFERENCE",
            suffix,
            &format!(
                "Missing DDD concept {}.{}",
                reference.0.to_utf8().unwrap_or_default(),
                reference.1.to_utf8().unwrap_or_default()
            ),
            Severity::Error,
        );
    }
    found
}

fn semantic_diagnostics(
    payload: &Value,
    context: &SemanticContext,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let document = &context.document;
    let mut diagnostics = Vec::new();
    let payload_kind = kind(payload).unwrap_or_default();
    let modules = array(get(document, "modules")).unwrap_or(&[]);
    let mut module_index = None;
    let mut element_index = None;
    if let Ok(path) = context.path.to_utf8() {
        let parts = path.split('/').collect::<Vec<_>>();
        module_index = parts
            .iter()
            .position(|part| *part == "modules")
            .and_then(|i| parts.get(i + 1))
            .and_then(|i| i.parse::<usize>().ok());
        element_index = parts
            .iter()
            .position(|part| *part == "elements")
            .and_then(|i| parts.get(i + 1))
            .and_then(|i| i.parse::<usize>().ok());
    }
    let local = module_index.and_then(|i| modules.get(i));
    let current = local.and_then(|module| {
        array(get(module, "elements"))
            .and_then(|elements| element_index.and_then(|i| elements.get(i)))
    });
    let expected_scope = match payload_kind.as_str() {
        "bounded-context" => "module",
        "context-map" => "document",
        _ => "element",
    };
    if context.scope != expected_scope {
        add_ddd_diag(
            &mut diagnostics,
            &context.path,
            "DDD_SCOPE",
            "",
            "DDD declaration has the wrong attachment scope",
            Severity::Error,
        );
    }
    if context.scope == "element"
        && kind(
            local
                .and_then(|m| get(get(m, "extensions").unwrap_or(&Value::Null), DDD_EXTENSION))
                .unwrap_or(&Value::Null),
        )
        .as_deref()
            != Some("bounded-context")
    {
        add_ddd_diag(
            &mut diagnostics,
            &context.path,
            "DDD_CONTEXT",
            "",
            "DDD concepts require an explicit bounded-context module",
            Severity::Error,
        );
    }

    let manifest_units = DDD_MANIFEST.encode_utf16().collect::<Vec<_>>();
    let manifest = read_json_value(&manifest_units, Format::Json, ctx)?;
    let schema_name = match payload_kind.as_str() {
        "entity" => "entity",
        "value" => "value",
        "domain-event" => "event",
        "domain-service" => "service",
        "repository" => "repository",
        "bounded-context" => "context",
        "context-map" => "map",
        _ => "",
    };
    if !schema_name.is_empty() {
        let schema = get(
            get(get(&manifest, "schema").unwrap_or(&Value::Null), "$defs").unwrap_or(&Value::Null),
            schema_name,
        )
        .unwrap_or(&Value::Null);
        inspect_unknown_ddd(
            payload,
            schema,
            &manifest,
            &context.path,
            &mut diagnostics,
            ctx,
        )?;
    }

    if let Some(Value::Object(fields)) = get(payload, "fields") {
        for (name, field) in fields {
            let field_type = get(field, "type").unwrap_or(&Value::Null);
            if kind(field_type).as_deref() == Some("concept") {
                if let Some(reference) = get(field_type, "target").and_then(reference) {
                    let field_name = name.to_utf8().unwrap_or_default();
                    let field_name = field_name.replace('~', "~0").replace('/', "~1");
                    let suffix = format!("/fields/{field_name}/type/target");
                    if let Some(target) = resolve_ddd_reference(
                        document,
                        &reference,
                        &context.path,
                        &suffix,
                        &mut diagnostics,
                    ) {
                        if !["entity", "value", "domain-event"]
                            .contains(&kind(&target).as_deref().unwrap_or(""))
                        {
                            add_ddd_diag(
                                &mut diagnostics,
                                &context.path,
                                "DDD_FIELD",
                                &format!("/fields/{field_name}"),
                                "Field type must denote data, not a service or repository",
                                Severity::Error,
                            );
                        }
                    }
                }
            }
        }
    }

    if payload_kind == "entity" {
        let identity = get(payload, "identity").unwrap_or(&Value::Null);
        let identity_fields = array(get(identity, "fields")).unwrap_or(&[]);
        for name in identity_fields {
            if let Some(name) = text(Some(name)) {
                let field = get(
                    get(payload, "fields").unwrap_or(&Value::Null),
                    &name.to_utf8().unwrap_or_default(),
                );
                if field.is_none()
                    || text(get(field.unwrap_or(&Value::Null), "cardinality"))
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        != Some("one")
                {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_IDENTITY",
                        "/identity",
                        "Identity fields must exist and be singular required values",
                        Severity::Error,
                    );
                }
            }
        }
        let identity_scope = text(get(identity, "scope"))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if get(payload, "aggregate").is_some() && identity_scope != "context" {
            add_ddd_diag(
                &mut diagnostics,
                &context.path,
                "DDD_IDENTITY",
                "/identity",
                "An aggregate root requires context-scoped identity",
                Severity::Error,
            );
        }
        if let Some(members) = array(get(
            get(payload, "aggregate").unwrap_or(&Value::Null),
            "members",
        )) {
            for (i, member) in members.iter().enumerate() {
                if let Some(reference) = reference(member) {
                    let suffix = format!("/aggregate/members/{i}");
                    let target = resolve_ddd_reference(
                        document,
                        &reference,
                        &context.path,
                        &suffix,
                        &mut diagnostics,
                    );
                    let local_id = text(local.and_then(|v| get(v, "id"))).cloned();
                    let element_id = text(current.and_then(|v| get(v, "id"))).cloned();
                    if Some(reference.0.clone()) != local_id {
                        add_ddd_diag(
                            &mut diagnostics,
                            &context.path,
                            "DDD_BOUNDARY",
                            &suffix,
                            "Aggregate membership cannot cross bounded contexts",
                            Severity::Error,
                        );
                    }
                    if Some(reference.0.clone()) == local_id
                        && Some(reference.1.clone()) == element_id
                    {
                        add_ddd_diag(
                            &mut diagnostics,
                            &context.path,
                            "DDD_BOUNDARY",
                            &suffix,
                            "A root cannot be its own member",
                            Severity::Error,
                        );
                    }
                    if let Some(target) = target {
                        let target_kind = kind(&target).unwrap_or_default();
                        if !["entity", "value"].contains(&target_kind.as_str())
                            || get(&target, "aggregate").is_some()
                        {
                            add_ddd_diag(
                                &mut diagnostics,
                                &context.path,
                                "DDD_BOUNDARY",
                                &suffix,
                                "Members must be non-root entities or value objects",
                                Severity::Error,
                            );
                        }
                        if target_kind == "entity" && aggregate_owners(document, &reference) != 1 {
                            add_ddd_diag(&mut diagnostics, &context.path, "DDD_OWNERSHIP", &suffix, "An entity definition cannot belong to conflicting aggregate boundaries in this profile", Severity::Error);
                        }
                    }
                }
            }
        }
        if identity_scope == "aggregate" {
            if let (Some(module), Some(element)) = (
                text(local.and_then(|v| get(v, "id"))),
                text(current.and_then(|v| get(v, "id"))),
            ) {
                let reference = (module.clone(), element.clone());
                if aggregate_owners(document, &reference) != 1 {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_IDENTITY",
                        "/identity",
                        "Aggregate-scoped identity requires exactly one aggregate owner",
                        Severity::Error,
                    );
                }
            }
        }
    }

    if payload_kind == "value" {
        let mut names = match get(payload, "fields") {
            Some(Value::Object(members)) => members
                .iter()
                .map(|(name, _)| name.clone())
                .collect::<Vec<_>>(),
            _ => Vec::new(),
        };
        let mut equality = array(get(
            get(payload, "equality").unwrap_or(&Value::Null),
            "fields",
        ))
        .unwrap_or(&[])
        .iter()
        .filter_map(|value| text(Some(value)).cloned())
        .collect::<Vec<_>>();
        names.sort();
        equality.sort();
        if names != equality {
            add_ddd_diag(
                &mut diagnostics,
                &context.path,
                "DDD_EQUALITY",
                "/equality",
                "Value equality must explicitly include every declared field",
                Severity::Error,
            );
        }
    }

    if payload_kind == "repository" {
        if let Some(reference) = get(payload, "aggregate").and_then(reference) {
            if let Some(target) = resolve_ddd_reference(
                document,
                &reference,
                &context.path,
                "/aggregate",
                &mut diagnostics,
            ) {
                if kind(&target).as_deref() != Some("entity") || get(&target, "aggregate").is_none()
                {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_REPOSITORY",
                        "/aggregate",
                        "Repository must target an aggregate root",
                        Severity::Error,
                    );
                }
            }
            if Some(reference.0) != text(local.and_then(|v| get(v, "id"))).cloned() {
                add_ddd_diag(
                    &mut diagnostics,
                    &context.path,
                    "DDD_CONTEXT",
                    "/aggregate",
                    "Repository belongs to the aggregate bounded context",
                    Severity::Error,
                );
            }
        }
    }
    if payload_kind == "domain-event" {
        if let Some(reference) = get(payload, "emittedBy").and_then(reference) {
            if let Some(target) = resolve_ddd_reference(
                document,
                &reference,
                &context.path,
                "/emittedBy",
                &mut diagnostics,
            ) {
                if !["entity", "domain-service"].contains(&kind(&target).as_deref().unwrap_or("")) {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_EVENT",
                        "/emittedBy",
                        "Event producer must be an entity or domain service",
                        Severity::Error,
                    );
                }
            }
            if Some(reference.0) != text(local.and_then(|v| get(v, "id"))).cloned() {
                add_ddd_diag(
                    &mut diagnostics,
                    &context.path,
                    "DDD_CONTEXT",
                    "/emittedBy",
                    "Event declaration belongs to its producer context",
                    Severity::Error,
                );
            }
        }
    }
    if payload_kind == "domain-service" {
        let mut names = std::collections::BTreeSet::new();
        if let Some(operations) = array(get(payload, "operations")) {
            for (i, operation) in operations.iter().enumerate() {
                if !names.insert(text(get(operation, "name")).cloned().unwrap_or_default()) {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_OPERATION",
                        &format!("/operations/{i}"),
                        "Duplicate operation",
                        Severity::Error,
                    );
                }
                for key in ["input", "output"] {
                    if let Some(reference) = get(operation, key).and_then(reference) {
                        resolve_ddd_reference(
                            document,
                            &reference,
                            &context.path,
                            &format!("/operations/{i}/{key}"),
                            &mut diagnostics,
                        );
                    }
                }
                if let Some(emits) = array(get(operation, "emits")) {
                    for value in emits {
                        if let Some(reference) = reference(value) {
                            if let Some(target) = resolve_ddd_reference(
                                document,
                                &reference,
                                &context.path,
                                &format!("/operations/{i}/emits"),
                                &mut diagnostics,
                            ) {
                                if kind(&target).as_deref() != Some("domain-event") {
                                    add_ddd_diag(
                                        &mut diagnostics,
                                        &context.path,
                                        "DDD_EVENT",
                                        &format!("/operations/{i}/emits"),
                                        "Operation emits must target a domain event",
                                        Severity::Error,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(invariants) = array(get(payload, "invariants")) {
        let mut ids = std::collections::BTreeSet::new();
        for (i, invariant) in invariants.iter().enumerate() {
            if !ids.insert(text(get(invariant, "id")).cloned().unwrap_or_default()) {
                add_ddd_diag(
                    &mut diagnostics,
                    &context.path,
                    "DDD_INVARIANT",
                    &format!("/invariants/{i}"),
                    "Duplicate invariant id",
                    Severity::Error,
                );
            }
            let scope = text(get(invariant, "scope"))
                .and_then(|v| v.to_utf8().ok())
                .unwrap_or_default();
            if scope == "aggregate" && get(payload, "aggregate").is_none() {
                add_ddd_diag(
                    &mut diagnostics,
                    &context.path,
                    "DDD_INVARIANT",
                    &format!("/invariants/{i}"),
                    "Aggregate invariants belong on aggregate roots",
                    Severity::Error,
                );
            }
            if let Some(references) = array(get(invariant, "references")) {
                for value in references {
                    if let Some(reference) = reference(value) {
                        resolve_ddd_reference(
                            document,
                            &reference,
                            &context.path,
                            &format!("/invariants/{i}/references"),
                            &mut diagnostics,
                        );
                        if Some(reference.0.clone())
                            != text(local.and_then(|v| get(v, "id"))).cloned()
                        {
                            add_ddd_diag(
                                &mut diagnostics,
                                &context.path,
                                "DDD_INVARIANT",
                                &format!("/invariants/{i}"),
                                "Invariant scope cannot cross a bounded context",
                                Severity::Error,
                            );
                        }
                        if scope == "aggregate" {
                            let own = current
                                .and_then(|element| {
                                    Some((
                                        text(local.and_then(|v| get(v, "id")))?.clone(),
                                        text(get(element, "id"))?.clone(),
                                    ))
                                })
                                .as_ref()
                                .is_some_and(|r| r == &reference);
                            let member = array(get(
                                get(payload, "aggregate").unwrap_or(&Value::Null),
                                "members",
                            ))
                            .unwrap_or(&[])
                            .iter()
                            .any(|member| reference_from(member).as_ref() == Some(&reference));
                            if !own && !member {
                                add_ddd_diag(&mut diagnostics, &context.path, "DDD_INVARIANT", &format!("/invariants/{i}"), "Aggregate invariant reference lies outside the declared boundary", Severity::Error);
                            }
                        }
                    }
                }
            }
            add_ddd_diag(&mut diagnostics, &context.path, "DDD_INVARIANT_OPAQUE", &format!("/invariants/{i}"), "Invariant expression is preserved with its language/version; it is not interpreted or enforced", Severity::Warning);
        }
    }

    if payload_kind == "bounded-context" {
        let mut terms = std::collections::BTreeSet::new();
        if let Some(values) = array(get(payload, "terms")) {
            for (i, term) in values.iter().enumerate() {
                let mut names = text(get(term, "term"))
                    .cloned()
                    .into_iter()
                    .collect::<Vec<_>>();
                names.extend(
                    array(get(term, "aliases"))
                        .unwrap_or(&[])
                        .iter()
                        .filter_map(|value| text(Some(value)).cloned()),
                );
                for name in names {
                    if !terms.insert(name) {
                        add_ddd_diag(
                            &mut diagnostics,
                            &context.path,
                            "DDD_TERM",
                            &format!("/terms/{i}"),
                            "Term or alias collides within its context",
                            Severity::Error,
                        );
                    }
                }
                if let Some(reference) = get(term, "concept").and_then(reference) {
                    resolve_ddd_reference(
                        document,
                        &reference,
                        &context.path,
                        &format!("/terms/{i}/concept"),
                        &mut diagnostics,
                    );
                    if Some(reference.0) != text(local.and_then(|v| get(v, "id"))).cloned() {
                        add_ddd_diag(
                            &mut diagnostics,
                            &context.path,
                            "DDD_TERM",
                            &format!("/terms/{i}"),
                            "Ubiquitous-language term is local to its context",
                            Severity::Error,
                        );
                    }
                }
            }
        }
    }
    if payload_kind == "context-map" {
        let mut ids = std::collections::BTreeSet::new();
        if let Some(mappings) = array(get(payload, "mappings")) {
            for (i, mapping) in mappings.iter().enumerate() {
                if !ids.insert(text(get(mapping, "id")).cloned().unwrap_or_default()) {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_MAPPING",
                        &format!("/mappings/{i}"),
                        "Duplicate mapping id",
                        Severity::Error,
                    );
                }
                let source = get(mapping, "source").and_then(reference);
                let target = get(mapping, "target").and_then(reference);
                if let Some(source) = &source {
                    resolve_ddd_reference(
                        document,
                        source,
                        &context.path,
                        &format!("/mappings/{i}/source"),
                        &mut diagnostics,
                    );
                }
                if let Some(target) = &target {
                    resolve_ddd_reference(
                        document,
                        target,
                        &context.path,
                        &format!("/mappings/{i}/target"),
                        &mut diagnostics,
                    );
                }
                if source
                    .as_ref()
                    .zip(target.as_ref())
                    .is_some_and(|(a, b)| a.0 == b.0)
                {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_MAPPING",
                        &format!("/mappings/{i}"),
                        "A context mapping requires distinct contexts",
                        Severity::Error,
                    );
                }
                let equivalence = text(get(mapping, "equivalence"))
                    .and_then(|v| v.to_utf8().ok())
                    .unwrap_or_default();
                if equivalence == "partial"
                    && array(get(mapping, "limitations")).is_none_or(|v| v.is_empty())
                {
                    add_ddd_diag(
                        &mut diagnostics,
                        &context.path,
                        "DDD_MAPPING",
                        &format!("/mappings/{i}"),
                        "Partial mappings must state limitations",
                        Severity::Error,
                    );
                }
                if equivalence == "asserted-equivalent" {
                    add_ddd_diag(&mut diagnostics, &context.path, "DDD_EQUIVALENCE_UNPROVEN", &format!("/mappings/{i}"), "Declared equivalence is retained but not proven by matching structure or names", Severity::Warning);
                }
                if let Some(acl) = get(mapping, "antiCorruptionLayer") {
                    if let Some(owner) = text(get(acl, "ownerModule")) {
                        let allowed = source.as_ref().is_some_and(|r| &r.0 == owner)
                            || target.as_ref().is_some_and(|r| &r.0 == owner);
                        if !allowed {
                            add_ddd_diag(
                                &mut diagnostics,
                                &context.path,
                                "DDD_ACL",
                                &format!("/mappings/{i}"),
                                "Anti-corruption layer owner must be a participating context",
                                Severity::Error,
                            );
                        }
                    }
                }
            }
        }
    }
    Ok(diagnostics)
}

fn reference_from(value: &Value) -> Option<(Utf16, Utf16)> {
    reference(value)
}

fn inspect_unknown_ddd(
    node: &Value,
    schema: &Value,
    manifest: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    let mut shape = schema;
    if let Some(reference) = text(get(schema, "$ref")).and_then(|v| v.to_utf8().ok()) {
        if let Some(name) = reference.strip_prefix("#/$defs/") {
            shape = get(
                get(get(manifest, "schema").unwrap_or(&Value::Null), "$defs")
                    .unwrap_or(&Value::Null),
                name,
            )
            .unwrap_or(&Value::Null);
        }
    }
    if let Some(choices) = array(get(shape, "oneOf")) {
        let found = choices.iter().find(|choice| {
            get(get(choice, "properties").unwrap_or(&Value::Null), "kind")
                .and_then(|v| get(v, "const"))
                .and_then(|v| text(Some(v)))
                == text(get(node, "kind"))
        });
        if let Some(found) = found {
            shape = found;
        } else {
            return Ok(());
        }
    }
    if text(get(shape, "type"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        == Some("object")
    {
        if let Value::Object(members) = node {
            for (key, value) in members {
                let name = key.to_utf8().unwrap_or_default();
                let child =
                    get(get(shape, "properties").unwrap_or(&Value::Null), &name).or_else(|| {
                        get(shape, "additionalProperties").and_then(|v| {
                            if matches!(v, Value::Object(_)) {
                                Some(v)
                            } else {
                                None
                            }
                        })
                    });
                let child_path = child_path(path, &name);
                if let Some(child) = child {
                    inspect_unknown_ddd(value, child, manifest, &child_path, out, ctx)?;
                } else {
                    out.push(diagnostic(
                        "DDD_UNKNOWN",
                        child_path,
                        "Unknown DDD content retained",
                        Severity::Warning,
                    ));
                }
            }
        }
    } else if text(get(shape, "type"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        == Some("array")
    {
        if let (Some(items), Some(values)) = (get(shape, "items"), array(Some(node))) {
            for (i, value) in values.iter().enumerate() {
                inspect_unknown_ddd(
                    value,
                    items,
                    manifest,
                    &child_path(path, &i.to_string()),
                    out,
                    ctx,
                )?;
            }
        }
    }
    Ok(())
}

fn aggregate_owners(document: &Value, member: &(Utf16, Utf16)) -> usize {
    let mut count = 0;
    for module in array(get(document, "modules")).unwrap_or(&[]) {
        for element in array(get(module, "elements")).unwrap_or(&[]) {
            let ddd = get(
                get(element, "extensions").unwrap_or(&Value::Null),
                DDD_EXTENSION,
            )
            .unwrap_or(&Value::Null);
            if kind(ddd).as_deref() == Some("entity")
                && array(get(
                    get(ddd, "aggregate").unwrap_or(&Value::Null),
                    "members",
                ))
                .unwrap_or(&[])
                .iter()
                .any(|m| reference(m).as_ref() == Some(member))
            {
                count += 1;
            }
        }
    }
    count
}

/// Construct the binding key used for a DDD concept field.
pub fn field_binding(module: &Utf16, element: &Utf16, field: &Utf16) -> Result<Utf16, EngineError> {
    Ok(Utf16::from(format!(
        "/{}/{}/fields/{}",
        escape_pointer(module)?,
        escape_pointer(element)?,
        escape_pointer(field)?
    )))
}

pub fn project(
    source: &Value,
    bindings: &Bindings,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if bindings.id.is_empty()
        || bindings.schema_id.is_empty()
        || bindings.root_module.is_empty()
        || bindings.root_element.is_empty()
    {
        return Err(err(
            "DDD_BINDINGS",
            "Explicit document identity and root are required",
        ));
    }
    let schema_id = bindings
        .schema_id
        .to_utf8()
        .map_err(|_| err("DDD_BINDINGS", "Schema identity must be valid UTF-16"))?;
    let colon = schema_id.find(':').ok_or_else(|| {
        err(
            "DDD_BINDINGS",
            "Schema identity must be an absolute fragment-free URI",
        )
    })?;
    if colon == 0
        || schema_id[..colon]
            .bytes()
            .any(|b| !(b.is_ascii_alphanumeric() || b"+.-".contains(&b)))
        || schema_id.contains('#')
        || schema_id.chars().any(char::is_whitespace)
    {
        return Err(err(
            "DDD_BINDINGS",
            "Schema identity must be an absolute fragment-free URI",
        ));
    }
    let inspected = inspect_ddd_document(source, ctx)?;
    if !inspected.valid {
        return Err(err("DDD_SOURCE", "Invalid DDD model"));
    }
    if text(
        get(
            get(source, "vocabularies").unwrap_or(&Value::Null),
            "umf.ddd",
        )
        .and_then(|v| get(v, "version")),
    )
    .and_then(|v| v.to_utf8().ok())
    .as_deref()
        != Some("0.1.0")
    {
        return Err(err("DDD_SOURCE", "Expected umf.ddd 0.1.0"));
    }
    let has_context = get(source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .is_some_and(|modules| {
            modules.iter().any(|module| {
                text(
                    get(get(module, "extensions").unwrap_or(&Value::Null), "umf.ddd")
                        .and_then(|d| get(d, "kind")),
                )
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                    == Some("bounded-context")
            })
        });
    if !has_context {
        return Err(err("DDD_SOURCE", "DDD source requires a bounded context"));
    }
    let mut p = Projection {
        source,
        bindings,
        ctx,
        issues: Vec::new(),
        mappings: Vec::new(),
        defs: Vec::new(),
        names: BTreeMap::new(),
        active: Vec::new(),
        used: Vec::new(),
        fatal: false,
    };
    p.issue("","DOMAIN_MODEL_RETAINED","not-enforced","Bounded contexts, terminology, mappings, services, repositories and unselected definitions remain in source; document validation does not implement them")?;
    p.issue(
        "",
        "OBJECT_BINDING",
        "representation-change",
        if bindings.closed_objects {
            "Closed JSON objects are an explicit physical binding, not an inferred domain rule"
        } else {
            "Open JSON objects are an explicit physical binding, not an inferred domain rule"
        },
    )?;
    let root = p.concept(&bindings.root_module, &bindings.root_element, "embed", 1)?;
    for (path, _) in &bindings.relations {
        if !p.used.contains(path) {
            p.fatal = true;
            p.issue_units(
                path,
                "UNUSED_BINDING",
                "unsupported",
                "Relationship binding did not match a reached concept field",
            )?;
        }
    }
    let blocked = p.fatal || (bindings.loss_policy == LossPolicy::Strict && !p.issues.is_empty());
    let source_copy = copy_json(source, p.ctx)?;
    let policy = p.policy_value()?;
    let issues = Value::Array(p.issues);
    let mappings = Value::Array(p.mappings);
    if blocked {
        return Ok(object(vec![
            ("status", strval("blocked")),
            ("source", source_copy),
            ("policy", policy),
            ("issues", issues),
            ("mappings", mappings),
        ]));
    }
    let mut fields = vec![
        (Utf16::from("$schema"), strval(DIALECT)),
        (
            Utf16::from("$id"),
            Value::String(bindings.schema_id.clone()),
        ),
    ];
    if let Value::Object(root_fields) = root {
        fields.extend(root_fields);
    } else {
        return Err(err("DDD_TARGET", "Root schema must be an object"));
    }
    fields.push((Utf16::from("$defs"), Value::Object(p.defs)));
    let schema = Value::Object(fields);
    let native = serialization::write_json_value(&schema, Format::Json, p.ctx)?;
    let target = json_schema_adapter::import_json_schema(
        native.units(),
        &bindings.id,
        &bindings.schema_id,
        &[],
        p.ctx,
    )?;
    if !json_schema_adapter::inspect_json_schema(&target, p.ctx)?.valid {
        return Err(err("DDD_TARGET", "Generated JSON Schema is invalid"));
    }
    Ok(object(vec![
        ("status", strval("projected")),
        ("source", source_copy),
        ("policy", policy),
        ("issues", issues),
        ("mappings", mappings),
        ("target", target),
        ("nativeSchema", Value::String(native)),
    ]))
}

struct Projection<'a, 'b> {
    source: &'a Value,
    bindings: &'a Bindings,
    ctx: &'a mut Context<'b>,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    defs: Vec<(Utf16, Value)>,
    names: BTreeMap<String, String>,
    active: Vec<String>,
    used: Vec<Utf16>,
    fatal: bool,
}
impl Projection<'_, '_> {
    fn issue(
        &mut self,
        path: &str,
        code: &str,
        class: &str,
        detail: &str,
    ) -> Result<(), EngineError> {
        self.issue_units(&Utf16::from(path), code, class, detail)
    }
    fn issue_units(
        &mut self,
        path: &Utf16,
        code: &str,
        class: &str,
        detail: &str,
    ) -> Result<(), EngineError> {
        self.ctx.charge_work(5, path.clone())?;
        self.issues.push(object(vec![
            ("path", Value::String(path.clone())),
            ("code", strval(code)),
            ("classification", strval(class)),
            ("detail", strval(detail)),
            ("retainedInSource", Value::Bool(true)),
        ]));
        Ok(())
    }
    fn policy_value(&mut self) -> Result<Value, EngineError> {
        self.ctx.charge_work(
            self.bindings.relations.len().saturating_add(8),
            Utf16::default(),
        )?;
        let relations = Value::Object(
            self.bindings
                .relations
                .iter()
                .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                .collect(),
        );
        Ok(object(vec![
            ("id", Value::String(self.bindings.id.clone())),
            ("schemaId", Value::String(self.bindings.schema_id.clone())),
            (
                "root",
                object(vec![
                    ("module", Value::String(self.bindings.root_module.clone())),
                    ("element", Value::String(self.bindings.root_element.clone())),
                ]),
            ),
            ("closedObjects", Value::Bool(self.bindings.closed_objects)),
            ("integer", strval("json-integer")),
            ("decimal", strval("decimal-string")),
            ("dateTime", strval("string")),
            ("bytes", strval("hex-string")),
            ("collection", strval("array")),
            ("relations", relations),
            (
                "lossPolicy",
                strval(if self.bindings.loss_policy == LossPolicy::Strict {
                    "strict"
                } else {
                    "allow-reported-loss"
                }),
            ),
        ]))
    }
    fn concept(
        &mut self,
        module: &Utf16,
        element: &Utf16,
        mode: &str,
        depth: usize,
    ) -> Result<Value, EngineError> {
        if depth > self.ctx.limits().max_depth {
            return Err(err("LIMIT", "DDD projection depth exceeded"));
        }
        let key = format!(
            "{}\0{}\0{}",
            module.to_utf8().unwrap_or_default(),
            element.to_utf8().unwrap_or_default(),
            mode
        );
        if let Some(name) = self.names.get(&key).cloned() {
            if self.active.contains(&key) {
                self.issue("","RECURSIVE_EMBED","representation-change","Recursive embedded schemas can describe cyclic object graphs; identity bindings are required to represent cycles")?;
            }
            return Ok(object(vec![("$ref", strval(&format!("#/$defs/{name}")))]));
        }
        let def = self.definition(module, element).ok_or_else(|| {
            err(
                "DDD_SOURCE",
                "Root or relationship does not reference a DDD data concept",
            )
        })?;
        let kind = text(get(&def, "kind"))
            .and_then(|x| x.to_utf8().ok())
            .unwrap_or_default();
        if !["entity", "value", "domain-event"].contains(&kind.as_str()) {
            self.fatal = true;
            self.issue("/root","NON_DATA_CONCEPT","unsupported","Services and repositories need an operation binding, not an inferred document shape")?;
            return Ok(Value::Null);
        }
        let identity_scope = get(get(&def, "identity").unwrap_or(&Value::Null), "scope")
            .and_then(|v| text(Some(v)))
            .and_then(|v| v.to_utf8().ok());
        if mode == "identity" && (kind != "entity" || identity_scope.as_deref() != Some("context"))
        {
            self.fatal = true;
            self.issue("/root","IDENTITY_SCOPE","unsupported","Identity references require a context-scoped entity identity; aggregate-local identifiers need an owner binding")?;
            return Ok(Value::Null);
        }
        let name = format!("concept_{}", self.names.len());
        self.names.insert(key.clone(), name.clone());
        self.active.push(key.clone());
        let ref_value = object(vec![
            ("module", Value::String(module.clone())),
            ("element", Value::String(element.clone())),
        ]);
        self.mappings.push(object(vec![
            ("concept", ref_value),
            ("mode", strval(mode)),
            ("targetPointer", strval(&format!("/$defs/{name}"))),
        ]));
        let fields = get(&def, "fields")
            .and_then(|v| {
                if let Value::Object(m) = v {
                    Some(m.clone())
                } else {
                    None
                }
            })
            .ok_or_else(|| err("DDD_SOURCE", "DDD data concept has no fields object"))?;
        let mut properties = Vec::new();
        let mut required = Vec::new();
        if kind == "entity" {
            self.issue("","IDENTITY_UNENFORCED","not-enforced","Required identity fields do not enforce uniqueness, lifecycle or referential integrity")?;
        }
        if get(&def, "aggregate").is_some() {
            self.issue(
                "",
                "AGGREGATE_UNENFORCED",
                "not-enforced",
                "Embedding does not enforce aggregate ownership, consistency or transactions",
            )?;
        }
        if kind == "value" {
            self.issue(
                "",
                "VALUE_EQUALITY_UNENFORCED",
                "not-enforced",
                "Object shape does not enforce domain value equality or immutability",
            )?;
        }
        if kind == "domain-event" {
            self.issue("","EVENT_UNENFORCED","not-enforced","Document shape does not enforce event occurrence, immutability, producer authority or delivery")?;
        }
        if mode == "identity" {
            self.issue("","IDENTITY_REFERENCE","representation-change","Only the selected identity fields are emitted at this relationship; the full entity stays in source")?;
        }
        if let Some(Value::Array(invariants)) = get(&def, "invariants") {
            for _ in invariants {
                self.issue("","DDD_INVARIANT_OPAQUE","not-enforced","Invariant expression and language/version are preserved in source; they are not interpreted or enforced")?;
            }
        }
        let selected: Vec<(Utf16, Value)> = if mode == "identity" {
            let ids = get(get(&def, "identity").unwrap_or(&Value::Null), "fields")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| err("DDD_SOURCE", "Entity identity fields are missing"))?;
            ids.iter()
                .filter_map(|v| text(Some(v)).map(|s| (s.clone(), Value::Null)))
                .collect()
        } else {
            fields.clone()
        };
        for (field_name, _) in selected {
            let field = get(
                &Value::Object(fields.clone()),
                &field_name.to_utf8().unwrap_or_default(),
            )
            .cloned()
            .unwrap_or(Value::Null);
            let path = field_binding(module, element, &field_name)?;
            let cardinality = text(get(&field, "cardinality"))
                .and_then(|v| v.to_utf8().ok())
                .unwrap_or_default();
            if !["one", "optional", "many"].contains(&cardinality.as_str())
                || (mode == "identity" && cardinality != "one")
            {
                self.fatal = true;
                self.issue_units(
                    &path,
                    "DDD_IDENTITY",
                    "unsupported",
                    "Identity fields must exist and be singular required values",
                )?;
                continue;
            }
            let ty =
                get(&field, "type").ok_or_else(|| err("DDD_SOURCE", "Field type is missing"))?;
            let shape = if text(get(ty, "kind"))
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("scalar")
            {
                self.scalar(ty, &path)?
            } else {
                self.used.push(path.clone());
                let choice = self
                    .bindings
                    .relations
                    .iter()
                    .find(|(k, _)| k == &path)
                    .map(|(_, v)| v.clone());
                let Some(choice) = choice else {
                    self.fatal = true;
                    self.issue_units(
                        &path,
                        "RELATION_BINDING",
                        "unsupported",
                        "Every reached concept field requires an explicit embed/identity binding",
                    )?;
                    continue;
                };
                let target = get(ty, "target")
                    .ok_or_else(|| err("DDD_SOURCE", "Concept target is missing"))?;
                self.concept(
                    text(get(target, "module"))
                        .ok_or_else(|| err("DDD_SOURCE", "Concept module is missing"))?,
                    text(get(target, "element"))
                        .ok_or_else(|| err("DDD_SOURCE", "Concept element is missing"))?,
                    &choice.to_utf8().unwrap_or_default(),
                    depth + 1,
                )?
            };
            if shape == Value::Null {
                continue;
            }
            let mut shape = if cardinality == "many" {
                self.issue_units(&path,"COLLECTION_ENCODING","representation-change","Selected optional array encoding permits absent/empty collections and adds order; it does not enforce domain set semantics or aggregate ownership")?;
                object(vec![("type", strval("array")), ("items", shape)])
            } else {
                shape
            };
            if let Some(description) = text(get(&field, "description")) {
                if let Value::Object(ref mut members) = shape {
                    members.push((
                        Utf16::from("description"),
                        Value::String(description.clone()),
                    ));
                }
            }
            if cardinality == "one" {
                required.push(field_name.clone());
            }
            properties.push((field_name, shape));
        }
        let mut def_fields = vec![
            (Utf16::from("type"), strval("object")),
            (
                Utf16::from("title"),
                strval(&format!(
                    "{}.{}{}",
                    module.to_utf8().unwrap_or_default(),
                    element.to_utf8().unwrap_or_default(),
                    if mode == "identity" { " identity" } else { "" }
                )),
            ),
            (Utf16::from("properties"), Value::Object(properties)),
            (
                Utf16::from("additionalProperties"),
                Value::Bool(!self.bindings.closed_objects),
            ),
        ];
        if let Some(description) = text(get(&def, "description")) {
            def_fields.push((
                Utf16::from("description"),
                Value::String(description.clone()),
            ));
        }
        if !required.is_empty() {
            def_fields.push((Utf16::from("required"), array_str(&required)));
        }
        self.defs
            .push((Utf16::from(name.clone()), Value::Object(def_fields)));
        self.active.pop();
        Ok(object(vec![(
            "$ref",
            strval(&format!("#/$defs/{name}")),
        )]))
    }
    fn scalar(&mut self, ty: &Value, path: &Utf16) -> Result<Value, EngineError> {
        let name = text(get(ty, "name"))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        Ok(match name.as_str() {
            "boolean" => object(vec![("type", strval("boolean"))]),
            "string" => object(vec![("type", strval("string"))]),
            "integer" => {
                self.issue_units(path,"INTEGER_ENCODING","representation-change","JSON integer encoding does not guarantee host-runtime precision; no instance conversion is supplied")?;
                object(vec![("type", strval("integer"))])
            }
            "decimal" => {
                self.issue_units(path,"DECIMAL_ENCODING","representation-change","Decimal values use non-exponent base-ten strings; scale and value equality are not enforced")?;
                object(vec![
                    ("type", strval("string")),
                    ("pattern", strval("^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$")),
                ])
            }
            "date-time" => {
                self.issue_units(path,"DATETIME_UNENFORCED","not-enforced","Date-time meaning is retained in DDD; the selected plain-string binding does not validate it")?;
                object(vec![("type", strval("string"))])
            }
            "bytes" => {
                self.issue_units(
                    path,
                    "BYTES_ENCODING",
                    "representation-change",
                    "Bytes use lowercase hexadecimal pairs",
                )?;
                object(vec![
                    ("type", strval("string")),
                    ("pattern", strval("^([0-9a-f]{2})*$")),
                ])
            }
            _ => {
                self.fatal = true;
                self.issue_units(
                    path,
                    "DDD_SCALAR",
                    "unsupported",
                    "Unknown scalar type cannot be safely projected",
                )?;
                Value::Null
            }
        })
    }
    fn definition(&self, module: &Utf16, element: &Utf16) -> Option<Value> {
        let modules = get(self.source, "modules").and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })?;
        for m in modules {
            if text(get(m, "id")) != Some(module) {
                continue;
            }
            let elements = get(m, "elements").and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })?;
            for e in elements {
                if text(get(e, "id")) == Some(element) {
                    return get(get(e, "extensions").unwrap_or(&Value::Null), "umf.ddd").cloned();
                }
            }
        }
        None
    }
}
