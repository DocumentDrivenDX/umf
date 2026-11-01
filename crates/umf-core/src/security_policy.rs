// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned validation and dependency analysis for the 0.1 security policy.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, SemanticContext},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::{cmp::Ordering, sync::OnceLock};

const CORE_VERSION: &str = "0.10.0";
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
        Some(Value::Array(v)) => v,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(v)) => v.to_utf8().ok(),
        _ => None,
    }
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(items.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn policy_schema() -> Result<CompiledSchema, EngineError> {
    static SCHEMA: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    SCHEMA
        .get_or_init(|| {
            let mut ctx = Context::ordinary();
            let package = parse(
                include_str!("../../../spec/extensions/security/package.json"),
                &mut ctx,
            )?;
            let schema = get(&package, "schema").ok_or_else(|| {
                EngineError::new("SECURITY_SCHEMA", Utf16::default(), "Policy schema missing")
            })?;
            CompiledSchema::compile_consumer(schema, &SchemaResources::default(), false, &mut ctx)
        })
        .clone()
}
fn ontology_schema() -> Result<CompiledSchema, EngineError> {
    static SCHEMA: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    SCHEMA
        .get_or_init(|| {
            let mut ctx = Context::ordinary();
            let schema = parse(
                include_str!("../../../spec/extensions/security/ontology.schema.json"),
                &mut ctx,
            )?;
            CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), false, &mut ctx)
        })
        .clone()
}
fn diag(code: &str, path: &str, message: &str, severity: &str) -> Value {
    object(vec![
        ("code", string(code)),
        ("path", string(path)),
        ("message", string(message)),
        ("severity", string(severity)),
    ])
}
fn diag_u16(code: &str, path: Utf16, message: &str, severity: &str) -> Value {
    object(vec![
        ("code", string(code)),
        ("path", Value::String(path)),
        ("message", string(message)),
        ("severity", string(severity)),
    ])
}
fn pointer(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut out = path.units().to_vec();
    out.push(b'/' as u16);
    for u in segment.units() {
        match *u {
            0x7e => out.extend_from_slice(&[0x7e, b'0' as u16]),
            0x2f => out.extend_from_slice(&[0x7e, b'1' as u16]),
            v => out.push(v),
        }
    }
    Utf16::new(out)
}
fn pointer_text(path: &str, segment: &str) -> String {
    format!("{path}/{}", segment.replace('~', "~0").replace('/', "~1"))
}
fn has_errors(ds: &[Value]) -> bool {
    ds.iter()
        .any(|d| text(get(d, "severity")).as_deref() == Some("error"))
}
fn result(source: Value, resolution: Option<Value>, diagnostics: Vec<Value>) -> Value {
    let valid = !has_errors(&diagnostics);
    let complete = diagnostics.is_empty();
    let mut fields = vec![
        ("source", source),
        ("valid", Value::Bool(valid)),
        ("complete", Value::Bool(complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if let Some(r) = resolution {
        fields.push(("resolution", r));
    }
    object(fields)
}
fn schema_diagnostics(
    schema: &CompiledSchema,
    value: &Value,
    prefix: &str,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    Ok(schema
        .validate(value, ctx)?
        .into_iter()
        .map(|e| {
            let mut units = prefix.encode_utf16().collect::<Vec<_>>();
            units.extend_from_slice(e.instance_path.units());
            diag_u16(
                code,
                Utf16::new(units),
                &e.message
                    .to_utf8()
                    .unwrap_or_else(|_| "Invalid value".into()),
                "error",
            )
        })
        .collect())
}
fn unknown(value: &Value, known: &[&str], path: &str, out: &mut Vec<Value>) {
    if let Value::Object(fields) = value {
        for (key, _) in fields {
            if known.iter().any(|name| key == &Utf16::from(*name)) {
                continue;
            }
            out.push(diag_u16(
                "SECURITY_UNKNOWN",
                pointer(&Utf16::from(path), key),
                "Uninterpreted security member retained",
                "warning",
            ));
        }
    }
}
#[derive(Clone, Eq, PartialEq, Ord, PartialOrd, Debug)]
struct RefKey(Utf16, Utf16, Utf16);
fn ref_key(value: &Value) -> Option<RefKey> {
    Some(RefKey(
        Utf16::from(text(get(value, "documentId"))?),
        Utf16::from(text(get(value, "moduleId"))?),
        Utf16::from(text(get(value, "elementId"))?),
    ))
}
fn ref_value(value: &RefKey) -> Value {
    object(vec![
        ("documentId", Value::String(value.0.clone())),
        ("moduleId", Value::String(value.1.clone())),
        ("elementId", Value::String(value.2.clone())),
    ])
}
fn compare_value(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return false;
            }
            let mut x = x.iter().collect::<Vec<_>>();
            let mut y = y.iter().collect::<Vec<_>>();
            x.sort_by(|a, b| a.0.cmp(&b.0));
            y.sort_by(|a, b| a.0.cmp(&b.0));
            x.iter()
                .zip(y.iter())
                .all(|((kx, vx), (ky, vy))| kx == ky && compare_value(vx, vy))
        }
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(x, y)| compare_value(x, y))
        }
        _ => a == b,
    }
}
fn duplicates<T: Ord + Clone>(values: impl IntoIterator<Item = T>) -> bool {
    let mut seen = std::collections::BTreeSet::new();
    values.into_iter().any(|v| !seen.insert(v))
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

fn same_ref(a: &Value, b: &Value) -> bool {
    ref_key(a).is_some() && ref_key(a) == ref_key(b)
}
fn locate<'a>(reference: &Value, documents: &'a [Value]) -> Option<&'a Value> {
    let RefKey(doc, module, element) = ref_key(reference)?;
    for entry in documents {
        let document = get(entry, "document")?;
        if get(document, "id") != Some(&Value::String(doc.clone())) {
            continue;
        }
        for m in array(get(document, "modules")) {
            if get(m, "id") != Some(&Value::String(module.clone())) {
                continue;
            }
            for e in array(get(m, "elements")) {
                if get(e, "id") == Some(&Value::String(element.clone())) {
                    return Some(e);
                }
            }
        }
    }
    None
}
fn locate_checked<'a>(
    reference: &Value,
    documents: &'a [Value],
    path: &str,
    ds: &mut Vec<Value>,
) -> Option<&'a Value> {
    let value = locate(reference, documents);
    if value.is_none() {
        ds.push(diag(
            "SECURITY_REFERENCE",
            path,
            "Qualified definition does not resolve",
            "error",
        ));
    }
    value
}
fn document_field_path(reference: &Value, documents: &[Value]) -> Option<(Utf16, Utf16)> {
    let RefKey(document_id, module_id, element_id) = ref_key(reference)?;
    for entry in documents {
        let document = get(entry, "document")?;
        if get(document, "id") != Some(&Value::String(document_id.clone())) {
            continue;
        }
        for (module_index, module) in array(get(document, "modules")).iter().enumerate() {
            if get(module, "id") != Some(&Value::String(module_id.clone())) {
                continue;
            }
            for (element_index, element) in array(get(module, "elements")).iter().enumerate() {
                if get(element, "id") == Some(&Value::String(element_id.clone())) {
                    return Some((
                        document_id,
                        Utf16::from(format!("/modules/{module_index}/elements/{element_index}")),
                    ));
                }
            }
        }
    }
    None
}
fn warn_unqualified_field(
    reference: &Value,
    field: Option<&Value>,
    documents: &[Value],
    warnings: &[(Utf16, Utf16)],
    path: &str,
    ds: &mut Vec<Value>,
) {
    if text(field.and_then(|value| get(value, "kind"))).as_deref() != Some("field") {
        return;
    }
    let Some((document_id, element_path)) = document_field_path(reference, documents) else {
        return;
    };
    let mut prefix = element_path.units().to_vec();
    prefix.push(b'/' as u16);
    let extensions = [
        b'/' as u16,
        b'e' as u16,
        b'x' as u16,
        b't' as u16,
        b'e' as u16,
        b'n' as u16,
        b's' as u16,
        b'i' as u16,
        b'o' as u16,
        b'n' as u16,
        b's' as u16,
        b'/' as u16,
    ];
    if warnings.iter().any(|(doc, warning)| {
        doc == &document_id
            && warning.units().starts_with(&prefix)
            && !warning
                .units()
                .starts_with(&[element_path.units(), &extensions].concat())
    }) {
        ds.push(diag(
            "SECURITY_UNKNOWN",
            path,
            "Field has an unqualified core domain meaning",
            "warning",
        ));
    }
}
fn key_fields(entity: &Value, documents: &[Value]) -> Vec<Value> {
    let Some(record) = locate(get(entity, "type").unwrap_or(&Value::Null), documents) else {
        return Vec::new();
    };
    let key_id = get(entity, "keyId");
    let key = array(get(record, "keys"))
        .iter()
        .find(|key| get(key, "id") == key_id);
    let Some(fields) = key.and_then(|key| get(key, "fields")) else {
        return Vec::new();
    };
    let doc = text(get(
        get(entity, "type").unwrap_or(&Value::Null),
        "documentId",
    ))
    .unwrap_or_default();
    array(Some(fields))
        .iter()
        .filter_map(|field| {
            Some(object(vec![
                ("documentId", string(&doc)),
                ("moduleId", get(field, "module")?.clone()),
                ("elementId", get(field, "element")?.clone()),
            ]))
        })
        .collect()
}
fn fields_of(binding: &Value) -> &[Value] {
    array(get(binding, "fields"))
}
fn domain(field: Option<&Value>, path: &str, ds: &mut Vec<Value>) -> Option<Value> {
    let Some(field) = field else { return None };
    let scalar = text(get(field, "scalarType"));
    if text(get(field, "kind")).as_deref() != Some("field")
        || !matches!(
            scalar.as_deref(),
            Some("boolean" | "string" | "integer" | "decimal" | "binary")
        )
        || text(get(field, "cardinality")).as_deref() != Some("one")
        || array(get(field, "references"))
            .iter()
            .any(|r| text(get(r, "role")).as_deref() == Some("record-type"))
    {
        ds.push(diag(
            "SECURITY_DOMAIN",
            path,
            "Only exact scalar singleton domains are interpreted",
            "error",
        ));
        return None;
    }
    unknown(
        field,
        &[
            "id",
            "kind",
            "name",
            "description",
            "extensions",
            "scalarType",
            "nullability",
            "cardinality",
            "facets",
            "references",
            "title",
            "aliases",
            "examples",
            "allowedValues",
            "default",
        ],
        path,
        ds,
    );
    let facets = get(field, "facets")
        .cloned()
        .unwrap_or_else(|| object(Vec::new()));
    unknown(
        &facets,
        &[
            "length",
            "precision",
            "scale",
            "integerWidth",
            "range",
            "collectionSize",
        ],
        &format!("{path}/facets"),
        ds,
    );
    for (group, known) in [
        ("length", &["min", "max", "unit"][..]),
        ("integerWidth", &["bits", "signed"][..]),
        ("range", &["min", "max", "minInclusive", "maxInclusive"][..]),
        ("collectionSize", &["min", "max"][..]),
    ] {
        if let Some(v) = get(&facets, group) {
            unknown(v, known, &format!("{path}/facets/{group}"), ds);
        }
    }
    if scalar.as_deref() == Some("decimal") {
        for name in ["precision", "scale"] {
            if !matches!(get(&facets,name),Some(Value::Number(n)) if n.is_finite()&&n.fract()==0.0&&n.abs()<=9_007_199_254_740_991.0)
            {
                ds.push(diag(
                    "SECURITY_DOMAIN",
                    path,
                    "Decimal equality requires explicit precision/scale",
                    "error",
                ));
                return None;
            }
        }
    }
    Some(object(vec![
        (
            "scalarType",
            get(field, "scalarType").cloned().unwrap_or(Value::Null),
        ),
        (
            "cardinality",
            get(field, "cardinality").cloned().unwrap_or(Value::Null),
        ),
        (
            "nullability",
            get(field, "nullability").cloned().unwrap_or(Value::Null),
        ),
        ("facets", facets),
        (
            "allowedValues",
            get(field, "allowedValues").cloned().unwrap_or(Value::Null),
        ),
    ]))
}
fn domain_ref(
    reference: &Value,
    documents: &[Value],
    warnings: &[(Utf16, Utf16)],
    path: &str,
    ds: &mut Vec<Value>,
) -> Option<Value> {
    let field = locate_checked(reference, documents, path, ds);
    warn_unqualified_field(reference, field, documents, warnings, path, ds);
    domain(field, path, ds)
}
fn diag_document(d: &Diagnostic, prefix: &str) -> Value {
    let mut units = prefix.encode_utf16().collect::<Vec<_>>();
    units.extend_from_slice(d.path.units());
    diag_u16(
        &d.code
            .to_utf8()
            .unwrap_or_else(|_| "SECURITY_DOCUMENT".into()),
        Utf16::new(units),
        &d.message
            .to_utf8()
            .unwrap_or_else(|_| "Document validation failed".into()),
        if d.severity == Severity::Error {
            "error"
        } else {
            "warning"
        },
    )
}
fn identity_type(binding: &Value) -> Option<Value> {
    Some(object(vec![
        ("identity", get(binding, "type")?.clone()),
        ("keyId", get(binding, "keyId")?.clone()),
    ]))
}
fn term_type(
    term: &Value,
    target: &Value,
    vars: &[(Utf16, Value)],
    subject: &Value,
    ontology: &Value,
    documents: &[Value],
    document_warnings: &[(Utf16, Utf16)],
    engine: &Engine,
    ctx: &mut Context<'_>,
    ds: &mut Vec<Value>,
    path: &str,
) -> Result<Option<Value>, EngineError> {
    let kind = text(get(term, "kind")).unwrap_or_default();
    let known = match kind.as_str() {
        "constant" => &["kind", "field", "value"][..],
        "context" | "subject" | "resource" => &["kind", "identity", "field"][..],
        "variable" => &["kind", "name", "identity", "endpoint", "field"][..],
        _ => &["kind"][..],
    };
    unknown(term, known, path, ds);
    if let Some(reference) = get(term, "field") {
        unknown(
            reference,
            &["documentId", "moduleId", "elementId"],
            &format!("{path}/field"),
            ds,
        );
    }
    let binding = match kind.as_str() {
        "subject" => find_binding(subject, ontology),
        "resource" => Some(target),
        "variable" => vars
            .iter()
            .rev()
            .find(|(name, _)| {
                Some(name)
                    == get(term, "name").and_then(|v| {
                        if let Value::String(x) = v {
                            Some(x)
                        } else {
                            None
                        }
                    })
            })
            .map(|(_, b)| b),
        _ => None,
    };
    if kind == "variable" && binding.is_none() {
        ds.push(diag(
            "SECURITY_VARIABLE",
            path,
            "Variable is not bound",
            "error",
        ));
    }
    if get(term, "identity") == Some(&Value::Bool(true)) {
        return Ok(binding.and_then(identity_type));
    }
    if let Some(endpoint) = text(get(term, "endpoint")) {
        let selected = binding.and_then(|b| {
            array(get(b, "endpoints"))
                .iter()
                .find(|e| text(get(e, "role")).as_deref() == Some(endpoint.as_str()))
        });
        let target_ref = selected.and_then(|e| get(e, "target"));
        let target_binding = target_ref.and_then(|r| find_binding(r, ontology));
        if target_binding.is_none() {
            ds.push(diag(
                "SECURITY_ENDPOINT",
                path,
                "Declared endpoint role does not resolve",
                "error",
            ));
        }
        return Ok(target_binding.and_then(identity_type));
    }
    let field_ref = get(term, "field").unwrap_or(&Value::Null);
    let field = locate_checked(field_ref, documents, &format!("{path}/field"), ds);
    let allowed = match kind.as_str() {
        "context" => array(get(ontology, "context"))
            .iter()
            .any(|r| same_ref(r, field_ref)),
        "constant" => true,
        _ => binding.is_some_and(|b| {
            fields_of(b)
                .iter()
                .any(|f| get(f, "ref").is_some_and(|r| same_ref(r, field_ref)))
        }),
    };
    if !allowed {
        ds.push(diag(
            "SECURITY_FIELD",
            path,
            "Field is not declared on the selected binding",
            "error",
        ));
    }
    warn_unqualified_field(
        field_ref,
        field,
        documents,
        document_warnings,
        &format!("{path}/field"),
        ds,
    );
    let type_value = domain(field, &format!("{path}/field"), ds);
    if kind == "constant" {
        if let (Some(field), Some(doc)) = (
            field,
            documents.iter().find(|d| {
                get(get(d, "document").unwrap_or(&Value::Null), "id")
                    == get(field_ref, "documentId")
            }),
        ) {
            if let (Some(document), Some(value)) = (get(doc, "document"), get(term, "value")) {
                if let Err(error) = engine.check_schema_literal_public(document, field, value, ctx)
                {
                    if error.is_control_failure() {
                        return Err(error);
                    }
                    ds.push(diag(
                        "SECURITY_CONSTANT",
                        path,
                        "Constant violates its exact declared domain",
                        "error",
                    ));
                }
            }
        }
    }
    Ok(type_value)
}
fn find_binding<'a>(reference: &Value, ontology: &'a Value) -> Option<&'a Value> {
    array(get(ontology, "entities"))
        .iter()
        .chain(array(get(ontology, "associations")))
        .find(|binding| get(binding, "type").is_some_and(|r| same_ref(r, reference)))
}
fn typed_expression(
    expr: &Value,
    target: &Value,
    vars: &[(Utf16, Value)],
    subject: &Value,
    ontology: &Value,
    documents: &[Value],
    document_warnings: &[(Utf16, Utf16)],
    engine: &Engine,
    ctx: &mut Context<'_>,
    ds: &mut Vec<Value>,
    path: &str,
    depth: usize,
    nodes: &mut usize,
) -> Result<(), EngineError> {
    *nodes += 1;
    if *nodes > 4096 || depth > 16 {
        ds.push(diag(
            "SECURITY_BOUND",
            path,
            "Expression depth/node bound exceeded",
            "error",
        ));
        return Ok(());
    }
    match text(get(expr, "op")).as_deref() {
        Some("literal") => unknown(expr, &["op", "value"], path, ds),
        Some("eq") => {
            unknown(expr, &["op", "left", "right"], path, ds);
            let left = term_type(
                get(expr, "left").unwrap_or(&Value::Null),
                target,
                vars,
                subject,
                ontology,
                documents,
                document_warnings,
                engine,
                ctx,
                ds,
                &pointer_text(path, "left"),
            )?;
            let right = term_type(
                get(expr, "right").unwrap_or(&Value::Null),
                target,
                vars,
                subject,
                ontology,
                documents,
                document_warnings,
                engine,
                ctx,
                ds,
                &pointer_text(path, "right"),
            )?;
            if left
                .as_ref()
                .zip(right.as_ref())
                .is_some_and(|(a, b)| !compare_value(a, b))
            {
                ds.push(diag(
                    "SECURITY_OPERANDS",
                    path,
                    "Equality operands have different declared types",
                    "error",
                ));
            }
        }
        Some("and") | Some("or") => {
            unknown(expr, &["op", "args"], path, ds);
            for (i, e) in array(get(expr, "args")).iter().enumerate() {
                typed_expression(
                    e,
                    target,
                    vars,
                    subject,
                    ontology,
                    documents,
                    document_warnings,
                    engine,
                    ctx,
                    ds,
                    &pointer_text(path, &i.to_string()),
                    depth + 1,
                    nodes,
                )?;
            }
        }
        Some("not") => {
            unknown(expr, &["op", "arg"], path, ds);
            if let Some(e) = get(expr, "arg") {
                typed_expression(
                    e,
                    target,
                    vars,
                    subject,
                    ontology,
                    documents,
                    document_warnings,
                    engine,
                    ctx,
                    ds,
                    &pointer_text(path, "arg"),
                    depth + 1,
                    nodes,
                )?;
            }
        }
        Some("exists") => {
            unknown(expr, &["op", "association", "as", "where"], path, ds);
            let assoc = get(expr, "association").and_then(|r| {
                array(get(ontology, "associations"))
                    .iter()
                    .find(|a| get(a, "type").is_some_and(|t| same_ref(t, r)))
            });
            let Some(assoc) = assoc else {
                ds.push(diag(
                    "SECURITY_ASSOCIATION",
                    path,
                    "Exists requires a declared association",
                    "error",
                ));
                return Ok(());
            };
            let name = text(get(expr, "as")).unwrap_or_default();
            let name = Utf16::from(name);
            if vars.iter().any(|(n, _)| n == &name) {
                ds.push(diag(
                    "SECURITY_VARIABLE",
                    path,
                    "Exists variable must be fresh",
                    "error",
                ));
                return Ok(());
            }
            let mut nested = vars.to_vec();
            nested.push((name, assoc.clone()));
            if let Some(where_expr) = get(expr, "where") {
                typed_expression(
                    where_expr,
                    target,
                    &nested,
                    subject,
                    ontology,
                    documents,
                    document_warnings,
                    engine,
                    ctx,
                    ds,
                    &pointer_text(path, "where"),
                    depth + 1,
                    nodes,
                )?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn inspect_semantics(
    source: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
    ds: &mut Vec<Value>,
) -> Result<(), EngineError> {
    let ontology = get(resolution, "ontology").unwrap_or(&Value::Null);
    unknown(
        source,
        &[
            "vocabulary",
            "version",
            "id",
            "revision",
            "ontology",
            "rules",
            "native",
        ],
        "",
        ds,
    );
    unknown(
        get(source, "ontology").unwrap_or(&Value::Null),
        &["documentId", "revision"],
        "/ontology",
        ds,
    );
    for (i, rule) in array(get(source, "rules")).iter().enumerate() {
        unknown(
            rule,
            &[
                "id",
                "effect",
                "actions",
                "target",
                "condition",
                "disclosure",
            ],
            &format!("/rules/{i}"),
            ds,
        );
    }
    unknown(resolution, &["ontology", "documents"], "/resolution", ds);
    unknown(
        ontology,
        &[
            "version",
            "documentId",
            "revision",
            "documents",
            "subject",
            "entities",
            "associations",
            "context",
            "actions",
        ],
        "/resolution/ontology",
        ds,
    );
    let mut core_docs = Vec::new();
    let mut admitted_entries = Vec::new();
    let mut document_warnings = Vec::<(Utf16, Utf16)>::new();
    let mut no_extensions = NoExtensions;
    let engine = crate::security_parameters::core_engine()?;
    let registry = Registry::new();
    let pins = array(get(ontology, "documents"));
    let entries = array(get(resolution, "documents"));
    if !matches!(get(resolution, "documents"), Some(Value::Array(_)))
        || entries.len() > 256
        || !ontology_schema()?.validate(ontology, ctx)?.is_empty()
    {
        ds.push(diag(
            "SECURITY_ONTOLOGY_STRUCTURE",
            "/resolution",
            "Invalid ontology/document resolution package",
            "error",
        ));
        return Ok(());
    }
    if get(source, "ontology").and_then(|v| get(v, "documentId")) != get(ontology, "documentId")
        || get(source, "ontology").and_then(|v| get(v, "revision")) != get(ontology, "revision")
    {
        ds.push(diag(
            "SECURITY_REVISION",
            "/ontology",
            "Ontology identity/revision mismatch",
            "error",
        ));
    }
    let pin_ids: Vec<_> = pins
        .iter()
        .filter_map(|p| text(get(p, "documentId")))
        .collect();
    if duplicates(pin_ids) {
        ds.push(diag(
            "SECURITY_DUPLICATE",
            "/resolution/ontology/documents",
            "Duplicate security identity",
            "error",
        ));
    }
    let actions: Vec<_> = array(get(ontology, "actions"))
        .iter()
        .filter_map(|a| text(Some(a)))
        .collect();
    if duplicates(actions) {
        ds.push(diag(
            "SECURITY_DUPLICATE",
            "/resolution/ontology/actions",
            "Duplicate security identity",
            "error",
        ));
    }
    for (i, entry) in entries.iter().enumerate() {
        let path = format!("/resolution/documents/{i}");
        unknown(entry, &["revision", "document"], &path, ds);
        if text(get(entry, "revision")).is_none_or(|revision| revision.is_empty()) {
            ds.push(diag(
                "SECURITY_DOCUMENT",
                &path,
                "Invalid document revision",
                "error",
            ));
            continue;
        }
        let Some(document) = get(entry, "document") else {
            ds.push(diag(
                "SECURITY_DOCUMENT",
                &path,
                "Invalid document revision",
                "error",
            ));
            continue;
        };
        let validation = engine.validate_document(document, &registry, &mut no_extensions, ctx)?;
        if let Some(document_id) = get(document, "id").and_then(|value| match value {
            Value::String(value) => Some(value.clone()),
            _ => None,
        }) {
            for warning in &validation.diagnostics {
                if warning.severity == Severity::Warning
                    && warning
                        .code
                        .units()
                        .starts_with(&"UNKNOWN_".encode_utf16().collect::<Vec<_>>())
                {
                    document_warnings.push((document_id.clone(), warning.path.clone()));
                }
            }
        }
        if !validation.valid || get(document, "umf") != Some(&string(CORE_VERSION)) {
            ds.push(diag(
                "SECURITY_DOCUMENT",
                &path,
                "Valid current core 0.10.0 document required",
                "error",
            ));
            continue;
        }
        let document_id = get(document, "id");
        let pin = pins.iter().find(|p| get(p, "documentId") == document_id);
        if pin.is_none()
            || pin.and_then(|p| get(p, "revision")) != get(entry, "revision")
            || core_docs.iter().any(|d| get(d, "id") == document_id)
        {
            ds.push(diag(
                "SECURITY_REVISION",
                &path,
                "Unpinned, stale or duplicate document",
                "error",
            ));
            continue;
        }
        core_docs.push(document.clone());
        admitted_entries.push(entry.clone());
    }
    let entries = admitted_entries.as_slice();
    for (i, pin) in pins.iter().enumerate() {
        unknown(
            pin,
            &["documentId", "revision"],
            &format!("/resolution/ontology/documents/{i}"),
            ds,
        );
        if !core_docs
            .iter()
            .any(|d| get(d, "id") == get(pin, "documentId"))
        {
            ds.push(diag(
                "SECURITY_DOCUMENT",
                &format!("/resolution/ontology/documents/{i}"),
                "Pinned document missing",
                "error",
            ));
        }
    }
    let entities = array(get(ontology, "entities"));
    let associations = array(get(ontology, "associations"));
    let types: Vec<&Value> = entities.iter().chain(associations.iter()).collect();
    let mut type_ids = Vec::new();
    for (i, entity) in types.iter().enumerate() {
        let path = format!("/resolution/ontology/types/{i}");
        unknown(
            entity,
            if get(entity, "endpoints").is_some() {
                &["type", "keyId", "fields", "endpoints"]
            } else {
                &["type", "keyId", "fields"]
            },
            &path,
            ds,
        );
        let r = get(entity, "type").unwrap_or(&Value::Null);
        unknown(
            r,
            &["documentId", "moduleId", "elementId"],
            &format!("{path}/type"),
            ds,
        );
        let record = locate_checked(r, &entries, &format!("{path}/type"), ds);
        let keyfields = key_fields(entity, &entries);
        if record.is_none_or(|r| text(get(r, "kind")).as_deref() != Some("record"))
            || keyfields.is_empty()
        {
            ds.push(diag(
                "SECURITY_KEY",
                &path,
                "Explicit Record and stable Key required",
                "error",
            ));
        }
        let id = ref_key(r);
        if id.as_ref().is_some_and(|id| type_ids.contains(id)) {
            ds.push(diag(
                "SECURITY_DUPLICATE",
                &path,
                "Duplicate logical type",
                "error",
            ));
        }
        if let Some(id) = id {
            type_ids.push(id);
        }
        let ontology_fields: Vec<_> = fields_of(entity)
            .iter()
            .filter_map(|f| ref_key(get(f, "ref")?))
            .collect();
        if duplicates(ontology_fields.clone()) {
            ds.push(diag(
                "SECURITY_DUPLICATE",
                &format!("{path}/fields"),
                "Duplicate security identity",
                "error",
            ));
        }
        let model_members: Vec<_> = record
            .and_then(|r| get(r, "members"))
            .map(|members| {
                array(Some(members))
                    .iter()
                    .filter_map(|m| {
                        let doc = text(get(r, "id"));
                        let _ = doc;
                        let typ = get(entity, "type")?;
                        Some(RefKey(
                            Utf16::from(text(get(typ, "documentId"))?),
                            Utf16::from(text(get(m, "module"))?),
                            Utf16::from(text(get(m, "element"))?),
                        ))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut left = model_members.clone();
        let mut right = ontology_fields.clone();
        left.sort();
        right.sort();
        if left != right {
            ds.push(diag(
                "SECURITY_CLASSIFICATION",
                &format!("{path}/fields"),
                "Every Record member requires explicit security classification",
                "error",
            ));
        }
        for (j, f) in fields_of(entity).iter().enumerate() {
            let p = format!("{path}/fields/{j}");
            unknown(f, &["ref", "protection", "queryUse"], &p, ds);
            if let Some(reference) = get(f, "ref") {
                unknown(
                    reference,
                    &["documentId", "moduleId", "elementId"],
                    &format!("{p}/ref"),
                    ds,
                );
            }
            domain_ref(
                get(f, "ref").unwrap_or(&Value::Null),
                &entries,
                &document_warnings,
                &format!("{p}/ref"),
                ds,
            );
            if let Some(q) = get(f, "queryUse") {
                unknown(
                    q,
                    &["predicate", "order", "group", "join", "aggregate"],
                    &format!("{p}/queryUse"),
                    ds,
                );
            }
        }
        if let Some(record) = record {
            let key = array(get(record, "keys"))
                .iter()
                .find(|k| get(k, "id") == get(entity, "keyId"));
            if let Some(key) = key {
                unknown(
                    key,
                    &["id", "name", "fields", "primary"],
                    &format!("{path}/key"),
                    ds,
                );
                if let Some(primary) = get(key, "primary") {
                    if !matches!(primary, Value::Bool(_)) {
                        ds.push(diag(
                            "SECURITY_KEY",
                            &format!("{path}/key/primary"),
                            "Primary metadata must be Boolean",
                            "error",
                        ));
                    }
                }
                for f in array(get(key, "fields")) {
                    unknown(f, &["module", "element"], &format!("{path}/key/fields"), ds);
                }
            }
            for m in array(get(record, "members")) {
                unknown(m, &["module", "element"], &format!("{path}/members"), ds);
            }
        }
    }
    let subject = get(ontology, "subject").unwrap_or(&Value::Null);
    unknown(
        subject,
        &["documentId", "moduleId", "elementId"],
        "/resolution/ontology/subject",
        ds,
    );
    if !entities
        .iter()
        .any(|e| get(e, "type").is_some_and(|r| same_ref(r, subject)))
    {
        ds.push(diag(
            "SECURITY_SUBJECT",
            "/resolution/ontology/subject",
            "Subject must resolve to declared entity",
            "error",
        ));
    }
    for (i, r) in array(get(ontology, "context")).iter().enumerate() {
        unknown(
            r,
            &["documentId", "moduleId", "elementId"],
            &format!("/resolution/ontology/context/{i}"),
            ds,
        );
        domain_ref(
            r,
            &entries,
            &document_warnings,
            &format!("/resolution/ontology/context/{i}"),
            ds,
        );
    }
    if duplicates(array(get(ontology, "context")).iter().filter_map(ref_key)) {
        ds.push(diag(
            "SECURITY_DUPLICATE",
            "/resolution/ontology/context",
            "Duplicate security identity",
            "error",
        ));
    }
    for (i, a) in associations.iter().enumerate() {
        let endpoints = array(get(a, "endpoints"));
        let roles: Vec<_> = endpoints
            .iter()
            .filter_map(|e| text(get(e, "role")))
            .collect();
        if duplicates(roles) {
            ds.push(diag(
                "SECURITY_DUPLICATE",
                &format!("/resolution/ontology/associations/{i}/endpoints"),
                "Duplicate security identity",
                "error",
            ));
        }
        for (j, e) in endpoints.iter().enumerate() {
            let path = format!("/resolution/ontology/associations/{i}/endpoints/{j}");
            unknown(e, &["role", "target", "fields"], &path, ds);
            let target_ref = get(e, "target").unwrap_or(&Value::Null);
            unknown(
                target_ref,
                &["documentId", "moduleId", "elementId"],
                &format!("{path}/target"),
                ds,
            );
            let _ = locate_checked(target_ref, &entries, &format!("{path}/target"), ds);
            let Some(target) = find_binding(target_ref, ontology) else {
                ds.push(diag(
                    "SECURITY_ENDPOINT",
                    &path,
                    "Endpoint target is undeclared",
                    "error",
                ));
                continue;
            };
            let keys = key_fields(target, &entries);
            let supplied = array(get(e, "fields"));
            if supplied.len() != keys.len() {
                ds.push(diag(
                    "SECURITY_ENDPOINT",
                    &path,
                    "Endpoint must supply every target Key component",
                    "error",
                ));
            }
            if duplicates(supplied.iter().filter_map(ref_key)) {
                ds.push(diag(
                    "SECURITY_DUPLICATE",
                    &format!("{path}/fields"),
                    "Duplicate security identity",
                    "error",
                ));
            }
            for (k, r) in supplied.iter().enumerate() {
                if !fields_of(a)
                    .iter()
                    .any(|f| get(f, "ref").is_some_and(|x| same_ref(x, r)))
                {
                    ds.push(diag(
                        "SECURITY_ENDPOINT",
                        &path,
                        "Endpoint field is not an association member",
                        "error",
                    ));
                }
                unknown(
                    r,
                    &["documentId", "moduleId", "elementId"],
                    &format!("{path}/fields/{k}"),
                    ds,
                );
                let left = domain_ref(
                    r,
                    &entries,
                    &document_warnings,
                    &format!("{path}/fields/{k}"),
                    ds,
                );
                let right = keys.get(k).and_then(|key| {
                    domain_ref(
                        key,
                        &entries,
                        &document_warnings,
                        &format!("{path}/targetKey/{k}"),
                        ds,
                    )
                });
                if left.zip(right).is_some_and(|(l, r)| !compare_value(&l, &r)) {
                    ds.push(diag(
                        "SECURITY_ENDPOINT",
                        &path,
                        "Endpoint and target Key domains differ",
                        "error",
                    ));
                }
            }
        }
    }
    let rule_ids: Vec<_> = array(get(source, "rules"))
        .iter()
        .filter_map(|r| text(get(r, "id")))
        .collect();
    if duplicates(rule_ids) {
        ds.push(diag(
            "SECURITY_DUPLICATE",
            "/rules",
            "Duplicate security identity",
            "error",
        ));
    }
    let mut nodes = 0;
    for (i, rule) in array(get(source, "rules")).iter().enumerate() {
        let path = format!("/rules/{i}");
        unknown(
            rule,
            &[
                "id",
                "effect",
                "actions",
                "target",
                "condition",
                "disclosure",
            ],
            &path,
            ds,
        );
        for (j, r) in array(get(rule, "target")).iter().enumerate() {
            unknown(
                r,
                &["documentId", "moduleId", "elementId"],
                &format!("{path}/target/{j}"),
                ds,
            );
        }
        for (j, d) in array(get(rule, "disclosure")).iter().enumerate() {
            let p = format!("{path}/disclosure/{j}");
            unknown(d, &["field", "disposition"], &p, ds);
            if let Some(r) = get(d, "field") {
                unknown(
                    r,
                    &["documentId", "moduleId", "elementId"],
                    &format!("{p}/field"),
                    ds,
                );
            }
            if let Some(disposition) = get(d, "disposition") {
                if text(get(disposition, "kind")).as_deref() == Some("transformed") {
                    unknown(
                        disposition,
                        &["kind", "transform", "version", "field", "value"],
                        &format!("{p}/disposition"),
                        ds,
                    );
                    if let Some(r) = get(disposition, "field") {
                        unknown(
                            r,
                            &["documentId", "moduleId", "elementId"],
                            &format!("{p}/disposition/field"),
                            ds,
                        );
                    }
                } else {
                    unknown(disposition, &["kind"], &format!("{p}/disposition"), ds);
                }
            }
        }
        let acts: Vec<_> = array(get(rule, "actions"))
            .iter()
            .filter_map(|a| text(Some(a)))
            .collect();
        if duplicates(acts) {
            ds.push(diag(
                "SECURITY_DUPLICATE",
                &format!("{path}/actions"),
                "Duplicate security identity",
                "error",
            ));
        }
        let targets = array(get(rule, "target"));
        let target_ids: Vec<_> = targets.iter().filter_map(ref_key).collect();
        if duplicates(target_ids) {
            ds.push(diag(
                "SECURITY_DUPLICATE",
                &format!("{path}/target"),
                "Duplicate security identity",
                "error",
            ));
        }
        if text(get(rule, "effect")).as_deref() != Some("permit")
            && get(rule, "disclosure").is_some()
        {
            ds.push(diag(
                "SECURITY_DISCLOSURE",
                &path,
                "Only permits may carry disclosure",
                "error",
            ));
        }
        for t in targets {
            if !types
                .iter()
                .any(|b| get(b, "type").is_some_and(|r| same_ref(r, t)))
            {
                ds.push(diag(
                    "SECURITY_TARGET",
                    &format!("{path}/target"),
                    "Undeclared target type",
                    "error",
                ));
                continue;
            }
            for action in array(get(rule, "actions")) {
                if !array(get(ontology, "actions")).contains(action) {
                    ds.push(diag(
                        "SECURITY_ACTION",
                        &format!("{path}/actions"),
                        "Undeclared action",
                        "error",
                    ));
                }
            }
            if let Some(condition) = get(rule, "condition") {
                typed_expression(
                    condition,
                    find_binding(t, ontology).unwrap_or(&Value::Null),
                    &[],
                    subject,
                    ontology,
                    &entries,
                    &document_warnings,
                    &engine,
                    ctx,
                    ds,
                    &format!("{path}/condition"),
                    1,
                    &mut nodes,
                )?;
            }
            let disclosed: Vec<_> = array(get(rule, "disclosure"))
                .iter()
                .filter_map(|d| ref_key(get(d, "field")?))
                .collect();
            if duplicates(disclosed) {
                ds.push(diag(
                    "SECURITY_DUPLICATE",
                    &format!("{path}/disclosure"),
                    "Duplicate security identity",
                    "error",
                ));
            }
            for (j, d) in array(get(rule, "disclosure")).iter().enumerate() {
                let p = format!("{path}/disclosure/{j}");
                let field = get(d, "field").unwrap_or(&Value::Null);
                if !fields_of(find_binding(t, ontology).unwrap_or(&Value::Null))
                    .iter()
                    .any(|f| get(f, "ref").is_some_and(|r| same_ref(r, field)))
                {
                    ds.push(diag(
                        "SECURITY_DISCLOSURE",
                        &format!("{path}/disclosure"),
                        "Output field must belong to every target",
                        "error",
                    ));
                }
                if text(get(get(d, "disposition").unwrap_or(&Value::Null), "kind")).as_deref()
                    == Some("transformed")
                {
                    let output = get(get(d, "disposition").unwrap_or(&Value::Null), "field")
                        .unwrap_or(&Value::Null);
                    let out_field = locate(output, &entries);
                    warn_unqualified_field(
                        output,
                        out_field,
                        &entries,
                        &document_warnings,
                        &format!("{p}/disposition/field"),
                        ds,
                    );
                    if let Some(out_domain) =
                        domain(out_field, &format!("{p}/disposition/field"), ds)
                    {
                        let _ = out_domain;
                        if let (Some(out_field), Some(doc)) = (
                            out_field,
                            entries.iter().find(|e| {
                                get(get(e, "document").unwrap_or(&Value::Null), "id")
                                    == get(output, "documentId")
                            }),
                        ) {
                            if let (Some(document), Some(value)) = (
                                get(doc, "document"),
                                get(get(d, "disposition").unwrap_or(&Value::Null), "value"),
                            ) {
                                if let Err(error) = engine
                                    .check_schema_literal_public(document, out_field, value, ctx)
                                {
                                    if error.is_control_failure() {
                                        return Err(error);
                                    }
                                    ds.push(diag(
                                        "SECURITY_CONSTANT",
                                        &format!("{path}/disclosure"),
                                        "Transform constant violates declared output domain",
                                        "error",
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

/// Inspect source without mutating it. This public first port is completed below
/// by the exact pin/type/expression checks shared with dependency extraction.
pub fn inspect_security_policy(
    source: &Value,
    resolution: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = match copy_json(source, ctx) {
        Ok(v) => v,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => {
            return Ok(result(
                Value::Null,
                None,
                vec![diag_u16(
                    &e.code,
                    e.path,
                    e.message
                        .to_utf8()
                        .as_deref()
                        .unwrap_or("Invalid JSON value"),
                    "error",
                )],
            ))
        }
    };
    let mut ds = schema_diagnostics(&policy_schema()?, &source, "", "SECURITY_STRUCTURE", ctx)?;
    if !ds.is_empty() {
        return Ok(result(source, None, ds));
    }
    let Some(resolution) = resolution else {
        ds.push(diag(
            "SECURITY_RESOLUTION_REQUIRED",
            "/ontology",
            "Explicit pinned ontology/document closure required",
            "warning",
        ));
        return Ok(result(source, None, ds));
    };
    let resolution = match copy_json(resolution, ctx) {
        Ok(v) => v,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => {
            ds.push(diag_u16(
                &e.code,
                e.path,
                e.message
                    .to_utf8()
                    .as_deref()
                    .unwrap_or("Invalid JSON value"),
                "error",
            ));
            return Ok(result(source, None, ds));
        }
    };
    inspect_semantics(&source, &resolution, ctx, &mut ds)?;
    Ok(result(source, Some(resolution), ds))
}

/// Validate authored 0.2 action-purpose declarations against the same pinned
/// ontology/document semantics used by the executable 0.1 policy inspector.
/// The returned labels are source declarations only and confer no authority.
pub fn inspect_security_action_purposes(
    ontology_input: &Value,
    documents_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let packet = object(vec![
        ("ontology", ontology_input.clone()),
        ("documents", documents_input.clone()),
    ]);
    let packet = match copy_json(&packet, ctx) {
        Ok(value) => value,
        Err(error) if error.is_control_failure() => return Err(error),
        Err(error) => {
            return Ok(action_purpose_result(
                Value::Null,
                Value::Null,
                Vec::new(),
                vec![diag_u16(
                    &error.code,
                    error.path,
                    error
                        .message
                        .to_utf8()
                        .as_deref()
                        .unwrap_or("Invalid JSON value"),
                    "error",
                )],
            ));
        }
    };
    let ontology = get(&packet, "ontology").cloned().unwrap_or(Value::Null);
    let documents = get(&packet, "documents").cloned().unwrap_or(Value::Null);
    let mut diagnostics = Vec::new();
    let mut text_units = 0usize;
    let mut pending = vec![&packet];
    while let Some(value) = pending.pop() {
        let size = match value {
            Value::String(value) => value.units().len(),
            Value::Array(values) => {
                pending.extend(values.iter());
                0
            }
            Value::Object(fields) => {
                for (key, child) in fields {
                    text_units = text_units.saturating_add(key.units().len());
                    pending.push(child);
                }
                0
            }
            _ => 0,
        };
        text_units = text_units.saturating_add(size);
        if text_units > 4_000_000 {
            diagnostics.push(diag(
                "SECURITY_ACTION_PURPOSE_BOUND",
                "",
                "Resource-exhausted: source key/string text exceeds 4000000 UTF-16 units",
                "error",
            ));
            return Ok(action_purpose_result(
                ontology,
                documents,
                Vec::new(),
                diagnostics,
            ));
        }
    }
    let schema = action_purpose_ontology_schema()?;
    diagnostics.extend(schema_diagnostics(
        &schema,
        &ontology,
        "",
        "SECURITY_ACTION_PURPOSE_STRUCTURE",
        ctx,
    )?);
    if !diagnostics.is_empty() {
        return Ok(action_purpose_result(
            ontology,
            documents,
            Vec::new(),
            diagnostics,
        ));
    }
    let actions = array(get(&ontology, "actions"));
    let declarations = array(get(&ontology, "actionPurposes"));
    let mut action_ids = std::collections::BTreeSet::new();
    let mut declared = std::collections::BTreeSet::new();
    let allowed: [&str; 6] = [
        "read",
        "field",
        "original-authorized",
        "reverse",
        "vault-write",
        "other",
    ];
    let mut purposes = Vec::with_capacity(declarations.len());
    let mut purpose_error = false;
    if !(1..=256).contains(&actions.len()) || !(1..=256).contains(&declarations.len()) {
        purpose_error = true;
    }
    for action in actions {
        match text(Some(action)) {
            Some(value) if !value.is_empty() && value.encode_utf16().count() <= 4096 => {
                if !action_ids.insert(value) {
                    purpose_error = true;
                }
            }
            _ => purpose_error = true,
        }
    }
    for (index, declaration) in declarations.iter().enumerate() {
        let action = text(get(declaration, "action"));
        let values = array(get(declaration, "purposes"));
        let exact = matches!(declaration, Value::Object(fields) if fields.len() == 2 && get(declaration,"action").is_some() && get(declaration,"purposes").is_some());
        let mut selected = Vec::new();
        let mut seen = std::collections::BTreeSet::new();
        if !exact || values.is_empty() || values.len() > 6 {
            purpose_error = true;
        }
        for value in values {
            match text(Some(value)) {
                Some(value) if allowed.contains(&value.as_str()) && seen.insert(value.clone()) => {
                    selected.push(value)
                }
                _ => purpose_error = true,
            }
        }
        if selected
            .iter()
            .any(|value| matches!(value.as_str(), "reverse" | "vault-write" | "other"))
            && selected.len() != 1
        {
            purpose_error = true;
        }
        if let Some(action) = action {
            if !action_ids.contains(&action) || !declared.insert(action.clone()) {
                purpose_error = true;
            }
            purposes.push(object(vec![
                ("action", string(&action)),
                (
                    "purposes",
                    Value::Array(selected.iter().map(|value| string(value)).collect()),
                ),
            ]));
        } else {
            purpose_error = true;
        }
        if !exact {
            diagnostics.push(diag(
                "SECURITY_ACTION_PURPOSES",
                &format!("/actionPurposes/{index}"),
                "Exact action/purpose declaration required",
                "error",
            ));
        }
    }
    if declared != action_ids {
        purpose_error = true;
    }
    if purpose_error {
        diagnostics.push(diag(
            "SECURITY_ACTION_PURPOSES",
            "/actionPurposes",
            "Complete exact known action-purpose closure required",
            "error",
        ));
    }
    if !diagnostics.is_empty() {
        return Ok(action_purpose_result(
            ontology,
            documents,
            Vec::new(),
            diagnostics,
        ));
    }

    // The 0.2 action-purpose member is additive to the 0.1 ontology graph.
    // Validate its graph and every pinned core document through the existing
    // policy semantic kernel after adapting the candidate's normalized entity
    // and record-members views back to the 0.1 ontology representation. The
    // candidate migration stores association Records in `entities`, while the
    // executable 0.1 inspector stores them in `associations`.
    let mut legacy_ontology = ontology.clone();
    if let Value::Object(fields) = &mut legacy_ontology {
        fields.retain(|(key, _)| key != &Utf16::from("actionPurposes"));
        if let Some((_, version)) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("version"))
        {
            *version = string("0.1.0");
        }
    }
    let candidate_entities = array(get(&ontology, "entities"));
    let candidate_associations = array(get(&ontology, "associations"));
    let record_associations = candidate_associations
        .iter()
        .filter(|association| text(get(association, "kind")).as_deref() == Some("record-members"))
        .collect::<Vec<_>>();
    for (index, association) in candidate_associations.iter().enumerate() {
        if text(get(association, "kind")).as_deref() == Some("core-relationship") {
            if let Err(error) =
                validate_candidate_relationship_association(association, &ontology, &documents, ctx)
            {
                if error.is_control_failure() {
                    return Err(error);
                }
                return Ok(action_purpose_result(
                    ontology,
                    documents,
                    Vec::new(),
                    vec![diag_u16(
                        &error.code,
                        error.path,
                        error
                            .message
                            .to_utf8()
                            .as_deref()
                            .unwrap_or("Invalid relationship association"),
                        "error",
                    )],
                ));
            }
        } else if text(get(association, "kind")).as_deref() != Some("record-members") {
            return Ok(action_purpose_result(
                ontology,
                documents,
                Vec::new(),
                vec![diag(
                    "SECURITY_ONTOLOGY_ASSOCIATION",
                    &format!("/associations/{index}"),
                    "Unknown association selector",
                    "error",
                )],
            ));
        }
    }
    let old_entities = candidate_entities
        .iter()
        .filter(|entity| {
            !record_associations.iter().any(|association| {
                same_ref(
                    get(entity, "type").unwrap_or(&Value::Null),
                    get(association, "type").unwrap_or(&Value::Null),
                )
            })
        })
        .map(|entity| copy_json(entity, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    let mut old_associations = Vec::with_capacity(record_associations.len());
    for association in record_associations {
        let association_type = get(association, "type").unwrap_or(&Value::Null);
        let record = candidate_entities
            .iter()
            .find(|entity| {
                same_ref(
                    get(entity, "type").unwrap_or(&Value::Null),
                    association_type,
                )
            })
            .ok_or_else(|| {
                EngineError::new(
                    "SECURITY_ONTOLOGY_STRUCTURE",
                    Utf16::from("/associations"),
                    "Record-members association has no normalized Record entity",
                )
            })?;
        old_associations.push(object(vec![
            ("type", copy_json(association_type, ctx)?),
            (
                "keyId",
                get(association, "keyId")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            (
                "fields",
                get(record, "fields")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Array(Vec::new())),
            ),
            (
                "endpoints",
                get(association, "endpoints")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Array(Vec::new())),
            ),
        ]));
    }
    if let Value::Object(fields) = &mut legacy_ontology {
        for (name, value) in [
            ("entities", Value::Array(old_entities)),
            ("associations", Value::Array(old_associations)),
        ] {
            if let Some((_, current)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from(name))
            {
                *current = value;
            } else {
                fields.push((Utf16::from(name), value));
            }
        }
    }
    let identity = object(vec![
        (
            "documentId",
            get(&ontology, "documentId").cloned().unwrap_or(Value::Null),
        ),
        (
            "revision",
            get(&ontology, "revision").cloned().unwrap_or(Value::Null),
        ),
    ]);
    let policy = object(vec![
        ("vocabulary", string("umf.security")),
        ("version", string("0.1.0")),
        ("id", string("action-purpose-inspection")),
        ("revision", string("inspection")),
        ("ontology", identity),
        ("rules", Value::Array(Vec::new())),
    ]);
    let resolution = object(vec![
        ("ontology", legacy_ontology),
        ("documents", documents.clone()),
    ]);
    let checked = inspect_security_policy(&policy, Some(&resolution), ctx)?;
    let checked_diagnostics = array(get(&checked, "diagnostics"));
    let checked_valid = get(&checked, "valid") == Some(&Value::Bool(true));
    if !checked_valid {
        diagnostics.extend(
            checked_diagnostics
                .iter()
                .filter(|item| text(get(item, "severity")).as_deref() == Some("error"))
                .cloned(),
        );
    }
    if !checked_valid || !diagnostics.is_empty() {
        return Ok(action_purpose_result(
            ontology,
            documents,
            Vec::new(),
            diagnostics,
        ));
    }
    diagnostics.push(diag("SECURITY_ACTION_PURPOSE_DECLARATIONS_ONLY", "", "Authored classifications only; actual owner-profile compatibility, route completeness, policy grants and native/current authority remain separate", "warning"));
    Ok(action_purpose_result(
        ontology,
        documents,
        purposes,
        diagnostics,
    ))
}

fn action_purpose_ontology_schema() -> Result<CompiledSchema, EngineError> {
    static SCHEMA: OnceLock<Result<CompiledSchema, EngineError>> = OnceLock::new();
    SCHEMA
        .get_or_init(|| {
            let mut context = Context::ordinary();
            let schema = parse(
                include_str!("../../../spec/extensions/security-v0.2/ontology.schema.json"),
                &mut context,
            )?;
            CompiledSchema::compile_consumer(
                &schema,
                &SchemaResources::default(),
                false,
                &mut context,
            )
        })
        .clone()
}

fn validate_candidate_relationship_association(
    selector: &Value,
    ontology: &Value,
    documents: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let relationship_ref = get(selector, "relationship").unwrap_or(&Value::Null);
    let document_id = text(get(relationship_ref, "documentId")).ok_or_else(|| {
        EngineError::new(
            "SECURITY_ASSOCIATION_RELATIONSHIP",
            Utf16::from("/relationship"),
            "Relationship document ID is required",
        )
    })?;
    let module_id = text(get(relationship_ref, "moduleId")).ok_or_else(|| {
        EngineError::new(
            "SECURITY_ASSOCIATION_RELATIONSHIP",
            Utf16::from("/relationship"),
            "Relationship module ID is required",
        )
    })?;
    let relationship_id = text(get(relationship_ref, "relationshipId")).ok_or_else(|| {
        EngineError::new(
            "SECURITY_ASSOCIATION_RELATIONSHIP",
            Utf16::from("/relationship"),
            "Relationship ID is required",
        )
    })?;
    let entry = array(Some(documents))
        .iter()
        .find(|entry| {
            get(entry, "document")
                .and_then(|document| text(get(document, "id")))
                .as_deref()
                == Some(document_id.as_str())
        })
        .ok_or_else(|| {
            EngineError::new(
                "SECURITY_ASSOCIATION_DOCUMENT",
                Utf16::from("/relationship/documentId"),
                "Pinned relationship document is missing",
            )
        })?;
    let source = get(entry, "document").ok_or_else(|| {
        EngineError::new(
            "SECURITY_ASSOCIATION_DOCUMENT",
            Utf16::from("/relationship/documentId"),
            "Pinned relationship document is missing",
        )
    })?;
    let runtime = crate::security_parameters::core_engine()?;
    let registry = Registry::new();
    let mut capabilities = NoExtensions;
    let lookup = crate::core_relationships::lookup_core_relationship(
        source,
        &object(vec![
            ("module", string(&module_id)),
            ("id", string(&relationship_id)),
        ]),
        &runtime,
        &registry,
        &mut capabilities,
        ctx,
    )?;
    if !array(get(&lookup, "uninterpretedPaths")).is_empty() {
        return Err(EngineError::new(
            "SECURITY_ASSOCIATION_UNINTERPRETED",
            Utf16::from("/relationship"),
            "Relationship contains unknown qualifiers",
        ));
    }
    let relationship = get(&lookup, "relationship").ok_or_else(|| {
        EngineError::new(
            "SECURITY_ASSOCIATION_RELATIONSHIP",
            Utf16::from("/relationship"),
            "Relationship lookup returned no declaration",
        )
    })?;
    if get(relationship, "directed") != Some(&Value::Bool(true))
        || array(get(relationship, "source")).len() != 1
        || array(get(relationship, "target")).len() != 1
    {
        return Err(EngineError::new(
            "SECURITY_ASSOCIATION_RELATIONSHIP",
            Utf16::from("/relationship"),
            "Only directed singular relationships are admitted",
        ));
    }
    let entities = array(get(ontology, "entities"));
    let endpoints = array(get(selector, "endpoints"));
    if endpoints.len() != 2 {
        return Err(EngineError::new(
            "SECURITY_ASSOCIATION_ENDPOINTS",
            Utf16::from("/endpoints"),
            "Exactly one source and one target endpoint are required",
        ));
    }
    let mut roles = std::collections::BTreeSet::new();
    let mut sides = std::collections::BTreeSet::new();
    for endpoint in endpoints {
        let role = text(get(endpoint, "role")).ok_or_else(|| {
            EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints"),
                "Endpoint role is required",
            )
        })?;
        let side = text(get(endpoint, "side")).ok_or_else(|| {
            EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints"),
                "Endpoint side is required",
            )
        })?;
        if !roles.insert(role)
            || !matches!(side.as_str(), "source" | "target")
            || !sides.insert(side.clone())
        {
            return Err(EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints"),
                "Endpoint roles and relationship sides must be unique",
            ));
        }
        let native = array(get(relationship, &side)).first().ok_or_else(|| {
            EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints"),
                "Relationship endpoint is missing",
            )
        })?;
        let target = get(endpoint, "target").unwrap_or(&Value::Null);
        if text(get(target, "documentId")).as_deref() != Some(document_id.as_str())
            || text(get(target, "moduleId")) != text(get(native, "module"))
            || text(get(target, "elementId")) != text(get(native, "element"))
        {
            return Err(EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints"),
                "Endpoint target does not match the selected relationship side",
            ));
        }
        let key_id = text(get(endpoint, "keyId")).ok_or_else(|| {
            EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints"),
                "Endpoint key ID is required",
            )
        })?;
        if get(native, "key")
            .and_then(|value| text(Some(value)))
            .is_some_and(|native_key| native_key != key_id)
        {
            return Err(EngineError::new(
                "SECURITY_ASSOCIATION_ENDPOINTS",
                Utf16::from("/endpoints/keyId"),
                "Endpoint key does not match the relationship declaration",
            ));
        }
        let entity = entities
            .iter()
            .find(|entity| same_ref(get(entity, "type").unwrap_or(&Value::Null), target))
            .ok_or_else(|| {
                EngineError::new(
                    "SECURITY_ASSOCIATION_ENTITY",
                    Utf16::from("/endpoints/target"),
                    "Endpoint Record must be declared as an ontology entity",
                )
            })?;
        if text(get(entity, "keyId")).as_deref() != Some(key_id.as_str()) {
            return Err(EngineError::new(
                "SECURITY_ASSOCIATION_ENTITY",
                Utf16::from("/endpoints/keyId"),
                "Endpoint must select its declared ontology Key",
            ));
        }
        crate::core_keys::lookup_core_key(
            source,
            &object(vec![
                (
                    "module",
                    get(target, "moduleId").cloned().unwrap_or(Value::Null),
                ),
                (
                    "element",
                    get(target, "elementId").cloned().unwrap_or(Value::Null),
                ),
                ("key", string(&key_id)),
            ]),
            &runtime,
            &registry,
            &mut capabilities,
            ctx,
        )?;
    }
    let witness = get(selector, "witness").unwrap_or(&Value::Null);
    let association_record = get(relationship, "associationRecord");
    match text(get(witness, "kind")).as_deref() {
        Some("opaque-existential") if association_record.is_none() => Ok(()),
        Some("record-key") => {
            let target = get(witness, "type").unwrap_or(&Value::Null);
            let key_id = text(get(witness, "keyId")).ok_or_else(|| {
                EngineError::new(
                    "SECURITY_ASSOCIATION_WITNESS",
                    Utf16::from("/witness/keyId"),
                    "Witness key ID is required",
                )
            })?;
            let record = association_record.ok_or_else(|| {
                EngineError::new(
                    "SECURITY_ASSOCIATION_WITNESS",
                    Utf16::from("/witness"),
                    "Relationship has no association Record",
                )
            })?;
            if text(get(target, "documentId")).as_deref() != Some(document_id.as_str())
                || text(get(target, "moduleId")) != text(get(record, "module"))
                || text(get(target, "elementId")) != text(get(record, "element"))
                || get(record, "key")
                    .and_then(|value| text(Some(value)))
                    .is_some_and(|native| native != key_id)
            {
                return Err(EngineError::new(
                    "SECURITY_ASSOCIATION_WITNESS",
                    Utf16::from("/witness"),
                    "Witness does not identify the relationship association Record and Key",
                ));
            }
            let entity = entities
                .iter()
                .find(|entity| same_ref(get(entity, "type").unwrap_or(&Value::Null), target))
                .ok_or_else(|| {
                    EngineError::new(
                        "SECURITY_ASSOCIATION_WITNESS",
                        Utf16::from("/witness/type"),
                        "Association Record must be declared as an ontology entity",
                    )
                })?;
            if text(get(entity, "keyId")).as_deref() != Some(key_id.as_str()) {
                return Err(EngineError::new(
                    "SECURITY_ASSOCIATION_WITNESS",
                    Utf16::from("/witness/keyId"),
                    "Witness Key must match its ontology entity",
                ));
            }
            crate::core_keys::lookup_core_key(
                source,
                &object(vec![
                    (
                        "module",
                        get(target, "moduleId").cloned().unwrap_or(Value::Null),
                    ),
                    (
                        "element",
                        get(target, "elementId").cloned().unwrap_or(Value::Null),
                    ),
                    ("key", string(&key_id)),
                ]),
                &runtime,
                &registry,
                &mut capabilities,
                ctx,
            )?;
            Ok(())
        }
        _ => Err(EngineError::new(
            "SECURITY_ASSOCIATION_WITNESS",
            Utf16::from("/witness"),
            "Unsupported relationship witness",
        )),
    }
}

fn action_purpose_result(
    ontology: Value,
    documents: Value,
    purposes: Vec<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    let success = !has_errors(&diagnostics);
    object(vec![
        (
            "status",
            string(if success {
                "resolved-purposes"
            } else {
                "refused"
            }),
        ),
        ("ontology", ontology),
        ("documents", documents),
        (
            "purposes",
            Value::Array(if success { purposes } else { Vec::new() }),
        ),
        ("complete", Value::Bool(false)),
        ("authority", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}

/// Preserve the current protection declaration report while leaving every
/// obligation explicitly unverified. No declaration grants or executes access.
pub fn inspect_protection_obligations(
    policy: &Value,
    catalog: &Value,
    closure: &Value,
    ontology_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let parameters = crate::security_parameters::validate_security_protection_parameters_candidate(
        policy, catalog, closure, ctx,
    )?;
    let retained_policy = get(&parameters, "policy").cloned().unwrap_or(Value::Null);
    let retained_catalog = get(&parameters, "catalog").cloned().unwrap_or(Value::Null);
    let retained_closure = get(&parameters, "closure").cloned().unwrap_or(Value::Null);
    let documents = get(&retained_closure, "documents")
        .cloned()
        .unwrap_or(Value::Null);
    let purposes = inspect_security_action_purposes(ontology_input, &documents, ctx)?;
    let ontology = get(&purposes, "ontology").cloned().unwrap_or(Value::Null);
    let action_purposes = array(get(&purposes, "purposes")).to_vec();
    let mut diagnostics = array(get(&parameters, "diagnostics")).to_vec();
    diagnostics.extend(array(get(&purposes, "diagnostics")).iter().cloned());
    let mut obligations = Vec::new();
    let finish = |success: bool, diagnostics: Vec<Value>, obligations: Vec<Value>| {
        object(vec![
            (
                "status",
                string(if success {
                    "declared-obligations"
                } else {
                    "refused"
                }),
            ),
            ("complete", Value::Bool(false)),
            ("authority", Value::Bool(false)),
            ("policy", retained_policy.clone()),
            ("catalog", retained_catalog.clone()),
            ("closure", retained_closure.clone()),
            ("ontology", ontology.clone()),
            ("purposes", Value::Array(action_purposes.clone())),
            (
                "obligations",
                Value::Array(if success { obligations } else { Vec::new() }),
            ),
            ("diagnostics", Value::Array(diagnostics)),
        ])
    };
    if text(get(&parameters, "status")).as_deref() != Some("validated-parameters")
        || text(get(&purposes, "status")).as_deref() != Some("resolved-purposes")
    {
        return Ok(finish(false, diagnostics, obligations));
    }
    let mut failed = false;
    let mut reject = |message: &str| {
        failed = true;
        diagnostics.push(diag("PROTECTION_DECLARATIONS", "", message, "error"));
    };
    let ontology_pin = get(&retained_policy, "ontology").unwrap_or(&Value::Null);
    if get(ontology_pin, "documentId") != get(&ontology, "documentId")
        || get(ontology_pin, "revision") != get(&ontology, "revision")
    {
        reject("Exact policy ontology document/revision pin required");
    }
    let mut action_map = std::collections::BTreeMap::<String, Vec<String>>::new();
    for entry in &action_purposes {
        let (Some(action), Some(Value::Array(values))) =
            (text(get(entry, "action")), get(entry, "purposes"))
        else {
            continue;
        };
        action_map.insert(
            action,
            values
                .iter()
                .filter_map(|value| text(Some(value)))
                .collect(),
        );
    }
    let role = |action: &str, expected: &str| {
        action_map
            .get(action)
            .is_some_and(|values| values.len() == 1 && values[0] == expected)
    };
    let rules = array(get(&retained_policy, "rules"));
    for rule in rules {
        for action in array(get(rule, "actions")) {
            if text(Some(action)).is_none_or(|id| !action_map.contains_key(&id)) {
                reject(
                    "Every policy action must belong to the source-owned ontology action universe",
                );
            }
        }
        for entry in array(get(rule, "disclosure")) {
            let disposition = get(entry, "disposition").unwrap_or(&Value::Null);
            if text(get(disposition, "kind")).as_deref() != Some("transformed")
                || text(get(disposition, "vocabulary")).as_deref()
                    != Some("umf.security.protection")
            {
                continue;
            }
            let transform = array(get(&retained_catalog, "transforms"))
                .iter()
                .find(|transform| {
                    get(transform, "id") == get(disposition, "transform")
                        && get(transform, "version") == get(disposition, "version")
                });
            if transform.is_none_or(|transform| {
                !same_ref(
                    get(entry, "field").unwrap_or(&Value::Null),
                    get(transform, "inputDomain").unwrap_or(&Value::Null),
                ) || !same_ref(
                    get(disposition, "field").unwrap_or(&Value::Null),
                    get(transform, "outputDomain").unwrap_or(&Value::Null),
                )
            }) {
                reject("Exact selected policy input/output transform domains required");
            }
        }
    }
    let transforms = array(get(&retained_catalog, "transforms"));
    for transform in transforms {
        let (Some(id), Some(version)) =
            (text(get(transform, "id")), text(get(transform, "version")))
        else {
            continue;
        };
        let mut add = |kind: &str, declaration: Value| {
            obligations.push(object(vec![
                (
                    "transform",
                    object(vec![("id", string(&id)), ("version", string(&version))]),
                ),
                ("kind", string(kind)),
                ("status", string("unverified")),
                ("declaration", declaration),
            ]));
        };
        if text(get(transform, "kind")).as_deref() == Some("hash") {
            add(
                "hash-algorithm",
                object(vec![(
                    "algorithm",
                    get(transform, "algorithm").cloned().unwrap_or(Value::Null),
                )]),
            );
            add(
                "salt-custody",
                get(transform, "saltCustody")
                    .cloned()
                    .unwrap_or(Value::Null),
            );
            let profile = array(get(transform, "disclosureProfile"));
            let equality = profile
                .iter()
                .any(|value| text(Some(value)).as_deref() == Some("equality"));
            let salt_none = text(get(
                get(transform, "saltCustody").unwrap_or(&Value::Null),
                "kind",
            ))
            .as_deref()
                == Some("none");
            if salt_none {
                let determinism = text(get(transform, "determinism"));
                if !matches!(
                    determinism.as_deref(),
                    Some("deterministic" | "keyed-deterministic")
                ) && !equality
                {
                    reject("Unsalted hash requires retained effective equality");
                }
                add(
                    "dictionary-attack-warning",
                    object(vec![
                        (
                            "code",
                            string("UNSALTED_HASH_DICTIONARY_ATTACK"),
                        ),
                        (
                            "warning",
                            string("Unsalted hashes expose equality and need assessment for dictionary attacks; no algorithm or custody enforcement is verified."),
                        ),
                    ]),
                );
            }
        }
        if let Some(custody) = get(transform, "custody") {
            add("stored-custody", custody.clone());
            for channel in ["history", "snapshots", "exports", "feeds", "caches"] {
                add(
                    "propagation",
                    object(vec![
                        ("channel", string(channel)),
                        (
                            "declaration",
                            get(get(custody, "propagation").unwrap_or(&Value::Null), channel)
                                .cloned()
                                .unwrap_or(Value::Null),
                        ),
                    ]),
                );
            }
            if let Some(action) = text(get(custody, "vaultWriteAction")) {
                if !role(&action, "vault-write") {
                    reject("Exact separately purposed vault-write action required");
                }
                add(
                    "vault-write-action",
                    object(vec![("action", string(&action))]),
                );
            }
        }
        let reversibility = text(get(transform, "reversibility")).unwrap_or_default();
        if matches!(reversibility.as_str(), "keyed" | "vault") {
            let action = text(get(transform, "reverseAction"));
            if action
                .as_deref()
                .is_none_or(|action| !role(action, "reverse"))
            {
                reject("Exact separately purposed reverse action required");
            }
            if let Some(action) = action {
                add(
                    "reverse-action",
                    object(vec![
                        ("action", string(&action)),
                        ("reversibility", string(&reversibility)),
                    ]),
                );
            }
        } else if get(transform, "reverseAction").is_some() {
            reject("Reverse action contradicts non-reversing declaration");
        }
    }
    drop(reject);
    diagnostics.push(diag(
        "PROTECTION_OBLIGATIONS_UNVERIFIED",
        "",
        "Declared and preserved; enforcement unqualified. No operation-owner route compatibility, source authenticity, algorithm execution, current permission or native vault/key custody verified.",
        "warning",
    ));
    Ok(finish(!failed, diagnostics, obligations))
}

fn dependency_reads(
    expr: &Value,
    target: &Value,
    ontology: &Value,
    docs: &[Value],
    variables: &[(Utf16, Value)],
    fields: &mut std::collections::BTreeMap<RefKey, Value>,
    associations: &mut std::collections::BTreeMap<RefKey, Value>,
) {
    let add_ref = |reference: &Value, map: &mut std::collections::BTreeMap<RefKey, Value>| {
        if let Some(key) = ref_key(reference) {
            map.entry(key).or_insert_with(|| reference.clone());
        }
    };
    let key_reads = |binding: &Value, fields: &mut std::collections::BTreeMap<RefKey, Value>| {
        for key in key_fields(binding, docs) {
            add_ref(&key, fields);
        }
    };
    let read_term = |term: &Value,
                     target: &Value,
                     variables: &[(Utf16, Value)],
                     fields: &mut std::collections::BTreeMap<RefKey, Value>| {
        let kind = text(get(term, "kind")).unwrap_or_default();
        if kind == "constant" {
            return;
        }
        if let Some(reference) = get(term, "field") {
            add_ref(reference, fields);
            return;
        }
        let binding = match kind.as_str() {
            "subject" => find_binding(get(ontology, "subject").unwrap_or(&Value::Null), ontology),
            "resource" => Some(target),
            "variable" => text(get(term, "name")).map(Utf16::from).and_then(|name| {
                variables
                    .iter()
                    .rev()
                    .find(|(n, _)| n == &name)
                    .map(|(_, b)| b)
            }),
            _ => None,
        };
        if let Some(binding) = binding {
            if get(term, "identity") == Some(&Value::Bool(true)) {
                key_reads(binding, fields);
            } else if let Some(endpoint) = text(get(term, "endpoint")) {
                if let Some(ep) = array(get(binding, "endpoints"))
                    .iter()
                    .find(|e| text(get(e, "role")).as_deref() == Some(endpoint.as_str()))
                {
                    for field in array(get(ep, "fields")) {
                        add_ref(field, fields);
                    }
                    if let Some(t) = get(ep, "target").and_then(|r| find_binding(r, ontology)) {
                        key_reads(t, fields);
                    }
                }
            }
        }
    };
    match text(get(expr, "op")).as_deref() {
        Some("eq") => {
            for name in ["left", "right"] {
                if let Some(term) = get(expr, name) {
                    read_term(term, target, variables, fields);
                }
            }
        }
        Some("and") | Some("or") => {
            for child in array(get(expr, "args")) {
                dependency_reads(
                    child,
                    target,
                    ontology,
                    docs,
                    variables,
                    fields,
                    associations,
                )
            }
        }
        Some("not") => {
            if let Some(child) = get(expr, "arg") {
                dependency_reads(
                    child,
                    target,
                    ontology,
                    docs,
                    variables,
                    fields,
                    associations,
                )
            }
        }
        Some("exists") => {
            let assoc_ref = get(expr, "association").unwrap_or(&Value::Null);
            if let Some(assoc) = array(get(ontology, "associations"))
                .iter()
                .find(|a| get(a, "type").is_some_and(|r| same_ref(r, assoc_ref)))
            {
                add_ref(get(assoc, "type").unwrap_or(&Value::Null), associations);
                let mut nested = variables.to_vec();
                nested.push((
                    Utf16::from(text(get(expr, "as")).unwrap_or_default()),
                    assoc.clone(),
                ));
                if let Some(child) = get(expr, "where") {
                    dependency_reads(child, target, ontology, docs, &nested, fields, associations);
                }
            }
        }
        _ => {}
    }
}
pub fn require_security_interpretation(
    source: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = inspect_security_policy(source, Some(resolution), ctx)?;
    if get(&inspected, "valid") != Some(&Value::Bool(true))
        || get(&inspected, "complete") != Some(&Value::Bool(true))
    {
        return Err(EngineError::new(
            "SECURITY_INTERPRETATION",
            Utf16::default(),
            "Security interpretation refused",
        ));
    }
    Ok(inspected)
}
fn require_policy(
    source: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value), EngineError> {
    let inspected = require_security_interpretation(source, resolution, ctx)?;
    Ok((
        get(&inspected, "source").cloned().unwrap_or(Value::Null),
        get(&inspected, "resolution")
            .cloned()
            .unwrap_or(Value::Null),
    ))
}
pub fn security_policy_dependencies(
    source: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, resolution) = require_policy(source, resolution, ctx)?;
    let ontology = get(&resolution, "ontology").unwrap_or(&Value::Null);
    let docs = array(get(&resolution, "documents"));
    let mut fields = std::collections::BTreeMap::new();
    let mut associations = std::collections::BTreeMap::new();
    for rule in array(get(&source, "rules")) {
        for target in array(get(rule, "target")) {
            if let Some(binding) = find_binding(target, ontology) {
                if let Some(expr) = get(rule, "condition") {
                    dependency_reads(
                        expr,
                        binding,
                        ontology,
                        docs,
                        &[],
                        &mut fields,
                        &mut associations,
                    );
                }
            }
        }
    }
    Ok(object(vec![
        ("fields", Value::Array(fields.into_values().collect())),
        (
            "associations",
            Value::Array(associations.into_values().collect()),
        ),
    ]))
}
pub fn security_identity_transport_dependencies(
    source: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, resolution) = require_policy(source, resolution, ctx)?;
    let ontology = get(&resolution, "ontology").unwrap_or(&Value::Null);
    let docs = array(get(&resolution, "documents"));
    let dependencies = security_policy_dependencies(&source, &resolution, ctx)?;
    let policy_fields = array(get(&dependencies, "fields")).to_vec();
    let mut selected = std::collections::BTreeMap::<RefKey, Value>::new();
    let mut select = |reference: &Value| {
        if let (Some(key), Some(binding)) = (ref_key(reference), find_binding(reference, ontology))
        {
            selected.entry(key).or_insert_with(|| binding.clone());
        }
    };
    if let Some(subject) = get(ontology, "subject") {
        select(subject);
    }
    for rule in array(get(&source, "rules")) {
        for target in array(get(rule, "target")) {
            select(target);
        }
    }
    for assoc in array(get(&dependencies, "associations")) {
        select(assoc);
    }
    drop(select);
    let current = selected.values().cloned().collect::<Vec<_>>();
    for binding in current {
        for endpoint in array(get(&binding, "endpoints")) {
            if let Some(target) = get(endpoint, "target") {
                if let (Some(key), Some(binding)) =
                    (ref_key(target), find_binding(target, ontology))
                {
                    selected.entry(key).or_insert_with(|| binding.clone());
                }
            }
        }
    }
    let mut all_fields = std::collections::BTreeMap::<RefKey, Value>::new();
    for field in &policy_fields {
        if let Some(key) = ref_key(field) {
            all_fields.insert(key, field.clone());
        }
    }
    let mut records = Vec::new();
    for (type_key, binding) in selected {
        let key_id = get(&binding, "keyId").cloned().unwrap_or(Value::Null);
        let keyfields = key_fields(&binding, docs);
        for field in &keyfields {
            if let Some(key) = ref_key(field) {
                all_fields.insert(key, field.clone());
            }
        }
        let endpoints = array(get(&binding, "endpoints"));
        let mut endpoint_values = Vec::new();
        for endpoint in endpoints {
            let fields = array(get(endpoint, "fields")).to_vec();
            for field in &fields {
                if let Some(key) = ref_key(field) {
                    all_fields.insert(key, field.clone());
                }
            }
            endpoint_values.push(object(vec![
                (
                    "role",
                    get(endpoint, "role").cloned().unwrap_or(Value::Null),
                ),
                (
                    "target",
                    get(endpoint, "target").cloned().unwrap_or(Value::Null),
                ),
                ("fields", Value::Array(fields)),
            ]));
        }
        records.push(object(vec![
            ("type", ref_value(&type_key)),
            ("keyId", key_id),
            ("keyFields", Value::Array(keyfields)),
            ("endpoints", Value::Array(endpoint_values)),
        ]));
    }
    Ok(object(vec![
        ("policyFields", Value::Array(policy_fields)),
        ("fields", Value::Array(all_fields.into_values().collect())),
        (
            "associations",
            get(&dependencies, "associations")
                .cloned()
                .unwrap_or(Value::Array(Vec::new())),
        ),
        ("records", Value::Array(records)),
    ]))
}
