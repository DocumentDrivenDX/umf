// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in recovery for classified Avro declared-field bundles.
//!
//! Recovery recomputes the bounded field-membership classification and only
//! returns the exact native source texts retained in its request.

use crate::{
    avro_field_classifier,
    context::Context,
    error::EngineError,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/avro-field-classification.schema.json");
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
    if compiled.validate(receipt, ctx)?.first().is_some() {
        return Err(err(
            "AVRO_FIELD_RECEIPT",
            "Expected complete classified receipt",
        ));
    }
    if get(receipt, "status").and_then(string) != Some(&Utf16::from("classified")) {
        return Err(err(
            "AVRO_FIELD_RECEIPT",
            "Expected complete classified receipt",
        ));
    }
    Ok(())
}

/// Canonical JSON structural form: object member order is ignored and array
/// order is retained. Values are admitted `Value`s, so numeric comparison is
/// by the supported ECMAScript number value, as in `JSON.stringify` equality.
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

/// Recover the native Avro schema bundle from a classified field receipt.
///
/// This operation establishes only the receipt's recomputed declared-field
/// membership basis. It does not claim broader Avro validity or semantic
/// equivalence. Returned schema strings are byte-for-byte the UTF-16 request
/// texts retained in the receipt.
pub fn recover_field_bundle(
    input: &Value,
    current_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(input, ctx)?;
    validate_receipt(&receipt, ctx)?;

    let source = get(&receipt, "source")
        .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Expected complete classified receipt"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Expected complete classified receipt"))?;
    let expected = avro_field_classifier::classify_field(source, request, ctx)?;
    if !canonical_equal(&receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_FIELD_RECEIPT",
            "Receipt disagrees with native basis",
        ));
    }

    let expected_target = get(&expected, "target")
        .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Classified receipt has no target"))?;
    let current = copy_json(current_input, ctx)?;
    if !canonical_equal(&current, expected_target, ctx)? {
        return Err(err(
            "AVRO_FIELD_STALE",
            "Current model changed; recompute classification",
        ));
    }

    let native_source = get(request, "nativeSource")
        .and_then(string)
        .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Request nativeSource is missing"))?;
    let dependencies = match get(request, "dependencies") {
        None => &[][..],
        Some(Value::Array(items)) => items.as_slice(),
        _ => {
            return Err(err(
                "AVRO_FIELD_RECEIPT",
                "Request dependencies are malformed",
            ))
        }
    };
    // The classifier has already validated these texts against the retained
    // bundle. Borrow the request entries and let final copy admission account
    // for output allocation without reparsing native JSON.
    let mut recovery_copy_work = dependencies.len().saturating_add(native_source.len());
    for dependency in dependencies {
        let id = get(dependency, "id")
            .and_then(string)
            .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Dependency id is missing"))?;
        let schema = get(dependency, "schema")
            .and_then(string)
            .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Dependency schema is missing"))?;
        recovery_copy_work = recovery_copy_work
            .saturating_add(id.len())
            .saturating_add(schema.len());
    }
    ctx.charge_work(recovery_copy_work, Utf16::default())?;
    let mut recovered_dependencies = Vec::with_capacity(dependencies.len());
    for dependency in dependencies {
        let id = get(dependency, "id")
            .and_then(string)
            .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Dependency id is missing"))?;
        let schema = get(dependency, "schema")
            .and_then(string)
            .ok_or_else(|| err("AVRO_FIELD_RECEIPT", "Dependency schema is missing"))?;
        recovered_dependencies.push(Value::Object(vec![
            (Utf16::from("id"), Value::String(id.clone())),
            (Utf16::from("schema"), Value::String(schema.clone())),
        ]));
    }
    let result = Value::Object(vec![
        (Utf16::from("schema"), Value::String(native_source.clone())),
        (
            Utf16::from("dependencies"),
            Value::Array(recovered_dependencies),
        ),
    ]);
    copy_json(&result, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source_and_request() -> (Value, Value) {
        let source = crate::avro_document::import_schema(
            &Utf16::from("recovery"),
            &r#"{"type":"record","name":"R","fields":[{"name":"f","type":"string"}]}"#
                .encode_utf16()
                .collect::<Vec<_>>(),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap();
        let bundle =
            crate::avro_document::export_bundle(&source, &mut Context::ordinary()).unwrap();
        let request = Value::Object(vec![
            (
                Utf16::from("column"),
                Value::String(Utf16::from(r#"[null,"/fields/0"]"#)),
            ),
            (
                Utf16::from("nativeSource"),
                Value::String(bundle.schema_json),
            ),
            (Utf16::from("mode"), Value::String(Utf16::from("strict"))),
        ]);
        (source, request)
    }

    fn classified() -> Value {
        let (source, request) = source_and_request();
        avro_field_classifier::classify_field(&source, &request, &mut Context::ordinary()).unwrap()
    }

    #[test]
    fn recovers_exact_native_text_after_recomputation() {
        let receipt = classified();
        let current = get(&receipt, "target").unwrap().clone();
        let recovered = recover_field_bundle(&receipt, &current, &mut Context::ordinary()).unwrap();
        assert_eq!(
            get(&recovered, "schema"),
            get(get(&receipt, "request").unwrap(), "nativeSource")
        );
        assert_eq!(
            get(&recovered, "dependencies"),
            Some(&Value::Array(Vec::new()))
        );
    }

    #[test]
    fn recovery_preserves_root_and_named_dependency_text_exactly() {
        let root = r#"{ "type":"record", "name":"R", "fields":[{"name":"f","type":"Child"}] }"#;
        let dependency =
            r#"{ "type":"record", "name":"Child", "fields":[{"name":"v","type":"string"}] }"#;
        let id = Utf16::from("child.avsc");
        let source = crate::avro_document::import_schema(
            &Utf16::from("recovery-dependency"),
            &root.encode_utf16().collect::<Vec<_>>(),
            &[crate::avro_document::AvroDependencySource {
                id: &id,
                schema_json: &dependency.encode_utf16().collect::<Vec<_>>(),
            }],
            &mut Context::ordinary(),
        )
        .unwrap();
        let request = Value::Object(vec![
            (
                Utf16::from("column"),
                Value::String(Utf16::from(r#"[null,"/fields/0"]"#)),
            ),
            (
                Utf16::from("nativeSource"),
                Value::String(Utf16::from(root)),
            ),
            (
                Utf16::from("dependencies"),
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::String(id)),
                    (
                        Utf16::from("schema"),
                        Value::String(Utf16::from(dependency)),
                    ),
                ])]),
            ),
            (Utf16::from("mode"), Value::String(Utf16::from("strict"))),
        ]);
        let receipt =
            avro_field_classifier::classify_field(&source, &request, &mut Context::ordinary())
                .unwrap();
        let current = get(&receipt, "target").unwrap().clone();
        let recovered = recover_field_bundle(&receipt, &current, &mut Context::ordinary()).unwrap();
        assert_eq!(
            get(&recovered, "schema"),
            Some(&Value::String(Utf16::from(root)))
        );
        let dependencies = get(&recovered, "dependencies").unwrap();
        let Value::Array(dependencies) = dependencies else {
            panic!("dependency array")
        };
        assert_eq!(
            get(&dependencies[0], "id"),
            Some(&Value::String(Utf16::from("child.avsc")))
        );
        assert_eq!(
            get(&dependencies[0], "schema"),
            Some(&Value::String(Utf16::from(dependency)))
        );
    }

    #[test]
    fn tampered_receipt_and_stale_current_are_rejected() {
        let receipt = classified();
        let current = get(&receipt, "target").unwrap().clone();
        let mut tampered = receipt.clone();
        if let Value::Object(members) = &mut tampered {
            members
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from("version"))
                .unwrap()
                .1 = Value::String(Utf16::from("9.9.9"));
        }
        assert_eq!(
            recover_field_bundle(&tampered, &current, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_FIELD_RECEIPT"
        );

        let mut stale = current;
        if let Value::Object(members) = &mut stale {
            members
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from("id"))
                .unwrap()
                .1 = Value::String(Utf16::from("changed"));
        }
        assert_eq!(
            recover_field_bundle(&receipt, &stale, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_FIELD_STALE"
        );
    }

    #[test]
    fn blocked_receipt_cannot_recover() {
        let (mut source, request) = source_and_request();
        if let Value::Object(document) = &mut source {
            let modules = document
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from("modules"))
                .unwrap();
            if let Value::Array(modules) = &mut modules.1 {
                let fields_module = modules
                    .iter_mut()
                    .find(|module| {
                        get(module, "id").and_then(string) == Some(&Utf16::from("avro.fields"))
                    })
                    .unwrap();
                let elements = match fields_module {
                    Value::Object(members) => members
                        .iter_mut()
                        .find(|(name, _)| name == &Utf16::from("elements"))
                        .unwrap(),
                    _ => unreachable!(),
                };
                if let Value::Array(elements) = &mut elements.1 {
                    let field_id = Utf16::from(r#"[null,"/fields/0"]"#);
                    if let Some(Value::Object(field)) = elements
                        .iter_mut()
                        .find(|element| get(element, "id").and_then(string) == Some(&field_id))
                    {
                        field.push((Utf16::from("kind"), Value::String(Utf16::from("field"))));
                    }
                }
            }
        }
        let blocked =
            avro_field_classifier::classify_field(&source, &request, &mut Context::ordinary())
                .unwrap();
        assert_eq!(
            get(&blocked, "status"),
            Some(&Value::String(Utf16::from("blocked")))
        );
        assert_eq!(
            recover_field_bundle(&blocked, &source, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "AVRO_FIELD_RECEIPT"
        );
    }
}
