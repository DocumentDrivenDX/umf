// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact Arrow integration-schema JSON preservation operations (CONTRACT-016).
//!
//! This module owns schema JSON only. Native IPC, array data and Arrow runtime
//! execution remain outside this profile.

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{native_pointer, NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use num_bigint::BigInt;

pub const EXTENSION: &str = "umf.arrow";
const PROFILE: &str = "arrow-integration-schema";
const TOKEN: u64 = 0x4152_524f_5753_4301;

pub struct ArrowSchemaResources {
    engine: Engine,
    registry: Registry,
    grammar: CompiledSchema,
    manifest: Value,
}

impl ArrowSchemaResources {
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
            include_str!("../../../spec/extensions/arrow/package.json"),
            ctx,
        )?;
        let grammar_value = resource(
            include_str!("../../../spec/extensions/arrow/integration-schema.json"),
            ctx,
        )?;
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

struct ArrowCapabilities<'a> {
    grammar: &'a CompiledSchema,
}
impl Capabilities for ArrowCapabilities<'_> {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        _: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN {
            return Ok(Vec::new());
        }
        let mut ds = vec![
            diag("ARROW_NATIVE_UNVERIFIED", "", "Schema JSON preservation does not establish IPC, dictionary-data, extension-type or record-batch validity", Severity::Warning),
        ];
        let Some(fields) = object(payload) else {
            return Ok(vec![diag(
                "ARROW_PAYLOAD",
                "",
                "Payload must be an object",
                Severity::Error,
            )]);
        };
        if field(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
            return Ok(vec![diag(
                "ARROW_PAYLOAD",
                "",
                "Expected Arrow integration schema payload",
                Severity::Error,
            )]);
        }
        let Some(root) = field(fields, "root") else {
            return Ok(vec![diag(
                "ARROW_PAYLOAD",
                "",
                "Schema root is missing",
                Severity::Error,
            )]);
        };
        if fields.iter().any(|(k, _)| {
            !["profile", "root"]
                .iter()
                .any(|known| k == &Utf16::from(*known))
        }) {
            ds.push(diag(
                "ARROW_REPRESENTATION",
                "",
                "Unknown representation fields must stay in UMF",
                Severity::Warning,
            ));
        }
        tagged_extras(root, &Utf16::from("/root"), &mut ds);
        let native =
            NativeJsonTree::from_tagged_value(root, ctx).map_err(CapabilityError::Engine)?;
        let view = shape_view(native.root(), ctx).map_err(CapabilityError::Engine)?;
        for issue in self
            .grammar
            // The TypeScript predecessor uses Ajv's ordered all-errors
            // presentation. The compiler presentation path pins that
            // keyword/branch traversal for the ECMAScript schema profile.
            .validate_codegen_errors(&view, ctx)
            .map_err(CapabilityError::Engine)?
        {
            let message = match issue.message.to_utf8().as_deref() {
                Ok("must be equal to constant") => {
                    "must pass \"const\" keyword validation".to_owned()
                }
                Ok("must be equal to one of the allowed values") => {
                    "must pass \"enum\" keyword validation".to_owned()
                }
                _ => issue.message.to_utf8().unwrap_or_default(),
            };
            ds.push(Diagnostic {
                code: Utf16::from("ARROW_STRUCTURE"),
                path: issue.instance_path,
                python_source_path: false,
                message: Utf16::from(message),
                severity: Severity::Error,
                python_text_origin: None,
            });
        }
        if ds.iter().any(|d| d.severity == Severity::Error) {
            return Ok(ds);
        }
        inspect_native(native.root(), &mut ds);
        Ok(ds)
    }
}

pub fn inspect_arrow(
    document: &Value,
    resources: &ArrowSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut capabilities = ArrowCapabilities {
        grammar: &resources.grammar,
    };
    resources
        .engine
        .validate_document(document, &resources.registry, &mut capabilities, ctx)
}

pub fn import_arrow_schema(
    source: &[u16],
    id: &Utf16,
    resources: &ArrowSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::parse_json(source, ctx)?;
    let doc = make_document(id, tree.tagged_value_preserving_extras(ctx)?, ctx)?;
    let checked = inspect_arrow(&doc, resources, ctx)?;
    if !checked.valid {
        return Err(validation_error("ARROW_DOCUMENT", &checked, ctx)?);
    }
    Ok(doc)
}

pub fn export_arrow_schema(
    document: &Value,
    resources: &ArrowSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = inspect_arrow(document, resources, ctx)?;
    if !checked.valid {
        return Err(validation_error("ARROW_DOCUMENT", &checked, ctx)?);
    }
    if checked
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("ARROW_REPRESENTATION"))
    {
        return Err(err(
            "ARROW_EXPORT",
            "Unknown representation fields cannot be discarded",
        ));
    }
    payload_tree(document, ctx)?.render_compact(ctx)
}

pub fn get_arrow_node(
    document: &Value,
    pointer: &Utf16,
    resources: &ArrowSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let checked = inspect_arrow(document, resources, ctx)?;
    if !checked.valid {
        return Err(validation_error("ARROW_DOCUMENT", &checked, ctx)?);
    }
    payload_tree(document, ctx)?.subtree_clone(pointer, ctx)
}

pub fn propose_arrow_node_edit(
    document: &Value,
    pointer: &Utf16,
    replacement: &[u16],
    resources: &ArrowSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let checked = inspect_arrow(document, resources, ctx)?;
    if !checked.valid {
        return Err(validation_error("ARROW_DOCUMENT", &checked, ctx)?);
    }
    native_pointer(pointer, ctx)?;
    let tree = payload_tree(document, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement, ctx)?;
    let edited = tree.replace_node(pointer, &replacement, ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    set_root(&mut candidate, edited.tagged_value_preserving_extras(ctx)?)?;
    let result = inspect_arrow(&candidate, resources, ctx)?;
    if !result.valid {
        return Err(validation_error("ARROW_DOCUMENT", &result, ctx)?);
    }
    Ok((candidate, result))
}

fn shape_view(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        NativeJsonNode::Null => Value::Null,
        NativeJsonNode::Boolean(v) => Value::Bool(*v),
        NativeJsonNode::String(v) => Value::String(v.clone()),
        // Match a JavaScript JSON.parse number view for grammar-only checking;
        // NativeJsonTree remains authoritative for the exact source lexeme.
        NativeJsonNode::Number(token) => {
            // Grammar validation needs only the host number type here. Exact
            // range/integrality checks use the NativeJsonTree lexeme below;
            // a finite placeholder lets JSON.parse-style overflow lexemes
            // reach those semantic diagnostics instead of failing admission.
            Value::Number(
                token
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .unwrap_or(0.0),
            )
        }
        NativeJsonNode::Array(a) => Value::Array(
            a.iter()
                .map(|v| shape_view(v, ctx))
                .collect::<Result<_, _>>()?,
        ),
        NativeJsonNode::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| Ok((k.clone(), shape_view(v, ctx)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

fn inspect_native(root: &NativeJsonNode, ds: &mut Vec<Diagnostic>) {
    unknown(root, &["fields", "metadata"], &Utf16::default(), ds);
    if let Some(metadata) = get(root, "metadata") {
        inspect_metadata(metadata, &Utf16::from("/metadata"), ds);
    }
    if let Some(fields) = get(root, "fields").and_then(array_node) {
        for (i, field) in fields.iter().enumerate() {
            inspect_field(
                field,
                &child(&Utf16::from("/fields"), &Utf16::from(i.to_string())),
                ds,
            );
        }
    }
}

fn inspect_field(field: &NativeJsonNode, path: &Utf16, ds: &mut Vec<Diagnostic>) {
    unknown(
        field,
        &[
            "name",
            "nullable",
            "type",
            "children",
            "metadata",
            "dictionary",
        ],
        path,
        ds,
    );
    if let Some(metadata) = get(field, "metadata") {
        inspect_metadata(metadata, &child(path, &Utf16::from("metadata")), ds);
    }
    let type_node = get(field, "type");
    let type_name = type_node
        .and_then(|node| get(node, "name"))
        .and_then(as_text);
    let type_path = child(path, &Utf16::from("type"));
    if let Some(ty) = type_node {
        if let Some(name) = type_name.as_deref() {
            if let Some(keys) = type_keys(name) {
                unknown(ty, keys, &type_path, ds);
                if let Some(members) = object_members(ty) {
                    for (key, value) in members {
                        if type_integer_keys(name)
                            .iter()
                            .any(|known| key == &Utf16::from(*known))
                        {
                            exact_integer_diagnostic(value, &child(&type_path, key), ds);
                        }
                    }
                }
                if let Some(ids) = get(ty, "typeIds").and_then(array_node) {
                    for (i, id) in ids.iter().enumerate() {
                        exact_integer_diagnostic(
                            id,
                            &child(
                                &child(&type_path, &Utf16::from("typeIds")),
                                &Utf16::from(i.to_string()),
                            ),
                            ds,
                        );
                    }
                }
            } else {
                ds.push(diag(
                    "ARROW_UNKNOWN_TYPE",
                    &type_path.to_utf8().unwrap_or_default(),
                    "Future or unrecognized Arrow type retained",
                    Severity::Warning,
                ));
            }
        }
    }
    let children = get(field, "children").and_then(array_node);
    let child_count = children.map_or(0, |items| items.len());
    let name = type_name.as_deref().unwrap_or("");
    if [
        "list",
        "largelist",
        "listview",
        "largelistview",
        "fixedsizelist",
        "map",
    ]
    .contains(&name)
        && child_count != 1
    {
        semantic_error(
            ds,
            "ARROW_CHILDREN",
            &child(path, &Utf16::from("children")),
            "This native type requires one child field",
        );
    }
    if name == "runendencoded" && child_count != 2 {
        semantic_error(
            ds,
            "ARROW_CHILDREN",
            &child(path, &Utf16::from("children")),
            "Run-end encoding requires run-ends and values children",
        );
    }
    if type_keys(name).is_some()
        && ![
            "list",
            "largelist",
            "listview",
            "largelistview",
            "fixedsizelist",
            "map",
            "struct",
            "struct_",
            "union",
            "runendencoded",
        ]
        .contains(&name)
        && child_count != 0
    {
        semantic_error(
            ds,
            "ARROW_CHILDREN",
            &child(path, &Utf16::from("children")),
            "Primitive type cannot have child fields",
        );
    }
    if name == "map" {
        let entries = children.and_then(|items| items.first());
        let entry_fields = entries
            .and_then(|entry| get(entry, "children"))
            .and_then(array_node);
        let valid = entries.is_some_and(|entry| {
            is_false(get(entry, "nullable"))
                && get(entry, "type")
                    .and_then(|t| get(t, "name"))
                    .and_then(as_text)
                    .is_some_and(|n| n == "struct" || n == "struct_")
                && entry_fields.is_some_and(|members| {
                    members.len() == 2 && is_false(get(&members[0], "nullable"))
                })
        });
        if !valid {
            semantic_error(
                ds,
                "ARROW_MAP",
                &child(path, &Utf16::from("children")),
                "Map requires non-null entries struct with two children and non-null key",
            );
        }
    }
    if name == "runendencoded" {
        let run = children.and_then(|items| items.first());
        let run_type = run.and_then(|r| get(r, "type"));
        let valid = run.is_some_and(|r| is_false(get(r, "nullable")))
            && run_type
                .and_then(|t| get(t, "name"))
                .and_then(as_text)
                .is_some_and(|n| n == "int")
            && run_type
                .and_then(|t| get(t, "isSigned"))
                .is_some_and(|v| matches!(v, NativeJsonNode::Boolean(true)))
            && run_type
                .and_then(|t| get(t, "bitWidth"))
                .and_then(exact_node_integer)
                .is_some_and(|v| [16, 32, 64].iter().any(|n| v == BigInt::from(*n)));
        if !valid {
            semantic_error(
                ds,
                "ARROW_RUN_ENDS",
                &child(&child(path, &Utf16::from("children")), &Utf16::from("0")),
                "Run ends must be non-null signed int16/int32/int64",
            );
        }
    }
    if name == "union" {
        let id_count = get(type_node.unwrap(), "typeIds")
            .and_then(array_node)
            .map_or(0, |items| items.len());
        if id_count != child_count {
            semantic_error(
                ds,
                "ARROW_UNION",
                &child(&type_path, &Utf16::from("typeIds")),
                "Union type IDs must correspond to children",
            );
        }
    }
    if name == "time" {
        let unit = type_node
            .and_then(|t| get(t, "unit"))
            .and_then(as_text)
            .unwrap_or_default();
        let expected = if unit == "SECOND" || unit == "MILLISECOND" {
            32
        } else {
            64
        };
        if type_node
            .and_then(|t| get(t, "bitWidth"))
            .and_then(exact_node_integer)
            != Some(BigInt::from(expected))
        {
            semantic_error(
                ds,
                "ARROW_TIME",
                &type_path,
                "Time unit and bit width disagree",
            );
        }
    }
    if name == "decimal" {
        let width = type_node
            .and_then(|t| get(t, "bitWidth"))
            .and_then(exact_node_integer)
            .unwrap_or_else(|| BigInt::from(128));
        let precision = type_node
            .and_then(|t| get(t, "precision"))
            .and_then(exact_node_integer);
        let max = if width == BigInt::from(32) {
            9
        } else if width == BigInt::from(64) {
            18
        } else if width == BigInt::from(256) {
            76
        } else {
            38
        };
        if precision.is_some_and(|p| p > BigInt::from(max)) {
            semantic_error(
                ds,
                "ARROW_DECIMAL",
                &type_path,
                "Decimal precision exceeds its bit width",
            );
        }
    }
    if let Some(dictionary) = get(field, "dictionary") {
        let dict_path = child(path, &Utf16::from("dictionary"));
        let id_path = child(&dict_path, &Utf16::from("id"));
        let id = get(dictionary, "id").and_then(exact_node_integer);
        let min = BigInt::parse_bytes(b"-9223372036854775808", 10).unwrap();
        let max = BigInt::parse_bytes(b"9223372036854775807", 10).unwrap();
        if id.as_ref().is_none_or(|v| v < &min || v > &max) {
            semantic_error(
                ds,
                "ARROW_DICTIONARY_ID",
                &id_path,
                "Dictionary IDs must be exact signed 64-bit integers",
            );
        }
        unknown(
            dictionary,
            &["id", "indexType", "isOrdered"],
            &dict_path,
            ds,
        );
        if let Some(index) = get(dictionary, "indexType") {
            let index_path = child(&dict_path, &Utf16::from("indexType"));
            unknown(index, &["name", "bitWidth", "isSigned"], &index_path, ds);
            if let Some(width) = get(index, "bitWidth") {
                exact_integer_diagnostic(width, &child(&index_path, &Utf16::from("bitWidth")), ds);
            }
        }
    }
    if let Some(children) = children {
        for (i, item) in children.iter().enumerate() {
            inspect_field(
                item,
                &child(
                    &child(path, &Utf16::from("children")),
                    &Utf16::from(i.to_string()),
                ),
                ds,
            );
        }
    }
}

fn inspect_metadata(node: &NativeJsonNode, path: &Utf16, ds: &mut Vec<Diagnostic>) {
    let Some(entries) = array_node(node) else {
        return;
    };
    let mut seen = Vec::<Utf16>::new();
    for (i, entry) in entries.iter().enumerate() {
        let item_path = child(path, &Utf16::from(i.to_string()));
        unknown(entry, &["key", "value"], &item_path, ds);
        if let Some(NativeJsonNode::String(key)) = get(entry, "key") {
            if seen.contains(key) {
                ds.push(diag(
                    "ARROW_DUPLICATE_METADATA",
                    &item_path.to_utf8().unwrap_or_default(),
                    "Ordered duplicate metadata retained; native Map conversion may collapse it",
                    Severity::Warning,
                ));
            }
            seen.push(key.clone());
        }
    }
}

fn type_keys(name: &str) -> Option<&'static [&'static str]> {
    Some(match name {
        "null" | "NONE" | "bool" | "binary" | "largebinary" | "binaryview" | "utf8"
        | "largeutf8" | "utf8view" | "list" | "largelist" | "listview" | "largelistview"
        | "struct" | "struct_" | "runendencoded" => &["name"],
        "int" => &["name", "bitWidth", "isSigned"],
        "floatingpoint" => &["name", "precision"],
        "decimal" => &["name", "bitWidth", "precision", "scale"],
        "date" | "interval" => &["name", "unit"],
        "time" => &["name", "unit", "bitWidth"],
        "timestamp" => &["name", "unit", "timezone"],
        "duration" => &["name", "unit"],
        "fixedsizebinary" => &["name", "byteWidth"],
        "fixedsizelist" => &["name", "listSize"],
        "map" => &["name", "keysSorted"],
        "union" => &["name", "mode", "typeIds"],
        _ => return None,
    })
}
fn type_integer_keys(name: &str) -> &'static [&'static str] {
    match name {
        "int" | "time" => &["bitWidth"],
        "decimal" => &["bitWidth", "precision", "scale"],
        "fixedsizebinary" => &["byteWidth"],
        "fixedsizelist" => &["listSize"],
        _ => &[],
    }
}
fn unknown(node: &NativeJsonNode, known: &[&str], path: &Utf16, ds: &mut Vec<Diagnostic>) {
    for (key, _) in object_members(node).unwrap_or_default() {
        if !known.iter().any(|name| key == &Utf16::from(*name)) {
            ds.push(diag(
                "ARROW_UNKNOWN",
                &child(path, key).to_utf8().unwrap_or_default(),
                "Native content retained without interpretation",
                Severity::Warning,
            ));
        }
    }
}
fn exact_integer_diagnostic(node: &NativeJsonNode, path: &Utf16, ds: &mut Vec<Diagnostic>) {
    if exact_node_integer(node).is_none() {
        semantic_error(
            ds,
            "ARROW_INTEGER",
            path,
            "Known integer parameter must be exact, not a rounded host value",
        );
    }
}
fn exact_node_integer(node: &NativeJsonNode) -> Option<BigInt> {
    if let NativeJsonNode::Number(token) = node {
        exact_integer(token)
    } else {
        None
    }
}
fn exact_integer(token: &str) -> Option<BigInt> {
    let bytes = token.as_bytes();
    let mut pos = 0;
    let negative = bytes.first() == Some(&b'-');
    if negative {
        pos += 1;
    }
    let start = pos;
    while bytes.get(pos).is_some_and(u8::is_ascii_digit) {
        pos += 1;
    }
    if pos == start {
        return None;
    }
    let int = &token[start..pos];
    let mut frac = "";
    if bytes.get(pos) == Some(&b'.') {
        pos += 1;
        let begin = pos;
        while bytes.get(pos).is_some_and(u8::is_ascii_digit) {
            pos += 1;
        }
        if pos == begin {
            return None;
        }
        frac = &token[begin..pos];
    }
    let mut exponent = 0i64;
    if matches!(bytes.get(pos), Some(b'e' | b'E')) {
        pos += 1;
        let begin = pos;
        if matches!(bytes.get(pos), Some(b'+' | b'-')) {
            pos += 1;
        }
        let digits = pos;
        while bytes.get(pos).is_some_and(u8::is_ascii_digit) {
            pos += 1;
        }
        if digits == pos {
            return None;
        }
        exponent = token[begin..pos].parse().ok()?;
    }
    if pos != bytes.len() {
        return None;
    }
    let mut digits = format!("{int}{frac}");
    let significant = digits.trim_start_matches('0');
    if significant.is_empty() {
        return Some(BigInt::from(0));
    }
    digits = significant.to_owned();
    let scale = i64::try_from(frac.len()).ok()?.checked_sub(exponent)?;
    if scale > 0 {
        let n = usize::try_from(scale).ok()?;
        if n >= digits.len() || !digits[digits.len() - n..].bytes().all(|c| c == b'0') {
            return None;
        }
        digits.truncate(digits.len() - n);
    } else if scale < 0 {
        let n = usize::try_from(scale.checked_neg()?).ok()?;
        if digits.len().checked_add(n)? > 19 {
            return None;
        }
        digits.extend(std::iter::repeat('0').take(n));
    }
    if digits.len() > 19 {
        return None;
    }
    let value = BigInt::parse_bytes(digits.as_bytes(), 10)?;
    Some(if negative { -value } else { value })
}
fn semantic_error(ds: &mut Vec<Diagnostic>, code: &str, path: &Utf16, message: &str) {
    ds.push(Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        python_source_path: false,
        message: Utf16::from(message),
        severity: Severity::Error,
        python_text_origin: None,
    });
}
fn get<'a>(node: &'a NativeJsonNode, key: &str) -> Option<&'a NativeJsonNode> {
    object_members(node)?
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn object_members(node: &NativeJsonNode) -> Option<&[(Utf16, NativeJsonNode)]> {
    if let NativeJsonNode::Object(items) = node {
        Some(items)
    } else {
        None
    }
}
fn array_node(node: &NativeJsonNode) -> Option<&[NativeJsonNode]> {
    match node {
        NativeJsonNode::Array(items) => Some(items),
        _ => None,
    }
}
fn as_text(node: &NativeJsonNode) -> Option<String> {
    if let NativeJsonNode::String(text) = node {
        text.to_utf8().ok()
    } else {
        None
    }
}
fn is_false(node: Option<&NativeJsonNode>) -> bool {
    matches!(node, Some(NativeJsonNode::Boolean(false)))
}

fn tagged_extras(value: &Value, path: &Utf16, ds: &mut Vec<Diagnostic>) {
    let Some(fields) = object(value) else { return };
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
    if fields
        .iter()
        .any(|(k, _)| !allowed.iter().any(|x| k == &Utf16::from(*x)))
    {
        ds.push(diag(
            "ARROW_REPRESENTATION",
            &path.to_utf8().unwrap_or_default(),
            "Unknown tagged-tree fields must remain in UMF",
            Severity::Warning,
        ));
    }
    if kind.as_deref() == Some("object") {
        if let Some(Value::Object(m)) = field(fields, "members") {
            for (k, v) in m {
                tagged_extras(v, &child(path, k), ds)
            }
        }
    }
    if kind.as_deref() == Some("array") {
        if let Some(Value::Array(a)) = field(fields, "items") {
            for (i, v) in a.iter().enumerate() {
                tagged_extras(v, &child(path, &Utf16::from(i.to_string())), ds)
            }
        }
    }
}
fn child(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut u = path.units().to_vec();
    u.push(b'/' as u16);
    for c in key.units() {
        match c {
            0x7e => u.extend([b'~' as u16, b'0' as u16]),
            0x2f => u.extend([b'~' as u16, b'1' as u16]),
            v => u.push(*v),
        }
    }
    Utf16::new(u)
}
fn payload_tree(doc: &Value, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    let p =
        find_payload(doc).ok_or_else(|| err("ARROW_PAYLOAD", "Expected Arrow schema payload"))?;
    let f = object(p).ok_or_else(|| err("ARROW_PAYLOAD", "Payload must be an object"))?;
    if field(f, "profile") != Some(&Value::string_utf8(PROFILE)) {
        return Err(err("ARROW_PAYLOAD", "Expected Arrow schema payload"));
    }
    NativeJsonTree::from_tagged_value(
        field(f, "root").ok_or_else(|| err("ARROW_PAYLOAD", "Schema root missing"))?,
        ctx,
    )
}
fn find_payload(doc: &Value) -> Option<&Value> {
    for m in array(field(object(doc)?, "modules")?)? {
        let mf = object(m)?;
        if field(mf, "id") != Some(&Value::string_utf8("schema")) {
            continue;
        }
        for e in array(field(mf, "elements")?)? {
            let ef = object(e)?;
            if field(ef, "id") == Some(&Value::string_utf8("schema")) {
                if let Some(v) = field(object(field(ef, "extensions")?)?, EXTENSION) {
                    return Some(v);
                }
            }
        }
    }
    None
}
fn make_document(id: &Utf16, root: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let payload = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("root"), root),
    ]);
    let ext = Value::Object(vec![(Utf16::from(EXTENSION), payload)]);
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("extensions"), ext),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("namespace"), Value::string_utf8("")),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    let vocab = Value::Object(vec![(
        Utf16::from(EXTENSION),
        Value::Object(vec![(Utf16::from("version"), Value::string_utf8("0.1.0"))]),
    )]);
    copy_json(
        &Value::Object(vec![
            (Utf16::from("umf"), Value::string_utf8("0.10.0")),
            (Utf16::from("id"), Value::String(id.clone())),
            (Utf16::from("vocabularies"), vocab),
            (Utf16::from("modules"), Value::Array(vec![module])),
        ]),
        ctx,
    )
}
fn set_root(doc: &mut Value, root: Value) -> Result<(), EngineError> {
    let modules = field_mut(doc, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| err("ARROW_PAYLOAD", "Schema module missing"))?;
    for m in modules {
        if field(
            object(m).ok_or_else(|| err("ARROW_PAYLOAD", "Invalid module"))?,
            "id",
        ) == Some(&Value::string_utf8("schema"))
        {
            let elems = field_mut(m, "elements")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| err("ARROW_PAYLOAD", "Schema element missing"))?;
            for e in elems {
                if field(
                    object(e).ok_or_else(|| err("ARROW_PAYLOAD", "Invalid element"))?,
                    "id",
                ) == Some(&Value::string_utf8("schema"))
                {
                    let ext = field_mut(e, "extensions")
                        .and_then(|v| {
                            if let Value::Object(o) = v {
                                Some(o)
                            } else {
                                None
                            }
                        })
                        .ok_or_else(|| err("ARROW_PAYLOAD", "Extensions missing"))?;
                    let p = field_mut_in(ext, EXTENSION)
                        .ok_or_else(|| err("ARROW_PAYLOAD", "Arrow extension missing"))?;
                    *field_mut(p, "root")
                        .ok_or_else(|| err("ARROW_PAYLOAD", "Schema root missing"))? = root;
                    return Ok(());
                }
            }
        }
    }
    Err(err("ARROW_PAYLOAD", "Schema root missing"))
}
fn field_mut_in<'a>(o: &'a mut [(Utf16, Value)], name: &str) -> Option<&'a mut Value> {
    o.iter_mut()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
}
fn object(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(o) = v {
        Some(o)
    } else {
        None
    }
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn field<'a>(o: &'a [(Utf16, Value)], n: &str) -> Option<&'a Value> {
    o.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v)
}
fn field_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(o) = v {
        field_mut_in(o, n)
    } else {
        None
    }
}
fn diag(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: Utf16::from(path),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn validation_error(
    code: &str,
    validation: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let diagnostics = Value::Array(
        validation
            .diagnostics
            .iter()
            .enumerate()
            .map(|(index, diagnostic)| {
                let code = Value::String(diagnostic.code.clone());
                let path = Value::String(diagnostic.path.clone());
                let message = Value::String(diagnostic.message.clone());
                let severity = Value::string_utf8(match diagnostic.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                });
                let fields =
                    if index == 0 && diagnostic.code == Utf16::from("ARROW_NATIVE_UNVERIFIED") {
                        vec![
                            (Utf16::from("code"), code),
                            (Utf16::from("path"), path),
                            (Utf16::from("severity"), severity),
                            (Utf16::from("message"), message),
                        ]
                    } else {
                        vec![
                            (Utf16::from("code"), code),
                            (Utf16::from("path"), path),
                            (Utf16::from("message"), message),
                            (Utf16::from("severity"), severity),
                        ]
                    };
                Value::Object(fields)
            })
            .collect(),
    );
    // TypeScript embeds JSON.stringify(diagnostics) in the error message,
    // which is compact even though the public document serializer is pretty.
    let message = serialization::stringify_compact_metered(&diagnostics, ctx)?;
    Ok(EngineError::new(code, Utf16::default(), message))
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), Utf16::from(message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn union_type_id_integer_diagnostic_uses_separate_pointer_segments() {
        let mut ctx = Context::ordinary();
        let tree = NativeJsonTree::parse_json(
            &r#"{"fields":[{"name":"u","nullable":true,"type":{"name":"union","mode":"SPARSE","typeIds":[1.5]},"children":[{"name":"x","nullable":true,"type":{"name":"int","bitWidth":32,"isSigned":true}}]}]}"#
                .encode_utf16()
                .collect::<Vec<_>>(),
            &mut ctx,
        )
        .unwrap();
        let mut diagnostics = Vec::new();
        inspect_native(tree.root(), &mut diagnostics);
        assert!(diagnostics.iter().any(|d| {
            d.code == Utf16::from("ARROW_INTEGER")
                && d.path == Utf16::from("/fields/0/type/typeIds/0")
        }));
    }
}
