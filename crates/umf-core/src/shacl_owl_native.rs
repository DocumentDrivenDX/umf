// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native SHACL subset and OWL RDF view kernels.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    rdf::{self, RdfRuntime},
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ShaclPath {
    Predicate(Utf16),
    Sequence(Vec<ShaclPath>),
    Alternative(Vec<ShaclPath>),
    Inverse(Box<ShaclPath>),
    ZeroOrMore(Box<ShaclPath>),
    OneOrMore(Box<ShaclPath>),
    ZeroOrOne(Box<ShaclPath>),
}
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn diagnostic(code: &str, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        (u("code"), Value::string_utf8(code)),
        (u("path"), Value::string_utf8("")),
        (u("severity"), Value::string_utf8(severity)),
        (u("message"), Value::string_utf8(message)),
    ])
}
fn shacl_scope(document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let modules = values(member(document, "modules"));
    let module = modules
        .iter()
        .find(|m| text(member(m, "id")) == Some(&u("dataset")))
        .ok_or_else(|| {
            EngineError::new("SHACL_PAYLOAD", Utf16::default(), "Missing dataset module")
        })?;
    let element = values(member(module, "elements"))
        .iter()
        .find(|e| text(member(e, "id")) == Some(&u("dataset")))
        .ok_or_else(|| {
            EngineError::new("SHACL_PAYLOAD", Utf16::default(), "Missing dataset element")
        })?;
    let payload = member(
        member(element, "extensions").ok_or_else(|| {
            EngineError::new("SHACL_PAYLOAD", Utf16::default(), "Missing extensions")
        })?,
        "umf.shacl",
    )
    .ok_or_else(|| EngineError::new("SHACL_PAYLOAD", Utf16::default(), "Missing SHACL payload"))?;
    copy_json(
        member(payload, "blankNodeScope").unwrap_or(&Value::Null),
        ctx,
    )
}
pub fn shacl_path_value(path: &ShaclPath, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match path {
        ShaclPath::Predicate(iri) => {
            ctx.charge_text(iri.len(), Utf16::default())?;
            Ok(Value::Object(vec![
                (u("kind"), Value::string_utf8("predicate")),
                (u("iri"), Value::String(iri.clone())),
            ]))
        }
        ShaclPath::Sequence(paths) | ShaclPath::Alternative(paths) => {
            let mut values = Vec::new();
            reserve_items(&mut values, paths.len(), ctx)?;
            for child in paths {
                values.push(shacl_path_value(child, ctx)?);
            }
            Ok(Value::Object(vec![
                (
                    u("kind"),
                    Value::string_utf8(if matches!(path, ShaclPath::Sequence(_)) {
                        "sequence"
                    } else {
                        "alternative"
                    }),
                ),
                (u("paths"), Value::Array(values)),
            ]))
        }
        ShaclPath::Inverse(inner)
        | ShaclPath::ZeroOrMore(inner)
        | ShaclPath::OneOrMore(inner)
        | ShaclPath::ZeroOrOne(inner) => Ok(Value::Object(vec![
            (
                u("kind"),
                Value::string_utf8(match path {
                    ShaclPath::Inverse(_) => "inverse",
                    ShaclPath::ZeroOrMore(_) => "zeroOrMore",
                    ShaclPath::OneOrMore(_) => "oneOrMore",
                    _ => "zeroOrOne",
                }),
            ),
            (u("path"), shacl_path_value(inner, ctx)?),
        ])),
    }
}
trait ValueRef<'a> {
    fn as_value(self) -> Option<&'a Value>;
}
impl<'a> ValueRef<'a> for &'a Value {
    fn as_value(self) -> Option<&'a Value> {
        Some(self)
    }
}
impl<'a, 'b> ValueRef<'a> for &'b &'a Value {
    fn as_value(self) -> Option<&'a Value> {
        Some(*self)
    }
}
impl<'a> ValueRef<'a> for Option<&'a Value> {
    fn as_value(self) -> Option<&'a Value> {
        self
    }
}
fn member<'a>(v: impl ValueRef<'a>, key: &str) -> Option<&'a Value> {
    let v = v.as_value()?;
    match v {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &u(key)).map(|(_, v)| v),
        _ => None,
    }
}
fn field<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    member(v, key)
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn values(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn term_eq(a: &Value, b: &Value) -> bool {
    let ak = text(member(a, "kind"));
    let bk = text(member(b, "kind"));
    let av = text(member(a, "value"));
    let bv = text(member(b, "value"));
    ak == bk
        && av == bv
        && text(member(a, "datatype")) == text(member(b, "datatype"))
        && text(member(a, "language")) == text(member(b, "language"))
}
fn term_key(v: &Value) -> Vec<u16> {
    let mut out = Vec::new();
    for name in ["kind", "value", "datatype", "language"] {
        if let Some(s) = text(member(v, name)) {
            let length = s.len() as u64;
            for shift in [48, 32, 16, 0] {
                out.push(((length >> shift) & 0xffff) as u16);
            }
            out.extend_from_slice(s.units());
        } else {
            out.extend_from_slice(&[0, 0, 0, 0]);
        }
    }
    out
}
fn term_key_metered(v: &Value, ctx: &mut Context<'_>) -> Result<Vec<u16>, EngineError> {
    let units = ["kind", "value", "datatype", "language"]
        .iter()
        .filter_map(|name| text(member(v, name)))
        .fold(16usize, |total, value| total.saturating_add(value.len()));
    ctx.charge_work(units, Utf16::default())?;
    Ok(term_key(v))
}
fn reserve_items<T>(
    items: &mut Vec<T>,
    additional: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(additional, Utf16::default())?;
    items.try_reserve(additional).map_err(|_| {
        EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Native collection allocation failed",
        )
    })
}
fn quads(rt: &RdfRuntime, doc: &Value, ctx: &mut Context<'_>) -> Result<Vec<Value>, EngineError> {
    let value = rdf::get_rdf_quads(rt, doc, ctx)?;
    let rows = values(Some(&value));
    ctx.charge_work(rows.len(), Utf16::default())?;
    rows.iter().map(|row| copy_json(row, ctx)).collect()
}
fn domain_rdf_document(
    document: &Value,
    extension: &str,
    version_field: &str,
    version: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let admitted = copy_json(document, ctx)?;
    validate_full_domain_document(&admitted, extension, ctx)?;
    validate_domain_envelope_shape(&admitted, ctx)?;
    let expected_version = u("0.1.0");
    let vocabulary = member(&admitted, "vocabularies").and_then(|v| member(v, extension));
    if text(vocabulary.and_then(|v| member(v, "version"))) != Some(&expected_version) {
        return Err(EngineError::new(
            "RDF_PAYLOAD",
            Utf16::default(),
            "Expected pinned domain graph vocabulary",
        ));
    }
    let modules = values(member(&admitted, "modules"));
    let module = modules
        .iter()
        .find(|m| text(member(m, "id")) == Some(&u("dataset")))
        .ok_or_else(|| {
            EngineError::new("RDF_PAYLOAD", Utf16::default(), "Expected dataset module")
        })?;
    let element = values(member(module, "elements"))
        .iter()
        .find(|e| text(member(e, "id")) == Some(&u("dataset")))
        .ok_or_else(|| {
            EngineError::new("RDF_PAYLOAD", Utf16::default(), "Expected dataset element")
        })?;
    let payload = member(
        member(element, "extensions").ok_or_else(|| {
            EngineError::new("RDF_PAYLOAD", Utf16::default(), "Expected graph extension")
        })?,
        extension,
    )
    .ok_or_else(|| {
        EngineError::new(
            "RDF_PAYLOAD",
            Utf16::default(),
            "Expected domain graph payload",
        )
    })?;
    if text(member(payload, version_field)) != Some(&u(version)) {
        return Err(EngineError::new(
            "RDF_PAYLOAD",
            Utf16::default(),
            "Unsupported domain graph payload version",
        ));
    }
    let mut rdf_payload = copy_json(payload, ctx)?;
    if let Value::Object(fields) = &mut rdf_payload {
        fields.retain(|(key, _)| key != &u(version_field));
    }
    let core = member(&admitted, "umf").cloned().ok_or_else(|| {
        EngineError::new("RDF_DOCUMENT", Utf16::default(), "Core version missing")
    })?;
    Ok(Value::Object(vec![
        (u("umf"), core),
        (u("id"), Value::string_utf8(format!("{extension}:graph"))),
        (
            u("vocabularies"),
            Value::Object(vec![(
                u("umf.rdf"),
                Value::Object(vec![(u("version"), Value::String(expected_version))]),
            )]),
        ),
        (
            u("modules"),
            Value::Array(vec![Value::Object(vec![
                (u("id"), Value::string_utf8("dataset")),
                (u("namespace"), Value::string_utf8("")),
                (
                    u("elements"),
                    Value::Array(vec![Value::Object(vec![
                        (u("id"), Value::string_utf8("dataset")),
                        (
                            u("extensions"),
                            Value::Object(vec![(u("umf.rdf"), rdf_payload)]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ]))
}

struct NoopDomainCapabilities;
impl Capabilities for NoopDomainCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn validate_full_domain_document(
    document: &Value,
    extension: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let validation = inspect_domain_document(document, extension, ctx)?;
    if validation.valid {
        Ok(())
    } else {
        Err(EngineError::new(
            "RDF_DOCUMENT",
            Utf16::default(),
            "Full UMF core and family schema validation failed",
        ))
    }
}

fn inspect_domain_document(
    document: &Value,
    extension: &str,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let length = source.encode_utf16().count();
        ctx.charge_text(length, Utf16::default())?;
        let units = source.encode_utf16().collect::<Vec<_>>();
        crate::serialization::read_json_value(&units, crate::serialization::Format::Json, ctx)
    }
    let engine = Engine::new(
        ResourceSet::new(
            read(include_str!("../../../spec/core/schema.json"), ctx)?,
            read(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let package = match extension {
        "umf.shacl" => read(
            include_str!("../../../spec/extensions/shacl/package.json"),
            ctx,
        )?,
        "umf.owl" => read(
            include_str!("../../../spec/extensions/owl/package.json"),
            ctx,
        )?,
        _ => {
            return Err(EngineError::new(
                "RDF_PAYLOAD",
                Utf16::default(),
                "Unsupported domain graph package",
            ))
        }
    };
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = crate::registry::Registry::new();
    registry.register(&package, None, engine.package_schema(), &resources, ctx)?;
    let validation =
        engine.validate_document(document, &registry, &mut NoopDomainCapabilities, ctx)?;
    Ok(validation)
}

fn validation_value(
    validation: Validation,
    family: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut diagnostics = Vec::new();
    for diagnostic in validation.diagnostics {
        reserve_items(&mut diagnostics, 1, ctx)?;
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_text(
            diagnostic.code.len() + diagnostic.path.len() + diagnostic.message.len(),
            Utf16::default(),
        )?;
        diagnostics.push(Value::Object(vec![
            (u("code"), Value::String(diagnostic.code)),
            (u("path"), Value::String(diagnostic.path)),
            (u("message"), Value::String(diagnostic.message)),
            (
                u("severity"),
                Value::string_utf8(if diagnostic.severity == Severity::Error {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]));
    }
    reserve_items(&mut diagnostics, 1, ctx)?;
    diagnostics.push(diagnostic(
        if family == "umf.shacl" { "SHACL_SCOPE" } else { "OWL_SCOPE" },
        if family == "umf.shacl" {
            "SHACL engine support is a native subset; source graph remains authoritative."
        } else {
            "OWL 2 graph preservation only; reasoning, consistency, profiles, and import resolution are not implemented."
        },
        "warning",
    ));
    Ok(Value::Object(vec![
        (u("valid"), Value::Bool(validation.valid)),
        (u("complete"), Value::Bool(false)),
        (u("diagnostics"), Value::Array(diagnostics)),
    ]))
}

pub fn inspect_shacl_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validation_value(
        inspect_domain_document(document, "umf.shacl", ctx)?,
        "umf.shacl",
        ctx,
    )
}

fn domain_payload_document(
    payload: &Value,
    family: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (version_field, version) = if family == "umf.shacl" {
        ("shaclVersion", "1.0")
    } else {
        ("owlVersion", "2")
    };
    let mut payload = copy_json(payload, ctx)?;
    let Value::Object(fields) = &mut payload else {
        return Err(EngineError::new(
            "RDF_PAYLOAD",
            Utf16::default(),
            "Expected family payload object",
        ));
    };
    if !fields.iter().any(|(key, _)| key == &u(version_field)) {
        fields.push((u(version_field), Value::string_utf8(version)));
    }
    Ok(Value::Object(vec![
        (u("umf"), Value::string_utf8("0.10.0")),
        (u("id"), Value::string_utf8(format!("{family}:payload"))),
        (
            u("vocabularies"),
            Value::Object(vec![(
                u(family),
                Value::Object(vec![(u("version"), Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (
            u("modules"),
            Value::Array(vec![Value::Object(vec![
                (u("id"), Value::string_utf8("dataset")),
                (u("namespace"), Value::string_utf8("")),
                (
                    u("elements"),
                    Value::Array(vec![Value::Object(vec![
                        (u("id"), Value::string_utf8("dataset")),
                        (u("extensions"), Value::Object(vec![(u(family), payload)])),
                    ])]),
                ),
            ])]),
        ),
    ]))
}

pub fn inspect_shacl_payload(payload: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let document = domain_payload_document(payload, "umf.shacl", ctx)?;
    let result = inspect_shacl_document(&document, ctx)?;
    copy_json(member(&result, "diagnostics").unwrap_or(&Value::Null), ctx)
}

pub fn inspect_owl_document(document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    validation_value(
        inspect_domain_document(document, "umf.owl", ctx)?,
        "umf.owl",
        ctx,
    )
}

pub fn inspect_owl_payload(payload: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let document = domain_payload_document(payload, "umf.owl", ctx)?;
    let result = inspect_owl_document(&document, ctx)?;
    copy_json(member(&result, "diagnostics").unwrap_or(&Value::Null), ctx)
}
fn validate_domain_envelope_shape(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let fail = || {
        EngineError::new(
            "RDF_DOCUMENT",
            Utf16::default(),
            "Malformed UMF document envelope",
        )
    };
    if text(member(document, "umf")) != Some(&u("0.10.0"))
        || text(member(document, "id")).is_none()
        || !matches!(member(document, "vocabularies"), Some(Value::Object(_)))
    {
        return Err(fail());
    }
    let Some(Value::Array(modules)) = member(document, "modules") else {
        return Err(fail());
    };
    let mut module_ids = BTreeSet::new();
    let mut work = 0usize;
    for module in modules {
        work += 1;
        ctx.charge_work(1, Utf16::default())?;
        let Some(module_id) = text(member(module, "id")) else {
            return Err(fail());
        };
        if !module_ids.insert(module_id.units().to_vec())
            || text(member(module, "namespace")).is_none()
        {
            return Err(fail());
        }
        let Some(Value::Array(elements)) = member(module, "elements") else {
            return Err(fail());
        };
        let mut element_ids = BTreeSet::new();
        for element in elements {
            work += 1;
            ctx.charge_work(1, Utf16::default())?;
            let Some(id) = text(member(element, "id")) else {
                return Err(fail());
            };
            if !element_ids.insert(id.units().to_vec())
                || !matches!(member(element, "extensions"), Some(Value::Object(_)))
            {
                return Err(fail());
            }
        }
    }
    let _ = work;
    Ok(())
}
fn shacl_quads(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let rdf = domain_rdf_document(doc, "umf.shacl", "shaclVersion", "1.0", ctx)?;
    rdf::export_rdf_turtle(rt, &rdf, ctx)?;
    quads(rt, &rdf, ctx)
}
pub fn get_shacl_quads(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(Value::Array(shacl_quads(rt, document, ctx)?))
}
fn owl_quads(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let rdf = domain_rdf_document(doc, "umf.owl", "owlVersion", "2", ctx)?;
    rdf::export_rdf_turtle(rt, &rdf, ctx)?;
    quads(rt, &rdf, ctx)
}
pub fn get_owl_quads(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(Value::Array(owl_quads(rt, document, ctx)?))
}
fn rdf_to_domain_document(
    rdf_document: &Value,
    extension: &str,
    version_field: &str,
    version: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut document = copy_json(rdf_document, ctx)?;
    if let Value::Object(fields) = &mut document {
        if let Some((_, Value::Object(vocabularies))) =
            fields.iter_mut().find(|(k, _)| k == &u("vocabularies"))
        {
            vocabularies.retain(|(key, _)| key != &u("umf.rdf"));
            let version = Value::Object(vec![(u("version"), Value::string_utf8("0.1.0"))]);
            if let Some((_, old)) = vocabularies.iter_mut().find(|(k, _)| k == &u(extension)) {
                *old = version;
            } else {
                vocabularies.push((u(extension), version));
            }
        }
        if let Some((_, Value::Array(modules))) =
            fields.iter_mut().find(|(k, _)| k == &u("modules"))
        {
            for module in modules {
                let Value::Object(module_fields) = module else {
                    continue;
                };
                let Some((_, Value::Array(elements))) =
                    module_fields.iter_mut().find(|(k, _)| k == &u("elements"))
                else {
                    continue;
                };
                for element in elements {
                    let Value::Object(element_fields) = element else {
                        continue;
                    };
                    let Some((_, Value::Object(extensions))) = element_fields
                        .iter_mut()
                        .find(|(k, _)| k == &u("extensions"))
                    else {
                        continue;
                    };
                    let Some(index) = extensions.iter().position(|(k, _)| k == &u("umf.rdf"))
                    else {
                        continue;
                    };
                    let (_, mut payload) = extensions.remove(index);
                    if let Value::Object(payload_fields) = &mut payload {
                        payload_fields.push((u(version_field), Value::string_utf8(version)));
                    }
                    extensions.push((u(extension), payload));
                }
            }
        }
    }
    Ok(document)
}

pub fn import_owl_turtle(
    rt: &RdfRuntime,
    source: &[u16],
    id: &Utf16,
    base_iri: &Utf16,
    blank_node_scope: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rdf_document = rdf::import_rdf_turtle(rt, source, id, base_iri, blank_node_scope, ctx)?;
    let document = rdf_to_domain_document(&rdf_document, "umf.owl", "owlVersion", "2", ctx)?;
    let projected = domain_rdf_document(&document, "umf.owl", "owlVersion", "2", ctx)?;
    rdf::export_rdf_turtle(rt, &projected, ctx)?;
    Ok(document)
}

pub fn import_shacl_turtle(
    rt: &RdfRuntime,
    source: &[u16],
    id: &Utf16,
    base_iri: &Utf16,
    blank_node_scope: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rdf_document = rdf::import_rdf_turtle(rt, source, id, base_iri, blank_node_scope, ctx)?;
    let document = rdf_to_domain_document(&rdf_document, "umf.shacl", "shaclVersion", "1.0", ctx)?;
    let projected = domain_rdf_document(&document, "umf.shacl", "shaclVersion", "1.0", ctx)?;
    rdf::export_rdf_turtle(rt, &projected, ctx)?;
    Ok(document)
}

pub fn export_shacl_turtle(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let rdf_document = domain_rdf_document(document, "umf.shacl", "shaclVersion", "1.0", ctx)?;
    rdf::export_rdf_turtle(rt, &rdf_document, ctx)
}

pub fn export_owl_turtle(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let rdf_document = domain_rdf_document(document, "umf.owl", "owlVersion", "2", ctx)?;
    rdf::export_rdf_turtle(rt, &rdf_document, ctx)
}

pub fn propose_shacl_quad_edit(
    rt: &RdfRuntime,
    document: &Value,
    index: usize,
    replacement: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rdf_document = domain_rdf_document(document, "umf.shacl", "shaclVersion", "1.0", ctx)?;
    let (edited, validation) =
        rdf::propose_rdf_quad_edit(rt, &rdf_document, index, replacement, ctx)?;
    let mut next = copy_json(document, ctx)?;
    let payload = find_domain_payload(&edited, "umf.rdf", ctx)?;
    replace_domain_payload(&mut next, "umf.shacl", "shaclVersion", "1.0", payload, ctx)?;
    let projected = domain_rdf_document(&next, "umf.shacl", "shaclVersion", "1.0", ctx)?;
    rdf::export_rdf_turtle(rt, &projected, ctx)?;
    let mut diagnostics = Vec::new();
    for d in validation.diagnostics {
        reserve_items(&mut diagnostics, 1, ctx)?;
        ctx.charge_text(
            d.code.len() + d.path.len() + d.message.len(),
            Utf16::default(),
        )?;
        diagnostics.push(Value::Object(vec![
            (u("code"), Value::String(d.code)),
            (u("path"), Value::String(d.path)),
            (u("message"), Value::String(d.message)),
            (
                u("severity"),
                Value::string_utf8(if d.severity == Severity::Error {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]));
    }
    Ok(Value::Object(vec![
        (u("document"), next),
        (
            u("validation"),
            Value::Object(vec![
                (u("valid"), Value::Bool(validation.valid)),
                (u("complete"), Value::Bool(false)),
                (u("diagnostics"), Value::Array(diagnostics)),
            ]),
        ),
    ]))
}

fn find_domain_payload(
    document: &Value,
    extension: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    for module in values(member(document, "modules")) {
        for element in values(member(module, "elements")) {
            if let Some(payload) = member(
                member(element, "extensions").unwrap_or(&Value::Null),
                extension,
            ) {
                return copy_json(payload, ctx);
            }
        }
    }
    Err(EngineError::new(
        "OWL_PAYLOAD",
        Utf16::default(),
        "Edited RDF payload is missing",
    ))
}

fn replace_domain_payload(
    document: &mut Value,
    extension: &str,
    version_field: &str,
    version: &str,
    mut payload: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Value::Object(fields) = &mut payload {
        fields.push((u(version_field), Value::string_utf8(version)));
    }
    let Value::Object(root) = document else {
        return Err(EngineError::new(
            "OWL_DOCUMENT",
            Utf16::default(),
            "Expected document object",
        ));
    };
    let Some((_, Value::Array(modules))) = root.iter_mut().find(|(key, _)| key == &u("modules"))
    else {
        return Err(EngineError::new(
            "OWL_DOCUMENT",
            Utf16::default(),
            "Expected document modules",
        ));
    };
    for module in modules {
        let Value::Object(members) = module else {
            continue;
        };
        let Some((_, Value::Array(elements))) =
            members.iter_mut().find(|(key, _)| key == &u("elements"))
        else {
            continue;
        };
        for element in elements {
            let Value::Object(members) = element else {
                continue;
            };
            let Some((_, Value::Object(extensions))) =
                members.iter_mut().find(|(key, _)| key == &u("extensions"))
            else {
                continue;
            };
            if let Some((_, old)) = extensions.iter_mut().find(|(key, _)| key == &u(extension)) {
                ctx.charge_work(1, Utf16::default())?;
                *old = payload;
                return Ok(());
            }
        }
    }
    Err(EngineError::new(
        "OWL_PAYLOAD",
        Utf16::default(),
        "Expected existing OWL payload",
    ))
}

pub fn propose_owl_quad_edit(
    rt: &RdfRuntime,
    document: &Value,
    index: usize,
    replacement: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rdf_document = domain_rdf_document(document, "umf.owl", "owlVersion", "2", ctx)?;
    let (edited, validation) =
        rdf::propose_rdf_quad_edit(rt, &rdf_document, index, replacement, ctx)?;
    let mut next = copy_json(document, ctx)?;
    let payload = find_domain_payload(&edited, "umf.rdf", ctx)?;
    replace_domain_payload(&mut next, "umf.owl", "owlVersion", "2", payload, ctx)?;
    let projected = domain_rdf_document(&next, "umf.owl", "owlVersion", "2", ctx)?;
    rdf::export_rdf_turtle(rt, &projected, ctx)?;
    let mut diagnostics = Vec::new();
    for d in validation.diagnostics {
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_text(
            d.code
                .len()
                .saturating_add(d.path.len())
                .saturating_add(d.message.len()),
            Utf16::default(),
        )?;
        diagnostics.push(Value::Object(vec![
            (u("code"), Value::String(d.code)),
            (u("path"), Value::String(d.path)),
            (u("message"), Value::String(d.message)),
            (
                u("severity"),
                Value::string_utf8(if d.severity == crate::error::Severity::Error {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]));
    }
    Ok(Value::Object(vec![
        (u("document"), next),
        (
            u("validation"),
            Value::Object(vec![
                (u("valid"), Value::Bool(validation.valid)),
                (u("complete"), Value::Bool(validation.complete)),
                (u("diagnostics"), Value::Array(diagnostics)),
            ]),
        ),
    ]))
}
fn remap_blank_terms(
    document: &mut Value,
    extension: &str,
    prefix: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    fn remap(term: &mut Value, prefix: &str, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        let is_blank = text(member(&*term, "kind")) == Some(&u("blank"));
        if !is_blank {
            return Ok(());
        }
        let Value::Object(fields) = term else {
            return Ok(());
        };
        if let Some((_, Value::String(label))) =
            fields.iter_mut().find(|(key, _)| key == &u("value"))
        {
            let extra = prefix.encode_utf16().count();
            ctx.charge_text(
                label.len().saturating_mul(4).saturating_add(extra),
                Utf16::default(),
            )?;
            let mut encoded =
                String::with_capacity(prefix.len().saturating_add(label.len().saturating_mul(4)));
            encoded.push_str(prefix);
            for unit in label.units() {
                encoded.push_str(&format!("{unit:04x}"));
            }
            *label = Utf16::from(encoded);
        }
        Ok(())
    }
    let Value::Object(root) = document else {
        return Ok(());
    };
    let Some((_, Value::Array(modules))) = root.iter_mut().find(|(key, _)| key == &u("modules"))
    else {
        return Ok(());
    };
    for module in modules {
        let Value::Object(module_fields) = module else {
            continue;
        };
        let Some((_, Value::Array(elements))) = module_fields
            .iter_mut()
            .find(|(key, _)| key == &u("elements"))
        else {
            continue;
        };
        for element in elements {
            let Value::Object(element_fields) = element else {
                continue;
            };
            let Some((_, Value::Object(extensions))) = element_fields
                .iter_mut()
                .find(|(key, _)| key == &u("extensions"))
            else {
                continue;
            };
            let Some((_, payload)) = extensions.iter_mut().find(|(key, _)| key == &u(extension))
            else {
                continue;
            };
            let Some((_, Value::Array(rows))) = (match payload {
                Value::Object(fields) => fields.iter_mut().find(|(key, _)| key == &u("quads")),
                _ => None,
            }) else {
                continue;
            };
            for row in rows {
                ctx.charge_work(1, Utf16::default())?;
                if let Value::Object(fields) = row {
                    for name in ["subject", "object", "graph"] {
                        if let Some((_, term)) = fields.iter_mut().find(|(key, _)| key == &u(name))
                        {
                            remap(term, prefix, ctx)?;
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
fn path_error(message: &str) -> EngineError {
    EngineError::new("SHACL_PATH", Utf16::default(), message)
}

pub fn get_shacl_property_path(
    rt: &RdfRuntime,
    doc: &Value,
    shape: &Value,
    ctx: &mut Context<'_>,
) -> Result<ShaclPath, EngineError> {
    let qs = shacl_quads(rt, doc, ctx)?;
    let mut work = 0usize;
    let mut active = BTreeSet::new();
    fn outgoing<'a>(
        qs: &'a [Value],
        node: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<&'a Value>, EngineError> {
        ctx.charge_work(qs.len(), Utf16::default())?;
        Ok(qs
            .iter()
            .filter(|q| member(q, "subject").is_some_and(|s| term_eq(s, node)))
            .collect())
    }
    fn unique_outgoing<'a>(
        qs: &'a [Value],
        node: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<&'a Value>, EngineError> {
        let mut unique = BTreeMap::new();
        for row in outgoing(qs, node, ctx)? {
            let mut key = term_key_metered(member(row, "subject").unwrap_or(&Value::Null), ctx)?;
            key.extend(term_key_metered(
                member(row, "predicate").unwrap_or(&Value::Null),
                ctx,
            )?);
            key.extend(term_key_metered(
                member(row, "object").unwrap_or(&Value::Null),
                ctx,
            )?);
            unique.entry(key).or_insert(row);
        }
        Ok(unique.into_values().collect())
    }
    fn objects(
        qs: &[Value],
        node: &Value,
        pred: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Value>, EngineError> {
        let mut out = Vec::new();
        for q in outgoing(qs, node, ctx)? {
            if text(member(
                member(q, "predicate").unwrap_or(&Value::Null),
                "value",
            )) == Some(&u(pred))
            {
                let value = member(q, "object").unwrap_or(&Value::Null);
                if !out.iter().any(|x| term_eq(x, value)) {
                    reserve_items(&mut out, 1, ctx)?;
                    out.push(copy_json(value, ctx)?);
                }
            }
        }
        Ok(out)
    }
    fn list(
        qs: &[Value],
        head: &Value,
        work: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Value>, EngineError> {
        let mut n = copy_json(head, ctx)?;
        let mut seen = BTreeSet::new();
        let mut out = Vec::new();
        loop {
            *work += 1;
            ctx.charge_work(1, Utf16::default())?;
            if *work > 10_000 {
                return Err(path_error("Path structure exceeds 10,000 steps"));
            }
            if text(member(&n, "kind")) == Some(&u("iri"))
                && text(member(&n, "value"))
                    == Some(&u("http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"))
            {
                if !objects(
                    qs,
                    &n,
                    "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
                    ctx,
                )?
                .is_empty()
                    || !objects(
                        qs,
                        &n,
                        "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",
                        ctx,
                    )?
                    .is_empty()
                {
                    return Err(path_error("rdf:nil cannot have list values"));
                }
                break;
            }
            if text(member(&n, "kind")) == Some(&u("literal"))
                || !seen.insert(term_key_metered(&n, ctx)?)
            {
                return Err(path_error("Expected an acyclic SHACL list"));
            }
            let first = objects(
                qs,
                &n,
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
                ctx,
            )?;
            let rest = objects(
                qs,
                &n,
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",
                ctx,
            )?;
            if first.len() != 1 || rest.len() != 1 {
                return Err(path_error("List needs exactly one rdf:first and rdf:rest"));
            }
            reserve_items(&mut out, 1, ctx)?;
            out.push(copy_json(&first[0], ctx)?);
            n = copy_json(&rest[0], ctx)?;
        }
        Ok(out)
    }
    fn compile(
        qs: &[Value],
        n: &Value,
        depth: usize,
        work: &mut usize,
        active: &mut BTreeSet<Vec<u16>>,
        ctx: &mut Context<'_>,
    ) -> Result<ShaclPath, EngineError> {
        *work += 1;
        ctx.charge_work(1, Utf16::default())?;
        if *work > 10_000 || depth > 128 {
            return Err(path_error("Path structure limit exceeded"));
        }
        match text(member(n, "kind")) {
            Some(kind) if kind == &u("iri") => {
                return Ok(ShaclPath::Predicate(
                    text(member(n, "value")).cloned().unwrap_or_default(),
                ))
            }
            Some(kind) if kind == &u("blank") => {}
            _ => return Err(path_error("Literal cannot be a property path")),
        }
        let key = term_key_metered(n, ctx)?;
        ctx.charge_work(key.len(), Utf16::default())?;
        if !active.insert(key.clone()) {
            return Err(path_error("Recursive property path"));
        }
        let result = (|| {
            let rows = unique_outgoing(qs, n, ctx)?;
            if rows.iter().any(|q| {
                text(member(
                    member(q, "predicate").unwrap_or(&Value::Null),
                    "value",
                )) == Some(&u("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"))
            }) {
                if text(member(n, "kind")) != Some(&u("blank")) {
                    return Err(path_error("Sequence path head must be a blank node"));
                }
                let members = list(qs, n, work, ctx)?;
                if members.len() < 2 {
                    return Err(path_error("Sequence needs at least two members"));
                }
                return Ok(ShaclPath::Sequence({
                    ctx.charge_work(members.len(), Utf16::default())?;
                    members
                        .iter()
                        .map(|v| compile(qs, v, depth + 1, work, active, ctx))
                        .collect::<Result<_, _>>()?
                }));
            }
            if rows.len() != 1 {
                return Err(path_error(
                    "Unary/alternative path needs exactly one outgoing triple",
                ));
            }
            let pred = text(member(
                member(rows[0], "predicate").unwrap_or(&Value::Null),
                "value",
            ))
            .cloned()
            .unwrap_or_default();
            let object =
                member(rows[0], "object").ok_or_else(|| path_error("Path object missing"))?;
            if pred == u("http://www.w3.org/ns/shacl#alternativePath") {
                let members = list(qs, object, work, ctx)?;
                if members.len() < 2 {
                    return Err(path_error("Alternative needs at least two members"));
                }
                return Ok(ShaclPath::Alternative({
                    ctx.charge_work(members.len(), Utf16::default())?;
                    members
                        .iter()
                        .map(|v| compile(qs, v, depth + 1, work, active, ctx))
                        .collect::<Result<_, _>>()?
                }));
            }
            let unary = match pred.to_utf8().ok().as_deref() {
                Some("http://www.w3.org/ns/shacl#inversePath") => 0,
                Some("http://www.w3.org/ns/shacl#zeroOrMorePath") => 1,
                Some("http://www.w3.org/ns/shacl#oneOrMorePath") => 2,
                Some("http://www.w3.org/ns/shacl#zeroOrOnePath") => 3,
                _ => return Err(path_error("Unknown path operator")),
            };
            let child = Box::new(compile(qs, object, depth + 1, work, active, ctx)?);
            Ok(match unary {
                0 => ShaclPath::Inverse(child),
                1 => ShaclPath::ZeroOrMore(child),
                2 => ShaclPath::OneOrMore(child),
                _ => ShaclPath::ZeroOrOne(child),
            })
        })();
        active.remove(&key);
        result
    }
    let paths = objects(&qs, shape, "http://www.w3.org/ns/shacl#path", ctx)?;
    if paths.len() != 1 {
        return Err(path_error("Property shape needs exactly one sh:path"));
    }
    compile(&qs, &paths[0], 0, &mut work, &mut active, ctx)
}

pub fn evaluate_shacl_property_path(
    rt: &RdfRuntime,
    shapes: &Value,
    shape: &Value,
    data: &Value,
    focus: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let path = get_shacl_property_path(rt, shapes, shape, ctx)?;
    let graphs = rdf::get_rdf_named_graphs(rt, data, ctx)?;
    if !values(Some(&graphs)).is_empty() {
        return Err(EngineError::new(
            "SHACL_GRAPH",
            Utf16::default(),
            "Expected one data graph",
        ));
    }
    let qs = quads(rt, data, ctx)?;
    let mut work = 0usize;
    fn run(
        qs: &[Value],
        path: &ShaclPath,
        starts: &[Value],
        inverse: bool,
        work: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Value>, EngineError> {
        *work += 1;
        ctx.charge_work(1, Utf16::default())?;
        if *work > 1_000_000 {
            return Err(EngineError::new(
                "SHACL_LIMIT",
                Utf16::default(),
                "Path evaluation exceeds 1,000,000 work steps",
            ));
        }
        let unique =
            |items: Vec<Value>, ctx: &mut Context<'_>| -> Result<Vec<Value>, EngineError> {
                let mut seen = BTreeSet::new();
                let mut result = Vec::new();
                ctx.charge_work(items.len(), Utf16::default())?;
                for item in items {
                    if seen.insert(term_key_metered(&item, ctx)?) {
                        reserve_items(&mut result, 1, ctx)?;
                        result.push(item);
                    }
                }
                Ok(result)
            };
        match path {
            ShaclPath::Predicate(iri) => {
                let mut out = Vec::new();
                ctx.charge_work(qs.len(), Utf16::default())?;
                for q in qs {
                    *work += 1;
                    if *work > 1_000_000 {
                        return Err(EngineError::new(
                            "SHACL_LIMIT",
                            Utf16::default(),
                            "Path evaluation limit",
                        ));
                    }
                    let p = text(member(
                        member(q, "predicate").unwrap_or(&Value::Null),
                        "value",
                    ));
                    let left = member(q, if inverse { "object" } else { "subject" });
                    if p == Some(iri) && left.is_some_and(|v| starts.iter().any(|s| term_eq(s, v)))
                    {
                        if let Some(v) = member(q, if inverse { "subject" } else { "object" }) {
                            reserve_items(&mut out, 1, ctx)?;
                            out.push(copy_json(v, ctx)?);
                        }
                    }
                }
                unique(out, ctx)
            }
            ShaclPath::Inverse(p) => run(qs, p, starts, !inverse, work, ctx),
            ShaclPath::Alternative(ps) => {
                let mut out = Vec::new();
                for p in ps {
                    let more = run(qs, p, starts, inverse, work, ctx)?;
                    reserve_items(&mut out, more.len(), ctx)?;
                    out.extend(more);
                }
                unique(out, ctx)
            }
            ShaclPath::Sequence(ps) => {
                let mut found = Vec::new();
                reserve_items(&mut found, starts.len(), ctx)?;
                for value in starts {
                    found.push(copy_json(value, ctx)?);
                }
                if inverse {
                    for p in ps.iter().rev() {
                        found = run(qs, p, &found, true, work, ctx)?;
                    }
                } else {
                    for p in ps {
                        found = run(qs, p, &found, false, work, ctx)?;
                    }
                }
                Ok(found)
            }
            ShaclPath::ZeroOrOne(p) => {
                let mut out = Vec::new();
                reserve_items(&mut out, starts.len(), ctx)?;
                for value in starts {
                    out.push(copy_json(value, ctx)?);
                }
                let more = run(qs, p, starts, inverse, work, ctx)?;
                reserve_items(&mut out, more.len(), ctx)?;
                out.extend(more);
                unique(out, ctx)
            }
            ShaclPath::ZeroOrMore(p) | ShaclPath::OneOrMore(p) => {
                let zero = matches!(path, ShaclPath::ZeroOrMore(_));
                let mut found = BTreeMap::new();
                if zero {
                    for n in starts {
                        let key = term_key_metered(n, ctx)?;
                        found.insert(key, copy_json(n, ctx)?);
                    }
                }
                let mut frontier = Vec::new();
                reserve_items(&mut frontier, starts.len(), ctx)?;
                for value in starts {
                    frontier.push(copy_json(value, ctx)?);
                }
                while !frontier.is_empty() {
                    let next = run(qs, p, &frontier, inverse, work, ctx)?;
                    frontier = Vec::new();
                    for n in next {
                        let k = term_key_metered(&n, ctx)?;
                        if !found.contains_key(&k) {
                            found.insert(k, copy_json(&n, ctx)?);
                            frontier.push(n);
                        }
                    }
                }
                ctx.charge_work(found.len(), Utf16::default())?;
                Ok(found.into_values().collect())
            }
        }
    }
    let initial = [copy_json(focus, ctx)?];
    run(&qs, &path, &initial, false, &mut work, ctx)
}

/// Returns the SHACL Core target union. This is target selection only; it does
/// not perform constraint validation, entailment, or remote import resolution.
pub fn get_shacl_target_nodes(
    rt: &RdfRuntime,
    shapes: &Value,
    shape: &Value,
    data: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let sq = quads(rt, shapes, ctx)?;
    let dq = quads(rt, data, ctx)?;
    if !values(Some(&rdf::get_rdf_named_graphs(rt, data, ctx)?)).is_empty() {
        return Err(EngineError::new(
            "SHACL_GRAPH",
            Utf16::default(),
            "Expected one data graph",
        ));
    }
    let kind = text(member(shape, "kind"));
    if !matches!(kind,Some(k) if k==&u("iri")||k==&u("blank")) {
        return Err(EngineError::new(
            "SHACL_TARGET",
            Utf16::default(),
            "Expected an RDF node identifying the shape",
        ));
    }
    if sq.iter().any(|q| {
        let p = text(member(
            member(q, "predicate").unwrap_or(&Value::Null),
            "value",
        ));
        p == Some(&u("http://www.w3.org/2002/07/owl#imports"))
            || p == Some(&u("http://www.w3.org/ns/shacl#entailment"))
    }) {
        return Err(EngineError::new("SHACL_TARGET_UNSUPPORTED",Utf16::default(),"Imports and entailment declarations require explicit processing before target selection"));
    }
    ctx.charge_work(sq.len(), Utf16::default())?;
    let selected_shape = sq
        .iter()
        .filter(|q| member(q, "subject").is_some_and(|s| term_eq(s, shape)))
        .collect::<Vec<_>>();
    if selected_shape.iter().any(|q| {
        text(member(
            member(q, "predicate").unwrap_or(&Value::Null),
            "value",
        )) == Some(&u("http://www.w3.org/ns/shacl#target"))
    }) {
        return Err(EngineError::new(
            "SHACL_TARGET_UNSUPPORTED",
            Utf16::default(),
            "Custom targets are not implemented",
        ));
    }
    let mut selected = BTreeMap::<Vec<u16>, Value>::new();
    let mut classes = Vec::<Value>::new();
    let mut work = 0usize;
    fn tick(work: &mut usize, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        *work += 1;
        if *work > 1_000_000 {
            Err(EngineError::new(
                "SHACL_LIMIT",
                Utf16::default(),
                "Target selection exceeds 1,000,000 work steps",
            ))
        } else {
            ctx.charge_work(1, Utf16::default())
        }
    }
    let (rdf_type, rdfs_sub) = (
        u("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        u("http://www.w3.org/2000/01/rdf-schema#subClassOf"),
    );
    for q in &selected_shape {
        tick(&mut work, ctx)?;
        let p = text(member(
            member(q, "predicate").unwrap_or(&Value::Null),
            "value",
        ))
        .cloned()
        .unwrap_or_default();
        let o = member(q, "object").ok_or_else(|| {
            EngineError::new("SHACL_TARGET", Utf16::default(), "Target object missing")
        })?;
        match p.to_utf8().ok().as_deref() {
            Some("http://www.w3.org/ns/shacl#targetNode") => {
                let key = term_key_metered(o, ctx)?;
                if !selected.contains_key(&key) {
                    selected.insert(key, copy_json(o, ctx)?);
                }
            }
            Some("http://www.w3.org/ns/shacl#targetClass") => {
                if text(member(o, "kind")) != Some(&u("iri")) {
                    return Err(EngineError::new(
                        "SHACL_TARGET",
                        Utf16::default(),
                        "Class and predicate targets require IRIs",
                    ));
                }
                reserve_items(&mut classes, 1, ctx)?;
                classes.push(copy_json(o, ctx)?);
            }
            Some("http://www.w3.org/ns/shacl#targetSubjectsOf")
            | Some("http://www.w3.org/ns/shacl#targetObjectsOf") => {
                if text(member(o, "kind")) != Some(&u("iri")) {
                    return Err(EngineError::new(
                        "SHACL_TARGET",
                        Utf16::default(),
                        "Class and predicate targets require IRIs",
                    ));
                }
                let subjects = p == u("http://www.w3.org/ns/shacl#targetSubjectsOf");
                for t in &dq {
                    tick(&mut work, ctx)?;
                    if member(member(t, "predicate").unwrap_or(&Value::Null), "value")
                        == member(o, "value")
                    {
                        if let Some(term) = member(t, if subjects { "subject" } else { "object" }) {
                            let key = term_key_metered(term, ctx)?;
                            if !selected.contains_key(&key) {
                                selected.insert(key, copy_json(term, ctx)?);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    // SHACL's implicit class target applies only to shape resources explicitly
    // typed as NodeShape/PropertyShape and rdfs:Class in the shapes graph.
    let instance = |node: &Value, class: &str, rows: &[Value]| {
        rows.iter().any(|q| {
            member(q, "subject").is_some_and(|s| term_eq(s, node))
                && member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                    == Some(&Value::String(rdf_type.clone()))
                && member(member(q, "object").unwrap_or(&Value::Null), "value")
                    == Some(&Value::String(u(class)))
        })
    };
    if (instance(shape, "http://www.w3.org/ns/shacl#NodeShape", &sq)
        || instance(shape, "http://www.w3.org/ns/shacl#PropertyShape", &sq))
        && instance(shape, "http://www.w3.org/2000/01/rdf-schema#Class", &sq)
    {
        if text(member(shape, "kind")) != Some(&u("iri")) {
            return Err(EngineError::new(
                "SHACL_TARGET",
                Utf16::default(),
                "Implicit class target shape must be an IRI",
            ));
        }
        reserve_items(&mut classes, 1, ctx)?;
        classes.push(copy_json(shape, ctx)?);
    }
    for class in classes {
        let mut closure = BTreeMap::<Vec<u16>, Value>::new();
        let mut todo = Vec::new();
        reserve_items(&mut todo, 1, ctx)?;
        todo.push(class);
        while let Some(current) = todo.pop() {
            tick(&mut work, ctx)?;
            let current_key = term_key_metered(&current, ctx)?;
            if closure.contains_key(&current_key) {
                continue;
            }
            closure.insert(current_key, copy_json(&current, ctx)?);
            for q in &dq {
                tick(&mut work, ctx)?;
                if member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                    == Some(&Value::String(rdfs_sub.clone()))
                    && member(q, "object").is_some_and(|o| term_eq(o, &current))
                {
                    if let Some(s) = member(q, "subject") {
                        reserve_items(&mut todo, 1, ctx)?;
                        todo.push(copy_json(s, ctx)?);
                    }
                }
            }
        }
        for q in &dq {
            tick(&mut work, ctx)?;
            if member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                != Some(&Value::String(rdf_type.clone()))
            {
                continue;
            }
            let Some(object) = member(q, "object") else {
                continue;
            };
            let object_key = term_key_metered(object, ctx)?;
            if closure.contains_key(&object_key) {
                if let Some(s) = member(q, "subject") {
                    let key = term_key_metered(s, ctx)?;
                    if !selected.contains_key(&key) {
                        selected.insert(key, copy_json(s, ctx)?);
                    }
                }
            }
        }
    }
    Ok(Value::Array(selected.into_values().collect()))
}

/// Loss-preserving declared SHACL metadata projection. This deliberately does
/// not infer constraint behavior; the original graph remains in `source`.
pub fn get_shacl_shape_metadata(
    rt: &RdfRuntime,
    document: &Value,
    shape: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    if !matches!(text(member(shape, "kind")), Some(k) if k == &u("iri") || k == &u("blank"))
        || text(member(shape, "value")).is_none()
    {
        return Err(EngineError::new(
            "SHACL_METADATA_NODE",
            Utf16::default(),
            "Expected an IRI or source-scoped blank node",
        ));
    }
    let rows = shacl_quads(rt, &source, ctx)?;
    let sh = "http://www.w3.org/ns/shacl#";
    let path_predicate = u(&format!("{sh}path"));
    let property_predicate = format!("{sh}property");
    let ann: BTreeSet<&str> = ["name", "description", "order", "group", "defaultValue"]
        .into_iter()
        .collect();
    let constraints: BTreeSet<&str> = [
        "class",
        "datatype",
        "nodeKind",
        "minCount",
        "maxCount",
        "minExclusive",
        "minInclusive",
        "maxExclusive",
        "maxInclusive",
        "minLength",
        "maxLength",
        "pattern",
        "flags",
        "languageIn",
        "uniqueLang",
        "equals",
        "disjoint",
        "lessThan",
        "lessThanOrEquals",
        "not",
        "and",
        "or",
        "xone",
        "node",
        "property",
        "qualifiedValueShape",
        "qualifiedMinCount",
        "qualifiedMaxCount",
        "qualifiedValueShapesDisjoint",
        "closed",
        "ignoredProperties",
        "hasValue",
        "in",
    ]
    .into_iter()
    .collect();
    let controls: BTreeSet<&str> = [
        "targetNode",
        "targetClass",
        "targetSubjectsOf",
        "targetObjectsOf",
        "severity",
        "message",
        "deactivated",
    ]
    .into_iter()
    .collect();
    let mut diagnostics = vec![diagnostic("SHACL_METADATA_DECLARED", "Declared metadata only; constraints are not validated or enforced. Referenced graphs and unknown predicates remain in source. Property expansion is one level; blank identifiers use the source scope.", "warning")];
    fn describe(
        rt: &RdfRuntime,
        document: &Value,
        rows: &[Value],
        node: &Value,
        sh: &str,
        path_predicate: &Utf16,
        ann: &BTreeSet<&str>,
        constraints: &BTreeSet<&str>,
        controls: &BTreeSet<&str>,
        diagnostics: &mut Vec<Value>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut fields: BTreeMap<Vec<u16>, (Utf16, Vec<Value>, Vec<Value>)> = BTreeMap::new();
        for (i, q) in rows.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            if !member(q, "subject").is_some_and(|s| term_eq(s, node)) {
                continue;
            }
            let p = member(q, "predicate").unwrap_or(&Value::Null);
            let Some(predicate) = text(member(p, "value")) else {
                continue;
            };
            ctx.charge_work(predicate.len().saturating_mul(2), Utf16::default())?;
            let k = predicate.units().to_vec();
            let entry = fields
                .entry(k)
                .or_insert_with(|| (predicate.clone(), Vec::new(), Vec::new()));
            let object = member(q, "object").unwrap_or(&Value::Null);
            if !entry.1.iter().any(|v| term_eq(v, object)) {
                ctx.charge_work(1, Utf16::default())?;
                entry.1.push(copy_json(object, ctx)?);
            }
            ctx.charge_work(1, Utf16::default())?;
            entry.2.push(Value::Number(i as f64));
        }
        let mut groups: [Vec<Value>; 4] = std::array::from_fn(|_| Vec::new());
        let mut path = Value::Object(vec![(u("status"), Value::string_utf8("absent"))]);
        for (_, (predicate, vals, indexes)) in fields {
            if predicate == *path_predicate {
                let parsed = get_shacl_property_path(rt, document, node, ctx);
                path = match parsed {
                    Ok(ast) => Value::Object(vec![
                        (u("status"), Value::string_utf8("compiled")),
                        (u("value"), shacl_path_value(&ast, ctx)?),
                    ]),
                    Err(err) if err.is_control_failure() || err.code == "LIMIT" => {
                        return Err(err);
                    }
                    Err(err) => {
                        let message = String::from_utf16_lossy(err.message.units());
                        diagnostics.push(diagnostic("SHACL_METADATA_PATH", &message, "warning"));
                        Value::Object(vec![
                            (u("status"), Value::string_utf8("invalid")),
                            (u("message"), Value::String(err.message)),
                        ])
                    }
                };
                continue;
            }
            let local = String::from_utf16_lossy(predicate.units())
                .strip_prefix(sh)
                .unwrap_or("")
                .to_owned();
            let group = if ann.contains(local.as_str()) {
                0
            } else if constraints.contains(local.as_str()) {
                1
            } else if controls.contains(local.as_str()) {
                2
            } else {
                3
            };
            groups[group].push(Value::Object(vec![
                (u("predicate"), Value::String(predicate)),
                (u("values"), Value::Array(vals)),
                (u("quadIndexes"), Value::Array(indexes)),
            ]));
        }
        if groups.iter().all(Vec::is_empty)
            && matches!(member(&path, "status").and_then(|x| text(Some(x))), Some(s) if s == &u("absent"))
        {
            diagnostics.push(diagnostic(
                "SHACL_METADATA_UNDESCRIBED",
                &format!(
                    "Selected node has no outgoing statements: {}",
                    text(member(node, "value"))
                        .map(|x| String::from_utf16_lossy(x.units()))
                        .unwrap_or_default()
                ),
                "warning",
            ));
        }
        Ok(Value::Object(vec![
            (u("node"), copy_json(node, ctx)?),
            (
                u("annotations"),
                Value::Array(std::mem::take(&mut groups[0])),
            ),
            (
                u("constraints"),
                Value::Array(std::mem::take(&mut groups[1])),
            ),
            (u("controls"), Value::Array(std::mem::take(&mut groups[2]))),
            (
                u("uninterpreted"),
                Value::Array(std::mem::take(&mut groups[3])),
            ),
            (u("path"), path),
        ]))
    }
    let root = describe(
        rt,
        &source,
        &rows,
        shape,
        sh,
        &path_predicate,
        &ann,
        &constraints,
        &controls,
        &mut diagnostics,
        ctx,
    )?;
    let mut properties = Vec::new();
    for field in values(member(&root, "constraints")) {
        if text(member(field, "predicate")) != Some(&u(&property_predicate)) {
            continue;
        }
        for property in values(member(field, "values")) {
            if text(member(property, "kind")) == Some(&u("literal")) {
                diagnostics.push(diagnostic(
                    "SHACL_METADATA_PROPERTY",
                    "Literal sh:property value retained without inventing a property shape",
                    "warning",
                ));
            } else {
                properties.push(describe(
                    rt,
                    &source,
                    &rows,
                    property,
                    sh,
                    &path_predicate,
                    &ann,
                    &constraints,
                    &controls,
                    &mut diagnostics,
                    ctx,
                )?);
            }
        }
    }
    let scope = shacl_scope(&source, ctx)?;
    Ok(Value::Object(vec![
        (u("profile"), Value::string_utf8("shacl-metadata-1")),
        (u("complete"), Value::Bool(false)),
        (u("source"), source),
        (u("blankNodeScope"), scope),
        (u("shape"), root),
        (u("properties"), Value::Array(properties)),
        (u("diagnostics"), Value::Array(diagnostics)),
    ]))
}

/// Minimal explicit native SHACL subset. It evaluates
/// targetNode/targetClass and property paths with minCount/maxCount only; other
/// constraint semantics are refused rather than treated as passing.
#[derive(Clone)]
struct NativeShaclViolation {
    focus: Value,
    path: Option<Value>,
    shape: Value,
    component: &'static str,
    value: Option<Value>,
    message: &'static str,
    message_values: Vec<Value>,
    severity: Option<Value>,
}

fn shacl_report_quad(subject: Value, predicate: &str, object: Value) -> Value {
    Value::Object(vec![
        (u("subject"), subject),
        (
            u("predicate"),
            Value::Object(vec![
                (u("kind"), Value::string_utf8("iri")),
                (u("value"), Value::string_utf8(predicate)),
            ]),
        ),
        (u("object"), object),
        (
            u("graph"),
            Value::Object(vec![(u("kind"), Value::string_utf8("default"))]),
        ),
    ])
}

fn shacl_report_literal(value: &str, datatype: &str) -> Value {
    Value::Object(vec![
        (u("kind"), Value::string_utf8("literal")),
        (u("value"), Value::string_utf8(value)),
        (u("datatype"), Value::string_utf8(datatype)),
    ])
}

fn shacl_report_iri(value: &str) -> Value {
    Value::Object(vec![
        (u("kind"), Value::string_utf8("iri")),
        (u("value"), Value::string_utf8(value)),
    ])
}

fn shacl_report_blank(value: &str) -> Value {
    Value::Object(vec![
        (u("kind"), Value::string_utf8("blank")),
        (u("value"), Value::string_utf8(value)),
    ])
}

fn shacl_validation_report_nquads(
    violations: &[NativeShaclViolation],
    conforms: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let rdf_type = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    let sh = "http://www.w3.org/ns/shacl#";
    let xsd = "http://www.w3.org/2001/XMLSchema#";
    let report = shacl_report_blank("report");
    let mut rows = Vec::new();
    reserve_items(&mut rows, 2 + violations.len().saturating_mul(10), ctx)?;
    rows.push(shacl_report_quad(
        report.clone(),
        rdf_type,
        shacl_report_iri(&format!("{sh}ValidationReport")),
    ));
    rows.push(shacl_report_quad(
        report.clone(),
        &format!("{sh}conforms"),
        shacl_report_literal(
            if conforms { "true" } else { "false" },
            &format!("{xsd}boolean"),
        ),
    ));
    for (index, violation) in violations.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let result_name = format!("result{index}");
        let result = shacl_report_blank(&result_name);
        rows.push(shacl_report_quad(
            report.clone(),
            &format!("{sh}result"),
            result.clone(),
        ));
        rows.push(shacl_report_quad(
            result.clone(),
            rdf_type,
            shacl_report_iri(&format!("{sh}ValidationResult")),
        ));
        rows.push(shacl_report_quad(
            result.clone(),
            &format!("{sh}focusNode"),
            copy_json(&violation.focus, ctx)?,
        ));
        if let Some(path) = &violation.path {
            rows.push(shacl_report_quad(
                result.clone(),
                &format!("{sh}resultPath"),
                copy_json(path, ctx)?,
            ));
        }
        rows.push(shacl_report_quad(
            result.clone(),
            &format!("{sh}sourceShape"),
            copy_json(&violation.shape, ctx)?,
        ));
        rows.push(shacl_report_quad(
            result.clone(),
            &format!("{sh}sourceConstraintComponent"),
            shacl_report_iri(&format!("{sh}{}ConstraintComponent", violation.component)),
        ));
        rows.push(shacl_report_quad(
            result.clone(),
            &format!("{sh}resultSeverity"),
            violation
                .severity
                .as_ref()
                .map(|severity| copy_json(severity, ctx))
                .transpose()?
                .unwrap_or_else(|| shacl_report_iri(&format!("{sh}Violation"))),
        ));
        if violation.message_values.is_empty() {
            rows.push(shacl_report_quad(
                result.clone(),
                &format!("{sh}resultMessage"),
                shacl_report_literal(violation.message, &format!("{xsd}string")),
            ));
        } else {
            for (message_index, message) in violation.message_values.iter().enumerate() {
                if message_index > 0 {
                    reserve_items(&mut rows, 1, ctx)?;
                }
                rows.push(shacl_report_quad(
                    result.clone(),
                    &format!("{sh}resultMessage"),
                    copy_json(message, ctx)?,
                ));
            }
        }
        if let Some(value) = &violation.value {
            rows.push(shacl_report_quad(
                result,
                &format!("{sh}value"),
                copy_json(value, ctx)?,
            ));
        }
    }
    let serialized = rdf::serialize_nquads_values(&Value::Array(rows), ctx)?;
    Ok(serialized)
}

fn apply_shacl_report_metadata(
    qs: &[Value],
    violations: &mut [NativeShaclViolation],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    const SH: &str = "http://www.w3.org/ns/shacl#";
    for violation in violations {
        for row in qs.iter().filter(|row| {
            member(row, "subject").is_some_and(|subject| term_eq(subject, &violation.shape))
        }) {
            ctx.charge_work(1, Utf16::default())?;
            match text(member(member(row, "predicate"), "value")) {
                Some(predicate) if predicate == &u(&format!("{SH}message")) => {
                    let message = member(row, "object").ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:message has no value",
                        )
                    })?;
                    if text(member(message, "kind")) != Some(&u("literal")) {
                        return Err(EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:message must be a literal",
                        ));
                    }
                    reserve_items(&mut violation.message_values, 1, ctx)?;
                    violation.message_values.push(copy_json(message, ctx)?);
                }
                Some(predicate) if predicate == &u(&format!("{SH}severity")) => {
                    let severity = member(row, "object").ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:severity has no value",
                        )
                    })?;
                    let iri = text(member(severity, "value")).ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:severity must be an IRI",
                        )
                    })?;
                    if !["Violation", "Warning", "Info"]
                        .iter()
                        .any(|name| iri == &u(&format!("{SH}{name}")))
                    {
                        return Err(EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "Unsupported sh:severity IRI",
                        ));
                    }
                    violation.severity = Some(copy_json(severity, ctx)?);
                }
                _ => {}
            }
        }
    }
    Ok(())
}

fn shacl_count_parameter(value: &Value, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let datatype = text(member(value, "datatype"));
    let lexical = text(member(value, "value")).ok_or_else(|| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Count parameter must be an integer literal",
        )
    })?;
    ctx.charge_text(lexical.len(), Utf16::default())?;
    let lexical = lexical.to_utf8().map_err(|_| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Count parameter is not well-formed UTF-16",
        )
    })?;
    if datatype != Some(&u("http://www.w3.org/2001/XMLSchema#integer"))
        || lexical.starts_with('-')
        || !lexical.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Constraint bound must be a nonnegative xsd:integer",
        ));
    }
    lexical.parse::<usize>().map_err(|_| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Constraint bound exceeds the supported native range",
        )
    })
}

fn shacl_list_values(
    qs: &[Value],
    head: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    let mut result = Vec::new();
    let mut seen = BTreeSet::new();
    let mut cursor = copy_json(head, ctx)?;
    for _ in 0..10_000 {
        ctx.charge_work(1, Utf16::default())?;
        if text(member(&cursor, "kind")) == Some(&u("iri"))
            && text(member(&cursor, "value")) == Some(&u(&format!("{rdf}nil")))
        {
            return Ok(result);
        }
        let cursor_key = term_key_metered(&cursor, ctx)?;
        if !seen.insert(cursor_key) {
            return Err(EngineError::new(
                "SHACL_ENGINE_UNSUPPORTED",
                Utf16::default(),
                "Cyclic SHACL list",
            ));
        }
        let mut first = None;
        let mut rest = None;
        for quad in qs {
            ctx.charge_work(1, Utf16::default())?;
            if !term_eq(member(quad, "subject").unwrap_or(&Value::Null), &cursor) {
                continue;
            }
            match text(member(member(quad, "predicate"), "value")) {
                Some(predicate) if predicate == &u(&format!("{rdf}first")) => {
                    if first.is_some() {
                        first = Some(&Value::Null);
                        break;
                    }
                    first = member(quad, "object");
                }
                Some(predicate) if predicate == &u(&format!("{rdf}rest")) => {
                    if rest.is_some() {
                        rest = Some(&Value::Null);
                        break;
                    }
                    rest = member(quad, "object");
                }
                _ => (),
            }
        }
        if first.is_none_or(|term| matches!(term, Value::Null))
            || rest.is_none_or(|term| matches!(term, Value::Null))
        {
            return Err(EngineError::new(
                "SHACL_ENGINE_UNSUPPORTED",
                Utf16::default(),
                "SHACL list cells require one rdf:first and rdf:rest",
            ));
        }
        reserve_items(&mut result, 1, ctx)?;
        result.push(copy_json(first.unwrap(), ctx)?);
        cursor = copy_json(rest.unwrap(), ctx)?;
    }
    Err(EngineError::new(
        "SHACL_LIMIT",
        Utf16::default(),
        "SHACL list exceeds 10,000 cells",
    ))
}

fn shacl_literal_length(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<usize>, EngineError> {
    if text(member(value, "kind")) != Some(&u("literal")) {
        return Ok(None);
    }
    let lexical = text(member(value, "value")).ok_or_else(|| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Literal lexical form is missing",
        )
    })?;
    ctx.charge_text(lexical.len(), Utf16::default())?;
    let scalar = lexical.to_utf8().map_err(|_| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Literal lexical form is not well-formed UTF-16",
        )
    })?;
    let _ = scalar;
    Ok(Some(lexical.len()))
}

fn shacl_decimal(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<(i8, String, usize)>, EngineError> {
    const XSD: &str = "http://www.w3.org/2001/XMLSchema#";
    if text(member(value, "kind")) != Some(&u("literal")) {
        return Ok(None);
    }
    let datatype = text(member(value, "datatype"));
    if !matches!(datatype, Some(dt) if dt == &u(&format!("{XSD}integer")) || dt == &u(&format!("{XSD}decimal")))
    {
        return Ok(None);
    }
    let Some(lexical) = text(member(value, "value")) else {
        return Ok(None);
    };
    ctx.charge_text(lexical.len(), Utf16::default())?;
    let lexical = lexical.to_utf8().map_err(|_| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Numeric lexical form is malformed UTF-16",
        )
    })?;
    let lexical = lexical.trim_matches(['\t', '\r', '\n', ' ']);
    let (sign, body) = match lexical.as_bytes().first() {
        Some(b'-') => (-1, &lexical[1..]),
        Some(b'+') => (1, &lexical[1..]),
        _ => (1, lexical),
    };
    let mut parts = body.split('.');
    let whole = parts.next().unwrap_or_default();
    let fraction = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || whole.is_empty() && fraction.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
        || datatype == Some(&u(&format!("{XSD}integer"))) && !fraction.is_empty()
    {
        return Ok(None);
    }
    ctx.charge_text(whole.len().saturating_add(fraction.len()), Utf16::default())?;
    let mut digits = String::with_capacity(whole.len() + fraction.len());
    digits.push_str(whole);
    digits.push_str(fraction);
    let trimmed = digits.trim_start_matches('0');
    if trimmed.is_empty() {
        return Ok(Some((0, String::from("0"), 0)));
    }
    ctx.charge_text(trimmed.len(), Utf16::default())?;
    digits = trimmed.to_owned();
    let mut scale = fraction.len();
    while scale > 0 && digits.ends_with('0') {
        digits.pop();
        scale -= 1;
    }
    Ok(Some((sign, digits, scale)))
}

fn shacl_numeric_order(
    left: &Value,
    right: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<std::cmp::Ordering>, EngineError> {
    if let (
        Some((left_sign, left_digits, left_scale)),
        Some((right_sign, right_digits, right_scale)),
    ) = (shacl_decimal(left, ctx)?, shacl_decimal(right, ctx)?)
    {
        use std::cmp::Ordering;
        if left_sign != right_sign {
            return Ok(Some(left_sign.cmp(&right_sign)));
        }
        if left_sign == 0 {
            return Ok(Some(Ordering::Equal));
        }
        let scale = left_scale.max(right_scale);
        ctx.charge_text(scale.saturating_mul(2), Utf16::default())?;
        let mut left_digits = left_digits;
        let mut right_digits = right_digits;
        left_digits.extend(std::iter::repeat_n('0', scale - left_scale));
        right_digits.extend(std::iter::repeat_n('0', scale - right_scale));
        let left_digits = left_digits.trim_start_matches('0');
        let right_digits = right_digits.trim_start_matches('0');
        let magnitude = left_digits
            .len()
            .cmp(&right_digits.len())
            .then_with(|| left_digits.cmp(right_digits));
        return Ok(Some(if left_sign < 0 {
            magnitude.reverse()
        } else {
            magnitude
        }));
    }
    const XSD: &str = "http://www.w3.org/2001/XMLSchema#";
    let ldt = text(member(left, "datatype"));
    let rdt = text(member(right, "datatype"));
    let lvalue = text(member(left, "value"));
    let rvalue = text(member(right, "value"));
    if ldt == Some(&u(&format!("{XSD}string"))) && rdt == ldt {
        let (Some(lvalue), Some(rvalue)) = (lvalue, rvalue) else {
            return Ok(None);
        };
        ctx.charge_text(lvalue.len().saturating_add(rvalue.len()), Utf16::default())?;
        let (Ok(lvalue), Ok(rvalue)) = (lvalue.to_utf8(), rvalue.to_utf8()) else {
            return Ok(None);
        };
        return Ok(Some(lvalue.cmp(&rvalue)));
    }
    let float_type = |datatype: Option<&Utf16>| {
        datatype.is_some_and(|datatype| {
            datatype == &u(&format!("{XSD}float")) || datatype == &u(&format!("{XSD}double"))
        })
    };
    if float_type(ldt) && float_type(rdt) {
        let (Some(lvalue), Some(rvalue)) = (lvalue, rvalue) else {
            return Ok(None);
        };
        ctx.charge_text(lvalue.len().saturating_add(rvalue.len()), Utf16::default())?;
        let (Ok(lvalue), Ok(rvalue)) = (lvalue.to_utf8(), rvalue.to_utf8()) else {
            return Ok(None);
        };
        let double =
            ldt == Some(&u(&format!("{XSD}double"))) || rdt == Some(&u(&format!("{XSD}double")));
        let ordering = if double {
            lvalue
                .parse::<f64>()
                .ok()
                .zip(rvalue.parse::<f64>().ok())
                .and_then(|(l, r)| l.partial_cmp(&r))
        } else {
            lvalue
                .parse::<f32>()
                .ok()
                .zip(rvalue.parse::<f32>().ok())
                .and_then(|(l, r)| l.partial_cmp(&r))
        };
        return Ok(ordering);
    }
    Ok(None)
}

fn shacl_pattern_matches(value: &str, pattern: &str, flags: &str) -> Result<bool, EngineError> {
    if pattern.len() > 4096 || value.len() > 65_536 {
        return Err(EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Pattern or lexical value exceeds the bounded regex input size",
        ));
    }
    if flags
        .chars()
        .any(|flag| !matches!(flag, 'i' | 'm' | 's' | 'x'))
    {
        return Err(EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Only the standard SHACL regex flags i, m, s, and x are supported",
        ));
    }
    let mut builder = regex::RegexBuilder::new(pattern);
    builder
        .case_insensitive(flags.contains('i'))
        .multi_line(flags.contains('m'))
        .dot_matches_new_line(flags.contains('s'))
        .ignore_whitespace(flags.contains('x'))
        .size_limit(4 * 1024 * 1024);
    let regex = builder.build().map_err(|_| {
        EngineError::new(
            "SHACL_ENGINE_UNSUPPORTED",
            Utf16::default(),
            "Invalid or over-limit sh:pattern regular expression",
        )
    })?;
    Ok(regex.is_match(value))
}

fn shacl_instance_of(
    value: &Value,
    class: &Value,
    data: &[Value],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if text(member(value, "kind")) == Some(&u("literal"))
        || text(member(class, "kind")) != Some(&u("iri"))
    {
        return Ok(false);
    }
    let rdf_type = u("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    let sub_class = u("http://www.w3.org/2000/01/rdf-schema#subClassOf");
    let mut closure = BTreeSet::new();
    let mut instance_types = Vec::<Value>::new();
    for q in data {
        ctx.charge_work(1, Utf16::default())?;
        if member(q, "subject").is_some_and(|subject| term_eq(subject, value))
            && member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                == Some(&Value::String(rdf_type.clone()))
        {
            if let Some(kind) = member(q, "object") {
                reserve_items(&mut instance_types, 1, ctx)?;
                instance_types.push(copy_json(kind, ctx)?);
            }
        }
    }
    let mut queue = instance_types;
    while let Some(current) = queue.pop() {
        ctx.charge_work(1, Utf16::default())?;
        let current_key = term_key_metered(&current, ctx)?;
        if !closure.insert(current_key) {
            continue;
        }
        for q in data {
            ctx.charge_work(1, Utf16::default())?;
            if member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                == Some(&Value::String(sub_class.clone()))
                && member(q, "subject").is_some_and(|subject| term_eq(subject, &current))
            {
                if let Some(parent) = member(q, "object") {
                    reserve_items(&mut queue, 1, ctx)?;
                    queue.push(copy_json(parent, ctx)?);
                }
            }
        }
    }
    let class_key = term_key_metered(class, ctx)?;
    if closure.contains(&class_key) {
        return Ok(true);
    }
    for q in data {
        ctx.charge_work(1, Utf16::default())?;
        if member(q, "subject").is_some_and(|subject| term_eq(subject, value))
            && member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                == Some(&Value::String(rdf_type.clone()))
        {
            if let Some(kind) = member(q, "object") {
                if closure.contains(&term_key_metered(kind, ctx)?) {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

fn push_shacl_violation(
    out: &mut Vec<NativeShaclViolation>,
    focus: &Value,
    path: Option<&Value>,
    shape: &Value,
    component: &'static str,
    value: Option<&Value>,
    message: &'static str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    reserve_items(out, 1, ctx)?;
    out.push(NativeShaclViolation {
        focus: copy_json(focus, ctx)?,
        path: path.map(|term| copy_json(term, ctx)).transpose()?,
        shape: copy_json(shape, ctx)?,
        component,
        value: value.map(|term| copy_json(term, ctx)).transpose()?,
        message,
        message_values: Vec::new(),
        severity: None,
    });
    Ok(())
}

fn shacl_direct_values(
    data: &[Value],
    focus: &Value,
    predicate: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let mut values = Vec::new();
    for quad in data {
        ctx.charge_work(1, Utf16::default())?;
        if member(quad, "subject").is_some_and(|subject| term_eq(subject, focus))
            && member(member(quad, "predicate").unwrap_or(&Value::Null), "value")
                == Some(&Value::String(predicate.clone()))
        {
            if let Some(value) = member(quad, "object") {
                reserve_items(&mut values, 1, ctx)?;
                values.push(copy_json(value, ctx)?);
            }
        }
    }
    Ok(values)
}

fn compile_nested_path(
    qs: &[Value],
    node: &Value,
    active: &mut BTreeSet<Vec<u16>>,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<ShaclPath, EngineError> {
    const RDF: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    const SH: &str = "http://www.w3.org/ns/shacl#";
    if depth > 128 {
        return Err(EngineError::new(
            "SHACL_ENGINE_RECURSION",
            Utf16::default(),
            "Nested SHACL path exceeds its depth bound",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    match text(member(node, "kind")) {
        Some(kind) if kind == &u("iri") => {
            let iri =
                text(member(node, "value")).ok_or_else(|| path_error("IRI path has no value"))?;
            ctx.charge_text(iri.len(), Utf16::default())?;
            return Ok(ShaclPath::Predicate(iri.clone()));
        }
        Some(kind) if kind == &u("blank") => {}
        _ => return Err(path_error("Path node must be an IRI or blank node")),
    }
    let key = term_key_metered(node, ctx)?;
    if !active.insert(key.clone()) {
        return Err(path_error("Recursive nested SHACL path"));
    }
    let parsed = (|| {
        let first = shacl_direct_values(qs, node, &u(&format!("{RDF}first")), ctx)?;
        if !first.is_empty() {
            let members = shacl_list_values(qs, node, ctx)?;
            if members.len() < 2 {
                return Err(path_error("A sequence path requires at least two members"));
            }
            let mut paths = Vec::new();
            reserve_items(&mut paths, members.len(), ctx)?;
            for member in members {
                paths.push(compile_nested_path(qs, &member, active, ctx, depth + 1)?);
            }
            return Ok(ShaclPath::Sequence(paths));
        }
        let operators = [
            ("alternativePath", 0),
            ("inversePath", 1),
            ("zeroOrMorePath", 2),
            ("oneOrMorePath", 3),
            ("zeroOrOnePath", 4),
        ];
        let mut found = None;
        for (name, code) in operators {
            let values = shacl_direct_values(qs, node, &u(&format!("{SH}{name}")), ctx)?;
            if !values.is_empty() {
                if values.len() != 1 || found.is_some() {
                    return Err(path_error(
                        "Nested path operator must have exactly one operand",
                    ));
                }
                found = Some((code, values[0].clone()));
            }
        }
        let Some((code, operand)) = found else {
            return Err(path_error("Unknown blank-node nested path expression"));
        };
        if code == 0 {
            let members = shacl_list_values(qs, &operand, ctx)?;
            if members.len() < 2 {
                return Err(path_error(
                    "An alternative path requires at least two members",
                ));
            }
            let mut paths = Vec::new();
            reserve_items(&mut paths, members.len(), ctx)?;
            for member in members {
                paths.push(compile_nested_path(qs, &member, active, ctx, depth + 1)?);
            }
            return Ok(ShaclPath::Alternative(paths));
        }
        let inner = Box::new(compile_nested_path(qs, &operand, active, ctx, depth + 1)?);
        Ok(match code {
            1 => ShaclPath::Inverse(inner),
            2 => ShaclPath::ZeroOrMore(inner),
            3 => ShaclPath::OneOrMore(inner),
            _ => ShaclPath::ZeroOrOne(inner),
        })
    })();
    active.remove(&key);
    parsed
}

fn evaluate_nested_path(
    data: &[Value],
    path: &ShaclPath,
    starts: &[Value],
    inverse: bool,
    ctx: &mut Context<'_>,
    work: &mut usize,
    depth: usize,
) -> Result<Vec<Value>, EngineError> {
    if depth > 128 || *work > 1_000_000 {
        return Err(EngineError::new(
            "SHACL_LIMIT",
            Utf16::default(),
            "Nested property path evaluation exceeded its bound",
        ));
    }
    *work += 1;
    ctx.charge_work(1, Utf16::default())?;
    let unique = |values: Vec<Value>, ctx: &mut Context<'_>| -> Result<Vec<Value>, EngineError> {
        let mut seen = BTreeSet::new();
        let mut result = Vec::new();
        for value in values {
            let key = term_key_metered(&value, ctx)?;
            if seen.insert(key) {
                reserve_items(&mut result, 1, ctx)?;
                result.push(value);
            }
        }
        Ok(result)
    };
    match path {
        ShaclPath::Predicate(predicate) => {
            let mut out = Vec::new();
            ctx.charge_work(data.len(), Utf16::default())?;
            for row in data {
                if text(member(member(row, "predicate"), "value")) == Some(predicate)
                    && member(row, if inverse { "object" } else { "subject" })
                        .is_some_and(|node| starts.iter().any(|start| term_eq(start, node)))
                {
                    if let Some(node) = member(row, if inverse { "subject" } else { "object" }) {
                        reserve_items(&mut out, 1, ctx)?;
                        out.push(copy_json(node, ctx)?);
                    }
                }
            }
            unique(out, ctx)
        }
        ShaclPath::Inverse(inner) => {
            evaluate_nested_path(data, inner, starts, !inverse, ctx, work, depth + 1)
        }
        ShaclPath::Alternative(paths) => {
            let mut out = Vec::new();
            for nested in paths {
                let values =
                    evaluate_nested_path(data, nested, starts, inverse, ctx, work, depth + 1)?;
                reserve_items(&mut out, values.len(), ctx)?;
                out.extend(values);
            }
            unique(out, ctx)
        }
        ShaclPath::Sequence(paths) => {
            let mut out = Vec::new();
            reserve_items(&mut out, starts.len(), ctx)?;
            for start in starts {
                out.push(copy_json(start, ctx)?);
            }
            if inverse {
                for nested in paths.iter().rev() {
                    out = evaluate_nested_path(data, nested, &out, true, ctx, work, depth + 1)?;
                }
            } else {
                for nested in paths {
                    out = evaluate_nested_path(data, nested, &out, false, ctx, work, depth + 1)?;
                }
            }
            Ok(out)
        }
        ShaclPath::ZeroOrOne(inner) => {
            let mut out = Vec::new();
            reserve_items(&mut out, starts.len(), ctx)?;
            for start in starts {
                out.push(copy_json(start, ctx)?);
            }
            let values = evaluate_nested_path(data, inner, starts, inverse, ctx, work, depth + 1)?;
            reserve_items(&mut out, values.len(), ctx)?;
            out.extend(values);
            unique(out, ctx)
        }
        ShaclPath::ZeroOrMore(inner) | ShaclPath::OneOrMore(inner) => {
            let include_starts = matches!(path, ShaclPath::ZeroOrMore(_));
            let mut found = BTreeMap::new();
            let mut frontier = Vec::new();
            reserve_items(&mut frontier, starts.len(), ctx)?;
            for start in starts {
                let key = term_key_metered(start, ctx)?;
                if include_starts {
                    found.insert(key, copy_json(start, ctx)?);
                }
                frontier.push(copy_json(start, ctx)?);
            }
            while !frontier.is_empty() {
                let next =
                    evaluate_nested_path(data, inner, &frontier, inverse, ctx, work, depth + 1)?;
                frontier.clear();
                for node in next {
                    let key = term_key_metered(&node, ctx)?;
                    if !found.contains_key(&key) {
                        found.insert(key, copy_json(&node, ctx)?);
                        frontier.push(node);
                    }
                }
            }
            ctx.charge_work(found.len(), Utf16::default())?;
            Ok(found.into_values().collect())
        }
    }
}

/// Evaluate a nested property shape without inventing target selection. The
/// nested evaluator consumes the same sequence/alternative/inverse/repetition
/// path language as the public property-path evaluator.
fn shacl_nested_shape_conforms(
    shapes: &[Value],
    data: &[Value],
    shape: &Value,
    focus: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<bool, EngineError> {
    if depth > 64 {
        return Err(EngineError::new(
            "SHACL_ENGINE_RECURSION",
            Utf16::default(),
            "Nested shape evaluation exceeded the supported depth",
        ));
    }
    let path_predicate = u("http://www.w3.org/ns/shacl#path");
    let mut declared_path = None;
    for quad in shapes.iter().filter(|quad| {
        member(quad, "subject").is_some_and(|subject| term_eq(subject, shape))
            && member(quad, "predicate").and_then(|p| member(p, "value"))
                == Some(&Value::String(path_predicate.clone()))
    }) {
        ctx.charge_work(1, Utf16::default())?;
        if declared_path.is_some() {
            return Err(EngineError::new(
                "SHACL_ENGINE_UNSUPPORTED",
                Utf16::default(),
                "Nested property shape has multiple paths",
            ));
        }
        declared_path = member(quad, "object");
    }
    let nested_values = if let Some(path) = declared_path {
        let path_ast = compile_nested_path(shapes, path, &mut BTreeSet::new(), ctx, 0)?;
        let mut work = 0;
        let values = evaluate_nested_path(
            data,
            &path_ast,
            std::slice::from_ref(focus),
            false,
            ctx,
            &mut work,
            0,
        )?;
        Some((path, values))
    } else {
        None
    };
    let mut violations = Vec::new();
    evaluate_shacl_constraints(
        shapes,
        data,
        shape,
        focus,
        nested_values.as_ref().map(|(path, _)| *path),
        nested_values
            .as_ref()
            .map(|(_, values)| values.as_slice())
            .unwrap_or_else(|| std::slice::from_ref(focus)),
        nested_values.is_some(),
        &mut violations,
        ctx,
        depth,
    )?;
    let property_predicate = u("http://www.w3.org/ns/shacl#property");
    let path_predicate = u("http://www.w3.org/ns/shacl#path");
    for link in shapes.iter().filter(|quad| {
        member(quad, "subject").is_some_and(|subject| term_eq(subject, shape))
            && member(quad, "predicate").and_then(|p| member(p, "value"))
                == Some(&Value::String(property_predicate.clone()))
    }) {
        ctx.charge_work(1, Utf16::default())?;
        let property = member(link, "object").ok_or_else(|| {
            EngineError::new(
                "SHACL_ENGINE_UNSUPPORTED",
                Utf16::default(),
                "sh:property lacks a shape",
            )
        })?;
        let mut path = None;
        for candidate in shapes.iter().filter(|quad| {
            member(quad, "subject").is_some_and(|subject| term_eq(subject, property))
                && member(quad, "predicate").and_then(|p| member(p, "value"))
                    == Some(&Value::String(path_predicate.clone()))
        }) {
            ctx.charge_work(1, Utf16::default())?;
            if path.is_some() {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "Nested property shape requires exactly one path",
                ));
            }
            path = member(candidate, "object");
        }
        let path = path.ok_or_else(|| {
            EngineError::new(
                "SHACL_ENGINE_UNSUPPORTED",
                Utf16::default(),
                "Nested property shape has no path",
            )
        })?;
        let path_iri = text(member(path, "value"))
            .filter(|_| text(member(path, "kind")) == Some(&u("iri")))
            .ok_or_else(|| {
                EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "Nested property shape supports only direct IRI paths",
                )
            })?;
        let nodes = shacl_direct_values(data, focus, path_iri, ctx)?;
        let mut nested = Vec::new();
        evaluate_shacl_constraints(
            shapes,
            data,
            property,
            focus,
            Some(path),
            &nodes,
            true,
            &mut nested,
            ctx,
            depth + 1,
        )?;
        if !nested.is_empty() {
            // Violation details of a nested shape are evidence too. They remain
            // attached to its own evaluation only; the outer report identifies
            // the logical component and focus value.
            violations.extend(nested);
        }
    }
    Ok(violations.is_empty())
}

fn evaluate_shacl_constraints(
    qs: &[Value],
    data: &[Value],
    shape: &Value,
    focus: &Value,
    path: Option<&Value>,
    value_nodes: &[Value],
    is_property_shape: bool,
    out: &mut Vec<NativeShaclViolation>,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    const SH: &str = "http://www.w3.org/ns/shacl#";
    if depth > 64 {
        return Err(EngineError::new(
            "SHACL_ENGINE_RECURSION",
            Utf16::default(),
            "Nested shape evaluation exceeded the supported depth",
        ));
    }
    ctx.charge_work(qs.len(), Utf16::default())?;
    for row in qs
        .iter()
        .filter(|row| member(row, "subject").is_some_and(|subject| term_eq(subject, shape)))
    {
        let predicate = text(member(member(row, "predicate"), "value"));
        let object = member(row, "object");
        if predicate == Some(&u(&format!("{SH}deactivated"))) {
            let object = object.ok_or_else(|| {
                EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "sh:deactivated has no value",
                )
            })?;
            if text(member(object, "kind")) != Some(&u("literal"))
                || text(member(object, "datatype"))
                    != Some(&u("http://www.w3.org/2001/XMLSchema#boolean"))
            {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "sh:deactivated must be an xsd:boolean literal",
                ));
            }
            let lexical = text(member(member(row, "object"), "value")).ok_or_else(|| {
                EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "sh:deactivated must be a boolean literal",
                )
            })?;
            if lexical == &u("true") {
                return Ok(());
            }
            if lexical != &u("false") {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "sh:deactivated has an invalid boolean lexical form",
                ));
            }
        }
        if predicate == Some(&u(&format!("{SH}message")))
            && object.is_none_or(|message| text(member(message, "kind")) != Some(&u("literal")))
        {
            return Err(EngineError::new(
                "SHACL_ENGINE_UNSUPPORTED",
                Utf16::default(),
                "sh:message must be a literal",
            ));
        }
        if predicate == Some(&u(&format!("{SH}severity"))) {
            let severity = object.ok_or_else(|| {
                EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "sh:severity has no value",
                )
            })?;
            let iri = text(member(severity, "value"));
            if text(member(severity, "kind")) != Some(&u("iri"))
                || !["Violation", "Warning", "Info"]
                    .iter()
                    .any(|name| iri == Some(&u(&format!("{SH}{name}"))))
            {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "sh:severity must be sh:Violation, sh:Warning, or sh:Info",
                ));
            }
        }
    }
    for q in qs
        .iter()
        .filter(|q| member(q, "subject").is_some_and(|subject| term_eq(subject, shape)))
    {
        let Some(predicate) = text(member(member(q, "predicate"), "value")) else {
            continue;
        };
        let Some(local) = predicate
            .to_utf8()
            .ok()
            .and_then(|full| full.strip_prefix(SH).map(str::to_owned))
        else {
            continue;
        };
        let Some(parameter) = member(q, "object") else {
            continue;
        };
        match local.as_str() {
            "qualifiedMinCount" | "qualifiedMaxCount" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Qualified count constraints require a property shape",
                    ));
                }
                let bound = shacl_count_parameter(parameter, ctx)?;
                let qualified_shape = qs
                    .iter()
                    .find(|row| {
                        member(row, "subject").is_some_and(|subject| term_eq(subject, shape))
                            && text(member(member(row, "predicate"), "value"))
                                == Some(&u(&format!("{SH}qualifiedValueShape")))
                    })
                    .and_then(|row| member(row, "object"))
                    .ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "Qualified count requires exactly one sh:qualifiedValueShape",
                        )
                    })?;
                if qs
                    .iter()
                    .filter(|row| {
                        member(row, "subject").is_some_and(|subject| term_eq(subject, shape))
                            && text(member(member(row, "predicate"), "value"))
                                == Some(&u(&format!("{SH}qualifiedValueShape")))
                    })
                    .count()
                    != 1
                {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Qualified count requires exactly one sh:qualifiedValueShape",
                    ));
                }
                let disjoint_term = qs
                    .iter()
                    .find(|row| {
                        member(row, "subject").is_some_and(|subject| term_eq(subject, shape))
                            && text(member(member(row, "predicate"), "value"))
                                == Some(&u(&format!("{SH}qualifiedValueShapesDisjoint")))
                    })
                    .and_then(|row| member(row, "object"));
                let disjoint = match disjoint_term {
                    None => false,
                    Some(value)
                        if text(member(value, "kind")) == Some(&u("literal"))
                            && text(member(value, "datatype"))
                                == Some(&u("http://www.w3.org/2001/XMLSchema#boolean"))
                            && text(member(value, "value")) == Some(&u("false")) =>
                    {
                        false
                    }
                    Some(value)
                        if text(member(value, "kind")) == Some(&u("literal"))
                            && text(member(value, "datatype"))
                                == Some(&u("http://www.w3.org/2001/XMLSchema#boolean"))
                            && text(member(value, "value")) == Some(&u("true")) =>
                    {
                        true
                    }
                    Some(_) => {
                        return Err(EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:qualifiedValueShapesDisjoint must be a boolean literal",
                        ));
                    }
                };
                let mut qualified = 0usize;
                for value in value_nodes {
                    if !shacl_nested_shape_conforms(
                        qs,
                        data,
                        qualified_shape,
                        value,
                        ctx,
                        depth + 1,
                    )? {
                        continue;
                    }
                    let mut excluded = false;
                    if disjoint {
                        for parent in qs.iter().filter(|row| {
                            member(row, "object").is_some_and(|child| term_eq(child, shape))
                                && text(member(member(row, "predicate"), "value"))
                                    == Some(&u(&format!("{SH}property")))
                        }) {
                            let parent_shape = member(parent, "subject").ok_or_else(|| {
                                EngineError::new(
                                    "SHACL_ENGINE_UNSUPPORTED",
                                    Utf16::default(),
                                    "Property link has no parent shape",
                                )
                            })?;
                            for sibling in qs.iter().filter(|row| {
                                member(row, "subject")
                                    .is_some_and(|subject| term_eq(subject, parent_shape))
                                    && text(member(member(row, "predicate"), "value"))
                                        == Some(&u(&format!("{SH}property")))
                                    && member(row, "object")
                                        .is_some_and(|child| !term_eq(child, shape))
                            }) {
                                let sibling_shape = member(sibling, "object").ok_or_else(|| {
                                    EngineError::new(
                                        "SHACL_ENGINE_UNSUPPORTED",
                                        Utf16::default(),
                                        "Sibling property link has no shape",
                                    )
                                })?;
                                for sibling_qv in qs.iter().filter(|row| {
                                    member(row, "subject")
                                        .is_some_and(|subject| term_eq(subject, sibling_shape))
                                        && text(member(member(row, "predicate"), "value"))
                                            == Some(&u(&format!("{SH}qualifiedValueShape")))
                                }) {
                                    let sibling_value_shape = member(sibling_qv, "object")
                                        .ok_or_else(|| {
                                            EngineError::new(
                                                "SHACL_ENGINE_UNSUPPORTED",
                                                Utf16::default(),
                                                "Sibling qualified shape is missing",
                                            )
                                        })?;
                                    if shacl_nested_shape_conforms(
                                        qs,
                                        data,
                                        sibling_value_shape,
                                        value,
                                        ctx,
                                        depth + 1,
                                    )? {
                                        excluded = true;
                                        break;
                                    }
                                }
                                if excluded {
                                    break;
                                }
                            }
                            if excluded {
                                break;
                            }
                        }
                    }
                    if !excluded {
                        qualified = qualified.saturating_add(1);
                    }
                }
                let violates = if local == "qualifiedMinCount" {
                    qualified < bound
                } else {
                    qualified > bound
                };
                if violates {
                    push_shacl_violation(
                        out,
                        focus,
                        path,
                        shape,
                        if local == "qualifiedMinCount" {
                            "QualifiedMinCount"
                        } else {
                            "QualifiedMaxCount"
                        },
                        None,
                        if local == "qualifiedMinCount" {
                            "Fewer values conform to sh:qualifiedValueShape than required"
                        } else {
                            "More values conform to sh:qualifiedValueShape than permitted"
                        },
                        ctx,
                    )?;
                }
            }
            "closed" => {
                if is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:closed applies only to node shapes",
                    ));
                }
                let closed_lexical = text(member(parameter, "value")).ok_or_else(|| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:closed must be a boolean literal",
                    )
                })?;
                ctx.charge_text(closed_lexical.len(), Utf16::default())?;
                let enabled = closed_lexical.to_utf8().map_err(|_| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:closed has malformed UTF-16",
                    )
                })?;
                if enabled != "true" && enabled != "false" {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:closed has an invalid boolean lexical form",
                    ));
                }
                if enabled == "true" {
                    let mut allowed = BTreeSet::new();
                    for property in qs.iter().filter(|row| {
                        member(row, "subject").is_some_and(|s| term_eq(s, shape))
                            && text(member(member(row, "predicate"), "value"))
                                == Some(&u(&format!("{SH}property")))
                    }) {
                        let property_shape = member(property, "object").ok_or_else(|| {
                            EngineError::new(
                                "SHACL_ENGINE_UNSUPPORTED",
                                Utf16::default(),
                                "sh:property is missing its node",
                            )
                        })?;
                        let paths = qs
                            .iter()
                            .filter(|row| {
                                member(row, "subject").is_some_and(|s| term_eq(s, property_shape))
                                    && text(member(member(row, "predicate"), "value"))
                                        == Some(&u(&format!("{SH}path")))
                            })
                            .filter_map(|row| member(row, "object"))
                            .collect::<Vec<_>>();
                        if paths.len() != 1 || text(member(paths[0], "kind")) != Some(&u("iri")) {
                            return Err(EngineError::new(
                                "SHACL_ENGINE_UNSUPPORTED",
                                Utf16::default(),
                                "sh:closed currently supports only direct property paths",
                            ));
                        }
                        allowed.insert(term_key_metered(paths[0], ctx)?);
                    }
                    for row in qs.iter().filter(|row| {
                        member(row, "subject").is_some_and(|s| term_eq(s, shape))
                            && text(member(member(row, "predicate"), "value"))
                                == Some(&u(&format!("{SH}ignoredProperties")))
                    }) {
                        if let Some(head) = member(row, "object") {
                            for ignored in shacl_list_values(qs, head, ctx)? {
                                allowed.insert(term_key_metered(&ignored, ctx)?);
                            }
                        }
                    }
                    let rdf_type = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
                    for row in data
                        .iter()
                        .filter(|row| member(row, "subject").is_some_and(|s| term_eq(s, focus)))
                    {
                        ctx.charge_work(1, Utf16::default())?;
                        let predicate = member(row, "predicate").ok_or_else(|| {
                            EngineError::new(
                                "SHACL_ENGINE_UNSUPPORTED",
                                Utf16::default(),
                                "Data predicate is missing",
                            )
                        })?;
                        let key = term_key_metered(predicate, ctx)?;
                        if text(member(predicate, "value")) != Some(&u(rdf_type))
                            && !allowed.contains(&key)
                        {
                            let object = member(row, "object");
                            push_shacl_violation(
                                out,
                                focus,
                                Some(predicate),
                                shape,
                                "Closed",
                                object,
                                "Node has a predicate not allowed by its closed shape",
                                ctx,
                            )?;
                        }
                    }
                }
            }
            "minCount" | "maxCount" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Count constraints require a property shape",
                    ));
                }
                let bound = shacl_count_parameter(parameter, ctx)?;
                let violates = if local == "minCount" {
                    value_nodes.len() < bound
                } else {
                    value_nodes.len() > bound
                };
                if violates {
                    push_shacl_violation(
                        out,
                        focus,
                        path,
                        shape,
                        if local == "minCount" {
                            "MinCount"
                        } else {
                            "MaxCount"
                        },
                        None,
                        if local == "minCount" {
                            "Fewer values than sh:minCount"
                        } else {
                            "More values than sh:maxCount"
                        },
                        ctx,
                    )?;
                }
            }
            "minInclusive" | "minExclusive" | "maxInclusive" | "maxExclusive" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Numeric bound constraints require a property shape",
                    ));
                }
                for value in value_nodes {
                    let ordering = shacl_numeric_order(value, parameter, ctx)?;
                    let conforms = match (local.as_str(), ordering) {
                        (
                            "minInclusive",
                            Some(std::cmp::Ordering::Greater | std::cmp::Ordering::Equal),
                        )
                        | ("minExclusive", Some(std::cmp::Ordering::Greater))
                        | (
                            "maxInclusive",
                            Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal),
                        )
                        | ("maxExclusive", Some(std::cmp::Ordering::Less)) => true,
                        _ => false,
                    };
                    if !conforms {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            match local.as_str() {
                                "minInclusive" => "MinInclusive",
                                "minExclusive" => "MinExclusive",
                                "maxInclusive" => "MaxInclusive",
                                _ => "MaxExclusive",
                            },
                            Some(value),
                            "Value violates the declared inclusive or exclusive bound",
                            ctx,
                        )?;
                    }
                }
            }
            "lessThan" | "lessThanOrEquals" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Comparison constraints require a property shape",
                    ));
                }
                let other_path = text(member(parameter, "value"))
                    .filter(|_| text(member(parameter, "kind")) == Some(&u("iri")))
                    .ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "Only direct IRI paths are supported for comparison constraints",
                        )
                    })?;
                let other_values = shacl_direct_values(data, focus, other_path, ctx)?;
                for value in value_nodes {
                    let mut conforms = !other_values.is_empty();
                    for other in &other_values {
                        let ordering = shacl_numeric_order(value, other, ctx)?;
                        conforms &= matches!(
                            (local.as_str(), ordering),
                            ("lessThan", Some(std::cmp::Ordering::Less))
                                | (
                                    "lessThanOrEquals",
                                    Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal)
                                )
                        );
                    }
                    if !conforms {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            if local == "lessThan" {
                                "LessThan"
                            } else {
                                "LessThanOrEquals"
                            },
                            Some(value),
                            "Property value violates the comparison path constraint",
                            ctx,
                        )?;
                    }
                }
            }
            "datatype" => {
                let expected = text(member(parameter, "value")).ok_or_else(|| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:datatype must be an IRI",
                    )
                })?;
                for value in value_nodes {
                    if text(member(value, "kind")) != Some(&u("literal"))
                        || text(member(value, "datatype")) != Some(expected)
                    {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "Datatype",
                            Some(value),
                            "Value does not have the required datatype",
                            ctx,
                        )?;
                    }
                }
            }
            "class" => {
                for value in value_nodes {
                    if !shacl_instance_of(value, parameter, data, ctx)? {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "Class",
                            Some(value),
                            "Value is not an instance of the required class",
                            ctx,
                        )?;
                    }
                }
            }
            "nodeKind" => {
                let wanted = text(member(parameter, "value"))
                    .and_then(|value| value.to_utf8().ok())
                    .ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:nodeKind must be an IRI",
                        )
                    })?;
                for value in value_nodes {
                    let kind = text(member(value, "kind"));
                    let iri = kind == Some(&u("iri"));
                    let blank = kind == Some(&u("blank"));
                    let literal = kind == Some(&u("literal"));
                    let matches = match wanted.as_str() {
                        "http://www.w3.org/ns/shacl#IRI" => iri,
                        "http://www.w3.org/ns/shacl#BlankNode" => blank,
                        "http://www.w3.org/ns/shacl#Literal" => literal,
                        "http://www.w3.org/ns/shacl#BlankNodeOrIRI" => blank || iri,
                        "http://www.w3.org/ns/shacl#BlankNodeOrLiteral" => blank || literal,
                        "http://www.w3.org/ns/shacl#IRIOrLiteral" => iri || literal,
                        _ => {
                            return Err(EngineError::new(
                                "SHACL_ENGINE_UNSUPPORTED",
                                Utf16::default(),
                                "Unsupported sh:nodeKind value",
                            ))
                        }
                    };
                    if !matches {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "NodeKind",
                            Some(value),
                            "Value does not have the required node kind",
                            ctx,
                        )?;
                    }
                }
            }
            "equals" | "disjoint" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:equals and sh:disjoint require a property shape",
                    ));
                }
                let other_path = text(member(parameter, "value"))
                    .filter(|_| text(member(parameter, "kind")) == Some(&u("iri")))
                    .ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "Only direct IRI paths are supported for sh:equals and sh:disjoint",
                        )
                    })?;
                let other_values = shacl_direct_values(data, focus, other_path, ctx)?;
                let current_keys = value_nodes
                    .iter()
                    .map(|value| term_key_metered(value, ctx))
                    .collect::<Result<BTreeSet<_>, _>>()?;
                let other_keys = other_values
                    .iter()
                    .map(|value| term_key_metered(value, ctx))
                    .collect::<Result<BTreeSet<_>, _>>()?;
                if local == "disjoint" {
                    for value in value_nodes {
                        if other_keys.contains(&term_key_metered(value, ctx)?) {
                            push_shacl_violation(
                                out,
                                focus,
                                path,
                                shape,
                                "Disjoint",
                                Some(value),
                                "Value also occurs along sh:disjoint path",
                                ctx,
                            )?;
                        }
                    }
                } else if current_keys != other_keys {
                    if let Some(value) = value_nodes.first() {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "Equals",
                            Some(value),
                            "Property values do not equal the sh:equals path values",
                            ctx,
                        )?;
                    } else {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "Equals",
                            None,
                            "Property values do not equal the sh:equals path values",
                            ctx,
                        )?;
                    }
                }
            }
            "hasValue" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:hasValue requires a property shape",
                    ));
                }
                if !value_nodes.iter().any(|value| term_eq(value, parameter)) {
                    push_shacl_violation(
                        out,
                        focus,
                        path,
                        shape,
                        "HasValue",
                        Some(parameter),
                        "Required sh:hasValue term is absent",
                        ctx,
                    )?;
                }
            }
            "node" | "not" => {
                let conforms =
                    shacl_nested_shape_conforms(qs, data, parameter, focus, ctx, depth + 1)?;
                if (local == "node" && !conforms) || (local == "not" && conforms) {
                    push_shacl_violation(
                        out,
                        focus,
                        path,
                        shape,
                        if local == "node" { "Node" } else { "Not" },
                        value_nodes.first(),
                        if local == "node" {
                            "Value node does not conform to sh:node shape"
                        } else {
                            "Value node conforms to the prohibited sh:not shape"
                        },
                        ctx,
                    )?;
                }
            }
            "and" | "or" | "xone" => {
                let shapes = shacl_list_values(qs, parameter, ctx)?;
                if shapes.is_empty() {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Logical shape lists must be nonempty",
                    ));
                }
                let mut matches = 0usize;
                for nested_shape in &shapes {
                    if shacl_nested_shape_conforms(qs, data, nested_shape, focus, ctx, depth + 1)? {
                        matches += 1;
                    }
                }
                let conforms = match local.as_str() {
                    "and" => matches == shapes.len(),
                    "or" => matches > 0,
                    _ => matches == 1,
                };
                if !conforms {
                    push_shacl_violation(
                        out,
                        focus,
                        path,
                        shape,
                        match local.as_str() {
                            "and" => "And",
                            "or" => "Or",
                            _ => "Xone",
                        },
                        value_nodes.first(),
                        "Value node does not satisfy the logical shape constraint",
                        ctx,
                    )?;
                }
            }
            "in" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:in requires a property shape",
                    ));
                }
                let allowed = shacl_list_values(qs, parameter, ctx)?;
                for value in value_nodes {
                    if !allowed.iter().any(|candidate| term_eq(candidate, value)) {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "In",
                            Some(value),
                            "Value is not a member of sh:in",
                            ctx,
                        )?;
                    }
                }
            }
            "minLength" | "maxLength" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Length constraints require a property shape",
                    ));
                }
                let bound = shacl_count_parameter(parameter, ctx)?;
                for value in value_nodes {
                    let length = shacl_literal_length(value, ctx)?;
                    let violates = length.is_none_or(|length| {
                        if local == "minLength" {
                            length < bound
                        } else {
                            length > bound
                        }
                    });
                    if violates {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            if local == "minLength" {
                                "MinLength"
                            } else {
                                "MaxLength"
                            },
                            Some(value),
                            "Literal length violates the declared bound",
                            ctx,
                        )?;
                    }
                }
            }
            "pattern" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:pattern requires a property shape",
                    ));
                }
                let pattern = text(member(parameter, "value")).ok_or_else(|| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:pattern must be a literal",
                    )
                })?;
                ctx.charge_text(pattern.len(), Utf16::default())?;
                let pattern = pattern.to_utf8().map_err(|_| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "Pattern is not well-formed UTF-16",
                    )
                })?;
                let mut flag_term = None;
                let mut flag_seen = false;
                for flags_row in qs.iter() {
                    ctx.charge_work(1, Utf16::default())?;
                    if member(flags_row, "subject").is_some_and(|s| term_eq(s, shape))
                        && text(member(member(flags_row, "predicate"), "value"))
                            == Some(&u(&format!("{SH}flags")))
                    {
                        if flag_seen {
                            return Err(EngineError::new(
                                "SHACL_ENGINE_UNSUPPORTED",
                                Utf16::default(),
                                "sh:flags must have at most one value",
                            ));
                        }
                        flag_seen = true;
                        flag_term = member(flags_row, "object");
                    }
                }
                let flags = if let Some(term) = flag_term {
                    let value = text(member(term, "value")).ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:flags must be a literal",
                        )
                    })?;
                    ctx.charge_text(value.len(), Utf16::default())?;
                    value.to_utf8().map_err(|_| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "sh:flags is malformed UTF-16",
                        )
                    })?
                } else {
                    String::new()
                };
                for value in value_nodes {
                    if text(member(value, "kind")) != Some(&u("literal")) {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "Pattern",
                            Some(value),
                            "sh:pattern requires a literal value",
                            ctx,
                        )?;
                        continue;
                    }
                    let lexical = text(member(value, "value")).ok_or_else(|| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "Pattern value is not a literal string",
                        )
                    })?;
                    ctx.charge_text(lexical.len(), Utf16::default())?;
                    let lexical = lexical.to_utf8().map_err(|_| {
                        EngineError::new(
                            "SHACL_ENGINE_UNSUPPORTED",
                            Utf16::default(),
                            "Pattern value is not well-formed UTF-16",
                        )
                    })?;
                    match shacl_pattern_matches(&lexical, &pattern, &flags)? {
                        true => (),
                        false => push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "Pattern",
                            Some(value),
                            "Literal does not match sh:pattern",
                            ctx,
                        )?,
                    }
                }
            }
            "languageIn" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:languageIn requires a property shape",
                    ));
                }
                let allowed = shacl_list_values(qs, parameter, ctx)?
                    .into_iter()
                    .map(|value| {
                        let lexical = text(member(&value, "value")).ok_or_else(|| {
                            EngineError::new(
                                "SHACL_ENGINE_UNSUPPORTED",
                                Utf16::default(),
                                "sh:languageIn entries must be language literals",
                            )
                        })?;
                        ctx.charge_text(lexical.len(), Utf16::default())?;
                        Ok(lexical
                            .to_utf8()
                            .map_err(|_| {
                                EngineError::new(
                                    "SHACL_ENGINE_UNSUPPORTED",
                                    Utf16::default(),
                                    "Language tag is malformed UTF-16",
                                )
                            })?
                            .to_ascii_lowercase())
                    })
                    .collect::<Result<BTreeSet<_>, EngineError>>()?;
                for value in value_nodes {
                    let language = text(member(value, "language"))
                        .map(|tag| {
                            ctx.charge_text(tag.len(), Utf16::default())?;
                            tag.to_utf8().map(|s| s.to_ascii_lowercase()).map_err(|_| {
                                EngineError::new(
                                    "SHACL_ENGINE_UNSUPPORTED",
                                    Utf16::default(),
                                    "Literal language is malformed UTF-16",
                                )
                            })
                        })
                        .transpose()?;
                    if language.as_ref().is_none_or(|tag| !allowed.contains(tag)) {
                        push_shacl_violation(
                            out,
                            focus,
                            path,
                            shape,
                            "LanguageIn",
                            Some(value),
                            "Literal language is not in sh:languageIn",
                            ctx,
                        )?;
                    }
                }
            }
            "uniqueLang" => {
                if !is_property_shape {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:uniqueLang requires a property shape",
                    ));
                }
                let lexical = text(member(parameter, "value")).ok_or_else(|| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:uniqueLang must be a boolean literal",
                    )
                })?;
                ctx.charge_text(lexical.len(), Utf16::default())?;
                let enabled = lexical.to_utf8().map_err(|_| {
                    EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:uniqueLang has malformed UTF-16",
                    )
                })?;
                if enabled != "true" && enabled != "false" {
                    return Err(EngineError::new(
                        "SHACL_ENGINE_UNSUPPORTED",
                        Utf16::default(),
                        "sh:uniqueLang has an invalid boolean lexical form",
                    ));
                }
                if enabled == "true" {
                    let mut languages = BTreeSet::new();
                    for value in value_nodes {
                        if let Some(language) = text(member(value, "language")) {
                            ctx.charge_text(language.len(), Utf16::default())?;
                            let normalized = language
                                .to_utf8()
                                .map_err(|_| {
                                    EngineError::new(
                                        "SHACL_ENGINE_UNSUPPORTED",
                                        Utf16::default(),
                                        "Language tag is malformed UTF-16",
                                    )
                                })?
                                .to_ascii_lowercase();
                            if !languages.insert(normalized) {
                                push_shacl_violation(
                                    out,
                                    focus,
                                    path,
                                    shape,
                                    "UniqueLang",
                                    Some(value),
                                    "Language tag is not unique for this property",
                                    ctx,
                                )?;
                            }
                        }
                    }
                }
            }
            "targetNode"
            | "targetClass"
            | "targetSubjectsOf"
            | "targetObjectsOf"
            | "property"
            | "path"
            | "qualifiedValueShape"
            | "qualifiedValueShapesDisjoint"
            | "severity"
            | "message"
            | "name"
            | "description"
            | "order"
            | "group"
            | "deactivated"
            | "ignoredProperties"
            | "defaultValue" => (),
            _ if local.starts_with("target") => (),
            _ => {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "Constraint is outside the implemented native SHACL subset",
                ))
            }
        }
    }
    Ok(())
}

pub fn propose_shacl_engine_validation_sync(
    rt: &RdfRuntime,
    shapes: &Value,
    data: &Value,
    report_id: &Utf16,
    blank_node_policy: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if report_id.is_empty()
        || ![u("disjoint-inputs"), u("shared-scope")].contains(blank_node_policy)
    {
        return Err(EngineError::new(
            "SHACL_OPTIONS",
            Utf16::default(),
            "Expected nonempty report id and explicit blank-node policy",
        ));
    }
    let shapes_copy = copy_json(shapes, ctx)?;
    let data_copy = copy_json(data, ctx)?;
    let mut shapes_eval = copy_json(&shapes_copy, ctx)?;
    let mut data_eval = copy_json(&data_copy, ctx)?;
    let mut diagnostics = vec![diagnostic("SHACL_ENGINE_SUBSET", "Native SHACL subset: standard target union including implicit class targets; property paths; nested node/not/and/or/xone constraints on property shapes; count and qualified-count, equals/disjoint, datatype/class/nodeKind, hasValue/in, exact integer/decimal and binary float/double bounds and comparisons, length, languageIn/uniqueLang, closed, and bounded regular expressions with i/m/s/x flags. Other constraints are blocked.", "warning")];
    let mut violations: Vec<NativeShaclViolation> = Vec::new();
    let result = (|| -> Result<(), EngineError> {
        if blank_node_policy == &u("disjoint-inputs") {
            remap_blank_terms(&mut shapes_eval, "umf.shacl", "S", ctx)?;
            remap_blank_terms(&mut data_eval, "umf.rdf", "D", ctx)?;
        }
        let sq = shacl_quads(rt, &shapes_eval, ctx)?;
        for quad in &sq {
            let predicate = text(member(member(quad, "predicate"), "value"));
            if predicate == Some(&u("http://www.w3.org/2002/07/owl#imports"))
                || predicate == Some(&u("http://www.w3.org/ns/shacl#entailment"))
            {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "Imports and entailment require explicit processing",
                ));
            }
        }
        rdf::export_rdf_turtle(rt, &data_eval, ctx)?;
        if !values(Some(&rdf::get_rdf_named_graphs(rt, &data_eval, ctx)?)).is_empty() {
            return Err(EngineError::new(
                "SHACL_GRAPH",
                Utf16::default(),
                "Native SHACL subset requires a single default data graph",
            ));
        }
        let dq = quads(rt, &data_eval, ctx)?;
        let supported = [
            "targetNode",
            "targetClass",
            "targetSubjectsOf",
            "targetObjectsOf",
            "target",
            "property",
            "path",
            "node",
            "not",
            "and",
            "or",
            "xone",
            "closed",
            "ignoredProperties",
            "minCount",
            "maxCount",
            "qualifiedValueShape",
            "qualifiedMinCount",
            "qualifiedMaxCount",
            "qualifiedValueShapesDisjoint",
            "minInclusive",
            "minExclusive",
            "maxInclusive",
            "maxExclusive",
            "lessThan",
            "lessThanOrEquals",
            "equals",
            "disjoint",
            "datatype",
            "class",
            "nodeKind",
            "hasValue",
            "in",
            "minLength",
            "maxLength",
            "pattern",
            "flags",
            "languageIn",
            "uniqueLang",
            "severity",
            "message",
            "name",
            "description",
            "order",
            "group",
            "deactivated",
            "defaultValue",
        ];
        for quad in &sq {
            ctx.charge_work(1, Utf16::default())?;
            let Some(predicate) = text(member(member(quad, "predicate"), "value")) else {
                continue;
            };
            let Some(local) = predicate.to_utf8().ok().and_then(|p| {
                p.strip_prefix("http://www.w3.org/ns/shacl#")
                    .map(str::to_owned)
            }) else {
                continue;
            };
            if local == "target" {
                return Err(EngineError::new(
                    "SHACL_TARGET_UNSUPPORTED",
                    Utf16::default(),
                    "Custom SHACL targets are not implemented",
                ));
            }
            if !supported.contains(&local.as_str()) {
                return Err(EngineError::new(
                    "SHACL_ENGINE_UNSUPPORTED",
                    Utf16::default(),
                    "Constraint or SHACL feature is outside the implemented native subset",
                ));
            }
        }
        if blank_node_policy == &u("shared-scope") {
            let left = shacl_scope(&shapes_copy, ctx)?;
            let data_module = values(member(&data_copy, "modules"))
                .iter()
                .find(|module| text(member(module, "id")) == Some(&u("dataset")))
                .ok_or_else(|| {
                    EngineError::new(
                        "SHACL_PAYLOAD",
                        Utf16::default(),
                        "Missing RDF dataset module",
                    )
                })?;
            let data_element = values(member(data_module, "elements"))
                .iter()
                .find(|element| text(member(element, "id")) == Some(&u("dataset")))
                .ok_or_else(|| {
                    EngineError::new(
                        "SHACL_PAYLOAD",
                        Utf16::default(),
                        "Missing RDF dataset element",
                    )
                })?;
            let right = member(member(data_element, "extensions"), "umf.rdf")
                .and_then(|p| member(p, "blankNodeScope"));
            if right != Some(&left) {
                return Err(EngineError::new(
                    "SHACL_ENGINE_SCOPE",
                    Utf16::default(),
                    "Shared policy requires the same explicit blankNodeScope in both graphs",
                ));
            }
        }
        let sh = "http://www.w3.org/ns/shacl#";
        let rdf_type = u("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
        let rdfs = "http://www.w3.org/2000/01/rdf-schema#";
        let node_shape_iri = shacl_report_iri(&format!("{sh}NodeShape"));
        let property_shape_iri = shacl_report_iri(&format!("{sh}PropertyShape"));
        let class_iri = shacl_report_iri(&format!("{rdfs}Class"));
        let mut targets: Vec<(Value, Value)> = Vec::new();
        let mut seen_targets = BTreeSet::<(Vec<u16>, Vec<u16>)>::new();
        let mut add_target =
            |shape: &Value, focus: &Value, ctx: &mut Context<'_>| -> Result<(), EngineError> {
                let key = (term_key_metered(shape, ctx)?, term_key_metered(focus, ctx)?);
                if seen_targets.insert(key) {
                    reserve_items(&mut targets, 1, ctx)?;
                    targets.push((copy_json(shape, ctx)?, copy_json(focus, ctx)?));
                }
                Ok(())
            };
        for q in &sq {
            ctx.charge_work(1, Utf16::default())?;
            let Some(predicate) = text(member(member(q, "predicate"), "value")) else {
                continue;
            };
            let Some(local) = predicate
                .to_utf8()
                .ok()
                .and_then(|p| p.strip_prefix(sh).map(str::to_owned))
            else {
                continue;
            };
            let (Some(shape), Some(target)) = (member(q, "subject"), member(q, "object")) else {
                continue;
            };
            match local.as_str() {
                "targetNode" => add_target(shape, target, ctx)?,
                "targetClass" => {
                    if text(member(target, "kind")) != Some(&u("iri")) {
                        return Err(EngineError::new(
                            "SHACL_TARGET",
                            Utf16::default(),
                            "sh:targetClass requires an IRI",
                        ));
                    }
                    let mut candidates = BTreeMap::<Vec<u16>, Value>::new();
                    for quad in &dq {
                        ctx.charge_work(1, Utf16::default())?;
                        if let Some(subject) = member(quad, "subject") {
                            candidates
                                .entry(term_key_metered(subject, ctx)?)
                                .or_insert(copy_json(subject, ctx)?);
                        }
                    }
                    for node in candidates.values() {
                        if shacl_instance_of(node, target, &dq, ctx)? {
                            add_target(shape, node, ctx)?;
                        }
                    }
                }
                "targetSubjectsOf" | "targetObjectsOf" => {
                    if text(member(target, "kind")) != Some(&u("iri")) {
                        return Err(EngineError::new(
                            "SHACL_TARGET",
                            Utf16::default(),
                            "Predicate targets require an IRI",
                        ));
                    }
                    let expected = text(member(target, "value"));
                    for quad in &dq {
                        ctx.charge_work(1, Utf16::default())?;
                        if text(member(member(quad, "predicate"), "value")) == expected {
                            let field_name = if local == "targetSubjectsOf" {
                                "subject"
                            } else {
                                "object"
                            };
                            if let Some(focus) = member(quad, field_name) {
                                add_target(shape, focus, ctx)?;
                            }
                        }
                    }
                }
                "target" => {
                    return Err(EngineError::new(
                        "SHACL_TARGET_UNSUPPORTED",
                        Utf16::default(),
                        "Custom SHACL targets are not implemented",
                    ))
                }
                _ => (),
            }
        }
        // Implicit class targets apply when a named shape is both a NodeShape
        // or PropertyShape and an rdfs:Class.
        let mut shape_types = BTreeMap::<Vec<u16>, (Value, BTreeSet<Vec<u16>>)>::new();
        for q in &sq {
            ctx.charge_work(1, Utf16::default())?;
            if member(member(q, "predicate"), "value") == Some(&Value::String(rdf_type.clone())) {
                if let (Some(subject), Some(object)) = (member(q, "subject"), member(q, "object")) {
                    let key = term_key_metered(subject, ctx)?;
                    let entry = shape_types
                        .entry(key)
                        .or_insert((copy_json(subject, ctx)?, BTreeSet::new()));
                    entry.1.insert(term_key_metered(object, ctx)?);
                }
            }
        }
        for (_, (shape, types)) in shape_types {
            if text(member(&shape, "kind")) != Some(&u("iri"))
                || !types.contains(&term_key_metered(&class_iri, ctx)?)
                || !(types.contains(&term_key_metered(&node_shape_iri, ctx)?)
                    || types.contains(&term_key_metered(&property_shape_iri, ctx)?))
            {
                continue;
            }
            for quad in &dq {
                ctx.charge_work(1, Utf16::default())?;
                if member(member(quad, "predicate"), "value")
                    == Some(&Value::String(rdf_type.clone()))
                    && member(quad, "object").is_some_and(|object| term_eq(object, &shape))
                {
                    if let Some(focus) = member(quad, "subject") {
                        add_target(&shape, focus, ctx)?;
                    }
                }
            }
        }
        for (shape, focus) in targets {
            ctx.charge_work(1, Utf16::default())?;
            // Evaluate node-shape constraints against the focus node itself.
            let shape_types: Vec<_> = sq
                .iter()
                .filter(|q| {
                    member(q, "subject").is_some_and(|s| term_eq(s, &shape))
                        && member(q, "predicate").and_then(|p| member(p, "value"))
                            == Some(&Value::String(rdf_type.clone()))
                })
                .filter_map(|q| member(q, "object"))
                .collect();
            let node_shape = shape_types
                .iter()
                .any(|t| text(member(t, "value")) == Some(&u(&format!("{sh}NodeShape"))));
            if node_shape {
                evaluate_shacl_constraints(
                    &sq,
                    &dq,
                    &shape,
                    &focus,
                    None,
                    std::slice::from_ref(&focus),
                    false,
                    &mut violations,
                    ctx,
                    0,
                )?;
            }
            let properties: Vec<Value> = sq
                .iter()
                .filter(|q| {
                    member(q, "subject").is_some_and(|s| term_eq(s, &shape))
                        && text(member(member(q, "predicate"), "value"))
                            == Some(&u(&format!("{sh}property")))
                })
                .filter_map(|q| member(q, "object"))
                .map(|v| copy_json(v, ctx))
                .collect::<Result<_, _>>()?;
            for property in properties {
                let path = get_shacl_property_path(rt, &shapes_eval, &property, ctx)?;
                let found = evaluate_shacl_property_path(
                    rt,
                    &shapes_eval,
                    &property,
                    &data_eval,
                    &focus,
                    ctx,
                )?;
                let path_term = shacl_declared_path_term(&sq, &property, ctx)?;
                evaluate_shacl_constraints(
                    &sq,
                    &dq,
                    &property,
                    &focus,
                    Some(&path_term),
                    &found,
                    true,
                    &mut violations,
                    ctx,
                    0,
                )?;
            }
            // A property shape may also be targeted directly and have no parent NodeShape.
            let is_property = sq.iter().any(|q| {
                member(q, "subject").is_some_and(|s| term_eq(s, &shape))
                    && text(member(member(q, "predicate"), "value"))
                        == Some(&u(&format!("{sh}path")))
            });
            if is_property {
                let path = get_shacl_property_path(rt, &shapes_eval, &shape, ctx)?;
                let found = evaluate_shacl_property_path(
                    rt,
                    &shapes_eval,
                    &shape,
                    &data_eval,
                    &focus,
                    ctx,
                )?;
                let path_term = shacl_declared_path_term(&sq, &shape, ctx)?;
                evaluate_shacl_constraints(
                    &sq,
                    &dq,
                    &shape,
                    &focus,
                    Some(&path_term),
                    &found,
                    true,
                    &mut violations,
                    ctx,
                    0,
                )?;
            }
        }
        Ok(())
    })();
    let (status, conforms, report) = match result {
        Ok(()) => {
            let report_shapes = shacl_quads(rt, &shapes_eval, ctx)?;
            apply_shacl_report_metadata(&report_shapes, &mut violations, ctx)?;
            let conforms = violations.is_empty();
            let report_text = shacl_validation_report_nquads(&violations, conforms, ctx)?;
            (
                "evaluated",
                Some(conforms),
                Some(rdf::import_rdf_nquads(
                    rt,
                    report_text.units(),
                    report_id,
                    Some(report_id),
                    ctx,
                )?),
            )
        }
        Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
        Err(error) => {
            ctx.charge_text(error.message.len(), Utf16::default())?;
            diagnostics.push(Value::Object(vec![
                (u("code"), Value::string_utf8("SHACL_ENGINE_BLOCKED")),
                (u("path"), Value::string_utf8("")),
                (u("severity"), Value::string_utf8("error")),
                (u("message"), Value::String(error.message)),
            ]));
            ("blocked", None, None)
        }
    };
    let mut fields = vec![
        (u("stringProfile"), Value::string_utf8("umf-string-1")),
        (u("numericProfile"), Value::string_utf8("umf-numeric-2")),
        (u("engine"), Value::string_utf8("umf-shacl-native-subset/2")),
        (
            u("blankNodePolicy"),
            Value::String(blank_node_policy.clone()),
        ),
        (u("status"), Value::string_utf8(status)),
        (u("complete"), Value::Bool(false)),
        (u("shapes"), shapes_copy),
        (u("data"), data_copy),
    ];
    if let Some(value) = conforms {
        fields.push((u("engineConforms"), Value::Bool(value)));
    }
    if let Some(value) = report {
        fields.push((u("report"), value));
    }
    fields.push((u("diagnostics"), Value::Array(diagnostics)));
    Ok(Value::Object(fields))
}

pub async fn propose_shacl_engine_validation(
    rt: &RdfRuntime,
    shapes: &Value,
    data: &Value,
    report_id: &Utf16,
    blank_node_policy: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    propose_shacl_engine_validation_sync(rt, shapes, data, report_id, blank_node_policy, ctx)
}

fn shacl_declared_path_term(
    shapes: &[Value],
    shape: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let path_iri = u("http://www.w3.org/ns/shacl#path");
    let mut found = None;
    for quad in shapes {
        ctx.charge_work(1, Utf16::default())?;
        if member(quad, "subject").is_some_and(|subject| term_eq(subject, shape))
            && member(quad, "predicate").and_then(|predicate| member(predicate, "value"))
                == Some(&Value::String(path_iri.clone()))
        {
            if found.is_some() {
                return Err(EngineError::new(
                    "SHACL_PATH",
                    Utf16::default(),
                    "A property shape must have exactly one sh:path value",
                ));
            }
            let object = member(quad, "object").ok_or_else(|| {
                EngineError::new(
                    "SHACL_PATH",
                    Utf16::default(),
                    "sh:path statement has no RDF object",
                )
            })?;
            found = Some(copy_json(object, ctx)?);
        }
    }
    found.ok_or_else(|| {
        EngineError::new(
            "SHACL_PATH",
            Utf16::default(),
            "A property shape must have exactly one sh:path value",
        )
    })
}

fn shacl_report_term(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let kind = text(member(value, "kind")).ok_or_else(|| {
        EngineError::new(
            "SHACL_REPORT",
            Utf16::default(),
            "Malformed RDF report term",
        )
    })?;
    let lexical = text(member(value, "value")).ok_or_else(|| {
        EngineError::new(
            "SHACL_REPORT",
            Utf16::default(),
            "Malformed RDF report term",
        )
    })?;
    ctx.charge_text(
        lexical.len().saturating_mul(6).saturating_add(32),
        Utf16::default(),
    )?;
    let exact = String::from_utf16(lexical.units()).map_err(|_| {
        EngineError::new(
            "SHACL_REPORT",
            Utf16::default(),
            "Malformed UTF-16 in RDF report term",
        )
    })?;
    match kind {
        k if k == &u("iri") => Ok(format!("<{exact}>")),
        k if k == &u("blank") => Ok(format!("_:{exact}")),
        k if k == &u("literal") => {
            let mut out = String::from("\"");
            for ch in exact.chars() {
                match ch {
                    '\\' => out.push_str("\\\\"),
                    '"' => out.push_str("\\\""),
                    '\n' => out.push_str("\\n"),
                    '\r' => out.push_str("\\r"),
                    '\t' => out.push_str("\\t"),
                    c if c.is_control() => out.push_str(&format!("\\u{:04X}", c as u32)),
                    c => out.push(c),
                }
            }
            out.push('"');
            if let Some(language) = text(member(value, "language")) {
                ctx.charge_text(
                    language.len().saturating_mul(6).saturating_add(1),
                    Utf16::default(),
                )?;
                out.push('@');
                out.push_str(&String::from_utf16(language.units()).map_err(|_| {
                    EngineError::new(
                        "SHACL_REPORT",
                        Utf16::default(),
                        "Malformed UTF-16 in RDF language tag",
                    )
                })?);
            } else if let Some(datatype) = text(member(value, "datatype")) {
                ctx.charge_text(
                    datatype.len().saturating_mul(6).saturating_add(3),
                    Utf16::default(),
                )?;
                out.push_str("^^<");
                out.push_str(&String::from_utf16(datatype.units()).map_err(|_| {
                    EngineError::new(
                        "SHACL_REPORT",
                        Utf16::default(),
                        "Malformed UTF-16 in RDF datatype IRI",
                    )
                })?);
                out.push('>');
            }
            Ok(out)
        }
        _ => Err(EngineError::new(
            "SHACL_REPORT",
            Utf16::default(),
            "Invalid RDF report term kind",
        )),
    }
}

fn shacl_validation_report_nquads_legacy(
    violations: &[(Value, Value, Value, bool, usize)],
    conforms: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let rdf_type = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    let sh = "http://www.w3.org/ns/shacl#";
    let report = "_:report";
    ctx.charge_text(256, Utf16::default())?;
    let mut out = format!("{report} <{rdf_type}> <{sh}ValidationReport> .\n{report} <{sh}conforms> \"{conforms}\"^^<http://www.w3.org/2001/XMLSchema#boolean> .\n");
    for (index, (focus, path, shape, minimum, limit)) in violations.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let focus = shacl_report_term(focus, ctx)?;
        let path = shacl_report_term(path, ctx)?;
        let shape = shacl_report_term(shape, ctx)?;
        let node = format!("_:result{index}");
        let component = if *minimum { "MinCount" } else { "MaxCount" };
        let row_budget = focus
            .encode_utf16()
            .count()
            .saturating_add(path.encode_utf16().count())
            .saturating_add(shape.encode_utf16().count())
            .saturating_add(1024);
        ctx.charge_text(row_budget, Utf16::default())?;
        let row = format!("{report} <{sh}result> {node} .\n{node} <{rdf_type}> <{sh}ValidationResult> .\n{node} <{sh}focusNode> {focus} .\n{node} <{sh}resultPath> {path} .\n{node} <{sh}sourceShape> {shape} .\n{node} <{sh}sourceConstraintComponent> <{sh}{component}ConstraintComponent> .\n{node} <{sh}resultSeverity> <{sh}Violation> .\n{node} <{sh}resultMessage> \"Count constraint {component} {limit} was violated\" .\n");
        out.push_str(&row);
    }
    Ok(Utf16::from(out))
}

pub fn get_owl_ontology_headers(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let qs = owl_quads(rt, doc, ctx)?;
    let rdf_type = u("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    let ontology = u("http://www.w3.org/2002/07/owl#Ontology");
    let version = u("http://www.w3.org/2002/07/owl#versionIRI");
    let imports = u("http://www.w3.org/2002/07/owl#imports");
    let mut nodes = BTreeMap::new();
    for q in &qs {
        ctx.charge_work(1, Utf16::default())?;
        if member(member(q, "predicate").unwrap_or(&Value::Null), "value")
            == Some(&Value::String(rdf_type.clone()))
            && member(member(q, "object").unwrap_or(&Value::Null), "kind")
                == Some(&Value::String(u("iri")))
            && member(member(q, "object").unwrap_or(&Value::Null), "value")
                == Some(&Value::String(ontology.clone()))
        {
            if let Some(s) = member(q, "subject") {
                let key = term_key_metered(s, ctx)?;
                if !nodes.contains_key(&key) {
                    nodes.insert(key, copy_json(s, ctx)?);
                }
            }
        }
    }
    let mut result = Vec::new();
    for node in nodes.into_values() {
        result.push(Value::Object(vec![
            (u("node"), copy_json(&node, ctx)?),
            (
                u("versionIRIs"),
                owl_header_values(&qs, &node, &version, ctx)?,
            ),
            (u("imports"), owl_header_values(&qs, &node, &imports, ctx)?),
        ]));
    }
    Ok(Value::Array(result))
}

fn owl_header_values(
    rows: &[Value],
    node: &Value,
    predicate: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut terms = BTreeMap::new();
    for q in rows {
        ctx.charge_work(1, Utf16::default())?;
        if member(q, "subject").is_some_and(|s| term_eq(s, node))
            && member(member(q, "predicate").unwrap_or(&Value::Null), "value")
                == Some(&Value::String(predicate.clone()))
        {
            if let Some(object) = member(q, "object") {
                let key = term_key_metered(object, ctx)?;
                if !terms.contains_key(&key) {
                    terms.insert(key, copy_json(object, ctx)?);
                }
            }
        }
    }
    Ok(Value::Array(terms.into_values().collect()))
}

const OWL: &str = "http://www.w3.org/2002/07/owl#";
const RDF: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

// These views consume an already admitted RDF graph projected from the pinned
// `umf.owl` payload by the public wrapper.
pub fn get_owl_expression_view(
    document: &Value,
    node: &Value,
    rdf_runtime: &RdfRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let rows = owl_quads(rdf_runtime, document, ctx)?;
    if !matches!(text(member(node,"kind")),Some(k) if k==&u("iri")||k==&u("blank")) {
        return Err(EngineError::new(
            "OWL_EXPRESSION",
            Utf16::default(),
            "Expected a source-scoped RDF resource",
        ));
    }
    let mut index: BTreeMap<Vec<u16>, BTreeMap<Utf16, Vec<Value>>> = BTreeMap::new();
    for q in &rows {
        let Some(subject) = member(q, "subject") else {
            continue;
        };
        let predicate = text(member(
            member(q, "predicate").unwrap_or(&Value::Null),
            "value",
        ))
        .cloned()
        .unwrap_or_default();
        let object = member(q, "object").cloned().unwrap_or(Value::Null);
        let slot = index
            .entry(term_key(subject))
            .or_default()
            .entry(predicate)
            .or_default();
        if !slot.iter().any(|value| term_eq(value, &object)) {
            slot.push(object);
        }
    }
    let fields = index.get(&term_key(node));
    let values_for = |subject: &Value, predicate: &str| {
        fields
            .and_then(|map| map.get(&u(&format!("{OWL}{predicate}"))))
            .cloned()
            .unwrap_or_default()
    };
    let one = |subject: &Value, predicate: &str| -> Result<Value, EngineError> {
        let vals = values_for(subject, predicate);
        if vals.len() != 1 {
            return Err(EngineError::new(
                "OWL_EXPRESSION",
                Utf16::default(),
                format!("Expected exactly one {OWL}{predicate}"),
            ));
        }
        Ok(vals[0].clone())
    };
    let mut constructors = Vec::new();
    for p in [
        "intersectionOf",
        "unionOf",
        "oneOf",
        "complementOf",
        "datatypeComplementOf",
        "inverseOf",
        "onDatatype",
    ] {
        if !values_for(node, p).is_empty() {
            constructors.push(p);
        }
    }
    let restriction = rows.iter().any(|q| {
        member(q, "subject").is_some_and(|s| term_eq(s, node))
            && text(member(
                member(q, "predicate").unwrap_or(&Value::Null),
                "value",
            )) == Some(&u(&format!("{RDF}type")))
            && text(member(member(q, "object").unwrap_or(&Value::Null), "value"))
                == Some(&u(&format!("{OWL}Restriction")))
    }) || !values_for(node, "onProperty").is_empty()
        || !values_for(node, "onProperties").is_empty();
    if constructors.len() + usize::from(restriction) > 1 {
        return Err(EngineError::new(
            "OWL_EXPRESSION",
            Utf16::default(),
            "Multiple expression constructors require explicit disambiguation",
        ));
    }
    let mut expression = Vec::new();
    let kind = constructors.first().copied();
    if matches!(kind, Some("intersectionOf" | "unionOf" | "oneOf")) {
        let head = one(node, kind.unwrap())?;
        let members = owl_list(&rows, &head, ctx)?;
        expression.push((u("kind"), Value::string_utf8(kind.unwrap())));
        expression.push((u("node"), copy_json(node, ctx)?));
        expression.push((u("members"), Value::Array(members)));
    } else if matches!(
        kind,
        Some("complementOf" | "datatypeComplementOf" | "inverseOf")
    ) {
        expression.push((u("kind"), Value::string_utf8(kind.unwrap())));
        expression.push((u("node"), copy_json(node, ctx)?));
        expression.push((u("operand"), one(node, kind.unwrap())?));
    } else if kind == Some("onDatatype") {
        let datatype = one(node, "onDatatype")?;
        let head = one(node, "withRestrictions")?;
        let restrictions = owl_list(&rows, &head, ctx)?;
        let mut facets = Vec::new();
        for resource in restrictions {
            if text(member(&resource, "kind")) == Some(&u("literal")) {
                return Err(EngineError::new(
                    "OWL_EXPRESSION",
                    Utf16::default(),
                    "Datatype facet must be an RDF resource",
                ));
            }
            let statements = index
                .get(&term_key(&resource))
                .into_iter()
                .flat_map(|map| map.iter())
                .map(|(predicate, terms)| {
                    Ok(Value::Object(vec![
                        (u("predicate"), Value::String(predicate.clone())),
                        (
                            u("values"),
                            Value::Array(
                                terms
                                    .iter()
                                    .map(|term| copy_json(term, ctx))
                                    .collect::<Result<_, _>>()?,
                            ),
                        ),
                    ]))
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            facets.push(Value::Object(vec![
                (u("node"), resource),
                (u("statements"), Value::Array(statements)),
            ]));
        }
        expression.extend([
            (u("kind"), Value::string_utf8("datatypeRestriction")),
            (u("node"), copy_json(node, ctx)?),
            (u("datatype"), datatype),
            (u("facets"), Value::Array(facets)),
        ]);
    } else if restriction {
        let properties = values_for(node, "onProperty");
        let on_properties = values_for(node, "onProperties");
        if properties.len() + on_properties.len() != 1 {
            return Err(EngineError::new(
                "OWL_EXPRESSION",
                Utf16::default(),
                "Restriction needs exactly one onProperty or onProperties",
            ));
        }
        let properties = if !properties.is_empty() {
            properties
        } else {
            owl_list(&rows, &on_properties[0], ctx)?
        };
        let facet_names = [
            "someValuesFrom",
            "allValuesFrom",
            "hasValue",
            "hasSelf",
            "minCardinality",
            "maxCardinality",
            "cardinality",
            "minQualifiedCardinality",
            "maxQualifiedCardinality",
            "qualifiedCardinality",
            "onClass",
            "onDataRange",
        ];
        let facets = facet_names
            .iter()
            .flat_map(|name| {
                values_for(node, name)
                    .into_iter()
                    .map(move |term| (name, term))
            })
            .map(|(name, term)| {
                Value::Object(vec![
                    (u("predicate"), Value::string_utf8(format!("{OWL}{name}"))),
                    (u("values"), Value::Array(vec![term])),
                ])
            })
            .collect();
        expression.extend([
            (u("kind"), Value::string_utf8("restriction")),
            (u("node"), copy_json(node, ctx)?),
            (u("properties"), Value::Array(properties)),
            (u("facets"), Value::Array(facets)),
        ]);
    } else {
        expression.extend([
            (
                u("kind"),
                Value::string_utf8(if text(member(node, "kind")) == Some(&u("iri")) {
                    "reference"
                } else {
                    "unrecognized"
                }),
            ),
            (u("node"), copy_json(node, ctx)?),
        ]);
    }
    let indexes = rows
        .iter()
        .enumerate()
        .filter_map(|(i, q)| {
            member(q, "subject")
                .is_some_and(|s| term_eq(s, node))
                .then_some(Value::Number(i as f64))
        })
        .collect();
    Ok(Value::Object(vec![
        (u("profile"), Value::string_utf8("owl-expression-1")),
        (u("complete"), Value::Bool(false)),
        (u("source"), source),
        (u("blankNodeScope"), owl_scope(document)),
        (u("expression"), Value::Object(expression)),
        (u("quadIndexes"), Value::Array(indexes)),
    ]))
}

fn owl_scope(document: &Value) -> Value {
    member(document, "modules")
        .and_then(|mods| {
            values(Some(mods))
                .iter()
                .find(|m| text(member(m, "id")) == Some(&u("dataset")))
        })
        .and_then(|m| {
            values(member(m, "elements"))
                .iter()
                .find(|e| text(member(e, "id")) == Some(&u("dataset")))
        })
        .and_then(|e| member(member(e, "extensions")?, "umf.owl"))
        .and_then(|p| member(p, "blankNodeScope"))
        .cloned()
        .unwrap_or(Value::Null)
}

fn owl_list(
    rows: &[Value],
    head: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let mut current = copy_json(head, ctx)?;
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    loop {
        ctx.charge_work(1, Utf16::default())?;
        if text(member(&current, "kind")) == Some(&u("iri"))
            && text(member(&current, "value")) == Some(&u(&format!("{RDF}nil")))
        {
            if rows.iter().any(|q| {
                member(q, "subject").is_some_and(|s| term_eq(s, &current))
                    && predicate(q).is_some_and(|p| {
                        p == &u(&format!("{RDF}first")) || p == &u(&format!("{RDF}rest"))
                    })
            }) {
                return Err(EngineError::new(
                    "OWL_EXPRESSION",
                    Utf16::default(),
                    "rdf:nil must not have list structure",
                ));
            }
            break;
        }
        if out.len() >= 10_000
            || text(member(&current, "kind")) == Some(&u("literal"))
            || !seen.insert(term_key_metered(&current, ctx)?)
        {
            return Err(EngineError::new(
                "OWL_EXPRESSION",
                Utf16::default(),
                "Malformed, literal, cyclic, or overlong expression list",
            ));
        }
        let mut first = Vec::new();
        let mut rest = Vec::new();
        ctx.charge_work(rows.len(), Utf16::default())?;
        for q in rows {
            if member(q, "subject").is_some_and(|s| term_eq(s, &current)) {
                let p = text(member(
                    member(q, "predicate").unwrap_or(&Value::Null),
                    "value",
                ));
                if p == Some(&u(&format!("{RDF}first"))) {
                    if let Some(o) = member(q, "object") {
                        if !first.iter().any(|x| term_eq(x, o)) {
                            reserve_items(&mut first, 1, ctx)?;
                            first.push(copy_json(o, ctx)?);
                        }
                    }
                }
                if p == Some(&u(&format!("{RDF}rest"))) {
                    if let Some(o) = member(q, "object") {
                        if !rest.iter().any(|x| term_eq(x, o)) {
                            reserve_items(&mut rest, 1, ctx)?;
                            rest.push(copy_json(o, ctx)?);
                        }
                    }
                }
            }
        }
        if first.len() != 1 || rest.len() != 1 {
            return Err(EngineError::new(
                "OWL_EXPRESSION",
                Utf16::default(),
                "List cell requires exactly one rdf:first and rdf:rest",
            ));
        }
        reserve_items(&mut out, 1, ctx)?;
        out.push(copy_json(&first[0], ctx)?);
        current = copy_json(&rest[0], ctx)?;
    }
    Ok(out)
}

fn owl_list_quad_indexes(
    rows: &[Value],
    head: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    let mut current = copy_json(head, ctx)?;
    let mut seen = BTreeSet::new();
    let mut indexes = Vec::new();
    while !(text(member(&current, "kind")) == Some(&u("iri"))
        && text(member(&current, "value")) == Some(&u(&format!("{RDF}nil"))))
        && seen.insert(term_key_metered(&current, ctx)?)
        && seen.len() <= 10_000
    {
        let mut next = None;
        ctx.charge_work(rows.len(), Utf16::default())?;
        for (index, q) in rows.iter().enumerate() {
            if member(q, "subject").is_some_and(|s| term_eq(s, &current)) {
                if let Some(p) = predicate(q) {
                    if p == &u(&format!("{RDF}first")) || p == &u(&format!("{RDF}rest")) {
                        reserve_items(&mut indexes, 1, ctx)?;
                        indexes.push(index);
                    }
                    if p == &u(&format!("{RDF}rest")) {
                        next = member(q, "object")
                            .map(|value| copy_json(value, ctx))
                            .transpose()?;
                    }
                }
            }
        }
        let Some(value) = next else { break };
        current = value;
    }
    Ok(indexes)
}

fn distinct_terms(
    terms: impl IntoIterator<Item = Value>,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let mut unique = BTreeMap::new();
    for term in terms {
        let key = term_key_metered(&term, ctx)?;
        if !unique.contains_key(&key) {
            unique.insert(key, term);
        }
    }
    ctx.charge_work(unique.len(), Utf16::default())?;
    Ok(unique.into_values().collect())
}
fn predicate(q: &Value) -> Option<&Utf16> {
    text(member(member(q, "predicate")?, "value"))
}
fn grouped(
    rows: &[Value],
    ctx: &mut Context<'_>,
) -> Result<BTreeMap<Vec<u16>, (Value, Vec<(usize, Value)>)>, EngineError> {
    let mut groups = BTreeMap::new();
    for (index, row) in rows.iter().enumerate() {
        if let Some(subject) = member(row, "subject") {
            ctx.charge_work(1, Utf16::default())?;
            let key = term_key_metered(subject, ctx)?;
            if !groups.contains_key(&key) {
                ctx.charge_work(key.len(), Utf16::default())?;
                groups.insert(key.clone(), (copy_json(subject, ctx)?, Vec::new()));
            }
            let statements = &mut groups.get_mut(&key).expect("group inserted").1;
            statements.try_reserve(1).map_err(|_| {
                EngineError::new("LIMIT", Utf16::default(), "OWL group allocation failed")
            })?;
            statements.push((index, copy_json(row, ctx)?));
        }
    }
    Ok(groups)
}
fn objects_for(
    rows: &[(usize, Value)],
    predicate_iri: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    ctx.charge_work(rows.len(), Utf16::default())?;
    distinct_terms(
        rows.iter()
            .filter(|(_, row)| predicate(row) == Some(&u(predicate_iri)))
            .filter_map(|(_, row)| member(row, "object"))
            .map(|value| copy_json(value, ctx))
            .collect::<Result<Vec<_>, _>>()?,
        ctx,
    )
}

pub fn get_owl_list_axioms(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let rows = owl_quads(rt, document, ctx)?;
    let groups = grouped(&rows, ctx)?;
    let mut axioms = Vec::new();
    let mut malformed = Vec::new();
    for (_, (node, statements)) in &groups {
        for (predicate_iri, kind) in [
            (format!("{OWL}propertyChainAxiom"), "propertyChain"),
            (format!("{OWL}hasKey"), "key"),
            (format!("{OWL}disjointUnionOf"), "disjointUnion"),
        ] {
            for (index, row) in statements {
                if predicate(row) != Some(&u(&predicate_iri)) {
                    continue;
                }
                let Some(head) = member(row, "object") else {
                    continue;
                };
                ctx.charge_work(1, Utf16::default())?;
                let indexes = Value::Array(vec![Value::Number(*index as f64)]);
                let members = match owl_list(&rows, head, ctx) {
                    Ok(members) => members,
                    Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                        return Err(failure)
                    }
                    Err(failure) => {
                        reserve_items(&mut malformed, 1, ctx)?;
                        malformed.push(Value::Object(vec![
                            (u("kind"), Value::string_utf8(kind)),
                            (u("node"), copy_json(node, ctx)?),
                            (u("head"), copy_json(head, ctx)?),
                            (u("quadIndexes"), indexes),
                            (u("reason"), Value::String(failure.message)),
                        ]));
                        continue;
                    }
                };
                let min = if kind == "key" { 1 } else { 2 };
                if members.len() < min
                    || members
                        .iter()
                        .any(|term| text(member(term, "kind")) == Some(&u("literal")))
                {
                    reserve_items(&mut malformed, 1, ctx)?;
                    malformed.push(Value::Object(vec![
                        (u("kind"), Value::string_utf8(kind)),
                        (u("node"), copy_json(node, ctx)?),
                        (u("head"), copy_json(head, ctx)?),
                        (u("quadIndexes"), indexes),
                        (
                            u("reason"),
                            Value::string_utf8("List has too few or non-resource members"),
                        ),
                    ]));
                    continue;
                }
                ctx.charge_work(members.len(), Utf16::default())?;
                reserve_items(&mut axioms, 1, ctx)?;
                axioms.push(Value::Object(vec![
                    (u("kind"), Value::string_utf8(kind)),
                    (u("node"), copy_json(node, ctx)?),
                    (u("head"), copy_json(head, ctx)?),
                    (
                        u("members"),
                        Value::Array(
                            members
                                .iter()
                                .map(|term| copy_json(term, ctx))
                                .collect::<Result<_, _>>()?,
                        ),
                    ),
                    (u("quadIndexes"), indexes),
                    (
                        u("listQuadIndexes"),
                        Value::Array(
                            owl_list_quad_indexes(&rows, head, ctx)?
                                .into_iter()
                                .map(|index| Value::Number(index as f64))
                                .collect(),
                        ),
                    ),
                ]));
            }
        }
    }
    Ok(Value::Object(vec![
        (u("profile"), Value::string_utf8("owl-list-axioms-1")),
        (u("complete"), Value::Bool(false)),
        (u("source"), source),
        (u("blankNodeScope"), owl_scope(document)),
        (u("axioms"), Value::Array(axioms)),
        (u("malformed"), Value::Array(malformed)),
    ]))
}

pub fn get_owl_special_axioms(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let rows = owl_quads(rt, document, ctx)?;
    let groups = grouped(&rows, ctx)?;
    let mut axioms = Vec::new();
    let mut malformed = Vec::new();
    for (_, (node, statements)) in &groups {
        let special_types = [
            format!("{OWL}NegativePropertyAssertion"),
            format!("{OWL}AllDifferent"),
            format!("{OWL}AllDisjointClasses"),
            format!("{OWL}AllDisjointProperties"),
        ];
        let types = objects_for(statements, &format!("{RDF}type"), ctx)?
            .into_iter()
            .filter_map(|term| text(member(&term, "value")).and_then(|v| v.to_utf8().ok()))
            .filter(|value| special_types.contains(value))
            .collect::<Vec<_>>();
        if types.is_empty() {
            continue;
        }
        if types.len() != 1 {
            reserve_items(&mut malformed, 1, ctx)?;
            malformed.push(copy_json(node, ctx)?);
            continue;
        }
        ctx.charge_work(statements.len(), Utf16::default())?;
        let indexes = Value::Array(
            statements
                .iter()
                .map(|(index, _)| Value::Number(*index as f64))
                .collect(),
        );
        if types[0] == format!("{OWL}NegativePropertyAssertion") {
            let source_i = objects_for(statements, &format!("{OWL}sourceIndividual"), ctx)?;
            let property = objects_for(statements, &format!("{OWL}assertionProperty"), ctx)?;
            let target_i = objects_for(statements, &format!("{OWL}targetIndividual"), ctx)?;
            let target_v = objects_for(statements, &format!("{OWL}targetValue"), ctx)?;
            if source_i.len() != 1
                || property.len() != 1
                || target_i.len() + target_v.len() != 1
                || text(member(&source_i[0], "kind")) == Some(&u("literal"))
                || text(member(&property[0], "kind")) == Some(&u("literal"))
            {
                reserve_items(&mut malformed, 1, ctx)?;
                malformed.push(copy_json(node, ctx)?);
                continue;
            }
            let individual = !target_i.is_empty();
            let target = if individual {
                &target_i[0]
            } else {
                &target_v[0]
            };
            if (individual && text(member(target, "kind")) == Some(&u("literal")))
                || (!individual && text(member(target, "kind")) != Some(&u("literal")))
            {
                reserve_items(&mut malformed, 1, ctx)?;
                malformed.push(copy_json(node, ctx)?);
                continue;
            }
            reserve_items(&mut axioms, 1, ctx)?;
            axioms.push(Value::Object(vec![
                (u("kind"), Value::string_utf8("negativePropertyAssertion")),
                (u("node"), copy_json(node, ctx)?),
                (u("sourceIndividual"), copy_json(&source_i[0], ctx)?),
                (u("assertionProperty"), copy_json(&property[0], ctx)?),
                (u("target"), copy_json(target, ctx)?),
                (
                    u("targetKind"),
                    Value::string_utf8(if individual { "individual" } else { "value" }),
                ),
                (u("quadIndexes"), indexes),
            ]));
            continue;
        }
        let different = types[0] == format!("{OWL}AllDifferent");
        let predicate_candidates = if different {
            vec![format!("{OWL}members"), format!("{OWL}distinctMembers")]
        } else {
            vec![format!("{OWL}members")]
        };
        let mut candidates = Vec::new();
        for predicate in &predicate_candidates {
            let objects = objects_for(statements, predicate, ctx)?;
            reserve_items(&mut candidates, objects.len(), ctx)?;
            for value in objects {
                ctx.charge_text(predicate.encode_utf16().count(), Utf16::default())?;
                candidates.push((predicate.clone(), value));
            }
        }
        if candidates.len() != 1 {
            reserve_items(&mut malformed, 1, ctx)?;
            malformed.push(copy_json(node, ctx)?);
            continue;
        }
        let (member_predicate, head) = &candidates[0];
        let members = match owl_list(&rows, head, ctx) {
            Ok(members) => members,
            Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                return Err(failure)
            }
            Err(_) => {
                reserve_items(&mut malformed, 1, ctx)?;
                malformed.push(copy_json(node, ctx)?);
                continue;
            }
        };
        if members.len() < 2
            || members
                .iter()
                .any(|term| text(member(term, "kind")) == Some(&u("literal")))
        {
            reserve_items(&mut malformed, 1, ctx)?;
            malformed.push(copy_json(node, ctx)?);
            continue;
        }
        let kind = if different {
            "allDifferent"
        } else if types[0] == format!("{OWL}AllDisjointClasses") {
            "allDisjointClasses"
        } else {
            "allDisjointProperties"
        };
        ctx.charge_work(members.len().saturating_add(1), Utf16::default())?;
        reserve_items(&mut axioms, 1, ctx)?;
        axioms.push(Value::Object(vec![
            (u("kind"), Value::string_utf8(kind)),
            (u("node"), copy_json(node, ctx)?),
            (
                u("members"),
                Value::Array(
                    members
                        .iter()
                        .map(|term| copy_json(term, ctx))
                        .collect::<Result<_, _>>()?,
                ),
            ),
            (
                u("memberPredicate"),
                Value::string_utf8(if member_predicate.ends_with("distinctMembers") {
                    "distinctMembers"
                } else {
                    "members"
                }),
            ),
            (u("quadIndexes"), indexes),
        ]));
    }
    Ok(Value::Object(vec![
        (u("profile"), Value::string_utf8("owl-special-axioms-1")),
        (u("complete"), Value::Bool(false)),
        (u("source"), source),
        (u("blankNodeScope"), owl_scope(document)),
        (u("axioms"), Value::Array(axioms)),
        (u("malformed"), Value::Array(malformed)),
    ]))
}

fn triple_key(
    subject: &Value,
    predicate: &Value,
    object: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<u16>, EngineError> {
    let mut key = term_key_metered(subject, ctx)?;
    key.extend(term_key_metered(predicate, ctx)?);
    key.extend(term_key_metered(object, ctx)?);
    Ok(key)
}

/// Finds reifications of one selected source occurrence and the finite nested
/// annotation graph attached to them. The source snapshot remains included.
pub fn get_owl_axiom_annotations(
    rt: &RdfRuntime,
    document: &Value,
    quad_index: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let rows = owl_quads(rt, document, ctx)?;
    if quad_index >= rows.len() {
        return Err(EngineError::new(
            "OWL_ANNOTATION_INDEX",
            Utf16::default(),
            "Expected an existing source quad index",
        ));
    }
    let grouped = grouped(&rows, ctx)?;
    let mut target_index = BTreeMap::<Vec<u16>, Vec<usize>>::new();
    for (i, q) in rows.iter().enumerate() {
        if let (Some(s), Some(p), Some(o)) = (
            member(q, "subject"),
            member(q, "predicate"),
            member(q, "object"),
        ) {
            let key = triple_key(s, p, o, ctx)?;
            let indexes = target_index.entry(key).or_default();
            reserve_items(indexes, 1, ctx)?;
            indexes.push(i);
        }
    }
    let mut records = BTreeMap::<Vec<u16>, Value>::new();
    let mut malformed = Vec::new();
    let axiom_type = u(&format!("{OWL}Axiom"));
    let annotation_type = u(&format!("{OWL}Annotation"));
    let rdf_type = u(&format!("{RDF}type"));
    for (_, (node, statements)) in &grouped {
        let types = objects_for(statements, &format!("{RDF}type"), ctx)?;
        let kinds = types
            .iter()
            .filter_map(|term| {
                let t = text(member(term, "value"))?;
                if t == &axiom_type {
                    Some("Axiom")
                } else if t == &annotation_type {
                    Some("Annotation")
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        if kinds.is_empty() {
            continue;
        }
        let sources = objects_for(statements, &format!("{OWL}annotatedSource"), ctx)?;
        let predicates = objects_for(statements, &format!("{OWL}annotatedProperty"), ctx)?;
        let targets = objects_for(statements, &format!("{OWL}annotatedTarget"), ctx)?;
        if kinds.len() != 1
            || sources.len() != 1
            || predicates.len() != 1
            || targets.len() != 1
            || text(member(&sources[0], "kind")) == Some(&u("literal"))
            || text(member(&predicates[0], "kind")) != Some(&u("iri"))
        {
            malformed.push(copy_json(node, ctx)?);
            continue;
        }
        let target = Value::Object(vec![
            (u("subject"), copy_json(&sources[0], ctx)?),
            (u("predicate"), copy_json(&predicates[0], ctx)?),
            (u("object"), copy_json(&targets[0], ctx)?),
        ]);
        let mut asserted = Vec::new();
        if let (Some(s), Some(p), Some(o)) = (
            member(&target, "subject"),
            member(&target, "predicate"),
            member(&target, "object"),
        ) {
            asserted = target_index
                .get(&triple_key(s, p, o, ctx)?)
                .cloned()
                .unwrap_or_default();
        }
        let annotation_indexes = statements
            .iter()
            .filter_map(|(i, q)| {
                let predicate = predicate(q)?;
                let structural = predicate == &u(&format!("{OWL}annotatedSource"))
                    || predicate == &u(&format!("{OWL}annotatedProperty"))
                    || predicate == &u(&format!("{OWL}annotatedTarget"));
                let typing = predicate == &rdf_type
                    && member(q, "object")
                        .and_then(|o| text(member(o, "value")))
                        .is_some_and(|t| t == &axiom_type || t == &annotation_type);
                (!structural && !typing).then_some(*i)
            })
            .collect::<Vec<_>>();
        let record = Value::Object(vec![
            (u("node"), copy_json(node, ctx)?),
            (u("kind"), Value::string_utf8(kinds[0])),
            (u("target"), target),
            (
                u("assertedQuadIndexes"),
                Value::Array(asserted.iter().map(|i| Value::Number(*i as f64)).collect()),
            ),
            (
                u("annotationQuadIndexes"),
                Value::Array(
                    annotation_indexes
                        .iter()
                        .map(|i| Value::Number(*i as f64))
                        .collect(),
                ),
            ),
            (u("nested"), Value::Array(Vec::new())),
        ]);
        records.insert(term_key_metered(node, ctx)?, record);
    }
    let selected = &rows[quad_index];
    let mut roots = Vec::new();
    let mut todo = Vec::new();
    if let (Some(s), Some(p), Some(o)) = (
        member(selected, "subject"),
        member(selected, "predicate"),
        member(selected, "object"),
    ) {
        let selected_key = triple_key(s, p, o, ctx)?;
        for record in records.values() {
            if text(field(record, "kind")) != Some(&u("Axiom")) {
                continue;
            }
            let Some(target) = field(record, "target") else {
                continue;
            };
            let target_key = triple_key(
                member(target, "subject").unwrap_or(&Value::Null),
                member(target, "predicate").unwrap_or(&Value::Null),
                member(target, "object").unwrap_or(&Value::Null),
                ctx,
            )?;
            if target_key == selected_key {
                if let Some(node) = field(record, "node") {
                    reserve_items(&mut roots, 1, ctx)?;
                    roots.push(copy_json(node, ctx)?);
                    let node_key = term_key_metered(node, ctx)?;
                    reserve_items(&mut todo, 1, ctx)?;
                    todo.push(node_key);
                }
            }
        }
    }
    let mut reachable = BTreeSet::new();
    let mut nested_map = BTreeMap::<Vec<u16>, BTreeMap<Vec<u16>, Value>>::new();
    while let Some(parent_key) = todo.pop() {
        ctx.charge_work(parent_key.len(), Utf16::default())?;
        if !reachable.insert(parent_key.clone()) {
            continue;
        }
        let Some(parent) = records.get(&parent_key) else {
            continue;
        };
        for index in values(field(parent, "annotationQuadIndexes"))
            .iter()
            .filter_map(|v| {
                if let Value::Number(n) = v {
                    Some(*n as usize)
                } else {
                    None
                }
            })
        {
            let Some(q) = rows.get(index) else { continue };
            let (Some(s), Some(p), Some(o)) = (
                member(q, "subject"),
                member(q, "predicate"),
                member(q, "object"),
            ) else {
                continue;
            };
            let key = triple_key(s, p, o, ctx)?;
            for child in records.values() {
                if text(field(child, "kind")) != Some(&u("Annotation")) {
                    continue;
                }
                let Some(target) = field(child, "target") else {
                    continue;
                };
                let child_target_key = triple_key(
                    member(target, "subject").unwrap_or(&Value::Null),
                    member(target, "predicate").unwrap_or(&Value::Null),
                    member(target, "object").unwrap_or(&Value::Null),
                    ctx,
                )?;
                if child_target_key == key {
                    if let Some(node) = field(child, "node") {
                        let child_key = term_key_metered(node, ctx)?;
                        ctx.charge_work(parent_key.len(), Utf16::default())?;
                        ctx.charge_work(child_key.len(), Utf16::default())?;
                        nested_map
                            .entry(parent_key.clone())
                            .or_default()
                            .insert(child_key.clone(), copy_json(node, ctx)?);
                        reserve_items(&mut todo, 1, ctx)?;
                        todo.push(child_key);
                    }
                }
            }
        }
    }
    let mut output_records = Vec::new();
    for key in reachable {
        let mut record = records
            .get(&key)
            .ok_or_else(|| {
                EngineError::new(
                    "OWL_ANNOTATION",
                    Utf16::default(),
                    "Reification record disappeared",
                )
            })?
            .clone();
        if let Value::Object(fields) = &mut record {
            if let Some((_, Value::Array(nested))) =
                fields.iter_mut().find(|(name, _)| name == &u("nested"))
            {
                *nested = nested_map
                    .remove(&key)
                    .unwrap_or_default()
                    .into_values()
                    .map(|node| copy_json(&node, ctx))
                    .collect::<Result<_, _>>()?;
            }
        }
        output_records.push(record);
    }
    Ok(Value::Object(vec![
        (u("profile"), Value::string_utf8("owl-annotations-1")),
        (u("complete"), Value::Bool(false)),
        (u("source"), source),
        (u("blankNodeScope"), owl_scope(document)),
        (u("quadIndex"), Value::Number(quad_index as f64)),
        (
            u("roots"),
            Value::Array(
                roots
                    .into_iter()
                    .map(|node| copy_json(&node, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        ),
        (u("records"), Value::Array(output_records)),
        (u("malformed"), Value::Array(malformed)),
    ]))
}

pub fn get_owl_declarations(
    rt: &RdfRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let rows = owl_quads(rt, document, ctx)?;
    let kinds = [
        (format!("{OWL}Class"), "class"),
        (
            "http://www.w3.org/2000/01/rdf-schema#Datatype".to_owned(),
            "datatype",
        ),
        (format!("{OWL}ObjectProperty"), "objectProperty"),
        (format!("{OWL}DatatypeProperty"), "dataProperty"),
        (format!("{OWL}AnnotationProperty"), "annotationProperty"),
        (format!("{OWL}NamedIndividual"), "namedIndividual"),
    ];
    let mut declarations = BTreeMap::<(Vec<u16>, &'static str), (Value, Vec<usize>)>::new();
    for (index, row) in rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if predicate(row) != Some(&u(&format!("{RDF}type"))) {
            continue;
        }
        let (Some(subject), Some(object)) = (member(row, "subject"), member(row, "object")) else {
            continue;
        };
        if text(member(object, "kind")) != Some(&u("iri")) {
            continue;
        }
        let Some((_, kind)) = kinds
            .iter()
            .find(|(iri, _)| text(member(object, "value")) == Some(&u(iri)))
        else {
            continue;
        };
        let subject_key = term_key_metered(subject, ctx)?;
        let key = (subject_key, *kind);
        if !declarations.contains_key(&key) {
            // The map key is caller-derived and cloning it duplicates a potentially
            // large RDF identifier, so admit that work before the clone.
            ctx.charge_work(key.0.len(), Utf16::default())?;
            declarations.insert(key.clone(), (copy_json(subject, ctx)?, Vec::new()));
        }
        let record = declarations.get_mut(&key).expect("declaration inserted");
        ctx.charge_work(1, Utf16::default())?;
        record.1.push(index);
    }
    let mut named = Vec::new();
    let mut anonymous = Vec::new();
    for ((_, kind), (node, indexes)) in declarations {
        let target = if text(member(&node, "kind")) == Some(&u("iri")) {
            &mut named
        } else {
            &mut anonymous
        };
        ctx.charge_work(indexes.len().saturating_add(1), Utf16::default())?;
        reserve_items(target, 1, ctx)?;
        target.push(Value::Object(vec![
            (u("node"), copy_json(&node, ctx)?),
            (u("kind"), Value::string_utf8(kind)),
            (
                u("quadIndexes"),
                Value::Array(
                    indexes
                        .into_iter()
                        .map(|i| Value::Number(i as f64))
                        .collect(),
                ),
            ),
        ]));
    }
    Ok(Value::Object(vec![
        (u("profile"), Value::string_utf8("owl-declarations-1")),
        (u("complete"), Value::Bool(false)),
        (u("source"), source),
        (u("blankNodeScope"), owl_scope(document)),
        (u("declarations"), Value::Array(named)),
        (u("anonymousTypeAssertions"), Value::Array(anonymous)),
    ]))
}

#[cfg(test)]
mod baseline_tests {
    use super::*;
    use crate::rdf::{import_rdf_turtle, RdfRuntime};

    fn member_mut_path<'a>(value: &'a mut Value, path: &[&str]) -> Option<&'a mut Value> {
        let mut current = value;
        for segment in path {
            current = match current {
                Value::Object(fields) => fields
                    .iter_mut()
                    .find(|(key, _)| key == &u(segment))
                    .map(|(_, value)| value)?,
                Value::Array(items) => items.get_mut(segment.parse::<usize>().ok()?)?,
                _ => return None,
            };
        }
        Some(current)
    }

    fn domain_document(
        document: &Value,
        extension: &str,
        version_field: &str,
        version: &str,
        ctx: &mut Context<'_>,
    ) -> Value {
        let mut result = copy_json(document, ctx).unwrap();
        let mut payload = None;
        if let Value::Object(fields) = &result {
            if let Some((_, Value::Array(modules))) =
                fields.iter().find(|(key, _)| key == &u("modules"))
            {
                for module in modules {
                    if let Value::Object(members) = module {
                        if let Some((_, Value::Array(elements))) =
                            members.iter().find(|(key, _)| key == &u("elements"))
                        {
                            for element in elements {
                                if let Value::Object(element_fields) = element {
                                    if let Some((_, Value::Object(extensions))) = element_fields
                                        .iter()
                                        .find(|(key, _)| key == &u("extensions"))
                                    {
                                        payload = extensions
                                            .iter()
                                            .find(|(key, _)| key == &u("umf.rdf"))
                                            .map(|(_, value)| value.clone());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        let mut payload = payload.unwrap();
        if let Value::Object(fields) = &mut payload {
            fields.push((u(version_field), Value::string_utf8(version)));
        }
        if let Value::Object(fields) = &mut result {
            if let Some((_, vocabularies)) =
                fields.iter_mut().find(|(key, _)| key == &u("vocabularies"))
            {
                *vocabularies = Value::Object(vec![(
                    u(extension),
                    Value::Object(vec![(u("version"), Value::string_utf8("0.1.0"))]),
                )]);
            }
            if let Some((_, Value::Array(modules))) =
                fields.iter_mut().find(|(key, _)| key == &u("modules"))
            {
                if let Some(Value::Object(module_fields)) = modules.first_mut() {
                    if let Some((_, Value::Array(elements))) = module_fields
                        .iter_mut()
                        .find(|(key, _)| key == &u("elements"))
                    {
                        if let Some(Value::Object(element_fields)) = elements.first_mut() {
                            if let Some((_, extensions)) = element_fields
                                .iter_mut()
                                .find(|(key, _)| key == &u("extensions"))
                            {
                                *extensions = Value::Object(vec![(u(extension), payload)]);
                            }
                        }
                    }
                }
            }
        }
        result
    }

    #[test]
    fn path_evaluation_and_core_target_select_one_data_term() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/shape> <http://www.w3.org/ns/shacl#path> <https://ex.test/name> .\n<https://ex.test/shape> <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/focus> .\n").units(),
            &u("shapes"), &u("https://ex.test/"), None, &mut ctx,
        ).unwrap();
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/focus> <https://ex.test/name> \"Ada\" .\n").units(),
            &u("data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let shape = Value::Object(vec![
            (u("kind"), Value::string_utf8("iri")),
            (u("value"), Value::string_utf8("https://ex.test/shape")),
        ]);
        assert_eq!(
            get_shacl_property_path(&runtime, &shapes, &shape, &mut ctx).unwrap(),
            ShaclPath::Predicate(u("https://ex.test/name"))
        );
        let focus = Value::Object(vec![
            (u("kind"), Value::string_utf8("iri")),
            (u("value"), Value::string_utf8("https://ex.test/focus")),
        ]);
        let found =
            evaluate_shacl_property_path(&runtime, &shapes, &shape, &data, &focus, &mut ctx)
                .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(text(member(&found[0], "value")), Some(&u("Ada")));
        let targets = get_shacl_target_nodes(&runtime, &shapes, &shape, &data, &mut ctx).unwrap();
        assert_eq!(values(Some(&targets)).len(), 1);
        assert!(term_eq(&values(Some(&targets))[0], &focus));
    }

    #[test]
    fn conforming_compound_path_keeps_its_declared_blank_path_term() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ;
  <http://www.w3.org/ns/shacl#property> _:place .
_:place <http://www.w3.org/ns/shacl#path> (<https://ex.test/address> <https://ex.test/city>) ;
  <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#,
            )
            .units(),
            &u("compound-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from(
                "<https://ex.test/alice> <https://ex.test/address> <https://ex.test/place> .\n<https://ex.test/place> <https://ex.test/city> \"Paris\" .\n",
            )
            .units(),
            &u("compound-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("compound-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(text(member(&result, "status")), Some(&u("evaluated")));
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(true)));
    }

    #[test]
    fn ontology_header_exposes_only_explicit_version_and_import_terms() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let rdf_document=import_rdf_turtle(&runtime,
            Utf16::from("<https://ex.test/onto> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Ontology> .\n<https://ex.test/onto> <http://www.w3.org/2002/07/owl#versionIRI> <https://ex.test/onto/1> .\n<https://ex.test/onto> <http://www.w3.org/2002/07/owl#imports> <https://ex.test/imported> .\n").units(),
            &u("ontology"),&u("https://ex.test/"),None,&mut ctx).unwrap();
        let document = domain_document(&rdf_document, "umf.owl", "owlVersion", "2", &mut ctx);
        let headers = get_owl_ontology_headers(&runtime, &document, &mut ctx).unwrap();
        let rows = values(Some(&headers));
        assert_eq!(rows.len(), 1);
        assert_eq!(values(member(&rows[0], "versionIRIs")).len(), 1);
        assert_eq!(values(member(&rows[0], "imports")).len(), 1);
    }

    #[test]
    fn owl_graph_import_export_and_edit_use_the_rdf_kernel() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let mut document = import_owl_turtle(
            &runtime,
            Utf16::from("<https://ex.test/s> <https://ex.test/p> \"before\" .\n").units(),
            &u("owl"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        if let Value::Object(fields) = &mut document {
            if let Some((_, Value::Array(modules))) =
                fields.iter_mut().find(|(key, _)| key == &u("modules"))
            {
                if let Some(Value::Object(module)) = modules.first_mut() {
                    if let Some((_, Value::Array(elements))) =
                        module.iter_mut().find(|(key, _)| key == &u("elements"))
                    {
                        if let Some(Value::Object(element)) = elements.first_mut() {
                            if let Some((_, Value::Object(extensions))) =
                                element.iter_mut().find(|(key, _)| key == &u("extensions"))
                            {
                                extensions.push((
                                    u("future.vendor"),
                                    Value::Object(vec![(
                                        u("opaque"),
                                        Value::string_utf8("preserve"),
                                    )]),
                                ));
                            }
                        }
                    }
                }
            }
        }
        let original = export_owl_turtle(&runtime, &document, &mut ctx).unwrap();
        assert!(String::from_utf16_lossy(original.units()).contains("before"));
        assert_eq!(
            values(Some(&get_owl_quads(&runtime, &document, &mut ctx).unwrap())).len(),
            1
        );
        let inspected = inspect_owl_document(&document, &mut ctx).unwrap();
        assert_eq!(member(&inspected, "valid"), Some(&Value::Bool(true)));
        assert_eq!(member(&inspected, "complete"), Some(&Value::Bool(false)));
        let rows = owl_quads(&runtime, &document, &mut ctx).unwrap();
        let first = values(Some(&rows)).first().unwrap();
        let mut replacement = copy_json(first, &mut ctx).unwrap();
        if let Value::Object(fields) = &mut replacement {
            if let Some((_, object)) = fields.iter_mut().find(|(key, _)| key == &u("object")) {
                *object = Value::Object(vec![
                    (u("kind"), Value::string_utf8("literal")),
                    (u("value"), Value::string_utf8("after")),
                    (
                        u("datatype"),
                        Value::string_utf8("http://www.w3.org/2001/XMLSchema#string"),
                    ),
                ]);
            }
        }
        let edited = propose_owl_quad_edit(&runtime, &document, 0, &replacement, &mut ctx).unwrap();
        let next = member(&edited, "document").unwrap();
        let module = values(member(next, "modules")).first().unwrap();
        let element = values(member(module, "elements")).first().unwrap();
        let extension = member(member(element, "extensions").unwrap(), "future.vendor").unwrap();
        assert_eq!(text(member(extension, "opaque")), Some(&u("preserve")));
        let output = export_owl_turtle(&runtime, next, &mut ctx).unwrap();
        assert!(String::from_utf16_lossy(output.units()).contains("after"));
        assert_eq!(
            member(member(&edited, "validation").unwrap(), "valid"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn expression_and_axiom_annotation_views_preserve_local_rdf_structure() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let expression_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("_:restriction <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Restriction> .\n_:restriction <http://www.w3.org/2002/07/owl#onProperty> <https://ex.test/name> .\n_:restriction <http://www.w3.org/2002/07/owl#minCardinality> \"1\"^^<http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .\n").units(),
            &u("expression"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let expression_doc =
            domain_document(&expression_rdf, "umf.owl", "owlVersion", "2", &mut ctx);
        let node = Value::Object(vec![
            (u("kind"), Value::string_utf8("blank")),
            (u("value"), Value::string_utf8("restriction")),
        ]);
        let expression =
            get_owl_expression_view(&expression_doc, &node, &runtime, &mut ctx).unwrap();
        assert_eq!(
            text(member(member(&expression, "expression").unwrap(), "kind")),
            Some(&u("restriction"))
        );

        let annotations_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/s> <https://ex.test/p> <https://ex.test/o> .\n<https://ex.test/Person> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .\n_:axiom <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Axiom> .\n_:axiom <http://www.w3.org/2002/07/owl#annotatedSource> <https://ex.test/s> .\n_:axiom <http://www.w3.org/2002/07/owl#annotatedProperty> <https://ex.test/p> .\n_:axiom <http://www.w3.org/2002/07/owl#annotatedTarget> <https://ex.test/o> .\n_:axiom <https://ex.test/source> \"authored\" .\n").units(),
            &u("annotations"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let annotations_doc =
            domain_document(&annotations_rdf, "umf.owl", "owlVersion", "2", &mut ctx);
        let annotations =
            get_owl_axiom_annotations(&runtime, &annotations_doc, 0, &mut ctx).unwrap();
        assert_eq!(values(member(&annotations, "roots")).len(), 1);
        let records = values(member(&annotations, "records"));
        assert_eq!(records.len(), 1);
        assert_eq!(text(member(&records[0], "kind")), Some(&u("Axiom")));
        assert_eq!(
            values(member(&records[0], "annotationQuadIndexes")).len(),
            1
        );
        let declarations = get_owl_declarations(&runtime, &annotations_doc, &mut ctx).unwrap();
        assert_eq!(values(member(&declarations, "declarations")).len(), 1);
    }

    #[test]
    fn shape_metadata_reports_declared_constraints_without_claiming_validation() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/shape> <http://www.w3.org/ns/shacl#property> _:p .\n_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> .\n_:p <http://www.w3.org/ns/shacl#minCount> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n").units(),
            &u("shape"), &u("https://ex.test/"), None, &mut ctx,
        ).unwrap();
        let document = domain_document(&rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let shape = Value::Object(vec![
            (u("kind"), Value::string_utf8("iri")),
            (u("value"), Value::string_utf8("https://ex.test/shape")),
        ]);
        let metadata = get_shacl_shape_metadata(&runtime, &document, &shape, &mut ctx).unwrap();
        assert_eq!(
            text(member(&metadata, "profile")),
            Some(&u("shacl-metadata-1"))
        );
        assert_eq!(values(member(&metadata, "properties")).len(), 1);
        assert_eq!(member(&metadata, "complete"), Some(&Value::Bool(false)));
        let child = &values(member(&metadata, "properties"))[0];
        assert_eq!(values(member(child, "constraints")).len(), 1);
        assert_eq!(
            text(member(member(child, "path").unwrap(), "status")),
            Some(&u("compiled"))
        );
    }

    #[test]
    fn engine_collects_class_predicate_and_implicit_class_targets() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetClass> <https://ex.test/Person> ;
  <http://www.w3.org/ns/shacl#targetSubjectsOf> <https://ex.test/friend> ;
  <http://www.w3.org/ns/shacl#targetObjectsOf> <https://ex.test/friend> ;
  <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> ;
  <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#,
            )
            .units(),
            &u("shapes-targets"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let passing_rdf = import_rdf_turtle(&runtime, Utf16::from(r#"
<https://ex.test/alice> a <https://ex.test/Person> ; <https://ex.test/name> "Alice" ; <https://ex.test/friend> <https://ex.test/bob> .
<https://ex.test/bob> <https://ex.test/name> "Bob" .
"#).units(), &u("data-targets"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let passing = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &passing_rdf,
            &u("target-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(member(&passing, "engineConforms"), Some(&Value::Bool(true)));
        let failing_rdf = import_rdf_turtle(&runtime, Utf16::from(r#"
<https://ex.test/alice> a <https://ex.test/Person> ; <https://ex.test/name> "Alice" ; <https://ex.test/friend> <https://ex.test/bob> .
"#).units(), &u("data-targets-fail"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let failing = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &failing_rdf,
            &u("target-report-fail"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&failing, "engineConforms"),
            Some(&Value::Bool(false))
        );

        let implicit_rdf = import_rdf_turtle(&runtime, Utf16::from(r#"
<https://ex.test/Implicit> a <http://www.w3.org/ns/shacl#NodeShape>, <http://www.w3.org/2000/01/rdf-schema#Class> ; <http://www.w3.org/ns/shacl#property> _:ip .
_:ip <http://www.w3.org/ns/shacl#path> <https://ex.test/name> ; <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#).units(), &u("implicit-shape"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let implicit_shapes =
            domain_document(&implicit_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let implicit_data = import_rdf_turtle(&runtime, Utf16::from(r#"<https://ex.test/alice> a <https://ex.test/Implicit> ; <https://ex.test/name> "Alice" .
"#).units(), &u("implicit-data"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let implicit = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &implicit_shapes,
            &implicit_data,
            &u("implicit-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&implicit, "engineConforms"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn engine_reports_qualified_count_and_custom_message_metadata() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ;
  <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> ;
  <http://www.w3.org/ns/shacl#qualifiedValueShape> _:qualified ;
  <http://www.w3.org/ns/shacl#qualifiedMinCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> ;
  <http://www.w3.org/ns/shacl#severity> <http://www.w3.org/ns/shacl#Warning> ;
  <http://www.w3.org/ns/shacl#message> "Expected a person resource" .
_:qualified <http://www.w3.org/ns/shacl#nodeKind> <http://www.w3.org/ns/shacl#IRI> .
"#,
            )
            .units(),
            &u("qualified-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from(r#"<https://ex.test/alice> <https://ex.test/name> "Ada" ."#).units(),
            &u("qualified-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("qualified-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&Value::string_utf8("evaluated"))
        );
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(false)));
        let report = member(&result, "report").unwrap();
        let report_quads = rdf::get_rdf_quads(&runtime, report, &mut ctx).unwrap();
        assert!(values(Some(&report_quads)).iter().any(|quad| {
            text(member(member(quad, "predicate"), "value"))
                == Some(&u("http://www.w3.org/ns/shacl#resultMessage"))
                && text(member(member(quad, "object"), "value"))
                    == Some(&u("Expected a person resource"))
        }));
        assert!(values(Some(&report_quads)).iter().any(|quad| {
            text(member(member(quad, "predicate"), "value"))
                == Some(&u("http://www.w3.org/ns/shacl#resultSeverity"))
                && text(member(member(quad, "object"), "value"))
                    == Some(&u("http://www.w3.org/ns/shacl#Warning"))
        }));
    }

    #[test]
    fn engine_pattern_flags_apply_standard_regex_options() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ;
  <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> ;
  <http://www.w3.org/ns/shacl#pattern> "ada [0-9]+" ;
  <http://www.w3.org/ns/shacl#flags> "i" .
"#,
            )
            .units(),
            &u("pattern-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from(r#"<https://ex.test/alice> <https://ex.test/name> "ADA 7" ."#).units(),
            &u("pattern-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("pattern-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(true)));
    }

    #[test]
    fn engine_honors_deactivated_shape_and_retains_default_value_metadata() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ;
  <http://www.w3.org/ns/shacl#deactivated> true ;
  <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> ;
  <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> ;
  <http://www.w3.org/ns/shacl#defaultValue> "unknown" .
"#,
            )
            .units(),
            &u("deactivated-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/alice> <https://ex.test/age> \"7\" .").units(),
            &u("deactivated-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("deactivated-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&Value::string_utf8("evaluated"))
        );
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(true)));
        let source = export_shacl_turtle(&runtime, &shapes, &mut ctx).unwrap();
        let source = source.to_utf8().unwrap();
        assert!(source.contains("defaultValue"));
        assert!(source.contains("unknown"));
    }

    #[test]
    fn shared_scope_finds_rdf_payload_by_dataset_ids_after_module_reordering() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(r#"<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ."#).units(),
            &u("shared-shapes"),
            &u("https://ex.test/"),
            Some(&u("same-scope")),
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/alice> <https://ex.test/name> \"Ada\" .").units(),
            &u("shared-data"),
            &u("https://ex.test/"),
            Some(&u("same-scope")),
            &mut ctx,
        )
        .unwrap();
        let mut data = data;
        if let Value::Object(fields) = &mut data {
            if let Some((_, Value::Array(modules))) =
                fields.iter_mut().find(|(key, _)| key == &u("modules"))
            {
                modules.insert(
                    0,
                    Value::Object(vec![
                        (u("id"), Value::string_utf8("unrelated")),
                        (u("namespace"), Value::string_utf8("")),
                        (u("elements"), Value::Array(Vec::new())),
                    ]),
                );
            }
        }
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("shared-report"),
            &u("shared-scope"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&Value::string_utf8("evaluated"))
        );
    }

    #[test]
    fn nested_shape_evaluates_sequence_property_path() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/top> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ;
  <http://www.w3.org/ns/shacl#property> _:friend .
_:friend <http://www.w3.org/ns/shacl#path> <https://ex.test/friend> ;
  <http://www.w3.org/ns/shacl#node> _:nested .
_:nested <http://www.w3.org/ns/shacl#property> _:name .
_:name <http://www.w3.org/ns/shacl#path> ( <https://ex.test/child> <https://ex.test/name> ) ;
  <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#,
            )
            .units(),
            &u("nested-path-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"<https://ex.test/alice> <https://ex.test/friend> <https://ex.test/bob> .
<https://ex.test/bob> <https://ex.test/child> <https://ex.test/carol> .
<https://ex.test/carol> <https://ex.test/name> "Carol" .
"#,
            )
            .units(),
            &u("nested-path-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("nested-path-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&Value::string_utf8("evaluated"))
        );
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(true)));
    }

    #[test]
    fn engine_reports_closed_shape_extra_predicate() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/person> ;
  <http://www.w3.org/ns/shacl#closed> true ;
  <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> .
"#,
            )
            .units(),
            &u("closed-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data = import_rdf_turtle(&runtime, Utf16::from(r#"<https://ex.test/person> <https://ex.test/name> "Ada" ; <https://ex.test/extra> "x" .
"#).units(), &u("closed-data"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("closed-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(false)));
        let report = member(&result, "report").unwrap();
        let report_quads = rdf::get_rdf_quads(&runtime, report, &mut ctx).unwrap();
        assert!(values(Some(&report_quads)).iter().any(|quad| text(member(
            member(quad, "object"),
            "value"
        )) == Some(&u(
            "http://www.w3.org/ns/shacl#ClosedConstraintComponent"
        ))));
    }

    #[test]
    fn engine_evaluates_datatype_property_constraint_and_reports_component() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(&runtime, Utf16::from(
            "<https://ex.test/shape> <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/person> .\n<https://ex.test/shape> <http://www.w3.org/ns/shacl#property> _:p .\n_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/age> .\n_:p <http://www.w3.org/ns/shacl#datatype> <http://www.w3.org/2001/XMLSchema#integer> .\n").units(), &u("shapes"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"<https://ex.test/person> <https://ex.test/age> "old" .
"#,
            )
            .units(),
            &u("data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let result = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("report-datatype"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(text(member(&result, "status")), Some(&u("evaluated")));
        assert_eq!(member(&result, "engineConforms"), Some(&Value::Bool(false)));
        let report = member(&result, "report").unwrap();
        let report_quads = rdf::get_rdf_quads(&runtime, report, &mut ctx).unwrap();
        assert!(values(Some(&report_quads)).iter().any(|quad| {
            text(member(member(quad, "predicate"), "value"))
                == Some(&u("http://www.w3.org/ns/shacl#sourceConstraintComponent"))
                && text(member(member(quad, "object"), "value"))
                    == Some(&u("http://www.w3.org/ns/shacl#DatatypeConstraintComponent"))
        }));
    }

    #[test]
    fn engine_subset_evaluates_count_and_refuses_unimplemented_constraints() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(&runtime, Utf16::from(
            "<https://ex.test/shape> <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/person> .\n<https://ex.test/shape> <http://www.w3.org/ns/shacl#property> _:p .\n_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> .\n_:p <http://www.w3.org/ns/shacl#minCount> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n").units(), &u("shapes"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let data = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/person> <https://ex.test/name> \"Ada\" .\n").units(),
            &u("data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let report = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data,
            &u("report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(text(member(&report, "status")), Some(&u("evaluated")));
        assert_eq!(member(&report, "engineConforms"), Some(&Value::Bool(true)));
        assert_eq!(member(&report, "complete"), Some(&Value::Bool(false)));

        let empty_data = import_rdf_turtle(
            &runtime,
            &[],
            &u("empty-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let violation = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &empty_data,
            &u("report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(text(member(&violation, "status")), Some(&u("evaluated")));
        assert_eq!(
            member(&violation, "engineConforms"),
            Some(&Value::Bool(false))
        );
        let report = member(&violation, "report").unwrap();
        let report_module = values(member(report, "modules")).first().unwrap();
        let report_element = values(member(report_module, "elements")).first().unwrap();
        let report_payload =
            member(member(report_element, "extensions").unwrap(), "umf.rdf").unwrap();
        assert!(values(member(report_payload, "quads")).len() >= 8);

        let unsupported_rdf = import_rdf_turtle(&runtime, Utf16::from("<https://ex.test/shape> <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/person> .\n<https://ex.test/shape> <http://www.w3.org/ns/shacl#js> <https://ex.test/script> .\n").units(), &u("unsupported"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let unsupported = domain_document(
            &unsupported_rdf,
            "umf.shacl",
            "shaclVersion",
            "1.0",
            &mut ctx,
        );
        let blocked = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &unsupported,
            &data,
            &u("report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(text(member(&blocked, "status")), Some(&u("blocked")));
        assert!(member(&blocked, "engineConforms").is_none());

        let same_label_shapes_rdf = import_rdf_turtle(&runtime, Utf16::from("_:same <http://www.w3.org/ns/shacl#targetNode> _:same .\n_:same <http://www.w3.org/ns/shacl#property> _:p .\n_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> .\n_:p <http://www.w3.org/ns/shacl#minCount> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n").units(), &u("same-shape-label"), &u("https://ex.test/"), None, &mut ctx).unwrap();
        let same_label_shapes = domain_document(
            &same_label_shapes_rdf,
            "umf.shacl",
            "shaclVersion",
            "1.0",
            &mut ctx,
        );
        let same_label_data = import_rdf_turtle(
            &runtime,
            Utf16::from("_:same <https://ex.test/name> \"Ada\" .\n").units(),
            &u("same-data-label"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let disjoint = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &same_label_shapes,
            &same_label_data,
            &u("report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&disjoint, "engineConforms"),
            Some(&Value::Bool(false))
        );
    }

    #[test]
    fn engine_evaluates_nested_or_shapes_and_reports_nonmatching_value() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ;
  <http://www.w3.org/ns/shacl#property> _:property .
_:property <http://www.w3.org/ns/shacl#path> <https://ex.test/value> ;
  <http://www.w3.org/ns/shacl#or> _:choices .
_:choices <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> _:text ;
  <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> _:tail .
_:tail <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> _:boolean ;
  <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .
_:text <http://www.w3.org/ns/shacl#datatype> <http://www.w3.org/2001/XMLSchema#string> .
_:boolean <http://www.w3.org/ns/shacl#datatype> <http://www.w3.org/2001/XMLSchema#boolean> .
"#,
            )
            .units(),
            &u("nested-or-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);

        let good_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/alice> <https://ex.test/value> \"ok\" .\n").units(),
            &u("nested-or-good"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let good = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &good_rdf,
            &u("nested-or-good-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(member(&good, "engineConforms"), Some(&Value::Bool(true)));

        let bad_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                "<https://ex.test/alice> <https://ex.test/value> <https://ex.test/item> .\n",
            )
            .units(),
            &u("nested-or-bad"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let bad = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &bad_rdf,
            &u("nested-or-bad-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(text(member(&bad, "status")), Some(&u("evaluated")));
        assert_eq!(member(&bad, "engineConforms"), Some(&Value::Bool(false)));
    }

    #[test]
    fn exact_decimal_comparisons_do_not_round_large_integers() {
        let integer = |lexical: &str| {
            Value::Object(vec![
                (u("kind"), Value::string_utf8("literal")),
                (u("value"), Value::string_utf8(lexical)),
                (
                    u("datatype"),
                    Value::string_utf8("http://www.w3.org/2001/XMLSchema#integer"),
                ),
            ])
        };
        let decimal = |lexical: &str| {
            Value::Object(vec![
                (u("kind"), Value::string_utf8("literal")),
                (u("value"), Value::string_utf8(lexical)),
                (
                    u("datatype"),
                    Value::string_utf8("http://www.w3.org/2001/XMLSchema#decimal"),
                ),
            ])
        };
        let mut ctx = Context::ordinary();
        assert_eq!(
            shacl_numeric_order(
                &integer("9007199254740993"),
                &integer("9007199254740992"),
                &mut ctx
            )
            .unwrap(),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(
            shacl_numeric_order(&decimal("-2.1250"), &decimal("-2.13"), &mut ctx).unwrap(),
            Some(std::cmp::Ordering::Greater)
        );
    }

    #[test]
    fn shacl_family_source_import_inspection_export_and_edit_round_trip() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let document = import_shacl_turtle(
            &runtime,
            Utf16::from(
                "<https://ex.test/Shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> .\n",
            )
            .units(),
            &u("owl-shacl-public-source"),
            &u("https://ex.test/"),
            Some(&u("shape-scope")),
            &mut ctx,
        )
        .unwrap();
        let inspected = inspect_shacl_document(&document, &mut ctx).unwrap();
        assert_eq!(member(&inspected, "valid"), Some(&Value::Bool(true)));
        assert_eq!(member(&inspected, "complete"), Some(&Value::Bool(false)));
        let quad_values = get_shacl_quads(&runtime, &document, &mut ctx).unwrap();
        assert_eq!(values(Some(&quad_values)).len(), 2);
        assert!(export_shacl_turtle(&runtime, &document, &mut ctx).is_ok());
        let replacement = copy_json(&values(Some(&quad_values))[1], &mut ctx).unwrap();
        let edited =
            propose_shacl_quad_edit(&runtime, &document, 1, &replacement, &mut ctx).unwrap();
        assert_eq!(
            member(&edited, "document").and_then(|d| member(d, "futureMetadata")),
            Some(&Value::string_utf8("retained"))
        );
    }

    #[test]
    fn engine_applies_exact_large_integer_minimum_constraint() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let shapes_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from(
                r#"
<https://ex.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ;
  <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/item> ;
  <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/count> ;
  <http://www.w3.org/ns/shacl#minInclusive> "9007199254740993"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#,
            )
            .units(),
            &u("large-integer-shapes"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let shapes = domain_document(&shapes_rdf, "umf.shacl", "shaclVersion", "1.0", &mut ctx);
        let data_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/item> <https://ex.test/count> \"9007199254740993\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n").units(),
            &u("large-integer-data"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &data_rdf,
            &u("large-integer-report"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(member(&report, "engineConforms"), Some(&Value::Bool(true)));
        let below_rdf = import_rdf_turtle(
            &runtime,
            Utf16::from("<https://ex.test/item> <https://ex.test/count> \"9007199254740992\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n").units(),
            &u("large-integer-data-below"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let violation = futures::executor::block_on(propose_shacl_engine_validation(
            &runtime,
            &shapes,
            &below_rdf,
            &u("large-integer-report-below"),
            &u("disjoint-inputs"),
            &mut ctx,
        ))
        .unwrap();
        assert_eq!(
            member(&violation, "engineConforms"),
            Some(&Value::Bool(false))
        );
    }

    #[test]
    fn owl_getter_refuses_an_unsupported_payload_version() {
        let mut ctx = Context::ordinary();
        let runtime = RdfRuntime::new(&mut ctx).unwrap();
        let mut document = import_owl_turtle(
            &runtime,
            Utf16::from("<https://ex.test/s> <https://ex.test/p> <https://ex.test/o> .\n").units(),
            &u("unsupported-owl"),
            &u("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let payload = member_mut_path(
            &mut document,
            &["modules", "0", "elements", "0", "extensions", "umf.owl"],
        );
        if let Some(Value::Object(fields)) = payload {
            if let Some((_, version)) = fields.iter_mut().find(|(key, _)| key == &u("owlVersion")) {
                *version = Value::string_utf8("unsupported");
            }
        }
        assert!(get_owl_quads(&runtime, &document, &mut ctx).is_err());
    }
}
