// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded, non-authoritative protection query-property comparison candidate.

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
fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}
fn array(value: Option<&Value>) -> Option<&[Value]> {
    match value? {
        Value::Array(values) => Some(values),
        _ => None,
    }
}
fn index(value: Option<&Value>) -> Option<usize> {
    match value? {
        Value::Number(value)
            if value.is_finite()
                && *value >= 0.0
                && value.fract() == 0.0
                && *value < 4_000_000.0 =>
        {
            Some(*value as usize)
        }
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
fn warning(code: &str, path: &str, message: &str) -> Value {
    Value::Object(vec![
        ("code".into(), Value::string_utf8(code)),
        ("path".into(), Value::string_utf8(path)),
        ("severity".into(), Value::string_utf8("warning")),
        ("message".into(), Value::string_utf8(message)),
    ])
}
fn has_errors(values: &[Value]) -> bool {
    values
        .iter()
        .any(|item| text(member(item, "severity")).as_deref() == Some("error"))
}
fn result(
    status: &str,
    policy: Value,
    catalog: Value,
    closure: Value,
    use_value: Value,
    authored: Vec<Value>,
    implied: Vec<Value>,
    effective: Vec<Value>,
    required: Vec<Value>,
    missing: Vec<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    Value::Object(vec![
        ("status".into(), Value::string_utf8(status)),
        ("complete".into(), Value::Bool(false)),
        ("authority".into(), Value::Bool(false)),
        ("policy".into(), policy),
        ("catalog".into(), catalog),
        ("closure".into(), closure),
        ("use".into(), use_value),
        ("authoredProperties".into(), Value::Array(authored)),
        ("impliedProperties".into(), Value::Array(implied)),
        ("effectiveProperties".into(), Value::Array(effective)),
        ("requiredProperties".into(), Value::Array(required)),
        ("missingProperties".into(), Value::Array(missing)),
        ("diagnostics".into(), Value::Array(diagnostics)),
    ])
}

fn property_key(value: &Value, context: &mut Context<'_>) -> Result<String, EngineError> {
    context.charge_work(1, Utf16::default())?;
    if member(value, "kind") == Some(&Value::string_utf8("range")) {
        return Err(EngineError::new(
            "PROTECTION_QUERY_UNIMPLEMENTED",
            Utf16::default(),
            "Range-property identity is outside this candidate subset",
        ));
    }
    if let Value::String(property) = value {
        for allowed in [
            "equality",
            "order",
            "length",
            "format",
            "nullity",
            "cardinality",
        ] {
            if property == &Utf16::from(allowed) {
                return Ok(format!("atomic:{allowed}"));
            }
        }
    }
    Err(EngineError::new(
        "PROTECTION_QUERY_UNIMPLEMENTED",
        Utf16::default(),
        "Only the six atomic property names are implemented in this candidate subset",
    ))
}

fn authored_property_key(value: &Value, context: &mut Context<'_>) -> Result<String, EngineError> {
    if member(value, "kind") == Some(&Value::string_utf8("range")) {
        context.charge_work(1, Utf16::default())?;
        return Ok("authored-range-single".into());
    }
    property_key(value, context)
}

/// Compose source/domain/parameter admission with conditional property comparison.
pub fn inspect_security_protection_query_properties_candidate(
    policy_input: &Value,
    catalog_input: &Value,
    closure_input: &Value,
    use_input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let parameters = crate::security_parameters::validate_security_protection_parameters_candidate(
        policy_input,
        catalog_input,
        closure_input,
        context,
    )?;
    let mut diagnostics = array(member(&parameters, "diagnostics"))
        .unwrap_or_default()
        .to_vec();
    let policy = member(&parameters, "policy")
        .cloned()
        .unwrap_or(Value::Null);
    let catalog = member(&parameters, "catalog")
        .cloned()
        .unwrap_or(Value::Null);
    let closure = member(&parameters, "closure")
        .cloned()
        .unwrap_or(Value::Null);
    let empty = || Vec::new();
    let use_value = match copy_json(use_input, context) {
        Ok(value) => value,
        Err(error) => {
            let path = error.path.to_utf8().unwrap_or_default();
            let message = error.message.to_utf8().unwrap_or_default();
            diagnostics.push(diagnostic(&error.code, &path, &message, "error"));
            return Ok(result(
                "refused",
                policy,
                catalog,
                closure,
                Value::Null,
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                diagnostics,
            ));
        }
    };
    // Closed structural admission for the operation shape used by this profile.
    let Value::Object(use_fields) = &use_value else {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_STRUCTURE",
            "/use",
            "must be object",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    };
    let use_names = use_fields
        .iter()
        .map(|(key, _)| key.to_utf8().unwrap_or_default())
        .collect::<Vec<_>>();
    if use_names.len() != 4
        || ["ruleIndex", "disclosureIndex", "operator", "required"]
            .iter()
            .any(|name| !use_names.iter().any(|item| item == name))
    {
        let message = if use_names.iter().any(|name| {
            !["ruleIndex", "disclosureIndex", "operator", "required"].contains(&name.as_str())
        }) {
            "must NOT have additional properties"
        } else {
            "must have required properties"
        };
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_STRUCTURE",
            "/use",
            message,
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    }
    let (Some(rule_index), Some(disclosure_index), Some(operator), Some(required_values)) = (
        index(member(&use_value, "ruleIndex")),
        index(member(&use_value, "disclosureIndex")),
        text(member(&use_value, "operator")),
        array(member(&use_value, "required")),
    ) else {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_STRUCTURE",
            "/use",
            "Invalid property requirement",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    };
    if required_values.is_empty() {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_STRUCTURE",
            "/use/required",
            "must NOT have fewer than 1 items",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    }
    if required_values.len() > 32
        || !["predicate", "join", "group", "order", "aggregate"].contains(&operator.as_str())
    {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_STRUCTURE",
            "/use",
            "Invalid property requirement",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    }
    if text(member(&parameters, "status")).as_deref() != Some("validated-parameters") {
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    }
    let Some(rule) = array(member(&policy, "rules")).and_then(|rules| rules.get(rule_index)) else {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_SELECTION",
            "/use",
            "Actual catalog disposition required",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    };
    let Some(disposition) = array(member(rule, "disclosure"))
        .and_then(|items| items.get(disclosure_index))
        .and_then(|entry| member(entry, "disposition"))
    else {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_SELECTION",
            "/use",
            "Actual catalog disposition required",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    };
    if text(member(disposition, "kind")).as_deref() != Some("transformed")
        || text(member(disposition, "vocabulary")).as_deref() != Some("umf.security.protection")
    {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_SELECTION",
            "/use",
            "Actual catalog disposition required",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    }
    let transform = array(member(&catalog, "transforms"))
        .unwrap_or_default()
        .iter()
        .find(|transform| {
            text(member(transform, "id")) == text(member(disposition, "transform"))
                && text(member(transform, "version")) == text(member(disposition, "version"))
        });
    let Some(transform) = transform else {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_SELECTION",
            "/use",
            "Exact selected transform missing",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            empty(),
            empty(),
            empty(),
            empty(),
            empty(),
            diagnostics,
        ));
    };
    let authored = array(member(transform, "disclosureProfile"))
        .unwrap_or_default()
        .to_vec();
    if authored
        .iter()
        .filter(|property| member(property, "kind") == Some(&Value::string_utf8("range")))
        .count()
        > 1
    {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_UNIMPLEMENTED",
            "/use",
            "Multiple authored range identities are outside this candidate subset",
            "error",
        ));
        return Ok(result(
            "refused",
            policy,
            catalog,
            closure,
            use_value,
            authored,
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            diagnostics,
        ));
    }
    let implied = if matches!(
        text(member(transform, "determinism")).as_deref(),
        Some("deterministic" | "keyed-deterministic")
    ) {
        vec![Value::string_utf8("equality")]
    } else {
        Vec::new()
    };
    let mut effective = Vec::<(String, Value)>::new();
    for property in &authored {
        let key = match authored_property_key(property, context) {
            Ok(key) => key,
            Err(error) => {
                let message = error.message.to_utf8().unwrap_or_default();
                diagnostics.push(diagnostic(&error.code, "/use", &message, "error"));
                return Ok(result(
                    "refused",
                    policy,
                    catalog,
                    closure,
                    use_value,
                    authored,
                    implied,
                    effective.into_iter().map(|(_, value)| value).collect(),
                    Vec::new(),
                    Vec::new(),
                    diagnostics,
                ));
            }
        };
        if !effective.iter().any(|(old, _)| old == &key) {
            effective.push((key, property.clone()));
        }
    }
    for property in &implied {
        let key = match property_key(property, context) {
            Ok(key) => key,
            Err(error) => {
                let message = error.message.to_utf8().unwrap_or_default();
                diagnostics.push(diagnostic(&error.code, "/use", &message, "error"));
                return Ok(result(
                    "refused",
                    policy,
                    catalog,
                    closure,
                    use_value,
                    authored,
                    implied,
                    effective.into_iter().map(|(_, value)| value).collect(),
                    Vec::new(),
                    Vec::new(),
                    diagnostics,
                ));
            }
        };
        if !effective.iter().any(|(old, _)| old == &key) {
            effective.push((key, property.clone()));
        }
    }
    let mut required = Vec::<(String, Value)>::new();
    for property in
        required_values
            .iter()
            .cloned()
            .chain(if matches!(operator.as_str(), "join" | "group") {
                vec![Value::string_utf8("equality")]
            } else if operator == "order" {
                vec![Value::string_utf8("order")]
            } else {
                Vec::new()
            })
    {
        let key = match property_key(&property, context) {
            Ok(key) => key,
            Err(error) => {
                let message = error.message.to_utf8().unwrap_or_default();
                diagnostics.push(diagnostic(&error.code, "/use", &message, "error"));
                return Ok(result(
                    "refused",
                    policy,
                    catalog,
                    closure,
                    use_value,
                    authored,
                    implied,
                    effective.into_iter().map(|(_, value)| value).collect(),
                    required.into_iter().map(|(_, value)| value).collect(),
                    Vec::new(),
                    diagnostics,
                ));
            }
        };
        if !required.iter().any(|(old, _)| old == &key) {
            required.push((key, property));
        }
    }
    let missing = required
        .iter()
        .filter(|(key, _)| !effective.iter().any(|(candidate, _)| candidate == key))
        .map(|(_, value)| value.clone())
        .collect::<Vec<_>>();
    diagnostics.push(warning(
        "PROTECTION_QUERY_ASSUMPTIONS",
        "/use",
        "Retained supplied dependency assumptions, not proof of actual compiler derivation or function facts; no query/native authority",
    ));
    let mode = member(transform, "queryUse")
        .and_then(|query_use| text(member(query_use, &operator)))
        .unwrap_or_else(|| "prohibited".into());
    let status = if mode == "prohibited" {
        "prohibited"
    } else if mode == "original-authorized" {
        "requires-original-action"
    } else if text(member(transform, "kind")).as_deref() == Some("tokenize")
        && text(member(transform, "determinism")).as_deref() == Some("random")
        && matches!(operator.as_str(), "join" | "group")
    {
        diagnostics.push(diagnostic(
            "PROTECTION_RANDOM_TOKEN_QUERY",
            "/use/operator",
            "Random-token disclosed join/group prohibited even with authored equality",
            "error",
        ));
        "refused"
    } else if !missing.is_empty() {
        diagnostics.push(diagnostic(
            "PROTECTION_QUERY_MISSING",
            "/use/required",
            "Required disclosed properties not retained",
            "error",
        ));
        "refused"
    } else {
        "compatible-properties"
    };
    let status = if has_errors(&diagnostics) {
        "refused"
    } else {
        status
    };
    Ok(result(
        status,
        policy,
        catalog,
        closure,
        use_value,
        authored,
        implied,
        effective.into_iter().map(|(_, v)| v).collect(),
        required.into_iter().map(|(_, v)| v).collect(),
        missing,
        diagnostics,
    ))
}
