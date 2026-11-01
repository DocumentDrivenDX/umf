// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed transport for the DDD document projection profile.
use std::collections::BTreeSet;

use crate::{decode, encode, field, result_envelope};
use umf_core::{
    ddd_json_schema_projection::{self, Bindings, LossPolicy},
    Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.ddd-json-schema-projection-wire/1";
pub const OPERATION: &str = "ddd-json-schema-projection.projectDddToJsonSchema";
const FIELD_BINDING_OPERATION: &str = "ddd-json-schema-projection.dddFieldBinding";
const INSPECT_OPERATION: &str = "ddd-json-schema-projection.inspectDdd";
const VALIDATE_PAYLOAD_OPERATION: &str = "ddd-json-schema-projection.validateDddPayload";
const GET_DEFINITION_OPERATION: &str = "ddd-json-schema-projection.getDddDefinition";
const EDIT_DEFINITION_OPERATION: &str = "ddd-json-schema-projection.editDddDefinition";
fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(v)) => Ok(v),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}
fn parse_bindings(value: &Value, ctx: &mut Context<'_>) -> Result<Bindings, EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("bindings must be an object"));
    };
    let allowed = [
        "id",
        "schemaId",
        "root",
        "closedObjects",
        "integer",
        "decimal",
        "dateTime",
        "bytes",
        "collection",
        "relations",
        "lossPolicy",
    ];
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(1, Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) || !seen.insert(key) {
            return Err(EngineError::new(
                "DDD_BINDINGS",
                Utf16::default(),
                "Bindings contain an unknown or duplicate member",
            ));
        }
    }
    let root = field(value, "root").ok_or_else(|| request("root is required"))?;
    let Value::Object(root_fields) = root else {
        return Err(EngineError::new(
            "DDD_BINDINGS",
            Utf16::default(),
            "root must name a module and element",
        ));
    };
    if root_fields.len() != 2
        || root_fields.iter().any(|(k, _)| {
            !(["module", "element"].contains(&k.to_utf8().unwrap_or_default().as_str()))
        })
        || field(root, "module").is_none()
        || field(root, "element").is_none()
    {
        return Err(EngineError::new(
            "DDD_BINDINGS",
            Utf16::default(),
            "root must contain only module and element",
        ));
    }
    let Value::Bool(closed_objects) =
        field(value, "closedObjects").ok_or_else(|| request("closedObjects is required"))?
    else {
        return Err(request("closedObjects must be a boolean"));
    };
    for (key, expected) in [
        ("integer", "json-integer"),
        ("decimal", "decimal-string"),
        ("dateTime", "string"),
        ("bytes", "hex-string"),
        ("collection", "array"),
    ] {
        if text(field(value, key), key)? != &Utf16::from(expected) {
            return Err(EngineError::new(
                "DDD_BINDINGS",
                Utf16::default(),
                "Only documented DDD document bindings are supported",
            ));
        }
    }
    let loss_text = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| {
            EngineError::new(
                "DDD_BINDINGS",
                Utf16::default(),
                "Loss policy must be valid UTF-16",
            )
        })?;
    let loss = match loss_text.as_str() {
        "strict" => LossPolicy::Strict,
        "allow-reported-loss" => LossPolicy::AllowReportedLoss,
        _ => {
            return Err(EngineError::new(
                "DDD_BINDINGS",
                Utf16::default(),
                "Unsupported loss policy",
            ))
        }
    };
    let Value::Object(relations) =
        field(value, "relations").ok_or_else(|| request("relations is required"))?
    else {
        return Err(request("relations must be an object"));
    };
    let mut mapped = Vec::new();
    for (key, relation) in relations {
        let mode = text(Some(relation), "relationship binding")?;
        if mode != &Utf16::from("embed") && mode != &Utf16::from("identity") {
            return Err(EngineError::new(
                "DDD_BINDINGS",
                Utf16::default(),
                "Relationship binding must be embed or identity",
            ));
        }
        mapped.push((key.clone(), mode.clone()));
    }
    Ok(Bindings {
        id: text(field(value, "id"), "id")?.clone(),
        schema_id: text(field(value, "schemaId"), "schemaId")?.clone(),
        root_module: text(field(root, "module"), "root.module")?.clone(),
        root_element: text(field(root, "element"), "root.element")?.clone(),
        closed_objects: *closed_objects,
        loss_policy: loss,
        relations: mapped,
    })
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(1, Utf16::default())?;
        if ![
            "profile",
            "op",
            "document",
            "bindings",
            "module",
            "element",
            "field",
            "payload",
            "path",
            "scope",
            "replacement",
        ]
        .iter()
        .any(|name| key == &Utf16::from(*name))
            || !seen.insert(key)
        {
            return Err(request("request contains an unknown or duplicate member"));
        }
    }
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(request("wrong DDD projection profile"));
    }
    if text(field(value, "op"), "op")? == &Utf16::from(INSPECT_OPERATION) {
        let document = field(value, "document").ok_or_else(|| request("document is required"))?;
        let validation = ddd_json_schema_projection::inspect_ddd_document(document, ctx)?;
        return validation_value(validation, ctx);
    }
    if text(field(value, "op"), "op")? == &Utf16::from(GET_DEFINITION_OPERATION) {
        let document = field(value, "document").ok_or_else(|| request("document is required"))?;
        let module = text(field(value, "module"), "module")?;
        let element = text(field(value, "element"), "element")?;
        return ddd_json_schema_projection::get_ddd_definition(document, module, element, ctx);
    }
    if text(field(value, "op"), "op")? == &Utf16::from(EDIT_DEFINITION_OPERATION) {
        let document = field(value, "document").ok_or_else(|| request("document is required"))?;
        let module = text(field(value, "module"), "module")?;
        let element = text(field(value, "element"), "element")?;
        let replacement =
            field(value, "replacement").ok_or_else(|| request("replacement is required"))?;
        return ddd_json_schema_projection::edit_ddd_definition(
            document,
            module,
            element,
            replacement,
            ctx,
        );
    }
    if text(field(value, "op"), "op")? == &Utf16::from(VALIDATE_PAYLOAD_OPERATION) {
        let document = field(value, "document").ok_or_else(|| request("document is required"))?;
        let payload = field(value, "payload").ok_or_else(|| request("payload is required"))?;
        let path = text(field(value, "path"), "path")?.clone();
        let scope = text(field(value, "scope"), "scope")?
            .to_utf8()
            .map_err(|_| request("scope must be valid UTF-16"))?;
        let diagnostics = ddd_json_schema_projection::validate_ddd_payload(
            document, payload, &path, &scope, ctx,
        )?;
        return diagnostics_value(diagnostics, ctx);
    }
    if text(field(value, "op"), "op")? == &Utf16::from(FIELD_BINDING_OPERATION) {
        let module = text(field(value, "module"), "module")?;
        let element = text(field(value, "element"), "element")?;
        let field_name = text(field(value, "field"), "field")?;
        return Ok(Value::String(ddd_json_schema_projection::field_binding(
            module, element, field_name,
        )?));
    }
    if text(field(value, "op"), "op")? != &Utf16::from(OPERATION) {
        return Err(request("unknown DDD projection operation"));
    }
    let document = field(value, "document").ok_or_else(|| request("document is required"))?;
    let bindings = parse_bindings(
        field(value, "bindings").ok_or_else(|| request("bindings are required"))?,
        ctx,
    )?;
    ddd_json_schema_projection::project(document, &bindings, ctx)
}
fn validation_value(
    value: umf_core::Validation,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let valid = value.valid;
    let complete = value.complete;
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(valid)),
        (Utf16::from("complete"), Value::Bool(complete)),
        (
            Utf16::from("diagnostics"),
            diagnostics_value(value.diagnostics, ctx)?,
        ),
    ]))
}
fn diagnostics_value(
    diagnostics: Vec<umf_core::Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    Ok(Value::Array(
        diagnostics
            .into_iter()
            .map(|d| {
                Value::Object(vec![
                    (Utf16::from("code"), Value::String(d.code)),
                    (Utf16::from("path"), Value::String(d.path)),
                    (Utf16::from("message"), Value::String(d.message)),
                    (
                        Utf16::from("severity"),
                        Value::string_utf8(if d.severity == umf_core::Severity::Error {
                            "error"
                        } else {
                            "warning"
                        }),
                    ),
                ])
            })
            .collect(),
    ))
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let input = decode(wire, &mut ctx)?;
        execute(&input, &mut ctx).and_then(|out| encode(&out, &mut ctx))
    })();
    result_envelope(result)
}
