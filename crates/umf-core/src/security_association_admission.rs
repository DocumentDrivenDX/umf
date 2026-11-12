// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private selected-source correspondence for candidate security associations.
//! This returns detached plans only; it does not issue policy authority.
use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    let Value::Object(m) = v else { return None };
    m.iter().find(|(n, _)| n == &Utf16::from(k)).map(|(_, v)| v)
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    match v {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array(v: Option<&Value>) -> &[Value] {
    match v {
        Some(Value::Array(a)) => a,
        _ => &[],
    }
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn strv(v: &str) -> Value {
    Value::string_utf8(v)
}
fn fail() -> EngineError {
    EngineError::new(
        "SECURITY_ASSOCIATION_CANDIDATE_UNSUPPORTED",
        Utf16::default(),
        "Unsupported candidate association source",
    )
}
fn exact(v: &Value, keys: &[&str]) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(fail());
    };
    if m.len() != keys.len()
        || m.iter()
            .any(|(k, _)| !keys.iter().any(|x| k == &Utf16::from(*x)))
    {
        return Err(fail());
    }
    Ok(())
}
fn required_text(v: Option<&Value>) -> Result<&Utf16, EngineError> {
    let s = text(v).ok_or_else(fail)?;
    let codepoints = char::decode_utf16(s.units().iter().copied())
        .take(4097)
        .count();
    if codepoints == 0 || codepoints > 4096 {
        return Err(fail());
    }
    Ok(s)
}
fn valid_ref(v: &Value) -> Result<(), EngineError> {
    exact(v, &["documentId", "moduleId", "elementId"])?;
    for k in ["documentId", "moduleId", "elementId"] {
        required_text(get(v, k))?;
    }
    Ok(())
}
fn ref_key(r: &Value) -> Result<Vec<Utf16>, EngineError> {
    valid_ref(r)?;
    Ok(["documentId", "moduleId", "elementId"]
        .iter()
        .map(|k| required_text(get(r, k)).cloned())
        .collect::<Result<Vec<_>, _>>()?)
}
fn same_ref(a: &Value, b: &Value) -> bool {
    ["documentId", "moduleId", "elementId"]
        .iter()
        .all(|k| get(a, k) == get(b, k))
}
fn module<'a>(doc: &'a Value, id: &Utf16) -> Result<&'a Value, EngineError> {
    let found = array(get(doc, "modules"))
        .iter()
        .filter(|m| text(get(m, "id")) == Some(id))
        .collect::<Vec<_>>();
    if found.len() != 1 {
        return Err(fail());
    }
    Ok(found[0])
}
fn record<'a>(doc: &'a Value, r: &Value) -> Result<&'a Value, EngineError> {
    valid_ref(r)?;
    if text(get(r, "documentId")) != text(get(doc, "id")) {
        return Err(fail());
    }
    let m = module(doc, required_text(get(r, "moduleId"))?)?;
    let found = array(get(m, "elements"))
        .iter()
        .filter(|e| get(e, "id") == get(r, "elementId"))
        .collect::<Vec<_>>();
    if found.len() != 1
        || text(get(found[0], "kind"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("record")
    {
        return Err(fail());
    }
    Ok(found[0])
}
fn selected<'a>(r: &'a Value, key_id: &Utf16) -> Result<&'a Value, EngineError> {
    let found = array(get(r, "keys"))
        .iter()
        .filter(|k| text(get(k, "id")) == Some(key_id))
        .collect::<Vec<_>>();
    if found.len() != 1 {
        return Err(fail());
    }
    let key = found[0];
    let Value::Object(props) = key else {
        return Err(fail());
    };
    if props.iter().any(|(k, _)| {
        !["id", "name", "fields", "primary"]
            .iter()
            .any(|n| k == &Utf16::from(*n))
    }) || get(key, "primary").is_some_and(|v| !matches!(v, Value::Bool(_)))
    {
        return Err(fail());
    }
    let fields = array(get(key, "fields"));
    if fields.is_empty() {
        return Err(fail());
    }
    let mut seen = std::collections::HashSet::new();
    for f in fields {
        exact(f, &["module", "element"])?;
        let m = required_text(get(f, "module"))?;
        let e = required_text(get(f, "element"))?;
        if !seen.insert((m.clone(), e.clone()))
            || !array(get(r, "members"))
                .iter()
                .any(|x| text(get(x, "module")) == Some(m) && text(get(x, "element")) == Some(e))
        {
            return Err(fail());
        }
    }
    Ok(key)
}
fn member_field<'a>(doc: &'a Value, r: &Value, f: &Value) -> Result<&'a Value, EngineError> {
    valid_ref(f)?;
    if text(get(f, "documentId")) != text(get(doc, "id"))
        || text(get(f, "documentId")) != text(get(r, "documentId"))
    {
        return Err(fail());
    }
    let record = record(doc, r)?;
    let module_id = required_text(get(f, "moduleId"))?;
    let element_id = required_text(get(f, "elementId"))?;
    if !array(get(record, "members")).iter().any(|m| {
        text(get(m, "module")) == Some(module_id) && text(get(m, "element")) == Some(element_id)
    }) {
        return Err(fail());
    }
    let module = module(doc, module_id)?;
    let found = array(get(module, "elements"))
        .iter()
        .filter(|e| text(get(e, "id")) == Some(element_id))
        .collect::<Vec<_>>();
    if found.len() != 1
        || text(get(found[0], "kind"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("field")
    {
        return Err(fail());
    }
    Ok(found[0])
}
fn canonical(v: &Value) -> Value {
    match v {
        Value::Object(fields) => {
            let mut fields = fields
                .iter()
                .map(|(k, v)| (k.clone(), canonical(v)))
                .collect::<Vec<_>>();
            fields.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(fields)
        }
        Value::Array(a) => Value::Array(a.iter().map(canonical).collect()),
        _ => v.clone(),
    }
}
fn field_domain(doc: &Value, r: &Value) -> Result<Value, EngineError> {
    valid_ref(r)?;
    if text(get(r, "documentId")) != text(get(doc, "id")) {
        return Err(fail());
    }
    let m = module(doc, required_text(get(r, "moduleId"))?)?;
    let found = array(get(m, "elements"))
        .iter()
        .filter(|e| get(e, "id") == get(r, "elementId"))
        .collect::<Vec<_>>();
    if found.len() != 1 {
        return Err(fail());
    }
    let field = found[0];
    let allowed = [
        "id",
        "kind",
        "name",
        "description",
        "title",
        "aliases",
        "examples",
        "extensions",
        "scalarType",
        "nullability",
        "cardinality",
        "facets",
        "allowedValues",
        "references",
    ];
    if let Value::Object(props) = field {
        if props
            .iter()
            .any(|(k, _)| !allowed.iter().any(|a| k == &Utf16::from(*a)))
        {
            return Err(fail());
        }
    } else {
        return Err(fail());
    }
    let scalar = required_text(get(field, "scalarType"))?;
    if !["boolean", "string", "integer", "decimal", "binary"]
        .iter()
        .any(|s| scalar == &Utf16::from(*s))
        || text(get(field, "kind"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("field")
        || text(get(field, "cardinality"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("one")
        || text(get(field, "nullability"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("required")
    {
        return Err(fail());
    }
    if get(field, "extensions").is_some_and(|v| !matches!(v,Value::Object(m) if m.is_empty())) {
        return Err(fail());
    }
    if let Some(references) = get(field, "references") {
        let Value::Array(refs) = references else {
            return Err(fail());
        };
        for x in refs {
            exact(x, &["role", "module", "element"])?;
            for k in ["role", "module", "element"] {
                required_text(get(x, k))?;
            }
            if text(get(x, "role"))
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("record-type")
            {
                return Err(fail());
            }
        }
    }
    let empty = Value::Object(Vec::new());
    let facets = get(field, "facets")
        .filter(|v| !matches!(v, Value::Null))
        .unwrap_or(&empty);
    let Value::Object(facet_fields) = facets else {
        return Err(fail());
    };
    for (name, value) in facet_fields {
        let k = name.to_utf8().map_err(|_| fail())?;
        match k.as_str() {
            "precision" | "scale" => {}
            "length" | "integerWidth" | "range" => {
                let Value::Object(items) = value else {
                    return Err(fail());
                };
                let permitted: &[&str] = match k.as_str() {
                    "length" => &["min", "max", "unit"],
                    "integerWidth" => &["bits", "signed"],
                    _ => &["min", "max", "minInclusive", "maxInclusive"],
                };
                if items
                    .iter()
                    .any(|(key, _)| !permitted.iter().any(|x| key == &Utf16::from(*x)))
                {
                    return Err(fail());
                }
            }
            _ => return Err(fail()),
        }
    }
    if scalar == &Utf16::from("decimal") {
        let safe = 9_007_199_254_740_991.0;
        let precision = get(facets, "precision").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n)
            } else {
                None
            }
        });
        let scale = get(facets, "scale").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n)
            } else {
                None
            }
        });
        if !precision.is_some_and(|n| n.is_finite() && n.fract() == 0.0 && n >= 1.0 && n <= safe)
            || !scale.is_some_and(|n| n.is_finite() && n.fract() == 0.0 && n >= 0.0 && n <= safe)
        {
            return Err(fail());
        }
    }
    Ok(canonical(&obj(vec![
        ("scalarType", Value::String(scalar.clone())),
        ("cardinality", get(field, "cardinality").unwrap().clone()),
        ("nullability", get(field, "nullability").unwrap().clone()),
        ("facets", facets.clone()),
        (
            "allowedValues",
            get(field, "allowedValues").cloned().unwrap_or(Value::Null),
        ),
    ])))
}

fn classify_records(
    doc: &Value,
    scope: &[Value],
    declarations: &Value,
) -> Result<Value, EngineError> {
    let Value::Array(declarations) = declarations else {
        return Err(fail());
    };
    if scope.len() > 257 || declarations.len() > 257 {
        return Err(fail());
    }
    let mut required = std::collections::HashSet::new();
    for r in scope {
        let k = ref_key(r)?;
        if text(get(r, "documentId")) != text(get(doc, "id")) {
            return Err(fail());
        }
        required.insert(k);
    }
    let mut seen = std::collections::HashSet::new();
    for declaration in declarations {
        exact(declaration, &["type", "fields"])?;
        let ty = get(declaration, "type").ok_or_else(fail)?;
        let token = ref_key(ty)?;
        if !required.contains(&token) || !seen.insert(token) {
            return Err(fail());
        }
        let rec = record(doc, ty)?;
        let mut members = std::collections::HashSet::new();
        for m in array(get(rec, "members")) {
            members.insert(vec![
                text(get(doc, "id")).ok_or_else(fail)?.clone(),
                required_text(get(m, "module"))?.clone(),
                required_text(get(m, "element"))?.clone(),
            ]);
        }
        let mut actual = std::collections::HashSet::new();
        for field in array(get(declaration, "fields")) {
            let Value::Object(props) = field else {
                return Err(fail());
            };
            if props.iter().any(|(k, _)| {
                ["ref", "protection", "queryUse"]
                    .iter()
                    .all(|x| k != &Utf16::from(*x))
            }) || get(field, "ref").is_none()
                || get(field, "protection").is_none()
            {
                return Err(fail());
            }
            let f = get(field, "ref").ok_or_else(fail)?;
            let fkey = ref_key(f)?;
            if !members.contains(&fkey) || !actual.insert(fkey) {
                return Err(fail());
            }
            if !["protected", "unprotected"].iter().any(|x| {
                text(get(field, "protection"))
                    .and_then(|s| s.to_utf8().ok())
                    .as_deref()
                    == Some(x)
            }) {
                return Err(fail());
            }
            if let Some(uses) = get(field, "queryUse") {
                let Value::Object(uses) = uses else {
                    return Err(fail());
                };
                for (op, use_value) in uses {
                    let op = op.to_utf8().map_err(|_| fail())?;
                    let value = text(Some(use_value)).and_then(|v| v.to_utf8().ok());
                    if !["predicate", "order", "group", "join", "aggregate"].contains(&op.as_str())
                        || !matches!(
                            value.as_deref(),
                            Some("disclosed" | "original-authorized" | "prohibited")
                        )
                    {
                        return Err(fail());
                    }
                }
            }
        }
        if actual.len() != members.len() {
            return Err(fail());
        }
    }
    if seen.len() != required.len() {
        return Err(fail());
    }
    Ok(Value::Array(declarations.to_vec()))
}

pub fn resolve_record_association(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let selector = get(input, "selector").ok_or_else(fail)?;
    let document = get(input, "document").ok_or_else(fail)?;
    let entities = array(get(input, "entities"));
    exact(selector, &["kind", "type", "keyId", "endpoints"])?;
    if text(get(selector, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("record-members")
    {
        return Err(fail());
    }
    let ty = get(selector, "type").ok_or_else(fail)?;
    valid_ref(ty)?;
    let key_id = required_text(get(selector, "keyId"))?;
    if text(get(document, "umf"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some(crate::security_policy::CORE_VERSION)
        || entities.len() > 256
    {
        return Err(fail());
    }
    let mut choice = std::collections::HashMap::<Vec<Utf16>, Utf16>::new();
    for e in entities {
        exact(e, &["type", "keyId"])?;
        let r = get(e, "type").ok_or_else(fail)?;
        let id = ref_key(r)?;
        let key = required_text(get(e, "keyId"))?.clone();
        if choice.insert(id, key).is_some() {
            return Err(fail());
        }
    }
    let source = record(document, ty)?;
    let key = selected(source, key_id)?;
    let endpoint_inputs = array(get(selector, "endpoints"));
    if endpoint_inputs.is_empty() || endpoint_inputs.len() > 256 {
        return Err(fail());
    }
    let mut roles = std::collections::HashSet::new();
    let mut endpoints = Vec::new();
    for e in endpoint_inputs {
        exact(e, &["role", "target", "fields"])?;
        let role = required_text(get(e, "role"))?;
        let target = get(e, "target").ok_or_else(fail)?;
        let id = ref_key(target)?;
        if !roles.insert(role.clone()) {
            return Err(fail());
        }
        let target_key = choice.get(&id).ok_or_else(fail)?;
        let target_record = record(document, target)?;
        let target_key = selected(target_record, target_key)?;
        let fields = array(get(e, "fields"));
        let key_fields = array(get(target_key, "fields"));
        if fields.is_empty() || fields.len() > 256 || fields.len() != key_fields.len() {
            return Err(fail());
        }
        let mut seen = std::collections::HashSet::new();
        for f in fields {
            member_field(document, ty, f)?;
            let fk = ref_key(f)?;
            if !seen.insert(fk) {
                return Err(fail());
            }
        }
        for (index, source_field) in fields.iter().enumerate() {
            let key_field = &key_fields[index];
            let target_field = obj(vec![
                ("documentId", get(target, "documentId").unwrap().clone()),
                ("moduleId", get(key_field, "module").unwrap().clone()),
                ("elementId", get(key_field, "element").unwrap().clone()),
            ]);
            if field_domain(document, source_field)? != field_domain(document, &target_field)? {
                return Err(fail());
            }
        }
        endpoints.push(obj(vec![
            ("role", Value::String(role.clone())),
            ("target", target.clone()),
            ("key", target_key.clone()),
            ("fields", Value::Array(fields.to_vec())),
        ]));
    }
    let plan = obj(vec![
        ("kind", strv("candidate-record-association/0.1")),
        ("type", ty.clone()),
        ("key", key.clone()),
        ("sourceRecord", source.clone()),
        ("endpoints", Value::Array(endpoints.clone())),
    ]);
    let mut receipt = vec![("plan", plan)];
    if let Some(classes) = get(input, "classifications") {
        let mut scope = vec![ty.clone()];
        scope.extend(endpoints.iter().filter_map(|e| get(e, "target").cloned()));
        receipt.push((
            "classifications",
            classify_records(document, &scope, classes)?,
        ));
    }
    Ok(obj(receipt))
}

pub fn validate_relationship_association(
    input: &Value,
    _ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let selector = get(input, "selector").ok_or_else(fail)?;
    let ontology = get(input, "ontology").ok_or_else(fail)?;
    let documents = get(input, "documents").ok_or_else(fail)?;
    let Some(Value::Array(entities)) = get(ontology, "entities") else {
        return Err(fail());
    };
    if entities.len() > 256 {
        return Err(fail());
    }
    let mut identities = std::collections::HashSet::new();
    for entity in entities {
        exact(entity, &["type", "keyId"])?;
        required_text(get(entity, "keyId"))?;
        let entity_type = get(entity, "type").ok_or_else(fail)?;
        if !identities.insert(ref_key(entity_type)?) {
            return Err(fail());
        }
    }
    let plan = resolve_graph_source(selector, ontology, documents)?;
    let mut result = vec![("plan", plan.clone())];
    if let Some(core) = get(input, "core") {
        if get(core, "valid") != Some(&Value::Bool(true)) {
            return Err(fail());
        }
        if get(core, "complete") == Some(&Value::Bool(false)) {
            let Value::Array(diagnostics) = get(core, "diagnostics").ok_or_else(fail)? else {
                return Err(fail());
            };
            if diagnostics.len() != 1 {
                return Err(fail());
            }
            let diagnostic = &diagnostics[0];
            let rel = get(&plan, "relationship").ok_or_else(fail)?;
            let document_id = text(get(rel, "documentId")).ok_or_else(fail)?;
            let module_id = text(get(rel, "moduleId")).ok_or_else(fail)?;
            let relationship_id = text(get(rel, "relationshipId")).ok_or_else(fail)?;
            let document = array(Some(documents))
                .iter()
                .find(|entry| {
                    text(get(get(entry, "document").unwrap_or(&Value::Null), "id"))
                        == Some(document_id)
                })
                .and_then(|entry| get(entry, "document"))
                .ok_or_else(fail)?;
            let mut expected_path = None;
            for (module_index, module) in array(get(document, "modules")).iter().enumerate() {
                if text(get(module, "id")) != Some(module_id) {
                    continue;
                }
                for (relationship_index, relationship) in
                    array(get(module, "relationships")).iter().enumerate()
                {
                    if text(get(relationship, "id")) == Some(relationship_id) {
                        expected_path = Some(format!(
                            "/modules/{module_index}/relationships/{relationship_index}/associationRecord/key"
                        ));
                    }
                }
            }
            let expected_path = expected_path.ok_or_else(fail)?;
            let interpretation = get(input, "interpretation").ok_or_else(fail)?;
            exact(interpretation, &["profile"])?;
            if text(get(interpretation, "profile"))
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                != Some("association-record-key-agreement/0.1")
                || text(get(diagnostic, "code"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    != Some("UNKNOWN_RELATIONSHIP_QUALIFIER")
                || text(get(diagnostic, "path"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    != Some(expected_path.as_str())
            {
                return Err(fail());
            }
            let witness = get(&plan, "witness").ok_or_else(fail)?;
            let source_relationship = get(&plan, "sourceRelationship").ok_or_else(fail)?;
            let declared_key = get(
                get(source_relationship, "associationRecord").ok_or_else(fail)?,
                "key",
            );
            let selected_key = get(get(witness, "key").ok_or_else(fail)?, "id");
            if text(declared_key) != text(selected_key) {
                return Err(fail());
            }
            result.push((
                "interpretedQualifier",
                obj(vec![
                    ("profile", strv("association-record-key-agreement/0.1")),
                    ("path", strv(&expected_path)),
                    (
                        "keyId",
                        Value::String(text(selected_key).ok_or_else(fail)?.clone()),
                    ),
                ]),
            ));
        } else if get(core, "complete") != Some(&Value::Bool(true)) {
            return Err(fail());
        }
    }
    if let Some(classes) = get(input, "classifications") {
        let witness = get(&plan, "witness").ok_or_else(fail)?;
        let mut scope = array(get(&plan, "endpoints"))
            .iter()
            .filter_map(|e| get(e, "target").cloned())
            .collect::<Vec<_>>();
        if text(get(witness, "kind"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            == Some("record-key")
        {
            scope.push(get(witness, "type").cloned().ok_or_else(fail)?);
        }
        let rel = get(&plan, "relationship").ok_or_else(fail)?;
        let document_id = get(rel, "documentId").ok_or_else(fail)?;
        let document = array(Some(documents))
            .iter()
            .find(|e| get(get(e, "document").unwrap_or(&Value::Null), "id") == Some(document_id))
            .and_then(|e| get(e, "document"))
            .ok_or_else(fail)?;
        result.push((
            "classifications",
            classify_records(document, &scope, classes)?,
        ));
    }
    Ok(obj(result))
}

fn resolve_graph_source(
    selector: &Value,
    ontology: &Value,
    documents: &Value,
) -> Result<Value, EngineError> {
    exact(selector, &["kind", "relationship", "witness", "endpoints"])?;
    if text(get(selector, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("core-relationship")
    {
        return Err(fail());
    }
    let relationship_ref = get(selector, "relationship").ok_or_else(fail)?;
    valid_ref_relationship(relationship_ref)?;
    let document_id = required_text(get(relationship_ref, "documentId"))?;
    let module_id = required_text(get(relationship_ref, "moduleId"))?;
    let relationship_id = required_text(get(relationship_ref, "relationshipId"))?;
    let matching_docs = array(Some(documents))
        .iter()
        .filter(|entry| {
            get(entry, "document").and_then(|d| text(get(d, "id"))) == Some(document_id)
        })
        .collect::<Vec<_>>();
    if matching_docs.len() != 1 {
        return Err(fail());
    }
    let document = get(matching_docs[0], "document").ok_or_else(fail)?;
    if text(get(document, "umf"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some(crate::security_policy::CORE_VERSION)
    {
        return Err(fail());
    }
    let matching_modules = array(get(document, "modules"))
        .iter()
        .filter(|m| text(get(m, "id")) == Some(module_id))
        .collect::<Vec<_>>();
    if matching_modules.len() != 1 {
        return Err(fail());
    }
    let module = matching_modules[0];
    let matching_relationships = array(get(module, "relationships"))
        .iter()
        .filter(|r| text(get(r, "id")) == Some(relationship_id))
        .collect::<Vec<_>>();
    if matching_relationships.len() != 1 {
        return Err(fail());
    }
    let relationship = matching_relationships[0];
    if get(relationship, "directed") != Some(&Value::Bool(true)) {
        return Err(fail());
    }
    let source = get(relationship, "source")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(fail)?;
    let target = get(relationship, "target")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(fail)?;
    if source.len() != 1 || target.len() != 1 {
        return Err(fail());
    }

    let Some(Value::Array(entities)) = get(ontology, "entities") else {
        return Err(fail());
    };
    if entities.len() > 256 {
        return Err(fail());
    }
    let mut choices = std::collections::HashMap::new();
    for entity in entities {
        exact(entity, &["type", "keyId"])?;
        let ty = get(entity, "type").ok_or_else(fail)?;
        let token = ref_key(ty)?;
        let key = required_text(get(entity, "keyId"))?.clone();
        if choices.insert(token, key).is_some() {
            return Err(fail());
        }
    }
    let Some(Value::Array(endpoint_inputs)) = get(selector, "endpoints") else {
        return Err(fail());
    };
    if endpoint_inputs.len() != 2 {
        return Err(fail());
    }
    let mut roles = std::collections::HashSet::new();
    let mut sides = std::collections::HashSet::new();
    let mut endpoint_plans = Vec::new();
    for endpoint in endpoint_inputs {
        exact(endpoint, &["role", "side", "target", "keyId"])?;
        let role = required_text(get(endpoint, "role"))?;
        let side = required_text(get(endpoint, "side"))?;
        if !roles.insert(role.clone())
            || !sides.insert(side.clone())
            || (side != &Utf16::from("source") && side != &Utf16::from("target"))
        {
            return Err(fail());
        }
        let native = if side == &Utf16::from("source") {
            &source[0]
        } else {
            &target[0]
        };
        let endpoint_type = get(endpoint, "target").ok_or_else(fail)?;
        valid_ref(endpoint_type)?;
        if text(get(endpoint_type, "documentId")) != Some(document_id)
            || text(get(endpoint_type, "moduleId")) != text(get(native, "module"))
            || text(get(endpoint_type, "elementId")) != text(get(native, "element"))
        {
            return Err(fail());
        }
        let key_id = required_text(get(endpoint, "keyId"))?;
        if get(native, "key").is_some_and(|v| text(Some(v)) != Some(key_id)) {
            return Err(fail());
        }
        let key_choice = choices.get(&ref_key(endpoint_type)?).ok_or_else(fail)?;
        if key_choice != key_id {
            return Err(fail());
        }
        let endpoint_record = record(document, endpoint_type)?;
        let selected_key = selected(endpoint_record, key_id)?;
        endpoint_plans.push(obj(vec![
            ("role", Value::String(role.clone())),
            ("side", Value::String(side.clone())),
            ("target", endpoint_type.clone()),
            ("key", selected_key.clone()),
        ]));
    }
    if roles.len() != 2 || sides.len() != 2 {
        return Err(fail());
    }
    let witness = get(selector, "witness").ok_or_else(fail)?;
    let witness_plan = match text(get(witness, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
    {
        Some("opaque-existential") => {
            exact(witness, &["kind"])?;
            if get(relationship, "associationRecord").is_some() {
                return Err(fail());
            }
            obj(vec![("kind", strv("opaque-existential"))])
        }
        Some("record-key") => {
            exact(witness, &["kind", "type", "keyId"])?;
            let witness_type = get(witness, "type").ok_or_else(fail)?;
            valid_ref(witness_type)?;
            let key_id = required_text(get(witness, "keyId"))?;
            let assoc = get(relationship, "associationRecord").ok_or_else(fail)?;
            if text(get(witness_type, "documentId")) != Some(document_id)
                || text(get(witness_type, "moduleId")) != text(get(assoc, "module"))
                || text(get(witness_type, "elementId")) != text(get(assoc, "element"))
                || get(assoc, "key").is_some_and(|v| text(Some(v)) != Some(key_id))
            {
                return Err(fail());
            }
            let source_record = record(document, witness_type)?;
            let selected_key = selected(source_record, key_id)?;
            let attributes = array(get(source_record, "members"))
                .iter()
                .map(|m| {
                    obj(vec![
                        ("documentId", Value::String(document_id.clone())),
                        ("moduleId", get(m, "module").cloned().unwrap_or(Value::Null)),
                        (
                            "elementId",
                            get(m, "element").cloned().unwrap_or(Value::Null),
                        ),
                    ])
                })
                .collect();
            obj(vec![
                ("kind", strv("record-key")),
                ("type", witness_type.clone()),
                ("key", selected_key.clone()),
                ("sourceRecord", source_record.clone()),
                ("attributes", Value::Array(attributes)),
            ])
        }
        _ => return Err(fail()),
    };
    Ok(obj(vec![
        ("kind", strv("candidate-relationship-semantics/0.1")),
        ("relationship", relationship_ref.clone()),
        ("sourceRelationship", relationship.clone()),
        ("witness", witness_plan),
        ("endpoints", Value::Array(endpoint_plans)),
    ]))
}

fn valid_ref_relationship(v: &Value) -> Result<(), EngineError> {
    exact(v, &["documentId", "moduleId", "relationshipId"])?;
    for k in ["documentId", "moduleId", "relationshipId"] {
        required_text(get(v, k))?;
    }
    Ok(())
}

pub fn resolve_relationship_term(input: &Value) -> Result<Value, EngineError> {
    let plan = get(input, "plan").ok_or_else(fail)?;
    let term = get(input, "term").ok_or_else(fail)?;
    let plan_kind = text(get(plan, "kind")).and_then(|v| v.to_utf8().ok());
    let graph = plan_kind.as_deref() == Some("candidate-relationship-semantics/0.1");
    if !matches!(
        plan_kind.as_deref(),
        Some("candidate-relationship-semantics/0.1" | "candidate-record-association/0.1")
    ) {
        return Err(fail());
    }
    match text(get(term, "kind"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
    {
        Some("endpoint") => {
            exact(term, &["kind", "role"])?;
            let role = get(term, "role").ok_or_else(fail)?;
            required_text(Some(role))?;
            let found = array(get(plan, "endpoints"))
                .iter()
                .find(|e| get(e, "role") == Some(role))
                .ok_or_else(fail)?;
            if graph {
                Ok(obj(vec![
                    ("kind", strv("entity-identity")),
                    (
                        "relationship",
                        get(plan, "relationship").cloned().ok_or_else(fail)?,
                    ),
                    ("role", role.clone()),
                    ("side", get(found, "side").cloned().ok_or_else(fail)?),
                    ("type", get(found, "target").cloned().ok_or_else(fail)?),
                    ("key", get(found, "key").cloned().ok_or_else(fail)?),
                ]))
            } else {
                Ok(obj(vec![
                    ("kind", strv("entity-identity")),
                    ("association", get(plan, "type").cloned().ok_or_else(fail)?),
                    ("role", role.clone()),
                    ("type", get(found, "target").cloned().ok_or_else(fail)?),
                    ("key", get(found, "key").cloned().ok_or_else(fail)?),
                    ("fields", get(found, "fields").cloned().ok_or_else(fail)?),
                ]))
            }
        }
        Some("identity") => {
            exact(term, &["kind"])?;
            let (kind, source_type, key) = if graph {
                let witness = get(plan, "witness").ok_or_else(fail)?;
                if text(get(witness, "kind"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    != Some("record-key")
                {
                    return Err(fail());
                }
                (
                    "record-identity",
                    get(witness, "type").cloned().ok_or_else(fail)?,
                    get(witness, "key").cloned().ok_or_else(fail)?,
                )
            } else {
                (
                    "record-identity",
                    get(plan, "type").cloned().ok_or_else(fail)?,
                    get(plan, "key").cloned().ok_or_else(fail)?,
                )
            };
            Ok(if graph {
                obj(vec![
                    ("kind", strv(kind)),
                    (
                        "relationship",
                        get(plan, "relationship").cloned().ok_or_else(fail)?,
                    ),
                    ("type", source_type),
                    ("key", key),
                ])
            } else {
                obj(vec![
                    ("kind", strv(kind)),
                    ("type", source_type),
                    ("key", key),
                ])
            })
        }
        Some("attribute") => {
            exact(term, &["kind", "field"])?;
            let field = get(term, "field").ok_or_else(fail)?;
            valid_ref(field)?;
            let (source_type, attributes) = if graph {
                let witness = get(plan, "witness").ok_or_else(fail)?;
                if text(get(witness, "kind"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    != Some("record-key")
                {
                    return Err(fail());
                }
                (
                    get(witness, "type").cloned().ok_or_else(fail)?,
                    array(get(witness, "attributes")).to_vec(),
                )
            } else {
                let source_type = get(plan, "type").cloned().ok_or_else(fail)?;
                let source_doc = get(&source_type, "documentId").cloned().ok_or_else(fail)?;
                let members = array(get(get(plan, "sourceRecord").ok_or_else(fail)?, "members"));
                let attributes = members
                    .iter()
                    .map(|m| {
                        obj(vec![
                            ("documentId", source_doc.clone()),
                            ("moduleId", get(m, "module").cloned().unwrap_or(Value::Null)),
                            (
                                "elementId",
                                get(m, "element").cloned().unwrap_or(Value::Null),
                            ),
                        ])
                    })
                    .collect();
                (source_type, attributes)
            };
            if !attributes.iter().any(|f| same_ref(f, field)) {
                return Err(fail());
            }
            Ok(if graph {
                obj(vec![
                    ("kind", strv("record-attribute")),
                    (
                        "relationship",
                        get(plan, "relationship").cloned().ok_or_else(fail)?,
                    ),
                    ("type", source_type),
                    ("field", field.clone()),
                ])
            } else {
                obj(vec![
                    ("kind", strv("record-attribute")),
                    ("type", source_type),
                    ("field", field.clone()),
                ])
            })
        }
        _ => Err(fail()),
    }
}

pub fn witness_term_capability(input: &Value) -> Result<Value, EngineError> {
    let plan = get(input, "plan").ok_or_else(fail)?;
    let requested = text(get(input, "term")).and_then(|v| v.to_utf8().ok());
    let witness_kind =
        text(get(get(plan, "witness").ok_or_else(fail)?, "kind")).and_then(|v| v.to_utf8().ok());
    let allowed = match (witness_kind.as_deref(), requested.as_deref()) {
        (Some("opaque-existential"), Some("exists" | "endpoint")) => true,
        (Some("record-key"), Some("exists" | "endpoint" | "identity" | "attribute")) => true,
        _ => false,
    };
    Ok(Value::Bool(allowed))
}
