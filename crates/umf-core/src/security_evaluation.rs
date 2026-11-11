// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native current Security access and collection evaluation over host-attested facts.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    value::{copy_json, Utf16, Value},
};
use std::collections::{HashMap, HashSet};

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn members(value: &Value, allowed: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(error("SECURITY_REFUSED", "Expected security object"));
    };
    if fields
        .iter()
        .any(|(key, _)| !allowed.iter().any(|name| key == &Utf16::from(*name)))
    {
        return Err(error("SECURITY_REFUSED", "Uninterpreted security member"));
    }
    Ok(())
}
fn ref_key(value: &Value) -> Result<String, EngineError> {
    members(value, &["documentId", "moduleId", "elementId"])?;
    for name in ["documentId", "moduleId", "elementId"] {
        if text(get(value, name)).is_none_or(|s| s.is_empty()) {
            return Err(error("SECURITY_REFUSED", "Invalid qualified identity"));
        }
    }
    Ok(identity(value))
}
fn identity(value: &Value) -> String {
    let mut identity = String::new();
    for key in ["documentId", "moduleId", "elementId"] {
        match get(value, key) {
            Some(Value::String(part)) => {
                identity.push_str(&format!("s{}:", part.units().len()));
                for unit in part.units() {
                    identity.push_str(&format!("{unit:04x}"));
                }
            }
            _ => identity.push_str("x0:"),
        }
    }
    identity
}
fn same_ref(a: &Value, b: &Value) -> bool {
    identity(a) == identity(b)
}
fn fail() -> EngineError {
    error("SECURITY_REFUSED", "Security evaluation refused")
}
fn list<'a>(value: Option<&'a Value>, max: usize) -> Result<&'a [Value], EngineError> {
    match value {
        Some(Value::Array(v)) if v.len() <= max => Ok(v),
        _ => Err(fail()),
    }
}
fn binding<'a>(reference: &Value, ontology: &'a Value) -> Option<&'a Value> {
    array(get(ontology, "entities"))
        .iter()
        .chain(array(get(ontology, "associations")))
        .find(|item| get(item, "type").is_some_and(|r| same_ref(r, reference)))
}
fn document<'a>(reference: &Value, documents: &'a [Value]) -> Option<&'a Value> {
    for entry in documents {
        let doc = get(entry, "document")?;
        if get(doc, "id") == get(reference, "documentId") {
            return Some(doc);
        }
    }
    None
}
fn field<'a>(reference: &Value, documents: &'a [Value]) -> Option<&'a Value> {
    let doc = document(reference, documents)?;
    array(get(doc, "modules"))
        .iter()
        .find(|m| get(m, "id") == get(reference, "moduleId"))
        .and_then(|m| {
            array(get(m, "elements"))
                .iter()
                .find(|e| get(e, "id") == get(reference, "elementId"))
        })
}
fn key_fields(binding: &Value, documents: &[Value]) -> Result<Vec<Value>, EngineError> {
    let record = field(get(binding, "type").ok_or_else(fail)?, documents).ok_or_else(fail)?;
    let key = array(get(record, "keys"))
        .iter()
        .find(|k| get(k, "id") == get(binding, "keyId"))
        .ok_or_else(fail)?;
    let typ = get(binding, "type").ok_or_else(fail)?;
    array(get(key, "fields"))
        .iter()
        .map(|f| {
            Ok(object(vec![
                (
                    "documentId",
                    get(typ, "documentId").cloned().ok_or_else(fail)?,
                ),
                ("moduleId", get(f, "module").cloned().ok_or_else(fail)?),
                ("elementId", get(f, "element").cloned().ok_or_else(fail)?),
            ]))
        })
        .collect()
}
fn core_engine() -> Result<Engine, EngineError> {
    crate::security_parameters::core_engine()
}
struct NoExtensions;
impl Capabilities for NoExtensions {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &crate::engine::SemanticContext,
    ) -> Result<Vec<crate::error::Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn literal_id(
    document: &Value,
    field: &Value,
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    engine.check_schema_literal_public(document, field, value, ctx)?;
    // Security comparison admits a typed null as a real value. Keep this
    // identity outside the hexadecimal literal-identity namespace.
    if value == &Value::Null {
        return Ok("null:security-value".to_owned());
    }
    crate::literal::literal_identity(field, value, engine.policy(), ctx)?
        .map(|value| {
            let mut exact = String::with_capacity(value.units().len().saturating_mul(4));
            for unit in value.units() {
                exact.push_str(&format!("{unit:04x}"));
            }
            exact
        })
        .ok_or_else(fail)
}
fn tuple_id(
    binding: &Value,
    values: &Value,
    documents: &[Value],
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let reference = get(binding, "type").ok_or_else(fail)?;
    let source = document(reference, documents).ok_or_else(fail)?;
    let identity = object(vec![
        (
            "module",
            get(reference, "moduleId").cloned().ok_or_else(fail)?,
        ),
        (
            "element",
            get(reference, "elementId").cloned().ok_or_else(fail)?,
        ),
        ("key", get(binding, "keyId").cloned().ok_or_else(fail)?),
    ]);
    let receipt = crate::core_key_tuple::encode_core_key_tuple(
        source,
        &identity,
        values,
        None,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    text(get(&receipt, "bytesHex")).ok_or_else(fail)
}
fn fact_id(
    fact: &Value,
    ontology: &Value,
    documents: &[Value],
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let reference = get(fact, "type").ok_or_else(fail)?;
    let binding = binding(reference, ontology).ok_or_else(fail)?;
    let bytes = tuple_id(
        binding,
        &Value::Array(list(get(fact, "key"), 64)?.to_vec()),
        documents,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    Ok(format!(
        "{}:{}:{bytes}",
        identity(reference),
        text(get(binding, "keyId")).unwrap_or_default()
    ))
}
fn scalar_literal(
    field_ref: &Value,
    value: &Value,
    documents: &[Value],
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let field = field(field_ref, documents)
        .filter(|f| text(get(f, "kind")).as_deref() == Some("field"))
        .ok_or_else(fail)?;
    let doc = document(field_ref, documents).ok_or_else(fail)?;
    literal_id(doc, field, value, engine, ctx)
}
fn validate_fact(
    fact: &Value,
    ontology: &Value,
    documents: &[Value],
    engine: &Engine,
    registry: &Registry,
    cap: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    steps: &mut usize,
    max_steps: usize,
) -> Result<String, EngineError> {
    *steps += 1;
    if *steps > max_steps {
        return Err(fail());
    }
    members(fact, &["type", "key", "fields", "absent"])?;
    let r = get(fact, "type").ok_or_else(fail)?;
    let typ = binding(r, ontology).ok_or_else(fail)?;
    let keys = list(get(fact, "key"), 64)?;
    let entries = list(get(fact, "fields"), 4096)?;
    let absent = list(get(fact, "absent"), 4096)?;
    if keys.is_empty() {
        return Err(fail());
    }
    let key = fact_id(fact, ontology, documents, engine, registry, cap, ctx)?;
    let mut names = HashSet::new();
    for entry in entries {
        *steps += 1;
        if *steps > max_steps {
            return Err(fail());
        }
        members(entry, &["field", "value"])?;
        let fr = get(entry, "field").ok_or_else(fail)?;
        let id = ref_key(fr)?;
        if !names.insert(id.clone())
            || !array(get(typ, "fields"))
                .iter()
                .any(|p| get(p, "ref").is_some_and(|r| same_ref(r, fr)))
        {
            return Err(fail());
        }
        scalar_literal(
            fr,
            get(entry, "value").ok_or_else(fail)?,
            documents,
            engine,
            ctx,
        )?;
    }
    for fr in absent {
        let id = ref_key(fr)?;
        let f = field(fr, documents).ok_or_else(fail)?;
        if !names.insert(id)
            || !array(get(typ, "fields"))
                .iter()
                .any(|p| get(p, "ref").is_some_and(|r| same_ref(r, fr)))
            || text(get(f, "nullability")).as_deref() != Some("absent-allowed")
        {
            return Err(fail());
        }
    }
    let key_fields = key_fields(typ, documents)?;
    if key_fields.len() != keys.len() {
        return Err(fail());
    }
    for (i, fr) in key_fields.iter().enumerate() {
        if let Some(v) = entries
            .iter()
            .find(|e| get(e, "field").is_some_and(|x| same_ref(x, fr)))
            .and_then(|e| get(e, "value"))
        {
            if scalar_literal(fr, v, documents, engine, ctx)?
                != scalar_literal(fr, &keys[i], documents, engine, ctx)?
            {
                return Err(fail());
            }
        }
    }
    Ok(key)
}
fn coverage(cut: &Value, ontology: &Value, ty: &Value) -> Result<HashSet<String>, EngineError> {
    let mut found = None;
    for c in array(get(cut, "coverage")) {
        members(c, &["type", "complete", "fields"])?;
        let r = get(c, "type").ok_or_else(fail)?;
        if !binding(r, ontology).is_some() {
            return Err(fail());
        }
        if same_ref(r, ty) {
            if found.is_some() || get(c, "complete") != Some(&Value::Bool(true)) {
                return Err(fail());
            }
            let fs = list(get(c, "fields"), 4096)?;
            let mut set = HashSet::new();
            for f in fs {
                let id = ref_key(f)?;
                if !set.insert(id)
                    || !array(get(binding(ty, ontology).ok_or_else(fail)?, "fields"))
                        .iter()
                        .any(|p| get(p, "ref").is_some_and(|r| same_ref(r, f)))
                {
                    return Err(fail());
                }
            }
            found = Some(set);
        }
    }
    found.ok_or_else(fail)
}
fn truth_not(v: &str) -> &str {
    match v {
        "T" => "F",
        "F" => "T",
        _ => "U",
    }
}
fn truth_and(v: &[String]) -> String {
    if v.iter().any(|x| x == "F") {
        "F"
    } else if v.iter().any(|x| x == "U") {
        "U"
    } else {
        "T"
    }
    .into()
}
fn truth_or(v: &[String]) -> String {
    if v.iter().any(|x| x == "T") {
        "T"
    } else if v.iter().any(|x| x == "U") {
        "U"
    } else {
        "F"
    }
    .into()
}

fn field_value<'a>(fact: &'a Value, reference: &Value) -> Option<&'a Value> {
    array(get(fact, "fields"))
        .iter()
        .find(|item| get(item, "field").is_some_and(|r| same_ref(r, reference)))
        .and_then(|item| get(item, "value"))
}
fn known_absent(fact: &Value, reference: &Value) -> bool {
    array(get(fact, "absent"))
        .iter()
        .any(|r| same_ref(r, reference))
}
struct EvalState<'ctx, 'control> {
    policy: Value,
    resolution: Value,
    cut: Value,
    request: Value,
    ontology: Value,
    documents: Vec<Value>,
    subject: Value,
    types: HashMap<String, Value>,
    facts: HashMap<String, Vec<Value>>,
    coverage: HashMap<String, HashSet<String>>,
    complete_coverage: HashSet<String>,
    context: HashMap<String, Value>,
    engine: Engine,
    registry: Registry,
    capabilities: NoExtensions,
    ctx: &'ctx mut Context<'control>,
    max_steps: usize,
    steps: usize,
}
impl EvalState<'_, '_> {
    fn step(&mut self) -> Result<(), EngineError> {
        self.steps += 1;
        if self.steps > self.max_steps {
            Err(fail())
        } else {
            Ok(())
        }
    }
    fn doc(&self, r: &Value) -> Result<&Value, EngineError> {
        document(r, &self.documents).ok_or_else(fail)
    }
    fn elem(&self, r: &Value) -> Result<&Value, EngineError> {
        field(r, &self.documents).ok_or_else(fail)
    }
    fn literal(&mut self, r: &Value, v: &Value) -> Result<String, EngineError> {
        let doc = self.doc(r)?.clone();
        let f = self.elem(r)?.clone();
        literal_id(&doc, &f, v, &self.engine, self.ctx)
    }
    fn tuple(&mut self, binding_value: &Value, values: &[Value]) -> Result<String, EngineError> {
        let doc_ref = get(binding_value, "type").ok_or_else(fail)?.clone();
        let source = self.doc(&doc_ref)?.clone();
        let identity = object(vec![
            (
                "module",
                get(&doc_ref, "moduleId").cloned().ok_or_else(fail)?,
            ),
            (
                "element",
                get(&doc_ref, "elementId").cloned().ok_or_else(fail)?,
            ),
            (
                "key",
                get(binding_value, "keyId").cloned().ok_or_else(fail)?,
            ),
        ]);
        let values = Value::Array(values.to_vec());
        let receipt = crate::core_key_tuple::encode_core_key_tuple(
            &source,
            &identity,
            &values,
            None,
            &self.engine,
            &self.registry,
            &mut self.capabilities,
            self.ctx,
        )?;
        text(get(&receipt, "bytesHex")).ok_or_else(fail)
    }
    fn fact_identity(&mut self, fact: &Value) -> Result<String, EngineError> {
        self.step()?;
        let r = get(fact, "type").ok_or_else(fail)?.clone();
        let binding = self.types.get(&identity(&r)).cloned().ok_or_else(fail)?;
        let key = list(get(fact, "key"), 64)?.to_vec();
        let tuple = self.tuple(&binding, &key)?;
        Ok(format!(
            "{}:{}:{tuple}",
            identity(&r),
            text(get(&binding, "keyId")).unwrap_or_default()
        ))
    }
    fn complete(&self, r: &Value) -> bool {
        self.complete_coverage.contains(&identity(r))
    }
    fn covered(&self, typ: &Value, r: &Value) -> bool {
        self.coverage
            .get(&identity(typ))
            .is_some_and(|set| set.contains(&identity(r)))
    }
    fn require_known(&mut self, typ: &Value, r: &Value, rows: &[Value]) -> Result<(), EngineError> {
        if !self.complete(typ) || !self.covered(typ, r) {
            return Err(fail());
        }
        for row in rows {
            self.step()?;
            if field_value(row, r).is_none() && !known_absent(row, r) {
                return Err(fail());
            }
        }
        Ok(())
    }
    fn read_term(
        &mut self,
        term: &Value,
        resource: &Value,
        vars: &[(String, Value)],
    ) -> Result<Option<String>, EngineError> {
        self.step()?;
        let kind = text(get(term, "kind")).unwrap_or_default();
        if kind == "constant" {
            let r = get(term, "field").ok_or_else(fail)?.clone();
            let v = get(term, "value").ok_or_else(fail)?.clone();
            return self.literal(&r, &v).map(Some);
        }
        if kind == "context" {
            let r = get(term, "field").ok_or_else(fail)?;
            return match self.context.get(&identity(r)).cloned() {
                Some(v) => self.literal(r, &v).map(Some),
                None => Ok(None),
            };
        }
        let fact = match kind.as_str() {
            "subject" => self.subject.clone(),
            "resource" => resource.clone(),
            "variable" => {
                let name = text(get(term, "name")).ok_or_else(fail)?;
                vars.iter()
                    .rev()
                    .find(|(n, _)| n == &name)
                    .map(|(_, v)| v.clone())
                    .ok_or_else(fail)?
            }
            _ => return Err(fail()),
        };
        if get(term, "identity") == Some(&Value::Bool(true)) {
            return self.fact_identity(&fact).map(Some);
        }
        if let Some(role) = text(get(term, "endpoint")) {
            let binding_value = self
                .types
                .get(&identity(get(&fact, "type").ok_or_else(fail)?))
                .cloned()
                .ok_or_else(fail)?;
            let endpoint = array(get(&binding_value, "endpoints"))
                .iter()
                .find(|e| text(get(e, "role")).as_deref() == Some(role.as_str()))
                .cloned()
                .ok_or_else(fail)?;
            let refs = array(get(&endpoint, "fields"));
            let mut values = Vec::new();
            for reference in refs {
                match field_value(&fact, reference) {
                    Some(v) if *v != Value::Null => values.push(v.clone()),
                    _ => return Ok(None),
                }
            }
            let target = get(&endpoint, "target").ok_or_else(fail)?.clone();
            let target_binding = self
                .types
                .get(&identity(&target))
                .cloned()
                .ok_or_else(fail)?;
            let bytes = self.tuple(&target_binding, &values)?;
            return Ok(Some(format!(
                "{}:{}:{bytes}",
                identity(&target),
                text(get(&target_binding, "keyId")).unwrap_or_default()
            )));
        }
        let r = get(term, "field").ok_or_else(fail)?;
        match field_value(&fact, r) {
            Some(v) => self.literal(r, v).map(Some),
            None => Ok(None),
        }
    }
    fn expression(
        &mut self,
        expr: &Value,
        resource: &Value,
        vars: &[(String, Value)],
    ) -> Result<String, EngineError> {
        self.step()?;
        match text(get(expr, "op")).as_deref() {
            Some("literal") => Ok(if get(expr, "value") == Some(&Value::Bool(true)) {
                "T"
            } else {
                "F"
            }
            .to_string()),
            Some("eq") => {
                let left = self.read_term(get(expr, "left").ok_or_else(fail)?, resource, vars)?;
                let right = self.read_term(get(expr, "right").ok_or_else(fail)?, resource, vars)?;
                Ok(match (left, right) {
                    (Some(a), Some(b)) if a == b => "T".into(),
                    (Some(_), Some(_)) => "F".into(),
                    _ => "U".into(),
                })
            }
            Some("not") => {
                let v = self.expression(get(expr, "arg").ok_or_else(fail)?, resource, vars)?;
                Ok(truth_not(&v).to_string())
            }
            Some("and") | Some("or") => {
                let mut values = Vec::new();
                for child in list(get(expr, "args"), 64)? {
                    values.push(self.expression(child, resource, vars)?);
                }
                Ok(if text(get(expr, "op")).as_deref() == Some("and") {
                    truth_and(&values)
                } else {
                    truth_or(&values)
                })
            }
            Some("exists") => {
                let association = get(expr, "association").ok_or_else(fail)?;
                let association_id = identity(association);
                let name = text(get(expr, "as")).ok_or_else(fail)?;
                let mut found = false;
                let mut unknown = false;
                for row in self.facts.get(&association_id).cloned().unwrap_or_default() {
                    self.step()?;
                    let mut nested = vars.to_vec();
                    nested.push((name.clone(), row.clone()));
                    match self
                        .expression(get(expr, "where").ok_or_else(fail)?, resource, &nested)?
                        .as_str()
                    {
                        "T" => found = true,
                        "U" => unknown = true,
                        _ => {}
                    }
                }
                Ok(if found {
                    "T"
                } else if unknown {
                    "U"
                } else {
                    "F"
                }
                .into())
            }
            _ => Err(fail()),
        }
    }
    fn admit_expression(
        &mut self,
        expr: &Value,
        resource_type: &Value,
        rows: &[Value],
        vars: &[(String, Value)],
    ) -> Result<(), EngineError> {
        self.step()?;
        match text(get(expr, "op")).as_deref() {
            Some("literal") => Ok(()),
            Some("eq") => {
                for name in ["left", "right"] {
                    let term = get(expr, name).ok_or_else(fail)?;
                    let kind = text(get(term, "kind")).unwrap_or_default();
                    if kind == "constant" {
                        continue;
                    }
                    if kind == "context" {
                        let r = get(term, "field").ok_or_else(fail)?;
                        if !self.context.contains_key(&identity(r)) {
                            return Err(fail());
                        }
                        continue;
                    }
                    let typ = match kind.as_str() {
                        "subject" => get(&self.subject, "type").ok_or_else(fail)?.clone(),
                        "resource" => resource_type.clone(),
                        "variable" => {
                            let n = text(get(term, "name")).ok_or_else(fail)?;
                            let row = vars
                                .iter()
                                .rev()
                                .find(|(name, _)| name == &n)
                                .map(|(_, v)| v)
                                .ok_or_else(fail)?;
                            get(row, "type").ok_or_else(fail)?.clone()
                        }
                        _ => return Err(fail()),
                    };
                    if !self.complete(&typ) {
                        return Err(fail());
                    }
                    let actual_rows = if kind == "subject" {
                        vec![self.subject.clone()]
                    } else if kind == "resource" {
                        rows.to_vec()
                    } else {
                        self.facts.get(&identity(&typ)).cloned().unwrap_or_default()
                    };
                    if let Some(r) = get(term, "field") {
                        self.require_known(&typ, r, &actual_rows)?;
                    }
                    if let Some(role) = text(get(term, "endpoint")) {
                        let b = self.types.get(&identity(&typ)).cloned().ok_or_else(fail)?;
                        let ep = array(get(&b, "endpoints"))
                            .iter()
                            .find(|e| text(get(e, "role")).as_deref() == Some(role.as_str()))
                            .ok_or_else(fail)?;
                        for r in array(get(ep, "fields")) {
                            self.require_known(&typ, r, &actual_rows)?;
                        }
                        let target = get(ep, "target").ok_or_else(fail)?;
                        if !self.complete(target) {
                            return Err(fail());
                        }
                    }
                }
                Ok(())
            }
            Some("and") | Some("or") => {
                for child in list(get(expr, "args"), 64)? {
                    self.admit_expression(child, resource_type, rows, vars)?;
                }
                Ok(())
            }
            Some("not") => self.admit_expression(
                get(expr, "arg").ok_or_else(fail)?,
                resource_type,
                rows,
                vars,
            ),
            Some("exists") => {
                let association = get(expr, "association").ok_or_else(fail)?;
                if !self.complete(association) {
                    return Err(fail());
                }
                let id = identity(association);
                let b = self.types.get(&id).ok_or_else(fail)?;
                let name = text(get(expr, "as")).ok_or_else(fail)?;
                if vars.iter().any(|(n, _)| n == &name) {
                    return Err(fail());
                }
                let mut nested = vars.to_vec();
                nested.push((name, b.clone()));
                self.admit_expression(
                    get(expr, "where").ok_or_else(fail)?,
                    resource_type,
                    rows,
                    &nested,
                )
            }
            _ => Err(fail()),
        }
    }
    fn scoped_rules(&self, action: &str, ty: &Value) -> Vec<Value> {
        array(get(&self.policy, "rules"))
            .iter()
            .filter(|rule| {
                array(get(rule, "actions"))
                    .iter()
                    .any(|a| text(Some(a)).as_deref() == Some(action))
                    && array(get(rule, "target")).iter().any(|r| same_ref(r, ty))
            })
            .cloned()
            .collect()
    }
    fn evaluate_action(
        &mut self,
        action: &str,
        resource: &Value,
    ) -> Result<(String, Vec<(Value, String)>), EngineError> {
        let ty = get(resource, "type").ok_or_else(fail)?.clone();
        let rules = self.scoped_rules(action, &ty);
        let mut evaluated = Vec::new();
        for rule in rules {
            let expr = get(&rule, "condition").ok_or_else(fail)?.clone();
            self.admit_expression(&expr, &ty, &[resource.clone()], &[])?;
            let truth = self.expression(&expr, resource, &[])?;
            evaluated.push((rule, truth));
        }
        let decision = if evaluated.iter().any(|(_, truth)| truth == "U") {
            "indeterminate"
        } else if !evaluated.iter().any(|(rule, truth)| {
            text(get(rule, "effect")).as_deref() == Some("permit") && truth == "T"
        }) || evaluated.iter().any(|(rule, truth)| {
            text(get(rule, "effect")).as_deref() == Some("require") && truth != "T"
        }) || evaluated.iter().any(|(rule, truth)| {
            text(get(rule, "effect")).as_deref() == Some("forbid") && truth == "T"
        }) {
            "deny"
        } else {
            "permit"
        };
        Ok((decision.into(), evaluated))
    }
}
fn output_ref(value: &Value) -> Value {
    value.clone()
}
fn public_access_result(decision: &str, output: Vec<Value>) -> Value {
    object(vec![
        ("decision", string(decision)),
        ("output", Value::Array(output)),
    ])
}
fn access_inner(
    policy_input: &Value,
    resolution_input: &Value,
    cut_input: &Value,
    request_input: &Value,
    resource_input: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = crate::security_policy::require_security_interpretation(
        policy_input,
        resolution_input,
        ctx,
    )?;
    let policy = get(&inspected, "source").cloned().ok_or_else(fail)?;
    let resolution = get(&inspected, "resolution").cloned().ok_or_else(fail)?;
    let cut = copy_json(cut_input, ctx)?;
    let mut request = copy_json(request_input, ctx)?;
    let resource = resource_input
        .map(|value| copy_json(value, ctx))
        .transpose()?;
    if let Value::Object(fields) = &mut request {
        fields.retain(|(key, _)| key != &Utf16::from("resources"));
        if let Some(resource) = &resource {
            fields.push((
                Utf16::from("resources"),
                Value::Array(vec![resource.clone()]),
            ));
        }
    }
    members(
        &cut,
        &[
            "trusted",
            "generation",
            "expectedGeneration",
            "policyId",
            "policyRevision",
            "ontologyDocumentId",
            "ontologyRevision",
            "subjects",
            "facts",
            "coverage",
            "context",
            "maxFacts",
            "maxSteps",
        ],
    )?;
    members(
        &request,
        &["action", "resources", "output", "queryUses", "targets"],
    )?;
    if let Some(resource) = &resource {
        members(resource, &["type", "key", "fields", "absent"])?;
    }
    let ontology = get(&resolution, "ontology").cloned().ok_or_else(fail)?;
    let docs = list(get(&resolution, "documents"), 256)?.to_vec();
    let action = text(get(&request, "action"))
        .filter(|s| !s.is_empty())
        .ok_or_else(fail)?;
    if get(&cut, "trusted") != Some(&Value::Bool(true))
        || text(get(&cut, "generation")).is_none_or(|s| s.is_empty())
        || get(&cut, "generation") != get(&cut, "expectedGeneration")
        || get(&cut, "policyId") != get(&policy, "id")
        || get(&cut, "policyRevision") != get(&policy, "revision")
        || get(&cut, "ontologyDocumentId") != get(&ontology, "documentId")
        || get(&cut, "ontologyRevision") != get(&ontology, "revision")
        || !array(get(&ontology, "actions"))
            .iter()
            .any(|v| text(Some(v)).as_deref() == Some(action.as_str()))
    {
        return Err(fail());
    }
    let max_facts = match get(&cut, "maxFacts") {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 10000.0 =>
        {
            *n as usize
        }
        _ => return Err(fail()),
    };
    let max_steps = match get(&cut, "maxSteps") {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 1000000.0 =>
        {
            *n as usize
        }
        _ => return Err(fail()),
    };
    let subjects = list(get(&cut, "subjects"), 1)?;
    if subjects.len() != 1 {
        return Err(fail());
    }
    let fact_values = list(get(&cut, "facts"), max_facts)?.to_vec();
    let resources = resource.iter().cloned().collect::<Vec<_>>();
    if 1 + fact_values.len() + resources.len() > max_facts {
        return Err(fail());
    }
    let coverage_values = list(get(&cut, "coverage"), 512)?;
    let context_values = list(get(&cut, "context"), 256)?;
    let outputs = list(get(&request, "output"), 4096)?;
    let query_uses = match get(&request, "queryUses") {
        Some(v) => list(Some(v), 4096)?,
        None => &[],
    };
    let engine = core_engine()?;
    let registry = Registry::new();
    let capabilities = NoExtensions;
    let mut steps = 0usize;
    let mut state = EvalState {
        policy,
        resolution: resolution.clone(),
        cut: cut.clone(),
        request: request.clone(),
        ontology: ontology.clone(),
        documents: docs.clone(),
        subject: subjects[0].clone(),
        types: HashMap::new(),
        facts: HashMap::new(),
        coverage: HashMap::new(),
        complete_coverage: HashSet::new(),
        context: HashMap::new(),
        engine,
        registry,
        capabilities,
        ctx,
        max_steps,
        steps,
    };
    let mut text_units = 0usize;
    fn bounded_walk(
        v: &Value,
        steps: &mut usize,
        text: &mut usize,
        max_steps: usize,
    ) -> Result<(), EngineError> {
        *steps += 1;
        if *steps > max_steps {
            return Err(fail());
        }
        match v {
            Value::String(s) => {
                *text += s.units().len();
                if *text > 4_000_000 {
                    return Err(fail());
                }
            }
            Value::Array(a) => {
                for item in a {
                    bounded_walk(item, steps, text, max_steps)?
                }
            }
            Value::Object(o) => {
                for (_, item) in o {
                    bounded_walk(item, steps, text, max_steps)?
                }
            }
            _ => {}
        }
        Ok(())
    }
    bounded_walk(&cut, &mut state.steps, &mut text_units, max_steps)?;
    bounded_walk(&request, &mut state.steps, &mut text_units, max_steps)?;
    for binding_value in array(get(&ontology, "entities"))
        .iter()
        .chain(array(get(&ontology, "associations")))
    {
        state.types.insert(
            identity(get(binding_value, "type").ok_or_else(fail)?),
            binding_value.clone(),
        );
    }
    let subject_type = get(&state.subject, "type").ok_or_else(fail)?;
    if !same_ref(subject_type, get(&ontology, "subject").ok_or_else(fail)?) {
        return Err(fail());
    }
    state.fact_identity(&state.subject.clone())?;
    let mut fact_keys = HashSet::new();
    let mut all_fact_ids = Vec::new();
    let mut all_facts = fact_values.clone();
    all_facts.extend(resources.clone());
    all_facts.push(state.subject.clone());
    for (index, fact) in all_facts.iter().enumerate() {
        let id = validate_fact(
            fact,
            &ontology,
            &docs,
            &state.engine,
            &state.registry,
            &mut state.capabilities,
            state.ctx,
            &mut state.steps,
            max_steps,
        )?;
        let r = get(fact, "type").ok_or_else(fail)?;
        let type_key = identity(r);
        if index < fact_values.len() && !fact_keys.insert(id.clone()) {
            return Err(fail());
        }
        all_fact_ids.push(id);
        if !state.types.contains_key(&type_key) {
            return Err(fail());
        }
    }
    for fact in &fact_values {
        let key = identity(get(fact, "type").ok_or_else(fail)?);
        state.facts.entry(key).or_default().push(fact.clone());
    }
    let mut known = HashMap::<String, HashMap<String, Option<String>>>::new();
    for (fact_id, fact) in all_fact_ids.iter().zip(&all_facts) {
        let projection = known.entry(fact_id.clone()).or_default();
        for entry in list(get(fact, "fields"), 4096)? {
            let reference = get(entry, "field").ok_or_else(fail)?;
            let field_id = ref_key(reference)?;
            let value = state.literal(reference, get(entry, "value").ok_or_else(fail)?)?;
            if projection
                .get(&field_id)
                .is_some_and(|previous| previous.as_deref() != Some(value.as_str()))
            {
                return Err(fail());
            }
            projection.insert(field_id, Some(value));
        }
        for reference in list(get(fact, "absent"), 4096)? {
            let field_id = ref_key(reference)?;
            if projection.get(&field_id).is_some_and(Option::is_some) {
                return Err(fail());
            }
            projection.insert(field_id, None);
        }
    }
    for coverage in coverage_values {
        members(coverage, &["type", "complete", "fields"])?;
        let ty = get(coverage, "type").ok_or_else(fail)?;
        let key = identity(ty);
        if !state.types.contains_key(&key) || state.coverage.contains_key(&key) {
            return Err(fail());
        }
        let complete = match get(coverage, "complete") {
            Some(Value::Bool(value)) => *value,
            _ => return Err(fail()),
        };
        let binding_value = state.types.get(&key).ok_or_else(fail)?;
        let mut fields = HashSet::new();
        for r in list(get(coverage, "fields"), 4096)? {
            let fkey = ref_key(r)?;
            if !fields.insert(fkey)
                || !array(get(binding_value, "fields"))
                    .iter()
                    .any(|f| get(f, "ref").is_some_and(|x| same_ref(x, r)))
            {
                return Err(fail());
            }
        }
        state.coverage.insert(key, fields);
        if complete {
            state.complete_coverage.insert(identity(ty));
        }
    }
    for item in context_values {
        members(item, &["field", "value"])?;
        let r = get(item, "field").ok_or_else(fail)?;
        let key = ref_key(r)?;
        if state.context.contains_key(&key)
            || !array(get(&ontology, "context"))
                .iter()
                .any(|x| same_ref(x, r))
        {
            return Err(fail());
        }
        state.literal(r, get(item, "value").ok_or_else(fail)?)?;
        state
            .context
            .insert(key, get(item, "value").ok_or_else(fail)?.clone());
    }
    let mut out_refs = HashSet::new();
    for r in outputs {
        if !out_refs.insert(ref_key(r)?) {
            return Err(fail());
        }
    }
    for q in query_uses {
        members(q, &["field", "operator", "originalAction"])?;
        let r = get(q, "field").ok_or_else(fail)?;
        ref_key(r)?;
        let op = text(get(q, "operator")).ok_or_else(fail)?;
        if !["predicate", "order", "group", "join", "aggregate"].contains(&op.as_str()) {
            return Err(fail());
        }
        if let Some(a) = text(get(q, "originalAction")) {
            if !array(get(&ontology, "actions"))
                .iter()
                .any(|v| text(Some(v)).as_deref() == Some(a.as_str()))
            {
                return Err(fail());
            }
        }
    }
    let target_values = if let Some(targets) = get(&request, "targets") {
        list(Some(targets), 256)?.to_vec()
    } else {
        let mut unique = HashMap::new();
        for r in &resources {
            let ty = get(r, "type").ok_or_else(fail)?;
            unique.entry(identity(ty)).or_insert_with(|| ty.clone());
        }
        unique.into_values().collect()
    };
    if target_values.is_empty() {
        return Err(fail());
    }
    let mut target_set = HashSet::new();
    for target in &target_values {
        let key = ref_key(target)?;
        if !target_set.insert(key)
            || !state.types.contains_key(&identity(target))
            || !state.complete(target)
        {
            return Err(fail());
        }
    }
    if resources.iter().any(|r| {
        !target_values
            .iter()
            .any(|t| get(r, "type").is_some_and(|x| same_ref(x, t)))
    }) {
        return Err(fail());
    }
    for target in &target_values {
        let mut query_actions = HashSet::from([action.clone()]);
        let ty = state
            .types
            .get(&identity(target))
            .cloned()
            .ok_or_else(fail)?;
        if outputs.iter().any(|r| {
            !array(get(&ty, "fields"))
                .iter()
                .any(|f| get(f, "ref").is_some_and(|x| same_ref(x, r)))
        }) {
            return Err(fail());
        }
        let rows = resources
            .iter()
            .filter(|r| get(r, "type").is_some_and(|x| same_ref(x, target)))
            .cloned()
            .collect::<Vec<_>>();
        for q in query_uses {
            let r = get(q, "field").ok_or_else(fail)?;
            let classification = array(get(&ty, "fields"))
                .iter()
                .find(|f| get(f, "ref").is_some_and(|x| same_ref(x, r)))
                .ok_or_else(fail)?;
            let operator = text(get(q, "operator")).unwrap_or_default();
            let mode = get(
                get(classification, "queryUse").unwrap_or(&Value::Null),
                &operator,
            )
            .and_then(|v| text(Some(v)))
            .unwrap_or_else(|| {
                if text(get(classification, "protection")).as_deref() == Some("protected") {
                    "prohibited".into()
                } else {
                    "disclosed".into()
                }
            });
            if mode == "prohibited" {
                return Err(fail());
            }
            if mode == "original-authorized" {
                let original = text(get(q, "originalAction"))
                    .filter(|a| !a.is_empty())
                    .ok_or_else(fail)?;
                if original == action
                    || !state.covered(target, r)
                    || rows
                        .iter()
                        .any(|row| field_value(row, r).is_none() && !known_absent(row, r))
                {
                    return Err(fail());
                }
                query_actions.insert(original);
            }
        }
        for action_value in query_actions.clone() {
            for rule in state.scoped_rules(&action_value, target) {
                let expr = get(&rule, "condition").ok_or_else(fail)?.clone();
                state.admit_expression(&expr, target, &rows, &[])?;
            }
        }
    }
    let Some(resource) = resource else {
        // Empty collections still pass scope, completeness, dependency,
        // query and expression admission above. Per-row authorization runs
        // only when a concrete resource exists.
        return Ok(public_access_result("permit", Vec::new()));
    };
    let (decision, evaluated) = state.evaluate_action(&action, &resource)?;
    if decision != "permit" {
        return Ok(public_access_result(&decision, Vec::new()));
    }
    let target = get(&resource, "type").ok_or_else(fail)?;
    let typ = state
        .types
        .get(&identity(target))
        .cloned()
        .ok_or_else(fail)?;
    let mut obligations: HashMap<String, Vec<Value>> = HashMap::new();
    for (rule, truth) in &evaluated {
        if truth == "T" && text(get(rule, "effect")).as_deref() == Some("permit") {
            for d in array(get(rule, "disclosure")) {
                let r = get(d, "field").ok_or_else(fail)?;
                obligations
                    .entry(identity(r))
                    .or_default()
                    .push(get(d, "disposition").cloned().ok_or_else(fail)?);
            }
        }
    }
    for query in query_uses {
        let reference = get(query, "field").ok_or_else(fail)?;
        let classification = array(get(&typ, "fields"))
            .iter()
            .find(|entry| get(entry, "ref").is_some_and(|r| same_ref(r, reference)))
            .ok_or_else(fail)?;
        let operator = text(get(query, "operator")).unwrap_or_default();
        let mode = get(
            get(classification, "queryUse").unwrap_or(&Value::Null),
            &operator,
        )
        .and_then(|value| text(Some(value)))
        .unwrap_or_else(|| {
            if text(get(classification, "protection")).as_deref() == Some("protected") {
                "prohibited".into()
            } else {
                "disclosed".into()
            }
        });
        if mode == "prohibited" {
            return Err(fail());
        }
        if mode == "original-authorized" {
            let original = text(get(query, "originalAction"))
                .filter(|action| !action.is_empty())
                .ok_or_else(fail)?;
            if original == action
                || !state.covered(target, reference)
                || (field_value(&resource, reference).is_none()
                    && !known_absent(&resource, reference))
                || state.evaluate_action(&original, &resource)?.0 != "permit"
            {
                return Err(fail());
            }
            continue;
        }
        let dispositions = obligations
            .get(&identity(reference))
            .cloned()
            .unwrap_or_default();
        if dispositions.is_empty()
            && text(get(classification, "protection")).as_deref() == Some("protected")
        {
            return Err(fail());
        }
        if dispositions
            .iter()
            .any(|value| text(get(value, "kind")).as_deref() == Some("withheld"))
        {
            return Err(fail());
        }
        let transforms = dispositions
            .iter()
            .filter(|value| text(get(value, "kind")).as_deref() == Some("transformed"))
            .collect::<Vec<_>>();
        if let Some(first) = transforms.first() {
            let first_field = get(first, "field").ok_or_else(fail)?;
            let first_value = get(first, "value").ok_or_else(fail)?;
            let signature = (
                text(get(first, "transform")).unwrap_or_default(),
                text(get(first, "version")).unwrap_or_default(),
                identity(first_field),
                state.literal(first_field, first_value)?,
            );
            for transform in transforms.iter().skip(1) {
                let field = get(transform, "field").ok_or_else(fail)?;
                let value = get(transform, "value").ok_or_else(fail)?;
                if signature
                    != (
                        text(get(transform, "transform")).unwrap_or_default(),
                        text(get(transform, "version")).unwrap_or_default(),
                        identity(field),
                        state.literal(field, value)?,
                    )
                {
                    return Ok(public_access_result("conflict", Vec::new()));
                }
            }
        }
        if transforms.is_empty()
            && (!state.covered(target, reference)
                || (field_value(&resource, reference).is_none()
                    && !known_absent(&resource, reference)))
        {
            return Err(fail());
        }
    }
    let mut outputs = Vec::new();
    let requested = list(get(&request, "output"), 4096)?;
    for r in requested {
        let id = identity(r);
        let classification = array(get(&typ, "fields"))
            .iter()
            .find(|f| get(f, "ref").is_some_and(|x| same_ref(x, r)))
            .ok_or_else(fail)?;
        let ds = obligations.get(&id).cloned().unwrap_or_default();
        if ds.is_empty() && text(get(classification, "protection")).as_deref() == Some("protected")
        {
            return Err(fail());
        }
        if ds
            .iter()
            .any(|d| text(get(d, "kind")).as_deref() == Some("withheld"))
        {
            outputs.push(object(vec![
                ("field", r.clone()),
                ("disposition", string("withheld")),
            ]));
            continue;
        }
        let transforms = ds
            .iter()
            .filter(|d| text(get(d, "kind")).as_deref() == Some("transformed"))
            .cloned()
            .collect::<Vec<_>>();
        if !transforms.is_empty() {
            let first = &transforms[0];
            let f = get(first, "field").ok_or_else(fail)?;
            let v = get(first, "value").ok_or_else(fail)?;
            let signature = (
                text(get(first, "transform")).unwrap_or_default(),
                text(get(first, "version")).unwrap_or_default(),
                identity(f),
                state.literal(f, v)?,
            );
            for t in transforms.iter().skip(1) {
                let tf = get(t, "field").ok_or_else(fail)?;
                let tv = get(t, "value").ok_or_else(fail)?;
                if signature
                    != (
                        text(get(t, "transform")).unwrap_or_default(),
                        text(get(t, "version")).unwrap_or_default(),
                        identity(tf),
                        state.literal(tf, tv)?,
                    )
                {
                    return Ok(public_access_result("conflict", Vec::new()));
                }
            }
            outputs.push(object(vec![
                ("field", r.clone()),
                ("disposition", string("transformed")),
                ("outputType", f.clone()),
                ("value", v.clone()),
            ]));
            continue;
        }
        if !state.covered(target, r) {
            return Err(fail());
        }
        if let Some(v) = field_value(&resource, r) {
            outputs.push(object(vec![
                ("field", r.clone()),
                ("disposition", string("original")),
                ("value", v.clone()),
            ]));
        } else if known_absent(&resource, r) {
            outputs.push(object(vec![
                ("field", r.clone()),
                ("disposition", string("absent")),
            ]));
        } else {
            return Err(fail());
        }
    }
    Ok(public_access_result("permit", outputs))
}

fn refusal_result() -> Value {
    public_access_result("indeterminate", Vec::new())
}
pub fn evaluate_security_access(
    policy: &Value,
    resolution: &Value,
    cut: &Value,
    request: &Value,
    resource: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match access_inner(policy, resolution, cut, request, Some(resource), ctx) {
        Ok(value) => Ok(value),
        Err(error) if error.is_control_failure() => Err(error),
        Err(error) if error.code == "SECURITY_MASK_CONFLICT" => {
            Ok(public_access_result("conflict", Vec::new()))
        }
        Err(_) => Ok(refusal_result()),
    }
}
pub fn evaluate_security_collection(
    policy: &Value,
    resolution: &Value,
    cut: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let resources = match get(request, "resources") {
        Some(value) => match list(Some(value), 10000) {
            Ok(resources) => resources,
            Err(error) if error.is_control_failure() => return Err(error),
            Err(_) => {
                return Ok(object(vec![
                    ("status", string("refused")),
                    ("rows", Value::Array(Vec::new())),
                ]))
            }
        },
        None => {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]))
        }
    };
    let max_facts = match get(cut, "maxFacts") {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 10000.0 =>
        {
            *n as usize
        }
        _ => {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]))
        }
    };
    let fact_count = match get(cut, "facts") {
        Some(Value::Array(values)) => values.len(),
        _ => {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]))
        }
    };
    if 1usize
        .saturating_add(fact_count)
        .saturating_add(resources.len())
        > max_facts
    {
        return Ok(object(vec![
            ("status", string("refused")),
            ("rows", Value::Array(Vec::new())),
        ]));
    }
    if resources.is_empty() {
        let Value::Object(fields) = request else {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]));
        };
        let mut copied = fields.clone();
        copied.retain(|(key, _)| key != &Utf16::from("resources"));
        match access_inner(policy, resolution, cut, &Value::Object(copied), None, ctx) {
            Ok(result) if text(get(&result, "decision")).as_deref() == Some("permit") => {}
            Ok(_) => {
                return Ok(object(vec![
                    ("status", string("refused")),
                    ("rows", Value::Array(Vec::new())),
                ]))
            }
            Err(error) if error.is_control_failure() => return Err(error),
            Err(_) => {
                return Ok(object(vec![
                    ("status", string("refused")),
                    ("rows", Value::Array(Vec::new())),
                ]))
            }
        }
        return Ok(object(vec![
            ("status", string("evaluated")),
            ("rows", Value::Array(Vec::new())),
        ]));
    }
    let mut rows = Vec::new();
    for resource in resources {
        let Value::Object(fields) = request else {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]));
        };
        let mut copied = fields.clone();
        copied.retain(|(k, _)| k != &Utf16::from("resources"));
        let single = Value::Object(copied);
        let result = evaluate_security_access(policy, resolution, cut, &single, resource, ctx)?;
        let decision = text(get(&result, "decision")).unwrap_or_default();
        if decision == "indeterminate" || decision == "conflict" {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]));
        }
        if decision == "permit" {
            rows.push(
                get(&result, "output")
                    .cloned()
                    .unwrap_or(Value::Array(Vec::new())),
            );
        }
    }
    Ok(object(vec![
        ("status", string("evaluated")),
        ("rows", Value::Array(rows)),
    ]))
}

/// Internal write-guard helper: reports fields whose values were admitted as
/// original by the read rules. The report is derived from the same native
/// policy evaluator as public reads and is not an authorization credential.
pub fn evaluate_security_original_read(
    policy: &Value,
    resolution: &Value,
    cut: &Value,
    action: &str,
    fields: &[Value],
    resource: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = object(vec![
        ("action", string(action)),
        ("output", Value::Array(fields.to_vec())),
    ]);
    let result = evaluate_security_access(policy, resolution, cut, &request, resource, ctx)?;
    let decision = text(get(&result, "decision")).unwrap_or_default();
    let originals = if decision == "permit" {
        array(get(&result, "output"))
            .iter()
            .filter(|entry| {
                matches!(
                    text(get(entry, "disposition")).as_deref(),
                    Some("original" | "absent")
                )
            })
            .filter_map(|entry| get(entry, "field").cloned())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    Ok(object(vec![
        ("decision", string(&decision)),
        ("originalFields", Value::Array(originals)),
    ]))
}

fn action_in(ontology: &Value, action: &str) -> bool {
    array(get(ontology, "actions"))
        .iter()
        .any(|item| text(Some(item)).as_deref() == Some(action))
}

fn write_decision(decision: &str) -> Value {
    object(vec![("decision", string(decision))])
}

fn fact_inventory(
    facts: &[Value],
    ontology: &Value,
    documents: &[Value],
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<HashMap<String, HashMap<String, String>>, EngineError> {
    if facts.len() > 10000 {
        return Err(fail());
    }
    let mut inventory = HashMap::<String, HashMap<String, String>>::new();
    let mut steps = 0;
    for fact in facts {
        let fact_key = validate_fact(
            fact,
            ontology,
            documents,
            engine,
            registry,
            capabilities,
            ctx,
            &mut steps,
            1_000_000,
        )?;
        let type_key = identity(get(fact, "type").ok_or_else(fail)?);
        let mut projection = Vec::<(String, String)>::new();
        let mut projection_keys = HashSet::new();
        for entry in list(get(fact, "fields"), 4096)? {
            let reference = get(entry, "field").ok_or_else(fail)?;
            let key = ref_key(reference)?;
            let value = scalar_literal(
                reference,
                get(entry, "value").ok_or_else(fail)?,
                documents,
                engine,
                ctx,
            )?;
            if !projection_keys.insert(key.clone()) {
                return Err(fail());
            }
            projection.push((key, value));
        }
        for reference in list(get(fact, "absent"), 4096)? {
            let key = ref_key(reference)?;
            if !projection_keys.insert(key.clone()) {
                return Err(fail());
            }
            projection.push((key, "<absent>".into()));
        }
        projection.sort_unstable_by(|left, right| left.0.cmp(&right.0));
        let rows = inventory.entry(type_key).or_default();
        if rows.insert(fact_key, format!("{projection:?}")).is_some() {
            return Err(fail());
        }
    }
    Ok(inventory)
}

fn context_inventory(
    context: &[Value],
    documents: &[Value],
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<HashMap<String, String>, EngineError> {
    if context.len() > 256 {
        return Err(fail());
    }
    let mut result = HashMap::new();
    for item in context {
        members(item, &["field", "value"])?;
        let reference = get(item, "field").ok_or_else(fail)?;
        let key = ref_key(reference)?;
        let value = scalar_literal(
            reference,
            get(item, "value").ok_or_else(fail)?,
            documents,
            engine,
            ctx,
        )?;
        if result.insert(key, value).is_some() {
            return Err(fail());
        }
    }
    Ok(result)
}

fn write_inner(
    policy_input: &Value,
    resolution_input: &Value,
    profile_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let admitted = crate::security_policy::require_security_interpretation(
        policy_input,
        resolution_input,
        ctx,
    )?;
    let policy = get(&admitted, "source").cloned().ok_or_else(fail)?;
    let resolution = get(&admitted, "resolution").cloned().ok_or_else(fail)?;
    let profile = copy_json(profile_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    members(
        &profile,
        &[
            "readProtection",
            "type",
            "createAction",
            "updateAction",
            "deleteAction",
            "fieldActions",
            "policyAction",
            "policyFields",
            "ownershipAction",
            "ownershipFields",
            "ownershipAssociations",
        ],
    )?;
    members(&request, &["operation", "original", "proposed"])?;
    let ontology = get(&resolution, "ontology").ok_or_else(fail)?;
    let documents = list(get(&resolution, "documents"), 256)?;
    let target = get(&profile, "type").ok_or_else(fail)?;
    let binding = array(get(ontology, "entities"))
        .iter()
        .chain(array(get(ontology, "associations")))
        .find(|entry| get(entry, "type").is_some_and(|r| same_ref(r, target)))
        .ok_or_else(fail)?;
    let fields = array(get(binding, "fields"));
    let object_actions = ["createAction", "updateAction", "deleteAction"]
        .map(|name| {
            text(get(&profile, name))
                .filter(|value| !value.is_empty())
                .ok_or_else(fail)
        })
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    let policy_action = text(get(&profile, "policyAction"))
        .filter(|s| !s.is_empty())
        .ok_or_else(fail)?;
    let ownership_action = text(get(&profile, "ownershipAction"))
        .filter(|s| !s.is_empty())
        .ok_or_else(fail)?;
    let distinct = object_actions.iter().collect::<HashSet<_>>();
    if distinct.len() != 3
        || object_actions.iter().any(|a| !action_in(ontology, a))
        || !action_in(ontology, &policy_action)
        || !action_in(ontology, &ownership_action)
        || object_actions.contains(&policy_action)
        || object_actions.contains(&ownership_action)
        || policy_action == ownership_action
    {
        return Err(fail());
    }
    let field_actions = list(get(&profile, "fieldActions"), 4096)?;
    if field_actions.len() != fields.len() {
        return Err(fail());
    }
    let mut action_by_field = HashMap::<String, String>::new();
    let mut field_action_names = HashSet::new();
    for entry in field_actions {
        members(entry, &["field", "action"])?;
        let reference = get(entry, "field").ok_or_else(fail)?;
        let key = ref_key(reference)?;
        let action = text(get(entry, "action"))
            .filter(|s| !s.is_empty())
            .ok_or_else(fail)?;
        if !fields
            .iter()
            .any(|f| get(f, "ref").is_some_and(|r| same_ref(r, reference)))
            || object_actions.contains(&action)
            || action == ownership_action
            || action == policy_action
            || !action_in(ontology, &action)
            || action_by_field.insert(key, action.clone()).is_some()
        {
            return Err(fail());
        }
        field_action_names.insert(action);
    }
    if field_action_names.len() > 64 {
        return Err(fail());
    }
    let policy_fields = list(get(&profile, "policyFields"), 4096)?;
    let ownership_fields = list(get(&profile, "ownershipFields"), 4096)?;
    let ownership_associations = list(get(&profile, "ownershipAssociations"), 4096)?;
    let unique_refs = |refs: &[Value]| -> Result<HashSet<String>, EngineError> {
        let mut result = HashSet::new();
        for reference in refs {
            if !result.insert(ref_key(reference)?) {
                return Err(fail());
            }
        }
        Ok(result)
    };
    let policy_fields_set = unique_refs(policy_fields)?;
    let ownership_fields_set = unique_refs(ownership_fields)?;
    let ownership_associations_set = unique_refs(ownership_associations)?;
    if policy_fields_set
        .iter()
        .chain(ownership_fields_set.iter())
        .any(|reference| !action_by_field.contains_key(reference))
        || ownership_associations_set.iter().any(|reference| {
            !array(get(ontology, "associations"))
                .iter()
                .any(|entry| get(entry, "type").is_some_and(|r| identity(r) == *reference))
        })
    {
        return Err(fail());
    }
    let read_protection = get(&profile, "readProtection").ok_or_else(fail)?;
    members(
        read_protection,
        &["version", "readAction", "blindWriteActions"],
    )?;
    if text(get(read_protection, "version")).as_deref() != Some("umf.security.write-read/0.1.0") {
        return Err(fail());
    }
    let read_action = text(get(read_protection, "readAction"))
        .filter(|s| !s.is_empty())
        .ok_or_else(fail)?;
    if !action_in(ontology, &read_action) {
        return Err(fail());
    }
    let blind_actions = list(get(read_protection, "blindWriteActions"), 4096)?;
    let mut blind_by_field = HashMap::<String, String>::new();
    let mut ordinary = HashSet::from([
        read_action.clone(),
        policy_action.clone(),
        ownership_action.clone(),
    ]);
    ordinary.extend(object_actions.iter().cloned());
    ordinary.extend(field_action_names.iter().cloned());
    for entry in blind_actions {
        members(entry, &["field", "action"])?;
        let reference = get(entry, "field").ok_or_else(fail)?;
        let field_id = ref_key(reference)?;
        let action = text(get(entry, "action"))
            .filter(|s| !s.is_empty())
            .ok_or_else(fail)?;
        if !action_by_field.contains_key(&field_id)
            || !action_in(ontology, &action)
            || ordinary.contains(&action)
            || blind_by_field.insert(field_id, action).is_some()
        {
            return Err(fail());
        }
    }
    let dependencies =
        crate::security_policy::security_policy_dependencies(&policy, &resolution, ctx)?;
    if array(get(&dependencies, "fields")).iter().any(|field| {
        let key = identity(field);
        action_by_field.contains_key(&key) && !policy_fields_set.contains(&key)
    }) {
        return Err(fail());
    }
    let operation = text(get(&request, "operation")).ok_or_else(fail)?;
    let states = match operation.as_str() {
        "create" if get(&request, "original").is_none() => {
            vec![get(&request, "proposed").cloned().ok_or_else(fail)?]
        }
        "delete" if get(&request, "proposed").is_none() => {
            vec![get(&request, "original").cloned().ok_or_else(fail)?]
        }
        "update" => vec![
            get(&request, "original").cloned().ok_or_else(fail)?,
            get(&request, "proposed").cloned().ok_or_else(fail)?,
        ],
        _ => return Err(fail()),
    };
    for state in &states {
        members(state, &["resource", "cut"])?;
        let resource = get(state, "resource").ok_or_else(fail)?;
        let cut = get(state, "cut").ok_or_else(fail)?;
        if !get(resource, "type")
            .is_some_and(|r| same_ref(r, get(binding, "type").unwrap_or(&Value::Null)))
        {
            return Err(fail());
        }
        let max_steps = get(cut, "maxSteps");
        if !matches!(max_steps, Some(Value::Number(n)) if n.is_finite() && n.fract()==0.0 && *n>=1.0 && *n<=1_000_000.0)
        {
            return Err(fail());
        }
        let coverage_entry = array(get(cut, "coverage"))
            .iter()
            .find(|entry| get(entry, "type").is_some_and(|r| same_ref(r, target)))
            .ok_or_else(fail)?;
        if get(coverage_entry, "complete") != Some(&Value::Bool(true)) {
            return Err(fail());
        }
        for field in fields {
            let reference = get(field, "ref").ok_or_else(fail)?;
            if !array(get(coverage_entry, "fields"))
                .iter()
                .any(|r| same_ref(r, reference))
                || (!array(get(resource, "fields"))
                    .iter()
                    .any(|entry| get(entry, "field").is_some_and(|r| same_ref(r, reference)))
                    && !array(get(resource, "absent"))
                        .iter()
                        .any(|r| same_ref(r, reference)))
            {
                return Err(fail());
            }
        }
    }
    let engine = core_engine()?;
    let registry = Registry::new();
    let mut capabilities = NoExtensions;
    let docs = documents.to_vec();
    let mut parsed_states = Vec::new();
    for state in &states {
        let resource = get(state, "resource").cloned().ok_or_else(fail)?;
        let cut = get(state, "cut").cloned().ok_or_else(fail)?;
        let decision = evaluate_security_access(
            &policy,
            &resolution,
            &cut,
            &object(vec![
                ("action", string(&policy_action)),
                ("output", Value::Array(Vec::new())),
            ]),
            &resource,
            ctx,
        )?;
        if text(get(&decision, "decision")).as_deref() == Some("indeterminate") {
            return Ok(write_decision("indeterminate"));
        }
        let facts = list(get(&cut, "facts"), 10000)?.to_vec();
        let subjects = list(get(&cut, "subjects"), 1)?.to_vec();
        if subjects.len() != 1 {
            return Err(fail());
        }
        let inventory = fact_inventory(
            &facts,
            ontology,
            &docs,
            &engine,
            &registry,
            &mut capabilities,
            ctx,
        )?;
        let subject_inventory = fact_inventory(
            &subjects,
            ontology,
            &docs,
            &engine,
            &registry,
            &mut capabilities,
            ctx,
        )?;
        let context_values =
            context_inventory(list(get(&cut, "context"), 256)?, &docs, &engine, ctx)?;
        parsed_states.push((resource, cut, inventory, subject_inventory, context_values));
    }
    if parsed_states.len() == 2 {
        let first_cut = &parsed_states[0].1;
        let second_cut = &parsed_states[1].1;
        for pin in [
            "generation",
            "expectedGeneration",
            "policyId",
            "policyRevision",
            "ontologyDocumentId",
            "ontologyRevision",
        ] {
            if get(first_cut, pin) != get(second_cut, pin) {
                return Err(fail());
            }
        }
        if parsed_states[0].2 != parsed_states[1].2
            || parsed_states[0].3 != parsed_states[1].3
            || parsed_states[0].4 != parsed_states[1].4
        {
            return Err(fail());
        }
    }
    let mut changed = HashSet::<String>::new();
    for field in fields {
        let reference = get(field, "ref").ok_or_else(fail)?;
        let values = parsed_states
            .iter()
            .map(|(resource, _, _, _, _)| {
                if let Some(entry) = array(get(resource, "fields"))
                    .iter()
                    .find(|entry| get(entry, "field").is_some_and(|r| same_ref(r, reference)))
                {
                    scalar_literal(
                        reference,
                        get(entry, "value").ok_or_else(fail)?,
                        &docs,
                        &engine,
                        ctx,
                    )
                } else {
                    Ok("<absent>".into())
                }
            })
            .collect::<Result<Vec<_>, _>>()?;
        if values.len() == 1 || values[0] != values[1] {
            changed.insert(ref_key(reference)?);
        }
    }
    let mut ownership_changed = ownership_fields_set.iter().any(|r| changed.contains(r));
    let mut policy_association_changed = false;
    if parsed_states.len() == 2 {
        let before = &parsed_states[0].2;
        let after = &parsed_states[1].2;
        let changed_types = before
            .keys()
            .chain(after.keys())
            .cloned()
            .collect::<HashSet<_>>();
        for key in changed_types {
            if before.get(&key) == after.get(&key) {
                continue;
            }
            if !ownership_associations_set.contains(&key) {
                return Err(fail());
            }
            let type_ref = array(get(ontology, "associations"))
                .iter()
                .find_map(|entry| get(entry, "type").filter(|reference| identity(reference) == key))
                .ok_or_else(fail)?;
            ownership_changed = true;
            if array(get(&dependencies, "associations"))
                .iter()
                .any(|reference| same_ref(reference, type_ref))
            {
                policy_association_changed = true;
            }
        }
    } else if !ownership_associations_set.is_empty() {
        ownership_changed = true;
        policy_association_changed = ownership_associations_set.iter().any(|key| {
            array(get(&dependencies, "associations"))
                .iter()
                .any(|r| identity(r) == *key)
        });
    }
    let object_action = match operation.as_str() {
        "create" => &object_actions[0],
        "update" => &object_actions[1],
        "delete" => &object_actions[2],
        _ => return Err(fail()),
    };
    let mut checks = vec![object_action.clone()];
    for changed_field in &changed {
        checks.push(
            action_by_field
                .get(changed_field)
                .cloned()
                .ok_or_else(fail)?,
        );
    }
    if ownership_changed {
        checks.push(ownership_action.clone());
    }
    let policy_type_changed = operation != "update"
        && array(get(&dependencies, "associations"))
            .iter()
            .any(|r| same_ref(r, target));
    if policy_association_changed
        || changed.iter().any(|r| policy_fields_set.contains(r))
        || policy_type_changed
    {
        checks.push(policy_action.clone());
    }
    let mut seen = HashSet::new();
    checks.retain(|action| seen.insert(action.clone()));
    let mut selected_blind = HashMap::<String, String>::new();
    for changed_field in &changed {
        if let Some(action) = blind_by_field.get(changed_field) {
            selected_blind.insert(action.clone(), action.clone());
        }
    }
    let mut decisions = Vec::new();
    for (resource, cut, _, _, _) in &parsed_states {
        let max_steps = match get(cut, "maxSteps") {
            Some(Value::Number(n)) if n.is_finite() && n.fract() == 0.0 => *n as usize,
            _ => return Err(fail()),
        };
        let reserved = parsed_states
            .len()
            .saturating_mul(checks.len() + selected_blind.len() + 1);
        let bounded_steps = max_steps / reserved.max(1);
        if bounded_steps == 0 {
            return Err(fail());
        }
        let bounded_cut = if let Value::Object(entries) = cut {
            let mut entries = entries.clone();
            if let Some((_, value)) = entries
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("maxSteps"))
            {
                *value = Value::Number(bounded_steps as f64);
            }
            Value::Object(entries)
        } else {
            return Err(fail());
        };
        let mut blind_decisions = HashMap::new();
        for action in selected_blind.keys() {
            let result = evaluate_security_access(
                &policy,
                &resolution,
                &bounded_cut,
                &object(vec![
                    ("action", string(action)),
                    ("output", Value::Array(Vec::new())),
                ]),
                resource,
                ctx,
            )?;
            blind_decisions.insert(
                action.clone(),
                text(get(&result, "decision")).unwrap_or_default(),
            );
        }
        for action in &checks {
            let result = evaluate_security_access(
                &policy,
                &resolution,
                &bounded_cut,
                &object(vec![
                    ("action", string(action)),
                    ("output", Value::Array(Vec::new())),
                ]),
                resource,
                ctx,
            )?;
            decisions.push(text(get(&result, "decision")).unwrap_or_default());
        }
        let needs_read = changed
            .iter()
            .filter(|field_id| {
                blind_by_field
                    .get(*field_id)
                    .and_then(|action| blind_decisions.get(action))
                    .is_none_or(|decision| decision != "permit")
            })
            .cloned()
            .collect::<Vec<_>>();
        if !needs_read.is_empty() {
            let read_fields = needs_read
                .iter()
                .filter_map(|wanted| {
                    fields
                        .iter()
                        .find(|f| get(f, "ref").is_some_and(|r| identity(r) == *wanted))
                        .and_then(|f| get(f, "ref").cloned())
                })
                .collect::<Vec<_>>();
            let read = evaluate_security_original_read(
                &policy,
                &resolution,
                &bounded_cut,
                &read_action,
                &read_fields,
                resource,
                ctx,
            )?;
            for field_id in needs_read {
                let admitted = text(get(&read, "decision")).as_deref() == Some("permit")
                    && array(get(&read, "originalFields"))
                        .iter()
                        .any(|reference| identity(reference) == field_id);
                if admitted {
                    decisions.push("permit".into());
                } else {
                    let alternative = blind_by_field
                        .get(&field_id)
                        .and_then(|action| blind_decisions.get(action))
                        .map(String::as_str)
                        .unwrap_or("deny");
                    decisions.push(if ["indeterminate", "conflict"].contains(&alternative) {
                        "indeterminate".into()
                    } else if ["indeterminate", "conflict"]
                        .contains(&text(get(&read, "decision")).unwrap_or_default().as_str())
                    {
                        "indeterminate".into()
                    } else {
                        "deny".into()
                    });
                }
            }
        }
    }
    if decisions
        .iter()
        .any(|decision| decision == "indeterminate" || decision == "conflict")
    {
        Ok(write_decision("indeterminate"))
    } else if decisions.iter().all(|decision| decision == "permit") {
        Ok(write_decision("permit"))
    } else {
        Ok(write_decision("deny"))
    }
}

pub fn evaluate_security_write(
    policy: &Value,
    resolution: &Value,
    profile: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match write_inner(policy, resolution, profile, request, ctx) {
        Ok(value) => Ok(value),
        Err(error) if error.is_control_failure() => Err(error),
        Err(_) => Ok(write_decision("indeterminate")),
    }
}

fn legacy_access_report(source: Value, result: Value, diagnostics: Vec<Value>) -> Value {
    object(vec![
        ("source", source),
        ("subset", string("legacy-body-0.1")),
        ("authority", Value::Bool(false)),
        ("result", result),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}
fn indeterminate_access() -> Value {
    public_access_result("indeterminate", Vec::new())
}
pub fn evaluate_security_policy_v2_legacy_access(
    input: &Value,
    resolution: &Value,
    cut: &Value,
    request: &Value,
    resource: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = crate::security_policy_source::inspect_security_policy_v2(input, ctx)?;
    let source = get(&inspected, "source").cloned().unwrap_or(Value::Null);
    let diagnostics = array(get(&inspected, "diagnostics"))
        .iter()
        .filter(|d| text(get(d, "code")).as_deref() != Some("SECURITY_V2_UNIMPLEMENTED"))
        .cloned()
        .collect::<Vec<_>>();
    if get(&inspected, "valid") != Some(&Value::Bool(true)) || !diagnostics.is_empty() {
        return Ok(legacy_access_report(
            source,
            indeterminate_access(),
            diagnostics,
        ));
    }
    if let Value::Object(fields) = &source {
        if fields
            .iter()
            .any(|(key, _)| key == &Utf16::from("protection"))
        {
            let mut ds = diagnostics;
            ds.push(object(vec![
                ("code", string("SECURITY_V2_LEGACY_SUBSET")),
                ("path", string("/protection")),
                ("severity", string("error")),
                (
                    "message",
                    string("Protection pin requires separate domain/function interpretation"),
                ),
            ]));
            return Ok(legacy_access_report(source, indeterminate_access(), ds));
        }
    }
    let mut view = copy_json(&source, ctx)?;
    let Value::Object(fields) = &mut view else {
        return Ok(legacy_access_report(
            source,
            indeterminate_access(),
            diagnostics,
        ));
    };
    if let Some((_, version)) = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("version"))
    {
        *version = string("0.1.0");
    }
    let legacy = crate::security_policy::inspect_security_policy(&view, Some(resolution), ctx)?;
    let mut ds = diagnostics;
    ds.extend(array(get(&legacy, "diagnostics")).iter().cloned());
    if get(&legacy, "valid") != Some(&Value::Bool(true))
        || get(&legacy, "complete") != Some(&Value::Bool(true))
    {
        return Ok(legacy_access_report(source, indeterminate_access(), ds));
    }
    let result = evaluate_security_access(&view, resolution, cut, request, resource, ctx)?;
    Ok(legacy_access_report(source, result, ds))
}
