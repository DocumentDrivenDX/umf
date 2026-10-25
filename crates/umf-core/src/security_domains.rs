// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact tagged core-definition lookup candidate for the V2 protection profile.
//! It never establishes semantic compatibility, interpretation, or authority.

use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::OnceLock;

const NULL_VALUE: Value = Value::Null;

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        ("code".into(), Value::string_utf8(code)),
        ("path".into(), Value::string_utf8(path)),
        ("message".into(), Value::string_utf8(message)),
        ("severity".into(), Value::string_utf8(severity)),
    ])
}

fn diagnostic_utf16(code: Utf16, path: Utf16, message: Utf16, severity: &str) -> Value {
    Value::Object(vec![
        ("code".into(), Value::String(code)),
        ("path".into(), Value::String(path)),
        ("message".into(), Value::String(message)),
        ("severity".into(), Value::string_utf8(severity)),
    ])
}

fn prefixed_path(prefix: &str, path: &Utf16) -> Utf16 {
    let mut units = prefix.encode_utf16().collect::<Vec<_>>();
    units.extend_from_slice(path.units());
    Utf16::new(units)
}

fn errors(items: &[Value]) -> bool {
    items
        .iter()
        .any(|item| member(item, "severity").and_then(text).as_deref() == Some("error"))
}

fn parse_resource(source: &str, context: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        context,
    )
}

fn closure_schema() -> Result<CompiledSchema, EngineError> {
    static SCHEMA: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    SCHEMA
        .get_or_init(|| {
            let mut setup = Context::ordinary();
            let value = parse_resource(
                include_str!(
                    "../../../spec/extensions/security-protection/domain-resolution.schema.json"
                ),
                &mut setup,
            )?;
            CompiledSchema::compile_consumer(&value, &SchemaResources::default(), false, &mut setup)
        })
        .clone()
}

fn core_engine() -> Result<Engine, EngineError> {
    static ENGINE: OnceLock<Result<Engine, EngineError>> = OnceLock::new();
    ENGINE
        .get_or_init(|| {
            let mut setup = Context::ordinary();
            let core = parse_resource(include_str!("../../../spec/core/schema.json"), &mut setup)?;
            let reference = parse_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                &mut setup,
            )?;
            let package = parse_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                &mut setup,
            )?;
            let constraints = parse_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                &mut setup,
            )?;
            let policy = parse_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                &mut setup,
            )?;
            Engine::new(
                ResourceSet::new(core, reference, package, constraints, policy),
                &mut setup,
            )
        })
        .clone()
}

struct NoExtensions;
impl Capabilities for NoExtensions {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn validation_diagnostic(value: &Diagnostic, prefix: &str) -> Value {
    diagnostic_utf16(
        value.code.clone(),
        prefixed_path(prefix, &value.path),
        value.message.clone(),
        if value.severity == Severity::Error {
            "error"
        } else {
            "warning"
        },
    )
}

fn source_text_bound(value: &Value, context: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut units = 0usize;
    let mut pending = vec![value];
    while let Some(value) = pending.pop() {
        context.charge_work(1, Utf16::default())?;
        match value {
            Value::String(value) => units = units.saturating_add(value.len()),
            Value::Array(values) => pending.extend(values),
            Value::Object(fields) => {
                for (key, child) in fields {
                    units = units.saturating_add(key.len());
                    pending.push(child);
                    if units > 4_000_000 {
                        return Ok(false);
                    }
                }
            }
            _ => {}
        }
        if units > 4_000_000 {
            return Ok(false);
        }
    }
    Ok(true)
}

fn closure_schema_diagnostics(
    source: &Value,
    context: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let schema = closure_schema()?;
    Ok(schema
        .validate(source, context)?
        .into_iter()
        .map(|error| closure_schema_diagnostic(error.keyword, error.instance_path, error.message))
        .collect())
}

fn closure_schema_diagnostic(keyword: String, path: Utf16, message: Utf16) -> Value {
    let message = if keyword == "additionalProperties" {
        Utf16::from("must NOT have additional properties")
    } else {
        message
    };
    diagnostic_utf16(
        Utf16::from("PROTECTION_DOMAIN_STRUCTURE"),
        prefixed_path("/closure", &path),
        message,
        "error",
    )
}

fn reference_identity(value: &Value) -> Option<(String, String, String)> {
    Some((
        text(member(value, "documentId")?)?,
        text(member(value, "moduleId")?)?,
        text(member(value, "elementId")?)?,
    ))
}

fn references_from_catalog(catalog: &Value) -> Vec<(String, Value)> {
    let mut output = Vec::new();
    let Some(Value::Array(transforms)) = member(catalog, "transforms") else {
        return output;
    };
    for (i, transform) in transforms.iter().enumerate() {
        let path = format!("/transforms/{i}");
        for property in ["inputDomain", "outputDomain"] {
            if let Some(reference) = member(transform, property) {
                output.push((format!("{path}/{property}"), reference.clone()));
            }
        }
        if let Some(Value::Array(parameters)) = member(transform, "parameters") {
            for (j, parameter) in parameters.iter().enumerate() {
                if let Some(reference) = member(parameter, "field") {
                    output.push((format!("{path}/parameters/{j}/field"), reference.clone()));
                }
            }
        }
        if let Some(Value::Array(profile)) = member(transform, "disclosureProfile") {
            for (j, entry) in profile.iter().enumerate() {
                if member(entry, "kind").and_then(text).as_deref() == Some("range") {
                    if let Some(bucket) = member(entry, "bucket") {
                        if let Some(reference) = member(bucket, "field") {
                            output.push((
                                format!("{path}/disclosureProfile/{j}/bucket/field"),
                                reference.clone(),
                            ));
                        }
                    }
                }
            }
        }
    }
    output
}

fn references_from_policy(policy: &Value, source_references: &Value) -> Vec<(String, Value)> {
    let mut output = Vec::new();
    let Value::Array(references) = source_references else {
        return output;
    };
    for reference in references {
        let Some(rule_index) = member(reference, "ruleIndex").and_then(number_index) else {
            continue;
        };
        let Some(disclosure_index) = member(reference, "disclosureIndex").and_then(number_index)
        else {
            continue;
        };
        let Some(rule) = array_item(member(policy, "rules"), rule_index) else {
            continue;
        };
        let Some(entry) = array_item(member(rule, "disclosure"), disclosure_index) else {
            continue;
        };
        let path = format!("/rules/{rule_index}/disclosure/{disclosure_index}");
        if let Some(field) = member(entry, "field") {
            output.push((format!("{path}/field"), field.clone()));
        }
        if let Some(disposition) = member(entry, "disposition") {
            if let Some(field) = member(disposition, "field") {
                output.push((format!("{path}/disposition/field"), field.clone()));
            }
        }
    }
    output
}

fn number_index(value: &Value) -> Option<usize> {
    match value {
        Value::Number(number) if *number >= 0.0 && number.fract() == 0.0 => Some(*number as usize),
        _ => None,
    }
}

fn array_item(value: Option<&Value>, index: usize) -> Option<&Value> {
    match value? {
        Value::Array(values) => values.get(index),
        _ => None,
    }
}

/// Resolve exact qualified Field definitions in the supplied, revision-pinned
/// closure. Output is intentionally data-only and carries no authority.
pub fn resolve_security_protection_domains_candidate(
    policy_input: &Value,
    catalog_input: &Value,
    closure_input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let sources = crate::security_logic::resolve_security_protection_sources_candidate(
        policy_input,
        catalog_input,
        context,
    )?;
    let policy = member(&sources, "policy").cloned().unwrap_or(Value::Null);
    let catalog = member(&sources, "catalog").cloned().unwrap_or(Value::Null);
    let mut diagnostics = match member(&sources, "diagnostics") {
        Some(Value::Array(items)) => items
            .iter()
            .filter(|item| {
                !matches!(
                    member(item, "code").and_then(text).as_deref(),
                    Some("PROTECTION_UNIMPLEMENTED" | "SECURITY_V2_UNIMPLEMENTED")
                )
            })
            .cloned()
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };
    let mut domains = Vec::new();
    let closure = match copy_json(closure_input, context) {
        Ok(value) => value,
        Err(error) => {
            diagnostics.push(diagnostic_utf16(
                Utf16::from(error.code),
                error.path,
                error.message,
                "error",
            ));
            return Ok(domain_result(
                "refused",
                policy,
                catalog,
                Value::Null,
                domains,
                diagnostics,
            ));
        }
    };
    if !source_text_bound(&closure, context)? {
        diagnostics.push(diagnostic(
            "PROTECTION_DOMAIN_BOUND",
            "/closure",
            "resource-exhausted: closure key/string text exceeds4000000 UTF-16 units",
            "error",
        ));
        return Ok(domain_result(
            "refused",
            policy,
            catalog,
            closure,
            domains,
            diagnostics,
        ));
    }
    let closure_errors = closure_schema_diagnostics(&closure, context)?;
    if !closure_errors.is_empty() {
        diagnostics.extend(closure_errors);
        return Ok(domain_result(
            "refused",
            policy,
            catalog,
            closure,
            domains,
            diagnostics,
        ));
    }
    if member(&sources, "status").and_then(text).as_deref() == Some("refused")
        || diagnostics.iter().any(|item| {
            matches!(
                member(item, "code").and_then(text).as_deref(),
                Some("PROTECTION_UNKNOWN" | "SECURITY_V2_UNKNOWN")
            )
        })
    {
        return Ok(domain_result(
            "refused",
            policy,
            catalog,
            closure,
            domains,
            diagnostics,
        ));
    }

    let pins = match member(&closure, "pins") {
        Some(Value::Array(values)) => values,
        _ => unreachable!(),
    };
    let documents = match member(&closure, "documents") {
        Some(Value::Array(values)) => values,
        _ => unreachable!(),
    };
    let mut pin_map: Vec<(String, String)> = Vec::new();
    for (index, pin) in pins.iter().enumerate() {
        let (Some(id), Some(revision)) = (
            member(pin, "documentId").and_then(text),
            member(pin, "revision").and_then(text),
        ) else {
            continue;
        };
        if pin_map.iter().any(|(existing, _)| existing == &id) {
            diagnostics.push(diagnostic(
                "PROTECTION_DOMAIN_PIN",
                &format!("/closure/pins/{index}"),
                "Duplicate exact document identity",
                "error",
            ));
        } else {
            pin_map.push((id, revision));
        }
    }
    let engine = core_engine()?;
    let mut field_locations: Vec<((String, String, String), (usize, usize, usize))> = Vec::new();
    let mut resolved_documents: Vec<(String, usize)> = Vec::new();
    for (index, entry) in documents.iter().enumerate() {
        let at = format!("/closure/documents/{index}");
        let revision = member(entry, "revision").and_then(text).unwrap_or_default();
        let document = member(entry, "document").unwrap_or(&NULL_VALUE);
        let mut capabilities = NoExtensions;
        let validation =
            engine.validate_document(document, &Registry::new(), &mut capabilities, context)?;
        let is_v010 = member(document, "umf").and_then(text).as_deref() == Some("0.10.0");
        let accepted = is_v010
            && validation.valid
            && validation.diagnostics.iter().all(|item| {
                item.code.to_utf8().ok().as_deref() == Some("EXPERIMENTAL_CORE_SEMANTIC_TYPES")
                    && item.path.to_utf8().ok().as_deref() == Some("/umf")
                    && item.severity == Severity::Warning
            });
        if !accepted {
            diagnostics.push(diagnostic(
                "PROTECTION_DOMAIN_DOCUMENT",
                &at,
                "Known core0.10 security domain required",
                "error",
            ));
            diagnostics.extend(
                validation
                    .diagnostics
                    .iter()
                    .map(|item| validation_diagnostic(item, &format!("{at}/document"))),
            );
        }
        let document_id = member(document, "id").and_then(text).unwrap_or_default();
        let pin_matches = pin_map
            .iter()
            .any(|(id, pin_revision)| id == &document_id && pin_revision == &revision);
        let duplicate_document = resolved_documents.iter().any(|(id, _)| id == &document_id);
        if !pin_matches || duplicate_document {
            diagnostics.push(diagnostic(
                "PROTECTION_DOMAIN_PIN",
                &at,
                "Unpinned, stale or duplicate document",
                "error",
            ));
        } else {
            resolved_documents.push((document_id.clone(), index));
        }
        if let Some(Value::Array(modules)) = member(document, "modules") {
            for (module_index, module) in modules.iter().enumerate() {
                let module_id = member(module, "id").and_then(text).unwrap_or_default();
                if let Some(Value::Array(elements)) = member(module, "elements") {
                    for (element_index, element) in elements.iter().enumerate() {
                        if member(element, "kind").and_then(text).as_deref() == Some("field") {
                            if let Some(element_id) = member(element, "id").and_then(text) {
                                field_locations.push((
                                    (document_id.clone(), module_id.clone(), element_id),
                                    (index, module_index, element_index),
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
    for (document_id, _) in &pin_map {
        if !resolved_documents
            .iter()
            .any(|(existing, _)| existing == document_id)
        {
            diagnostics.push(diagnostic(
                "PROTECTION_DOMAIN_PIN",
                "/closure/pins",
                "Pinned document missing",
                "error",
            ));
        }
    }
    if errors(&diagnostics) {
        return Ok(domain_result(
            "refused",
            policy,
            catalog,
            closure,
            domains,
            diagnostics,
        ));
    }

    let mut references = references_from_catalog(&catalog);
    references.extend(references_from_policy(
        &policy,
        member(&sources, "references").unwrap_or(&NULL_VALUE),
    ));
    for (path, reference) in references {
        let Some(identity) = reference_identity(&reference) else {
            continue;
        };
        let selected = field_locations
            .iter()
            .find(|(key, _)| key == &identity)
            .map(|(_, position)| *position);
        if let Some((document_index, module_index, element_index)) = selected {
            domains.push(Value::Object(vec![
                (
                    "source".into(),
                    Value::string_utf8(if path.starts_with("/rules/") {
                        "policy"
                    } else {
                        "catalog"
                    }),
                ),
                ("path".into(), Value::string_utf8(&path)),
                ("ref".into(), reference),
                (
                    "definition".into(),
                    Value::Object(vec![
                        ("documentIndex".into(), Value::Number(document_index as f64)),
                        ("moduleIndex".into(), Value::Number(module_index as f64)),
                        ("elementIndex".into(), Value::Number(element_index as f64)),
                    ]),
                ),
            ]));
        } else {
            diagnostics.push(diagnostic(
                "PROTECTION_DOMAIN_REFERENCE",
                &format!(
                    "/{}{}",
                    if path.starts_with("/rules/") {
                        "policy"
                    } else {
                        "catalog"
                    },
                    path
                ),
                "Exact qualified Field definition missing",
                "error",
            ));
        }
    }
    diagnostics.push(Value::Object(vec![
        ("code".into(), Value::string_utf8("PROTECTION_DOMAIN_ONLY")),
        ("path".into(), Value::string_utf8("")),
        ("severity".into(), Value::string_utf8("warning")),
        ("message".into(), Value::string_utf8("Core definitions resolved only; domain compatibility, literal/function/query semantics, ontology and native authority remain separate")),
    ]));
    let status = if errors(&diagnostics) {
        "refused"
    } else {
        "resolved-domains"
    };
    if status == "refused" {
        domains.clear();
    }
    Ok(domain_result(
        status,
        policy,
        catalog,
        closure,
        domains,
        diagnostics,
    ))
}

fn domain_result(
    status: &str,
    policy: Value,
    catalog: Value,
    closure: Value,
    domains: Vec<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    Value::Object(vec![
        ("status".into(), Value::string_utf8(status)),
        ("complete".into(), Value::Bool(false)),
        ("authority".into(), Value::Bool(false)),
        ("policy".into(), policy),
        ("catalog".into(), catalog),
        ("closure".into(), closure),
        ("domains".into(), Value::Array(domains)),
        ("diagnostics".into(), Value::Array(diagnostics)),
    ])
}

#[cfg(test)]
mod tests {
    use super::{member, resolve_security_protection_domains_candidate};
    use crate::{
        serialization::{read_json_value, Format},
        Context, Utf16, Value,
    };

    fn parse(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn projected(actual: &Value, input_closure: &Value) -> Value {
        Value::Object(
            ["status", "complete", "authority", "domains", "diagnostics"]
                .into_iter()
                .map(|key| (Utf16::from(key), member(actual, key).unwrap().clone()))
                .chain(std::iter::once((
                    Utf16::from("retainsClosure"),
                    Value::Bool(member(actual, "closure") == Some(input_closure)),
                )))
                .collect(),
        )
    }

    #[test]
    fn replays_every_frozen_tagged_domain_case() {
        let packet = parse(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r8-security-protection-resolution/predecessor.json"
        ));
        let Value::Array(cases) = member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        let mut replayed = 0;
        for case in cases {
            if member(case, "stage") != Some(&Value::string_utf8("domains")) {
                continue;
            }
            let Some(sources) = member(case, "sources") else {
                continue;
            };
            let policy = member(sources, "policy").unwrap();
            let catalog = member(sources, "catalog").unwrap();
            let closure = member(sources, "closure").unwrap();
            let actual = resolve_security_protection_domains_candidate(
                policy,
                catalog,
                closure,
                &mut Context::ordinary(),
            )
            .unwrap();
            let expected = member(member(case, "outcome").unwrap(), "value").unwrap();
            assert_eq!(
                projected(&actual, closure),
                *expected,
                "case {:?}",
                member(case, "id")
            );
            replayed += 1;
        }
        assert_eq!(replayed, 5);
    }

    #[test]
    fn closure_schema_diagnostic_preserves_isolated_utf16_path_and_message() {
        let diagnostic = super::closure_schema_diagnostic(
            "type".to_owned(),
            Utf16::new(vec![b'/' as u16, 0xd800]),
            Utf16::new(vec![b'x' as u16, 0xd800]),
        );
        let path = member(&diagnostic, "path").expect("diagnostic path");
        let Value::String(path) = path else {
            panic!("path should remain a UTF-16 string")
        };
        assert!(path.units().contains(&0xd800));
        let message = member(&diagnostic, "message").expect("diagnostic message");
        let Value::String(message) = message else {
            panic!("message should remain a UTF-16 string")
        };
        assert!(message.units().contains(&0xd800));
    }
}
