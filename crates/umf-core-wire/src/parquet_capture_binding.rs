// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged-wire owner for the bounded Parquet source and footer views.

use umf_core::{
    engine::{Capabilities, Engine, ResourceSet},
    error::{Diagnostic, EngineError},
    parquet_capture_inspection::{
        capture_parquet, decode_parquet_footer, export_parquet_capture, get_parquet_field_metadata,
        import_parquet_schema, inspect_parquet_containers, inspect_parquet_framing,
        inspect_parquet_logical_types, inspect_parquet_metadata, inspect_parquet_schema,
    },
    parquet_pages::{decode_parquet_page_bodies, inspect_parquet_pages},
    registry::Registry,
    serialization::{self, Format},
    Context, Utf16, Value,
};

use crate::{decode, encode, field, result_envelope, text_field};

pub const PROFILE: &str = "umf-r8-parquet-capture-inspection/0.1.0";
const TOKEN: u64 = 0x5041_5251_5545_5401;

struct Accept;
impl Capabilities for Accept {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

struct Resources {
    engine: Engine,
    registry: Registry,
}
impl Resources {
    fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                ctx,
            )
        }
        let engine = Engine::new(
            ResourceSet::new(
                read(include_str!("../../../spec/core/schema.json"), ctx)?,
                read(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let package = read(
            include_str!("../../../spec/extensions/parquet/package.json"),
            ctx,
        )?;
        let schemas = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(TOKEN),
            engine.package_schema(),
            &schemas,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }
}

fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn decode_hex(source: &str) -> Result<Vec<u8>, EngineError> {
    if source.len() > 2_000_000
        || source.len() % 2 != 0
        || !source
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(request_error("bytes must be bounded lowercase hexadecimal"));
    }
    source
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let nibble = |b: u8| {
                if b <= b'9' {
                    b - b'0'
                } else {
                    b - b'a' + 10
                }
            };
            Ok((nibble(pair[0]) << 4) | nibble(pair[1]))
        })
        .collect()
}
fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes
        .iter()
        .flat_map(|byte| {
            [
                HEX[(byte >> 4) as usize] as char,
                HEX[(byte & 15) as usize] as char,
            ]
        })
        .collect()
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
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let operation =
            text_field(&request, "op").ok_or_else(|| request_error("op is required"))?;
        if let Some(profile) = text_field(&request, "profile") {
            if profile != PROFILE {
                return Err(request_error("Unsupported Parquet capture profile"));
            }
        }
        if operation == "parquet.encodeWire" {
            let value = field(&request, "value").ok_or_else(|| request_error("value is required"))?;
            let bytes = umf_core::parquet_wire_encode::encode_parquet_wire(value, &mut ctx)?;
            return encode(&Value::string_utf8(encode_hex(&bytes)), &mut ctx);
        }
        let resources = Resources::new(&mut ctx)?;
        let mut capabilities = Accept;
        let result = match operation.as_str() {
            "parquet.capture" => {
                let bytes = decode_hex(
                    &text_field(&request, "bytes")
                        .ok_or_else(|| request_error("bytes is required"))?,
                )?;
                let id = match field(&request, "id") {
                    Some(Value::String(value)) => value,
                    _ => return Err(request_error("id is required")),
                };
                capture_parquet(
                    &bytes,
                    id,
                    &resources.engine,
                    &resources.registry,
                    &mut capabilities,
                    &mut ctx,
                )?
            }
            "parquet.importSchema" => {
                let bytes = decode_hex(
                    &text_field(&request, "bytes")
                        .ok_or_else(|| request_error("bytes is required"))?,
                )?;
                let id = match field(&request, "id") {
                    Some(Value::String(value)) => value,
                    _ => return Err(request_error("id is required")),
                };
                import_parquet_schema(
                    &bytes,
                    id,
                    &resources.engine,
                    &resources.registry,
                    &mut capabilities,
                    &mut ctx,
                )?
            }
            "parquet.export" => {
                let document = field(&request, "document")
                    .ok_or_else(|| request_error("document is required"))?;
                Value::string_utf8(encode_hex(&export_parquet_capture(
                    document,
                    &resources.engine,
                    &resources.registry,
                    &mut capabilities,
                    &mut ctx,
                )?))
            }
            "parquet.inspectFraming"
            | "parquet.decodeFooter"
            | "parquet.inspectMetadata"
            | "parquet.inspectSchema"
            | "parquet.inspectLogicalTypes"
            | "parquet.inspectContainers"
            | "parquet.getFieldMetadata"
            | "parquet.inspectPages"
            | "parquet.decodePageBodies" => {
                let document = field(&request, "document")
                    .ok_or_else(|| request_error("document is required"))?;
                match operation.as_str() {
                    "parquet.inspectFraming" => inspect_parquet_framing(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.decodeFooter" => decode_parquet_footer(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.inspectMetadata" => inspect_parquet_metadata(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.inspectLogicalTypes" => inspect_parquet_logical_types(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.inspectContainers" => inspect_parquet_containers(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.getFieldMetadata" => get_parquet_field_metadata(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.inspectPages" => inspect_parquet_pages(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    "parquet.decodePageBodies" => decode_parquet_page_bodies(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                    _ => inspect_parquet_schema(
                        document,
                        &resources.engine,
                        &resources.registry,
                        &mut capabilities,
                        &mut ctx,
                    )?,
                }
            }
            _ => {
                return Err(request_error(
                    "Unknown Parquet capture inspection operation",
                ))
            }
        };
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(fields: impl IntoIterator<Item = (&'static str, Value)>) -> String {
        let value = Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        );
        encode(&value, &mut Context::ordinary()).unwrap()
    }

    #[test]
    fn opt_in_capture_export_and_framing_round_trip() {
        let captured = execute_wire(&request([
            ("profile", Value::string_utf8(PROFILE)),
            ("op", Value::string_utf8("parquet.capture")),
            ("id", Value::string_utf8("empty")),
            ("bytes", Value::string_utf8("")),
        ]));
        let envelope: serde_json::Value = serde_json::from_str(&captured).unwrap();
        assert_eq!(envelope["status"], "ok");
        let document =
            decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();

        let exported = execute_wire(&request([
            ("op", Value::string_utf8("parquet.export")),
            ("document", document.clone()),
        ]));
        let envelope: serde_json::Value = serde_json::from_str(&exported).unwrap();
        assert_eq!(envelope["status"], "ok");
        let bytes = decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        assert_eq!(bytes, Value::string_utf8(""));

        let framed = execute_wire(&request([
            ("op", Value::string_utf8("parquet.inspectFraming")),
            ("document", document),
        ]));
        let envelope: serde_json::Value = serde_json::from_str(&framed).unwrap();
        assert_eq!(envelope["status"], "ok");
        let inspection =
            decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        assert!(matches!(inspection, Value::Object(_)));
    }
}
