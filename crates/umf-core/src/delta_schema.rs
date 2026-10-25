// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact Delta schema JSON source operations for CONTRACT-018.
//!
//! This module owns the schema profile only. It does not inspect table
//! protocol, run native Delta validation, or imply reader/writer support.

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{native_pointer, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.delta";
const PROFILE: &str = "delta-schema-json";
const TOKEN: u64 = 0x4445_4c54_4153_4301;
const CORE_VERSION: &str = "0.10.0";
const EXT_VERSION: &str = "0.1.0";

pub struct DeltaSchemaResources {
    engine: Engine,
    registry: Registry,
    grammar: CompiledSchema,
    manifest: Value,
}

impl DeltaSchemaResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                ctx,
            )
        }
        let engine = Engine::new(
            ResourceSet::new(
                resource(include_str!("../../../spec/core/schema.json"), ctx)?,
                resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                resource(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                resource(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                resource(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let manifest = resource(
            include_str!("../../../spec/extensions/delta/package.json"),
            ctx,
        )?;
        let grammar_value = resource(
            include_str!("../../../spec/extensions/delta/datatype-schema.json"),
            ctx,
        )?;
        ensure_shape_only_numeric_rules(&grammar_value)?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        let grammar = CompiledSchema::compile(&grammar_value, &schema_resources, ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &manifest,
            Some(TOKEN),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        Ok(Self {
            engine,
            registry,
            grammar,
            manifest,
        })
    }

    pub fn package(&self) -> &Value {
        &self.manifest
    }
}

fn ensure_shape_only_numeric_rules(grammar: &Value) -> Result<(), EngineError> {
    fn contains_numeric_rule(value: &Value) -> bool {
        match value {
            Value::Array(items) => items.iter().any(contains_numeric_rule),
            Value::Object(fields) => fields.iter().any(|(key, value)| {
                (match key.to_utf8().ok().as_deref() {
                    Some("minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf") => true,
                    Some("type") => match value {
                        Value::String(text) => matches!(text.to_utf8().ok().as_deref(), Some("number" | "integer")),
                        Value::Array(items) => items.iter().any(|item| matches!(item, Value::String(text) if matches!(text.to_utf8().ok().as_deref(), Some("number" | "integer")))),
                        _ => false,
                    },
                    Some("const") => matches!(value, Value::Number(_)),
                    Some("enum") => matches!(value, Value::Array(items) if items.iter().any(|item| matches!(item, Value::Number(_)))),
                    _ => false,
                }) || contains_numeric_rule(value)
            }),
            _ => false,
        }
    }
    if contains_numeric_rule(grammar) {
        return Err(err(
            "DELTA_GRAMMAR_NUMERIC_RULE",
            "Delta's temporary shape view cannot admit numeric schema constraints; validate NativeJson number tokens directly",
        ));
    }
    Ok(())
}

struct DeltaCapabilities<'a> {
    grammar: &'a CompiledSchema,
}

impl Capabilities for DeltaCapabilities<'_> {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        _semantic: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN {
            return Ok(Vec::new());
        }
        let mut diagnostics = vec![diagnostic(
            "DELTA_CONTEXT_UNVERIFIED", "",
            "Schema alone cannot establish Delta protocol/features, table configuration or read/write validity",
            Severity::Warning,
        )];
        let Value::Object(fields) = payload else {
            return Ok(vec![diagnostic(
                "DELTA_PAYLOAD",
                "",
                "Payload must be an object",
                Severity::Error,
            )]);
        };
        if field(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
            diagnostics.push(diagnostic(
                "DELTA_PAYLOAD",
                "",
                "Expected pinned Delta schema payload",
                Severity::Error,
            ));
            return Ok(diagnostics);
        }
        let Some(root) = field(fields, "root") else {
            diagnostics.push(diagnostic(
                "DELTA_PAYLOAD",
                "",
                "Delta payload root is missing",
                Severity::Error,
            ));
            return Ok(diagnostics);
        };
        if fields.iter().any(|(key, _)| {
            !["profile", "root"]
                .iter()
                .any(|known| key == &Utf16::from(*known))
        }) {
            diagnostics.push(diagnostic(
                "DELTA_REPRESENTATION",
                "",
                "Unknown representation fields must remain in UMF",
                Severity::Warning,
            ));
        }
        if let Some(root) = field(fields, "root") {
            tagged_representation_warnings(root, &Utf16::from("/root"), &mut diagnostics);
        }
        let native =
            NativeJsonTree::from_tagged_value(root, ctx).map_err(CapabilityError::Engine)?;
        // The schema grammar only constrains the source shape; arbitrary
        // numeric metadata is opaque. Build a temporary validation view that
        // does not round exact source number tokens through f64. The original
        // NativeJsonTree remains the sole export/edit authority.
        let view = shape_view(native.root(), ctx).map_err(CapabilityError::Engine)?;
        for issue in self
            .grammar
            .validate(&view, ctx)
            .map_err(CapabilityError::Engine)?
        {
            diagnostics.push(Diagnostic {
                code: Utf16::from("DELTA_STRUCTURE"),
                path: issue.instance_path,
                python_source_path: false,
                message: issue.message,
                severity: Severity::Error,
                python_text_origin: None,
            });
        }
        // Keep source-schema semantic warnings in the same traversal/order as
        // the TypeScript predecessor. These are warnings only: this profile
        // does not prove protocol support or native reader/writer validity.
        schema_semantic_warnings(&view, &mut diagnostics);
        Ok(diagnostics)
    }
}

fn tagged_representation_warnings(value: &Value, path: &Utf16, diagnostics: &mut Vec<Diagnostic>) {
    let Value::Object(fields) = value else { return };
    let kind = field(fields, "kind").and_then(|v| {
        if let Value::String(s) = v {
            s.to_utf8().ok()
        } else {
            None
        }
    });
    let allowed: &[&str] = match kind.as_deref() {
        Some("null") => &["kind"],
        Some("array") => &["kind", "items"],
        Some("object") => &["kind", "members"],
        _ => &["kind", "value"],
    };
    for (key, _) in fields {
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            diagnostics.push(Diagnostic {
                code: Utf16::from("DELTA_REPRESENTATION"),
                path: path.clone(),
                python_source_path: false,
                message: Utf16::from("Unknown tagged-tree fields must remain in UMF"),
                severity: Severity::Warning,
                python_text_origin: None,
            });
        }
    }
    if kind.as_deref() == Some("object") {
        if let Some(Value::Object(members)) = field(fields, "members") {
            for (key, child) in members {
                tagged_representation_warnings(child, &native_child_path(path, key), diagnostics);
            }
        }
    } else if kind.as_deref() == Some("array") {
        if let Some(Value::Array(items)) = field(fields, "items") {
            for (index, child) in items.iter().enumerate() {
                tagged_representation_warnings(
                    child,
                    &native_child_path(path, &Utf16::from(index.to_string())),
                    diagnostics,
                );
            }
        }
    }
}

fn native_child_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            u => units.push(u),
        }
    }
    Utf16::new(units)
}

fn schema_semantic_warnings(root: &Value, diagnostics: &mut Vec<Diagnostic>) {
    fn add(ds: &mut Vec<Diagnostic>, code: &str, path: &Utf16, message: &str) {
        ds.push(Diagnostic {
            code: Utf16::from(code),
            path: path.clone(),
            python_source_path: false,
            message: Utf16::from(message),
            severity: Severity::Warning,
            python_text_origin: None,
        });
    }
    fn child(path: &Utf16, key: &Utf16) -> Utf16 {
        let mut units = path.units().to_vec();
        units.push(b'/' as u16);
        for unit in key.units() {
            match *unit {
                0x7e => units.extend([b'~' as u16, b'0' as u16]),
                0x2f => units.extend([b'~' as u16, b'1' as u16]),
                unit => units.push(unit),
            }
        }
        Utf16::new(units)
    }
    fn unknown(value: &[(Utf16, Value)], known: &[&str], path: &Utf16, ds: &mut Vec<Diagnostic>) {
        for (key, _) in value {
            if !known.iter().any(|name| key == &Utf16::from(*name)) {
                add(
                    ds,
                    "DELTA_UNKNOWN",
                    &child(path, key),
                    "Unknown native property preserved; native normalization may discard it",
                );
            }
        }
    }
    fn walk(value: &Value, path: &Utf16, ds: &mut Vec<Diagnostic>) {
        const ATOMIC: &[&str] = &[
            "string",
            "long",
            "integer",
            "short",
            "byte",
            "float",
            "double",
            "boolean",
            "binary",
            "date",
            "timestamp",
            "timestamp_ntz",
            "void",
            "variant",
        ];
        match value {
            Value::String(spelling) => {
                let text = spelling.to_utf8().unwrap_or_default();
                if let Some((precision_text, scale_text)) = text
                    .strip_prefix("decimal(")
                    .and_then(|s| s.strip_suffix(')'))
                    .and_then(|s| s.split_once(','))
                    .filter(|(p, s)| {
                        !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) && {
                            let scale = s.trim_start_matches(char::is_whitespace);
                            let digits = scale.strip_prefix('-').unwrap_or(scale);
                            !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
                        }
                    })
                {
                    let precision = precision_text.parse::<f64>().unwrap_or(f64::INFINITY);
                    let scale = scale_text
                        .trim_start_matches(char::is_whitespace)
                        .parse::<f64>()
                        .unwrap_or(f64::NAN);
                    if precision < 1.0 || precision > 38.0 || scale < 0.0 || scale > precision {
                        add(
                            ds,
                            "DELTA_DECIMAL_RANGE",
                            path,
                            "Decimal parameters require native and protocol validation",
                        );
                    }
                } else if !ATOMIC.contains(&text.as_str()) {
                    add(ds, "DELTA_UNKNOWN_TYPE", path, "Type spelling is outside the declared protocol vocabulary; native parser acceptance is insufficient");
                }
                if matches!(text.as_str(), "timestamp_ntz" | "variant") {
                    add(ds, "DELTA_FEATURE_REQUIRED", path, "Type requires matching table protocol/features; schema-only import cannot verify them");
                }
                if text == "void" {
                    add(ds, "DELTA_VOID_WRITE_CONTEXT", path, "Void storage omission and write restrictions require the surrounding table schema");
                }
            }
            Value::Object(fields) => {
                let kind = field(fields, "type").and_then(|v| {
                    if let Value::String(s) = v {
                        s.to_utf8().ok()
                    } else {
                        None
                    }
                });
                match kind.as_deref() {
                    Some("struct") => {
                        unknown(fields, &["type", "fields"], path, ds);
                        let mut names: Vec<String> = Vec::new();
                        if let Some(Value::Array(items)) = field(fields, "fields") {
                            for (index, item) in items.iter().enumerate() {
                                let at = child(
                                    &child(path, &Utf16::from("fields")),
                                    &Utf16::from(index.to_string()),
                                );
                                if let Value::Object(field_fields) = item {
                                    unknown(
                                        field_fields,
                                        &["name", "type", "nullable", "metadata"],
                                        &at,
                                        ds,
                                    );
                                    if let Some(Value::String(name)) = field(field_fields, "name") {
                                        let folded =
                                            name.to_utf8().unwrap_or_default().to_lowercase();
                                        if names.contains(&folded) {
                                            add(ds, "DELTA_DUPLICATE_NAME", &child(&at, &Utf16::from("name")), "Case-insensitive duplicate name; preserved source is not a valid Delta table schema");
                                        }
                                        names.push(folded);
                                    }
                                    if let Some(nested) = field(field_fields, "type") {
                                        walk(nested, &child(&at, &Utf16::from("type")), ds);
                                    }
                                    if let Some(Value::Object(metadata)) =
                                        field(field_fields, "metadata")
                                    {
                                        for (key, _) in metadata {
                                            add(ds, "DELTA_METADATA_UNVERIFIED", &child(&child(&at, &Utf16::from("metadata")), key), "Column metadata retained exactly; constraints, identity, mapping and defaults are not executed or validated against table context");
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some("array") => {
                        unknown(fields, &["type", "elementType", "containsNull"], path, ds);
                        if let Some(nested) = field(fields, "elementType") {
                            walk(nested, &child(path, &Utf16::from("elementType")), ds);
                        }
                    }
                    Some("map") => {
                        unknown(
                            fields,
                            &["type", "keyType", "valueType", "valueContainsNull"],
                            path,
                            ds,
                        );
                        if let Some(nested) = field(fields, "keyType") {
                            walk(nested, &child(path, &Utf16::from("keyType")), ds);
                        }
                        if let Some(nested) = field(fields, "valueType") {
                            walk(nested, &child(path, &Utf16::from("valueType")), ds);
                        }
                        if field(fields, "valueContainsNull").is_none() {
                            add(ds, "DELTA_DEFAULT_NULLABILITY", path, "Native parser may insert valueContainsNull=true; source absence is retained");
                        }
                    }
                    _ => add(
                        ds,
                        "DELTA_UNKNOWN_TYPE",
                        path,
                        "Unknown object-form type retained without interpreting or executing it",
                    ),
                }
            }
            _ => {}
        }
    }
    walk(root, &Utf16::default(), diagnostics);
}

// The pinned datatype grammar currently expresses object/array/string/boolean
// shape only. This projection maps number tokens to 0.0, so `new()` rejects
// any numeric type assertion or numeric-valued assertion/bound before this
// function can be used for validation. NativeJsonTree remains authoritative.
fn shape_view(
    node: &crate::native_json::NativeJsonNode,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    use crate::native_json::NativeJsonNode as N;
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        N::Null => Value::Null,
        N::Boolean(value) => Value::Bool(*value),
        N::String(value) => Value::String(value.clone()),
        N::Number(_) => Value::Number(0.0),
        N::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| shape_view(item, ctx))
                .collect::<Result<_, _>>()?,
        ),
        N::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, value)| Ok((key.clone(), shape_view(value, ctx)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

fn validate_document(
    document: &Value,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut capabilities = DeltaCapabilities {
        grammar: &resources.grammar,
    };
    resources
        .engine
        .validate_document(document, &resources.registry, &mut capabilities, ctx)
}

pub fn import_delta_schema(
    source: &[u16],
    id: &Utf16,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::parse_json(source, ctx)?;
    let document = document(id, tree.tagged_value_preserving_extras(ctx)?, ctx)?;
    let validation = validate_document(&document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("DELTA_DOCUMENT", &validation, ctx)?);
    }
    Ok(document)
}

/// Inspect a validated Delta schema document and return its ordered
/// structural and semantic diagnostics without changing the native source.
pub fn inspect_delta_schema(
    document: &Value,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate_document(document, resources, ctx)
}

pub fn export_delta_schema(
    document: &Value,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let validation = validate_document(document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("DELTA_DOCUMENT", &validation, ctx)?);
    }
    if validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("DELTA_REPRESENTATION"))
    {
        return Err(err(
            "DELTA_EXPORT",
            "Unknown representation fields cannot be discarded",
        ));
    }
    payload_tree(document, ctx)?.render_compact(ctx)
}

pub fn get_delta_node(
    document: &Value,
    pointer: &Utf16,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let tree = payload_tree_validated(document, resources, ctx)?;
    tree.subtree_clone(pointer, ctx)
}

pub fn propose_delta_node_edit(
    document: &Value,
    pointer: &Utf16,
    replacement: &[u16],
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let mut tree = payload_tree_validated(document, resources, ctx)?;
    // Preserve predecessor error order: validate the pointer before parsing
    // replacement text, then validate the copied candidate.
    native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement, ctx)?;
    tree = tree.replace_node(pointer, &replacement, ctx)?;
    let tagged = tree.tagged_value_preserving_extras(ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    set_payload_root(&mut candidate, tagged)?;
    let validation = validate_document(&candidate, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("DELTA_DOCUMENT", &validation, ctx)?);
    }
    Ok((candidate, validation))
}

fn payload_tree_validated(
    document: &Value,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let validation = validate_document(document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("DELTA_DOCUMENT", &validation, ctx)?);
    }
    payload_tree(document, ctx)
}

fn payload_tree(document: &Value, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    let payload = find_payload(document)
        .ok_or_else(|| err("DELTA_PAYLOAD", "Expected pinned Delta schema payload"))?;
    let fields = object(payload)
        .ok_or_else(|| err("DELTA_PAYLOAD", "Expected pinned Delta schema payload"))?;
    if field(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
        return Err(err("DELTA_PAYLOAD", "Expected pinned Delta schema payload"));
    }
    NativeJsonTree::from_tagged_value(
        field(fields, "root")
            .ok_or_else(|| err("DELTA_PAYLOAD", "Expected pinned Delta schema payload"))?,
        ctx,
    )
}

fn find_payload(document: &Value) -> Option<&Value> {
    let modules = array(field(object(document)?, "modules")?)?;
    for module in modules {
        let mf = object(module)?;
        if field(mf, "id") == Some(&Value::string_utf8("schema")) {
            for element in array(field(mf, "elements")?)? {
                let ef = object(element)?;
                if field(ef, "id") == Some(&Value::string_utf8("schema")) {
                    if let Some(payload) = field(object(field(ef, "extensions")?)?, EXT) {
                        return Some(payload);
                    }
                }
            }
        }
    }
    None
}

fn document(id: &Utf16, tagged: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let payload = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("root"), tagged),
    ]);
    let ext = Value::Object(vec![(Utf16::from(EXT), payload)]);
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("extensions"), ext),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("namespace"), Value::string_utf8("")),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    let doc = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8(CORE_VERSION)),
        (Utf16::from("id"), Value::String(id.clone())),
        (
            Utf16::from("vocabularies"),
            Value::Object(vec![(
                Utf16::from(EXT),
                Value::Object(vec![(
                    Utf16::from("version"),
                    Value::string_utf8(EXT_VERSION),
                )]),
            )]),
        ),
        (Utf16::from("modules"), Value::Array(vec![module])),
    ]);
    copy_json(&doc, ctx)
}

fn set_payload_root(document: &mut Value, tagged: Value) -> Result<(), EngineError> {
    let Value::Object(doc) = document else {
        return Err(err("DELTA_PAYLOAD", "Document root must be an object"));
    };
    let modules = field_mut(doc, "modules")
        .and_then(as_array_mut)
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document schema module is missing"))?;
    let module = modules
        .iter_mut()
        .find(|v| field(object(v).unwrap_or(&[]), "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document schema module is missing"))?;
    let elements = field_mut(object_mut(module).unwrap(), "elements")
        .and_then(as_array_mut)
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document schema element is missing"))?;
    let element = elements
        .iter_mut()
        .find(|v| field(object(v).unwrap_or(&[]), "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document schema element is missing"))?;
    let ext = field_mut(object_mut(element).unwrap(), "extensions")
        .and_then(as_object_mut)
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document extensions are missing"))?;
    let payload = field_mut(ext, EXT)
        .and_then(as_object_mut)
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document schema payload is missing"))?;
    let root = field_mut(payload, "root")
        .ok_or_else(|| err("DELTA_PAYLOAD", "Document schema payload root is missing"))?;
    *root = tagged;
    Ok(())
}

fn diagnostic(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: Utf16::from(path),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn validation_error(
    code: &str,
    validation: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let mut message = String::from("[");
    for (index, diagnostic) in validation.diagnostics.iter().enumerate() {
        if index > 0 {
            message.push(',');
        }
        message.push_str("{\"code\":");
        json_quote(&mut message, &diagnostic.code);
        message.push_str(",\"path\":");
        json_quote(&mut message, &diagnostic.path);
        if diagnostic.code == Utf16::from("DELTA_CONTEXT_UNVERIFIED") {
            message.push_str(",\"severity\":\"warning\",\"message\":");
            json_quote(&mut message, &diagnostic.message);
        } else {
            message.push_str(",\"message\":");
            json_quote(&mut message, &diagnostic.message);
            message.push_str(if diagnostic.severity == Severity::Warning {
                ",\"severity\":\"warning\""
            } else {
                ",\"severity\":\"error\""
            });
        }
        message.push('}');
    }
    message.push(']');
    let units = message.encode_utf16().count();
    ctx.charge_text(units, Utf16::default())?;
    Ok(EngineError::new(code, Utf16::default(), message))
}
fn json_quote(output: &mut String, value: &Utf16) {
    output.push('"');
    for unit in value.units() {
        match *unit {
            0x22 => output.push_str("\\\""),
            0x5c => output.push_str("\\\\"),
            0x08 => output.push_str("\\b"),
            0x0c => output.push_str("\\f"),
            0x0a => output.push_str("\\n"),
            0x0d => output.push_str("\\r"),
            0x09 => output.push_str("\\t"),
            0x00..=0x1f => output.push_str(&format!("\\u{unit:04x}")),
            0xd800..=0xdfff => output.push_str(&format!("\\u{unit:04x}")),
            _ => output.push(char::from_u32(*unit as u32).unwrap()),
        }
    }
    output.push('"');
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(fields) = value {
        Some(fields)
    } else {
        None
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(items) = value {
        Some(items)
    } else {
        None
    }
}
fn field<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    if let Value::Object(fields) = value {
        Some(fields)
    } else {
        None
    }
}
fn as_object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    object_mut(value)
}
fn as_array_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(items) = value {
        Some(items)
    } else {
        None
    }
}
fn field_mut<'a>(fields: &'a mut [(Utf16, Value)], key: &str) -> Option<&'a mut Value> {
    fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}

#[cfg(test)]
mod tests {
    use super::ensure_shape_only_numeric_rules;
    use crate::value::{Utf16, Value};

    #[test]
    fn shape_view_rejects_future_numeric_constraints() {
        let numeric_type =
            Value::Object(vec![(Utf16::from("type"), Value::string_utf8("integer"))]);
        assert_eq!(
            ensure_shape_only_numeric_rules(&numeric_type)
                .unwrap_err()
                .code,
            "DELTA_GRAMMAR_NUMERIC_RULE"
        );
        let bound = Value::Object(vec![(Utf16::from("minimum"), Value::Number(0.0))]);
        assert_eq!(
            ensure_shape_only_numeric_rules(&bound).unwrap_err().code,
            "DELTA_GRAMMAR_NUMERIC_RULE"
        );
        let enum_value = Value::Object(vec![(
            Utf16::from("enum"),
            Value::Array(vec![Value::Number(1.0)]),
        )]);
        assert_eq!(
            ensure_shape_only_numeric_rules(&enum_value)
                .unwrap_err()
                .code,
            "DELTA_GRAMMAR_NUMERIC_RULE"
        );
        assert!(ensure_shape_only_numeric_rules(&Value::Object(vec![(
            Utf16::from("type"),
            Value::string_utf8("object")
        )]))
        .is_ok());
    }
}
