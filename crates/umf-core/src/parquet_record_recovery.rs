// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in recovery of exact Parquet bytes from a classified record receipt.
//!
//! Recovery validates the complete receipt, recomputes its classification
//! against the retained source using the caller's engine and capabilities,
//! compares the current document with the recomputed target, then returns the
//! original captured bytes.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_document_capture::capture_parquet_document,
    parquet_record_classifier::{self, ParquetRecordRequest},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-record-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const SEMANTIC_TYPE_SCHEMA: &str =
    include_str!("../../../spec/core/semantic-type-reference.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn string(value: &Value) -> Option<&Utf16> {
    if let Value::String(value) = value {
        Some(value)
    } else {
        None
    }
}
fn read_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}

fn validate_receipt(receipt: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let schema = read_json(CLASSIFICATION_SCHEMA, ctx)?;
    let resources = crate::schema::SchemaResources {
        entries: vec![
            (
                Utf16::from("urn:umf:core:0.10.0"),
                read_json(CORE_SCHEMA, ctx)?,
            ),
            (
                Utf16::from("urn:umf:core:semantic-type-reference:1.0.0"),
                read_json(SEMANTIC_TYPE_SCHEMA, ctx)?,
            ),
            (
                Utf16::from("urn:umf:core:kind-operation:6.0.0"),
                read_json(KIND_SCHEMA, ctx)?,
            ),
        ],
    };
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    if compiled.validate(receipt, ctx)?.first().is_some()
        || get(receipt, "status").and_then(string) != Some(&Utf16::from("classified"))
    {
        return Err(err(
            "PARQUET_RECORD_RECEIPT",
            "Expected complete classified receipt",
        ));
    }
    Ok(())
}

/// Canonical structural equality ignores object-member order and preserves
/// array order. Every traversal, key sort estimate and copied key is charged.
fn canonical(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(Value::Array(
                items
                    .iter()
                    .map(|v| canonical(v, ctx))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Value::Object(members) => {
            let sort_work = members.len().saturating_mul(
                (usize::BITS - usize::max(members.len(), 1).leading_zeros()) as usize,
            );
            let max_key_len = members.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
            ctx.charge_work(
                members
                    .len()
                    .saturating_add(sort_work)
                    .saturating_add(sort_work.saturating_mul(max_key_len)),
                Utf16::default(),
            )?;
            let mut output = Vec::with_capacity(members.len());
            for (key, value) in members {
                ctx.charge_work(key.len(), Utf16::default())?;
                output.push((key.clone(), canonical(value, ctx)?));
            }
            output.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(output))
        }
        Value::String(value) => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(Value::String(value.clone()))
        }
        _ => Ok(value.clone()),
    }
}
fn canonical_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}

fn parse_request(
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<ParquetRecordRequest, EngineError> {
    let request = get(receipt, "request")
        .ok_or_else(|| err("PARQUET_RECORD_RECEIPT", "Receipt request is missing"))?;
    let text = |key: &str, ctx: &mut Context<'_>| {
        let value = get(request, key)
            .and_then(string)
            .ok_or_else(|| err("PARQUET_RECORD_RECEIPT", "Receipt request is malformed"))?;
        ctx.charge_work(value.len(), Utf16::default())?;
        Ok::<_, EngineError>(value.clone())
    };
    let index = match get(request, "index") {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            usize::try_from(*n as u64).map_err(|_| {
                err(
                    "PARQUET_RECORD_RECEIPT",
                    "Receipt request index exceeds target width",
                )
            })?
        }
        _ => {
            return Err(err(
                "PARQUET_RECORD_RECEIPT",
                "Receipt request index is malformed",
            ))
        }
    };
    let authors = match get(request, "authors") {
        None => Vec::new(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| copy_json(item, ctx))
            .collect::<Result<_, _>>()?,
        _ => {
            return Err(err(
                "PARQUET_RECORD_RECEIPT",
                "Receipt request authors are malformed",
            ))
        }
    };
    Ok(ParquetRecordRequest {
        record_module: text("recordModule", ctx)?,
        record_id: text("recordId", ctx)?,
        index,
        mode: text("mode", ctx)?,
        authors,
    })
}

/// Return the exact retained Parquet source bytes after full receipt and
/// freshness verification. This remains an opt-in core operation.
pub fn recover_parquet_record_bytes(
    input: &Value,
    current_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let receipt = copy_json(input, ctx)?;
    validate_receipt(&receipt, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("PARQUET_RECORD_RECEIPT", "Receipt source is missing"))?;
    let request = parse_request(&receipt, ctx)?;
    let expected = parquet_record_classifier::classify_parquet_record(
        source,
        &request,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    if !canonical_equal(&receipt, &expected, ctx)? {
        return Err(err(
            "PARQUET_RECORD_RECEIPT",
            "Receipt disagrees with native basis",
        ));
    }
    let target = get(&expected, "target")
        .ok_or_else(|| err("PARQUET_RECORD_RECEIPT", "Classified receipt has no target"))?;
    let current = copy_json(current_input, ctx)?;
    if !canonical_equal(&current, target, ctx)? {
        return Err(err(
            "PARQUET_RECORD_STALE",
            "Current model changed; recompute classification",
        ));
    }

    let captured =
        capture_parquet_document(source, request.index, engine, registry, capabilities, ctx)?;
    ctx.charge_work(captured.bytes.len(), Utf16::default())?;
    Ok(captured.bytes.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        context::{Limits, ResourceProfile},
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        parquet_record_classifier,
        parquet_record_type_candidate::SchemaElement,
        serialization::read_json_value,
    };

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
    fn parse(s: &str) -> Value {
        read_json_value(
            &s.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse(include_str!("../../../spec/core/schema.json")),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn document(bytes: &[u8], schema: &[SchemaElement]) -> Value {
        let hex = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let fields = schema
            .iter()
            .enumerate()
            .map(|(i, e)| {
                format!(
                    "{{\"id\":\"schema:{i}\",\"name\":\"{}\",\"extensions\":{{}}}}",
                    e.name.to_utf8().unwrap()
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        parse(&format!("{{\"umf\":\"0.10.0\",\"id\":\"fixture\",\"vocabularies\":{{\"umf.parquet\":{{\"version\":\"0.1.0\"}}}},\"modules\":[{{\"id\":\"parquet\",\"namespace\":\"\",\"elements\":[{{\"id\":\"source\",\"extensions\":{{\"umf.parquet\":{{\"profile\":\"parquet-file-source\",\"encoding\":\"hex\",\"bytes\":\"{hex}\"}}}}}}]}},{{\"id\":\"parquet.fields\",\"namespace\":\"\",\"elements\":[{fields}]}}]}}"))
    }
    fn classified(bytes: &[u8]) -> (Value, Value) {
        let schema = crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary())
            .unwrap()
            .schema;
        let source = document(bytes, &schema);
        let request = ParquetRecordRequest {
            record_module: Utf16::from("records"),
            record_id: Utf16::from("root"),
            index: 2,
            mode: Utf16::from("strict"),
            authors: vec![],
        };
        let mut caps = NoCapabilities;
        let receipt = parquet_record_classifier::classify_parquet_record(
            &source,
            &request,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        let current = get(&receipt, "target").unwrap().clone();
        (receipt, current)
    }
    fn fixture() -> &'static [u8] {
        include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet")
    }

    #[test]
    fn recovers_exact_original_bytes() {
        let (receipt, current) = classified(fixture());
        let mut caps = NoCapabilities;
        let recovered = recover_parquet_record_bytes(
            &receipt,
            &current,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(recovered, fixture());
    }
    #[test]
    fn rejects_tampered_receipt_stale_target_and_blocked_receipt() {
        let (receipt, current) = classified(fixture());
        let mut caps = NoCapabilities;
        let mut forged = receipt.clone();
        if let Value::Object(fields) = &mut forged {
            fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("version"))
                .unwrap()
                .1 = Value::String(Utf16::from("9.9.9"));
        }
        assert_eq!(
            recover_parquet_record_bytes(
                &forged,
                &current,
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_RECEIPT"
        );
        let mut stale = current.clone();
        if let Value::Object(fields) = &mut stale {
            fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("id"))
                .unwrap()
                .1 = Value::String(Utf16::from("changed"));
        }
        assert_eq!(
            recover_parquet_record_bytes(
                &receipt,
                &stale,
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_STALE"
        );
        let bytes =
            include_bytes!("../../../fixtures/parquet/containers/list-three-element.parquet");
        let schema = crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary())
            .unwrap()
            .schema;
        let source = document(bytes, &schema);
        let request = ParquetRecordRequest {
            record_module: Utf16::from("records"),
            record_id: Utf16::from("root"),
            index: 1,
            mode: Utf16::from("strict"),
            authors: vec![],
        };
        let blocked = parquet_record_classifier::classify_parquet_record(
            &source,
            &request,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            recover_parquet_record_bytes(
                &blocked,
                &source,
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_RECEIPT"
        );
    }
    #[test]
    fn caller_limits_bound_recovery_work() {
        let (receipt, current) = classified(fixture());
        let mut limits = Limits::ordinary();
        limits.max_values = 1;
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let mut caps = NoCapabilities;
        assert_eq!(
            recover_parquet_record_bytes(
                &receipt,
                &current,
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut ctx
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );
    }
}
