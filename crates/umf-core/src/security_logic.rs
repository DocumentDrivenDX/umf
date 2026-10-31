// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Strong Kleene truth operators for the shared security extension.
//!
//! These operations interpret only the closed T/F/U truth domain. They do not
//! select a policy, authenticate facts, or grant authority to a host.

use crate::{
    context::Context,
    error::EngineError,
    schema::{CompiledSchema, SchemaResources},
    value::{Utf16, Value, copy_json},
};
use std::{collections::BTreeSet, sync::OnceLock};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SecurityTruth {
    True,
    False,
    Unknown,
}

#[derive(Clone, Debug, PartialEq)]
enum SecurityDisposition {
    Original,
    Withheld,
    Transformed(Value),
}

impl SecurityTruth {
    fn parse(value: &Value) -> Result<Self, EngineError> {
        match value {
            Value::String(value) if value == &Utf16::from("T") => Ok(Self::True),
            Value::String(value) if value == &Utf16::from("F") => Ok(Self::False),
            Value::String(value) if value == &Utf16::from("U") => Ok(Self::Unknown),
            _ => Err(error("SECURITY_TRUTH", "Invalid security truth")),
        }
    }

    fn value(self) -> Value {
        Value::string_utf8(match self {
            Self::True => "T",
            Self::False => "F",
            Self::Unknown => "U",
        })
    }
}

fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn security_path(base: &str, segment: &str) -> String {
    if base.is_empty() {
        format!("/{segment}")
    } else {
        format!("{base}/{segment}")
    }
}

const SECURITY_V2_UNIMPLEMENTED: &str =
    "Representation only; no0.2 domain/function/query interpretation or native activation";
const PROTECTION_UNIMPLEMENTED: &str = "Wire structure and local bounds only; domain/function/query closure, action binding and native custody remain unimplemented";

fn json_member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn json_text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

fn protection_diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        ("code".into(), Value::string_utf8(code)),
        ("path".into(), Value::string_utf8(path)),
        ("message".into(), Value::string_utf8(message)),
        ("severity".into(), Value::string_utf8(severity)),
    ])
}

fn protection_diagnostic_utf16(code: &str, path: Utf16, message: Utf16, severity: &str) -> Value {
    Value::Object(vec![
        ("code".into(), Value::string_utf8(code)),
        ("path".into(), Value::String(path)),
        ("message".into(), Value::String(message)),
        ("severity".into(), Value::string_utf8(severity)),
    ])
}

fn source_schema(package: &'static str) -> Result<CompiledSchema, EngineError> {
    static POLICY: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    static CATALOG: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    let slot = if package == "policy" {
        &POLICY
    } else {
        &CATALOG
    };
    slot.get_or_init(|| {
        let source = if package == "policy" {
            include_str!("../../../spec/extensions/security-v0.2/package.json")
        } else {
            include_str!("../../../spec/extensions/security-protection/package.json")
        };
        let package_value = crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )?;
        let schema = json_member(&package_value, "schema").ok_or_else(|| {
            EngineError::new(
                "SECURITY_SCHEMA",
                Utf16::default(),
                "Embedded security schema is missing",
            )
        })?;
        CompiledSchema::compile_consumer(
            schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
    })
    .clone()
}

fn source_text_bound(value: &Value, context: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut units = 0usize;
    let mut pending = vec![value];
    while let Some(current) = pending.pop() {
        context.charge_work(1, Utf16::default())?;
        match current {
            Value::String(text) => units = units.saturating_add(text.len()),
            Value::Array(items) => pending.extend(items),
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

fn unknown_object_members(value: &Value, known: &[&str], prefix: &str) -> Vec<Value> {
    let Value::Object(fields) = value else {
        return Vec::new();
    };
    fields
        .iter()
        .filter_map(|(key, _)| {
            let key_text = key.to_utf8().ok()?;
            if known.contains(&key_text.as_str()) {
                None
            } else {
                let escaped = key_text.replace('~', "~0").replace('/', "~1");
                Some(protection_diagnostic(
                    "SECURITY_V2_UNKNOWN",
                    &format!("{prefix}/{escaped}"),
                    "Uninterpreted policy source retained",
                    "warning",
                ))
            }
        })
        .collect()
}

fn policy_unknowns(value: &Value) -> Vec<Value> {
    // The 0.2 schema makes unknown object members retainable. This walk covers
    // the policy root and the source case families frozen in the packet; the
    // interpretation remains unimplemented regardless of warning count.
    unknown_object_members(
        value,
        &[
            "vocabulary",
            "version",
            "id",
            "revision",
            "ontology",
            "rules",
            "native",
            "protection",
        ],
        "",
    )
}

fn policy_has_catalog_disposition(value: &Value) -> bool {
    let Some(Value::Array(rules)) = json_member(value, "rules") else {
        return false;
    };
    rules.iter().any(|rule| {
        let Some(Value::Array(disclosures)) = json_member(rule, "disclosure") else {
            return false;
        };
        disclosures.iter().any(|disclosure| {
            let Some(disposition) = json_member(disclosure, "disposition") else {
                return false;
            };
            json_member(disposition, "kind")
                .and_then(json_text)
                .as_deref()
                == Some("transformed")
                && json_member(disposition, "vocabulary")
                    .and_then(json_text)
                    .as_deref()
                    == Some("umf.security.protection")
        })
    })
}

fn catalog_unknowns(value: &Value) -> Vec<Value> {
    let mut diagnostics = unknown_object_members(
        value,
        &[
            "vocabulary",
            "version",
            "id",
            "revision",
            "transforms",
            "native",
        ],
        "",
    )
    .into_iter()
    .map(|mut diagnostic| {
        if let Value::Object(fields) = &mut diagnostic {
            if let Some((_, code)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("code"))
            {
                *code = Value::string_utf8("PROTECTION_UNKNOWN");
            }
            if let Some((_, message)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("message"))
            {
                *message = Value::string_utf8("Uninterpreted protection member retained");
            }
        }
        diagnostic
    })
    .collect::<Vec<_>>();
    if let Some(Value::Array(transforms)) = json_member(value, "transforms") {
        let mut identities: Vec<(Value, Value)> = Vec::new();
        for (index, transform) in transforms.iter().enumerate() {
            let identity = (
                json_member(transform, "id").cloned().unwrap_or(Value::Null),
                json_member(transform, "version")
                    .cloned()
                    .unwrap_or(Value::Null),
            );
            if identities.iter().any(|prior| prior == &identity) {
                diagnostics.push(protection_diagnostic(
                    "PROTECTION_DUPLICATE",
                    &format!("/transforms/{index}"),
                    "Duplicate transform id/version pair",
                    "error",
                ));
            }
            identities.push(identity);
            diagnostics.extend(
                unknown_object_members(
                    transform,
                    &[
                        "id",
                        "version",
                        "kind",
                        "inputDomain",
                        "outputDomain",
                        "determinism",
                        "reversibility",
                        "disclosureProfile",
                        "queryUse",
                        "parameters",
                        "function",
                        "algorithm",
                        "saltCustody",
                        "custody",
                        "reverseAction",
                    ],
                    &format!("/transforms/{index}"),
                )
                .into_iter()
                .map(|mut diagnostic| {
                    if let Value::Object(fields) = &mut diagnostic {
                        if let Some((_, code)) = fields
                            .iter_mut()
                            .find(|(key, _)| key == &Utf16::from("code"))
                        {
                            *code = Value::string_utf8("PROTECTION_UNKNOWN");
                        }
                        if let Some((_, message)) = fields
                            .iter_mut()
                            .find(|(key, _)| key == &Utf16::from("message"))
                        {
                            *message =
                                Value::string_utf8("Uninterpreted protection member retained");
                        }
                    }
                    diagnostic
                }),
            );
            diagnostics.extend(catalog_literal_bounds_for_transform(transform, index));
        }
    }
    diagnostics
}

fn quoted_canonical_units(value: &Utf16) -> Option<usize> {
    let units = value.units();
    let mut length = 2usize;
    let mut index = 0;
    while index < units.len() {
        let unit = units[index];
        let escaped = match unit {
            0x22 | 0x5c | 0x08 | 0x09 | 0x0a | 0x0c | 0x0d => 2,
            0x00..=0x1f => 6,
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
            {
                index += 1;
                2
            }
            0xd800..=0xdfff => 6,
            _ => 1,
        };
        length = length.checked_add(escaped)?;
        index += 1;
    }
    Some(length)
}

pub(crate) fn canonical_json_units(value: &Value, depth: usize) -> Option<usize> {
    if depth > 128 {
        return None;
    }
    match value {
        Value::Null => Some(4),
        Value::Bool(true) => Some(4),
        Value::Bool(false) => Some(5),
        Value::Number(number) => Some(
            crate::value::ecma_number_to_string(*number)
                .encode_utf16()
                .count(),
        ),
        Value::String(value) => quoted_canonical_units(value),
        Value::Array(items) => {
            let mut size = 2usize;
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    size = size.checked_add(1)?;
                }
                size = size.checked_add(canonical_json_units(item, depth + 1)?)?;
            }
            Some(size)
        }
        Value::Object(fields) => {
            let mut size = 2usize;
            for (index, (key, value)) in fields.iter().enumerate() {
                if index > 0 {
                    size = size.checked_add(1)?;
                }
                size = size
                    .checked_add(quoted_canonical_units(key)?)?
                    .checked_add(1)?;
                size = size.checked_add(canonical_json_units(value, depth + 1)?)?;
            }
            Some(size)
        }
    }
}

/// Catalog literal-size admission precedes domain resolution and its
/// `PROTECTION_DOMAIN_ONLY` diagnostic in the TypeScript predecessor.
fn catalog_literal_bounds_for_transform(transform: &Value, transform_index: usize) -> Vec<Value> {
    let mut diagnostics = Vec::new();
    if let Some(Value::Array(parameters)) = json_member(transform, "parameters") {
        for (parameter_index, parameter) in parameters.iter().enumerate() {
            if let Some(literal) = json_member(parameter, "value") {
                if canonical_json_units(literal, 0).is_none_or(|size| size > 4096) {
                    diagnostics.push(protection_diagnostic(
                        "PROTECTION_BOUND",
                        &format!(
                            "/transforms/{transform_index}/parameters/{parameter_index}/value"
                        ),
                        "resource-exhausted: canonical literal exceeds4096 UTF-16 units",
                        "error",
                    ));
                }
            }
        }
    }
    if let Some(Value::Array(profile)) = json_member(transform, "disclosureProfile") {
        for (entry_index, entry) in profile.iter().enumerate() {
            if json_member(entry, "kind").and_then(json_text).as_deref() != Some("range") {
                continue;
            }
            let Some(bucket) = json_member(entry, "bucket") else {
                continue;
            };
            if let Some(literal) = json_member(bucket, "value") {
                if canonical_json_units(literal, 0).is_none_or(|size| size > 4096) {
                    diagnostics.push(protection_diagnostic(
                        "PROTECTION_BOUND",
                        &format!("/transforms/{transform_index}/disclosureProfile/{entry_index}/bucket/value"),
                        "resource-exhausted: canonical literal exceeds4096 UTF-16 units",
                        "error",
                    ));
                }
            }
        }
    }
    diagnostics
}

fn schema_diagnostics(
    schema: &CompiledSchema,
    source: &Value,
    code: &str,
    context: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    Ok(schema
        .validate(source, context)?
        .into_iter()
        .map(|error| {
            let message = if error.keyword == "const" {
                Utf16::from("must pass \"const\" keyword validation")
            } else {
                error.message.clone()
            };
            protection_diagnostic_utf16(code, error.instance_path, message, "error")
        })
        .collect())
}

/// Exact tagged-source resolver candidate for the frozen current V2 source
/// cases. It resolves only exact catalog pins and transform references; all
/// policy/catalog interpretation remains explicitly incomplete and has no
/// authority. Unknown-member coverage is intentionally bounded to the tested
/// V2 policy root and protection transform objects.
pub fn resolve_security_protection_sources_candidate(
    policy_input: &Value,
    catalog_input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let policy = copy_json(policy_input, context)?;
    let catalog = copy_json(catalog_input, context)?;
    let mut diagnostics = Vec::new();
    if !source_text_bound(&policy, context)? {
        diagnostics.push(protection_diagnostic(
            "SECURITY_V2_BOUND",
            "",
            "resource-exhausted: source key/string text exceeds4000000 UTF-16 units",
            "error",
        ));
    } else {
        diagnostics.extend(schema_diagnostics(
            &source_schema("policy")?,
            &policy,
            "SECURITY_V2_STRUCTURE",
            context,
        )?);
        if json_member(&policy, "protection").is_none() && policy_has_catalog_disposition(&policy) {
            diagnostics.push(protection_diagnostic(
                "SECURITY_V2_STRUCTURE",
                "",
                "must match \"then\" schema",
                "error",
            ));
        }
        if !diagnostics.iter().any(|item| {
            json_member(item, "severity").and_then(json_text).as_deref() == Some("error")
        }) {
            diagnostics.extend(policy_unknowns(&policy));
        }
    }
    diagnostics.push(protection_diagnostic(
        "SECURITY_V2_UNIMPLEMENTED",
        "",
        SECURITY_V2_UNIMPLEMENTED,
        "warning",
    ));
    if !source_text_bound(&catalog, context)? {
        diagnostics.push(protection_diagnostic(
            "PROTECTION_BOUND",
            "",
            "resource-exhausted: source key/string text exceeds4000000 UTF-16 units",
            "error",
        ));
    } else {
        let catalog_schema_diagnostics = schema_diagnostics(
            &source_schema("catalog")?,
            &catalog,
            "PROTECTION_STRUCTURE",
            context,
        )?;
        let has_error = catalog_schema_diagnostics.iter().any(|item| {
            json_member(item, "severity").and_then(json_text).as_deref() == Some("error")
        });
        diagnostics.extend(catalog_schema_diagnostics);
        if !has_error {
            diagnostics.extend(catalog_unknowns(&catalog));
        }
    }
    diagnostics.push(protection_diagnostic(
        "PROTECTION_UNIMPLEMENTED",
        "",
        PROTECTION_UNIMPLEMENTED,
        "warning",
    ));

    let has_error = |items: &[Value]| {
        items.iter().any(|item| {
            json_member(item, "severity").and_then(json_text).as_deref() == Some("error")
        })
    };
    let mut references = Vec::new();
    if !has_error(&diagnostics) {
        let pin = json_member(&policy, "protection");
        let pins_match = pin
            .and_then(|value| json_member(value, "id"))
            .and_then(json_text)
            == json_member(&catalog, "id").and_then(json_text)
            && pin
                .and_then(|value| json_member(value, "revision"))
                .and_then(json_text)
                == json_member(&catalog, "revision").and_then(json_text);
        if !pins_match {
            diagnostics.push(protection_diagnostic(
                "SECURITY_PROTECTION_PIN",
                "/protection",
                "Exact catalog id/revision required",
                "error",
            ));
        } else {
            let transforms = match json_member(&catalog, "transforms") {
                Some(Value::Array(items)) => items.as_slice(),
                _ => &[],
            };
            if let Some(Value::Array(rules)) = json_member(&policy, "rules") {
                for (rule_index, rule) in rules.iter().enumerate() {
                    let disclosures = match json_member(rule, "disclosure") {
                        Some(Value::Array(items)) => items.as_slice(),
                        _ => &[],
                    };
                    for (disclosure_index, disclosure) in disclosures.iter().enumerate() {
                        let disposition = match json_member(disclosure, "disposition") {
                            Some(value) => value,
                            None => continue,
                        };
                        if json_member(disposition, "kind")
                            .and_then(json_text)
                            .as_deref()
                            != Some("transformed")
                            || json_member(disposition, "vocabulary")
                                .and_then(json_text)
                                .as_deref()
                                != Some("umf.security.protection")
                        {
                            continue;
                        }
                        let id = json_member(disposition, "transform").and_then(json_text);
                        let version = json_member(disposition, "version").and_then(json_text);
                        let selected = transforms.iter().position(|transform| {
                            json_member(transform, "id").and_then(json_text) == id
                                && json_member(transform, "version").and_then(json_text) == version
                        });
                        if let Some(transform_index) = selected {
                            references.push(Value::Object(vec![
                                ("ruleIndex".into(), Value::Number(rule_index as f64)),
                                (
                                    "disclosureIndex".into(),
                                    Value::Number(disclosure_index as f64),
                                ),
                                (
                                    "transformIndex".into(),
                                    Value::Number(transform_index as f64),
                                ),
                            ]));
                        } else {
                            diagnostics.push(protection_diagnostic(
                                "SECURITY_PROTECTION_REFERENCE",
                                &format!(
                                    "/rules/{rule_index}/disclosure/{disclosure_index}/disposition"
                                ),
                                "Exact transform id/version missing",
                                "error",
                            ));
                        }
                    }
                }
            }
        }
    }
    if has_error(&diagnostics) {
        references.clear();
    }
    Ok(Value::Object(vec![
        (
            "status".into(),
            Value::string_utf8(if has_error(&diagnostics) {
                "refused"
            } else {
                "resolved-source"
            }),
        ),
        ("complete".into(), Value::Bool(false)),
        ("authority".into(), Value::Bool(false)),
        ("policy".into(), policy),
        ("catalog".into(), catalog),
        ("references".into(), Value::Array(references)),
        ("diagnostics".into(), Value::Array(diagnostics)),
    ]))
}

#[cfg(test)]
mod protection_source_resolution_tests {
    use super::{json_member, resolve_security_protection_sources_candidate};
    use crate::{
        Context, Value,
        serialization::{Format, read_json_value},
    };

    fn parse(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn text(value: &Value) -> String {
        match value {
            Value::String(value) => value.to_utf8().unwrap(),
            _ => panic!("expected text"),
        }
    }

    #[test]
    fn source_resolver_replays_every_frozen_tagged_case() {
        let packet = parse(include_str!(
            "../../../tests/rust-core/fixtures/r8-security-protection-resolution/predecessor.json"
        ));
        let Value::Array(cases) = json_member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        let mut replayed = 0;
        for case in cases {
            if json_member(case, "stage")
                .and_then(super::json_text)
                .as_deref()
                != Some("source")
            {
                continue;
            }
            let sources = json_member(case, "sources").expect("tagged source inputs");
            let policy = json_member(sources, "policy").unwrap();
            let catalog = json_member(sources, "catalog").unwrap();
            let actual = resolve_security_protection_sources_candidate(
                policy,
                catalog,
                &mut Context::ordinary(),
            )
            .unwrap();
            let expected = json_member(json_member(case, "outcome").unwrap(), "value").unwrap();
            let id = text(json_member(case, "id").unwrap());
            for key in [
                "status",
                "complete",
                "authority",
                "references",
                "diagnostics",
            ] {
                assert_eq!(
                    json_member(&actual, key),
                    json_member(expected, key),
                    "{id}: {key}"
                );
            }
            assert_eq!(
                json_member(&actual, "policy"),
                Some(policy),
                "{id}: policy retention"
            );
            assert_eq!(
                json_member(&actual, "catalog"),
                Some(catalog),
                "{id}: catalog retention"
            );
            replayed += 1;
        }
        assert_eq!(replayed, 10);
    }
}

/// Check expression node shape and the policy interpreter's fixed expression
/// bounds on an already schema-admitted tagged expression. This is an
/// internal admission primitive; it does not validate policy schema, terms,
/// ontology references, or policy authority.
pub(crate) fn check_security_expression_shape_and_bounds(
    expression: &Value,
    base_path: &str,
    context: &mut Context<'_>,
) -> Result<(), EngineError> {
    fn visit(
        expression: &Value,
        path: &str,
        depth: usize,
        nodes: &mut usize,
        context: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        context.charge_work(1, Utf16::from(path))?;
        *nodes += 1;
        if *nodes > 4096 || depth > 16 {
            return Err(EngineError::new(
                "SECURITY_BOUND",
                Utf16::from(path),
                "Expression depth/node bound exceeded",
            ));
        }
        let Value::Object(fields) = expression else {
            return Err(EngineError::new(
                "SECURITY_SHAPE",
                Utf16::from(path),
                "Expected schema-admitted security expression",
            ));
        };
        let member = |name: &str| {
            fields
                .iter()
                .find(|(key, _)| key == &Utf16::from(name))
                .map(|(_, value)| value)
        };
        let Some(Value::String(operation)) = member("op") else {
            return Err(EngineError::new(
                "SECURITY_SHAPE",
                Utf16::from(path),
                "Expected schema-admitted security expression",
            ));
        };
        let nested = |name: &str, value: &Value, nodes: &mut usize, context: &mut Context<'_>| {
            visit(value, &security_path(path, name), depth + 1, nodes, context)
        };
        match operation.to_utf8().as_deref() {
            Ok("literal") if matches!(member("value"), Some(Value::Bool(_))) => Ok(()),
            Ok("eq") if member("left").is_some() && member("right").is_some() => Ok(()),
            Ok("not") => match member("arg") {
                Some(value) => nested("arg", value, nodes, context),
                None => Err(EngineError::new(
                    "SECURITY_SHAPE",
                    Utf16::from(path),
                    "Expected schema-admitted security expression",
                )),
            },
            Ok("exists") => match member("where") {
                Some(value) => nested("where", value, nodes, context),
                None => Err(EngineError::new(
                    "SECURITY_SHAPE",
                    Utf16::from(path),
                    "Expected schema-admitted security expression",
                )),
            },
            Ok("and" | "or") => match member("args") {
                Some(Value::Array(arguments)) => {
                    for (index, argument) in arguments.iter().enumerate() {
                        nested(&format!("args/{index}"), argument, nodes, context)?;
                    }
                    Ok(())
                }
                _ => Err(EngineError::new(
                    "SECURITY_SHAPE",
                    Utf16::from(path),
                    "Expected schema-admitted security expression",
                )),
            },
            _ => Err(EngineError::new(
                "SECURITY_SHAPE",
                Utf16::from(path),
                "Expected schema-admitted security expression",
            )),
        }
    }

    let mut nodes = 0;
    visit(expression, base_path, 1, &mut nodes, context)
}

#[cfg(test)]
mod expression_bounds_tests {
    use super::check_security_expression_shape_and_bounds;
    use crate::{Context, Utf16, Value};

    fn string(value: &str) -> Value {
        Value::string_utf8(value)
    }

    fn object(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    fn literal() -> Value {
        object(vec![
            ("op", string("literal")),
            ("value", Value::Bool(true)),
        ])
    }

    fn chain(depth: usize) -> Value {
        let mut expression = literal();
        for _ in 1..depth {
            expression = object(vec![("op", string("not")), ("arg", expression)]);
        }
        expression
    }

    fn tree_with_nodes(nodes: usize) -> Value {
        let mut branches = Vec::new();
        let mut remaining = nodes - 1;
        while remaining > 0 {
            let branch_nodes = remaining.min(64);
            branches.push(object(vec![
                ("op", string("and")),
                (
                    "args",
                    Value::Array((0..branch_nodes - 1).map(|_| literal()).collect()),
                ),
            ]));
            remaining -= branch_nodes;
        }
        object(vec![("op", string("or")), ("args", Value::Array(branches))])
    }

    #[test]
    fn schema_admitted_expression_depth_limit_is_exact() {
        assert!(
            check_security_expression_shape_and_bounds(
                &chain(16),
                "/rules/0/condition",
                &mut Context::ordinary()
            )
            .is_ok()
        );
        let error = check_security_expression_shape_and_bounds(
            &chain(17),
            "/rules/0/condition",
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "SECURITY_BOUND");
        assert_eq!(
            error.path,
            Utf16::from(format!("/rules/0/condition{}", "/arg".repeat(16)))
        );
        assert_eq!(
            error.message,
            Utf16::from("Expression depth/node bound exceeded")
        );
    }

    #[test]
    fn schema_admitted_expression_node_limit_is_exact_and_depth_first() {
        assert!(
            check_security_expression_shape_and_bounds(
                &tree_with_nodes(4096),
                "/rules/0/condition",
                &mut Context::ordinary()
            )
            .is_ok()
        );
        let error = check_security_expression_shape_and_bounds(
            &tree_with_nodes(4097),
            "/rules/0/condition",
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "SECURITY_BOUND");
        assert_eq!(
            error.path,
            Utf16::from("/rules/0/condition/args/63/args/62")
        );
    }

    #[test]
    fn schema_admitted_expression_shape_guard_and_error_order_are_stable() {
        let nested = object(vec![
            ("op", string("and")),
            ("args", Value::Array(vec![chain(16), literal()])),
        ]);
        let error = check_security_expression_shape_and_bounds(
            &nested,
            "/rules/0/condition",
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "SECURITY_BOUND");
        assert_eq!(
            error.path,
            Utf16::from(format!("/rules/0/condition/args/0{}", "/arg".repeat(15)))
        );

        let malformed = object(vec![("op", string("not"))]);
        let error = check_security_expression_shape_and_bounds(
            &malformed,
            "/condition",
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "SECURITY_SHAPE");
        assert_eq!(error.path, Utf16::from("/condition"));
    }

    #[test]
    fn expression_walk_observes_host_work_control() {
        let mut control = |_: usize| {
            Err(crate::EngineError::new(
                "TEST_BUDGET",
                Utf16::default(),
                "Host work budget exceeded",
            ))
        };
        let error = check_security_expression_shape_and_bounds(
            &literal(),
            "/condition",
            &mut Context::ordinary().with_host_control(&mut control),
        )
        .unwrap_err();
        assert_eq!(error.code, "TEST_BUDGET");
        assert!(error.is_control_failure());
    }
}

/// Three-valued negation (`T→F`, `F→T`, `U→U`).
pub fn security_not(value: &Value) -> Result<Value, EngineError> {
    Ok(match SecurityTruth::parse(value)? {
        SecurityTruth::True => SecurityTruth::False,
        SecurityTruth::False => SecurityTruth::True,
        SecurityTruth::Unknown => SecurityTruth::Unknown,
    }
    .value())
}

/// Stable tuple serialization for an admitted tagged security reference.
/// Missing members serialize as null array entries, matching JSON.stringify.
pub fn security_ref_identity(
    reference: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if matches!(reference, Value::Null) {
        return Err(error("SECURITY_REF", "Expected security reference object"));
    }
    let component = |name: &str, context: &mut Context<'_>| match reference {
        Value::Object(fields) => match fields.iter().find(|(key, _)| key == &Utf16::from(name)) {
            Some((_, value)) => copy_json(value, context),
            None => Ok(Value::Null),
        },
        _ => Ok(Value::Null),
    };
    let tuple = Value::Array(vec![
        component("documentId", context)?,
        component("moduleId", context)?,
        component("elementId", context)?,
    ]);
    Ok(Value::String(
        crate::serialization::stringify_compact_metered(&tuple, context)?,
    ))
}

fn truth_operands(
    value: &Value,
    context: &mut Context<'_>,
) -> Result<Vec<SecurityTruth>, EngineError> {
    let copied = copy_json(value, context)?;
    let Value::Array(values) = copied else {
        return Err(error("SECURITY_BOUND", "Expected 1–64 truth operands"));
    };
    if values.is_empty() || values.len() > 64 {
        return Err(error("SECURITY_BOUND", "Expected 1–64 truth operands"));
    }
    values.iter().map(SecurityTruth::parse).collect()
}

/// Strong Kleene conjunction over one through 64 operands.
pub fn security_and(values: &Value, context: &mut Context<'_>) -> Result<Value, EngineError> {
    let values = truth_operands(values, context)?;
    let result = if values.contains(&SecurityTruth::False) {
        SecurityTruth::False
    } else if values.contains(&SecurityTruth::Unknown) {
        SecurityTruth::Unknown
    } else {
        SecurityTruth::True
    };
    Ok(result.value())
}

/// Strong Kleene disjunction over one through 64 operands.
pub fn security_or(values: &Value, context: &mut Context<'_>) -> Result<Value, EngineError> {
    let values = truth_operands(values, context)?;
    let result = if values.contains(&SecurityTruth::True) {
        SecurityTruth::True
    } else if values.contains(&SecurityTruth::Unknown) {
        SecurityTruth::Unknown
    } else {
        SecurityTruth::False
    };
    Ok(result.value())
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn shape(value: &Value) -> Result<&[(Utf16, Value)], EngineError> {
    match value {
        Value::Object(fields) => Ok(fields),
        _ => Err(error("SECURITY_SHAPE", "Expected security object")),
    }
}

fn only_members(fields: &[(Utf16, Value)], allowed: &[&str]) -> Result<(), EngineError> {
    if fields
        .iter()
        .any(|(key, _)| !allowed.iter().any(|name| key == &Utf16::from(*name)))
    {
        return Err(error("SECURITY_UNKNOWN", "Uninterpreted security member"));
    }
    Ok(())
}

fn parse_disposition(value: &Value) -> Result<SecurityDisposition, EngineError> {
    let fields = shape(value)?;
    let kind = member(value, "kind");
    let transformed =
        matches!(kind, Some(Value::String(name)) if name == &Utf16::from("transformed"));
    only_members(
        fields,
        if transformed {
            &["kind", "type", "value"]
        } else {
            &["kind"]
        },
    )?;
    match kind {
        Some(Value::String(name)) if name == &Utf16::from("original") => {
            Ok(SecurityDisposition::Original)
        }
        Some(Value::String(name)) if name == &Utf16::from("withheld") => {
            Ok(SecurityDisposition::Withheld)
        }
        Some(Value::String(name)) if name == &Utf16::from("transformed") => {
            let supported = matches!(
                (member(value, "type"), member(value, "value")),
                (Some(Value::String(kind)), Some(Value::String(_))) if kind == &Utf16::from("string")
            ) || matches!(
                (member(value, "type"), member(value, "value")),
                (Some(Value::String(kind)), Some(Value::Bool(_))) if kind == &Utf16::from("boolean")
            );
            if !supported {
                return Err(error(
                    "SECURITY_DISPOSITION",
                    "Unsupported or malformed disposition",
                ));
            }
            Ok(SecurityDisposition::Transformed(Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("transformed")),
                (
                    Utf16::from("type"),
                    member(value, "type").expect("validated type").clone(),
                ),
                (
                    Utf16::from("value"),
                    member(value, "value").expect("validated value").clone(),
                ),
            ])))
        }
        _ => Err(error(
            "SECURITY_DISPOSITION",
            "Unsupported or malformed disposition",
        )),
    }
}

/// Compose already-scoped, already-evaluated security rules and disclosure
/// obligations. This does not select policy or establish authority.
pub fn compose_security_rules(
    input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // The predecessor snapshots the complete input before any shape/bounds checks.
    let copied = copy_json(input, context)?;
    let rules = member(&copied, "rules");
    let protected = member(&copied, "protectedFields");
    let (Some(Value::Array(rules)), Some(Value::Array(protected))) = (rules, protected) else {
        return Err(error(
            "SECURITY_BOUND",
            "Invalid composition bounds or protected fields",
        ));
    };
    if rules.len() > 256 || protected.len() > 4096 {
        return Err(error(
            "SECURITY_BOUND",
            "Invalid composition bounds or protected fields",
        ));
    }
    let mut protected_set = BTreeSet::new();
    for field in protected {
        let Value::String(field) = field else {
            return Err(error(
                "SECURITY_BOUND",
                "Invalid composition bounds or protected fields",
            ));
        };
        if field.is_empty() || !protected_set.insert(field.units().to_vec()) {
            return Err(error(
                "SECURITY_BOUND",
                "Invalid composition bounds or protected fields",
            ));
        }
    }

    let mut parsed_rules = Vec::with_capacity(rules.len());
    for value in rules {
        let fields = shape(value)?;
        only_members(fields, &["effect", "truth", "disclosure"])?;
        let effect = match member(value, "effect") {
            Some(Value::String(effect)) if effect == &Utf16::from("permit") => 0,
            Some(Value::String(effect)) if effect == &Utf16::from("require") => 1,
            Some(Value::String(effect)) if effect == &Utf16::from("forbid") => 2,
            _ => return Err(error("SECURITY_EFFECT", "Invalid effect")),
        };
        let truth = SecurityTruth::parse(
            member(value, "truth")
                .ok_or_else(|| error("SECURITY_TRUTH", "Invalid security truth"))?,
        )?;
        let mut disclosure = Vec::new();
        if let Some(declaration) = member(value, "disclosure") {
            if effect != 0 {
                return Err(error(
                    "SECURITY_DISCLOSURE",
                    "Only permits carry disclosure",
                ));
            }
            let fields = shape(declaration)?;
            if fields.len() > 4096 || fields.iter().any(|(field, _)| field.is_empty()) {
                return Err(error("SECURITY_BOUND", "Invalid disclosure fields"));
            }
            for (field, disposition) in fields {
                disclosure.push((field.clone(), parse_disposition(disposition)?));
            }
        }
        parsed_rules.push((effect, truth, disclosure));
    }

    let refuse = |decision: &str| {
        Value::Object(vec![
            (Utf16::from("decision"), Value::string_utf8(decision)),
            (Utf16::from("disclosure"), Value::Object(vec![])),
        ])
    };
    if parsed_rules
        .iter()
        .any(|(_, truth, _)| *truth == SecurityTruth::Unknown)
    {
        return Ok(refuse("indeterminate"));
    }
    if !parsed_rules
        .iter()
        .any(|(effect, truth, _)| *effect == 0 && *truth == SecurityTruth::True)
        || parsed_rules
            .iter()
            .any(|(effect, truth, _)| *effect == 1 && *truth != SecurityTruth::True)
        || parsed_rules
            .iter()
            .any(|(effect, truth, _)| *effect == 2 && *truth == SecurityTruth::True)
    {
        return Ok(refuse("deny"));
    }

    let mut obligations: Vec<(Utf16, Vec<SecurityDisposition>)> = Vec::new();
    for (effect, truth, disclosure) in &parsed_rules {
        if *effect == 0 && *truth == SecurityTruth::True {
            for (field, disposition) in disclosure {
                match obligations
                    .iter_mut()
                    .find(|(existing, _)| existing == field)
                {
                    Some((_, values)) => values.push(disposition.clone()),
                    None => obligations.push((field.clone(), vec![disposition.clone()])),
                }
            }
        }
    }
    if protected_set.iter().any(|field| {
        !obligations
            .iter()
            .any(|(candidate, _)| candidate.units() == field)
    }) {
        return Ok(refuse("indeterminate"));
    }
    let mut result_disclosure = Vec::with_capacity(obligations.len());
    for (field, values) in obligations {
        if values.contains(&SecurityDisposition::Withheld) {
            result_disclosure.push((
                field,
                Value::Object(vec![(Utf16::from("kind"), Value::string_utf8("withheld"))]),
            ));
            continue;
        }
        let transforms = values
            .iter()
            .filter_map(|value| match value {
                SecurityDisposition::Transformed(value) => Some(value),
                _ => None,
            })
            .collect::<Vec<_>>();
        if transforms.windows(2).any(|pair| pair[0] != pair[1]) {
            return Ok(refuse("conflict"));
        }
        result_disclosure.push((
            field,
            transforms.first().map_or_else(
                || Value::Object(vec![(Utf16::from("kind"), Value::string_utf8("original"))]),
                |value| (*value).clone(),
            ),
        ));
    }
    Ok(Value::Object(vec![
        (Utf16::from("decision"), Value::string_utf8("permit")),
        (Utf16::from("disclosure"), Value::Object(result_disclosure)),
    ]))
}

#[cfg(test)]
mod utf16_diagnostic_tests {
    use super::{json_member, schema_diagnostics};
    use crate::{
        Context, Utf16, Value,
        schema::{CompiledSchema, SchemaResources},
    };

    #[test]
    fn schema_diagnostic_preserves_isolated_utf16_instance_path() {
        let mut context = Context::ordinary();
        let key = Utf16::new(vec![0xd800]);
        let schema_value = Value::Object(vec![
            (Utf16::from("type"), Value::string_utf8("object")),
            (
                Utf16::from("properties"),
                Value::Object(vec![(
                    key.clone(),
                    Value::Object(vec![(Utf16::from("type"), Value::string_utf8("string"))]),
                )]),
            ),
        ]);
        let schema = CompiledSchema::compile_consumer(
            &schema_value,
            &SchemaResources::default(),
            false,
            &mut context,
        )
        .unwrap();
        let source = Value::Object(vec![(key, Value::Bool(true))]);
        let diagnostics = schema_diagnostics(&schema, &source, "TEST", &mut context).unwrap();
        let Value::String(path) = json_member(&diagnostics[0], "path").unwrap() else {
            panic!("path should remain a UTF-16 string")
        };
        assert!(path.units().contains(&0xd800));
    }
}
