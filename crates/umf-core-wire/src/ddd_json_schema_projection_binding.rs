// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed transport for the DDD document projection profile.
use std::collections::BTreeSet;

use crate::{decode, encode, field, result_envelope};
use umf_core::{
    copy_json, ddd_graphql_projection,
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
const PROJECT_ENTITIES_GRAPHQL: &str = "ddd-json-schema-projection.projectDddEntitiesToGraphql";
const PROJECT_GRAPHQL: &str = "ddd-json-schema-projection.projectDddToGraphql";
const VERIFY_GRAPHQL: &str = "ddd-json-schema-projection.verifyDddGraphqlProjection";
const RECOVER_GRAPHQL: &str = "ddd-json-schema-projection.recoverDddFromGraphql";
const RECOVER_GRAPHQL_NATIVE: &str = "ddd-json-schema-projection.recoverDddGraphqlNative";
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
            "policy",
            "lossPolicy",
            "receipt",
            "currentTarget",
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
    let operation = text(field(value, "op"), "op")?;
    if operation == &Utf16::from(PROJECT_ENTITIES_GRAPHQL)
        || operation == &Utf16::from(PROJECT_GRAPHQL)
    {
        let document = field(value, "document").ok_or_else(|| request("document is required"))?;
        let policy = field(value, "policy").ok_or_else(|| request("policy is required"))?;
        let loss = text(field(value, "lossPolicy"), "lossPolicy")?
            .to_utf8()
            .map_err(|_| request("lossPolicy must be valid UTF-16"))?;
        let full = operation == &Utf16::from(PROJECT_GRAPHQL);
        let mut report = ddd_graphql_projection::project(document, policy, &loss, full, ctx)?;
        return attach_graphql_target(&mut report, full, ctx);
    }
    if operation == &Utf16::from(VERIFY_GRAPHQL)
        || operation == &Utf16::from(RECOVER_GRAPHQL)
        || operation == &Utf16::from(RECOVER_GRAPHQL_NATIVE)
    {
        let receipt = field(value, "receipt").ok_or_else(|| request("receipt is required"))?;
        let document = field(receipt, "logical").ok_or_else(|| {
            EngineError::new(
                "DDD_GRAPHQL_RECEIPT",
                Utf16::default(),
                "Projection receipt has no logical source",
            )
        })?;
        let policy = field(receipt, "policy").ok_or_else(|| {
            EngineError::new(
                "DDD_GRAPHQL_RECEIPT",
                Utf16::default(),
                "Projection receipt has no policy",
            )
        })?;
        let loss = field(receipt, "lossPolicy")
            .and_then(|v| {
                if let Value::String(s) = v {
                    s.to_utf8().ok()
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "report".to_owned());
        if field(receipt, "operation")
            .and_then(|v| {
                if let Value::String(s) = v {
                    s.to_utf8().ok()
                } else {
                    None
                }
            })
            .as_deref()
            != Some("project-ddd-graphql")
        {
            return Err(EngineError::new(
                "DDD_GRAPHQL_RECEIPT",
                Utf16::default(),
                "Expected a full DDD GraphQL projection receipt",
            ));
        }
        let mut expected = ddd_graphql_projection::project(document, policy, &loss, true, ctx)?;
        attach_graphql_target(&mut expected, true, ctx)?;
        if let Some(current) = field(value, "currentTarget") {
            let mut target = copy_json(current, ctx)?;
            let target_id = field(&expected, "targetArchive")
                .and_then(|v| field(v, "id"))
                .cloned()
                .unwrap_or(Value::Null);
            set_field(&mut target, "id", target_id);
            if field(&expected, "targetArchive") != Some(&target) {
                return Err(EngineError::new(
                    "DDD_GRAPHQL_RECEIPT",
                    Utf16::default(),
                    "Forged or stale GraphQL projection report",
                ));
            }
        }
        if !json_equal(&expected, receipt, ctx)? {
            return Err(EngineError::new(
                "DDD_GRAPHQL_RECEIPT",
                Utf16::default(),
                "Forged or stale GraphQL projection report",
            ));
        }
        if operation == &Utf16::from(VERIFY_GRAPHQL) {
            return Ok(expected);
        }
        if field(value, "currentTarget").is_none() {
            return Err(request("currentTarget is required"));
        }
        if let Some(target) = field(&expected, "targetArchive") {
            let _ = target;
        } else {
            return Err(EngineError::new(
                "DDD_GRAPHQL_RECOVERY",
                Utf16::default(),
                "Blocked projection has no native recovery",
            ));
        }
        if operation == &Utf16::from(RECOVER_GRAPHQL) {
            if field(value, "currentTarget").is_none() {
                return Err(request("currentTarget is required"));
            }
            return copy_json(document, ctx);
        }
        return field(&expected, "candidate").cloned().ok_or_else(|| {
            EngineError::new(
                "DDD_GRAPHQL_RECOVERY",
                Utf16::default(),
                "Blocked projection has no native recovery",
            )
        });
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
fn field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = value {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn set_field(value: &mut Value, name: &str, replacement: Value) {
    if let Some(slot) = field_mut(value, name) {
        *slot = replacement;
    }
}
fn json_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    match (a, b) {
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Ok(false);
            }
            for (left, right) in left.iter().zip(right) {
                ctx.charge_work(1, Utf16::default())?;
                if !json_equal(left, right, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(left), Value::Object(right)) => {
            if left.len() != right.len() {
                return Ok(false);
            }
            for (key, value) in left {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                let Some((_, other)) = right.iter().find(|(candidate, _)| candidate == key) else {
                    return Ok(false);
                };
                if !json_equal(value, other, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(a == b),
    }
}
#[cfg(feature = "embedded-adapters")]
fn attach_graphql_target(
    report: &mut Value,
    full: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let status = field(report, "status")
        .and_then(|v| {
            if let Value::String(s) = v {
                s.to_utf8().ok()
            } else {
                None
            }
        })
        .unwrap_or_default();
    if status != "blocked" {
        let candidate = field(report, "candidate")
            .and_then(|v| {
                if let Value::String(s) = v {
                    s.to_utf8().ok()
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                EngineError::new(
                    "DDD_GRAPHQL_TARGET",
                    Utf16::default(),
                    "Candidate SDL is missing",
                )
            })?;
        let mut resources = umf_graphql::engine_registry::GraphqlResources::new(ctx)?;
        let target = umf_graphql::engine_registry::import_sdl(
            &mut resources,
            &candidate,
            if full {
                "ddd-graphql-target"
            } else {
                "ddd-graphql-entities-target"
            },
            Some("schema"),
            ctx,
        )
        .map_err(|_| {
            EngineError::new(
                "DDD_GRAPHQL_TARGET",
                Utf16::default(),
                "Generated SDL failed native schema-mode import",
            )
        })?;
        let emitted = umf_graphql::engine_registry::export_sdl(&mut resources, &target, ctx)?;
        if emitted.to_utf8().ok().as_deref() != Some(candidate.as_str()) {
            return Err(EngineError::new(
                "DDD_GRAPHQL_TARGET",
                Utf16::default(),
                "Native GraphQL SDL export changed the candidate",
            ));
        }
        if let Value::Object(fields) = report {
            fields.push((Utf16::from("targetArchive"), target));
        }
    }
    if full {
        let diagnostics = field(report, "residuals")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a.as_slice())
                } else {
                    None
                }
            })
            .unwrap_or(&[])
            .iter()
            .map(|r| {
                Value::Object(vec![
                    (Utf16::from("code"), Value::string_utf8("DDD_GRAPHQL_LOSS")),
                    (
                        Utf16::from("path"),
                        field(r, "path").cloned().unwrap_or(Value::Null),
                    ),
                    (Utf16::from("severity"), Value::string_utf8("warning")),
                    (
                        Utf16::from("message"),
                        field(r, "reason").cloned().unwrap_or(Value::Null),
                    ),
                ])
            })
            .collect();
        if let Value::Object(fields) = report {
            if let Some((_, slot)) = fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("diagnostics"))
            {
                *slot = Value::Array(diagnostics);
            }
        }
    }
    let _ = ctx;
    Ok(report.clone())
}
#[cfg(not(feature = "embedded-adapters"))]
fn attach_graphql_target(
    _report: &mut Value,
    _full: bool,
    _ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Err(EngineError::new(
        "DDD_GRAPHQL_TARGET",
        Utf16::default(),
        "GraphQL adapter support is disabled",
    ))
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
