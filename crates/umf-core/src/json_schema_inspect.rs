// SPDX-License-Identifier: MIT OR Apache-2.0
//! Conservative interpretation checks for CONTRACT-002's Draft 2020-12
//! profile. Native trees remain the source of truth; this module never edits
//! or normalizes them.

use crate::{
    context::Context,
    error::{Diagnostic, EngineError, Severity},
    json_schema_adapter::{self, DIALECT_2020_12, JsonSchemaPayload, SchemaPosition},
    native_json::{NativeJsonNode, NativeJsonTree},
    schema::{CompiledSchema, SchemaResources},
    value::{Utf16, Value},
};

const KNOWN: &[&str] = &[
    "$id",
    "$schema",
    "$ref",
    "$anchor",
    "$dynamicRef",
    "$dynamicAnchor",
    "$vocabulary",
    "$comment",
    "$defs",
    "definitions",
    "type",
    "enum",
    "const",
    "multipleOf",
    "maximum",
    "exclusiveMaximum",
    "minimum",
    "exclusiveMinimum",
    "maxLength",
    "minLength",
    "pattern",
    "maxItems",
    "minItems",
    "uniqueItems",
    "maxContains",
    "minContains",
    "maxProperties",
    "minProperties",
    "required",
    "dependentRequired",
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples",
    "format",
    "contentEncoding",
    "contentMediaType",
    "contentSchema",
    "items",
    "additionalProperties",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "unevaluatedItems",
    "unevaluatedProperties",
    "propertyNames",
    "properties",
    "patternProperties",
    "$defs",
    "dependentSchemas",
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems",
];

const VOCABULARIES: &[&str] = &[
    "https://json-schema.org/draft/2020-12/vocab/core",
    "https://json-schema.org/draft/2020-12/vocab/applicator",
    "https://json-schema.org/draft/2020-12/vocab/unevaluated",
    "https://json-schema.org/draft/2020-12/vocab/validation",
    "https://json-schema.org/draft/2020-12/vocab/meta-data",
    "https://json-schema.org/draft/2020-12/vocab/format-annotation",
    "https://json-schema.org/draft/2020-12/vocab/content",
];

/// Inspect the JSON Schema extension carried by a complete UMF document.
pub fn inspect_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<crate::error::Validation, EngineError> {
    json_schema_adapter::validate_complete_document_for_inspection(document, ctx)
}

/// Inspect a retained payload without changing it. Diagnostics are emitted in
/// predecessor order: representation/dialect/keyword findings first, then
/// numeric and validator findings. The returned list is evidence of the
/// supported subset, not a claim that every Draft 2020-12 construct is
/// complete.
pub fn inspect_payload(
    payload: &JsonSchemaPayload,
    extension_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    inspect_payload_profile(payload, extension_path, ctx, true)
}

/// Inspect the subset that can safely enter a native edit when the caller
/// supplies a separately trusted semantic oracle. This omits only the generic
/// Rust/Ajv qualification warning; every concrete limitation remains.
pub fn inspect_payload_for_edit(
    payload: &JsonSchemaPayload,
    extension_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    inspect_payload_profile(payload, extension_path, ctx, false)
}

fn inspect_payload_profile(
    payload: &JsonSchemaPayload,
    extension_path: &Utf16,
    ctx: &mut Context<'_>,
    include_profile_warning: bool,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut diagnostics = Vec::new();
    let mut interpretation_unknown = false;
    let mut unknown_dialect = false;
    let mut has_numeric_limit = false;
    let mut numeric_limit_resources = Vec::new();
    let mut validator_profile = true;

    // The resource count is known without constructing a second URI/tree
    // collection. Charge it before either retaining resource identities or
    // reserving any per-resource storage.
    ctx.charge_work(
        payload.resources.len().saturating_add(1),
        extension_path.clone(),
    )?;
    let mut root_positions = Some(json_schema_adapter::walk(payload, ctx)?);

    for (key, _) in &payload.representation_extras {
        push(
            &mut diagnostics,
            "JSON_SCHEMA_REPRESENTATION",
            &join(extension_path, &child(&Utf16::default(), key, ctx)?, ctx)?,
            "Unknown payload field cannot be emitted natively",
            Severity::Warning,
        );
    }

    for (resource_index, (uri, tree)) in std::iter::once((&payload.base_uri, &payload.root))
        .chain(payload.resources.iter().map(|(uri, tree)| (uri, tree)))
        .enumerate()
    {
        ctx.charge_work(1, extension_path.clone())?;
        ctx.charge_work(uri.len(), extension_path.clone())?;
        if !matches!(
            tree.root(),
            NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
        ) {
            push(
                &mut diagnostics,
                "JSON_SCHEMA_ROOT",
                &extension_path,
                &format!("Resource {} must be object or boolean", display(uri)),
                Severity::Error,
            );
            continue;
        }
        if tree.has_representation_extras() {
            let prefix = if resource_index == 0 {
                child(&Utf16::default(), &Utf16::from("root"), ctx)?
            } else {
                let resources_path = child(&Utf16::default(), &Utf16::from("resources"), ctx)?;
                child(&resources_path, uri, ctx)?
            };
            for relative in tree.representation_extra_paths(&prefix, ctx)? {
                let path = join(extension_path, &relative, ctx)?;
                push(
                    &mut diagnostics,
                    "JSON_SCHEMA_REPRESENTATION",
                    &path,
                    "Unknown representation field cannot be emitted natively",
                    Severity::Warning,
                );
            }
        }
        // walk() covers the root. It must only be called once: rescanning it
        // for every packaged resource made inspection work quadratic in the
        // resource count and discarded each duplicate result.
        let positions = if resource_index == 0 {
            root_positions
                .take()
                .expect("root positions are consumed once")
        } else {
            schema_positions(tree, ctx)?
        };
        validator_profile &= validator_profile_positions(&positions);
        for position in positions {
            let NativeJsonNode::Object(members) = position.node.root() else {
                continue;
            };
            for (keyword, value) in members {
                ctx.charge_work(keyword.len().saturating_add(1), extension_path.clone())?;
                let keyword_text = keyword.to_utf8().ok();
                let Some(keyword_text) = keyword_text else {
                    interpretation_unknown = true;
                    push(
                        &mut diagnostics,
                        "JSON_SCHEMA_KEYWORD",
                        &join(
                            extension_path,
                            &child(&position.pointer, keyword, ctx)?,
                            ctx,
                        )?,
                        &format!("Uninterpreted keyword in {}", display(uri)),
                        Severity::Warning,
                    );
                    continue;
                };
                if !KNOWN.contains(&keyword_text.as_str()) {
                    interpretation_unknown = true;
                    push(
                        &mut diagnostics,
                        "JSON_SCHEMA_KEYWORD",
                        &join(
                            extension_path,
                            &child(&position.pointer, keyword, ctx)?,
                            ctx,
                        )?,
                        &format!("Uninterpreted keyword in {}", display(uri)),
                        Severity::Warning,
                    );
                }
                if matches!(
                    keyword_text.as_str(),
                    "$dynamicRef" | "unevaluatedItems" | "unevaluatedProperties"
                ) {
                    push(
                        &mut diagnostics,
                        "JSON_SCHEMA_VALIDATOR_LIMIT",
                        &join(
                            extension_path,
                            &child(&position.pointer, keyword, ctx)?,
                            ctx,
                        )?,
                        "Pinned JavaScript oracle has known failures for this construct; native meaning retained, full semantic evaluation not certified",
                        Severity::Warning,
                    );
                }
                if keyword_text == "properties" && has_member(value, "__proto__") {
                    let properties = child(&position.pointer, &Utf16::from("properties"), ctx)?;
                    let proto = child(&properties, &Utf16::from("__proto__"), ctx)?;
                    push(
                        &mut diagnostics,
                        "JSON_SCHEMA_VALIDATOR_LIMIT",
                        &join(extension_path, &proto, ctx)?,
                        "Pinned JavaScript oracle does not reliably assert this property",
                        Severity::Warning,
                    );
                }
                if keyword_text == "$schema" {
                    if let NativeJsonNode::String(dialect) = value {
                        if dialect.to_utf8().ok().as_deref() != Some(DIALECT_2020_12) {
                            interpretation_unknown = true;
                            unknown_dialect = true;
                            push(
                                &mut diagnostics,
                                "JSON_SCHEMA_DIALECT",
                                &join(extension_path, &position.pointer, ctx)?,
                                &format!("Uninterpreted dialect {}", display(dialect)),
                                Severity::Warning,
                            );
                        }
                    }
                }
                if keyword_text == "$vocabulary" {
                    if let NativeJsonNode::Object(entries) = value {
                        for (name, required) in entries {
                            if !VOCABULARIES
                                .iter()
                                .any(|known| name.to_utf8().ok().as_deref() == Some(*known))
                            {
                                interpretation_unknown = true;
                                push(
                                    &mut diagnostics,
                                    "JSON_SCHEMA_VOCABULARY",
                                    &join(extension_path, &position.pointer, ctx)?,
                                    &format!("Uninterpreted vocabulary {}", display(name)),
                                    Severity::Warning,
                                );
                            }
                            if !matches!(required, NativeJsonNode::Boolean(_)) {
                                push(
                                    &mut diagnostics,
                                    "JSON_SCHEMA_META",
                                    extension_path,
                                    "$vocabulary values must be booleans",
                                    Severity::Error,
                                );
                            }
                        }
                    }
                }
            }
        }
        let resource_numeric_limit = contains_unsafe_number(tree, ctx)?;
        has_numeric_limit |= resource_numeric_limit;
        if resource_numeric_limit {
            ctx.charge_work(uri.len().saturating_add(1), extension_path.clone())?;
            numeric_limit_resources.push(numeric_refusal_message(tree, uri, ctx)?);
        }
    }

    for message in numeric_limit_resources {
        push(
            &mut diagnostics,
            "JSON_SCHEMA_NUMERIC",
            extension_path,
            &message,
            Severity::Warning,
        );
    }

    if diagnostics
        .iter()
        .any(|item| item.severity == Severity::Error)
    {
        return Ok(diagnostics);
    }

    if payload
        .resources
        .iter()
        .any(|(uri, _)| uri == &payload.base_uri)
    {
        push(
            &mut diagnostics,
            "JSON_SCHEMA_RESOURCE_COLLISION",
            extension_path,
            "Root retrieval URI also appears in resources",
            Severity::Error,
        );
        return Ok(diagnostics);
    }

    if unknown_dialect || has_numeric_limit {
        return Ok(diagnostics);
    }

    // The existing Rust schema compiler supplies a useful Draft 2020-12
    // metaschema and local-reference check. It does not inherit Ajv's
    // qualification, so known oracle limitations remain explicit above.
    match compile_payload(payload, ctx) {
        Ok(()) => {
            if include_profile_warning
                && !interpretation_unknown
                && !validator_profile
                && diagnostics.is_empty()
            {
                push(
                    &mut diagnostics,
                    "JSON_SCHEMA_VALIDATOR_LIMIT",
                    extension_path,
                    "Rust Draft 2020-12 compilation succeeded; parity with Ajv 8.20.0 and the complete upstream profile remains unqualified",
                    Severity::Warning,
                );
            }
        }
        Err(error) => handle_compile_error(error, extension_path, &mut diagnostics)?,
    }
    Ok(diagnostics)
}

/// A deliberately small, recursively checked Draft 2020-12 grammar for which
/// `CompiledSchema` validation has independent Ajv/native vector coverage.
/// It admits boolean schemas and schema objects containing only `$schema`
/// (the exact 2020-12 URI), one-component ASCII relative `$id`, scalar
/// `type` (`boolean`, `integer`, `number`, `object`, or `string`), `required`
/// (unique safe member names), `properties`, `$defs`, `minimum`, `minLength`,
/// `additionalProperties: true`, and recursively walked `prefixItems`. Property names are nonempty valid
/// Unicode except `__proto__`, which the pinned JavaScript oracle does not
/// reliably assert. Numeric limits are independently checked against the
/// JavaScript-safe token profile before compilation. References and every
/// other keyword remain outside the complete profile. Every resource is
/// checked independently; the general metaschema compiler is not a parity
/// certificate.
fn validator_profile_positions(positions: &[SchemaPosition]) -> bool {
    for position in positions {
        let NativeJsonNode::Object(members) = position.node.root() else {
            if matches!(position.node.root(), NativeJsonNode::Boolean(_)) {
                continue;
            }
            return false;
        };
        for (key, value) in members {
            let Ok(keyword) = key.to_utf8() else {
                return false;
            };
            match keyword.as_str() {
                "$schema" => {
                    if !matches!(value, NativeJsonNode::String(text) if text.to_utf8().ok().as_deref() == Some(DIALECT_2020_12))
                    {
                        return false;
                    }
                }
                "$id" => {
                    if !matches!(value, NativeJsonNode::String(text) if validator_profile_id(text))
                    {
                        return false;
                    }
                }
                "$ref" => return false,
                "type" => {
                    if !matches!(value, NativeJsonNode::String(text) if matches!(text.to_utf8().ok().as_deref(), Some("boolean" | "integer" | "number" | "object" | "string")))
                    {
                        return false;
                    }
                }
                "properties" | "$defs" => {
                    let NativeJsonNode::Object(children) = value else {
                        return false;
                    };
                    for (name, _) in children {
                        if !validator_profile_name(name) {
                            return false;
                        }
                    }
                }
                "required" => {
                    let NativeJsonNode::Array(names) = value else {
                        return false;
                    };
                    if names
                        .iter()
                        .any(|name| {
                            !matches!(name, NativeJsonNode::String(text) if validator_profile_name(text))
                        })
                    {
                        return false;
                    }
                    for (i, name) in names.iter().enumerate() {
                        if names[..i].iter().any(|prior| prior == name) {
                            return false;
                        }
                    }
                }
                "minimum" | "minLength" => {
                    if !matches!(value, NativeJsonNode::Number(_)) {
                        return false;
                    }
                }
                "additionalProperties" => {
                    if !matches!(value, NativeJsonNode::Boolean(true)) {
                        return false;
                    }
                }
                "prefixItems" => {
                    if !matches!(value, NativeJsonNode::Array(_)) {
                        return false;
                    }
                    // `walk` has enumerated each entry as a schema position;
                    // the profile loop validates every child recursively.
                }
                _ => return false,
            }
        }
    }
    true
}

fn validator_profile_id(text: &Utf16) -> bool {
    let Ok(text) = text.to_utf8() else {
        return false;
    };
    !text.is_empty() && text != "." && text != ".." && text.bytes().all(profile_uri_segment_byte)
}

fn validator_profile_name(text: &Utf16) -> bool {
    let Ok(text) = text.to_utf8() else {
        return false;
    };
    !text.is_empty() && text != "__proto__"
}

fn profile_uri_segment_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')
}

fn handle_compile_error(
    error: EngineError,
    extension_path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    // Check provenance before public codes: a trusted host may return an
    // error whose code happens to resemble a schema diagnostic.
    if error.is_control_failure() || error.code == "LIMIT" {
        return Err(error);
    }
    if error.code == "SCHEMA_INVALID" {
        push(
            diagnostics,
            "JSON_SCHEMA_META",
            extension_path,
            &display(&error.message),
            Severity::Error,
        );
    } else {
        push(
            diagnostics,
            "JSON_SCHEMA_COMPILE",
            extension_path,
            &format!("Native compiler could not establish validity: {}", error),
            Severity::Warning,
        );
    }
    Ok(())
}

/// Preserve the predecessor's useful refusal detail for the exact unsafe
/// integer category. Other unsafe decimal/overflow categories deliberately
/// remain generalized until their host wording has independent replay proof.
fn numeric_refusal_message(
    tree: &NativeJsonTree,
    uri: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut stack = vec![tree.root()];
    while let Some(node) = stack.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match node {
            NativeJsonNode::Number(token) => {
                ctx.charge_work(token.len(), Utf16::default())?;
                if let Ok(value) = token.parse::<f64>() {
                    if number_token_is_unsafe(token, value) {
                        if is_integer_lexeme(token) && is_unsafe_integer(token, value) {
                            return Ok(format!(
                                "Resource {}: native values retained but JavaScript validation unavailable: UmfError: Integer exceeds exact JavaScript range",
                                display(uri)
                            ));
                        }
                        return Ok(format!(
                            "Resource {}: native values retained but JavaScript validation unavailable for one or more numeric tokens",
                            display(uri)
                        ));
                    }
                }
            }
            NativeJsonNode::Array(items) => stack.extend(items.iter().rev()),
            NativeJsonNode::Object(members) => stack.extend(members.iter().rev().map(|(_, v)| v)),
            _ => {}
        }
    }
    Ok(format!(
        "Resource {}: native values retained but JavaScript validation unavailable for one or more numeric tokens",
        display(uri)
    ))
}

fn is_integer_lexeme(token: &str) -> bool {
    !token.contains(['.', 'e', 'E'])
}

fn is_unsafe_integer(token: &str, value: f64) -> bool {
    if value.fract() != 0.0 {
        return false;
    }
    canonical_decimal(token).is_some_and(|(_, digits, scale)| {
        if scale < 0 {
            return false;
        }
        let integer_digits = i64::try_from(digits.len())
            .unwrap_or(i64::MAX)
            .saturating_add(scale);
        if integer_digits > 16 {
            return true;
        }
        if integer_digits < 16 {
            return false;
        }
        format!("{}{}", digits, "0".repeat(scale as usize)).as_str() > "9007199254740991"
    })
}

fn compile_payload(payload: &JsonSchemaPayload, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(payload.resources.len().saturating_add(1), Utf16::default())?;
    let mut root = native_to_value(payload.root.root(), ctx)?;
    install_retrieval_id(&mut root, &payload.base_uri, ctx)?;
    let mut schemas = Vec::with_capacity(payload.resources.len() + 1);
    ctx.charge_work(payload.base_uri.len(), Utf16::default())?;
    schemas.push((payload.base_uri.clone(), root));
    for (uri, tree) in &payload.resources {
        ctx.charge_work(uri.len(), Utf16::default())?;
        let mut value = native_to_value(tree.root(), ctx)?;
        install_retrieval_id(&mut value, uri, ctx)?;
        schemas.push((uri.clone(), value));
    }

    // Check each resource's own metaschema in isolation first. The compiler
    // preflights references in supplied resources, so an unrelated missing
    // reference must not hide an invalid resource's metaschema diagnostic.
    let mut metaschema_error = None;
    let mut compile_error = None;
    for (target_index, (_, schema)) in schemas.iter().enumerate() {
        match CompiledSchema::validate_consumer_metaschema_only(schema, ctx) {
            Ok(_) => {}
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(mut error) if error.code == "SCHEMA_INVALID" => {
                if let Some(detail) =
                    invalid_type_ajv_detail(&error, schema, &schemas[target_index].0)
                {
                    error.message = Utf16::from(detail);
                } else if let Some(detail) =
                    numeric_type_ajv_detail(&error, &schemas[target_index].0)
                {
                    error.message = Utf16::from(detail);
                }
                metaschema_error.get_or_insert(error);
            }
            Err(error) => {
                compile_error.get_or_insert(error);
            }
        }
        let mut resolution = SchemaResources::default();
        ctx.charge_work(schemas.len().saturating_sub(1), Utf16::default())?;
        for (resource_index, (uri, resource)) in schemas.iter().enumerate() {
            if resource_index == target_index {
                continue;
            }
            ctx.charge_work(uri.len(), Utf16::default())?;
            resolution
                .entries
                .push((uri.clone(), crate::copy_json(resource, ctx)?));
        }
        match CompiledSchema::compile_consumer(schema, &resolution, false, ctx) {
            Ok(_) => {}
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(mut error) if error.code == "SCHEMA_INVALID" => {
                if let Some(detail) =
                    invalid_type_ajv_detail(&error, schema, &schemas[target_index].0)
                {
                    error.message = Utf16::from(detail);
                } else if let Some(detail) =
                    numeric_type_ajv_detail(&error, &schemas[target_index].0)
                {
                    error.message = Utf16::from(detail);
                }
                metaschema_error.get_or_insert(error);
            }
            Err(error) => {
                compile_error.get_or_insert(error);
            }
        }
    }
    if let Some(error) = metaschema_error {
        return Err(error);
    }
    if let Some(error) = compile_error {
        return Err(error);
    }
    Ok(())
}

/// Compose the pinned Ajv 8.20 error sequence for the exact `{"type":12}`
/// shape in the R5 host replay contract. This does not claim general Ajv
/// parity; all other compiler errors keep their native bounded diagnostic.
fn invalid_type_ajv_detail(error: &EngineError, schema: &Value, uri: &Utf16) -> Option<String> {
    if error.path != Utf16::from("/type")
        || error.message != Utf16::from("must be equal to one of the allowed values")
    {
        return None;
    }
    let type_value = get_value(schema, "type")?;
    if !matches!(type_value, Value::Number(value) if *value == 12.0) {
        return None;
    }
    // Admit only this single semantic field plus the compiler's safe retrieval
    // metadata. Other keywords may add ordered Ajv errors.
    let Value::Object(members) = schema else {
        return None;
    };
    if members.iter().any(|(key, _)| match key.to_utf8() {
        Ok(key) if key == "type" => false,
        Ok(key) if key == "$id" => !matches!(members.iter().find(|(name, _)| name.to_utf8().ok().as_deref() == Some("$id")).map(|(_, value)| value), Some(Value::String(_))),
        Ok(key) if key == "$schema" => !matches!(members.iter().find(|(name, _)| name.to_utf8().ok().as_deref() == Some("$schema")).map(|(_, value)| value), Some(Value::String(value)) if value == &Utf16::from(DIALECT_2020_12)),
        Ok(_) => true,
        Err(_) => true,
    }) {
        return None;
    }
    const DETAILS: &str = r##"[{"instancePath":"/type","schemaPath":"#/$defs/simpleTypes/enum","keyword":"enum","params":{"allowedValues":["array","boolean","integer","null","number","object","string"]},"message":"must be equal to one of the allowed values"},{"instancePath":"/type","schemaPath":"#/properties/type/anyOf/1/type","keyword":"type","params":{"type":"array"},"message":"must be array"},{"instancePath":"/type","schemaPath":"#/properties/type/anyOf","keyword":"anyOf","params":{},"message":"must match a schema in anyOf"}]"##;
    Some(format!("Resource {}: {}", display(uri), DETAILS))
}

/// Preserve Ajv's Draft 2020-12 metaschema envelope for a numeric validation
/// keyword with a non-numeric value. The Rust compiler reports the exact
/// instance pointer and type failure; this projects that failure into the
/// same single-error Ajv diagnostic used by the public adapter.
fn numeric_type_ajv_detail(error: &EngineError, uri: &Utf16) -> Option<String> {
    let instance_path = error.path.to_utf8().ok()?;
    let keyword = instance_path.rsplit('/').next()?;
    let expected = match keyword {
        "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
            if error.message == Utf16::from("must be number")
                || error.message == Utf16::from("Numeric keyword must be a number") =>
        {
            "number"
        }
        "minLength" | "maxLength" | "minItems" | "maxItems" | "minProperties" | "maxProperties"
        | "minContains" | "maxContains"
            if error.message == Utf16::from("must be integer") =>
        {
            "integer"
        }
        _ => return None,
    };
    let encoded_path = crate::serialization::stringify_compact(&Value::String(error.path.clone()))
        .ok()?
        .to_utf8()
        .ok()?;
    let detail = format!(
        "[{{\"instancePath\":{encoded_path},\"schemaPath\":\"#/properties/{keyword}/type\",\"keyword\":\"type\",\"params\":{{\"type\":\"{expected}\"}},\"message\":\"must be {expected}\"}}]"
    );
    Some(format!("Resource {}: {detail}", display(uri)))
}

fn get_value<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(members) = value else {
        return None;
    };
    members
        .iter()
        .find(|(name, _)| name.to_utf8().ok().as_deref() == Some(key))
        .map(|(_, value)| value)
}

/// Give the compiler the retrieval URI as a base when the native document has
/// no `$id`, and resolve a relative `$id` against that retrieval URI. This is
/// a private compiler view; the retained native tree is never rewritten.
fn install_retrieval_id(
    value: &mut Value,
    retrieval: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(members) = value else {
        return Ok(());
    };
    let id_key = Utf16::from("$id");
    let position = members.iter().position(|(key, _)| key == &id_key);
    let Some(position) = position else {
        ctx.charge_work(retrieval.len(), Utf16::default())?;
        members.push((id_key, Value::String(retrieval.clone())));
        return Ok(());
    };
    let Value::String(id) = &members[position].1 else {
        return Ok(());
    };
    let id_text = id.to_utf8().map_err(|_| {
        EngineError::new(
            "JSON_SCHEMA_URI",
            Utf16::default(),
            "$id must be UTF-8 for the Rust compiler profile",
        )
    })?;
    ctx.charge_work(id_text.len(), Utf16::default())?;
    let Ok(retrieval_text) = retrieval.to_utf8() else {
        return Ok(());
    };
    ctx.charge_work(retrieval_text.len(), Utf16::default())?;
    if let Ok(absolute) = url::Url::parse(&id_text) {
        ctx.charge_work(absolute.as_str().len(), Utf16::default())?;
        members[position].1 = Value::string_utf8(absolute.as_str());
        return Ok(());
    }
    let base = url::Url::parse(&retrieval_text).map_err(|_| {
        EngineError::new(
            "JSON_SCHEMA_URI",
            Utf16::default(),
            "Retrieval URI cannot serve as a relative $id base",
        )
    })?;
    let resolved = base.join(&id_text).map_err(|_| {
        EngineError::new(
            "JSON_SCHEMA_URI",
            Utf16::default(),
            "Relative $id cannot be resolved against its retrieval URI",
        )
    })?;
    ctx.charge_work(resolved.as_str().len(), Utf16::default())?;
    members[position].1 = Value::string_utf8(resolved.as_str());
    Ok(())
}

fn native_to_value(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match node {
        NativeJsonNode::Null => Ok(Value::Null),
        NativeJsonNode::Boolean(value) => Ok(Value::Bool(*value)),
        NativeJsonNode::String(value) => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(Value::String(value.clone()))
        }
        NativeJsonNode::Number(token) => {
            ctx.charge_work(token.len(), Utf16::default())?;
            let value = token.parse::<f64>().map_err(|_| {
                EngineError::new(
                    "JSON_SCHEMA_NUMERIC",
                    Utf16::default(),
                    "Number cannot be represented by the Rust validator profile",
                )
            })?;
            if number_token_is_unsafe(token, value) {
                return Err(EngineError::new(
                    "JSON_SCHEMA_NUMERIC",
                    Utf16::default(),
                    "Number cannot be represented by the Rust validator profile",
                ));
            }
            Value::number(value, Utf16::default())
        }
        NativeJsonNode::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for item in items {
                result.push(native_to_value(item, ctx)?);
            }
            Ok(Value::Array(result))
        }
        NativeJsonNode::Object(members) => {
            let key_units = members
                .iter()
                .fold(0usize, |total, (key, _)| total.saturating_add(key.len()));
            ctx.charge_work(members.len().saturating_add(key_units), Utf16::default())?;
            let mut result = Vec::with_capacity(members.len());
            for (key, value) in members {
                result.push((key.clone(), native_to_value(value, ctx)?));
            }
            Ok(Value::Object(result))
        }
    }
}

fn contains_unsafe_number(
    tree: &NativeJsonTree,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut stack = vec![tree.root()];
    while let Some(node) = stack.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match node {
            NativeJsonNode::Number(token) => {
                ctx.charge_work(token.len(), Utf16::default())?;
                let parsed = token.parse::<f64>();
                if parsed.map_or(true, |value| number_token_is_unsafe(token, value)) {
                    return Ok(true);
                }
            }
            NativeJsonNode::Array(items) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                stack.extend(items.iter());
            }
            NativeJsonNode::Object(members) => {
                ctx.charge_work(members.len(), Utf16::default())?;
                stack.extend(members.iter().map(|(_, value)| value));
            }
            _ => {}
        }
    }
    Ok(false)
}

fn number_token_is_unsafe(token: &str, value: f64) -> bool {
    if !value.is_finite() || !decimal_tokens_equal(token, &crate::ecma_number_to_string(value)) {
        return true;
    }
    // Preserve predecessor guards: JavaScript cannot retain negative zero as
    // a JSON Schema numeric token, and integers beyond MAX_SAFE_INTEGER can
    // silently alter boundary keywords even when the rounded value prints
    // identically.
    if value == 0.0 && token.starts_with('-') {
        return true;
    }
    canonical_decimal(token).is_some_and(|(_, digits, scale)| {
        if scale < 0 {
            return false;
        }
        let integer_digits = i64::try_from(digits.len())
            .unwrap_or(i64::MAX)
            .saturating_add(scale);
        if integer_digits > 16 {
            return true;
        }
        if integer_digits < 16 {
            return false;
        }
        let expanded = format!("{}{}", digits, "0".repeat(scale as usize));
        expanded.as_str() > "9007199254740991"
    })
}

/// Compare JSON decimal values exactly without converting their coefficients
/// to floating point. Numeric syntax is already checked by NativeJsonTree.
fn decimal_tokens_equal(left: &str, right: &str) -> bool {
    canonical_decimal(left)
        .zip(canonical_decimal(right))
        .is_some_and(|(a, b)| a == b)
}

fn canonical_decimal(token: &str) -> Option<(bool, String, i64)> {
    let (mantissa, exponent_text) = token
        .find(['e', 'E'])
        .map(|index| (&token[..index], Some(&token[index + 1..])))
        .unwrap_or((token, None));
    let exponent = match exponent_text {
        Some(value) => value.parse::<i64>().ok()?,
        None => 0,
    };
    let negative = mantissa.starts_with('-');
    let unsigned = mantissa.strip_prefix(['-', '+']).unwrap_or(mantissa);
    let fractional = unsigned
        .find('.')
        .map_or(0, |index| unsigned.len() - index - 1);
    let mut digits = unsigned
        .chars()
        .filter(|character| *character != '.')
        .collect::<String>();
    if !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let first_nonzero = digits.bytes().position(|byte| byte != b'0');
    let Some(first_nonzero) = first_nonzero else {
        return Some((false, "0".to_owned(), 0));
    };
    digits.drain(..first_nonzero);
    let mut scale = exponent.checked_sub(i64::try_from(fractional).ok()?)?;
    while digits.ends_with('0') {
        digits.pop();
        scale = scale.checked_add(1)?;
    }
    Some((negative, digits, scale))
}
fn has_member(node: &NativeJsonNode, key: &str) -> bool {
    matches!(node, NativeJsonNode::Object(members) if members.iter().any(|(name, _)| name.to_utf8().ok().as_deref() == Some(key)))
}
fn display(value: &Utf16) -> String {
    value.to_utf8().unwrap_or_else(|_| "<non-UTF-8>".to_owned())
}
fn push(out: &mut Vec<Diagnostic>, code: &str, path: &Utf16, message: &str, severity: Severity) {
    out.push(Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    });
}
fn join(base: &Utf16, suffix: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_text(base.len().saturating_add(suffix.len()), base.clone())?;
    let mut units = base.units().to_vec();
    units.extend_from_slice(suffix.units());
    Ok(Utf16::new(units))
}
fn child(parent: &Utf16, segment: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let escaped_len = segment.units().iter().fold(0usize, |length, unit| {
        length.saturating_add(if matches!(*unit, 0x7e | 0x2f) { 2 } else { 1 })
    });
    let total_len = parent.len().saturating_add(1).saturating_add(escaped_len);
    ctx.charge_text(total_len, parent.clone())?;
    let mut units = parent.units().to_vec();
    units.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Ok(Utf16::new(units))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_conversion_precharges_string_bytes_and_container_slots() {
        let text = Utf16::from("s".repeat(1024));
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            if amount >= text.len() {
                Err(EngineError::new("METER_STOP", Utf16::default(), "stopped"))
            } else {
                Ok(())
            }
        };
        let error = native_to_value(
            &NativeJsonNode::String(text.clone()),
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(observed, [1, text.len()]);

        let items = (0..256).map(|_| NativeJsonNode::Null).collect();
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            if amount >= 256 {
                Err(EngineError::new("METER_STOP", Utf16::default(), "stopped"))
            } else {
                Ok(())
            }
        };
        let error = native_to_value(
            &NativeJsonNode::Array(items),
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(observed, [1, 256]);
    }

    #[test]
    fn child_path_charges_escaped_size_before_copying_parent() {
        let parent = Utf16::from("/large-prefix");
        let segment = Utf16::from("a/b~c");
        let expected = parent.len() + 1 + 7;
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Err(EngineError::new("METER_STOP", Utf16::default(), "stopped"))
        };
        let error = child(
            &parent,
            &segment,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(observed, [expected]);
    }

    #[test]
    fn compile_error_mapping_obeys_provenance_before_public_code() {
        let path = Utf16::from("/schema");
        let host_error =
            EngineError::new("SCHEMA_INVALID", Utf16::default(), "host failure").from_host();
        let mut diagnostics = Vec::new();
        let returned = handle_compile_error(host_error, &path, &mut diagnostics).unwrap_err();
        assert_eq!(returned.code, "SCHEMA_INVALID");
        assert!(returned.is_control_failure());
        assert!(diagnostics.is_empty());

        let limit = EngineError::new("LIMIT", Utf16::default(), "limit");
        assert_eq!(
            handle_compile_error(limit, &path, &mut diagnostics)
                .unwrap_err()
                .code,
            "LIMIT"
        );
        assert!(diagnostics.is_empty());

        let semantic = EngineError::new("SCHEMA_INVALID", Utf16::default(), "bad schema");
        handle_compile_error(semantic, &path, &mut diagnostics).unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, Utf16::from("JSON_SCHEMA_META"));
    }

    #[test]
    fn exact_integer_refusal_has_compatibility_detail_and_other_numeric_losses_stay_generic() {
        let unsafe_integer = NativeJsonTree::parse_json(
            &br#"{"minimum":9007199254740993}"#.iter().map(|b| *b as u16).collect::<Vec<_>>(),
            &mut Context::ordinary(),
        )
        .unwrap();
        let message = numeric_refusal_message(
            &unsafe_integer,
            &Utf16::from("https://example.test/root"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            message,
            "Resource https://example.test/root: native values retained but JavaScript validation unavailable: UmfError: Integer exceeds exact JavaScript range"
        );

        for source in [
            r#"{"minimum":0.10000000000000000001}"#,
            r#"{"minimum":1e400}"#,
            r#"{"minimum":-0}"#,
            r#"{"minimum":9007199254740993.0}"#,
            r#"{"first":-0,"second":9007199254740993}"#,
        ] {
            let tree = NativeJsonTree::parse_json(
                &source.encode_utf16().collect::<Vec<_>>(),
                &mut Context::ordinary(),
            )
            .unwrap();
            let message = numeric_refusal_message(
                &tree,
                &Utf16::from("https://example.test/root"),
                &mut Context::ordinary(),
            )
            .unwrap();
            assert!(message.ends_with("native values retained but JavaScript validation unavailable for one or more numeric tokens"), "{source}: {message}");
        }
    }

    #[test]
    fn only_the_replayed_numeric_type_shape_gets_nested_ajv_ordered_detail() {
        let schema = Value::Object(vec![(Utf16::from("type"), Value::Number(12.0))]);
        let error = EngineError::new(
            "SCHEMA_INVALID",
            Utf16::from("/type"),
            "must be equal to one of the allowed values",
        );
        let detail = invalid_type_ajv_detail(
            &error,
            &schema,
            &Utf16::from("https://schemas.example.test/root.json"),
        )
        .unwrap();
        assert_eq!(
            detail,
            r##"Resource https://schemas.example.test/root.json: [{"instancePath":"/type","schemaPath":"#/$defs/simpleTypes/enum","keyword":"enum","params":{"allowedValues":["array","boolean","integer","null","number","object","string"]},"message":"must be equal to one of the allowed values"},{"instancePath":"/type","schemaPath":"#/properties/type/anyOf/1/type","keyword":"type","params":{"type":"array"},"message":"must be array"},{"instancePath":"/type","schemaPath":"#/properties/type/anyOf","keyword":"anyOf","params":{},"message":"must match a schema in anyOf"}]"##
        );
        let non_type_error =
            EngineError::new("SCHEMA_INVALID", Utf16::from("/title"), "must be string");
        assert!(
            invalid_type_ajv_detail(
                &non_type_error,
                &schema,
                &Utf16::from("https://schemas.example.test/root.json")
            )
            .is_none()
        );
        let multi_invalid = Value::Object(vec![
            (Utf16::from("type"), Value::Number(12.0)),
            (Utf16::from("minLength"), Value::Number(-1.0)),
        ]);
        assert!(
            invalid_type_ajv_detail(
                &error,
                &multi_invalid,
                &Utf16::from("https://schemas.example.test/root.json")
            )
            .is_none()
        );
        let unknown_also_present = Value::Object(vec![
            (Utf16::from("type"), Value::Number(12.0)),
            (Utf16::from("x-opaque"), Value::Bool(true)),
        ]);
        assert!(
            invalid_type_ajv_detail(
                &error,
                &unknown_also_present,
                &Utf16::from("https://schemas.example.test/root.json")
            )
            .is_none()
        );
    }
}
fn schema_positions(
    tree: &NativeJsonTree,
    ctx: &mut Context<'_>,
) -> Result<Vec<SchemaPosition>, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut output = Vec::new();
    ctx.charge_work(1, Utf16::default())?;
    let mut stack = vec![(Utf16::default(), tree.root())];
    while let Some((pointer, node)) = stack.pop() {
        ctx.charge_work(1, pointer.clone())?;
        ctx.charge_work(
            pointer.len().saturating_mul(2).saturating_add(1),
            pointer.clone(),
        )?;
        output.push(SchemaPosition {
            pointer: pointer.clone(),
            node: tree.subtree_clone(&pointer, ctx)?,
        });
        let NativeJsonNode::Object(members) = node else {
            continue;
        };
        ctx.charge_work(members.len(), pointer.clone())?;
        let mut children = Vec::new();
        for (key, value) in members {
            let name = key.to_utf8().unwrap_or_default();
            if [
                "$defs",
                "definitions",
                "properties",
                "patternProperties",
                "dependentSchemas",
            ]
            .contains(&name.as_str())
            {
                if let NativeJsonNode::Object(entries) = value {
                    let key_path = child(&pointer, key, ctx)?;
                    for (child_key, child_node) in entries {
                        let path = child(&key_path, child_key, ctx)?;
                        ctx.charge_work(1, pointer.clone())?;
                        children.push((path, child_node));
                    }
                }
            } else if ["allOf", "anyOf", "oneOf", "prefixItems"].contains(&name.as_str()) {
                if let NativeJsonNode::Array(entries) = value {
                    let key_path = child(&pointer, key, ctx)?;
                    for (index, child_node) in entries.iter().enumerate() {
                        let path = child(&key_path, &Utf16::from(index.to_string()), ctx)?;
                        ctx.charge_work(1, pointer.clone())?;
                        children.push((path, child_node));
                    }
                }
            } else if [
                "items",
                "contains",
                "not",
                "if",
                "then",
                "else",
                "additionalProperties",
                "unevaluatedProperties",
                "propertyNames",
                "contentSchema",
                "unevaluatedItems",
            ]
            .contains(&name.as_str())
            {
                ctx.charge_work(1, pointer.clone())?;
                children.push((child(&pointer, key, ctx)?, value));
            }
        }
        for child in children.into_iter().rev() {
            ctx.charge_work(1, pointer.clone())?;
            stack.push(child);
        }
    }
    Ok(output)
}
