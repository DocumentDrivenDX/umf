// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned Avro schema-shape projection into JSON Schema 2020-12.
//!
//! This module ports the public `projectAvroToJsonSchema` decision path. It
//! does not convert data instances or claim Avro reader/writer equivalence.
use std::collections::BTreeMap;

use crate::{
    avro_document,
    context::Context,
    error::EngineError,
    json_schema_adapter,
    native_json::{NativeJsonNode, NativeJsonTree},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const SCHEMA_DRAFT: &str = "https://json-schema.org/draft/2020-12/schema";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LossPolicy {
    Strict,
    AllowReportedLoss,
}

#[derive(Clone, Debug)]
pub struct AvroDocumentBindings {
    pub id: Utf16,
    pub schema_id: Utf16,
    pub loss_policy: LossPolicy,
}

/// Build a JSON Schema projection while retaining the original UMF source.
/// The returned `Value` matches the TypeScript AvroDocumentProjection DTO.
pub fn project_avro_to_json_schema(
    source: &Value,
    bindings: &AvroDocumentBindings,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_bindings(bindings, ctx)?;
    let inspection = avro_document::inspect_avro_document(source, ctx)?;
    if !inspection.admission.valid {
        return Err(err("AVRO_SOURCE", "Invalid Avro document"));
    }
    let native = inspection
        .native_inspection
        .ok_or_else(|| err("AVRO_SOURCE", "Avro payload is missing"))?;
    let native_valid = native.valid;
    let has_unresolved_name = native.diagnostics.iter().any(|diagnostic| {
        diagnostic
            .code
            .units()
            .iter()
            .copied()
            .eq("AVRO_UNRESOLVED_NAME".encode_utf16())
    });
    let mut state = Projection::new(ctx);
    for diagnostic in native.diagnostics {
        let fatal = [
            "AVRO_VALIDATOR_LIMIT",
            "AVRO_NUMERIC",
            "AVRO_REPRESENTATION",
        ]
        .iter()
        .any(|code| {
            diagnostic
                .code
                .units()
                .iter()
                .copied()
                .eq(code.encode_utf16())
        });
        state.issue_units(
            &diagnostic.path,
            &diagnostic.code,
            &Utf16::from("unsupported"),
            &diagnostic.message,
        )?;
        state.fatal |= fatal;
    }
    state.fatal |= !native_valid;
    if state.fatal && !has_unresolved_name {
        let source_copy = copy_json(source, state.ctx)?;
        let policy = policy_value(bindings, state.ctx)?;
        return Ok(projection_value(
            "blocked",
            source_copy,
            policy,
            Value::Array(state.issues),
            Value::Array(Vec::new()),
            None,
            None,
        ));
    }
    let bundle = match avro_document::export_bundle(source, state.ctx) {
        Ok(bundle) => bundle,
        Err(error) if error.code == "AVRO_REPRESENTATION" => {
            state.fatal = true;
            state.issue(
                &Utf16::from("/root"),
                "AVRO_REPRESENTATION",
                "unsupported",
                "Unknown Avro representation content prevents a safe projection",
            )?;
            let source_copy = copy_json(source, state.ctx)?;
            let policy = policy_value(bindings, state.ctx)?;
            return Ok(projection_value(
                "blocked",
                source_copy,
                policy,
                Value::Array(state.issues),
                Value::Array(Vec::new()),
                None,
                None,
            ));
        }
        Err(error) => return Err(error),
    };
    let root = NativeJsonTree::parse_json(bundle.schema_json.units(), state.ctx)?;
    state
        .ctx
        .charge_work(bundle.dependencies.len(), Utf16::default())?;
    let mut dependencies = Vec::with_capacity(bundle.dependencies.len());
    for (id, text) in &bundle.dependencies {
        dependencies.push((
            id.clone(),
            NativeJsonTree::parse_json(text.units(), state.ctx)?,
        ));
    }
    let root_count = dependencies.len().saturating_add(1);
    state.ctx.charge_work(root_count, Utf16::default())?;
    let mut roots = Vec::with_capacity(root_count);
    for (index, (_, tree)) in dependencies.iter().enumerate() {
        roots.push((
            tree.root(),
            child_path(
                &child_path(&Utf16::default(), "dependencies", state.ctx)?,
                &index.to_string(),
                state.ctx,
            )
            .and_then(|path| child_path(&path, "root", state.ctx))?,
        ));
    }
    roots.push((root.root(), Utf16::from("/root")));
    state.ctx.charge_work(roots.len(), Utf16::default())?;
    let mut shapes = Vec::with_capacity(roots.len());
    for (node, path) in &roots {
        state.inspect_metadata(node, path, 1)?;
    }
    for (node, path) in roots {
        shapes.push(state.shape(node, "", &path, 1)?);
    }
    let root_shape = shapes.pop().unwrap_or(Value::Object(Vec::new()));
    let defs = std::mem::take(&mut state.definitions);
    state.issue(&Utf16::default(), "SCHEMA_ONLY", "representation-change", "This projection defines a JSON instance binding; it does not convert Avro binary/JSON instances or implement reader/writer schema resolution")?;
    let blocked =
        state.fatal || (bindings.loss_policy == LossPolicy::Strict && !state.issues.is_empty());
    let source_copy = copy_json(source, state.ctx)?;
    let policy = policy_value(bindings, state.ctx)?;
    let mappings = Value::Array(std::mem::take(&mut state.mappings));
    let issues = Value::Array(std::mem::take(&mut state.issues));
    if blocked {
        return Ok(projection_value(
            "blocked",
            source_copy,
            policy,
            issues,
            mappings,
            None,
            None,
        ));
    }
    let Value::Object(mut root_fields) = root_shape else {
        return Err(err(
            "AVRO_TARGET",
            "Generated root schema must be an object",
        ));
    };
    state
        .ctx
        .charge_text(bindings.schema_id.len(), Utf16::default())?;
    let mut schema_fields = vec![
        (Utf16::from("$schema"), Value::string_utf8(SCHEMA_DRAFT)),
        (
            Utf16::from("$id"),
            Value::String(bindings.schema_id.clone()),
        ),
    ];
    state.ctx.charge_work(
        root_fields
            .len()
            .saturating_add(defs.len())
            .saturating_add(3),
        Utf16::default(),
    )?;
    schema_fields.append(&mut root_fields);
    schema_fields.push((Utf16::from("$defs"), Value::Object(defs)));
    let schema = Value::Object(schema_fields);
    let schema_text = serialization::write_json_value(&schema, Format::Json, state.ctx)?;
    let target = json_schema_adapter::import_json_schema(
        schema_text.units(),
        &bindings.id,
        &bindings.schema_id,
        &[],
        state.ctx,
    )?;
    let target_check = json_schema_adapter::inspect_json_schema(&target, state.ctx)?;
    if !target_check.valid {
        return Err(err("AVRO_TARGET", "Generated JSON Schema is invalid"));
    }
    Ok(projection_value(
        "projected",
        source_copy,
        policy,
        issues,
        mappings,
        Some(target),
        Some(Value::String(schema_text)),
    ))
}

struct Projection<'a, 'b> {
    ctx: &'a mut Context<'b>,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    names: BTreeMap<String, String>,
    definitions: Vec<(Utf16, Value)>,
    fatal: bool,
}

impl<'a, 'b> Projection<'a, 'b> {
    fn new(ctx: &'a mut Context<'b>) -> Self {
        Self {
            ctx,
            issues: Vec::new(),
            mappings: Vec::new(),
            names: BTreeMap::new(),
            definitions: Vec::new(),
            fatal: false,
        }
    }

    fn issue(
        &mut self,
        path: &Utf16,
        code: &str,
        classification: &str,
        detail: &str,
    ) -> Result<(), EngineError> {
        self.issue_units(
            path,
            &Utf16::from(code),
            &Utf16::from(classification),
            &Utf16::from(detail),
        )
    }

    fn issue_units(
        &mut self,
        path: &Utf16,
        code: &Utf16,
        classification: &Utf16,
        detail: &Utf16,
    ) -> Result<(), EngineError> {
        self.ctx.charge_text(
            path.len()
                .saturating_add(code.len())
                .saturating_add(classification.len())
                .saturating_add(detail.len())
                .saturating_add(1),
            path.clone(),
        )?;
        self.ctx.charge_work(5, path.clone())?;
        self.issues.push(object(vec![
            ("path", Value::String(path.clone())),
            ("code", Value::String(code.clone())),
            ("classification", Value::String(classification.clone())),
            ("detail", Value::String(detail.clone())),
            ("retainedInSource", Value::Bool(true)),
        ]));
        Ok(())
    }

    fn shape(
        &mut self,
        node: &NativeJsonNode,
        namespace: &str,
        path: &Utf16,
        depth: usize,
    ) -> Result<Value, EngineError> {
        if depth > self.ctx.limits().max_depth {
            return Err(err("LIMIT", "Avro projection depth exceeded"));
        }
        self.ctx.charge_work(1, path.clone())?;
        match self.shape_inner(node, namespace, path, depth) {
            Err(error) if error.code == "AVRO_UNSUPPORTED" => {
                self.fatal = true;
                self.issue_units(
                    path,
                    &Utf16::from("AVRO_UNSUPPORTED"),
                    &Utf16::from("unsupported"),
                    &error.message,
                )?;
                Ok(object(Vec::new()))
            }
            other => other,
        }
    }

    fn shape_inner(
        &mut self,
        node: &NativeJsonNode,
        namespace: &str,
        path: &Utf16,
        depth: usize,
    ) -> Result<Value, EngineError> {
        match node {
            NativeJsonNode::String(value) => {
                self.ctx.charge_text(value.len(), path.clone())?;
                let text = value.to_utf8().map_err(|_| {
                    err(
                        "AVRO_UNSUPPORTED",
                        "Avro schema name contains invalid UTF-16",
                    )
                })?;
                if let Some(schema) = self.primitive(&text, path)? {
                    return Ok(schema);
                }
                let full = qualify(&text, namespace);
                let Some(key) = self.names.get(&full) else {
                    return self.unsupported(path, "Unresolved native name");
                };
                self.ctx
                    .charge_text(key.len().saturating_add(8), path.clone())?;
                Ok(object(vec![(
                    "$ref",
                    Value::string_utf8(format!("#/$defs/{key}")),
                )]))
            }
            NativeJsonNode::Array(branches) => {
                self.issue(path, "UNION_TAGS", "representation-change", "Untagged anyOf loses Avro branch identity and order; overlapping branches cannot be recovered from JSON values alone")?;
                self.ctx.charge_work(branches.len(), path.clone())?;
                let mut schemas = Vec::with_capacity(branches.len());
                for (index, branch) in branches.iter().enumerate() {
                    let branch_path = child_path(path, &index.to_string(), self.ctx)?;
                    schemas.push(self.shape(branch, namespace, &branch_path, depth + 1)?);
                }
                Ok(object(vec![("anyOf", Value::Array(schemas))]))
            }
            NativeJsonNode::Object(members) => self.object_shape(members, namespace, path, depth),
            _ => self.unsupported(path, "Unsupported native schema node"),
        }
    }

    fn inspect_metadata(
        &mut self,
        node: &NativeJsonNode,
        path: &Utf16,
        depth: usize,
    ) -> Result<(), EngineError> {
        if depth > self.ctx.limits().max_depth {
            return Err(err("LIMIT", "Avro metadata inspection depth exceeded"));
        }
        self.ctx.charge_work(1, path.clone())?;
        match node {
            NativeJsonNode::Array(items) => {
                self.ctx.charge_work(items.len(), path.clone())?;
                for (index, item) in items.iter().enumerate() {
                    let child = child_path(path, &index.to_string(), self.ctx)?;
                    self.inspect_metadata(item, &child, depth + 1)?;
                }
            }
            NativeJsonNode::Object(members) => {
                self.ctx.charge_work(8, path.clone())?;
                let kind = member(members, "type")
                    .and_then(node_string)
                    .and_then(|value| value.to_utf8().ok());
                let mut known = vec!["type", "name", "namespace", "aliases", "doc", "logicalType"];
                match kind.as_deref() {
                    Some("record" | "error") => known.push("fields"),
                    Some("enum") => {
                        known.push("symbols");
                        known.push("default");
                    }
                    Some("fixed") => {
                        known.push("size");
                        known.push("precision");
                        known.push("scale");
                    }
                    Some("array") => known.push("items"),
                    Some("map") => known.push("values"),
                    _ => {
                        known.push("precision");
                        known.push("scale");
                    }
                }
                for (key, _) in members {
                    self.ctx.charge_text(key.len(), path.clone())?;
                    if !known
                        .iter()
                        .any(|candidate| key.units().iter().copied().eq(candidate.encode_utf16()))
                    {
                        let unknown_path = child_path_units(path, key.units(), self.ctx)?;
                        self.issue(
                            &unknown_path,
                            "AVRO_METADATA",
                            "not-enforced",
                            "Uninterpreted native metadata retained",
                        )?;
                    }
                }
                if matches!(kind.as_deref(), Some("record" | "error")) {
                    if let Some(NativeJsonNode::Array(fields)) = member(members, "fields") {
                        self.ctx.charge_work(fields.len(), path.clone())?;
                        let fields_path = child_path(path, "fields", self.ctx)?;
                        for (index, field) in fields.iter().enumerate() {
                            let field_path =
                                child_path(&fields_path, &index.to_string(), self.ctx)?;
                            if let NativeJsonNode::Object(field_members) = field {
                                for (key, _) in field_members {
                                    if !["name", "type", "default", "order", "aliases", "doc"]
                                        .iter()
                                        .any(|candidate| {
                                            key.units().iter().copied().eq(candidate.encode_utf16())
                                        })
                                    {
                                        let unknown_path =
                                            child_path_units(&field_path, key.units(), self.ctx)?;
                                        self.issue(
                                            &unknown_path,
                                            "AVRO_METADATA",
                                            "not-enforced",
                                            "Uninterpreted field metadata retained",
                                        )?;
                                    }
                                }
                                if let Some(ty) = member(field_members, "type") {
                                    let type_path = child_path(&field_path, "type", self.ctx)?;
                                    self.inspect_metadata(ty, &type_path, depth + 1)?;
                                }
                            }
                        }
                    }
                }
                for key in ["items", "values"] {
                    if let Some(child) = member(members, key) {
                        let child_path = child_path(path, key, self.ctx)?;
                        self.inspect_metadata(child, &child_path, depth + 1)?;
                    }
                }
                if let Some(child) = member(members, "type") {
                    if !matches!(child, NativeJsonNode::String(_)) {
                        let child_path = child_path(path, "type", self.ctx)?;
                        self.inspect_metadata(child, &child_path, depth + 1)?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn primitive(&mut self, name: &str, path: &Utf16) -> Result<Option<Value>, EngineError> {
        let schema = match name {
            "null" | "boolean" | "string" => Some(object(vec![("type", Value::string_utf8(name))])),
            "int" => Some(object(vec![
                ("type", Value::string_utf8("integer")),
                ("minimum", Value::Number(-2_147_483_648.0)),
                ("maximum", Value::Number(2_147_483_647.0)),
            ])),
            "long" => {
                self.issue(path, "LONG_ENCODING", "representation-change", "Long values use decimal strings; signed 64-bit bounds remain unenforced by this pattern")?;
                Some(object(vec![
                    ("type", Value::string_utf8("string")),
                    (
                        "pattern",
                        Value::string_utf8("^-?(0|[1-9][0-9]*)(?![\\s\\S])"),
                    ),
                ]))
            }
            "float" => {
                self.issue(path, "FLOAT_PRECISION", "not-enforced", "JSON numbers do not enforce binary32 rounding or represent non-finite Avro values")?;
                Some(object(vec![("type", Value::string_utf8("number"))]))
            }
            "double" => {
                self.issue(
                    path,
                    "NONFINITE_ENCODING",
                    "representation-change",
                    "JSON numbers cannot represent non-finite Avro values",
                )?;
                Some(object(vec![("type", Value::string_utf8("number"))]))
            }
            "bytes" => {
                self.issue(
                    path,
                    "BYTES_ENCODING",
                    "representation-change",
                    "Native bytes require lowercase hexadecimal string encoding",
                )?;
                Some(object(vec![
                    ("type", Value::string_utf8("string")),
                    ("pattern", Value::string_utf8("^([0-9a-f]{2})*(?![\\s\\S])")),
                ]))
            }
            _ => None,
        };
        Ok(schema)
    }

    fn object_shape(
        &mut self,
        members: &[(Utf16, NativeJsonNode)],
        namespace: &str,
        path: &Utf16,
        depth: usize,
    ) -> Result<Value, EngineError> {
        let type_node = member(members, "type");
        let Some(type_name) = type_node.and_then(node_string) else {
            return self.unsupported(path, "Unsupported native schema node");
        };
        self.ctx.charge_text(type_name.len(), path.clone())?;
        let kind = type_name
            .to_utf8()
            .map_err(|_| err("AVRO_UNSUPPORTED", "Avro type name contains invalid UTF-16"))?;
        if member(members, "logicalType").is_some() {
            let issue_path = child_path(path, "logicalType", self.ctx)?;
            self.issue(&issue_path, "LOGICAL_TYPE_UNENFORCED", "not-enforced", "Only the underlying carrier is projected; logical type interpretation, units, precision and scale remain source-owned")?;
        }
        let annotations = match member(members, "doc").and_then(node_string) {
            Some(description) => vec![("description", Value::String(description.clone()))],
            None => Vec::new(),
        };
        if matches!(kind.as_str(), "record" | "error" | "enum" | "fixed") {
            let Some(name) = member(members, "name").and_then(node_string) else {
                return self.unsupported(path, "Named Avro schema has no name");
            };
            self.ctx.charge_text(name.len(), path.clone())?;
            let name = name
                .to_utf8()
                .map_err(|_| err("AVRO_UNSUPPORTED", "Avro name contains invalid UTF-16"))?;
            let own_namespace = member(members, "namespace")
                .and_then(node_string)
                .map(|value| {
                    self.ctx.charge_text(value.len(), path.clone())?;
                    value.to_utf8().map_err(|_| {
                        err("AVRO_UNSUPPORTED", "Avro namespace contains invalid UTF-16")
                    })
                })
                .transpose()?;
            let full = qualify(&name, own_namespace.as_deref().unwrap_or(namespace));
            if self.names.contains_key(&full) {
                return self.unsupported(path, "Duplicate native declaration");
            }
            let key = format!("type_{}", self.names.len());
            self.ctx.charge_text(
                full.encode_utf16()
                    .count()
                    .saturating_add(key.len())
                    .saturating_add(1),
                path.clone(),
            )?;
            self.ctx.charge_work(4, path.clone())?;
            self.names.insert(full.clone(), key.clone());
            self.definitions.push((
                Utf16::from(key.as_str()),
                Value::Object(
                    vec![(Utf16::from("title"), Value::string_utf8(&full))]
                        .into_iter()
                        .chain(annotations.into_iter().map(|(k, v)| (Utf16::from(k), v)))
                        .collect(),
                ),
            ));
            let definition_index = self.definitions.len() - 1;
            let target_pointer = format!("/$defs/{key}");
            self.mappings.push(object(vec![
                ("name", Value::string_utf8(&full)),
                ("sourcePath", Value::String(path.clone())),
                ("targetPointer", Value::string_utf8(target_pointer)),
            ]));
            self.issue(path, "NATIVE_TYPE_IDENTITY", "not-enforced", "Native named-type identity, aliases, resolution and binary representation are not enforced by JSON shape validation")?;
            let local_namespace = full
                .rsplit_once('.')
                .map(|(ns, _)| ns)
                .unwrap_or("")
                .to_owned();
            let mut body = Vec::new();
            if kind == "record" || kind == "error" {
                let fields = match member(members, "fields") {
                    Some(NativeJsonNode::Array(fields)) => fields,
                    _ => return self.unsupported(path, "Record fields are malformed"),
                };
                self.ctx
                    .charge_work(fields.len().saturating_mul(2), path.clone())?;
                let mut properties = Value::Object(Vec::with_capacity(fields.len()));
                let mut required = Vec::with_capacity(fields.len());
                for (index, field) in fields.iter().enumerate() {
                    let NativeJsonNode::Object(field) = field else {
                        return self.unsupported(path, "Record field is malformed");
                    };
                    let name = member(field, "name")
                        .and_then(node_string)
                        .ok_or_else(|| err("AVRO_UNSUPPORTED", "Record field name is malformed"))?;
                    self.ctx.charge_text(name.len(), path.clone())?;
                    let name_text = name.to_utf8().map_err(|_| {
                        err(
                            "AVRO_UNSUPPORTED",
                            "Record field name contains invalid UTF-16",
                        )
                    })?;
                    let fields_path = child_path(path, "fields", self.ctx)?;
                    let field_path = child_path(&fields_path, &index.to_string(), self.ctx)?;
                    let type_node = member(field, "type")
                        .ok_or_else(|| err("AVRO_UNSUPPORTED", "Record field type is missing"))?;
                    let type_path = child_path(&field_path, "type", self.ctx)?;
                    let mut field_schema =
                        self.shape(type_node, &local_namespace, &type_path, depth + 1)?;
                    if let Some(description) = member(field, "doc").and_then(node_string) {
                        put_member(
                            &mut field_schema,
                            "description",
                            Value::String(description.clone()),
                            self.ctx,
                        )?;
                    }
                    put_member(&mut properties, &name_text, field_schema, self.ctx)?;
                    required.push(Value::string_utf8(&name_text));
                    if member(field, "default").is_some() {
                        let issue_path = child_path(&field_path, "default", self.ctx)?;
                        self.issue(&issue_path, "READER_DEFAULT", "not-enforced", "Avro reader-resolution default remains in source; writer field stays required and no JSON default insertion is implied")?;
                    }
                    if member(field, "order").is_some() || member(field, "aliases").is_some() {
                        self.issue(
                            &field_path,
                            "FIELD_RESOLUTION",
                            "not-enforced",
                            "Native field aliases and sort order remain in source",
                        )?;
                    }
                }
                body.push(("type", Value::string_utf8("object")));
                body.push(("properties", properties));
                body.push(("required", Value::Array(required)));
                body.push(("additionalProperties", Value::Bool(false)));
                self.issue(path, "RECORD_ENCODING", "representation-change", "All declared writer fields are required in a closed JSON object; binary field ordering and runtime extra-field behavior are not reproduced")?;
            } else if kind == "enum" {
                let symbols = match member(members, "symbols") {
                    Some(NativeJsonNode::Array(symbols)) => {
                        self.ctx.charge_work(symbols.len(), path.clone())?;
                        symbols
                            .iter()
                            .map(|s| enum_symbol(s, path, self.ctx))
                            .collect::<Result<Vec<_>, _>>()?
                    }
                    _ => return self.unsupported(path, "Enum symbols are malformed"),
                };
                body.push(("type", Value::string_utf8("string")));
                body.push(("enum", Value::Array(symbols)));
                if member(members, "default").is_some() {
                    let issue_path = child_path(path, "default", self.ctx)?;
                    self.issue(&issue_path, "ENUM_RESOLUTION", "not-enforced", "Reader fallback for unknown enum symbols is not executed by JSON validation")?;
                }
            } else {
                let Some(size) = member(members, "size")
                    .and_then(node_number)
                    .and_then(|n| n.parse::<f64>().ok())
                    .filter(|n| {
                        n.is_finite()
                            && n.fract() == 0.0
                            && *n >= 0.0
                            && *n <= 9_007_199_254_740_991.0 / 2.0
                    })
                else {
                    return self.unsupported(path, "Fixed size cannot be represented safely");
                };
                body.push(("type", Value::string_utf8("string")));
                body.push(("pattern", Value::string_utf8("^([0-9a-f]{2})*(?![\\s\\S])")));
                body.push(("minLength", Value::Number(size * 2.0)));
                body.push(("maxLength", Value::Number(size * 2.0)));
                self.issue(
                    path,
                    "FIXED_ENCODING",
                    "representation-change",
                    "Fixed bytes require lowercase hexadecimal strings with exact byte length",
                )?;
            }
            self.ctx
                .charge_work(body.len().saturating_add(1), path.clone())?;
            for (name, value) in body {
                put_member(
                    &mut self.definitions[definition_index].1,
                    name,
                    value,
                    self.ctx,
                )?;
            }
            return Ok(object(vec![(
                "$ref",
                Value::string_utf8(format!("#/$defs/{key}")),
            )]));
        }
        let scalar = self.primitive(&kind, path)?;
        if let Some(mut scalar) = scalar {
            for (key, value) in annotations {
                put_member(&mut scalar, key, value, self.ctx)?;
            }
            return Ok(scalar);
        }
        match kind.as_str() {
            "array" => {
                let items = member(members, "items")
                    .ok_or_else(|| err("AVRO_UNSUPPORTED", "Array item schema is missing"))?;
                let item_path = child_path(path, "items", self.ctx)?;
                let mut fields = vec![
                    ("type", Value::string_utf8("array")),
                    (
                        "items",
                        self.shape(items, namespace, &item_path, depth + 1)?,
                    ),
                ];
                fields.extend(annotations);
                Ok(object(fields))
            }
            "map" => {
                let values = member(members, "values")
                    .ok_or_else(|| err("AVRO_UNSUPPORTED", "Map value schema is missing"))?;
                let value_path = child_path(path, "values", self.ctx)?;
                let mut fields = vec![
                    ("type", Value::string_utf8("object")),
                    (
                        "additionalProperties",
                        self.shape(values, namespace, &value_path, depth + 1)?,
                    ),
                ];
                fields.extend(annotations);
                Ok(object(fields))
            }
            _ => {
                let type_node =
                    type_node.ok_or_else(|| err("AVRO_UNSUPPORTED", "Avro type is missing"))?;
                let type_path = child_path(path, "type", self.ctx)?;
                let mut value = self.shape(type_node, namespace, &type_path, depth + 1)?;
                for (key, annotation) in annotations {
                    put_member(&mut value, key, annotation, self.ctx)?;
                }
                Ok(value)
            }
        }
    }

    fn unsupported(&mut self, path: &Utf16, detail: &str) -> Result<Value, EngineError> {
        self.fatal = true;
        self.issue(path, "AVRO_UNSUPPORTED", "unsupported", detail)?;
        Ok(object(Vec::new()))
    }
}

fn validate_bindings(
    bindings: &AvroDocumentBindings,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(
        bindings.id.len().saturating_add(bindings.schema_id.len()),
        Utf16::default(),
    )?;
    let id = bindings
        .id
        .to_utf8()
        .map_err(|_| err("AVRO_BINDINGS", "Document id must be valid UTF-16"))?;
    if id.is_empty() {
        return Err(err(
            "AVRO_BINDINGS",
            "Explicit supported Avro document bindings are required",
        ));
    }
    let schema_id = bindings
        .schema_id
        .to_utf8()
        .map_err(|_| err("AVRO_BINDINGS", "Schema ID must be valid UTF-16"))?;
    let parsed = url::Url::parse(&schema_id).map_err(|_| {
        err(
            "AVRO_BINDINGS",
            "Schema ID must be absolute and fragment-free",
        )
    })?;
    if parsed.fragment().is_some() {
        return Err(err(
            "AVRO_BINDINGS",
            "Schema ID must be absolute and fragment-free",
        ));
    }
    Ok(())
}

fn policy_value(
    bindings: &AvroDocumentBindings,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(6, Utf16::default())?;
    ctx.charge_text(
        bindings.id.len().saturating_add(bindings.schema_id.len()),
        Utf16::default(),
    )?;
    Ok(object(vec![
        ("id", Value::String(bindings.id.clone())),
        ("schemaId", Value::String(bindings.schema_id.clone())),
        ("long", Value::string_utf8("decimal-string")),
        ("bytes", Value::string_utf8("hex-string")),
        ("union", Value::string_utf8("untagged")),
        (
            "lossPolicy",
            Value::string_utf8(match bindings.loss_policy {
                LossPolicy::Strict => "strict",
                LossPolicy::AllowReportedLoss => "allow-reported-loss",
            }),
        ),
    ]))
}

fn projection_value(
    status: &str,
    source: Value,
    policy: Value,
    issues: Value,
    mappings: Value,
    target: Option<Value>,
    native_schema: Option<Value>,
) -> Value {
    let mut fields = vec![
        ("status", Value::string_utf8(status)),
        ("source", source),
        ("policy", policy),
        ("issues", issues),
        ("mappings", mappings),
    ];
    if let Some(target) = target {
        fields.push(("target", target));
    }
    if let Some(schema) = native_schema {
        fields.push(("nativeSchema", schema));
    }
    object(fields)
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn qualify(name: &str, namespace: &str) -> String {
    if name.contains('.') || namespace.is_empty() {
        name.to_owned()
    } else {
        format!("{namespace}.{name}")
    }
}
fn child_path(path: &Utf16, segment: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let escaped_len = segment
        .encode_utf16()
        .map(|unit| if matches!(unit, 0x7e | 0x2f) { 2 } else { 1 })
        .sum::<usize>();
    ctx.charge_text(
        path.len().saturating_add(escaped_len).saturating_add(1),
        path.clone(),
    )?;
    let mut units = Vec::with_capacity(path.len().saturating_add(escaped_len).saturating_add(1));
    units.extend_from_slice(path.units());
    units.push(b'/' as u16);
    for unit in segment.encode_utf16() {
        match unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Ok(Utf16::new(units))
}
fn child_path_units(
    path: &Utf16,
    segment: &[u16],
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let escaped_len = segment
        .iter()
        .map(|unit| if matches!(*unit, 0x7e | 0x2f) { 2 } else { 1 })
        .sum::<usize>();
    let output_len = path.len().saturating_add(escaped_len).saturating_add(1);
    ctx.charge_text(output_len, path.clone())?;
    let mut units = Vec::with_capacity(output_len);
    units.extend_from_slice(path.units());
    units.push(b'/' as u16);
    for unit in segment {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Ok(Utf16::new(units))
}
fn member<'a>(members: &'a [(Utf16, NativeJsonNode)], name: &str) -> Option<&'a NativeJsonNode> {
    members
        .iter()
        .find(|(key, _)| key.units().iter().copied().eq(name.encode_utf16()))
        .map(|(_, value)| value)
}
fn node_string(node: &NativeJsonNode) -> Option<&Utf16> {
    if let NativeJsonNode::String(value) = node {
        Some(value)
    } else {
        None
    }
}
fn node_number(node: &NativeJsonNode) -> Option<&str> {
    if let NativeJsonNode::Number(value) = node {
        Some(value)
    } else {
        None
    }
}
fn enum_symbol(
    node: &NativeJsonNode,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, path.clone())?;
    match node {
        NativeJsonNode::String(value) => {
            ctx.charge_text(value.len(), path.clone())?;
            Ok(Value::String(value.clone()))
        }
        _ => Err(err("AVRO_UNSUPPORTED", "Enum symbols must be strings")),
    }
}
fn put_member(
    value: &mut Value,
    name: &str,
    member: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err(
            "AVRO_UNSUPPORTED",
            "Generated schema node is not an object",
        ));
    };
    ctx.charge_work(1, Utf16::default())?;
    ctx.charge_text(name.encode_utf16().count(), Utf16::default())?;
    let key = Utf16::from(name);
    if let Some((_, existing)) = fields.iter_mut().find(|(candidate, _)| candidate == &key) {
        *existing = member;
    } else {
        fields.push((key, member));
    }
    Ok(())
}
