// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in recovery for classified Avro direct record-type bundles.
//!
//! Recovery validates the complete receipt, recomputes its provenance with the
//! retained source and request, checks the caller's current target, then returns
//! the exact native source text retained in the request.

use crate::{
    avro_record_type_classifier,
    context::Context,
    error::EngineError,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RECEIPT_SCHEMA: &str =
    include_str!("../../../spec/core/avro-record-type-classification.schema.json");
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
            "AVRO_RECORD_TYPE_RECEIPT",
            "Expected complete classified receipt",
        ));
    }
    Ok(())
}

/// Compare JSON values structurally while ignoring object member order.
/// Allocation and sorting estimates are charged before constructing copies.
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

/// Recover exact root and dependency Avro source text from a classified receipt.
pub fn recover_avro_record_type_bundle(
    input: &Value,
    current_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(input, ctx)?;
    validate_receipt(&receipt, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("AVRO_RECORD_TYPE_RECEIPT", "Receipt source is missing"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("AVRO_RECORD_TYPE_RECEIPT", "Receipt request is missing"))?;
    let expected = avro_record_type_classifier::classify_avro_record_type(source, request, ctx)?;
    if !canonical_equal(&receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_RECORD_TYPE_RECEIPT",
            "Receipt disagrees with recomputed classification",
        ));
    }
    let target = get(&expected, "target").ok_or_else(|| {
        err(
            "AVRO_RECORD_TYPE_RECEIPT",
            "Classified receipt has no target",
        )
    })?;
    let current = copy_json(current_input, ctx)?;
    if !canonical_equal(&current, target, ctx)? {
        return Err(err(
            "AVRO_RECORD_TYPE_STALE",
            "Current model changed; recompute classification",
        ));
    }

    let native_source = get(request, "nativeSource")
        .and_then(string)
        .ok_or_else(|| {
            err(
                "AVRO_RECORD_TYPE_RECEIPT",
                "Request nativeSource is missing",
            )
        })?;
    let dependencies = match get(request, "dependencies") {
        None => &[][..],
        Some(Value::Array(items)) => items.as_slice(),
        _ => {
            return Err(err(
                "AVRO_RECORD_TYPE_RECEIPT",
                "Request dependencies are malformed",
            ))
        }
    };
    let mut work = native_source.len();
    for dependency in dependencies {
        let id = get(dependency, "id")
            .and_then(string)
            .ok_or_else(|| err("AVRO_RECORD_TYPE_RECEIPT", "Dependency id is missing"))?;
        let schema = get(dependency, "schema")
            .and_then(string)
            .ok_or_else(|| err("AVRO_RECORD_TYPE_RECEIPT", "Dependency schema is missing"))?;
        work = work
            .saturating_add(id.len())
            .saturating_add(schema.len())
            .saturating_add(1);
    }
    ctx.charge_work(work, Utf16::default())?;
    let recovered_dependencies = dependencies
        .iter()
        .map(|dependency| {
            let id = get(dependency, "id")
                .and_then(string)
                .expect("validated above");
            let schema = get(dependency, "schema")
                .and_then(string)
                .expect("validated above");
            Value::Object(vec![
                (Utf16::from("id"), Value::String(id.clone())),
                (Utf16::from("schema"), Value::String(schema.clone())),
            ])
        })
        .collect();
    copy_json(
        &Value::Object(vec![
            (Utf16::from("schema"), Value::String(native_source.clone())),
            (
                Utf16::from("dependencies"),
                Value::Array(recovered_dependencies),
            ),
        ]),
        ctx,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{avro_document, avro_record_type_classifier};

    fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
        match value {
            Value::Object(fields) => fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from(name))
                .map(|(_, value)| value),
            _ => None,
        }
    }

    fn case() -> (Value, Value, String, String) {
        let root = r#"{"type":"record","name":"Root","fields":[{"name":"child","type":{"type":"record","name":"Child","fields":[{"name":"value","type":"string"}]}}]}"#;
        let child =
            r#"{"type":"record","name":"Dependency","fields":[{"name":"n","type":"long"}]}"#;
        let id = Utf16::from("root.avsc");
        let dep_id = Utf16::from("dependency.avsc");
        let dep_units = child.encode_utf16().collect::<Vec<_>>();
        let mut ctx = Context::ordinary();
        let source = avro_document::import_schema(
            &id,
            &root.encode_utf16().collect::<Vec<_>>(),
            &[avro_document::AvroDependencySource {
                id: &dep_id,
                schema_json: &dep_units,
            }],
            &mut ctx,
        )
        .unwrap();
        let fields = get(&source, "modules")
            .and_then(|v| match v {
                Value::Array(v) => v
                    .iter()
                    .find(|m| get(m, "id").and_then(string) == Some(&Utf16::from("avro.fields"))),
                _ => None,
            })
            .and_then(|m| get(m, "elements"))
            .and_then(|v| match v {
                Value::Array(v) => v
                    .iter()
                    .find(|e| get(e, "name").and_then(string) == Some(&Utf16::from("child"))),
                _ => None,
            })
            .and_then(|e| get(e, "id"))
            .and_then(string)
            .unwrap()
            .clone();
        let dependencies = Value::Array(vec![Value::Object(vec![
            (Utf16::from("id"), Value::String(dep_id)),
            (Utf16::from("schema"), Value::String(Utf16::from(child))),
        ])]);
        let request = Value::Object(vec![
            (
                Utf16::from("recordModule"),
                Value::String(Utf16::from("records")),
            ),
            (
                Utf16::from("recordId"),
                Value::String(Utf16::from("selected")),
            ),
            (Utf16::from("mode"), Value::String(Utf16::from("strict"))),
            (
                Utf16::from("nativeSource"),
                Value::String(Utf16::from(root)),
            ),
            (Utf16::from("dependencies"), dependencies),
            (Utf16::from("column"), Value::String(fields)),
        ]);
        (source, request, root.to_owned(), child.to_owned())
    }

    fn classified() -> (Value, Value, String, String) {
        let (source, request, root, child) = case();
        let receipt = avro_record_type_classifier::classify_avro_record_type(
            &source,
            &request,
            &mut Context::ordinary(),
        )
        .unwrap();
        let current = get(&receipt, "target").unwrap().clone();
        (receipt, current, root, child)
    }

    fn blocked_case() -> (Value, Value) {
        let root = r#"{"type":"record","name":"Root","fields":[{"name":"child","type":["null","string"]}]}"#;
        let source = avro_document::import_schema(
            &Utf16::from("union.avsc"),
            &root.encode_utf16().collect::<Vec<_>>(),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap();
        let column = get(&source, "modules")
            .and_then(|v| match v {
                Value::Array(v) => v
                    .iter()
                    .find(|m| get(m, "id").and_then(string) == Some(&Utf16::from("avro.fields"))),
                _ => None,
            })
            .and_then(|m| get(m, "elements"))
            .and_then(|v| match v {
                Value::Array(v) => v.first(),
                _ => None,
            })
            .and_then(|e| get(e, "id"))
            .and_then(string)
            .unwrap()
            .clone();
        let request = Value::Object(vec![
            (
                Utf16::from("recordModule"),
                Value::String(Utf16::from("records")),
            ),
            (
                Utf16::from("recordId"),
                Value::String(Utf16::from("selected")),
            ),
            (Utf16::from("mode"), Value::String(Utf16::from("strict"))),
            (
                Utf16::from("nativeSource"),
                Value::String(Utf16::from(root)),
            ),
            (Utf16::from("column"), Value::String(column)),
        ]);
        (source, request)
    }

    #[test]
    fn recovers_exact_root_and_dependency_sources() {
        let (receipt, current, root, child) = classified();
        let recovered =
            recover_avro_record_type_bundle(&receipt, &current, &mut Context::ordinary()).unwrap();
        assert_eq!(
            get(&recovered, "schema"),
            Some(&Value::String(Utf16::from(root)))
        );
        let deps = match get(&recovered, "dependencies").unwrap() {
            Value::Array(items) => items,
            _ => panic!("dependency array"),
        };
        assert_eq!(
            get(&deps[0], "id"),
            Some(&Value::String(Utf16::from("dependency.avsc")))
        );
        assert_eq!(
            get(&deps[0], "schema"),
            Some(&Value::String(Utf16::from(child)))
        );
    }

    #[test]
    fn rejects_tampering_staleness_blocked_receipts_and_limits() {
        let (receipt, current, _, _) = classified();
        let mut forged = receipt.clone();
        get_mut(&mut forged, "version")
            .unwrap()
            .clone_from(&Value::String(Utf16::from("9.9.9")));
        assert_eq!(
            recover_avro_record_type_bundle(&forged, &current, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_RECORD_TYPE_RECEIPT"
        );
        let mut stale = current.clone();
        get_mut(&mut stale, "id")
            .unwrap()
            .clone_from(&Value::String(Utf16::from("changed")));
        assert_eq!(
            recover_avro_record_type_bundle(&receipt, &stale, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_RECORD_TYPE_STALE"
        );
        let (source, request) = blocked_case();
        let blocked = avro_record_type_classifier::classify_avro_record_type(
            &source,
            &request,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            get(&blocked, "status").and_then(string),
            Some(&Utf16::from("blocked"))
        );
        assert_eq!(
            recover_avro_record_type_bundle(&blocked, &source, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_RECORD_TYPE_RECEIPT"
        );
        let mut limits = Context::ordinary().limits();
        limits.max_values = 1;
        let mut limited =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(
            recover_avro_record_type_bundle(&receipt, &current, &mut limited)
                .unwrap_err()
                .code,
            "LIMIT"
        );
    }
}
