// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit, versioned tagged binding for the opt-in Avro and Parquet Record
//! Type classifier/recovery operations. It is not an installed host route.

use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    parquet_record_type_operation::ParquetRecordTypeRequest,
    registry::Registry,
    serialization::{self, Format},
    value::copy_json,
    Utf16, Value,
};

use crate::{decode, encode, field, result_envelope, text_field};

pub const PROFILE: &str = "umf.record-type-binding/1.0.0";

fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn validate_envelope(
    value: &Value,
    operation: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let allowed: &[&str] = match operation {
        "classifyAvroRecordType" | "classifyParquetRecordType" => {
            &["profile", "op", "source", "request"]
        }
        "recoverAvroRecordTypeBundle" | "recoverParquetRecordTypeBytes" => {
            &["profile", "op", "receipt", "current"]
        }
        _ => return Err(request_error("Unknown Record Type binding operation")),
    };
    let Value::Object(members) = value else {
        return Err(request_error(
            "Record Type binding request must be an object",
        ));
    };
    for (index, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| key == &Utf16::from(*candidate))
        {
            return Err(request_error(
                "Record Type binding request has an unknown member",
            ));
        }
        if members[..index].iter().any(|(previous, _)| previous == key) {
            return Err(request_error(
                "Record Type binding request has a duplicate member",
            ));
        }
    }
    Ok(())
}

fn parse_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}

fn embedded_parquet_engine(ctx: &mut Context<'_>) -> Result<(Engine, Registry), EngineError> {
    let engine = Engine::new(
        ResourceSet::new(
            parse_resource(include_str!("../../../spec/core/schema.json"), ctx)?,
            parse_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    for package in [
        include_str!("../../../spec/extensions/avro/package.json"),
        include_str!("../../../spec/extensions/parquet/package.json"),
    ] {
        registry.register(
            &parse_resource(package, ctx)?,
            None,
            engine.package_schema(),
            &resources,
            ctx,
        )?;
    }
    Ok((engine, registry))
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn text_member<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request_error("Required text member is missing")),
    }
}

fn safe_index(value: &Value) -> Result<usize, EngineError> {
    const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
    let Value::Number(number) = value else {
        return Err(request_error("index must be a safe positive integer"));
    };
    if !number.is_finite() || *number < 1.0 || number.fract() != 0.0 || *number > MAX_SAFE_INTEGER {
        return Err(request_error("index must be a safe positive integer"));
    }
    usize::try_from(*number as u64).map_err(|_| request_error("index is out of range"))
}

fn copy_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    Ok(value.clone())
}

fn parquet_request(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<ParquetRecordTypeRequest, EngineError> {
    let Value::Object(members) = value else {
        return Err(request_error("request must be an object"));
    };
    let allowed = [
        "recordModule",
        "recordId",
        "index",
        "mode",
        "authors",
        "fieldAuthor",
    ];
    for (index, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| key == &Utf16::from(*candidate))
        {
            return Err(request_error("request contains an unknown member"));
        }
        if members[..index].iter().any(|(previous, _)| previous == key) {
            return Err(request_error("request contains a duplicate member"));
        }
    }
    let authors = match field(value, "authors") {
        None => None,
        Some(Value::Array(values)) => values
            .iter()
            .map(|author| copy_json(author, ctx))
            .collect::<Result<Vec<_>, _>>()
            .map(Some)?,
        _ => return Err(request_error("authors must be an array")),
    };
    match field(value, "fieldAuthor") {
        None => {}
        Some(Value::Null) => {
            return Err(request_error(
                "fieldAuthor must be omitted or a receipt object",
            ));
        }
        Some(Value::Object(_)) => {}
        Some(_) => return Err(request_error("fieldAuthor must be a receipt object")),
    }
    let field_author = match field(value, "fieldAuthor") {
        None => None,
        Some(value) => Some(copy_json(value, ctx)?),
    };
    Ok(ParquetRecordTypeRequest {
        record_module: copy_text(text_member(value, "recordModule")?, ctx)?,
        record_id: copy_text(text_member(value, "recordId")?, ctx)?,
        index: safe_index(
            field(value, "index").ok_or_else(|| request_error("index is required"))?,
        )?,
        mode: copy_text(text_member(value, "mode")?, ctx)?,
        authors,
        field_author,
    })
}

fn hex(bytes: &[u8], ctx: &mut Context<'_>) -> Result<String, EngineError> {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let size = bytes
        .len()
        .checked_mul(2)
        .ok_or_else(|| request_error("recovered byte representation is too large"))?;
    ctx.charge_work(size, Utf16::default())?;
    let mut output = String::with_capacity(size);
    for byte in bytes {
        output.push(DIGITS[(byte >> 4) as usize] as char);
        output.push(DIGITS[(byte & 15) as usize] as char);
    }
    Ok(output)
}

/// Execute one tagged Record Type request. Inputs and results are full tagged
/// UMF `Value`s; the operation is selected explicitly by `op`.
pub fn execute_wire(wire_json: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire_json, &mut no_control)
}

/// Execute with caller-owned work control applied to transport, embedded
/// resource initialization, classification, recovery, and result encoding.
pub fn execute_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(request_error("Record Type binding profile is required"));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        validate_envelope(&request, &op, &mut ctx)?;
        let output = match op.as_str() {
            "classifyAvroRecordType" => {
                let source =
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?;
                let operation_request = field(&request, "request")
                    .ok_or_else(|| request_error("request is required"))?;
                umf_core::avro_record_type_classifier::classify_avro_record_type(
                    source,
                    operation_request,
                    &mut ctx,
                )?
            }
            "recoverAvroRecordTypeBundle" => {
                let receipt = field(&request, "receipt")
                    .ok_or_else(|| request_error("receipt is required"))?;
                let current = field(&request, "current")
                    .ok_or_else(|| request_error("current is required"))?;
                umf_core::avro_record_type_recovery::recover_avro_record_type_bundle(
                    receipt, current, &mut ctx,
                )?
            }
            "classifyParquetRecordType" => {
                let source =
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?;
                let operation_request = field(&request, "request")
                    .ok_or_else(|| request_error("request is required"))?;
                let operation_request = parquet_request(operation_request, &mut ctx)?;
                let (engine, registry) = embedded_parquet_engine(&mut ctx)?;
                let mut capabilities = NoCapabilities;
                umf_core::parquet_record_type_operation::classify_parquet_record_type(
                    source,
                    &operation_request,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut ctx,
                )?
            }
            "recoverParquetRecordTypeBytes" => {
                let receipt = field(&request, "receipt")
                    .ok_or_else(|| request_error("receipt is required"))?;
                let current = field(&request, "current")
                    .ok_or_else(|| request_error("current is required"))?;
                let (engine, registry) = embedded_parquet_engine(&mut ctx)?;
                let mut capabilities = NoCapabilities;
                let bytes =
                    umf_core::parquet_record_type_recovery::recover_parquet_record_type_bytes(
                        receipt,
                        current,
                        &engine,
                        &registry,
                        &mut capabilities,
                        &mut ctx,
                    )?;
                let bytes_hex = hex(&bytes, &mut ctx)?;
                ctx.charge_work(bytes_hex.len(), Utf16::default())?;
                Value::Object(vec![(
                    Utf16::from("bytesHex"),
                    Value::string_utf8(bytes_hex),
                )])
            }
            _ => return Err(request_error("Unknown Record Type binding operation")),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tagged(value: Value) -> String {
        encode(&value, &mut Context::ordinary()).unwrap()
    }

    fn request(op: &str, rest: Vec<(&str, Value)>) -> String {
        let mut fields = vec![
            (Utf16::from("profile"), Value::string_utf8(PROFILE)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        fields.extend(
            rest.into_iter()
                .map(|(key, value)| (Utf16::from(key), value)),
        );
        tagged(Value::Object(fields))
    }

    fn response(wire: &str) -> Result<Value, serde_json::Value> {
        let envelope: serde_json::Value = serde_json::from_str(wire).unwrap();
        if envelope["status"] == "error" {
            return Err(envelope);
        }
        Ok(decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap())
    }

    fn parse_json(source: &str) -> Value {
        serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn parquet_source(bytes: &[u8]) -> Value {
        let schema =
            umf_core::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary())
                .unwrap()
                .schema;
        let bytes_hex = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let elements = schema
            .iter()
            .enumerate()
            .map(|(index, element)| {
                format!(
                    r#"{{"id":"schema:{index}","name":{},"extensions":{{}}}}"#,
                    serde_json::to_string(&element.name.to_utf8().unwrap()).unwrap()
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        parse_json(&format!(
            r#"{{"umf":"0.10.0","id":"fixture","vocabularies":{{"umf.parquet":{{"version":"0.1.0"}}}},"modules":[{{"id":"parquet","namespace":"","elements":[{{"id":"source","extensions":{{"umf.parquet":{{"profile":"parquet-file-source","encoding":"hex","bytes":"{bytes_hex}"}}}}}}]}},{{"id":"parquet.fields","namespace":"","elements":[{elements}]}}]}}"#
        ))
    }

    #[test]
    fn avro_classify_recover_round_trip_and_receipt_tamper_are_checked() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"id","type":"long"}]}}]}"#;
        let source = umf_core::avro_document::import_schema(
            &Utf16::from("record-type"),
            &schema.encode_utf16().collect::<Vec<_>>(),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap();
        let operation_request = parse_json(&format!(
            r#"{{"recordModule":"records","recordId":"customer","mode":"strict","nativeSource":{},"column":"[null,\"/fields/0\"]"}}"#,
            serde_json::to_string(schema).unwrap()
        ));
        let receipt = response(&execute_wire(&request(
            "classifyAvroRecordType",
            vec![("source", source.clone()), ("request", operation_request)],
        )))
        .unwrap();
        assert_eq!(
            field(&receipt, "status"),
            Some(&Value::string_utf8("classified"))
        );
        let current = field(&receipt, "target").unwrap().clone();
        let bundle = response(&execute_wire(&request(
            "recoverAvroRecordTypeBundle",
            vec![("receipt", receipt.clone()), ("current", current.clone())],
        )))
        .unwrap();
        assert!(field(&bundle, "schema").is_some());

        let mut changed = current;
        if let Value::Object(fields) = &mut changed {
            fields.push((Utf16::from("tampered"), Value::Bool(true)));
        }
        let stale = response(&execute_wire(&request(
            "recoverAvroRecordTypeBundle",
            vec![("receipt", receipt), ("current", changed)],
        )))
        .unwrap_err();
        assert_eq!(stale["status"], "error");
    }

    #[test]
    fn parquet_classify_recover_round_trip_preserves_exact_bytes() {
        let bytes = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let source = parquet_source(bytes);
        let expected_hex = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        for (request_json, authors_present) in [
            (
                r#"{"recordModule":"records","recordId":"item","index":2,"mode":"strict"}"#,
                false,
            ),
            (
                r#"{"recordModule":"records","recordId":"item","index":2,"mode":"strict","authors":[]}"#,
                true,
            ),
        ] {
            let operation_request = parse_json(request_json);
            let receipt = response(&execute_wire(&request(
                "classifyParquetRecordType",
                vec![("source", source.clone()), ("request", operation_request)],
            )))
            .unwrap();
            assert_eq!(
                field(&receipt, "status"),
                Some(&Value::string_utf8("classified"))
            );
            let receipt_request = field(&receipt, "request").unwrap();
            if authors_present {
                assert_eq!(
                    field(receipt_request, "authors"),
                    Some(&Value::Array(vec![]))
                );
            } else {
                assert_eq!(field(receipt_request, "authors"), None);
            }
            let current = field(&receipt, "target").unwrap().clone();
            let recovered = response(&execute_wire(&request(
                "recoverParquetRecordTypeBytes",
                vec![("receipt", receipt), ("current", current)],
            )))
            .unwrap();
            assert_eq!(
                field(&recovered, "bytesHex"),
                Some(&Value::string_utf8(expected_hex.clone()))
            );
        }
    }

    #[test]
    fn rejects_wrong_profile_unknown_operation_and_malformed_parquet_index() {
        let wrong_profile = tagged(Value::Object(vec![
            (Utf16::from("profile"), Value::string_utf8("wrong")),
            (
                Utf16::from("op"),
                Value::string_utf8("classifyAvroRecordType"),
            ),
        ]));
        assert_eq!(
            response(&execute_wire(&wrong_profile)).unwrap_err()["code"],
            "REQUEST"
        );

        let unknown = request("invented", vec![("source", Value::Null)]);
        assert_eq!(
            response(&execute_wire(&unknown)).unwrap_err()["code"],
            "REQUEST"
        );

        let malformed = request(
            "classifyParquetRecordType",
            vec![
                ("source", Value::Null),
                (
                    "request",
                    parse_json(
                        r#"{"recordModule":"records","recordId":"item","index":1.5,"mode":"strict"}"#,
                    ),
                ),
            ],
        );
        assert_eq!(
            response(&execute_wire(&malformed)).unwrap_err()["code"],
            "REQUEST"
        );

        let extra = request(
            "classifyParquetRecordType",
            vec![
                ("source", Value::Null),
                (
                    "request",
                    parse_json(
                        r#"{"recordModule":"records","recordId":"item","index":2,"mode":"strict","unexpected":true}"#,
                    ),
                ),
            ],
        );
        assert_eq!(
            response(&execute_wire(&extra)).unwrap_err()["code"],
            "REQUEST"
        );

        let extra_envelope = request(
            "classifyAvroRecordType",
            vec![
                ("source", Value::Null),
                ("request", Value::Null),
                ("unexpected", Value::Bool(true)),
            ],
        );
        assert_eq!(
            response(&execute_wire(&extra_envelope)).unwrap_err()["code"],
            "REQUEST"
        );
    }

    #[test]
    fn caller_work_limit_stops_before_classification() {
        let wire = request(
            "classifyAvroRecordType",
            vec![("source", Value::Null), ("request", Value::Null)],
        );
        let mut control = |_: usize| {
            Err(EngineError::new(
                "TEST_BUDGET",
                Utf16::default(),
                "caller work budget exhausted",
            ))
        };
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_wire_with_control(&wire, &mut control)).unwrap();
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], "TEST_BUDGET");
    }
}
