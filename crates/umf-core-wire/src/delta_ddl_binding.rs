// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire operations for managed Delta DDL proposals.

use umf_core::{
    delta_ddl::{self, DeltaDdlResources},
    Context, Diagnostic, EngineError, Severity, Utf16, Value,
};

pub const PROFILE: &str = "umf-r8-delta-ddl/0.1.0";

pub fn execute_json(input: &str) -> String {
    let mut control = |_amount: usize| Ok(());
    execute_json_with_control(input, &mut control)
}

pub fn execute_json_with_control(
    input: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = super::decode(input, &mut ctx)?;
        if text(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(fail(
                "REQUEST",
                "umf-r8-delta-ddl/0.1.0 profile is required",
            ));
        }
        let operation = text(&request, "op")
            .ok_or_else(|| fail("REQUEST", "Delta DDL operation is required"))?;
        let output = match operation.as_str() {
            "delta.ddl.defineTable" => {
                exact_request(
                    &request,
                    &["profile", "op", "source", "definition", "id"],
                    &mut ctx,
                )?;
                let source = required_text(&request, "source")?;
                let id = required_text(&request, "id")?;
                let definition = field(&request, "definition")
                    .ok_or_else(|| fail("REQUEST", "Delta definition is required"))?;
                let resources = DeltaDdlResources::new(&mut ctx)?;
                Ok(delta_ddl::define_delta_table(
                    source.units(),
                    definition,
                    id,
                    &resources,
                    &mut ctx,
                )?)
            }
            "delta.ddl.generate" => {
                exact_request(&request, &["profile", "op", "document"], &mut ctx)?;
                let document = field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Delta document is required"))?;
                let resources = DeltaDdlResources::new(&mut ctx)?;
                let proposal =
                    delta_ddl::generate_delta_ddl_document(document, &resources, &mut ctx)?;
                Ok(object(vec![
                    ("sql", Value::String(proposal.sql)),
                    ("definition", proposal.definition),
                    ("schemaJson", Value::String(proposal.schema_json)),
                    ("qualification", Value::String(proposal.qualification)),
                ]))
            }
            "delta.ddl.generateBundle" => {
                exact_request(&request, &["profile", "op", "documents"], &mut ctx)?;
                let documents = field(&request, "documents")
                    .ok_or_else(|| fail("REQUEST", "Delta document bundle is required"))?;
                let resources = DeltaDdlResources::new(&mut ctx)?;
                Ok(delta_ddl::generate_delta_ddl_bundle(
                    documents, &resources, &mut ctx,
                )?)
            }
            "delta.ddl.realizeSparkDelta4" => {
                exact_request(&request, &["profile", "op", "document", "target"], &mut ctx)?;
                let document = field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Delta document is required"))?;
                let target = field(&request, "target")
                    .ok_or_else(|| fail("REQUEST", "Spark Delta target is required"))?;
                let resources = DeltaDdlResources::new(&mut ctx)?;
                Ok(delta_ddl::realize_spark_delta4_ddl_document(
                    document, target, &resources, &mut ctx,
                )?)
            }
            "delta.ddl.inspectPayload" => {
                exact_request(&request, &["profile", "op", "payload"], &mut ctx)?;
                let payload = field(&request, "payload")
                    .ok_or_else(|| fail("REQUEST", "Delta definition payload is required"))?;
                let diagnostics = delta_ddl::inspect_delta_definition_payload(payload, &mut ctx)?;
                diagnostics_value(diagnostics, &mut ctx)
            }
            _ => Err(fail("REQUEST", "Unknown Delta DDL operation")),
        }?;
        super::encode(&output, &mut ctx)
    })();
    super::result_envelope(result)
}

fn exact_request(
    request: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = request else {
        return Err(fail("REQUEST", "Request must be an object"));
    };
    let duplicate_work = fields.len().saturating_mul(fields.len());
    ctx.charge_work(duplicate_work, Utf16::default())?;
    for (index, (key, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|allowed| key == &Utf16::from(*allowed)) {
            return Err(fail("REQUEST", "Unknown Delta DDL request field"));
        }
        if fields[..index].iter().any(|(previous, _)| previous == key) {
            return Err(fail("REQUEST", "Duplicate Delta DDL request field"));
        }
    }
    Ok(())
}

fn diagnostics_value(
    diagnostics: Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    let mut rows = Vec::new();
    rows.try_reserve(diagnostics.len())
        .map_err(|_| fail("LIMIT", "Diagnostic output allocation refused"))?;
    for diagnostic in diagnostics {
        let text_units = diagnostic
            .code
            .len()
            .saturating_add(diagnostic.path.len())
            .saturating_add(diagnostic.message.len());
        ctx.charge_text(text_units, Utf16::default())?;
        rows.push(object(vec![
            ("code", Value::String(diagnostic.code)),
            ("path", Value::String(diagnostic.path)),
            (
                "pythonSourcePath",
                Value::Bool(diagnostic.python_source_path),
            ),
            ("message", Value::String(diagnostic.message)),
            (
                "severity",
                Value::string_utf8(match diagnostic.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    Ok(Value::Array(rows))
}

fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name.to_utf8().ok().as_deref() == Some(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn required_text<'a>(value: &'a Value, key: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, key) {
        Some(Value::String(text)) => Ok(text),
        _ => Err(fail("REQUEST", &format!("{key} must be text"))),
    }
}

fn text(value: &Value, key: &str) -> Option<String> {
    match field(value, key) {
        Some(Value::String(text)) => text.to_utf8().ok(),
        _ => None,
    }
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;

    fn definition() -> Value {
        object(vec![
            (
                "profile",
                Value::string_utf8("databricks-managed-delta/0.1"),
            ),
            (
                "name",
                Value::Array(vec![
                    Value::string_utf8("catalog"),
                    Value::string_utf8("schema"),
                    Value::string_utf8("items"),
                ]),
            ),
            ("clusterBy", Value::Array(vec![Value::string_utf8("id")])),
            ("partitionBy", Value::Array(vec![])),
            ("properties", Value::Object(vec![])),
        ])
    }

    fn request(op: &str, fields: &[(&str, Value)]) -> String {
        let mut members = vec![
            (Utf16::from("profile"), Value::string_utf8(PROFILE)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        members.extend(
            fields
                .iter()
                .map(|(key, value)| (Utf16::from(*key), value.clone())),
        );
        super::super::encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
    }

    fn success_value(envelope: &str) -> Value {
        let json: Json = serde_json::from_str(envelope).unwrap();
        assert_eq!(json["status"], "ok");
        super::super::decode(json["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
    }

    #[test]
    fn define_then_generate_preserves_source_and_returns_managed_create() {
        let source = "{\n  \"type\": \"struct\",\n  \"fields\": [{\"name\":\"id\",\"type\":\"long\",\"nullable\":false,\"metadata\":{}}]\n}";
        let authored = definition();
        let imported = success_value(&execute_json(&request(
            "delta.ddl.defineTable",
            &[
                ("source", Value::string_utf8(source)),
                ("id", Value::string_utf8("table/orders")),
                ("definition", authored),
            ],
        )));
        let generated = success_value(&execute_json(&request(
            "delta.ddl.generate",
            &[("document", imported.clone())],
        )));
        let sql = match field(&generated, "sql") {
            Some(Value::String(value)) => value.to_utf8().unwrap(),
            _ => panic!("SQL string missing"),
        };
        assert!(sql.contains("CREATE TABLE `catalog`.`schema`.`items`"));
        let schema_json = match field(&generated, "schemaJson") {
            Some(Value::String(value)) => value.to_utf8().unwrap(),
            _ => panic!("schemaJson string missing"),
        };
        assert_eq!(schema_json, source);
    }

    #[test]
    fn unknown_definition_content_is_refused_before_sql_is_returned() {
        let mut authored = definition();
        if let Value::Object(fields) = &mut authored {
            fields.push((Utf16::from("futureMeaning"), Value::string_utf8("retain")));
        }
        let response: Json = serde_json::from_str(&execute_json(&request(
            "delta.ddl.defineTable",
            &[
                ("source", Value::string_utf8(r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#)),
                ("id", Value::string_utf8("table/orders")),
                ("definition", authored),
            ],
        ))).unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "DELTA_DDL_UNSUPPORTED");
    }
}
