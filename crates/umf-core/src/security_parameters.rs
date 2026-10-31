// SPDX-License-Identifier: MIT OR Apache-2.0
//! Non-authoritative V2 protection parameter literal admission candidate.

use crate::{
    context::Context,
    engine::{Engine, ResourceSet},
    error::EngineError,
    serialization::{self, Format},
    value::{Utf16, Value},
};
use std::sync::OnceLock;

const NULL_VALUE: Value = Value::Null;
#[derive(Default)]
struct LiteralBudget {
    work: usize,
    text: usize,
}

fn member<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(fields) => fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn index(v: &Value) -> Option<usize> {
    match v {
        // Indices are generated from the bounded closure arrays. Refuse any
        // non-finite, fractional, or implausibly large number before casting.
        Value::Number(n) if n.is_finite() && *n >= 0.0 && *n < 4_000_000.0 && n.fract() == 0.0 => {
            Some(*n as usize)
        }
        _ => None,
    }
}
fn item(v: Option<&Value>, i: usize) -> Option<&Value> {
    match v? {
        Value::Array(xs) => xs.get(i),
        _ => None,
    }
}
fn parse_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
pub(crate) fn core_engine() -> Result<Engine, EngineError> {
    static ENGINE: OnceLock<Result<Engine, EngineError>> = OnceLock::new();
    ENGINE
        .get_or_init(|| {
            let mut ctx = Context::ordinary();
            let core = parse_resource(include_str!("../../../spec/core/schema.json"), &mut ctx)?;
            let reference = parse_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                &mut ctx,
            )?;
            let package = parse_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                &mut ctx,
            )?;
            let constraints = parse_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                &mut ctx,
            )?;
            let policy = parse_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                &mut ctx,
            )?;
            Engine::new(
                ResourceSet::new(core, reference, package, constraints, policy),
                &mut ctx,
            )
        })
        .clone()
}
fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        ("code".into(), Value::string_utf8(code)),
        ("path".into(), Value::string_utf8(path)),
        ("message".into(), Value::string_utf8(message)),
        ("severity".into(), Value::string_utf8(severity)),
    ])
}
fn engine_diagnostic(code: &str, path: &str, error_path: &Utf16, message: &Utf16) -> Value {
    let mut units = path.encode_utf16().collect::<Vec<_>>();
    units.extend_from_slice(error_path.units());
    Value::Object(vec![
        ("code".into(), Value::string_utf8(code)),
        ("path".into(), Value::String(Utf16::new(units))),
        ("message".into(), Value::String(message.clone())),
        ("severity".into(), Value::string_utf8("error")),
    ])
}
fn has_errors(ds: &[Value]) -> bool {
    ds.iter()
        .any(|d| member(d, "severity").and_then(text).as_deref() == Some("error"))
}
fn result(status: &str, domains: &Value, validated: Vec<Value>, diagnostics: Vec<Value>) -> Value {
    Value::Object(vec![
        ("status".into(), Value::string_utf8(status)),
        ("complete".into(), Value::Bool(false)),
        ("authority".into(), Value::Bool(false)),
        (
            "policy".into(),
            member(domains, "policy").cloned().unwrap_or(Value::Null),
        ),
        (
            "catalog".into(),
            member(domains, "catalog").cloned().unwrap_or(Value::Null),
        ),
        (
            "closure".into(),
            member(domains, "closure").cloned().unwrap_or(Value::Null),
        ),
        ("validated".into(), Value::Array(validated)),
        ("diagnostics".into(), Value::Array(diagnostics)),
    ])
}
fn field_location<'a>(domains: &'a Value, path: &str) -> Option<&'a Value> {
    let Value::Array(entries) = member(domains, "domains")? else {
        return None;
    };
    entries.iter().find(|entry| {
        member(entry, "source").and_then(text).as_deref() == Some("catalog")
            && member(entry, "path").and_then(text).as_deref() == Some(path)
    })
}
fn budget_fault(path: &str, message: &str) -> Value {
    diagnostic("PROTECTION_LITERAL_BOUND", path, message, "error")
}
fn budget_step(budget: &mut LiteralBudget, units: usize, path: &str) -> Option<Value> {
    budget.work = budget.work.saturating_add(units);
    (budget.work > 100_000)
        .then(|| budget_fault(path, "resource-exhausted: literal work exceeds100000 units"))
}
fn budget_numeric(
    field: &Value,
    value: &Value,
    budget: &mut LiteralBudget,
    path: &str,
) -> Option<Value> {
    if matches!(
        value,
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
    ) {
        return None;
    }
    let scalar = member(field, "scalarType").and_then(text);
    let token_name = if scalar.as_deref() == Some("decimal") {
        "decimalToken"
    } else {
        "integerToken"
    };
    let Some(Value::String(token_value)) = member(value, token_name) else {
        let values: Vec<&Value> = match value {
            Value::Array(values) => values.iter().collect(),
            Value::Object(fields) => fields.iter().map(|(_, value)| value).collect(),
            _ => Vec::new(),
        };
        for value in values {
            if let Value::String(value) = value {
                if let Some(fault) = budget_step(budget, value.len(), path) {
                    return Some(fault);
                }
            }
        }
        if let Some(Value::Object(map)) = member(value, "map") {
            for (key, _) in map {
                if let Some(fault) = budget_step(budget, key.len(), path) {
                    return Some(fault);
                }
            }
        }
        return None;
    };
    if let Some(fault) = budget_step(budget, token_value.len(), path) {
        return Some(fault);
    }
    let Ok(token) = token_value.to_utf8() else {
        return None;
    };
    if !canonical_numeric(&token) {
        return None;
    }
    let (coefficient, exponent) = token.split_once(['e', 'E']).unwrap_or((&token, "0"));
    if exponent.len() > 32 {
        return None;
    }
    let exp = match exponent.parse::<i128>() {
        Ok(value) => value,
        Err(_) if exponent.starts_with('-') => return None,
        Err(_) => {
            return Some(budget_fault(
                path,
                "resource-exhausted: normalized coefficient text exceeds100000 units",
            ));
        }
    };
    let (integer, fraction) = coefficient.split_once('.').unwrap_or((coefficient, ""));
    let digits = format!("{integer}{fraction}").trim_start_matches('0').len();
    if digits == 0 {
        budget.text = budget.text.saturating_add(1);
        if budget.text > 100_000 {
            return Some(budget_fault(
                path,
                "resource-exhausted: normalized coefficient text exceeds100000 units",
            ));
        }
    } else {
        let scale = if scalar.as_deref() == Some("decimal") {
            let Some(scale_value) = member(member(field, "facets").unwrap_or(&NULL_VALUE), "scale")
            else {
                return None;
            };
            let Value::Number(scale) = scale_value else {
                return None;
            };
            if !scale.is_finite() || scale.fract() != 0.0 || scale.abs() > 9_007_199_254_740_991.0 {
                return None;
            }
            // This value comes from the already schema-admitted bounded Field;
            // conversion is exact after the safe-integer check above.
            *scale as i128
        } else {
            0
        };
        let fraction_len = match i128::try_from(fraction.len()) {
            Ok(value) => value,
            Err(_) => {
                return Some(budget_fault(
                    path,
                    "resource-exhausted: normalized coefficient text exceeds100000 units",
                ));
            }
        };
        let shift = exp - fraction_len + scale;
        let size = if shift >= 0 {
            (digits as i128).saturating_add(shift)
        } else {
            digits as i128
        };
        if size > 100_000 - budget.text as i128 {
            return Some(budget_fault(
                path,
                "resource-exhausted: normalized coefficient text exceeds100000 units",
            ));
        }
        budget.text = budget.text.saturating_add(size as usize);
    }
    None
}
fn literal_budget_fault(
    field: &Value,
    value: &Value,
    budget: &mut LiteralBudget,
    path: &str,
) -> Option<Value> {
    if let Some(fault) = budget_step(budget, 1, path) {
        return Some(fault);
    }
    if let Some(fault) = budget_numeric(field, value, budget, path) {
        return Some(fault);
    }
    let facets = member(field, "facets").unwrap_or(&NULL_VALUE);
    if member(facets, "integerWidth").is_some() {
        if let Some(fault) = budget_numeric(field, value, budget, path) {
            return Some(fault);
        }
    }
    if let Some(range) = member(facets, "range") {
        for key in ["min", "max"] {
            if let Some(bound) = member(range, key) {
                if let Some(fault) = budget_step(budget, 1, path) {
                    return Some(fault);
                }
                if let Some(fault) = budget_numeric(field, bound, budget, path) {
                    return Some(fault);
                }
                if let Some(fault) = budget_numeric(field, value, budget, path) {
                    return Some(fault);
                }
            }
        }
    }
    if let Some(Value::Array(allowed)) = member(field, "allowedValues") {
        for candidate in allowed {
            if let Some(fault) = budget_step(budget, 1, path) {
                return Some(fault);
            }
            if let Some(fault) = budget_numeric(field, candidate, budget, path) {
                return Some(fault);
            }
            if let Some(fault) = budget_numeric(field, value, budget, path) {
                return Some(fault);
            }
        }
    }
    None
}
fn canonical_numeric(token: &str) -> bool {
    let unsigned = token.strip_prefix('-').unwrap_or(token);
    let (mantissa, exponent) = unsigned.split_once(['e', 'E']).unwrap_or((unsigned, ""));
    if unsigned.contains(['e', 'E']) {
        let exp = exponent
            .strip_prefix('+')
            .or_else(|| exponent.strip_prefix('-'))
            .unwrap_or(exponent);
        if exp.is_empty() || !exp.bytes().all(|byte| byte.is_ascii_digit()) {
            return false;
        }
    }
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    let whole_valid = whole == "0"
        || (!whole.is_empty()
            && !whole.starts_with('0')
            && whole.bytes().all(|b| b.is_ascii_digit()));
    whole_valid
        && (fraction.is_empty() || fraction.bytes().all(|byte| byte.is_ascii_digit()))
        && (!mantissa.contains('.') || !fraction.is_empty())
}
fn check_one(
    domains: &Value,
    path: &str,
    transform_index: usize,
    constant: &Value,
    budget: &mut LiteralBudget,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let base = format!("{path}/field");
    let definition = field_location(domains, &base).and_then(|v| member(v, "definition"));
    let (Some(di), Some(mi), Some(ei)) = (
        definition
            .and_then(|v| member(v, "documentIndex"))
            .and_then(index),
        definition
            .and_then(|v| member(v, "moduleIndex"))
            .and_then(index),
        definition
            .and_then(|v| member(v, "elementIndex"))
            .and_then(index),
    ) else {
        return Ok(diagnostic(
            "PROTECTION_PARAMETER_FIELD",
            path,
            "Qualified parameter Field missing",
            "error",
        ));
    };
    let closure = member(domains, "closure").ok_or_else(|| {
        EngineError::new(
            "PROTECTION_PARAMETER_FIELD",
            Utf16::from(path),
            "Qualified parameter Field missing",
        )
    })?;
    let document = item(member(closure, "documents"), di)
        .and_then(|v| member(v, "document"))
        .ok_or_else(|| {
            EngineError::new(
                "PROTECTION_PARAMETER_FIELD",
                Utf16::from(path),
                "Qualified parameter Field missing",
            )
        })?;
    let field = item(
        item(member(document, "modules"), mi).and_then(|v| member(v, "elements")),
        ei,
    )
    .ok_or_else(|| {
        EngineError::new(
            "PROTECTION_PARAMETER_FIELD",
            Utf16::from(path),
            "Qualified parameter Field missing",
        )
    })?;
    if member(field, "item").is_some()
        || member(field, "cardinality")
            .and_then(text)
            .is_some_and(|cardinality| cardinality != "one")
    {
        return Ok(diagnostic(
            "PROTECTION_UNIMPLEMENTED",
            path,
            "Repeated and container Field parameter literals are outside this candidate profile",
            "error",
        ));
    }
    if !matches!(
        member(field, "scalarType").and_then(text).as_deref(),
        Some("integer" | "decimal" | "string")
    ) {
        return Ok(diagnostic(
            "PROTECTION_UNIMPLEMENTED",
            path,
            "Only singular integer, decimal and string Field parameter literals are implemented in this candidate profile",
            "error",
        ));
    }
    let value = member(constant, "value").unwrap_or(&NULL_VALUE);
    if let Some(bound) = literal_budget_fault(field, value, budget, path) {
        return Ok(bound);
    }
    match engine.check_schema_literal_public(document, field, value, ctx) {
        Ok(()) => Ok(Value::Object(vec![
            ("path".into(), Value::string_utf8(path)),
            (
                "transformIndex".into(),
                Value::Number(transform_index as f64),
            ),
        ])),
        Err(e) => Ok(engine_diagnostic(&e.code, path, &e.path, &e.message)),
    }
}

/// Check declared parameter literals and range buckets against exact pinned
/// Fields. This candidate has no policy interpretation or authorization.
pub fn validate_security_protection_parameters_candidate(
    policy: &Value,
    catalog: &Value,
    closure: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let domains = crate::security_domains::resolve_security_protection_domains_candidate(
        policy, catalog, closure, ctx,
    )?;
    let mut diagnostics = match member(&domains, "diagnostics") {
        Some(Value::Array(xs)) => xs.clone(),
        _ => Vec::new(),
    };
    if member(&domains, "status").and_then(text).as_deref() != Some("resolved-domains") {
        return Ok(result("refused", &domains, Vec::new(), diagnostics));
    }
    let engine = core_engine()?;
    let Some(Value::Array(transforms)) =
        member(&domains, "catalog").and_then(|v| member(v, "transforms"))
    else {
        return Ok(result("refused", &domains, Vec::new(), diagnostics));
    };
    let mut validated = Vec::new();
    let mut exhausted = false;
    let mut budget = LiteralBudget::default();
    for (ti, transform) in transforms.iter().enumerate() {
        if let Some(Value::Array(params)) = member(transform, "parameters") {
            for (pi, parameter) in params.iter().enumerate() {
                let path = format!("/transforms/{ti}/parameters/{pi}");
                let checked = check_one(&domains, &path, ti, parameter, &mut budget, &engine, ctx)?;
                if member(&checked, "severity").and_then(text).as_deref() == Some("error") {
                    exhausted = member(&checked, "code").and_then(text).as_deref()
                        == Some("PROTECTION_LITERAL_BOUND");
                    diagnostics.push(checked);
                } else {
                    validated.push(checked);
                }
                if exhausted {
                    break;
                }
            }
        }
        if exhausted {
            break;
        }
        if let Some(Value::Array(profile)) = member(transform, "disclosureProfile") {
            for (pi, entry) in profile.iter().enumerate() {
                if member(entry, "kind").and_then(text).as_deref() != Some("range") {
                    continue;
                }
                let Some(bucket) = member(entry, "bucket") else {
                    continue;
                };
                let path = format!("/transforms/{ti}/disclosureProfile/{pi}/bucket");
                let checked = check_one(&domains, &path, ti, bucket, &mut budget, &engine, ctx)?;
                if member(&checked, "severity").and_then(text).as_deref() == Some("error") {
                    exhausted = member(&checked, "code").and_then(text).as_deref()
                        == Some("PROTECTION_LITERAL_BOUND");
                    diagnostics.push(checked);
                } else {
                    validated.push(checked);
                }
                if exhausted {
                    break;
                }
            }
        }
        if exhausted {
            break;
        }
    }
    diagnostics.push(Value::Object(vec![
        ("code".into(), Value::string_utf8("PROTECTION_PARAMETERS_ONLY")),
        ("path".into(), Value::string_utf8("")),
        ("severity".into(), Value::string_utf8("warning")),
        ("message".into(), Value::string_utf8("Typed declaration values only; function arity/names, domain compatibility, output behavior and authority remain separate")),
    ]));
    let status = if has_errors(&diagnostics) {
        "refused"
    } else {
        "validated-parameters"
    };
    if status == "refused" {
        validated.clear();
    }
    Ok(result(status, &domains, validated, diagnostics))
}

#[cfg(test)]
mod tests {
    use super::{engine_diagnostic, index, literal_budget_fault, member, LiteralBudget};
    use crate::{Utf16, Value};

    fn object(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    #[test]
    fn engine_diagnostic_retains_isolated_utf16_path_and_message() {
        let diagnostic = engine_diagnostic(
            "CORE_SCHEMA_PROPERTIES",
            "/transforms/0/parameters/0",
            &Utf16::new(vec![b'/' as u16, 0xd800]),
            &Utf16::new(vec![b'x' as u16, 0xdfff]),
        );
        let Value::Object(fields) = diagnostic else {
            panic!("diagnostic")
        };
        let path = fields
            .iter()
            .find(|(key, _)| key == &Utf16::from("path"))
            .unwrap();
        let Value::String(path) = &path.1 else {
            panic!("path")
        };
        assert!(path.units().contains(&0xd800));
        let message = fields
            .iter()
            .find(|(key, _)| key == &Utf16::from("message"))
            .unwrap();
        let Value::String(message) = &message.1 else {
            panic!("message")
        };
        assert!(message.units().contains(&0xdfff));
    }

    #[test]
    fn definition_indices_refuse_fractional_and_out_of_bound_numbers() {
        assert_eq!(index(&Value::Number(1.0)), Some(1));
        assert_eq!(index(&Value::Number(1.5)), None);
        assert_eq!(index(&Value::Number(4_000_000.0)), None);
        assert_eq!(index(&Value::Number(f64::INFINITY)), None);
    }

    #[test]
    fn normalized_text_budget_is_shared_across_literal_checks() {
        let field = object(vec![("scalarType", Value::string_utf8("integer"))]);
        let mut budget = LiteralBudget::default();
        let first = object(vec![(
            "value",
            object(vec![("integerToken", Value::string_utf8("1e60000"))]),
        )]);
        let second = object(vec![(
            "value",
            object(vec![("integerToken", Value::string_utf8("1e40000"))]),
        )]);
        assert!(literal_budget_fault(
            &field,
            member(&first, "value").unwrap(),
            &mut budget,
            "/first"
        )
        .is_none());
        let fault = literal_budget_fault(
            &field,
            member(&second, "value").unwrap(),
            &mut budget,
            "/second",
        )
        .expect("cumulative bound");
        assert_eq!(
            member(&fault, "code").and_then(super::text).as_deref(),
            Some("PROTECTION_LITERAL_BOUND")
        );
        assert_eq!(
            member(&fault, "path").and_then(super::text).as_deref(),
            Some("/second")
        );
    }

    #[test]
    fn zero_coefficients_charge_cumulative_text_and_missing_decimal_scale_stays_with_core() {
        let integer = object(vec![("scalarType", Value::string_utf8("integer"))]);
        let zero = object(vec![(
            "value",
            object(vec![("integerToken", Value::string_utf8("0"))]),
        )]);
        let mut budget = LiteralBudget {
            work: 0,
            text: 100_000,
        };
        assert_eq!(
            member(
                &literal_budget_fault(
                    &integer,
                    member(&zero, "value").unwrap(),
                    &mut budget,
                    "/zero"
                )
                .unwrap(),
                "code"
            )
            .and_then(super::text)
            .as_deref(),
            Some("PROTECTION_LITERAL_BOUND")
        );

        let decimal = object(vec![
            ("scalarType", Value::string_utf8("decimal")),
            ("facets", object(vec![])),
        ]);
        let huge = object(vec![(
            "value",
            object(vec![("decimalToken", Value::string_utf8("1e1000000"))]),
        )]);
        let mut budget = LiteralBudget::default();
        assert!(literal_budget_fault(
            &decimal,
            member(&huge, "value").unwrap(),
            &mut budget,
            "/decimal"
        )
        .is_none());
    }
}
