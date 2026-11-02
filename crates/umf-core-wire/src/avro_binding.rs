// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire API for the Rust Avro source-preservation operations.
use std::collections::BTreeSet;

use umf_core::{
    avro_document::{self, AvroDependencySource},
    avro_fields::{derive_avro_fields, AvroDependency},
    avro_semantics::{inspect_schema, Dependency},
    native_json::{NativeJsonNode, NativeJsonTree},
    Context, Diagnostic, EngineError, Severity, Utf16, Validation, Value,
};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.avro-wire/1";
pub const OPERATIONS: &[&str] = &[
    "avro.import",
    "avro.inspect",
    "avro.inspectPayload",
    "avro.fields",
    "avro.export",
    "avro.exportBundle",
    "avro.getNode",
    "avro.editNode",
    "avro.proposeNodeEdit",
];

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}

fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "avro.import" => &["profile", "op", "id", "source", "dependencies"],
        "avro.inspect" | "avro.export" | "avro.exportBundle" => &["profile", "op", "document"],
        "avro.inspectPayload" => &["profile", "op", "payload"],
        "avro.fields" => &["profile", "op", "root", "dependencies"],
        "avro.getNode" => &["profile", "op", "document", "path", "dependencyId"],
        "avro.editNode" | "avro.proposeNodeEdit" => &[
            "profile",
            "op",
            "document",
            "path",
            "replacementJson",
            "dependencyId",
        ],
        _ => return None,
    })
}

fn validate_members(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("Avro request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (name, _) in fields {
        ctx.charge_text(name.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| name == &Utf16::from(*candidate))
            || !seen.insert(name)
        {
            return Err(request("Avro request has an unknown or duplicate member"));
        }
    }
    Ok(())
}

fn required<'a>(request: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(request, name).ok_or_else(|| request_error(name))
}

fn request_error(name: &str) -> EngineError {
    request(&format!("{name} is required"))
}

fn parse_dependencies<'a>(
    value: Option<&'a Value>,
    ctx: &mut Context<'_>,
) -> Result<Vec<AvroDependencySource<'a>>, EngineError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let Value::Array(items) = value else {
        return Err(request("Avro dependencies must be an array"));
    };
    if items.len() > 100_000 {
        return Err(request("Too many Avro schema dependencies"));
    }
    ctx.charge_work(items.len(), Utf16::default())?;
    let mut result = Vec::with_capacity(items.len());
    for item in items {
        validate_members(item, &["id", "schema"], ctx)?;
        let id = text(field(item, "id"), "dependency id")?;
        let schema = text(field(item, "schema"), "dependency schema")?;
        ctx.charge_text(id.len(), Utf16::default())?;
        ctx.charge_text(schema.len(), Utf16::default())?;
        result.push(AvroDependencySource {
            id,
            schema_json: schema.units(),
        });
    }
    Ok(result)
}

fn parse_tree_dependencies<'a>(
    value: Option<&'a Value>,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, NativeJsonTree)>, EngineError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let Value::Array(items) = value else {
        return Err(request("Avro dependencies must be an array"));
    };
    if items.len() > 100_000 {
        return Err(request("Too many Avro schema dependencies"));
    }
    ctx.charge_work(items.len(), Utf16::default())?;
    let mut result = Vec::with_capacity(items.len());
    let mut seen = BTreeSet::new();
    for item in items {
        let id = text(field(item, "id"), "dependency id")?;
        ctx.charge_text(id.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        if !seen.insert(id.units().to_vec()) {
            return Err(EngineError::new(
                "AVRO_DEPENDENCY_ID",
                Utf16::default(),
                "Dependency IDs must be unique",
            ));
        }
        let root = NativeJsonTree::from_tagged_value(required(item, "root")?, ctx)?;
        result.push((id.clone(), root));
    }
    Ok(result)
}

fn inspect_trees(
    root: &NativeJsonTree,
    dependencies: &[(Utf16, NativeJsonTree)],
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let borrowed = dependencies
        .iter()
        .map(|(id, tree)| Dependency { id, tree })
        .collect::<Vec<_>>();
    inspect_schema(root, &borrowed, ctx)
}

fn severity_value(severity: Severity) -> Value {
    Value::string_utf8(match severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    })
}

fn diagnostics_value(
    diagnostics: Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    let mut values = Vec::with_capacity(diagnostics.len());
    for diagnostic in diagnostics {
        ctx.charge_text(
            diagnostic
                .code
                .len()
                .saturating_add(diagnostic.path.len())
                .saturating_add(diagnostic.message.len()),
            Utf16::default(),
        )?;
        values.push(Value::Object(vec![
            (Utf16::from("code"), Value::String(diagnostic.code)),
            (Utf16::from("path"), Value::String(diagnostic.path)),
            (Utf16::from("severity"), severity_value(diagnostic.severity)),
            (Utf16::from("message"), Value::String(diagnostic.message)),
        ]));
    }
    Ok(Value::Array(values))
}

fn pointer_segment(segment: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let output_len = segment
        .units()
        .iter()
        .map(|unit| if matches!(*unit, 0x7e | 0x2f) { 2 } else { 1 })
        .sum();
    ctx.charge_text(output_len, Utf16::default())?;
    let mut out = Vec::with_capacity(output_len);
    for unit in segment.units() {
        match *unit {
            0x7e => out.extend([b'~' as u16, b'0' as u16]),
            0x2f => out.extend([b'~' as u16, b'1' as u16]),
            other => out.push(other),
        }
    }
    Ok(Utf16::new(out))
}

fn representation_diagnostic(
    path: Utf16,
    message: &str,
    ctx: &mut Context<'_>,
) -> Result<Diagnostic, EngineError> {
    ctx.charge_text(path.len(), Utf16::default())?;
    ctx.charge_text(message.encode_utf16().count(), Utf16::default())?;
    Ok(Diagnostic {
        code: Utf16::from("AVRO_REPRESENTATION"),
        path,
        python_source_path: false,
        message: Utf16::from(message),
        severity: Severity::Warning,
        python_text_origin: None,
    })
}

fn inspect_representation_node(
    value: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    let Value::Object(fields) = value else {
        return Ok(());
    };
    let kind = match field(value, "kind") {
        Some(Value::String(kind)) => Some(kind),
        _ => None,
    };
    let allowed: &[&str] = if kind == Some(&Utf16::from("null")) {
        &["kind"]
    } else if kind.is_some_and(|value| {
        ["boolean", "string", "number"]
            .iter()
            .any(|name| value == &Utf16::from(*name))
    }) {
        &["kind", "value"]
    } else if kind == Some(&Utf16::from("array")) {
        &["kind", "items"]
    } else if kind == Some(&Utf16::from("object")) {
        &["kind", "members"]
    } else {
        &["kind", "value", "items", "members"]
    };
    for (name, _child) in fields {
        ctx.charge_text(name.len(), path.clone())?;
        if !allowed.iter().any(|key| name == &Utf16::from(*key)) {
            let segment = pointer_segment(name, ctx)?;
            let unknown_path = join_pointer(path, &segment, ctx)?;
            diagnostics.push(representation_diagnostic(
                unknown_path,
                "Unknown representation field has no native destination",
                ctx,
            )?);
        }
    }
    if let Some(Value::Array(items)) = field(value, "items") {
        let items_path = join_pointer(path, &Utf16::from("items"), ctx)?;
        for (index, item) in items.iter().enumerate() {
            ctx.charge_work(1, path.clone())?;
            let segment = Utf16::from(index.to_string());
            let child_path = join_pointer(&items_path, &segment, ctx)?;
            inspect_representation_node(item, &child_path, diagnostics, ctx)?;
        }
    }
    if let Some(Value::Object(members)) = field(value, "members") {
        for (name, child) in members {
            let segment = pointer_segment(name, ctx)?;
            let members_path = join_pointer(path, &Utf16::from("members"), ctx)?;
            let child_path = join_pointer(&members_path, &segment, ctx)?;
            inspect_representation_node(child, &child_path, diagnostics, ctx)?;
        }
    }
    Ok(())
}

fn join_pointer(
    base: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_text(
        base.len().saturating_add(segment.len()).saturating_add(1),
        Utf16::default(),
    )?;
    ctx.charge_work(1, Utf16::default())?;
    let mut units = base.units().to_vec();
    units.push(b'/' as u16);
    units.extend_from_slice(segment.units());
    Ok(Utf16::new(units))
}

fn inspect_payload_representation(
    payload: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let Value::Object(fields) = payload else {
        return Err(request("Avro payload must be an object"));
    };
    let mut diagnostics = Vec::new();
    for (name, value) in fields {
        ctx.charge_text(name.len(), Utf16::default())?;
        if !["version", "root", "dependencies"]
            .iter()
            .any(|known| name == &Utf16::from(*known))
        {
            let segment = pointer_segment(name, ctx)?;
            let path = join_pointer(&Utf16::default(), &segment, ctx)?;
            diagnostics.push(representation_diagnostic(
                path,
                "Unknown payload field has no native destination",
                ctx,
            )?);
        }
        if name == &Utf16::from("root") {
            inspect_representation_node(value, &Utf16::from("/root"), &mut diagnostics, ctx)?;
        }
        if name == &Utf16::from("dependencies") {
            if let Value::Array(dependencies) = value {
                for (index, dependency) in dependencies.iter().enumerate() {
                    ctx.charge_work(1, Utf16::from("/dependencies"))?;
                    let dep_path = join_pointer(
                        &Utf16::from("/dependencies"),
                        &Utf16::from(index.to_string()),
                        ctx,
                    )?;
                    if let Value::Object(dep_fields) = dependency {
                        for (key, child) in dep_fields {
                            ctx.charge_text(key.len(), dep_path.clone())?;
                            if !["id", "root"]
                                .iter()
                                .any(|known| key == &Utf16::from(*known))
                            {
                                let segment = pointer_segment(key, ctx)?;
                                let path = join_pointer(&dep_path, &segment, ctx)?;
                                diagnostics.push(representation_diagnostic(path, "Unknown dependency representation field has no native destination", ctx)?);
                            }
                            if key == &Utf16::from("root") {
                                let root_path = join_pointer(&dep_path, &Utf16::from("root"), ctx)?;
                                inspect_representation_node(
                                    child,
                                    &root_path,
                                    &mut diagnostics,
                                    ctx,
                                )?;
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(diagnostics)
}

fn append_path(path: &Utf16, segment: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    join_pointer(path, segment, ctx)
}

fn node_member<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    match node {
        NativeJsonNode::Object(members) => members
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn node_string(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(value)) => Some(value),
        _ => None,
    }
}

fn metadata_warning(
    diagnostics: &mut Vec<Diagnostic>,
    code: &str,
    path: Utf16,
    message: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(code.encode_utf16().count(), Utf16::default())?;
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

fn inspect_schema_metadata(
    node: &NativeJsonNode,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    match node {
        NativeJsonNode::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                ctx.charge_work(1, path.clone())?;
                let index = Utf16::from(index.to_string());
                let child = append_path(path, &index, ctx)?;
                inspect_schema_metadata(item, &child, diagnostics, ctx)?;
            }
        }
        NativeJsonNode::Object(members) => {
            let type_name = node_string(node_member(node, "type"));
            let mut known: Vec<&str> =
                vec!["type", "name", "namespace", "aliases", "doc", "logicalType"];
            match type_name {
                Some(value)
                    if value == &Utf16::from("record") || value == &Utf16::from("error") =>
                {
                    known.push("fields")
                }
                Some(value) if value == &Utf16::from("enum") => {
                    known.extend(["symbols", "default"])
                }
                Some(value) if value == &Utf16::from("fixed") => {
                    known.extend(["size", "precision", "scale"])
                }
                Some(value) if value == &Utf16::from("array") => known.push("items"),
                Some(value) if value == &Utf16::from("map") => known.push("values"),
                _ => known.extend(["precision", "scale"]),
            }
            for (key, _) in members {
                ctx.charge_text(key.len(), path.clone())?;
                if !known.iter().any(|name| key == &Utf16::from(*name)) {
                    let location = append_path(path, &pointer_segment(key, ctx)?, ctx)?;
                    metadata_warning(
                        diagnostics,
                        "AVRO_METADATA",
                        location,
                        "Uninterpreted native metadata retained",
                        ctx,
                    )?;
                }
            }
            if node_member(node, "logicalType").is_some() {
                let location = append_path(path, &Utf16::from("logicalType"), ctx)?;
                metadata_warning(
                    diagnostics,
                    "AVRO_LOGICAL_TYPE",
                    location,
                    "Logical type retained; the Rust profile validates its underlying carrier only",
                    ctx,
                )?;
            }
            if let Some(NativeJsonNode::Array(fields)) = node_member(node, "fields") {
                for (index, field) in fields.iter().enumerate() {
                    let field_path = append_path(path, &Utf16::from("fields"), ctx)?;
                    let index = Utf16::from(index.to_string());
                    let field_path = append_path(&field_path, &index, ctx)?;
                    if let NativeJsonNode::Object(field_members) = field {
                        for (key, _) in field_members {
                            ctx.charge_text(key.len(), field_path.clone())?;
                            if !["name", "type", "default", "order", "aliases", "doc"]
                                .iter()
                                .any(|known| key == &Utf16::from(*known))
                            {
                                let location =
                                    append_path(&field_path, &pointer_segment(key, ctx)?, ctx)?;
                                metadata_warning(
                                    diagnostics,
                                    "AVRO_METADATA",
                                    location,
                                    "Uninterpreted field metadata retained",
                                    ctx,
                                )?;
                            }
                        }
                        if let Some(field_type) = node_member(field, "type") {
                            let field_path = append_path(&field_path, &Utf16::from("type"), ctx)?;
                            inspect_schema_metadata(field_type, &field_path, diagnostics, ctx)?;
                        }
                    }
                }
            }
            for key in ["items", "values"] {
                if let Some(child) = node_member(node, key) {
                    let child_path = append_path(path, &Utf16::from(key), ctx)?;
                    inspect_schema_metadata(child, &child_path, diagnostics, ctx)?;
                }
            }
            if let Some(schema_type) = node_member(node, "type") {
                if !matches!(schema_type, NativeJsonNode::String(_)) {
                    let child_path = append_path(path, &Utf16::from("type"), ctx)?;
                    inspect_schema_metadata(schema_type, &child_path, diagnostics, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn validation_value(validation: Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (
            Utf16::from("diagnostics"),
            diagnostics_value(validation.diagnostics, ctx)?,
        ),
    ]))
}

fn merge_inspection(inspection: avro_document::AvroDocumentInspection) -> Validation {
    let mut diagnostics = inspection.admission.diagnostics;
    let mut valid = inspection.admission.valid;
    let mut complete = inspection.admission.complete;
    if let Some(native) = inspection.native_inspection {
        valid &= native.valid;
        complete &= native.complete;
        diagnostics.extend(native.diagnostics);
    }
    Validation {
        valid,
        complete,
        diagnostics,
    }
}

fn metered_field<'a>(
    value: &'a Value,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    if let Value::Object(fields) = value {
        ctx.charge_work(fields.len(), Utf16::default())?;
    }
    Ok(field(value, name))
}

fn has_string(value: Option<&Value>, expected: &str) -> bool {
    matches!(value, Some(Value::String(actual)) if actual == &Utf16::from(expected))
}

fn avro_document_payload<'a>(
    document: &'a Value,
    ctx: &mut Context<'_>,
) -> Result<&'a Value, EngineError> {
    let modules = metered_field(document, "modules", ctx)?
        .and_then(|value| {
            if let Value::Array(items) = value {
                Some(items)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            EngineError::new(
                "AVRO_PAYLOAD",
                Utf16::default(),
                "Missing Avro schema payload",
            )
        })?;
    let mut found = None;
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        if !has_string(metered_field(module, "id", ctx)?, "schema") {
            continue;
        }
        let Some(elements) = metered_field(module, "elements", ctx)?.and_then(|value| {
            if let Value::Array(items) = value {
                Some(items)
            } else {
                None
            }
        }) else {
            continue;
        };
        for element in elements {
            ctx.charge_work(1, Utf16::default())?;
            if !has_string(metered_field(element, "id", ctx)?, "schema") {
                continue;
            }
            let Some(extensions) = metered_field(element, "extensions", ctx)? else {
                continue;
            };
            let Some(payload) = metered_field(extensions, "umf.avro", ctx)? else {
                continue;
            };
            if found.is_some() {
                return Err(EngineError::new(
                    "AVRO_PAYLOAD",
                    Utf16::default(),
                    "Avro schema identity is ambiguous",
                ));
            }
            found = Some(payload);
        }
    }
    found.ok_or_else(|| {
        EngineError::new(
            "AVRO_PAYLOAD",
            Utf16::default(),
            "Missing Avro schema payload",
        )
    })
}

fn inspect_document_representation(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let payload = avro_document_payload(document, ctx)?;
    if text(field(payload, "version"), "Avro payload version")? != &Utf16::from("1.12.0") {
        return Err(EngineError::new(
            "AVRO_PAYLOAD",
            Utf16::default(),
            "Unsupported Avro payload version",
        ));
    }
    let root = NativeJsonTree::from_tagged_value(required(payload, "root")?, ctx)?;
    let dependencies = parse_tree_dependencies(field(payload, "dependencies"), ctx)?;
    let mut diagnostics = inspect_payload_representation(payload, ctx)?;
    inspect_schema_metadata(root.root(), &Utf16::from("/root"), &mut diagnostics, ctx)?;
    for (index, (_, tree)) in dependencies.iter().enumerate() {
        let index = Utf16::from(index.to_string());
        let path = append_path(&Utf16::from("/dependencies"), &index, ctx)?;
        let path = append_path(&path, &Utf16::from("root"), ctx)?;
        inspect_schema_metadata(tree.root(), &path, &mut diagnostics, ctx)?;
    }
    Ok(diagnostics)
}

fn execute(request_value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = text(field(request_value, "op"), "op")?;
    let op = op
        .to_utf8()
        .map_err(|_| request("Avro operation must be ASCII"))?;
    let allowed = allowed(&op).ok_or_else(|| request("Unknown Avro operation"))?;
    validate_members(request_value, allowed, ctx)?;
    if text(field(request_value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(request("Avro wire profile mismatch"));
    }
    match op.as_str() {
        "avro.import" => {
            let id = text(field(request_value, "id"), "id")?;
            let source = text(field(request_value, "source"), "source")?;
            let dependencies = parse_dependencies(field(request_value, "dependencies"), ctx)?;
            avro_document::import_schema(id, source.units(), &dependencies, ctx)
        }
        "avro.inspectPayload" => {
            let payload = required(request_value, "payload")?;
            if text(field(payload, "version"), "Avro payload version")? != &Utf16::from("1.12.0") {
                return Err(EngineError::new(
                    "AVRO_PAYLOAD",
                    Utf16::default(),
                    "Unsupported Avro payload version",
                ));
            }
            let root = NativeJsonTree::from_tagged_value(required(payload, "root")?, ctx)?;
            let dependencies = parse_tree_dependencies(field(payload, "dependencies"), ctx)?;
            let validation = inspect_trees(&root, &dependencies, ctx)?;
            let mut diagnostics = inspect_payload_representation(payload, ctx)?;
            inspect_schema_metadata(root.root(), &Utf16::from("/root"), &mut diagnostics, ctx)?;
            for (index, (_, tree)) in dependencies.iter().enumerate() {
                let index = Utf16::from(index.to_string());
                let path = append_path(&Utf16::from("/dependencies"), &index, ctx)?;
                let path = append_path(&path, &Utf16::from("root"), ctx)?;
                inspect_schema_metadata(tree.root(), &path, &mut diagnostics, ctx)?;
            }
            diagnostics.extend(validation.diagnostics);
            diagnostics_value(diagnostics, ctx)
        }
        "avro.inspect" => {
            let document = required(request_value, "document")?;
            let inspection = avro_document::inspect_avro_document(document, ctx)?;
            let mut validation = merge_inspection(inspection);
            if validation.valid {
                let extra = inspect_document_representation(document, ctx)?;
                if !extra.is_empty() {
                    validation.complete = false;
                    validation.diagnostics.extend(extra);
                }
            }
            validation_value(validation, ctx)
        }
        "avro.fields" => {
            let root = NativeJsonTree::from_tagged_value(required(request_value, "root")?, ctx)?;
            let dependencies = parse_tree_dependencies(field(request_value, "dependencies"), ctx)?;
            let refs = dependencies
                .iter()
                .map(|(id, root)| AvroDependency { id, root })
                .collect::<Vec<_>>();
            let fields = derive_avro_fields(&root, &refs, ctx)?;
            let mut output = Vec::with_capacity(fields.len());
            for field in fields {
                let mut element = vec![
                    (Utf16::from("id"), Value::String(field.element_id)),
                    (Utf16::from("name"), Value::String(field.name)),
                    (Utf16::from("extensions"), Value::Object(Vec::new())),
                ];
                if let Some(description) = field.description {
                    element.push((Utf16::from("description"), Value::String(description)));
                }
                if let Some(scalar) = field.scalar_type {
                    element.push((
                        Utf16::from("scalarType"),
                        Value::string_utf8(scalar.as_str()),
                    ));
                }
                let mut record = vec![
                    (Utf16::from("path"), Value::String(field.path)),
                    (Utf16::from("record"), Value::String(field.record)),
                    (
                        Utf16::from("nativeField"),
                        field.native_field.tagged_value_preserving_extras(ctx)?,
                    ),
                    (Utf16::from("element"), Value::Object(element)),
                ];
                if let Some(dependency_id) = field.dependency_id {
                    record.push((Utf16::from("dependencyId"), Value::String(dependency_id)));
                }
                output.push(Value::Object(record));
            }
            Ok(Value::Array(output))
        }
        "avro.export" => avro_document::export_schema(required(request_value, "document")?, ctx)
            .map(Value::String),
        "avro.exportBundle" => {
            let bundle = avro_document::export_bundle(required(request_value, "document")?, ctx)?;
            let dependencies = bundle
                .dependencies
                .into_iter()
                .map(|(id, schema)| {
                    Value::Object(vec![
                        (Utf16::from("id"), Value::String(id)),
                        (Utf16::from("schema"), Value::String(schema)),
                    ])
                })
                .collect();
            let inspection = avro_document::inspect_avro_document(&bundle.source, ctx)?;
            let mut diagnostics = merge_inspection(inspection).diagnostics;
            diagnostics.push(Diagnostic {
                code: Utf16::from("SOURCE_ARTIFACT_REQUIRED"),
                path: Utf16::default(),
                python_source_path: false,
                message: Utf16::from(
                    "Retain source UMF for unrelated metadata and uninterpreted content",
                ),
                severity: Severity::Warning,
                python_text_origin: None,
            });
            Ok(Value::Object(vec![
                (Utf16::from("schema"), Value::String(bundle.schema_json)),
                (Utf16::from("dependencies"), Value::Array(dependencies)),
                (Utf16::from("source"), bundle.source),
                (
                    Utf16::from("diagnostics"),
                    diagnostics_value(diagnostics, ctx)?,
                ),
            ]))
        }
        "avro.getNode" => {
            let document = required(request_value, "document")?;
            let path = text(field(request_value, "path"), "path")?;
            let dependency_id = field(request_value, "dependencyId")
                .map(|value| text(Some(value), "dependencyId"))
                .transpose()?;
            avro_document::get_node(document, path, dependency_id, ctx)?
                .tagged_value_preserving_extras(ctx)
        }
        "avro.editNode" | "avro.proposeNodeEdit" => {
            let document = required(request_value, "document")?;
            let path = text(field(request_value, "path"), "path")?;
            let replacement = text(field(request_value, "replacementJson"), "replacementJson")?;
            let dependency_id = field(request_value, "dependencyId")
                .map(|value| text(Some(value), "dependencyId"))
                .transpose()?;
            let proposal = avro_document::propose_avro_node_edit(
                document,
                path,
                replacement.units(),
                dependency_id,
                ctx,
            )?;
            if op == "avro.editNode" {
                field(&proposal, "document")
                    .map(|document| umf_core::value::copy_json(document, ctx))
                    .transpose()?
                    .ok_or_else(|| request("Avro edit proposal has no document"))
            } else {
                Ok(proposal)
            }
        }
        _ => Err(request("Unknown Avro operation")),
    }
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        execute(&request, &mut ctx).and_then(|output| encode(&output, &mut ctx))
    })();
    result_envelope(result)
}
