// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned JSON Schema to Protocol Buffers source projection.
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    context::Context,
    error::{Diagnostic, EngineError},
    json_schema_adapter,
    native_json::{NativeJsonNode, NativeJsonTree},
    value::{copy_json, Utf16, Value},
};

const INTEGER_TYPES: &[&str] = &["int64", "uint64", "sint64", "int32", "uint32", "sint32"];

fn err(code: &str, path: Utf16, message: &str) -> EngineError {
    EngineError::new(code, path, message)
}
fn key(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn value_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn node_field<'a>(value: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    match value {
        NativeJsonNode::Object(fields) => {
            fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
        }
        _ => None,
    }
}
fn node_text(value: Option<&NativeJsonNode>) -> Option<String> {
    match value {
        Some(NativeJsonNode::String(text)) => text.to_utf8().ok(),
        _ => None,
    }
}
fn value_text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(text)) => Some(text),
        _ => None,
    }
}
fn issue(path: &Utf16, code: &str, class: &str, detail: &str) -> Value {
    object(vec![
        ("path", Value::String(path.clone())),
        ("code", string(code)),
        ("classification", string(class)),
        ("detail", string(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn pointer_child(
    parent: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        parent.len().saturating_add(segment.len()).saturating_add(1),
        parent.clone(),
    )?;
    let mut output = parent.units().to_vec();
    output.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => output.extend([b'~' as u16, b'0' as u16]),
            0x2f => output.extend([b'~' as u16, b'1' as u16]),
            value => output.push(value),
        }
    }
    Ok(Utf16::new(output))
}
fn pointer_text(path: &Utf16, suffix: &str) -> Utf16 {
    let mut units = path.units().to_vec();
    units.extend(suffix.encode_utf16());
    Utf16::new(units)
}
fn decode_uri_component(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hi = *bytes.get(index + 1)?;
            let lo = *bytes.get(index + 2)?;
            let digit = |value: u8| match value {
                b'0'..=b'9' => Some(value - b'0'),
                b'a'..=b'f' => Some(value - b'a' + 10),
                b'A'..=b'F' => Some(value - b'A' + 10),
                _ => None,
            };
            output.push(digit(hi)? * 16 + digit(lo)?);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).ok()
}
fn valid_ident(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some('A'..='Z' | 'a'..='z' | '_'))
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}
fn is_annotation(name: &str) -> bool {
    matches!(
        name,
        "title"
            | "description"
            | "default"
            | "examples"
            | "$comment"
            | "readOnly"
            | "writeOnly"
            | "deprecated"
    )
}

struct Projection<'a, 'ctx, 'cap> {
    source: &'a Value,
    root: NativeJsonTree,
    package: String,
    root_name: String,
    integer_type: String,
    fields: BTreeMap<Utf16, (u32, Utf16)>,
    used_bindings: BTreeSet<Utf16>,
    names: BTreeMap<Utf16, String>,
    messages: Vec<String>,
    mappings: Vec<Value>,
    issues: Vec<Value>,
    serial: usize,
    fatal: bool,
    ctx: &'ctx mut Context<'cap>,
}
impl Projection<'_, '_, '_> {
    fn add_issue(
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
    fn fail(&mut self, path: &Utf16, code: &str, detail: &str) -> Result<(), EngineError> {
        self.fatal = true;
        self.add_issue(path, code, "unsupported", detail)
    }
    fn notes(
        &mut self,
        members: &[(Utf16, NativeJsonNode)],
        path: &Utf16,
        handled: &[&str],
    ) -> Result<(), EngineError> {
        for (name, _) in members {
            self.ctx
                .charge_work(name.len().saturating_add(1), path.clone())?;
            let name_text = name.to_utf8().ok();
            if name_text
                .as_ref()
                .is_some_and(|text| handled.contains(&text.as_str()))
            {
                continue;
            }
            let child = pointer_child(path, name, self.ctx)?;
            if name_text.as_deref().is_some_and(is_annotation) {
                self.add_issue(&child, "ANNOTATION_RETAINED", "annotation-only", "Native target does not carry this source annotation; JSON Schema default is not a Protobuf field default")?;
            } else {
                self.add_issue(&child, "CONSTRAINT_NOT_ENFORCED", "not-enforced", "Native target does not enforce this keyword; retained source schema remains authoritative")?;
            }
        }
        Ok(())
    }
    fn lookup_ref(
        &mut self,
        path: &Utf16,
        reference: &str,
    ) -> Result<Option<NativeJsonTree>, EngineError> {
        if reference != "#" && !reference.starts_with("#/") {
            self.fail(
                &pointer_text(path, "/$ref"),
                "REFERENCE_SCOPE",
                "Only explicit root-document JSON Pointer references are lowered in this profile",
            )?;
            return Ok(None);
        }
        let Some(pointer) = decode_uri_component(reference.get(1..).unwrap_or_default()) else {
            self.fail(
                &pointer_text(path, "/$ref"),
                "REFERENCE_SCOPE",
                "Unresolvable reference",
            )?;
            return Ok(None);
        };
        let tree = match json_schema_adapter::get_json_schema_node(
            self.source,
            &Utf16::from(pointer),
            self.ctx,
        ) {
            Ok(tree) => tree,
            Err(error) if !error.is_control_failure() => {
                self.fail(
                    &pointer_text(path, "/$ref"),
                    "REFERENCE_SCOPE",
                    "Unresolvable reference",
                )?;
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        let NativeJsonNode::Object(members) = tree.root() else {
            self.fail(
                &pointer_text(path, "/$ref"),
                "REFERENCE_SHAPE",
                "Referenced target must declare an object type",
            )?;
            return Ok(None);
        };
        if node_text(node_field(tree.root(), "type")).as_deref() != Some("object") {
            self.fail(
                &pointer_text(path, "/$ref"),
                "REFERENCE_SHAPE",
                "Referenced target must declare an object type",
            )?;
            return Ok(None);
        }
        self.add_issue(&pointer_text(path, "/$ref"), "REFERENCE_LOWERED", "representation-change", "JSON Schema reference becomes a Protobuf message reference; native URI scope is retained in source")?;
        Ok(Some(tree))
    }
    fn type_node(
        &mut self,
        node: &NativeJsonNode,
        path: &Utf16,
    ) -> Result<Option<String>, EngineError> {
        let NativeJsonNode::Object(members) = node else {
            self.fail(
                path,
                "SCHEMA_SHAPE",
                "Boolean or non-object schema has no selected native representation",
            )?;
            return Ok(None);
        };
        if node_field(node, "$id").is_some() && !path.is_empty() {
            self.fail(
                &pointer_text(path, "/$id"),
                "RESOURCE_SCOPE",
                "Nested resource identity needs explicit reference lowering",
            )?;
            return Ok(None);
        }
        if let Some(reference) = node_text(node_field(node, "$ref")) {
            self.notes(members, path, &["$ref"])?;
            let Some(target) = self.lookup_ref(path, &reference)? else {
                return Ok(None);
            };
            return self.message(
                target.root(),
                &Utf16::from(decode_uri_component(&reference[1..]).unwrap_or_default()),
            );
        }
        let mut kind = node_text(node_field(node, "type"));
        if let Some(NativeJsonNode::Array(values)) = node_field(node, "type") {
            let types: Vec<_> = values
                .iter()
                .filter_map(|value| node_text(Some(value)))
                .collect();
            let non_null: Vec<_> = types
                .iter()
                .filter(|value| value.as_str() != "null")
                .cloned()
                .collect();
            if types.iter().any(|value| value == "null") && non_null.len() == 1 {
                kind = non_null.first().cloned();
                self.add_issue(
                    &pointer_text(path, "/type"),
                    "NULLABILITY_LOST",
                    "representation-change",
                    "Protobuf field absence does not represent a distinct JSON null value",
                )?;
            }
        }
        if kind.as_deref() == Some("object") {
            return self.message(node, path);
        }
        if kind.as_deref() == Some("array") {
            let Some(items) = node_field(node, "items") else {
                self.fail(
                    &pointer_text(path, "/items"),
                    "ARRAY_ITEMS",
                    "Array element type must be declared",
                )?;
                return Ok(None);
            };
            self.notes(members, path, &["type", "items"])?;
            let Some(value_type) = self.type_node(items, &pointer_text(path, "/items"))? else {
                return Ok(None);
            };
            if value_type.starts_with("repeated ") {
                self.fail(
                    path,
                    "NESTED_ARRAY",
                    "Nested repeated fields need an explicit wrapper binding",
                )?;
                return Ok(None);
            }
            self.add_issue(
                path,
                "ARRAY_PRESENCE",
                "representation-change",
                "Repeated fields collapse absent and empty arrays; ordering is retained",
            )?;
            return Ok(Some(format!("repeated {value_type}")));
        }
        self.notes(members, path, &["type"])?;
        let Some(kind) = kind else {
            self.fail(&pointer_text(path, "/type"), "TYPE_UNSUPPORTED", "A declared object, array or supported scalar type is required; alternatives are not silently collapsed")?;
            return Ok(None);
        };
        match kind.as_str() {
            "string" => {
                self.add_issue(&pointer_text(path, "/type"), "STRING_ENCODING", "representation-change", "Native strings use UTF-8; ill-formed Unicode surrogate sequences have no portable native string representation")?;
                Ok(Some("string".to_owned()))
            }
            "boolean" => Ok(Some("bool".to_owned())),
            "integer" => {
                self.add_issue(&pointer_text(path, "/type"), "INTEGER_DOMAIN", "representation-change", &format!("Mathematical JSON integers are projected to explicitly selected {}; range and wire representation differ", self.integer_type))?;
                if self.integer_type.ends_with("64") {
                    self.add_issue(&pointer_text(path, "/type"), "PROTOJSON_INTEGER", "representation-change", "Protobuf JSON encodes 64-bit integers as strings; no instance converter is supplied")?;
                }
                Ok(Some(self.integer_type.clone()))
            }
            "number" => {
                self.add_issue(&pointer_text(path, "/type"), "NUMBER_DOMAIN", "representation-change", "Binary64 may lose decimal precision and supports non-finite native values absent from JSON numbers")?;
                Ok(Some("double".to_owned()))
            }
            _ => {
                self.fail(&pointer_text(path, "/type"), "TYPE_UNSUPPORTED", "A declared object, array or supported scalar type is required; alternatives are not silently collapsed")?;
                Ok(None)
            }
        }
    }
    fn message(
        &mut self,
        node: &NativeJsonNode,
        path: &Utf16,
    ) -> Result<Option<String>, EngineError> {
        if let Some(name) = self.names.get(path) {
            return Ok(Some(name.clone()));
        }
        let NativeJsonNode::Object(members) = node else {
            self.fail(
                path,
                "SCHEMA_SHAPE",
                "Boolean or non-object schema has no selected native representation",
            )?;
            return Ok(None);
        };
        let name = if path.is_empty() {
            self.root_name.clone()
        } else {
            loop {
                self.serial += 1;
                let candidate = format!("Nested_{}", self.serial);
                if candidate != self.root_name {
                    break candidate;
                }
            }
        };
        self.names.insert(path.clone(), name.clone());
        if node_field(node, "$id").is_some() && !path.is_empty() {
            self.fail(
                &pointer_text(path, "/$id"),
                "RESOURCE_SCOPE",
                "Nested resource identity needs explicit reference lowering",
            )?;
        }
        self.notes(
            members,
            path,
            &[
                "type",
                "properties",
                "$defs",
                "$schema",
                "$id",
                "required",
                "additionalProperties",
            ],
        )?;
        if node_field(node, "$schema").is_some() {
            self.add_issue(
                &pointer_text(path, "/$schema"),
                "DIALECT_RETAINED",
                "annotation-only",
                "JSON Schema dialect declaration is retained only in source",
            )?;
        }
        if node_field(node, "$id").is_some() {
            self.add_issue(
                &pointer_text(path, "/$id"),
                "IDENTITY_RETAINED",
                "annotation-only",
                "JSON Schema resource identity is retained only in source",
            )?;
        }
        if node_field(node, "$defs").is_some() {
            self.add_issue(&pointer_text(path, "/$defs"), "DEFINITIONS_RETAINED", "annotation-only", "Only referenced object definitions generate target messages; the full definition table remains in source")?;
        }
        if node_field(node, "required").is_some() {
            self.add_issue(
                &pointer_text(path, "/required"),
                "REQUIRED_NOT_ENFORCED",
                "not-enforced",
                "Proto3 optional presence does not enforce JSON Schema required members",
            )?;
        }
        let closed = matches!(
            node_field(node, "additionalProperties"),
            Some(NativeJsonNode::Boolean(false))
        );
        self.add_issue(
            &pointer_text(path, "/additionalProperties"),
            "OBJECT_OPENNESS",
            "representation-change",
            if closed {
                "Protobuf unknown wire fields are not JSON Schema additional-property rejection"
            } else {
                "Undeclared JSON object properties have no generated fields"
            },
        )?;
        let properties = node_field(node, "properties");
        if properties.is_some() && !matches!(properties, Some(NativeJsonNode::Object(_))) {
            self.fail(
                &pointer_text(path, "/properties"),
                "PROPERTIES_SHAPE",
                "Invalid properties",
            )?;
            return Ok(None);
        }
        let properties = match properties {
            Some(NativeJsonNode::Object(map)) => map.as_slice(),
            _ => &[],
        };
        let mut lines = Vec::new();
        let mut tags = BTreeSet::new();
        for (property_name, child) in properties {
            let child_path = pointer_child(&pointer_text(path, "/properties"), property_name, self.ctx)?;
            let Some((number, binding_path)) = self.fields.get(&child_path).cloned() else {
                self.used_bindings.insert(child_path.clone());
                self.fail(
                    &child_path,
                    "FIELD_NUMBER",
                    "Each field needs a distinct valid explicit Protobuf number within its message",
                )?;
                continue;
            };
            self.used_bindings.insert(child_path.clone());
            if number < 1
                || number > 536_870_911
                || (19_000..=19_999).contains(&number)
                || !tags.insert(number)
            {
                self.fail(
                    &child_path,
                    "FIELD_NUMBER",
                    "Each field needs a distinct valid explicit Protobuf number within its message",
                )?;
                continue;
            }
            let Some(field_type) = self.type_node(child, &child_path)? else {
                continue;
            };
            let field_name = format!("field_{number}");
            self.mappings.push(object(vec![
                ("sourcePath", Value::String(child_path.clone())),
                (
                    "targetMessage",
                    string(&format!("{}.{}", self.package, name)),
                ),
                ("targetField", string(&field_name)),
                ("number", Value::Number(number as f64)),
            ]));
            let json_name = crate::serialization::write_json_value(
                &Value::String(property_name.clone()),
                crate::serialization::Format::Json,
                self.ctx,
            )?;
            let mut json_name_text = json_name.to_utf8().map_err(|_| {
                err(
                    "JSON_SCHEMA_SYNTAX",
                    child_path.clone(),
                    "Invalid JSON field name",
                )
            })?;
            if json_name_text.ends_with('\n') {
                json_name_text.pop();
            }
            lines.push(format!(
                "  {}{} {} = {} [json_name = {}];",
                if field_type.starts_with("repeated ") {
                    ""
                } else {
                    "optional "
                },
                field_type,
                field_name,
                number,
                json_name_text
            ));
            let _ = binding_path;
        }
        self.messages
            .push(format!("message {name} {{\n{}\n}}", lines.join("\n")));
        Ok(Some(name))
    }
}

fn diagnostic_issue(diagnostic: Diagnostic) -> Value {
    object(vec![
        ("path", Value::String(diagnostic.path)),
        ("code", Value::String(diagnostic.code)),
        ("classification", string("unsupported")),
        ("detail", Value::String(diagnostic.message)),
        ("retainedInSource", Value::Bool(true)),
    ])
}

pub fn project(source: &Value, input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let options = copy_json(input, ctx)?;
    let Value::Object(option_fields) = &options else {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Invalid projection policy or field bindings",
        ));
    };
    let allowed = [
        "id",
        "packageName",
        "messageName",
        "fields",
        "integerType",
        "lossPolicy",
    ];
    if option_fields
        .iter()
        .any(|(name, _)| !allowed.iter().any(|candidate| name == &key(candidate)))
    {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Unknown projection policy field",
        ));
    }
    let id = value_text(value_field(&options, "id"))
        .filter(|value| !value.is_empty())
        .cloned();
    let package =
        value_text(value_field(&options, "packageName")).and_then(|value| value.to_utf8().ok());
    let root_name =
        value_text(value_field(&options, "messageName")).and_then(|value| value.to_utf8().ok());
    let integer_type =
        value_text(value_field(&options, "integerType")).and_then(|value| value.to_utf8().ok());
    let loss_policy =
        value_text(value_field(&options, "lossPolicy")).and_then(|value| value.to_utf8().ok());
    let (Some(id), Some(package), Some(root_name), Some(integer_type), Some(loss_policy)) =
        (id, package, root_name, integer_type, loss_policy)
    else {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Explicit valid package/message names and target id are required",
        ));
    };
    if !package.split('.').all(valid_ident) || !valid_ident(&root_name) {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Explicit valid package/message names and target id are required",
        ));
    }
    if !INTEGER_TYPES.contains(&integer_type.as_str())
        || !["strict", "allow-reported-loss"].contains(&loss_policy.as_str())
    {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Invalid projection policy or field bindings",
        ));
    }
    let Some(binding_value) = value_field(&options, "fields") else {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Invalid projection policy or field bindings",
        ));
    };
    let Value::Object(binding_fields) = binding_value else {
        return Err(err(
            "PROJECTION_OPTIONS",
            key(""),
            "Invalid projection policy or field bindings",
        ));
    };
    let inspection = json_schema_adapter::inspect_json_schema(source, ctx)?;
    let mut result_issues = Vec::new();
    for diagnostic in inspection.diagnostics.iter().cloned() {
        result_issues.push(diagnostic_issue(diagnostic));
    }
    let fatal = inspection.diagnostics.iter().any(|diagnostic| {
        ["JSON_SCHEMA_DIALECT", "JSON_SCHEMA_VOCABULARY"]
            .iter()
            .any(|code| diagnostic.code.to_utf8().ok().as_deref() == Some(*code))
    });
    if !inspection.valid {
        return Err(err("PROJECTION_SOURCE", key(""), "Invalid source schema"));
    }
    result_issues.push(issue(&Utf16::default(), "INSTANCE_ENCODING", "representation-change", "This projects schemas only; native wire/ProtoJSON data requires a separate explicit instance conversion using the field mappings"));
    let root = json_schema_adapter::get_json_schema_node(source, &Utf16::default(), ctx)?;
    let mut bindings = BTreeMap::new();
    for (path, spec) in binding_fields {
        let Value::Object(spec) = spec else {
            return Err(err(
                "PROJECTION_OPTIONS",
                key(""),
                "Invalid projection policy or field bindings",
            ));
        };
        if spec.len() != 1 || spec[0].0 != key("number") {
            return Err(err(
                "PROJECTION_OPTIONS",
                key(""),
                "Invalid projection policy or field bindings",
            ));
        }
        let Value::Number(number) = &spec[0].1 else {
            return Err(err(
                "PROJECTION_OPTIONS",
                path.clone(),
                "Field number must be an integer",
            ));
        };
        if !number.is_finite() || number.fract() != 0.0 || !(1.0..=536_870_911.0).contains(number)
        {
            return Err(err(
                "PROJECTION_OPTIONS",
                path.clone(),
                "Field number must be an integer",
            ));
        }
        bindings.insert(path.clone(), (*number as u32, path.clone()));
    }
    let mut projection = Projection {
        source,
        root,
        package,
        root_name,
        integer_type,
        fields: bindings,
        used_bindings: BTreeSet::new(),
        names: BTreeMap::new(),
        messages: Vec::new(),
        mappings: Vec::new(),
        issues: result_issues,
        serial: 0,
        fatal,
        ctx,
    };
    let root_node = projection.root.root().clone();
    if node_text(node_field(&root_node, "type")).as_deref() != Some("object") {
        projection.fail(
            &Utf16::default(),
            "ROOT_TYPE",
            "This projection requires a declared object root",
        )?;
    } else {
        projection.message(&root_node, &Utf16::default())?;
    }
    for path in projection.fields.keys().cloned().collect::<Vec<_>>() {
        if !projection.used_bindings.contains(&path) {
            projection.fail(
                &path,
                "UNUSED_BINDING",
                "Field binding did not match a lowered source property",
            )?;
        }
    }
    if projection.fatal || (loss_policy == "strict" && !projection.issues.is_empty()) {
        return Ok(make_result(
            "blocked",
            copy_json(source, projection.ctx)?,
            options,
            std::mem::take(&mut projection.issues),
            std::mem::take(&mut projection.mappings),
            None,
        ));
    }
    let native_source = format!(
        "syntax = \"proto3\";\npackage {};\n{}\n",
        projection.package,
        projection.messages.join("\n\n")
    );
    let mut fields = match make_result(
        "projected",
        copy_json(source, projection.ctx)?,
        options,
        std::mem::take(&mut projection.issues),
        std::mem::take(&mut projection.mappings),
        None,
    ) {
        Value::Object(fields) => fields,
        _ => unreachable!(),
    };
    fields.push((
        key("nativeSource"),
        Value::String(Utf16::from(native_source)),
    ));
    let _ = id;
    Ok(Value::Object(fields))
}

fn make_result(
    status: &str,
    source: Value,
    policy: Value,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    target: Option<Value>,
) -> Value {
    let mut fields = vec![
        (key("status"), string(status)),
        (key("source"), source),
        (key("policy"), policy),
        (key("issues"), Value::Array(issues)),
        (key("mappings"), Value::Array(mappings)),
    ];
    if let Some(target) = target {
        fields.push((key("target"), target));
    }
    Value::Object(fields)
}
