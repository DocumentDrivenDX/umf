// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned OpenAPI static-schema to JSON Schema projection.
use std::collections::BTreeMap;

use crate::{
    context::Context,
    error::EngineError,
    json_schema_adapter,
    native_json::NativeJsonNode,
    openapi_adapter::{self, OpenapiRuntime, OpenapiSchemaLocation},
    value::{copy_json, Utf16, Value},
};

const DRAFT: &str = "https://json-schema.org/draft/2020-12/schema";
const KNOWN: &[&str] = &[
    "$schema",
    "$id",
    "$anchor",
    "$ref",
    "$comment",
    "$defs",
    "definitions",
    "dependencies",
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
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "if",
    "then",
    "else",
    "prefixItems",
    "items",
    "contains",
    "additionalProperties",
    "properties",
    "patternProperties",
    "dependentSchemas",
    "propertyNames",
    "unevaluatedItems",
    "unevaluatedProperties",
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
];
const OAS: &[&str] = &["discriminator", "xml", "externalDocs", "example"];

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn field<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn object(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn utf8(v: &Utf16, code: &str) -> Result<String, EngineError> {
    v.to_utf8()
        .map_err(|_| err(code, "Expected well-formed UTF-16 text"))
}
fn pointer_child(
    path: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        path.len().saturating_add(segment.len()).saturating_add(1),
        path.clone(),
    )?;
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for u in segment.units() {
        match *u {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            x => units.push(x),
        }
    }
    Ok(Utf16::new(units))
}
fn issue(path: &Utf16, code: &str, classification: &str, detail: &str) -> Value {
    object(vec![
        ("path", Value::String(path.clone())),
        ("code", s(code)),
        ("classification", s(classification)),
        ("detail", s(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn render_string(
    value: &Utf16,
    out: &mut Vec<u16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(b'"' as u16);
    let units = value.units();
    let mut index = 0;
    while index < units.len() {
        ctx.charge_work(1, Utf16::default())?;
        let unit = units[index];
        match unit {
            0x22 => out.extend([b'\\' as u16, b'"' as u16]),
            0x5c => out.extend([b'\\' as u16, b'\\' as u16]),
            0x08 => out.extend([b'\\' as u16, b'b' as u16]),
            0x0c => out.extend([b'\\' as u16, b'f' as u16]),
            0x0a => out.extend([b'\\' as u16, b'n' as u16]),
            0x0d => out.extend([b'\\' as u16, b'r' as u16]),
            0x09 => out.extend([b'\\' as u16, b't' as u16]),
            0..=0x1f => {
                let escape = format!("\\u{unit:04x}");
                out.extend(escape.encode_utf16());
            }
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
            {
                out.push(unit);
                index += 1;
                out.push(units[index]);
            }
            0xd800..=0xdfff => {
                let escape = format!("\\u{unit:04x}");
                out.extend(escape.encode_utf16());
            }
            _ => out.push(unit),
        }
        index += 1;
    }
    out.push(b'"' as u16);
    Ok(())
}

fn render_node(
    node: &NativeJsonNode,
    out: &mut Vec<u16>,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *values = values.saturating_add(1);
    if depth > ctx.limits().max_depth || *values > ctx.limits().max_values {
        return Err(err("LIMIT", "JSON structural limit exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    match node {
        NativeJsonNode::Null => out.extend("null".encode_utf16()),
        NativeJsonNode::Boolean(value) => {
            out.extend(if *value { "true" } else { "false" }.encode_utf16())
        }
        NativeJsonNode::String(value) => render_string(value, out, ctx)?,
        NativeJsonNode::Number(value) => out.extend(value.encode_utf16()),
        NativeJsonNode::Array(items) => {
            out.push(b'[' as u16);
            for (index, item) in items.iter().enumerate() {
                if index != 0 {
                    out.push(b',' as u16);
                }
                render_node(item, out, depth + 1, values, ctx)?;
            }
            out.push(b']' as u16);
        }
        NativeJsonNode::Object(members) => {
            out.push(b'{' as u16);
            for (index, (name, value)) in members.iter().enumerate() {
                if index != 0 {
                    out.push(b',' as u16);
                }
                render_string(name, out, ctx)?;
                out.push(b':' as u16);
                render_node(value, out, depth + 1, values, ctx)?;
            }
            out.push(b'}' as u16);
        }
    }
    if out.len() > ctx.limits().max_text_units {
        return Err(err("LIMIT", "Serialized text limit exceeded"));
    }
    Ok(())
}

fn render_schema(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut output = Vec::new();
    let mut values = 0;
    render_node(node, &mut output, 0, &mut values, ctx)?;
    ctx.charge_text(output.len(), Utf16::default())?;
    Ok(Utf16::new(output))
}
fn canonical_uri(value: &Utf16) -> Result<Utf16, EngineError> {
    let source = utf8(value, "OPENAPI_PROJECTION_POLICY")?;
    let mut uri = url::Url::parse(&source).map_err(|_| {
        err(
            "OPENAPI_PROJECTION_POLICY",
            "Expected an absolute resource URI",
        )
    })?;
    Ok(Utf16::from(uri.as_str()))
}

pub fn project_openapi_to_json_schema(
    source: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let id = text(field(policy, "id"))
        .ok_or_else(|| {
            err(
                "OPENAPI_PROJECTION_POLICY",
                "Explicit projection id is required",
            )
        })?
        .clone();
    let schema_id = text(field(policy, "schemaId"))
        .ok_or_else(|| err("OPENAPI_PROJECTION_POLICY", "Target schema ID is required"))?
        .clone();
    let pointer = text(field(policy, "pointer"))
        .ok_or_else(|| {
            err(
                "OPENAPI_PROJECTION_POLICY",
                "Source schema pointer is required",
            )
        })?
        .clone();
    let usage = text(field(policy, "usage"))
        .ok_or_else(|| err("OPENAPI_PROJECTION_POLICY", "Projection usage is required"))?;
    let loss = text(field(policy, "lossPolicy"))
        .ok_or_else(|| err("OPENAPI_PROJECTION_POLICY", "Loss policy is required"))?;
    if id.is_empty()
        || usage != &key("schema-only")
        || (loss != &key("strict") && loss != &key("allow-reported-loss"))
    {
        return Err(err(
            "OPENAPI_PROJECTION_POLICY",
            "Explicit schema-only projection policy is required",
        ));
    }
    let schema_id_text = utf8(&schema_id, "OPENAPI_PROJECTION_POLICY")?;
    let parsed = url::Url::parse(&schema_id_text).map_err(|_| {
        err(
            "OPENAPI_PROJECTION_POLICY",
            "Target schema ID must be absolute and fragment-free",
        )
    })?;
    if parsed
        .fragment()
        .is_some_and(|fragment| !fragment.is_empty())
    {
        return Err(err(
            "OPENAPI_PROJECTION_POLICY",
            "Target schema ID must be absolute and fragment-free",
        ));
    }
    let allowed = [
        "id",
        "schemaId",
        "pointer",
        "resourceUri",
        "schemaResources",
        "usage",
        "lossPolicy",
    ];
    if let Value::Object(m) = policy {
        if m.iter()
            .any(|(name, _)| !allowed.iter().any(|candidate| name == &key(candidate)))
        {
            return Err(err(
                "OPENAPI_PROJECTION_POLICY",
                "Unknown projection policy member",
            ));
        }
    }
    let resource_uri = match field(policy, "resourceUri") {
        Some(Value::String(v)) => Some(canonical_uri(v)?),
        Some(_) => {
            return Err(err(
                "OPENAPI_PROJECTION_POLICY",
                "resourceUri must be a URI",
            ))
        }
        None => None,
    };
    let mut schema_resources = Vec::new();
    if let Some(value) = field(policy, "schemaResources") {
        let Value::Array(items) = value else {
            return Err(err(
                "OPENAPI_PROJECTION_POLICY",
                "schemaResources must be a URI array",
            ));
        };
        for item in items {
            let Value::String(uri) = item else {
                return Err(err(
                    "OPENAPI_PROJECTION_POLICY",
                    "schemaResources must contain URIs",
                ));
            };
            schema_resources.push(canonical_uri(uri)?);
        }
    }
    let mut runtime = OpenapiRuntime::new(ctx)?;
    let admission = openapi_adapter::inspect_openapi_document(source, &runtime, ctx)?;
    if !admission.valid {
        return Err(err("OPENAPI_PROJECTION_SOURCE", "Invalid OpenAPI source"));
    }
    let bundle = openapi_adapter::export_openapi_bundle(source, &runtime, ctx)?;
    let retrieval = bundle.base_uri.ok_or_else(|| {
        err(
            "OPENAPI_SCOPE_BASE",
            "Schema indexing requires a retrieval URI",
        )
    })?;
    let selected_uri = resource_uri.unwrap_or(retrieval.clone());
    let source_copy = copy_json(source, ctx)?;
    let policy_copy = copy_json(policy, ctx)?;
    let mut state = OpenapiProjection {
        source,
        ctx,
        runtime: &mut runtime,
        issues: Vec::new(),
        mappings: Vec::new(),
        definitions: Vec::new(),
        names: BTreeMap::new(),
        fatal: false,
        schema_resources,
        locations: Vec::new(),
    };
    let index = match openapi_adapter::index_openapi_schemas(
        source,
        &state.schema_resources,
        state.runtime,
        state.ctx,
    ) {
        Ok(v) => v,
        Err(e) if !e.is_control_failure() => {
            state.fail(&Utf16::default(), &format!("{e}"))?;
            return Ok(state.result("blocked", source_copy, policy_copy, None, None));
        }
        Err(e) => return Err(e),
    };
    state.locations = index.locations.clone();
    let Some(selected) = index
        .locations
        .iter()
        .find(|l| l.retrieval_uri == selected_uri && l.pointer == pointer)
        .cloned()
    else {
        state.fail(&pointer, "Selection is not an indexed schema position")?;
        return Ok(state.result("blocked", source_copy, policy_copy, None, None));
    };
    let root = state.project_location(&selected)?;
    state.issue(&Utf16::default(),"SCHEMA_IDENTITY","representation-change","Static schema identities and references are rewritten into target definitions; original identities remain in source and mappings")?;
    state.issue(&Utf16::default(),"SCHEMA_ONLY","not-enforced","JSON instance constraints do not implement operations, HTTP serialization, authorization, request/response direction, defaults insertion or API runtime behavior")?;
    if state.fatal || (loss == &key("strict") && !state.issues.is_empty()) {
        return Ok(state.result("blocked", source_copy, policy_copy, None, None));
    }
    let mut fields = vec![
        (key("$schema"), NativeJsonNode::String(Utf16::from(DRAFT))),
        (key("$id"), NativeJsonNode::String(schema_id.clone())),
    ];
    match root {
        NativeJsonNode::Object(mut members) => fields.append(&mut members),
        NativeJsonNode::Boolean(true) => {}
        NativeJsonNode::Boolean(false) => {
            fields.push((key("not"), NativeJsonNode::Object(Vec::new())))
        }
        _ => {
            return Err(err(
                "OPENAPI_TARGET",
                "Generated root schema must be an object or boolean",
            ))
        }
    }
    fields.push((
        key("$defs"),
        NativeJsonNode::Object(std::mem::take(&mut state.definitions)),
    ));
    let schema = NativeJsonNode::Object(fields);
    let text = render_schema(&schema, state.ctx)?;
    let target = match json_schema_adapter::import_json_schema(
        text.units(),
        &id,
        &schema_id,
        &[],
        state.ctx,
    ) {
        Ok(v) => v,
        Err(e) if !e.is_control_failure() => {
            state.fail(&Utf16::default(), &e.to_string())?;
            return Ok(state.result("blocked", source_copy, policy_copy, None, None));
        }
        Err(e) => return Err(e),
    };
    let checked = json_schema_adapter::inspect_json_schema(&target, state.ctx)?;
    for diagnostic in checked.diagnostics {
        let code = utf8(&diagnostic.code, "OPENAPI_PROJECTION_TARGET")?;
        let blocked = [
            "JSON_SCHEMA_COMPILE",
            "JSON_SCHEMA_NUMERIC",
            "JSON_SCHEMA_KEYWORD",
            "JSON_SCHEMA_DIALECT",
            "JSON_SCHEMA_VOCABULARY",
        ]
        .contains(&code.as_str());
        state.issues.push(issue(
            &diagnostic.path,
            &code,
            if blocked {
                "unsupported"
            } else {
                "not-enforced"
            },
            &utf8(&diagnostic.message, "OPENAPI_PROJECTION_TARGET")?,
        ));
        state.fatal |= blocked;
    }
    if state.fatal {
        return Ok(state.result("blocked", source_copy, policy_copy, None, None));
    }
    Ok(state.result(
        "projected",
        source_copy,
        policy_copy,
        Some(target),
        Some(Value::String(text)),
    ))
}

struct OpenapiProjection<'a, 'b, 'ctx> {
    source: &'a Value,
    ctx: &'b mut Context<'ctx>,
    runtime: &'b mut OpenapiRuntime,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    definitions: Vec<(Utf16, NativeJsonNode)>,
    names: BTreeMap<(Utf16, Utf16), String>,
    fatal: bool,
    schema_resources: Vec<Utf16>,
    locations: Vec<OpenapiSchemaLocation>,
}
impl OpenapiProjection<'_, '_, '_> {
    fn issue(
        &mut self,
        path: &Utf16,
        code: &str,
        class: &str,
        detail: &str,
    ) -> Result<(), EngineError> {
        self.ctx.charge_work(1, path.clone())?;
        self.issues.push(issue(path, code, class, detail));
        Ok(())
    }
    fn fail(&mut self, path: &Utf16, detail: &str) -> Result<(), EngineError> {
        self.fatal = true;
        self.issue(
            path,
            "OPENAPI_PROJECTION_UNSUPPORTED",
            "unsupported",
            detail,
        )
    }
    fn result(
        &mut self,
        status: &str,
        source: Value,
        policy: Value,
        target: Option<Value>,
        native: Option<Value>,
    ) -> Value {
        let mut fields = vec![
            (key("status"), s(status)),
            (key("source"), source),
            (key("policy"), policy),
            (
                key("issues"),
                Value::Array(std::mem::take(&mut self.issues)),
            ),
            (
                key("mappings"),
                Value::Array(std::mem::take(&mut self.mappings)),
            ),
        ];
        if let Some(v) = target {
            fields.push((key("target"), v));
        }
        if let Some(v) = native {
            fields.push((key("nativeSchema"), v));
        }
        Value::Object(fields)
    }
    fn project_location(
        &mut self,
        location: &OpenapiSchemaLocation,
    ) -> Result<NativeJsonNode, EngineError> {
        let identity = (location.retrieval_uri.clone(), location.pointer.clone());
        if let Some(name) = self.names.get(&identity) {
            return Ok(NativeJsonNode::Object(vec![(
                key("$ref"),
                NativeJsonNode::String(Utf16::from(format!("#/$defs/{name}"))),
            )]));
        }
        let name = format!("schema_{}", self.names.len());
        self.names.insert(identity, name.clone());
        self.mappings.push(object(vec![
            (
                "retrievalUri",
                Value::String(location.retrieval_uri.clone()),
            ),
            ("sourcePointer", Value::String(location.pointer.clone())),
            ("targetPointer", s(&format!("/$defs/{name}"))),
        ]));
        self.definitions
            .push((key(&name), NativeJsonNode::Object(Vec::new())));
        let tree = openapi_adapter::get_openapi_node(
            self.source,
            &location.pointer,
            Some(&location.retrieval_uri),
            self.runtime,
            self.ctx,
        )?;
        let _ = tree.render_compact(self.ctx)?;
        let node = tree.root().clone();
        let transformed = self.walk(node, location, &location.pointer, true)?;
        if let Some((_, slot)) = self.definitions.iter_mut().find(|(k, _)| k == &key(&name)) {
            *slot = transformed;
        }
        Ok(NativeJsonNode::Object(vec![(
            key("$ref"),
            NativeJsonNode::String(Utf16::from(format!("#/$defs/{name}"))),
        )]))
    }
    fn walk(
        &mut self,
        node: NativeJsonNode,
        location: &OpenapiSchemaLocation,
        path: &Utf16,
        top: bool,
    ) -> Result<NativeJsonNode, EngineError> {
        if !top {
            if let Some(nested) = self
                .locations
                .iter()
                .find(|p| p.retrieval_uri == location.retrieval_uri && p.pointer == *path)
                .cloned()
            {
                return self.project_location(&nested);
            }
        }
        match node {
            NativeJsonNode::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for (i, item) in items.into_iter().enumerate() {
                    let child = pointer_child(path, &Utf16::from(i.to_string()), self.ctx)?;
                    out.push(self.walk(item, location, &child, false)?);
                }
                Ok(NativeJsonNode::Array(out))
            }
            NativeJsonNode::Object(members) => {
                let mut out = Vec::new();
                for (k, v) in members {
                    let child = pointer_child(path, &k, self.ctx)?;
                    if top {
                        let Ok(key_text) = k.to_utf8() else {
                            self.fail(&child, "Unknown schema keyword cannot be assigned generic validation semantics")?;
                            continue;
                        };
                        if ["$schema", "$id", "$anchor"].contains(&key_text.as_str()) {
                            continue;
                        }
                        if ["$dynamicRef", "$dynamicAnchor", "$vocabulary"]
                            .contains(&key_text.as_str())
                        {
                            self.fail(&child,"Dynamic scope or custom vocabulary requires a separate projection contract")?;
                            continue;
                        }
                        if key_text == "$ref" {
                            let NativeJsonNode::String(reference) = &v else {
                                self.fail(&child, "Reference must be a string")?;
                                continue;
                            };
                            match openapi_adapter::resolve_openapi_schema_reference(
                                self.source,
                                &location.pointer,
                                reference,
                                Some(&location.retrieval_uri),
                                &self.schema_resources,
                                self.runtime,
                                self.ctx,
                            ) {
                                Ok(res) => {
                                    let projected = self.project_location(&res.target)?;
                                    if let NativeJsonNode::Object(ref_fields) = projected {
                                        if let Some((_, ref_value)) =
                                            ref_fields.iter().find(|(name, _)| name == &key("$ref"))
                                        {
                                            out.push((key("$ref"), ref_value.clone()));
                                        }
                                    }
                                }
                                Err(e) if !e.is_control_failure() => {
                                    self.fail(&child, &e.to_string())?
                                }
                                Err(e) => return Err(e),
                            }
                            continue;
                        }
                        if OAS.contains(&key_text.as_str()) || key_text.starts_with("x-") {
                            self.issue(&child,"OPENAPI_ANNOTATION","not-enforced","OpenAPI annotation/extension is retained in source and omitted from generic JSON validation")?;
                            continue;
                        }
                        if !KNOWN.contains(&key_text.as_str()) {
                            self.fail(&child,"Unknown schema keyword cannot be assigned generic validation semantics")?;
                            continue;
                        }
                        if [
                            "readOnly",
                            "writeOnly",
                            "format",
                            "contentEncoding",
                            "contentMediaType",
                        ]
                        .contains(&key_text.as_str())
                        {
                            self.issue(&child,"ANNOTATION_BEHAVIOR","not-enforced","Annotation is retained, without request/response filtering, format assertion or content decoding")?;
                        }
                    }
                    let child_value = self.walk(v, location, &child, false)?;
                    out.push((k, child_value));
                }
                Ok(NativeJsonNode::Object(out))
            }
            scalar => Ok(scalar),
        }
    }
}
