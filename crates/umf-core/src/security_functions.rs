// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded candidate for five pure V2 protection reference recipes.
//!
//! This module composes source/domain/parameter candidates. It makes no policy,
//! authorization, native-custody, or canonical-write decision.

use crate::{
    context::Context,
    error::EngineError,
    value::{copy_json, Utf16, Value},
};

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

fn exact_count(value: &Value, name: &str) -> Option<usize> {
    let token = member(value, "integerToken").and_then(text)?;
    let parsed = token.parse::<u16>().ok()?;
    (parsed <= 4096).then_some(usize::from(parsed)).or_else(|| {
        let _ = name;
        None
    })
}

fn unicode_scalars(value: &Utf16) -> Option<Vec<char>> {
    char::decode_utf16(value.units().iter().copied())
        .collect::<Result<Vec<_>, _>>()
        .ok()
}

fn string_value(value: &Value) -> Option<&Utf16> {
    match member(value, "string")? {
        Value::String(value) => Some(value),
        _ => None,
    }
}

fn json_string_content_units(value: &str) -> usize {
    value
        .chars()
        .map(|ch| match ch {
            '"' | '\\' | '\u{0008}' | '\u{000c}' | '\n' | '\r' | '\t' => 2,
            ch if ch <= '\u{001f}' => 6,
            ch => ch.len_utf16(),
        })
        .sum()
}

fn item(value: Option<&Value>, index: usize) -> Option<&Value> {
    match value? {
        Value::Array(values) => values.get(index),
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

fn reference_warning() -> Value {
    Value::Object(vec![
        (
            "code".into(),
            Value::string_utf8("PROTECTION_REFERENCE_ONLY"),
        ),
        ("path".into(), Value::string_utf8("")),
        ("severity".into(), Value::string_utf8("warning")),
        (
            "message".into(),
            Value::string_utf8(
                "Pure reference recipe only; no policy decision, property-fact proof, actual compiler lineage or native authority",
            ),
        ),
    ])
}

fn error_diagnostic(error: &EngineError) -> Value {
    Value::Object(vec![
        ("code".into(), Value::string_utf8(&error.code)),
        ("path".into(), Value::String(error.path.clone())),
        ("message".into(), Value::String(error.message.clone())),
        ("severity".into(), Value::string_utf8("error")),
    ])
}

/// Match the public function's per-literal text/canonical bounds before schema
/// validation. Work is charged while walking so the bound cannot require an
/// unmetered deep traversal or clone.
enum LiteralAdmissionError {
    FunctionBound(&'static str),
    Engine(EngineError),
}

fn bounded_literal(value: &Value, context: &mut Context<'_>) -> Result<(), LiteralAdmissionError> {
    let mut pending = vec![value];
    let mut text_units = 0usize;
    while let Some(current) = pending.pop() {
        context
            .charge_work(1, Utf16::default())
            .map_err(LiteralAdmissionError::Engine)?;
        match current {
            Value::String(text) => text_units = text_units.saturating_add(text.len()),
            Value::Array(items) => pending.extend(items),
            Value::Object(fields) => {
                for (key, child) in fields {
                    text_units = text_units.saturating_add(key.len());
                    pending.push(child);
                }
            }
            _ => {}
        }
        if text_units > 4096 {
            return Err(LiteralAdmissionError::FunctionBound(
                "resource-exhausted: literal text exceeds4096 units",
            ));
        }
    }
    if crate::security_logic::canonical_json_units(value, 0).is_none_or(|size| size > 4096) {
        return Err(LiteralAdmissionError::FunctionBound(
            "resource-exhausted: canonical literal exceeds4096 UTF-16 units",
        ));
    }
    Ok(())
}

fn literal_bound_diagnostic(message: &str) -> Value {
    diagnostic("PROTECTION_FUNCTION_BOUND", "", message, "error")
}

fn has_errors(diagnostics: &[Value]) -> bool {
    diagnostics
        .iter()
        .any(|diagnostic| member(diagnostic, "severity").and_then(text).as_deref() == Some("error"))
}

fn finish(
    status: &str,
    policy: &Value,
    catalog: &Value,
    closure: &Value,
    selection: &Value,
    input: &Value,
    value: &Value,
    input_domain: &Value,
    output_domain: &Value,
    diagnostics: Vec<Value>,
) -> Value {
    Value::Object(vec![
        ("status".into(), Value::string_utf8(status)),
        ("complete".into(), Value::Bool(false)),
        ("authority".into(), Value::Bool(false)),
        ("policy".into(), policy.clone()),
        ("catalog".into(), catalog.clone()),
        ("closure".into(), closure.clone()),
        ("selection".into(), selection.clone()),
        ("input".into(), input.clone()),
        (
            "value".into(),
            if status == "transformed" {
                value.clone()
            } else {
                Value::Null
            },
        ),
        ("inputDomain".into(), input_domain.clone()),
        ("outputDomain".into(), output_domain.clone()),
        ("valueProfile".into(), Value::Null),
        ("diagnostics".into(), Value::Array(diagnostics)),
    ])
}

fn index(value: &Value) -> Option<usize> {
    match value {
        Value::Number(number)
            if number.is_finite()
                && number.fract() == 0.0
                && *number >= 0.0
                && *number <= 9_007_199_254_740_991.0
                && *number < usize::MAX as f64 =>
        {
            Some(*number as usize)
        }
        _ => None,
    }
}

fn closed_selection(selection: &Value, evaluate: bool) -> bool {
    let Value::Object(fields) = selection else {
        return false;
    };
    let names: &[&str] = if evaluate {
        &["ruleIndex", "disclosureIndex", "value"]
    } else {
        &["ruleIndex", "disclosureIndex"]
    };
    fields.len() == names.len()
        && names
            .iter()
            .all(|name| fields.iter().any(|(key, _)| key == &Utf16::from(*name)))
        && index(member(selection, "ruleIndex").unwrap()).is_some()
        && index(member(selection, "disclosureIndex").unwrap()).is_some()
}

fn same_reference(left: &Value, right: &Value) -> bool {
    ["documentId", "moduleId", "elementId"]
        .iter()
        .all(|name| member(left, name) == member(right, name))
}

fn scalar_field(field: &Value) -> bool {
    member(field, "kind").and_then(text).as_deref() == Some("field")
        && member(field, "cardinality").and_then(text).as_deref() == Some("one")
        && matches!(
            member(field, "scalarType").and_then(text).as_deref(),
            Some("boolean" | "integer" | "decimal" | "string" | "binary")
        )
        && matches!(
            member(field, "nullability").and_then(text).as_deref(),
            Some("required" | "absent-allowed")
        )
        && member(field, "item").is_none()
        && member(field, "itemType").is_none()
        && member(field, "references")
            .is_none_or(|value| matches!(value, Value::Array(items) if items.is_empty()))
}

fn find_field<'a>(closure: &'a Value, reference: &Value) -> Option<(&'a Value, &'a Value)> {
    let document_id = member(reference, "documentId")?;
    let module_id = member(reference, "moduleId")?;
    let element_id = member(reference, "elementId")?;
    let Value::Array(documents) = member(closure, "documents")? else {
        return None;
    };
    for entry in documents {
        let document = member(entry, "document")?;
        if member(document, "id") != Some(document_id) {
            continue;
        }
        let Value::Array(modules) = member(document, "modules")? else {
            continue;
        };
        for module in modules {
            if member(module, "id") != Some(module_id) {
                continue;
            }
            let Value::Array(elements) = member(module, "elements")? else {
                continue;
            };
            for element in elements {
                if member(element, "id") == Some(element_id) {
                    return Some((document, element));
                }
            }
        }
    }
    None
}

fn fail(diagnostics: &mut Vec<Value>, code: &str, message: &str) {
    diagnostics.push(diagnostic(code, "", message, "error"));
}

/// Evaluate or inspect only the exact `mask/constant` and `mask/null-out`
/// signatures over the already admitted source/domain/parameter candidate.
pub fn evaluate_security_protection_function_candidate(
    policy_input: &Value,
    catalog_input: &Value,
    closure_input: &Value,
    selection_input: &Value,
    evaluate: bool,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let parameters = crate::security_parameters::validate_security_protection_parameters_candidate(
        policy_input,
        catalog_input,
        closure_input,
        context,
    )?;
    let policy = member(&parameters, "policy")
        .cloned()
        .unwrap_or(Value::Null);
    let catalog = member(&parameters, "catalog")
        .cloned()
        .unwrap_or(Value::Null);
    let closure = member(&parameters, "closure")
        .cloned()
        .unwrap_or(Value::Null);
    let mut diagnostics = match member(&parameters, "diagnostics") {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    };
    let mut selection = Value::Null;
    let mut input = Value::Null;
    let mut value = Value::Null;
    let mut input_domain = Value::Null;
    let mut output_domain = Value::Null;
    match copy_json(selection_input, context) {
        Ok(copy) => selection = copy,
        Err(error) => {
            diagnostics.push(error_diagnostic(&error));
            return Ok(finish(
                "refused",
                &policy,
                &catalog,
                &closure,
                &selection,
                &input,
                &value,
                &input_domain,
                &output_domain,
                diagnostics,
            ));
        }
    }
    if !closed_selection(&selection, evaluate) {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Closed selection with nonnegative safe indices and explicit present value required",
        );
    } else if evaluate {
        input = member(&selection, "value").cloned().unwrap_or(Value::Null);
    }
    if has_errors(&diagnostics)
        || member(&parameters, "status").and_then(text).as_deref() != Some("validated-parameters")
    {
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }

    let rule_index = index(member(&selection, "ruleIndex").unwrap()).unwrap();
    let disclosure_index = index(member(&selection, "disclosureIndex").unwrap()).unwrap();
    let rule = item(member(&policy, "rules"), rule_index).unwrap_or(&Value::Null);
    let disclosure = item(member(rule, "disclosure"), disclosure_index).unwrap_or(&Value::Null);
    let Some(disposition) = member(disclosure, "disposition") else {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Actual selected catalog disposition required",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    };
    if member(disposition, "kind").and_then(text).as_deref() != Some("transformed")
        || member(disposition, "vocabulary").and_then(text).as_deref()
            != Some("umf.security.protection")
    {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Actual selected catalog disposition required",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    let transform = match member(&catalog, "transforms") {
        Some(Value::Array(transforms)) => transforms.iter().find(|transform| {
            member(transform, "id") == member(disposition, "transform")
                && member(transform, "version") == member(disposition, "version")
        }),
        _ => None,
    };
    let Some(transform) = transform else {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Exact selected transform missing",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    };
    let operation = format!(
        "{}/{}",
        member(transform, "kind").and_then(text).unwrap_or_default(),
        member(transform, "function")
            .and_then(text)
            .unwrap_or_default()
    );
    let input_ref = member(transform, "inputDomain").unwrap_or(&Value::Null);
    let output_ref = member(transform, "outputDomain").unwrap_or(&Value::Null);
    let disclosure = item(
        member(
            item(member(&policy, "rules"), rule_index).unwrap_or(&Value::Null),
            "disclosure",
        ),
        disclosure_index,
    )
    .unwrap_or(&Value::Null);
    if !same_reference(
        member(disclosure, "field").unwrap_or(&Value::Null),
        input_ref,
    ) || !same_reference(disposition_field(disposition), output_ref)
    {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Selected policy input/output Fields must equal the exact transform domains; no inferred domain inclusion",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    if !matches!(
        operation.as_str(),
        "mask/constant"
            | "mask/null-out"
            | "mask/partial"
            | "mask/fixed-length-redact"
            | "generalize/prefix-only"
    ) {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Transform has no qualified pure reference recipe; native/keyed/vault code is never executed",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    if member(transform, "determinism").and_then(text).as_deref() != Some("deterministic")
        || member(transform, "reversibility").and_then(text).as_deref() != Some("none")
    {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Pure reference function requires deterministic/non-reversing declaration",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    let Some((input_document, input_field)) = find_field(&closure, input_ref) else {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Exact qualified Field missing",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    };
    let Some((output_document, output_field)) = find_field(&closure, output_ref) else {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Exact qualified Field missing",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    };
    if !scalar_field(input_field) || !scalar_field(output_field) {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Explicit scalar-one Field with known value/nullability semantics required",
        );
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    input_domain = input_ref.clone();
    output_domain = output_ref.clone();
    let parameters_list: &[Value] = match member(transform, "parameters") {
        Some(Value::Array(parameters)) => parameters,
        _ => &[],
    };
    let expected_parameters: &[&str] = match operation.as_str() {
        "mask/constant" => &["value"],
        "mask/null-out" => &[],
        "mask/partial" => &["prefix", "suffix", "padding", "unit"],
        "mask/fixed-length-redact" => &["length", "padding", "unit"],
        "generalize/prefix-only" => &["length", "unit"],
        _ => &[],
    };
    let names: Vec<_> = parameters_list
        .iter()
        .filter_map(|parameter| member(parameter, "name").and_then(text))
        .collect();
    let exact_names = names.len() == parameters_list.len()
        && names.len() == expected_parameters.len()
        && expected_parameters
            .iter()
            .all(|expected| names.iter().any(|name| name == expected));
    if !exact_names {
        fail(
            &mut diagnostics,
            "PROTECTION_FUNCTION",
            "Exact function-specific parameter-name set required",
        );
    }
    let argument = |name: &str| {
        parameters_list
            .iter()
            .find(|parameter| member(parameter, "name").and_then(text).as_deref() == Some(name))
    };
    let constant = argument("value").and_then(|parameter| member(parameter, "value"));
    let string_recipe = matches!(
        operation.as_str(),
        "mask/partial" | "mask/fixed-length-redact" | "generalize/prefix-only"
    );
    if string_recipe {
        for name in expected_parameters {
            let family = if matches!(*name, "prefix" | "suffix" | "length") {
                "integer"
            } else {
                "string"
            };
            let Some(parameter) = argument(name) else {
                continue;
            };
            let reference = member(parameter, "field").unwrap_or(&Value::Null);
            let Some((_, parameter_field)) = find_field(&closure, reference) else {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    "Exact qualified Field missing",
                );
                continue;
            };
            if !scalar_field(parameter_field) {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    "Explicit scalar-one Field with known value/nullability semantics required",
                );
            } else if member(parameter_field, "scalarType")
                .and_then(text)
                .as_deref()
                != Some(family)
            {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    &format!("Parameter {name} requires {family} domain"),
                );
            }
        }
    }
    let count_value = |name: &str| -> Option<usize> {
        let parameter = argument(name)?;
        let field_ref = member(parameter, "field")?;
        let (_, field) = find_field(&closure, field_ref)?;
        if member(field, "scalarType").and_then(text).as_deref() != Some("integer") {
            return Some(0);
        }
        let value = member(parameter, "value")?;
        exact_count(value, name)
    };
    let mut prefix_count = None;
    let mut suffix_count = None;
    let mut output_length = None;
    let mut padding = None;
    if string_recipe {
        if member(input_field, "scalarType").and_then(text).as_deref() != Some("string")
            || member(output_field, "scalarType").and_then(text).as_deref() != Some("string")
        {
            fail(
                &mut diagnostics,
                "PROTECTION_FUNCTION",
                "String reference function requires string input/output",
            );
        }
        let unit = argument("unit")
            .and_then(|parameter| member(parameter, "value"))
            .and_then(string_value)
            .and_then(|value| value.to_utf8().ok());
        if unit.as_deref() != Some("unicode-scalar") {
            fail(
                &mut diagnostics,
                "PROTECTION_FUNCTION",
                "Explicit unicode-scalar unit required",
            );
        }
        if operation == "mask/partial" {
            prefix_count = count_value("prefix");
            suffix_count = count_value("suffix");
            if prefix_count.is_none() {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    "Count prefix outside0..4096",
                );
            }
            if suffix_count.is_none() {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    "Count suffix outside0..4096",
                );
            }
        } else {
            output_length = count_value("length");
            if output_length.is_none() {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    "Count length outside0..4096",
                );
            }
        }
        if operation != "generalize/prefix-only" {
            let raw_padding = argument("padding")
                .and_then(|parameter| member(parameter, "value"))
                .and_then(string_value);
            padding = raw_padding.and_then(unicode_scalars);
            if padding.as_ref().is_none_or(|value| value.len() != 1) {
                fail(
                    &mut diagnostics,
                    "PROTECTION_FUNCTION",
                    "Padding must be exactly one Unicode scalar",
                );
            }
        }
    }
    if has_errors(&diagnostics) {
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }

    let engine = crate::security_parameters::core_engine()?;
    let output_value = constant.unwrap_or(&Value::Null);
    if !string_recipe {
        if let Err(error) = bounded_literal(output_value, context) {
            diagnostics.push(match error {
                LiteralAdmissionError::FunctionBound(message) => literal_bound_diagnostic(message),
                LiteralAdmissionError::Engine(error) => error_diagnostic(&error),
            });
            return Ok(finish(
                "refused",
                &policy,
                &catalog,
                &closure,
                &selection,
                &input,
                &value,
                &input_domain,
                &output_domain,
                diagnostics,
            ));
        }
        if let Err(error) =
            engine.check_schema_literal_public(output_document, output_field, output_value, context)
        {
            diagnostics.push(error_diagnostic(&error));
            return Ok(finish(
                "refused",
                &policy,
                &catalog,
                &closure,
                &selection,
                &input,
                &value,
                &input_domain,
                &output_domain,
                diagnostics,
            ));
        }
    }
    diagnostics.push(reference_warning());
    if !evaluate {
        return Ok(finish(
            "reference-ready",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    if let Err(error) = bounded_literal(&input, context) {
        diagnostics.push(match error {
            LiteralAdmissionError::FunctionBound(message) => literal_bound_diagnostic(message),
            LiteralAdmissionError::Engine(error) => error_diagnostic(&error),
        });
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    if let Err(error) =
        engine.check_schema_literal_public(input_document, input_field, &input, context)
    {
        diagnostics.push(error_diagnostic(&error));
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &value,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    value = if operation == "mask/constant" {
        output_value.clone()
    } else if input == Value::Null {
        Value::Null
    } else if string_recipe {
        let Some(input_text) = string_value(&input).and_then(unicode_scalars) else {
            diagnostics.push(diagnostic(
                "CORE_SCHEMA_PROPERTIES",
                "",
                "Unpaired Unicode surrogate",
                "error",
            ));
            return Ok(finish(
                "refused",
                &policy,
                &catalog,
                &closure,
                &selection,
                &input,
                &value,
                &input_domain,
                &output_domain,
                diagnostics,
            ));
        };
        let start: String;
        let end: String;
        let middle: usize;
        if operation == "generalize/prefix-only" {
            let count = output_length.unwrap_or(0);
            start = input_text.iter().take(count).collect();
            end = String::new();
            middle = 0;
        } else if operation == "mask/partial" {
            let prefix = prefix_count.unwrap_or(0);
            let suffix = suffix_count
                .unwrap_or(0)
                .min(input_text.len().saturating_sub(prefix));
            start = input_text.iter().take(prefix).collect();
            end = input_text
                .iter()
                .skip(input_text.len().saturating_sub(suffix))
                .collect();
            middle = input_text
                .len()
                .saturating_sub(prefix.min(input_text.len()) + suffix);
        } else {
            start = String::new();
            end = String::new();
            middle = output_length.unwrap_or(0);
        }
        let padding_text: String = padding
            .as_ref()
            .map(|items| items.iter().collect())
            .unwrap_or_default();
        let encoded = 13usize
            .saturating_add(json_string_content_units(&start))
            .saturating_add(json_string_content_units(&end))
            .saturating_add(json_string_content_units(&padding_text).saturating_mul(middle));
        if operation != "generalize/prefix-only" && encoded > 4096 {
            diagnostics.push(literal_bound_diagnostic(
                "resource-exhausted: string output exceeds4096 canonical UTF-16 units",
            ));
            return Ok(finish(
                "refused",
                &policy,
                &catalog,
                &closure,
                &selection,
                &input,
                &value,
                &input_domain,
                &output_domain,
                diagnostics,
            ));
        }
        let mut output = String::with_capacity(encoded);
        output.push_str(&start);
        if operation != "generalize/prefix-only" {
            for _ in 0..middle {
                output.push_str(&padding_text);
            }
        }
        output.push_str(&end);
        Value::Object(vec![(
            Utf16::from("string"),
            Value::String(Utf16::from(output)),
        )])
    } else {
        Value::Null
    };
    if let Err(error) = bounded_literal(&value, context) {
        diagnostics.push(match error {
            LiteralAdmissionError::FunctionBound(message) => literal_bound_diagnostic(message),
            LiteralAdmissionError::Engine(error) => error_diagnostic(&error),
        });
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &Value::Null,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    if let Err(error) =
        engine.check_schema_literal_public(output_document, output_field, &value, context)
    {
        diagnostics.push(error_diagnostic(&error));
        return Ok(finish(
            "refused",
            &policy,
            &catalog,
            &closure,
            &selection,
            &input,
            &Value::Null,
            &input_domain,
            &output_domain,
            diagnostics,
        ));
    }
    Ok(finish(
        "transformed",
        &policy,
        &catalog,
        &closure,
        &selection,
        &input,
        &value,
        &input_domain,
        &output_domain,
        diagnostics,
    ))
}

fn disposition_field(disposition: &Value) -> &Value {
    member(disposition, "field").unwrap_or(&Value::Null)
}

#[cfg(test)]
mod tests {
    use super::{bounded_literal, LiteralAdmissionError};
    use crate::{Context, Utf16, Value};

    #[test]
    fn literal_walk_preserves_a_smaller_host_budget_failure() {
        let mut host_control = |_amount| {
            Err(crate::EngineError::new(
                "HOST_LIMIT",
                Utf16::default(),
                "caller budget reached",
            ))
        };
        let mut context = Context::ordinary().with_host_control(&mut host_control);
        let error = bounded_literal(&Value::string_utf8("small"), &mut context).unwrap_err();
        match error {
            LiteralAdmissionError::Engine(error) => {
                assert_eq!(error.code, "HOST_LIMIT");
                assert_eq!(error.message.to_utf8().unwrap(), "caller budget reached");
            }
            LiteralAdmissionError::FunctionBound(message) => {
                panic!("unexpected function bound: {message}")
            }
        }
    }
}
