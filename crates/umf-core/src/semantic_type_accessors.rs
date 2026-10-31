// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in retained `umf.semantic-types` 0.1.0 extension accessors.
//! These accessors preserve the prototype wrapper; core 0.10 references and
//! their trusted value validators live in `core_semantic_types`.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, SemanticContext},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    serialization::{read_json_value, stringify_compact_metered, Format},
    value::{copy_json, Utf16, Value},
};

const EXTENSION_ID: &str = "umf.semantic-types";
const PROFILE_VERSION: &str = "0.1.0";
const CAPABILITY_TOKEN: u64 = 0x5255_5354_5345_4d41;
const MANIFEST: &str = include_str!("../../../spec/extensions/semantic-types/package.json");

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(value: Option<&Value>) -> Option<Utf16> {
    match value {
        Some(Value::String(value)) => Some(value.clone()),
        _ => None,
    }
}
fn charge_fields(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if let Value::Object(fields) = value {
        ctx.charge_work(fields.len(), Utf16::default())?;
    }
    Ok(())
}
fn err(code: &str, message: impl Into<Utf16>) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn type_error(message: &str) -> EngineError {
    err("TYPE_ERROR", message)
}
fn property_mut_or_insert<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    if let Some(index) = fields.iter().position(|(field, _)| field == &key(name)) {
        Some(&mut fields[index].1)
    } else {
        fields.push((key(name), Value::Object(Vec::new())));
        fields.last_mut().map(|(_, value)| value)
    }
}

fn semantic_registry(engine: &Engine, ctx: &mut Context<'_>) -> Result<Registry, EngineError> {
    let source: Vec<u16> = MANIFEST.encode_utf16().collect();
    let manifest = read_json_value(&source, Format::Json, ctx)?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    registry.register(
        &manifest,
        Some(CAPABILITY_TOKEN),
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    Ok(registry)
}

struct SemanticTypeExtensionCapabilities;
impl Capabilities for SemanticTypeExtensionCapabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token != CAPABILITY_TOKEN {
            return Err(Utf16::from("Unexpected extension validator capability"));
        }
        semantic_diagnostics(payload, &context.path, None).map_err(|error| error.message)
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != CAPABILITY_TOKEN {
            return Err(CapabilityError::Host(Utf16::from(
                "Unexpected extension validator capability",
            )));
        }
        semantic_diagnostics(payload, &context.path, Some(ctx)).map_err(CapabilityError::Engine)
    }
}

fn pointer_segment(value: &Utf16) -> Utf16 {
    let mut output = Vec::new();
    for unit in value.units() {
        match *unit {
            0x7e => output.extend([0x7e, 0x30]),
            0x2f => output.extend([0x7e, 0x31]),
            other => output.push(other),
        }
    }
    Utf16::new(output)
}

fn append_path(
    base: &Utf16,
    part: &Utf16,
    ctx: Option<&mut Context<'_>>,
) -> Result<Utf16, EngineError> {
    if let Some(ctx) = ctx {
        ctx.charge_work(
            base.len().saturating_add(part.len()).saturating_add(1),
            Utf16::default(),
        )?;
    }
    let mut units = base.units().to_vec();
    units.push(0x2f);
    units.extend(part.units());
    Ok(Utf16::new(units))
}

fn semantic_diagnostics(
    payload: &Value,
    base: &Utf16,
    mut ctx: Option<&mut Context<'_>>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let Value::Object(fields) = payload else {
        return Ok(Vec::new());
    };
    let mut diagnostics = Vec::new();
    for (name, _) in fields {
        if let Some(context) = ctx.as_deref_mut() {
            context.charge_work(1, Utf16::default())?;
            context.charge_work(name.len().saturating_mul(2), Utf16::default())?;
        }
        if name != &key("types") {
            let escaped = pointer_segment(name);
            let path = append_path(base, &escaped, ctx.as_deref_mut())?;
            push_semantic_diagnostic(
                &mut diagnostics,
                "SEMANTIC_TYPE_UNKNOWN",
                path,
                "Unknown annotation retained",
                ctx.as_deref_mut(),
            )?;
        }
    }
    if let Some(Value::Array(references)) = get(payload, "types") {
        for (index, reference) in references.iter().enumerate() {
            if let Some(context) = ctx.as_deref_mut() {
                context.charge_work(1, Utf16::default())?;
            }
            if let Value::Object(fields) = reference {
                for (name, _) in fields {
                    if let Some(context) = ctx.as_deref_mut() {
                        context.charge_work(1, Utf16::default())?;
                        context.charge_work(name.len().saturating_mul(2), Utf16::default())?;
                    }
                    if name != &key("vocabulary") && name != &key("version") && name != &key("term")
                    {
                        // `context.path` already contains the base pointer; append each segment
                        // through a metered path builder while preserving UTF-16 keys.
                        let types_path = append_path(base, &key("types"), ctx.as_deref_mut())?;
                        let index_text = index.to_string();
                        if let Some(context) = ctx.as_deref_mut() {
                            context.charge_work(index_text.len(), Utf16::default())?;
                        }
                        let index_path =
                            append_path(&types_path, &key(&index_text), ctx.as_deref_mut())?;
                        let escaped = pointer_segment(name);
                        let path = append_path(&index_path, &escaped, ctx.as_deref_mut())?;
                        push_semantic_diagnostic(
                            &mut diagnostics,
                            "SEMANTIC_TYPE_UNKNOWN",
                            path,
                            "Unknown reference qualifier retained",
                            ctx.as_deref_mut(),
                        )?;
                    }
                }
            }
        }
    }
    push_semantic_diagnostic(
        &mut diagnostics,
        "SEMANTIC_TYPE_EXTERNAL",
        base.clone(),
        "External semantic definitions and value validators are resolved separately",
        ctx.as_deref_mut(),
    )?;
    Ok(diagnostics)
}

fn push_semantic_diagnostic(
    diagnostics: &mut Vec<Diagnostic>,
    code: &str,
    path: Utf16,
    message: &str,
    ctx: Option<&mut Context<'_>>,
) -> Result<(), EngineError> {
    if let Some(ctx) = ctx {
        ctx.charge_work(
            code.len()
                .saturating_add(path.len())
                .saturating_add(message.encode_utf16().count()),
            Utf16::default(),
        )?;
    }
    diagnostics.push(Diagnostic {
        code: Utf16::from(code),
        path,
        python_source_path: false,
        message: Utf16::from(message),
        severity: Severity::Warning,
        python_text_origin: None,
    });
    Ok(())
}

fn validate(
    source: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<crate::error::Validation, EngineError> {
    let registry = semantic_registry(engine, ctx)?;
    let mut capabilities = SemanticTypeExtensionCapabilities;
    engine.validate_document(source, &registry, &mut capabilities, ctx)
}

fn document_error(
    validation: &crate::error::Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    for diagnostic in &validation.diagnostics {
        ctx.charge_work(
            4usize
                .saturating_add(diagnostic.code.len())
                .saturating_add(diagnostic.path.len())
                .saturating_add(diagnostic.message.len()),
            Utf16::default(),
        )?;
        diagnostics.push(Value::Object(vec![
            (key("code"), Value::String(diagnostic.code.clone())),
            (key("path"), Value::String(diagnostic.path.clone())),
            (key("message"), Value::String(diagnostic.message.clone())),
            (
                key("severity"),
                Value::string_utf8(match diagnostic.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    let message = stringify_compact_metered(&Value::Array(diagnostics), ctx)?;
    Ok(EngineError::new(
        "SEMANTIC_TYPE_DOCUMENT",
        Utf16::default(),
        message,
    ))
}

/// Validate with the retained 0.1.0 extension profile and return its warning
/// diagnostics without interpreting external term meanings.
pub fn validate_semantic_types_document(
    document: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<crate::error::Validation, EngineError> {
    let copied = copy_json(document, ctx)?;
    validate(&copied, engine, ctx)
}

fn require_profile(
    source: &Value,
    expected_message: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    charge_fields(source, ctx)?;
    if let Some(vocabularies) = get(source, "vocabularies") {
        charge_fields(vocabularies, ctx)?;
    }
    let version = get(
        get(source, "vocabularies").unwrap_or(&Value::Null),
        EXTENSION_ID,
    )
    .and_then(|profile| get(profile, "version"));
    if text(version).as_ref() != Some(&key(PROFILE_VERSION)) {
        Err(err("SEMANTIC_TYPE_PROFILE", expected_message))
    } else {
        Ok(())
    }
}

fn locate_element_mut<'a>(
    source: &'a mut Value,
    module_id: &Utf16,
    element_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a mut Value>, EngineError> {
    charge_fields(source, ctx)?;
    let Some(modules_value) = get_mut(source, "modules") else {
        return Ok(None);
    };
    let modules = match modules_value {
        Value::Array(modules) => modules,
        _ => return Ok(None),
    };
    let mut found_module = None;
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        charge_fields(module, ctx)?;
        if let Some(Value::String(id)) = get(module, "id") {
            ctx.charge_work(id.len(), Utf16::default())?;
            if id == module_id {
                found_module = Some(module);
                break;
            }
        }
    }
    let Some(module) = found_module else {
        return Ok(None);
    };
    let Some(elements_value) = get_mut(module, "elements") else {
        return Ok(None);
    };
    let elements = match elements_value {
        Value::Array(elements) => elements,
        _ => return Ok(None),
    };
    for element in elements {
        ctx.charge_work(1, Utf16::default())?;
        charge_fields(element, ctx)?;
        if let Some(Value::String(id)) = get(element, "id") {
            ctx.charge_work(id.len(), Utf16::default())?;
            if id == element_id {
                return Ok(Some(element));
            }
        }
    }
    Ok(None)
}

fn locate_module<'a>(
    source: &'a Value,
    module_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    charge_fields(source, ctx)?;
    let Some(modules_value) = get(source, "modules") else {
        return Ok(None);
    };
    let modules = match modules_value {
        Value::Array(modules) => modules,
        _ => return Ok(None),
    };
    let mut found_module = None;
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        charge_fields(module, ctx)?;
        if let Some(Value::String(id)) = get(module, "id") {
            ctx.charge_work(id.len(), Utf16::default())?;
            if id == module_id {
                found_module = Some(module);
                break;
            }
        }
    }
    Ok(found_module)
}

fn locate_element_in_module<'a>(
    module: &'a Value,
    element_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let Some(elements_value) = get(module, "elements") else {
        return Ok(None);
    };
    let elements = match elements_value {
        Value::Array(elements) => elements,
        _ => return Ok(None),
    };
    for element in elements {
        ctx.charge_work(1, Utf16::default())?;
        charge_fields(element, ctx)?;
        if let Some(Value::String(id)) = get(element, "id") {
            ctx.charge_work(id.len(), Utf16::default())?;
            if id == element_id {
                return Ok(Some(element));
            }
        }
    }
    Ok(None)
}

/// Copy, require the exact interim profile, validate with the prototype
/// extension registry, then return the copied annotation at the requested element.
pub fn get_semantic_types(
    document: &Value,
    module: &str,
    element: &str,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    get_semantic_types_units(
        document,
        &Utf16::from(module),
        &Utf16::from(element),
        engine,
        ctx,
    )
}

/// UTF-16 preserving host entrypoint. JavaScript strings can contain lone
/// surrogates, so the wire adapter must not round-trip identifiers through UTF-8.
pub fn get_semantic_types_units(
    document: &Value,
    module: &Utf16,
    element: &Utf16,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    get_semantic_types_copied_with_identity(
        source,
        engine,
        ctx,
        |_| Ok(Some(module.clone())),
        |_| Ok(Some(element.clone())),
    )
}

/// Get the retained extension annotation from a document already copied at
/// the host boundary. `resolve_identity` runs after profile and document
/// validation, matching the TypeScript predecessor's argument-observation
/// order. Non-string identifiers are represented as `None` and never coerced.
pub fn get_semantic_types_copied_with_identity<F, G>(
    source: Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
    resolve_module: F,
    resolve_element: G,
) -> Result<Value, EngineError>
where
    F: FnOnce(&mut Context<'_>) -> Result<Option<Utf16>, EngineError>,
    G: FnOnce(&mut Context<'_>) -> Result<Option<Utf16>, EngineError>,
{
    require_profile(&source, "Expected umf.semantic-types 0.1.0", ctx)?;
    let validation = validate(&source, engine, ctx)?;
    if !validation.valid {
        return Err(document_error(&validation, ctx)?);
    }
    let Some(module) = resolve_module(ctx)? else {
        return Err(missing_annotation_error());
    };
    ctx.charge_work(module.len(), Utf16::default())?;
    let Some(module_value) = locate_module(&source, &module, ctx)? else {
        return Err(missing_annotation_error());
    };
    let Some(element) = resolve_element(ctx)? else {
        return Err(missing_annotation_error());
    };
    ctx.charge_work(element.len(), Utf16::default())?;
    let Some(payload) = locate_element_in_module(module_value, &element, ctx)?
        .and_then(|element| get(get(element, "extensions")?, EXTENSION_ID))
    else {
        return Err(missing_annotation_error());
    };
    copy_json(payload, ctx)
}

fn missing_annotation_error() -> EngineError {
    err(
        "SEMANTIC_TYPE_PROFILE",
        "Missing semantic type annotation at requested element",
    )
}

/// Copy-on-write authoring of the prototype annotation, preserving unrelated
/// extension and envelope metadata. The candidate is returned only after the
/// same validation path as `get_semantic_types` succeeds.
pub fn set_semantic_types(
    document: &Value,
    module: &str,
    element: &str,
    annotation: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    set_semantic_types_units(
        document,
        &Utf16::from(module),
        &Utf16::from(element),
        annotation,
        engine,
        ctx,
    )
}

/// UTF-16 preserving host entrypoint for JavaScript identifiers.
pub fn set_semantic_types_units(
    document: &Value,
    module: &Utf16,
    element: &Utf16,
    annotation: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    set_semantic_types_units_optional(document, module, element, Some(annotation), engine, ctx)
}

/// Host form preserving a missing/undefined annotation until TypeScript's
/// profile and target lookup precedence has been reproduced.
pub fn set_semantic_types_units_optional(
    document: &Value,
    module: &Utf16,
    element: &Utf16,
    annotation: Option<&Value>,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    set_semantic_types_units_optional_with_annotation(
        document,
        module,
        element,
        engine,
        ctx,
        |ctx| annotation.map(|value| copy_json(value, ctx)).transpose(),
    )
}

/// Staged host form: copy/validate the document, check profile and target,
/// then admit/copy the annotation at the predecessor's argument checkpoint.
pub fn set_semantic_types_units_optional_with_annotation<F>(
    document: &Value,
    module: &Utf16,
    element: &Utf16,
    engine: &Engine,
    ctx: &mut Context<'_>,
    admit_annotation: F,
) -> Result<Value, EngineError>
where
    F: FnOnce(&mut Context<'_>) -> Result<Option<Value>, EngineError>,
{
    let candidate = copy_json(document, ctx)?;
    set_semantic_types_copied_with_identity_and_annotation(
        candidate,
        engine,
        ctx,
        |_| Ok(Some(module.clone())),
        |_| Ok(Some(element.clone())),
        |ctx| match admit_annotation(ctx)? {
            Some(value) => Ok(value),
            None => Err(err("NON_JSON", "Value is not JSON-compatible")),
        },
    )
}

/// Set the retained extension annotation on a document already copied at the
/// host boundary. Identity resolution is deferred until after profile
/// precedence; annotation admission is deferred until after target lookup.
pub fn set_semantic_types_copied_with_identity_and_annotation<F, G, A>(
    mut candidate: Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
    resolve_module: F,
    resolve_element: G,
    admit_annotation: A,
) -> Result<Value, EngineError>
where
    F: FnOnce(&mut Context<'_>) -> Result<Option<Utf16>, EngineError>,
    G: FnOnce(&mut Context<'_>) -> Result<Option<Utf16>, EngineError>,
    A: FnOnce(&mut Context<'_>) -> Result<Value, EngineError>,
{
    if !matches!(&candidate, Value::Object(_)) {
        return Err(type_error(
            "Cannot read semantic type profile from a non-object document",
        ));
    }
    charge_fields(&candidate, ctx)?;
    let vocabularies = get(&candidate, "vocabularies").ok_or_else(|| {
        type_error("Cannot read semantic type profile from undefined vocabularies")
    })?;
    if matches!(vocabularies, Value::Null) {
        return Err(type_error(
            "Cannot read semantic type profile from null vocabularies",
        ));
    }
    charge_fields(vocabularies, ctx)?;
    let existing = get(vocabularies, EXTENSION_ID);
    if existing.is_some()
        && text(get(existing.unwrap(), "version")).as_ref() != Some(&key(PROFILE_VERSION))
    {
        return Err(err(
            "SEMANTIC_TYPE_PROFILE",
            "Cannot overwrite a different semantic type profile",
        ));
    }
    let Some(module) = resolve_module(ctx)? else {
        return Err(err("SEMANTIC_TYPE_PROFILE", "Missing requested element"));
    };
    ctx.charge_work(module.len(), Utf16::default())?;
    let Some(module_value) = locate_set_module(&candidate, &module, ctx)? else {
        return Err(err("SEMANTIC_TYPE_PROFILE", "Missing requested element"));
    };
    let Some(element) = resolve_element(ctx)? else {
        return Err(err("SEMANTIC_TYPE_PROFILE", "Missing requested element"));
    };
    ctx.charge_work(element.len(), Utf16::default())?;
    if !set_element_exists(module_value, &element, ctx)? {
        return Err(err("SEMANTIC_TYPE_PROFILE", "Missing requested element"));
    }
    let vocabularies = property_mut_or_insert(&mut candidate, "vocabularies")
        .ok_or_else(|| type_error("Cannot assign the semantic type profile on vocabularies"))?;
    if get(vocabularies, EXTENSION_ID).is_none() {
        set_member(
            vocabularies,
            EXTENSION_ID,
            Value::Object(vec![(key("version"), Value::string_utf8(PROFILE_VERSION))]),
        );
    }
    let annotation = admit_annotation(ctx)?;
    let Some(target) = locate_element_mut(&mut candidate, &module, &element, ctx)? else {
        return Err(err("SEMANTIC_TYPE_PROFILE", "Missing requested element"));
    };
    let extension_map = property_mut_or_insert(target, "extensions")
        .ok_or_else(|| err("SEMANTIC_TYPE_PROFILE", "Missing requested element"))?;
    set_member(extension_map, EXTENSION_ID, annotation);
    // Match TS ordering: write the profile and payload before getter validation.
    let read_candidate = copy_json(&candidate, ctx)?;
    get_semantic_types_copied_with_identity(
        read_candidate,
        engine,
        ctx,
        |_| Ok(Some(module)),
        |_| Ok(Some(element)),
    )?;
    Ok(candidate)
}

/// Match the predecessor's direct `.modules.find(... )?.elements.find(...)`
/// checkpoint for setters. Unlike getter access, this path intentionally does
/// not validate the document first, so malformed nullish/non-array containers
/// produce native TypeError semantics before annotation admission.
fn locate_set_module<'a>(
    candidate: &'a Value,
    module_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let modules_value = get(candidate, "modules")
        .ok_or_else(|| type_error("Cannot read property 'find' of undefined modules"))?;
    let Value::Array(modules) = modules_value else {
        return Err(type_error("candidate.modules.find is not a function"));
    };
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        if matches!(module, Value::Null) {
            return Err(type_error("Cannot read property 'id' of null module"));
        }
        if let Some(Value::String(id)) = get(module, "id") {
            ctx.charge_work(id.len(), Utf16::default())?;
            if id == module_id {
                return Ok(Some(module));
            }
        }
    }
    Ok(None)
}

fn set_element_exists(
    module: &Value,
    element_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let elements_value = get(module, "elements")
        .ok_or_else(|| type_error("Cannot read property 'find' of undefined elements"))?;
    let Value::Array(elements) = elements_value else {
        return Err(type_error("module.elements.find is not a function"));
    };
    for element in elements {
        ctx.charge_work(1, Utf16::default())?;
        if matches!(element, Value::Null) {
            return Err(type_error("Cannot read property 'id' of null element"));
        }
        if let Some(Value::String(id)) = get(element, "id") {
            ctx.charge_work(id.len(), Utf16::default())?;
            if id == element_id {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn set_member(value: &mut Value, name: &str, next: Value) {
    if let Value::Object(fields) = value {
        if let Some((_, current)) = fields.iter_mut().find(|(field, _)| field == &key(name)) {
            *current = next;
        } else {
            fields.push((key(name), next));
        }
    }
}
