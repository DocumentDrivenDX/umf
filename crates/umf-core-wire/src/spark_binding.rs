// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire operations for the Spark schema source profile.
use umf_core::{
    spark_schema::{self, SparkSchemaResources},
    Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.spark-wire/1";
const OPS: &[&str] = &[
    "spark.import",
    "spark.inspect",
    "spark.inspectPayload",
    "spark.export",
    "spark.getNode",
    "spark.editNode",
    "spark.renameField",
];

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = super::decode(wire, &mut ctx)?;
        let fields =
            object(&request).ok_or_else(|| fail("REQUEST", "Expected a tagged request object"))?;
        let op =
            text(&request, "op").ok_or_else(|| fail("REQUEST", "Spark operation is required"))?;
        let allowed: &[&str] = match op.as_str() {
            "spark.import" => &["profile", "op", "source", "id"],
            "spark.inspectPayload" => &["profile", "op", "payload"],
            "spark.inspect" | "spark.export" => &["profile", "op", "document"],
            "spark.getNode" => &["profile", "op", "document", "pointer"],
            "spark.editNode" => &["profile", "op", "document", "pointer", "replacement"],
            "spark.renameField" => &["profile", "op", "document", "options"],
            _ => return Err(fail("REQUEST", "Unknown Spark schema operation")),
        };
        exact(fields, allowed)?;
        if text(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(fail("REQUEST", "umf.spark-wire/1 profile is required"));
        }
        if !OPS.contains(&op.as_str()) {
            return Err(fail("REQUEST", "Unknown Spark schema operation"));
        }
        let resources = SparkSchemaResources::new(&mut ctx)?;
        let document = || {
            field(&request, "document").ok_or_else(|| fail("REQUEST", "Spark document is required"))
        };
        let output = match op.as_str() {
            "spark.import" => spark_schema::import_spark_schema(
                text_value(&request, "source")?.units(),
                text_value(&request, "id")?,
                &resources,
                &mut ctx,
            )?,
            "spark.inspect" => validation_value(spark_schema::inspect_spark_schema(
                document()?,
                &resources,
                &mut ctx,
            )?),
            "spark.inspectPayload" => {
                diagnostics_value(spark_schema::inspect_spark_schema_payload(
                    field(&request, "payload")
                        .ok_or_else(|| fail("REQUEST", "Spark payload is required"))?,
                    &resources,
                    &mut ctx,
                )?)
            }
            "spark.export" => Value::String(spark_schema::export_spark_schema(
                document()?,
                &resources,
                &mut ctx,
            )?),
            "spark.getNode" => spark_schema::get_spark_node(
                document()?,
                text_value(&request, "pointer")?,
                &resources,
                &mut ctx,
            )?
            .tagged_value_preserving_extras(&mut ctx)?,
            "spark.editNode" => {
                let (document, validation) = spark_schema::propose_spark_node_edit(
                    document()?,
                    text_value(&request, "pointer")?,
                    text_value(&request, "replacement")?.units(),
                    &resources,
                    &mut ctx,
                )?;
                object_value(vec![
                    ("document", document),
                    ("validation", validation_value(validation)),
                ])
            }
            "spark.renameField" => spark_schema::rename_spark_field(
                document()?,
                field(&request, "options")
                    .ok_or_else(|| fail("REQUEST", "Spark rename options are required"))?,
                &resources,
                &mut ctx,
            )?,
            _ => return Err(fail("REQUEST", "Unknown Spark schema operation")),
        };
        super::encode(&output, &mut ctx)
    })();
    super::result_envelope(result)
}

fn exact(fields: &[(Utf16, Value)], allowed: &[&str]) -> Result<(), EngineError> {
    if fields.len() != allowed.len()
        || fields
            .iter()
            .any(|(k, _)| !allowed.iter().any(|n| k == &Utf16::from(*n)))
        || allowed
            .iter()
            .any(|n| fields.iter().filter(|(k, _)| k == &Utf16::from(*n)).count() != 1)
    {
        return Err(fail("REQUEST", "Expected exact Spark request members"));
    }
    Ok(())
}
fn text(request: &Value, key: &str) -> Option<String> {
    field(request, key)
        .and_then(as_text)
        .and_then(|s| s.to_utf8().ok())
}
fn text_value<'a>(request: &'a Value, key: &str) -> Result<&'a Utf16, EngineError> {
    field(request, key)
        .and_then(as_text)
        .ok_or_else(|| fail("REQUEST", "Expected Spark string member"))
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    object(value)?
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(fields) = value {
        Some(fields)
    } else {
        None
    }
}
fn as_text(value: &Value) -> Option<&Utf16> {
    if let Value::String(s) = value {
        Some(s)
    } else {
        None
    }
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn object_value(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn validation_value(v: umf_core::Validation) -> Value {
    object_value(vec![
        ("valid", Value::Bool(v.valid)),
        ("complete", Value::Bool(v.complete)),
        ("diagnostics", diagnostics_value(v.diagnostics)),
    ])
}
fn diagnostics_value(ds: Vec<umf_core::Diagnostic>) -> Value {
    Value::Array(
        ds.into_iter()
            .map(|d| {
                object_value(vec![
                    ("code", Value::String(d.code)),
                    ("path", Value::String(d.path)),
                    ("message", Value::String(d.message)),
                    (
                        "severity",
                        Value::String(Utf16::from(match d.severity {
                            umf_core::Severity::Error => "error",
                            umf_core::Severity::Warning => "warning",
                        })),
                    ),
                ])
            })
            .collect(),
    )
}
