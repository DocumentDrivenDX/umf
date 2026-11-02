// SPDX-License-Identifier: MIT OR Apache-2.0
use std::collections::BTreeSet;

use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value, copy_json},
};

#[derive(Clone, Debug)]
pub struct PreparedPolicy(Value);

impl PreparedPolicy {
    pub fn value(&self) -> &Value {
        &self.0
    }
}

fn err(message: &str) -> EngineError {
    EngineError::new("CONSTRAINT_POLICY", Utf16::default(), message)
}
fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn strings(value: &Value) -> Result<Vec<String>, EngineError> {
    let Value::Array(values) = value else {
        return Err(err("Expected selector list"));
    };
    let mut out = Vec::with_capacity(values.len());
    let mut seen = BTreeSet::new();
    for item in values {
        let Some(value) = text(item).filter(|s| !s.is_empty()) else {
            return Err(err("Expected property selector"));
        };
        if !seen.insert(value.clone()) {
            return Err(err("Duplicate selector"));
        }
        out.push(value);
    }
    Ok(out)
}
fn fields(value: &Value, required: &[&str], optional: &[&str]) -> Result<(), EngineError> {
    let Value::Object(members) = value else {
        return Err(err("Expected policy object"));
    };
    for name in required {
        if get(value, name).is_none() {
            return Err(err("Malformed policy declaration"));
        }
    }
    for (name, _) in members {
        let Some(name) = name.to_utf8().ok() else {
            return Err(err("Malformed policy key"));
        };
        if !required.contains(&name.as_str()) && !optional.contains(&name.as_str()) {
            return Err(err("Malformed policy declaration"));
        }
    }
    Ok(())
}
fn string_field(value: &Value, name: &str) -> Result<String, EngineError> {
    get(value, name)
        .and_then(text)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| err("Expected property selector"))
}
fn record_entries(value: &Value) -> Result<&[(Utf16, Value)], EngineError> {
    match value {
        Value::Object(entries) => Ok(entries),
        _ => Err(err("Expected policy object")),
    }
}
fn has_error(errors: &Value, name: &str) -> bool {
    get(errors, name).is_some()
}

const REQUIRED_TOP: &[&str] = &[
    "fieldKind",
    "recordReferenceRole",
    "nullability",
    "itemReferenceKeys",
    "facetKeys",
    "facetGroups",
    "containers",
    "singular",
    "families",
    "numericFacetKeys",
    "errors",
    "fields",
    "wrapperKeys",
    "itemLookup",
    "interval",
    "refinements",
];
const PROPERTY_SELECTORS: &[&str] = &[
    "role",
    "references",
    "referenceRole",
    "item",
    "facets",
    "family",
    "cardinality",
    "availability",
    "precision",
    "scale",
];
const LOOKUP_SELECTORS: &[&str] = &[
    "modules",
    "moduleId",
    "elements",
    "elementId",
    "moduleRef",
    "elementRef",
];
const MECHANICS: &[(&str, &[&str], &[&str])] = &[
    (
        "count-bounds",
        &["min", "max", "error", "domainError"],
        &["unit", "unitError"],
    ),
    ("integer-width", &["bits", "signed", "error"], &[]),
    (
        "coefficient-range",
        &[
            "min",
            "max",
            "minInclusive",
            "maxInclusive",
            "error",
            "nullError",
        ],
        &[],
    ),
    ("allowed-membership", &["error"], &[]),
];
const DIAGNOSTICS: &[&str] = &[
    "numeric-token",
    "numeric-exponent",
    "numeric-rounding",
    "numeric-resource",
    "numeric-precision",
    "unicode",
    "object",
    "unknown",
    "null-equality",
    "equality",
    "bits128",
    "uuid",
    "decimal-domain",
    "hex",
    "boolean",
    "mechanic",
    "depth",
    "field-role",
    "record-value",
    "null",
    "wrapper",
    "container",
    "item-required",
    "item-missing",
    "collection-size",
    "cardinality",
    "family",
    "refinements",
    "text",
    "length-unit",
    "length-domain",
    "length",
    "integer-width",
    "numeric-null",
    "range",
    "allowed",
    "interval",
];

pub fn check_policy(input: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let _ = copy_json(input, ctx)?;
    fields(input, REQUIRED_TOP, &[])?;
    for name in ["fieldKind", "recordReferenceRole", "nullability"] {
        string_field(input, name)?;
    }
    for name in [
        "itemReferenceKeys",
        "facetKeys",
        "singular",
        "numericFacetKeys",
    ] {
        strings(get(input, name).ok_or_else(|| err("Expected selector list"))?)?;
    }
    for name in [
        "facetGroups",
        "containers",
        "families",
        "errors",
        "fields",
        "itemLookup",
        "interval",
    ] {
        record_entries(get(input, name).ok_or_else(|| err("Expected policy object"))?)?;
    }

    let groups = get(input, "facetGroups").unwrap();
    for (name, selectors) in record_entries(groups)? {
        if name.to_utf8().ok().filter(|s| !s.is_empty()).is_none() {
            return Err(err("Expected property selector"));
        }
        strings(selectors)?;
    }
    let containers = get(input, "containers").unwrap();
    for (_, declaration) in record_entries(containers)? {
        fields(declaration, &["carrier", "mechanic"], &[])?;
        string_field(declaration, "carrier")?;
        let mechanic = string_field(declaration, "mechanic")?;
        if mechanic != "sequence" && mechanic != "mapping" {
            return Err(err("Unknown container mechanic"));
        }
    }
    let families = get(input, "families").unwrap();
    for (_, declaration) in record_entries(families)? {
        fields(
            declaration,
            &["mechanic", "carrier", "equality", "refinements"],
            &["lengthUnit"],
        )?;
        let mechanic = string_field(declaration, "mechanic")?;
        if ![
            "boolean", "integer", "decimal", "unicode", "hex", "bits128", "uuid", "text",
        ]
        .contains(&mechanic.as_str())
        {
            return Err(err("Malformed literal family mechanics"));
        }
        string_field(declaration, "carrier")?;
        if !matches!(get(declaration, "equality"), Some(Value::Bool(_)))
            || !matches!(get(declaration, "refinements"), Some(Value::Bool(_)))
        {
            return Err(err("Malformed literal family mechanics"));
        }
        if get(declaration, "lengthUnit").is_some() {
            string_field(declaration, "lengthUnit")?;
        }
    }
    let errors = get(input, "errors").unwrap();
    for (name, declaration) in record_entries(errors)? {
        let name = name
            .to_utf8()
            .ok()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| err("Malformed literal diagnostic"))?;
        fields(declaration, &["code", "message", "severity"], &[])?;
        string_field(declaration, "code")?;
        if !matches!(get(declaration, "message"), Some(Value::String(_))) {
            return Err(err("Malformed literal diagnostic"));
        }
        if ![Some("error"), Some("warning")]
            .contains(&get(declaration, "severity").and_then(text).as_deref())
        {
            return Err(err("Malformed literal diagnostic"));
        }
        let _ = name;
    }
    for diagnostic in DIAGNOSTICS {
        if !has_error(errors, diagnostic) {
            return Err(err("Missing literal diagnostic"));
        }
    }
    for (group_name, expected) in [
        ("fields", PROPERTY_SELECTORS),
        ("itemLookup", LOOKUP_SELECTORS),
    ] {
        let group = get(input, group_name).unwrap();
        fields(group, expected, &[])?;
        for selector in expected {
            string_field(group, selector)?;
        }
    }
    match get(input, "wrapperKeys") {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            ()
        }
        _ => return Err(err("Invalid wrapper key count")),
    }
    let rules = match get(input, "refinements") {
        Some(Value::Array(items)) => items,
        _ => return Err(err("Expected literal refinements")),
    };
    for rule in rules {
        let mechanic = string_field(rule, "mechanic")?;
        let Some((_, required, optional)) = MECHANICS.iter().find(|(name, _, _)| *name == mechanic)
        else {
            return Err(err("Unknown refinement mechanic"));
        };
        let mut required_fields = vec!["mechanic", "selector", "applies", "mode", "phase"];
        required_fields.extend_from_slice(required);
        let mut allowed = required_fields.clone();
        allowed.push("enabled");
        allowed.extend_from_slice(optional);
        fields(rule, &required_fields, &allowed[5..])?;
        if get(rule, "enabled").is_some() && !matches!(get(rule, "enabled"), Some(Value::Bool(_))) {
            return Err(err("Invalid refinement applicability"));
        }
        let selector = get(rule, "selector").ok_or_else(|| err("Expected refinement selector"))?;
        let selector_values = match selector {
            Value::Array(v) if !v.is_empty() => v,
            _ => return Err(err("Expected refinement selector")),
        };
        for value in selector_values {
            if text(value).filter(|s| !s.is_empty()).is_none() {
                return Err(err("Expected property selector"));
            }
        }
        if ![Some("before"), Some("after")].contains(&get(rule, "phase").and_then(text).as_deref())
            || ![Some("scalar"), Some("container"), Some("all")]
                .contains(&get(rule, "applies").and_then(text).as_deref())
            || ![Some("always"), Some("refinements")]
                .contains(&get(rule, "mode").and_then(text).as_deref())
        {
            return Err(err("Invalid refinement applicability"));
        }
        if (get(rule, "unit").is_some()) != (get(rule, "unitError").is_some()) {
            return Err(err("Unit selector requires diagnostic"));
        }
        for name in required.iter().chain(optional.iter()) {
            if let Some(value) = get(rule, name) {
                let selector = text(value).ok_or_else(|| err("Expected property selector"))?;
                if name.to_ascii_lowercase().ends_with("error") && !has_error(errors, &selector) {
                    return Err(err("Unknown refinement diagnostic"));
                }
            }
        }
        for name in required.iter().chain(optional.iter()) {
            if get(rule, name).is_some() {
                string_field(rule, name)?;
            }
        }
    }
    let interval = get(input, "interval").unwrap();
    fields(
        interval,
        &[
            "min",
            "max",
            "minInclusive",
            "maxInclusive",
            "width",
            "bits",
            "signed",
            "omit",
            "qualifierKeys",
        ],
        &[],
    )?;
    let width = get(interval, "width").unwrap();
    if !matches!(width, Value::Array(v) if !v.is_empty() && v.iter().all(|x| text(x).filter(|s| !s.is_empty()).is_some()))
    {
        return Err(err("Expected refinement selector"));
    }
    for name in [
        "min",
        "max",
        "minInclusive",
        "maxInclusive",
        "bits",
        "signed",
    ] {
        string_field(interval, name)?;
    }
    strings(get(interval, "omit").unwrap())?;
    for (_, keys) in record_entries(get(interval, "qualifierKeys").unwrap())? {
        strings(keys)?;
    }
    Ok(())
}

pub fn prepare_policy(input: &Value, ctx: &mut Context<'_>) -> Result<PreparedPolicy, EngineError> {
    let copy = copy_json(input, ctx)?;
    check_policy(&copy, ctx)?;
    Ok(PreparedPolicy(copy))
}
