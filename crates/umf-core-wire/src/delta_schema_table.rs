// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged-wire entrypoint for the bounded Delta schema/table source
//! operations. Host adapters route through the closed native-family dispatcher.

use umf_core::{
    delta_schema::{self, DeltaSchemaResources},
    delta_table::{self, DeltaTableResources},
    native_json::NativeJsonNode,
    Context, Diagnostic, EngineError, Severity, Utf16, Value,
};

pub const PROFILE: &str = "umf-r8-delta-source/0.1.0";

/// Execute one of the ten opt-in Delta schema/table source operations.
/// Requests use the ordinary closed `umf.core-wire/1` tagged value grammar.
pub fn execute_json(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_json_with_control(wire_json, &mut no_control)
}

/// Execute with an invocation-local control hook covering request admission,
/// pinned resource construction, the operation and response encoding.
pub fn execute_json_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = super::decode(wire_json, &mut ctx)?;
        if text(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(fail(
                "REQUEST",
                "umf-r8-delta-source/0.1.0 profile is required",
            ));
        }
        let op =
            text(&request, "op").ok_or_else(|| fail("REQUEST", "Delta operation is required"))?;
        let schema_ops = [
            "delta/schema.import",
            "delta/schema.inspect",
            "delta/schema.inspectPayload",
            "delta/schema.export",
            "delta/schema.getNode",
            "delta/schema.proposeNodeEdit",
        ];
        let table_ops = [
            "delta/table.import",
            "delta/table.inspect",
            "delta/table.inspectPayload",
            "delta/table.export",
            "delta/table.getNode",
            "delta/table.getSchema",
            "delta/table.proposeNodeEdit",
            "delta/table.renameMappedField",
        ];
        if !schema_ops.contains(&op.as_str()) && !table_ops.contains(&op.as_str()) {
            return Err(fail("REQUEST", "Unknown Delta source operation"));
        }
        let schema = schema_ops.contains(&op.as_str());
        let value = if schema {
            let resources = DeltaSchemaResources::new(&mut ctx)?;
            execute_schema(&op, &request, &resources, &mut ctx)?
        } else {
            let resources = DeltaTableResources::new(&mut ctx)?;
            execute_table(&op, &request, &resources, &mut ctx)?
        };
        super::encode(&value, &mut ctx)
    })();
    super::result_envelope(result)
}

fn execute_schema(
    op: &str,
    request: &Value,
    resources: &DeltaSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let document =
        || field(request, "document").ok_or_else(|| fail("REQUEST", "Delta document is required"));
    match op {
        "delta/schema.import" => Ok(delta_schema::import_delta_schema(
            text_value(request, "source")?.units(),
            text_value(request, "id")?,
            resources,
            ctx,
        )?),
        "delta/schema.export" => Ok(Value::String(delta_schema::export_delta_schema(
            document()?,
            resources,
            ctx,
        )?)),
        "delta/schema.inspect" => Ok(validation_value(delta_schema::inspect_delta_schema(
            document()?,
            resources,
            ctx,
        )?)),
        "delta/schema.inspectPayload" => Ok(diagnostics_value(
            delta_schema::inspect_delta_schema_payload(
                field(request, "payload")
                    .ok_or_else(|| fail("REQUEST", "Delta payload is required"))?,
                resources,
                ctx,
            )?,
        )),
        "delta/schema.getNode" => Ok(delta_schema::get_delta_node(
            document()?,
            text_value(request, "pointer")?,
            resources,
            ctx,
        )?
        .tagged_value_preserving_extras(ctx)?),
        "delta/schema.proposeNodeEdit" => {
            let (document, validation) = delta_schema::propose_delta_node_edit(
                document()?,
                text_value(request, "pointer")?,
                text_value(request, "replacement")?.units(),
                resources,
                ctx,
            )?;
            Ok(object(vec![
                ("document", document),
                ("validation", validation_value(validation)),
            ]))
        }
        _ => Err(fail("REQUEST", "Unknown Delta source operation")),
    }
}

fn execute_table(
    op: &str,
    request: &Value,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let document =
        || field(request, "document").ok_or_else(|| fail("REQUEST", "Delta document is required"));
    match op {
        "delta/table.import" => Ok(delta_table::import_delta_table(
            text_value(request, "source")?.units(),
            text_value(request, "id")?,
            resources,
            ctx,
        )?),
        "delta/table.export" => Ok(Value::String(delta_table::export_delta_table(
            document()?,
            resources,
            ctx,
        )?)),
        "delta/table.inspect" => Ok(validation_value(delta_table::inspect_delta_table(
            document()?,
            resources,
            ctx,
        )?)),
        "delta/table.inspectPayload" => {
            Ok(diagnostics_value(delta_table::inspect_delta_table_payload(
                field(request, "payload")
                    .ok_or_else(|| fail("REQUEST", "Delta table payload is required"))?,
                resources,
                ctx,
            )?))
        }
        "delta/table.getNode" => Ok(delta_table::get_delta_table_node(
            document()?,
            text_value(request, "pointer")?,
            resources,
            ctx,
        )?
        .tagged_value_preserving_extras(ctx)?),
        "delta/table.getSchema" => {
            let document = document()?;
            let pointer = Utf16::from("/metaData/schemaString");
            let schema_tree =
                delta_table::get_delta_table_node(document, &pointer, resources, ctx)?;
            let NativeJsonNode::String(source) = schema_tree.root() else {
                return Err(fail(
                    "DELTA_TABLE_SCHEMA",
                    "Delta metadata schemaString must be a string",
                ));
            };
            let id = field(document, "id")
                .and_then(as_text)
                .ok_or_else(|| fail("DELTA_TABLE_SCHEMA", "Document id is required"))?;
            let suffix = Utf16::from("/schema");
            let id_units = id.len().saturating_add(suffix.len());
            ctx.charge_text(id_units, Utf16::from("/id"))?;
            let mut schema_id_units = Vec::new();
            schema_id_units.try_reserve(id_units).map_err(|_| {
                EngineError::new("LIMIT", Utf16::from("/id"), "Text-unit limit exceeded")
            })?;
            schema_id_units.extend_from_slice(id.units());
            schema_id_units.extend_from_slice(suffix.units());
            let schema_id = Utf16::new(schema_id_units);
            let schema_resources = DeltaSchemaResources::new(ctx)?;
            Ok(delta_schema::import_delta_schema(
                source.units(),
                &schema_id,
                &schema_resources,
                ctx,
            )?)
        }
        "delta/table.proposeNodeEdit" => {
            let (document, validation) = delta_table::propose_delta_table_node_edit(
                document()?,
                text_value(request, "pointer")?,
                text_value(request, "replacement")?.units(),
                resources,
                ctx,
            )?;
            Ok(object(vec![
                ("document", document),
                ("validation", validation_value(validation)),
            ]))
        }
        "delta/table.renameMappedField" => Ok(delta_table::rename_delta_mapped_field(
            document()?,
            field(request, "options")
                .ok_or_else(|| fail("REQUEST", "Delta rename options object is required"))?,
            resources,
            ctx,
        )?),
        _ => Err(fail("REQUEST", "Unknown Delta source operation")),
    }
}

fn text(request: &Value, key: &str) -> Option<String> {
    field(request, key)
        .and_then(as_text)
        .and_then(|s| s.to_utf8().ok())
}
fn text_value<'a>(request: &'a Value, key: &str) -> Result<&'a Utf16, EngineError> {
    field(request, key)
        .and_then(as_text)
        .ok_or_else(|| fail("REQUEST", &format!("Delta {key} string is required")))
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn as_text(value: &Value) -> Option<&Utf16> {
    if let Value::String(text) = value {
        Some(text)
    } else {
        None
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn validation_value(v: umf_core::Validation) -> Value {
    object(vec![
        ("valid", Value::Bool(v.valid)),
        ("complete", Value::Bool(v.complete)),
        (
            "diagnostics",
            Value::Array(v.diagnostics.into_iter().map(diagnostic_value).collect()),
        ),
    ])
}
fn diagnostics_value(items: Vec<Diagnostic>) -> Value {
    Value::Array(items.into_iter().map(diagnostic_value).collect())
}
fn diagnostic_value(d: Diagnostic) -> Value {
    object(vec![
        ("code", Value::String(d.code)),
        ("path", Value::String(d.path)),
        ("message", Value::String(d.message)),
        (
            "severity",
            Value::string_utf8(if d.severity == Severity::Warning {
                "warning"
            } else {
                "error"
            }),
        ),
    ])
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
