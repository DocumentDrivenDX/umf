// SPDX-License-Identifier: MIT OR Apache-2.0
//! CONTRACT-052/053 profile admission with UTF-16-preserving schema validation.
use crate::{
    context::Context,
    domain_pack_schema::generate_domain_pack_schema,
    native_json::NativeJsonNode,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{ecma_number_to_string, Utf16, Value},
    EngineError,
};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields.iter().find(|(k, _)| *k == key(name)).map(|(_, v)| v)
}
fn has_own(value: &Value, name: &str) -> bool {
    matches!(value, Value::Object(fields) if fields.iter().any(|(k, _)| *k == key(name)))
}
fn items(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(xs)) => xs,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn text_is(value: Option<&Value>, expected: &str) -> bool {
    text(value).is_some_and(|s| s.units().iter().copied().eq(expected.encode_utf16()))
}
fn same_value_zero(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b || (a.is_nan() && b.is_nan()),
        (Value::String(a), Value::String(b)) => a == b,
        // Host JSON admission creates separate identity for every object value.
        _ => false,
    }
}
fn unique_json_values(values: &[Value]) -> bool {
    values.iter().enumerate().all(|(index, value)| {
        !values[..index]
            .iter()
            .any(|previous| same_value_zero(previous, value))
    })
}
fn js_property_key(value: &Value) -> Utf16 {
    match value {
        Value::String(value) => value.clone(),
        Value::Null => key("null"),
        Value::Bool(true) => key("true"),
        Value::Bool(false) => key("false"),
        Value::Number(value) => Utf16::from(ecma_number_to_string(*value)),
        Value::Object(_) => key("[object Object]"),
        Value::Array(values) => {
            let mut units = Vec::new();
            for (index, item) in values.iter().enumerate() {
                if index > 0 {
                    units.push(b',' as u16);
                }
                if !matches!(item, Value::Null) {
                    units.extend_from_slice(js_property_key(item).units());
                }
            }
            Utf16::new(units)
        }
    }
}

fn schema_valid(pack: &Value) -> Result<bool, EngineError> {
    // Initial route compiles per call. Measure this path before considering
    // static caching; no serde projection is allowed because it loses lone surrogates.
    let schema = generate_domain_pack_schema();
    let mut ctx = Context::catalog();
    let compiled =
        CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), true, &mut ctx)?;
    Ok(compiled.validate(pack, &mut ctx)?.is_empty())
}

fn to_native(value: &Value) -> NativeJsonNode {
    match value {
        Value::Null => NativeJsonNode::Null,
        Value::Bool(v) => NativeJsonNode::Boolean(*v),
        Value::Number(v) => NativeJsonNode::Number(ecma_number_to_string(*v)),
        Value::String(v) => NativeJsonNode::String(v.clone()),
        Value::Array(xs) => NativeJsonNode::Array(xs.iter().map(to_native).collect()),
        Value::Object(fields) => NativeJsonNode::Object(
            fields
                .iter()
                .map(|(k, v)| (k.clone(), to_native(v)))
                .collect(),
        ),
    }
}

fn loader_diagnostics(node: &NativeJsonNode) -> Vec<Utf16> {
    let outcome = crate::domain_pack_loader_inspection::inspect_domain_pack_loader_value(node);
    outcome
        .get("diagnostics")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .map(Utf16::from)
        .collect()
}

fn inspect_profile(pack: &Value) -> Result<(bool, bool, Vec<Utf16>), EngineError> {
    if !schema_valid(pack)? {
        return Ok((
            false,
            false,
            vec![key("Invalid canonical domain-pack metadata")],
        ));
    }
    let mut diagnostics = crate::artifact_references::inspect_artifact_references(pack);
    let schemas = items(member(pack, "schemas"));
    let ids: Vec<&Utf16> = schemas
        .iter()
        .filter_map(|s| text(member(s, "id")))
        .collect();
    if ids.iter().enumerate().any(|(i, id)| ids[..i].contains(id)) {
        diagnostics.push(key("Duplicate schema identity"));
    }
    let sources = member(pack, "sources");
    for binding in items(member(pack, "source_bindings")) {
        let schema_id = text(member(binding, "schema_id"));
        let source_id = text(member(binding, "source_id"));
        let schema_exists = schema_id.is_some_and(|id| ids.contains(&id));
        let source_exists = match (sources, source_id) {
            (Some(Value::Object(fields)), Some(id)) => fields.iter().any(|(key, _)| key == id),
            _ => false,
        };
        if !schema_exists || !source_exists {
            diagnostics.push(key("Unresolved source binding"));
        }
    }
    if let Some(composition) = member(pack, "composition") {
        let components = items(member(composition, "components"));
        let mut identities: Vec<(Utf16, Utf16)> = Vec::new();
        let mut component_ids: Vec<Utf16> = Vec::new();
        let mut duplicate = false;
        for c in components {
            let id = text(member(c, "id")).cloned().unwrap_or_default();
            let version = text(member(c, "version")).cloned().unwrap_or_default();
            duplicate |=
                identities.contains(&(id.clone(), version.clone())) || component_ids.contains(&id);
            identities.push((id.clone(), version));
            component_ids.push(id);
        }
        if duplicate {
            diagnostics.push(key("Duplicate component identity"));
        }
        if components
            .iter()
            .any(|c| text(member(c, "id")) == text(member(pack, "id")))
        {
            diagnostics.push(key("Self composition is not supported"));
        }
    }
    if let Some(loader) = member(pack, "loader") {
        diagnostics.extend(loader_diagnostics(&to_native(loader)));
    }
    if let Some(Value::Object(preservation)) = member(pack, "preservation") {
        if let Some(Value::Array(derivations)) = preservation
            .iter()
            .find(|(k, _)| *k == key("derivations"))
            .map(|(_, v)| v)
        {
            if derivations
                .iter()
                .any(|d| text(member(d, "schema_id")).is_some_and(|id| !ids.contains(&id)))
            {
                diagnostics.push(key("Unresolved preservation derivation schema"));
            }
        }
    }
    let profile = member(pack, "execution_profile");
    if has_own(pack, "execution_profile") && !matches!(profile, Some(Value::Object(_))) {
        return Ok((false, false, vec![key("Malformed execution profile")]));
    }
    let Some(profile) = profile else {
        return Ok((diagnostics.is_empty(), false, diagnostics));
    };
    let allowed = [
        "version",
        "targets",
        "mode",
        "scales",
        "identity_columns",
        "include_sources",
        "qualification",
    ];
    if let Value::Object(fields) = profile {
        if fields
            .iter()
            .any(|(k, _)| !allowed.iter().any(|a| k == &key(a)))
        {
            diagnostics.push(key("Unsupported execution profile fields"));
        }
    }
    if !text_is(member(profile, "version"), "1.0.0") {
        diagnostics.push(key("Unsupported execution profile version"));
    }
    let mode = text(member(profile, "mode"));
    let fixed = mode.is_some_and(|m| m.units() == "fixed".encode_utf16().collect::<Vec<_>>());
    let replay =
        mode.is_some_and(|m| m.units() == "scenario-replay".encode_utf16().collect::<Vec<_>>());
    if !fixed && !replay {
        diagnostics.push(key("Unsupported execution profile mode"));
    }
    if text(member(profile, "qualification")).is_none_or(Utf16::is_empty) {
        diagnostics.push(key("Missing execution qualification"));
    }
    let targets = member(profile, "targets");
    if !matches!(targets,Some(Value::Object(fields)) if !fields.is_empty()) {
        diagnostics.push(key("Missing schema targets"));
    } else if let Some(Value::Object(fields)) = targets {
        for (target, selection) in fields {
            let supported = target.units() == "tabular".encode_utf16().collect::<Vec<_>>()
                || target.units() == "graph".encode_utf16().collect::<Vec<_>>();
            let selected = items(Some(selection));
            if !supported || selected.is_empty() || !unique_json_values(selected) {
                diagnostics.push(key("Unsupported schema target"));
                continue;
            }
            for id in selected {
                let fmt = if target.units() == "tabular".encode_utf16().collect::<Vec<_>>() {
                    "tablespec"
                } else {
                    "umf"
                };
                let matches = text(Some(id)).is_some_and(|id| {
                    schemas.iter().any(|schema| {
                        text(member(schema, "id")) == Some(id)
                            && text_is(member(schema, "format"), fmt)
                    })
                });
                if !matches {
                    diagnostics.push(key("Target schema format or identity mismatch"));
                }
            }
        }
    }
    let included = items(member(profile, "include_sources"));
    if !matches!(member(profile, "include_sources"), Some(Value::Array(_)))
        || !unique_json_values(included)
        || included.iter().any(|id| {
            let property = js_property_key(id);
            !matches!(sources,Some(Value::Object(fs)) if fs.iter().any(|(k,_)|*k==property))
        })
    {
        diagnostics.push(key("Unresolved source inclusion"));
    }
    if replay {
        let valid_scales = matches!(member(profile,"scales"),Some(Value::Object(fields)) if !fields.is_empty() && fields.iter().all(|(_,v)|matches!(v,Value::Number(n) if n.fract()==0.0 && *n>=1.0 && *n<=10000.0)));
        if !valid_scales {
            diagnostics.push(key("Invalid scenario component scales"));
        }
        let selected = targets
            .and_then(|t| member(t, "tabular"))
            .map(|v| items(Some(v)))
            .unwrap_or(&[]);
        let identity = member(profile, "identity_columns");
        let valid_identity = matches!(identity,Some(Value::Object(fs)) if fs.len()==selected.len() && selected.iter().all(|id| text(Some(id)).is_some_and(|id| fs.iter().any(|(k,v)| k==id && matches!(v,Value::Array(cols) if !cols.is_empty() && unique_json_values(cols) && cols.iter().all(|c| text(Some(c)).is_some_and(|s|!s.is_empty())))))));
        if !valid_identity {
            diagnostics.push(key("Invalid identity column mapping"));
        }
    }
    let valid = diagnostics.is_empty();
    Ok((valid, valid, diagnostics))
}

fn result_value(valid: bool, complete: bool, diagnostics: Vec<Utf16>) -> Value {
    Value::Object(vec![
        (key("valid"), Value::Bool(valid)),
        (key("complete"), Value::Bool(complete)),
        (
            key("diagnostics"),
            Value::Array(diagnostics.into_iter().map(Value::String).collect()),
        ),
    ])
}

/// Synchronous Node/WASM wire operation for a host-admitted JSON snapshot.
pub fn inspect_domain_pack_profile_wire(input: &str) -> Result<String, EngineError> {
    let units: Vec<u16> = input.encode_utf16().collect();
    let mut ctx = Context::catalog();
    let pack = serialization::read_json_value(&units, Format::Json, &mut ctx)?;
    let (valid, complete, diagnostics) = inspect_profile(&pack)?;
    let value = result_value(valid, complete, diagnostics);
    serialization::write_json_value(&value, Format::Json, &mut ctx)?
        .to_utf8()
        .map_err(|_| {
            EngineError::new(
                "DOMAIN_PACK_PROFILE_ENCODING",
                Utf16::default(),
                "Profile result is not UTF-8",
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(input: &str) -> Value {
        let mut ctx = Context::catalog();
        serialization::read_json_value(
            &input.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut ctx,
        )
        .unwrap()
    }

    fn messages(result: &(bool, bool, Vec<Utf16>)) -> Vec<String> {
        result.2.iter().map(|s| s.to_utf8().unwrap()).collect()
    }

    #[test]
    fn valid_pack_without_profile_is_valid_but_incomplete() {
        let result = inspect_profile(&parsed(r#"{"id":"profile-fixture","version":"1.0.0","domain_types":{"identity":{}},"sources":{"source":{"kind":"external","data_kind":"unknown","reference":"urn:fixture:source","format":"json"}}}"#)).unwrap();
        assert_eq!((result.0, result.1), (true, false));
        assert!(result.2.is_empty());
    }

    #[test]
    fn malformed_profile_discards_prior_semantic_diagnostics() {
        let result = inspect_profile(&parsed(r#"{"id":"profile-fixture","version":"1.0.0","domain_types":{"identity":{}},"sources":{"source":{"kind":"external","data_kind":"unknown","reference":"urn:fixture:source","format":"json"}},"schemas":[{"id":"table","format":"tablespec","reference":"a.json"},{"id":"table","format":"tablespec","reference":"b.json"}],"execution_profile":[]}"#)).unwrap();
        assert_eq!(messages(&result), ["Malformed execution profile"]);
    }

    #[test]
    fn canonical_schema_failure_precedes_profile_semantics() {
        let result = inspect_profile(&parsed(
            r#"{"id":"profile-fixture","version":"1.0.0","domain_types":[]}"#,
        ))
        .unwrap();
        assert_eq!(
            messages(&result),
            ["Invalid canonical domain-pack metadata"]
        );
    }

    #[test]
    fn utf16_annotations_are_retained_while_constrained_identity_refuses() {
        let mut annotation = parsed(
            r#"{"id":"profile-fixture","version":"1.0.0","domain_types":{"identity":{}},"sources":{"source":{"kind":"external","data_kind":"unknown","reference":"urn:fixture:source","format":"json"}},"future":"x"}"#,
        );
        if let Value::Object(fields) = &mut annotation {
            fields
                .iter_mut()
                .find(|(k, _)| k == &key("future"))
                .unwrap()
                .1 = Value::String(Utf16::new(vec![0xd800]));
        }
        assert_eq!(inspect_profile(&annotation).unwrap().0, true);
        if let Value::Object(fields) = &mut annotation {
            let sources = fields
                .iter_mut()
                .find(|(k, _)| k == &key("sources"))
                .unwrap();
            let Value::Object(source_map) = &mut sources.1 else {
                unreachable!()
            };
            let Value::Object(source) = &mut source_map[0].1 else {
                unreachable!()
            };
            source
                .iter_mut()
                .find(|(k, _)| k == &key("kind"))
                .unwrap()
                .1 = Value::String(Utf16::new(vec![0xd800]));
        }
        assert_eq!(
            messages(&inspect_profile(&annotation).unwrap()),
            ["Invalid canonical domain-pack metadata"]
        );
    }

    #[test]
    fn profile_diagnostics_keep_predecessor_order() {
        let result = inspect_profile(&parsed(r#"{"id":"profile-fixture","version":"1.0.0","domain_types":{"identity":{}},"sources":{"source":{"kind":"external","data_kind":"unknown","reference":"urn:fixture:source","format":"json"}},"schemas":[{"id":"table","format":"tablespec","reference":"table.json"},{"id":"table","format":"tablespec","reference":"duplicate.json"}],"source_bindings":[{"schema_id":"missing","source_id":"missing","role":"rows"}],"execution_profile":{"version":"2.0.0","mode":"unsupported","qualification":"","targets":{"other":["missing"]},"include_sources":["unknown"]}}"#)).unwrap();
        assert_eq!(
            messages(&result),
            [
                "Duplicate schema identity",
                "Unresolved source binding",
                "Unsupported execution profile version",
                "Unsupported execution profile mode",
                "Missing execution qualification",
                "Unsupported schema target",
                "Unresolved source inclusion"
            ]
        );
    }
}
