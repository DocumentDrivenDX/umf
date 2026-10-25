// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in recovery for classified Avro record bundles.
//!
//! Recovery recomputes the record and direct-field classification against the
//! retained request, compares the current model with the recomputed target,
//! and returns the exact Avro source texts held by that request.

use crate::{
    avro_record_classifier,
    context::Context,
    error::EngineError,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/avro-record-classification.schema.json");
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
            "AVRO_RECORD_RECEIPT",
            "Expected complete classified receipt",
        ));
    }
    Ok(())
}

/// Canonical structural equality: object member order is ignored and array
/// order is preserved. The admitted `Value` number model matches JSON value
/// equality used by the TypeScript predecessor.
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

/// Recover the exact root and dependency schema strings from a classified
/// Avro record receipt after recomputing its provenance and checking freshness.
pub fn recover_avro_record_bundle(
    input: &Value,
    current_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(input, ctx)?;
    validate_receipt(&receipt, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Receipt source is missing"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Receipt request is missing"))?;
    let expected = avro_record_classifier::classify_avro_record(source, request, ctx)?;
    if !canonical_equal(&receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_RECORD_RECEIPT",
            "Receipt disagrees with native basis",
        ));
    }
    let target = get(&expected, "target")
        .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Classified receipt has no target"))?;
    let current = copy_json(current_input, ctx)?;
    if !canonical_equal(&current, target, ctx)? {
        return Err(err(
            "AVRO_RECORD_STALE",
            "Current model changed; recompute classification",
        ));
    }

    let native_source = get(request, "nativeSource")
        .and_then(string)
        .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Request nativeSource is missing"))?;
    let dependencies = match get(request, "dependencies") {
        None => &[][..],
        Some(Value::Array(items)) => items.as_slice(),
        _ => {
            return Err(err(
                "AVRO_RECORD_RECEIPT",
                "Request dependencies are malformed",
            ))
        }
    };
    let mut copy_work = native_source.len().saturating_add(dependencies.len());
    for dependency in dependencies {
        let id = get(dependency, "id")
            .and_then(string)
            .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Dependency id is missing"))?;
        let schema = get(dependency, "schema")
            .and_then(string)
            .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Dependency schema is missing"))?;
        copy_work = copy_work
            .saturating_add(id.len())
            .saturating_add(schema.len());
    }
    ctx.charge_work(copy_work, Utf16::default())?;
    let mut recovered_dependencies = Vec::with_capacity(dependencies.len());
    for dependency in dependencies {
        let id = get(dependency, "id")
            .and_then(string)
            .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Dependency id is missing"))?;
        let schema = get(dependency, "schema")
            .and_then(string)
            .ok_or_else(|| err("AVRO_RECORD_RECEIPT", "Dependency schema is missing"))?;
        recovered_dependencies.push(Value::Object(vec![
            (Utf16::from("id"), Value::String(id.clone())),
            (Utf16::from("schema"), Value::String(schema.clone())),
        ]));
    }
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
    use crate::avro_document::{self, AvroDependencySource};

    fn source_and_request(dependency: bool) -> (Value, Value, String, String) {
        let root = r#"{ "type":"record", "name":"R", "fields":[{"name":"f","type":"Child"}] }"#;
        let child =
            r#"{ "type":"record", "name":"Child", "fields":[{"name":"v","type":"string"}] }"#;
        let root_id = Utf16::from("root.avsc");
        let child_id = Utf16::from("child.avsc");
        let child_units = child.encode_utf16().collect::<Vec<_>>();
        let deps = if dependency {
            vec![AvroDependencySource {
                id: &child_id,
                schema_json: &child_units,
            }]
        } else {
            Vec::new()
        };
        let source = avro_document::import_schema(
            &root_id,
            &root.encode_utf16().collect::<Vec<_>>(),
            &deps,
            &mut Context::ordinary(),
        )
        .unwrap();
        let mut request = vec![
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
            (Utf16::from("path"), Value::String(Utf16::default())),
        ];
        if dependency {
            request.push((
                Utf16::from("dependencies"),
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::String(child_id)),
                    (Utf16::from("schema"), Value::String(Utf16::from(child))),
                ])]),
            ));
        }
        (
            source,
            Value::Object(request),
            root.to_owned(),
            child.to_owned(),
        )
    }

    fn classified(dependency: bool) -> (Value, Value, String, String) {
        let (source, request, root, child) = source_and_request(dependency);
        let receipt = avro_record_classifier::classify_avro_record(
            &source,
            &request,
            &mut Context::ordinary(),
        )
        .unwrap();
        let current = get(&receipt, "target").unwrap().clone();
        (receipt, current, root, child)
    }

    #[test]
    fn recovers_exact_root_and_dependency_source_strings() {
        let (receipt, current, root, child) = classified(true);
        let recovered =
            recover_avro_record_bundle(&receipt, &current, &mut Context::ordinary()).unwrap();
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
            Some(&Value::String(Utf16::from("child.avsc")))
        );
        assert_eq!(
            get(&deps[0], "schema"),
            Some(&Value::String(Utf16::from(child)))
        );
    }

    #[test]
    fn rejects_tampered_receipt_and_stale_current_model() {
        let (receipt, current, _, _) = classified(false);
        let mut forged = receipt.clone();
        if let Value::Object(fields) = &mut forged {
            fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("version"))
                .unwrap()
                .1 = Value::String(Utf16::from("9.9.9"));
        }
        assert_eq!(
            recover_avro_record_bundle(&forged, &current, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_RECORD_RECEIPT"
        );
        let mut stale = current;
        if let Value::Object(fields) = &mut stale {
            fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("id"))
                .unwrap()
                .1 = Value::String(Utf16::from("changed"));
        }
        assert_eq!(
            recover_avro_record_bundle(&receipt, &stale, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_RECORD_STALE"
        );
    }

    #[test]
    fn blocked_classification_cannot_recover_and_controls_are_honored() {
        let (mut source, request, _, _) = source_and_request(false);
        if let Value::Object(document) = &mut source {
            let modules = document
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("modules"))
                .unwrap();
            if let Value::Array(modules) = &mut modules.1 {
                let fields_module = modules
                    .iter_mut()
                    .find(|m| get(m, "id").and_then(string) == Some(&Utf16::from("avro.fields")))
                    .unwrap();
                if let Value::Object(fields) = fields_module {
                    let elements = fields
                        .iter_mut()
                        .find(|(key, _)| key == &Utf16::from("elements"))
                        .unwrap();
                    if let Value::Array(elements) = &mut elements.1 {
                        if let Some(Value::Object(field)) = elements.first_mut() {
                            field.push((Utf16::from("kind"), Value::String(Utf16::from("record"))));
                        }
                    }
                }
            }
        }
        let blocked = avro_record_classifier::classify_avro_record(
            &source,
            &request,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            recover_avro_record_bundle(&blocked, &source, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_RECORD_RECEIPT"
        );
        let (receipt, current, _, _) = classified(false);
        let mut limits = Context::ordinary().limits();
        limits.max_values = 1;
        let mut limited =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(
            recover_avro_record_bundle(&receipt, &current, &mut limited)
                .unwrap_err()
                .code,
            "LIMIT"
        );
    }
}
