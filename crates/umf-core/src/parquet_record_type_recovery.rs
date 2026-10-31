// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in recovery of exact Parquet bytes from a classified Record Type receipt.
//!
//! Recovery validates the complete receipt, recomputes the Record Type
//! classification from its retained source and request, checks the caller's
//! current target, and returns the original captured bytes.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_document_capture::capture_parquet_document,
    parquet_record_type_operation::{self, ParquetRecordTypeRequest},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RECEIPT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-record-type-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const SEMANTIC_TYPE_SCHEMA: &str =
    include_str!("../../../spec/core/semantic-type-reference.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn string(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(value) => Some(value),
        _ => None,
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
    let schema = read_json(RECEIPT_SCHEMA, ctx)?;
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
            "PARQUET_RECORD_TYPE_RECEIPT",
            "Expected complete classified receipt",
        ));
    }
    Ok(())
}

/// Compare JSON values structurally while ignoring object member order.
/// Traversal, sorting estimates and copied keys are charged to the caller.
fn canonical(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(Value::Array(
                items
                    .iter()
                    .map(|item| canonical(item, ctx))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Value::Object(fields) => {
            let log = (usize::BITS - usize::max(fields.len(), 1).leading_zeros()) as usize;
            let sort_work = fields.len().saturating_mul(log);
            let max_key = fields.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
            ctx.charge_work(
                fields
                    .len()
                    .saturating_add(sort_work)
                    .saturating_add(sort_work.saturating_mul(max_key)),
                Utf16::default(),
            )?;
            let mut output = Vec::with_capacity(fields.len());
            for (key, value) in fields {
                ctx.charge_work(key.len(), Utf16::default())?;
                output.push((key.clone(), canonical(value, ctx)?));
            }
            output.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(output))
        }
        Value::String(text) => {
            ctx.charge_work(text.len(), Utf16::default())?;
            Ok(Value::String(text.clone()))
        }
        _ => Ok(value.clone()),
    }
}

fn canonical_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}

fn request_text(request: &Value, name: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let value = get(request, name).and_then(string).ok_or_else(|| {
        err(
            "PARQUET_RECORD_TYPE_RECEIPT",
            "Receipt request is malformed",
        )
    })?;
    ctx.charge_work(value.len(), Utf16::default())?;
    Ok(value.clone())
}

fn parse_request(
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<ParquetRecordTypeRequest, EngineError> {
    let request = get(receipt, "request")
        .ok_or_else(|| err("PARQUET_RECORD_TYPE_RECEIPT", "Receipt request is missing"))?;
    let index = match get(request, "index") {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            usize::try_from(*n as u64).map_err(|_| {
                err(
                    "PARQUET_RECORD_TYPE_RECEIPT",
                    "Receipt request index exceeds target width",
                )
            })?
        }
        _ => {
            return Err(err(
                "PARQUET_RECORD_TYPE_RECEIPT",
                "Receipt request index is malformed",
            ));
        }
    };
    let authors = match get(request, "authors") {
        None => None,
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| copy_json(item, ctx))
            .collect::<Result<Vec<_>, _>>()
            .map(Some)?,
        _ => {
            return Err(err(
                "PARQUET_RECORD_TYPE_RECEIPT",
                "Receipt request authors are malformed",
            ));
        }
    };
    let field_author = get(request, "fieldAuthor")
        .map(|author| copy_json(author, ctx))
        .transpose()?;
    Ok(ParquetRecordTypeRequest {
        record_module: request_text(request, "recordModule", ctx)?,
        record_id: request_text(request, "recordId", ctx)?,
        index,
        mode: request_text(request, "mode", ctx)?,
        authors,
        field_author,
    })
}

/// Return exact retained Parquet bytes after full receipt and freshness checks.
/// This operation is opt-in and remains scoped to the classifier's supported
/// LIST struct-element subset.
pub fn recover_parquet_record_type_bytes(
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
        .ok_or_else(|| err("PARQUET_RECORD_TYPE_RECEIPT", "Receipt source is missing"))?;
    let request = parse_request(&receipt, ctx)?;
    let expected = parquet_record_type_operation::classify_parquet_record_type(
        source,
        &request,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    if !canonical_equal(&receipt, &expected, ctx)? {
        return Err(err(
            "PARQUET_RECORD_TYPE_RECEIPT",
            "Receipt disagrees with recomputed classification",
        ));
    }
    let target = get(&expected, "target").ok_or_else(|| {
        err(
            "PARQUET_RECORD_TYPE_RECEIPT",
            "Classified receipt has no target",
        )
    })?;
    let current = copy_json(current_input, ctx)?;
    if !canonical_equal(&current, target, ctx)? {
        return Err(err(
            "PARQUET_RECORD_TYPE_STALE",
            "Current model changed; recompute classification",
        ));
    }

    let captured =
        capture_parquet_document(source, request.index, engine, registry, capabilities, ctx)?;
    ctx.charge_work(captured.bytes.len(), Utf16::default())?;
    Ok(captured.bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        context::{Limits, ResourceProfile},
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
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

    fn parse(text: &str) -> Value {
        read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
        match value {
            Value::Object(fields) => fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from(name))
                .map(|(_, value)| value),
            _ => None,
        }
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

    fn source(bytes: &[u8]) -> Value {
        let schema = crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary())
            .unwrap()
            .schema;
        let hex = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let fields = schema
            .iter()
            .enumerate()
            .map(|(index, element)| {
                format!(
                    "{{\"id\":\"schema:{index}\",\"name\":\"{}\",\"extensions\":{{}}}}",
                    element.name.to_utf8().unwrap()
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        parse(&format!("{{\"umf\":\"0.10.0\",\"id\":\"fixture\",\"vocabularies\":{{\"umf.parquet\":{{\"version\":\"0.1.0\"}}}},\"modules\":[{{\"id\":\"parquet\",\"namespace\":\"\",\"elements\":[{{\"id\":\"source\",\"extensions\":{{\"umf.parquet\":{{\"profile\":\"parquet-file-source\",\"encoding\":\"hex\",\"bytes\":\"{hex}\"}}}}}}]}},{{\"id\":\"parquet.fields\",\"namespace\":\"\",\"elements\":[{fields}]}}]}}"))
    }

    fn classified(bytes: &[u8]) -> (Value, Value) {
        let input = source(bytes);
        let request = ParquetRecordTypeRequest {
            record_module: Utf16::from("records"),
            record_id: Utf16::from("item"),
            index: 2,
            mode: Utf16::from("strict"),
            authors: Some(vec![]),
            field_author: None,
        };
        let mut capabilities = NoCapabilities;
        let receipt = parquet_record_type_operation::classify_parquet_record_type(
            &input,
            &request,
            &engine(),
            &Registry::new(),
            &mut capabilities,
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
        let mut capabilities = NoCapabilities;
        let recovered = recover_parquet_record_type_bytes(
            &receipt,
            &current,
            &engine(),
            &Registry::new(),
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(recovered, fixture());
    }

    #[test]
    fn rejects_tampered_receipt_stale_target_and_blocked_receipt() {
        let (receipt, current) = classified(fixture());
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;

        let mut forged = receipt.clone();
        if let Value::Object(fields) = &mut forged {
            fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("version"))
                .unwrap()
                .1 = Value::String(Utf16::from("9.9.9"));
        }
        assert_eq!(
            recover_parquet_record_type_bytes(
                &forged,
                &current,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_TYPE_RECEIPT"
        );

        // This alteration remains schema-valid, so exact recomputation must
        // detect it rather than relying only on schema validation.
        let mut altered = receipt.clone();
        let mappings = get_mut(&mut altered, "mappings")
            .and_then(|value| match value {
                Value::Array(items) => items.first_mut(),
                _ => None,
            })
            .unwrap();
        *get_mut(mappings, "nativePath").unwrap() = Value::String(Utf16::from("/schema/99"));
        assert_eq!(
            recover_parquet_record_type_bytes(
                &altered,
                &current,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_TYPE_RECEIPT"
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
            recover_parquet_record_type_bytes(
                &receipt,
                &stale,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_TYPE_STALE"
        );

        let blocked_source = source(include_bytes!(
            "../../../fixtures/parquet/containers/list-three-element.parquet"
        ));
        let blocked_request = ParquetRecordTypeRequest {
            record_module: Utf16::from("records"),
            record_id: Utf16::from("item"),
            index: 1,
            mode: Utf16::from("strict"),
            authors: Some(vec![]),
            field_author: None,
        };
        let blocked = parquet_record_type_operation::classify_parquet_record_type(
            &blocked_source,
            &blocked_request,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            recover_parquet_record_type_bytes(
                &blocked,
                &blocked_source,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_TYPE_RECEIPT"
        );
    }

    #[test]
    fn caller_resource_limit_refuses_recovery() {
        let (receipt, current) = classified(fixture());
        let mut limits = Limits::ordinary();
        limits.max_values = 1;
        let mut context = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let mut capabilities = NoCapabilities;
        assert_eq!(
            recover_parquet_record_type_bytes(
                &receipt,
                &current,
                &engine(),
                &Registry::new(),
                &mut capabilities,
                &mut context,
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );
    }
}
