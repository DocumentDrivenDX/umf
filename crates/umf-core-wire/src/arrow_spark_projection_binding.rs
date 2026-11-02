// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed transport for bidirectional Arrow/Spark schema projection.
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    arrow_spark_projection, spark_schema::SparkSchemaResources, Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.arrow-spark-projection-wire/1";
pub const ARROW_TO_SPARK: &str = "arrow-spark-projection.projectArrowToSpark";
pub const SPARK_TO_ARROW: &str = "arrow-spark-projection.projectSparkToArrow";
fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let profile = text(field(value, "profile"), "profile")?;
    if profile != &Utf16::from(PROFILE) {
        return Err(request("wrong Arrow/Spark projection profile"));
    }
    let op = text(field(value, "op"), "op")?;
    let source = field(value, "document").ok_or_else(|| request("document is required"))?;
    let policy = field(value, "policy").ok_or_else(|| request("policy is required"))?;
    let spark = SparkSchemaResources::new(ctx)?;
    match op
        .to_utf8()
        .map_err(|_| request("operation must be valid UTF-16"))?
        .as_str()
    {
        ARROW_TO_SPARK => {
            arrow_spark_projection::project_arrow_to_spark(source, policy, &spark, ctx)
        }
        SPARK_TO_ARROW => {
            arrow_spark_projection::project_spark_to_arrow(source, policy, &spark, ctx)
        }
        _ => Err(request("unknown Arrow/Spark projection operation")),
    }
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
        let request = decode(wire, &mut ctx)?;
        let value = execute(&request, &mut ctx)?;
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}
