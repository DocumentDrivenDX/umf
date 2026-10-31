// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared package/runtime and lossless model operations for RDF adapters.
//! RDF 1.1 syntax parsing uses the pinned UMF-enabled `oxttl` and `oxrdf`
//! parser boundary; this module also provides generalized dataset preservation.

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use oxrdf::{BlankNode, GraphName, Literal, NamedNode, NamedOrBlankNode, Quad, Term};
use oxttl::{NQuadsParser, TriGParser, TurtleParser};
use std::collections::{HashMap, HashSet};

const RDF_EXT: &str = "umf.rdf";
const GR_EXT: &str = "umf.generalized-rdf";
const RDF_TOKEN: u64 = 0x5244_4600_0000_0001;
const GR_TOKEN: u64 = 0x5244_4600_0000_0002;
const CORE_VERSION: &str = "0.10.0";
const EXT_VERSION: &str = "0.1.0";
const RDF_PROFILE: &str = "rdf11-nquads";
const GR_PROFILE: &str = "jsonld-generalized-dataset";

#[derive(Clone, Debug)]
pub struct RdfRuntime {
    engine: Engine,
    rdf_registry: Registry,
    generalized_registry: Registry,
    rdf_schema: CompiledSchema,
    generalized_schema: CompiledSchema,
}

impl RdfRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units: Vec<u16> = source.encode_utf16().collect();
            ctx.charge_text(units.len(), Utf16::default())?;
            serialization::read_json_value(&units, Format::Json, ctx)
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
        let resources = engine.schema_resources_with_context(ctx)?;
        let rdf_manifest = read(
            include_str!("../../../spec/extensions/rdf/package.json"),
            ctx,
        )?;
        let gr_manifest = read(
            include_str!("../../../spec/extensions/generalized-rdf/package.json"),
            ctx,
        )?;
        let rdf_schema_value = read(
            include_str!("../../../spec/extensions/rdf/schema.json"),
            ctx,
        )?;
        let gr_schema_value = read(
            include_str!("../../../spec/extensions/generalized-rdf/dataset-schema.json"),
            ctx,
        )?;
        let rdf_schema =
            CompiledSchema::compile_consumer(&rdf_schema_value, &resources, false, ctx)?;
        let generalized_schema =
            CompiledSchema::compile_consumer(&gr_schema_value, &resources, false, ctx)?;
        let mut rdf_registry = Registry::new();
        rdf_registry.register(
            &rdf_manifest,
            Some(RDF_TOKEN),
            engine.package_schema(),
            &resources,
            ctx,
        )?;
        let mut generalized_registry = Registry::new();
        generalized_registry.register(
            &gr_manifest,
            Some(GR_TOKEN),
            engine.package_schema(),
            &resources,
            ctx,
        )?;
        Ok(Self {
            engine,
            rdf_registry,
            generalized_registry,
            rdf_schema,
            generalized_schema,
        })
    }
    pub fn rdf_registry(&self) -> &Registry {
        &self.rdf_registry
    }
    pub fn generalized_rdf_registry(&self) -> &Registry {
        &self.generalized_registry
    }
}

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(v: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m.iter_mut().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn array(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(a)) = v {
        Some(a)
    } else {
        None
    }
}
fn array_mut(v: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(items.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn diag(code: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: key(code),
        path: Utf16::default(),
        python_source_path: false,
        message: key(message),
        severity,
        python_text_origin: None,
    }
}
fn native_value(n: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match n {
        NativeJsonNode::Null => Value::Null,
        NativeJsonNode::Boolean(b) => Value::Bool(*b),
        NativeJsonNode::String(s) => {
            ctx.charge_work(s.len(), Utf16::default())?;
            Value::String(s.clone())
        }
        NativeJsonNode::Number(s) => {
            ctx.charge_work(s.len(), Utf16::default())?;
            Value::Number(s.parse().unwrap_or(f64::INFINITY))
        }
        NativeJsonNode::Array(a) => Value::Array(
            a.iter()
                .map(|v| native_value(v, ctx))
                .collect::<Result<_, _>>()?,
        ),
        NativeJsonNode::Object(m) => Value::Object(
            m.iter()
                .map(|(k, v)| Ok((k.clone(), native_value(v, ctx)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

struct Callbacks<'a>(&'a RdfRuntime);
impl Capabilities for Callbacks<'_> {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        _semantic: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        let mut ctx = Context::ordinary();
        self.inspect(token, payload, &mut ctx)
            .map_err(|e| e.message)
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        _semantic: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        self.inspect(token, payload, ctx)
            .map_err(CapabilityError::Engine)
    }
}
impl Callbacks<'_> {
    fn inspect(
        &self,
        token: u64,
        p: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, EngineError> {
        let (profile,schema,context)=match token {
            RDF_TOKEN=>(RDF_PROFILE,&self.0.rdf_schema,"RDF 1.1 N-Quads/Turtle/TriG only. Turtle/TriG expands prefixes/base and allocates deterministic local anonymous labels. Blank labels have document-local scope; dataset meaning ignores duplicate occurrences and order. No entailment, datatype value normalization, isomorphism/canonicalization or RDF 1.2 support is asserted. Original bytes remain archived; edited export regenerates syntax."),
            GR_TOKEN=>(GR_PROFILE,&self.0.generalized_schema,"JSON-LD generalized dataset subset; blank identities are local to blankNodeScope. This is not RDF 1.1 N-Quads or an entailment claim."),
            _=>return Err(error("RDF_RUNTIME","Unknown package capability token")),
        };
        let mut ds = vec![diag(
            if token == RDF_TOKEN {
                "RDF_CONTEXT"
            } else {
                "GENERALIZED_RDF_SCOPE"
            },
            context,
            Severity::Warning,
        )];
        let profile_matches = if token == RDF_TOKEN {
            text(get(p, "profile")).is_some_and(|p| {
                ["rdf11-nquads", "rdf11-turtle", "rdf11-trig"]
                    .iter()
                    .any(|candidate| p == &key(candidate))
            })
        } else {
            text(get(p, "profile")) == Some(&key(profile))
        };
        if !profile_matches {
            ds.push(diag(
                if token == RDF_TOKEN {
                    "RDF_PROFILE"
                } else {
                    "GENERALIZED_RDF_UNSUPPORTED"
                },
                "Unexpected native dataset profile",
                Severity::Error,
            ));
            return Ok(ds);
        }
        let known: &[&str] = if token == RDF_TOKEN {
            &[
                "profile",
                "blankNodeScope",
                "quads",
                "originalSource",
                "namedGraphs",
                "baseIRI",
            ]
        } else {
            &["profile", "blankNodeScope", "root", "originalSource"]
        };
        if let Value::Object(fields) = p {
            for (k, _) in fields {
                ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
                if !known.iter().any(|n| k == &key(n)) {
                    ds.push(diag(
                        if token == RDF_TOKEN {
                            "RDF_REPRESENTATION"
                        } else {
                            "GENERALIZED_RDF_ENCODING"
                        },
                        "Unknown encoding fields are retained",
                        Severity::Warning,
                    ));
                    break;
                }
            }
        }
        if token == RDF_TOKEN {
            let view = copy_json(p, ctx)?;
            for e in schema.validate(&view, ctx)? {
                ds.push(Diagnostic {
                    code: key("RDF_TERMS"),
                    path: e.instance_path,
                    python_source_path: false,
                    message: e.message,
                    severity: Severity::Error,
                    python_text_origin: None,
                });
            }
            inspect_rdf_extras(p, &mut ds, ctx)?;
            let profile = text(get(p, "profile"));
            let syntax = match profile {
                Some(v) if v == &key("rdf11-turtle") => Syntax::Turtle,
                Some(v) if v == &key("rdf11-trig") => Syntax::TriG,
                _ => Syntax::NQuads,
            };
            let mut declared = Vec::new();
            let base = if syntax == Syntax::NQuads {
                None
            } else {
                text(get(p, "baseIRI"))
            };
            let source = text(get(p, "originalSource"));
            let checked = source
                .ok_or_else(|| error("RDF_TERMS", "Original source missing"))
                .and_then(|source| {
                    parse_rdf_source(source.units(), syntax, base, &mut declared, ctx)
                        .map(|(quads, _)| quads)
                });
            match checked {
                Ok(_source_quads) => {
                    let bad_base = match base {
                        Some(b) => !valid_iri(b, ctx)?,
                        None => syntax != Syntax::NQuads,
                    };
                    if syntax != Syntax::NQuads && bad_base {
                        ds.push(diag(
                            "RDF_TERMS",
                            "Error: Explicit absolute base IRI required",
                            Severity::Error,
                        ));
                    }
                    if syntax == Syntax::Turtle && !graphs(p, ctx)?.is_empty() {
                        ds.push(diag(
                            "RDF_TERMS",
                            "Error: Turtle cannot represent named graphs",
                            Severity::Error,
                        ));
                    }
                    let current = get(p, "quads").cloned().unwrap_or(Value::Null);
                    let roundtrip = quads_from_value(&current)
                        .and_then(|qs| serialize_nquads(&qs, ctx))
                        .and_then(|rendered| {
                            parse_rdf_source(
                                &rendered.encode_utf16().collect::<Vec<_>>(),
                                Syntax::NQuads,
                                None,
                                &mut Vec::new(),
                                ctx,
                            )
                            .map(|(parsed, _)| parsed)
                        });
                    match roundtrip {
                        Err(e) if e.is_control_failure() => return Err(e),
                        Ok(parsed)
                            if equivalent_quads(
                                &parsed,
                                array(Some(&current)).unwrap_or(&[]),
                                ctx,
                            )? => {}
                        _ => ds.push(diag(
                            "RDF_TERMS",
                            "Error: Terms change when encoded as N-Quads",
                            Severity::Error,
                        )),
                    }
                    for graph in array(get(p, "namedGraphs")).unwrap_or(&[]) {
                        let graph_check = (|| -> Result<bool, EngineError> {
                            let g = graph_from_value(graph)?;
                            let probe = Quad::new(
                                NamedNode::new_unchecked("urn:umf:graph-probe"),
                                NamedNode::new_unchecked("urn:umf:graph-probe"),
                                NamedNode::new_unchecked("urn:umf:graph-probe"),
                                g,
                            );
                            let rendered = serialize_nquads(&[probe.clone()], ctx)?;
                            let parsed = parse_rdf_source(
                                &rendered.encode_utf16().collect::<Vec<_>>(),
                                Syntax::NQuads,
                                None,
                                &mut Vec::new(),
                                ctx,
                            )?
                            .0;
                            Ok(parsed.len() == 1 && get(&parsed[0], "graph") == Some(graph))
                        })();
                        match graph_check {
                            Err(e) if e.is_control_failure() => return Err(e),
                            Ok(true) => {}
                            _ => ds.push(diag(
                                "RDF_TERMS",
                                "Error: Graph name changes when encoded",
                                Severity::Error,
                            )),
                        }
                    }
                }
                Err(e) if e.is_control_failure() => return Err(e),
                Err(e) => ds.push(Diagnostic {
                    code: key("RDF_TERMS"),
                    path: Utf16::default(),
                    python_source_path: false,
                    message: error_detail(&e, "Error: "),
                    severity: Severity::Error,
                    python_text_origin: None,
                }),
            }
        } else {
            let root = get(p, "root")
                .ok_or_else(|| error("GENERALIZED_RDF_PAYLOAD", "Native root is missing"))?;
            if let Some(original) = text(get(p, "originalSource")) {
                if let Err(source_error) = NativeJsonTree::parse_json(original.units(), ctx) {
                    if source_error.is_control_failure() {
                        return Err(source_error);
                    }
                    ds.push(Diagnostic {
                        code: key("GENERALIZED_RDF_SOURCE"),
                        path: Utf16::default(),
                        python_source_path: false,
                        message: source_error.message,
                        severity: Severity::Error,
                        python_text_origin: None,
                    });
                }
            }
            let tree = NativeJsonTree::from_tagged_value(root, ctx)?;
            if tree.has_representation_extras() {
                let paths = tree.representation_extra_paths(&key("/root"), ctx)?;
                let mut parents = Vec::<Utf16>::new();
                for path in paths {
                    let parent = path
                        .units()
                        .iter()
                        .rposition(|u| *u == b'/' as u16)
                        .map(|i| Utf16::new(path.units()[..i].to_vec()))
                        .unwrap_or_default();
                    if !parents.contains(&parent) {
                        parents.push(parent);
                    }
                }
                for _path in parents {
                    ds.push(Diagnostic {
                        code: key("GENERALIZED_RDF_ENCODING"),
                        path: Utf16::default(),
                        python_source_path: false,
                        message: key("Unknown NativeJson encoding field retained"),
                        severity: Severity::Warning,
                        python_text_origin: None,
                    });
                }
            }
            let view = native_value(tree.root(), ctx)?;
            if !schema
                .validate_native_json_codegen_errors(&view, ctx)?
                .is_empty()
            {
                ds.push(diag("GENERALIZED_RDF_UNSUPPORTED","Native dataset structure is outside the declared subset; exact source retained",Severity::Warning));
                return Ok(ds);
            }
            inspect_generalized(&view, &mut ds, ctx)?;
        }
        Ok(ds)
    }
}

fn inspect_rdf_extras(
    p: &Value,
    ds: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if text(get(p, "profile")) == Some(&key(RDF_PROFILE)) && get(p, "baseIRI").is_some() {
        ds.push(diag(
            "RDF_REPRESENTATION",
            "Unknown encoding fields are retained and block native export",
            Severity::Warning,
        ));
    }
    for (i, q) in array(get(p, "quads")).unwrap_or(&[]).iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let allowed = ["subject", "predicate", "object", "graph"];
        if let Value::Object(m) = q {
            ctx.charge_work(m.len(), Utf16::default())?;
            if m.iter().any(|(k, _)| !allowed.iter().any(|x| k == &key(x))) {
                ds.push(Diagnostic {
                    path: key(&format!("/quads/{i}")),
                    ..diag(
                        "RDF_REPRESENTATION",
                        "Unknown encoding fields are retained and block native export",
                        Severity::Warning,
                    )
                });
            }
        }
        for role in allowed {
            if let Some(t) = get(q, role) {
                ctx.charge_work(1, Utf16::default())?;
                let kind = text(get(t, "kind"));
                let terms: &[&str] = if kind == Some(&key("default")) {
                    &["kind"]
                } else if kind == Some(&key("literal")) {
                    &["kind", "value", "datatype", "language"]
                } else {
                    &["kind", "value"]
                };
                if let Value::Object(m) = t {
                    ctx.charge_work(m.len(), Utf16::default())?;
                    if m.iter().any(|(k, _)| !terms.iter().any(|x| k == &key(x))) {
                        ds.push(Diagnostic {
                            path: key(&format!("/quads/{i}/{role}")),
                            ..diag(
                                "RDF_REPRESENTATION",
                                "Unknown encoding fields are retained and block native export",
                                Severity::Warning,
                            )
                        });
                    }
                }
            }
        }
    }
    Ok(())
}
fn inspect_generalized(
    root: &Value,
    ds: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(quads) = array(Some(root)) else {
        return Ok(());
    };
    for q in quads {
        ctx.charge_work(1, Utf16::default())?;
        let keys = ["subject", "predicate", "object", "graph"];
        if let Value::Object(m) = q {
            ctx.charge_work(m.len(), Utf16::default())?;
            if m.iter().any(|(k, _)| !keys.iter().any(|x| k == &key(x))) {
                ds.push(diag(
                    "GENERALIZED_RDF_UNSUPPORTED",
                    "Unknown native fields retained; interpretation and edits blocked",
                    Severity::Warning,
                ));
            }
        }
        for role in keys {
            if let Some(t) = get(q, role) {
                ctx.charge_work(role.len().saturating_add(1), Utf16::default())?;
                if let Value::Object(m) = t {
                    ctx.charge_work(m.len(), Utf16::default())?;
                    let term_type = text(get(t, "termType"));
                    let allowed: &[&str] = if term_type == Some(&key("Literal")) {
                        &["termType", "value", "datatype", "language"]
                    } else {
                        &["termType", "value"]
                    };
                    if m.iter().any(|(k, _)| !allowed.iter().any(|x| k == &key(x))) {
                        ds.push(diag(
                            "GENERALIZED_RDF_UNSUPPORTED",
                            "Unknown native fields retained; interpretation and edits blocked",
                            Severity::Warning,
                        ));
                    }
                }
                let iri = if text(get(t, "termType")) == Some(&key("NamedNode")) {
                    text(get(t, "value"))
                } else if text(get(t, "termType")) == Some(&key("Literal")) {
                    text(get(get(t, "datatype").unwrap_or(&Value::Null), "value"))
                } else {
                    None
                };
                if let Some(v) = iri {
                    if !valid_iri(v, ctx)? {
                        ds.push(diag(
                            "GENERALIZED_RDF_UNSUPPORTED",
                            "Malformed IRI retained",
                            Severity::Warning,
                        ));
                    }
                }
                if text(get(t, "termType")) == Some(&key("Literal")) {
                    let datatype = text(get(get(t, "datatype").unwrap_or(&Value::Null), "value"));
                    if let Value::Object(fields) = get(t, "datatype").unwrap_or(&Value::Null) {
                        ctx.charge_work(fields.len(), Utf16::default())?;
                        if fields
                            .iter()
                            .any(|(k, _)| !["termType", "value"].iter().any(|x| k == &key(x)))
                        {
                            ds.push(diag(
                                "GENERALIZED_RDF_UNSUPPORTED",
                                "Unknown native fields retained; interpretation and edits blocked",
                                Severity::Warning,
                            ));
                        }
                    }
                    let lang = text(get(t, "language"));
                    let lang_string = Some(&key(
                        "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
                    ));
                    let bad_datatype = match datatype {
                        Some(v) => !valid_iri(v, ctx)?,
                        None => true,
                    };
                    let bad_language = match lang {
                        Some(v) if !v.is_empty() => !valid_language(v, ctx)?,
                        _ => false,
                    };
                    if bad_datatype
                        || bad_language
                        || lang.is_some_and(|v| !v.is_empty() && datatype != lang_string)
                        || lang.is_none_or(|v| v.is_empty()) && datatype == lang_string
                    {
                        ds.push(diag(
                            "GENERALIZED_RDF_UNSUPPORTED",
                            "Malformed literal datatype/language retained",
                            Severity::Warning,
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}
fn test_regex(pattern: &str, input: &str) -> bool {
    regress::Regex::from_unicode(pattern.chars().map(|c| c as u32), "u")
        .ok()
        .and_then(|regex| regex.find(input))
        .is_some_and(|m| m.start() == 0 && m.end() == input.len())
}
const IRI_ATOM: &str = r"[A-Za-z0-9._~\u{a0}-\u{d7ff}\u{f900}-\u{fdcf}\u{fdf0}-\u{ffef}\u{10000}-\u{1fffd}\u{20000}-\u{2fffd}\u{30000}-\u{3fffd}\u{40000}-\u{4fffd}\u{50000}-\u{5fffd}\u{60000}-\u{6fffd}\u{70000}-\u{7fffd}\u{80000}-\u{8fffd}\u{90000}-\u{9fffd}\u{a0000}-\u{afffd}\u{b0000}-\u{bfffd}\u{c0000}-\u{cfffd}\u{d0000}-\u{dfffd}\u{e1000}-\u{efffd}\-!$&'()*+,;=]|%[0-9A-Fa-f]{2}";
fn valid_iri(v: &Utf16, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    ctx.charge_work(v.len(), Utf16::default())?;
    let Ok(value) = v.to_utf8() else {
        return Ok(false);
    };
    if value.chars().any(|c| c <= '\u{20}' || c == '\u{7f}') {
        return Ok(false);
    }
    let Some(colon) = value.find(':') else {
        return Ok(false);
    };
    let scheme = &value[..colon];
    if scheme.is_empty()
        || !scheme.as_bytes()[0].is_ascii_alphabetic()
        || !scheme
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'.' | b'-'))
    {
        return Ok(false);
    }
    let mut rest = &value[colon + 1..];
    if let Some(hash) = rest.find('#') {
        if rest[hash + 1..].contains('#')
            || !test_regex(&format!("^(?:{IRI_ATOM}|[:@/?])*$"), &rest[hash + 1..])
        {
            return Ok(false);
        }
        rest = &rest[..hash];
    }
    if let Some(question) = rest.find('?') {
        let query = &rest[question + 1..];
        // The source guard excludes private-use scalar ranges in the query component.
        let pattern = format!("^(?:{IRI_ATOM}|[:@/?\\u{{e000}}-\\u{{f8ff}}\\u{{f0000}}-\\u{{ffffd}}\\u{{100000}}-\\u{{10fffd}})*$");
        if !test_regex(&pattern, query) {
            return Ok(false);
        }
        rest = &rest[..question];
    }
    let (authority, path) = if let Some(after) = rest.strip_prefix("//") {
        let end = after.find('/').unwrap_or(after.len());
        (&after[..end], &after[end..])
    } else {
        ("", rest)
    };
    if rest.starts_with("//") {
        let authority = authority.rsplit_once('@').map_or(authority, |(u, h)| {
            if !test_regex(&format!("^(?:{IRI_ATOM}|:)*$"), u) {
                "!"
            } else {
                h
            }
        });
        if authority == "!" {
            return Ok(false);
        }
        if authority.starts_with('[') {
            let Some(close) = authority.find(']') else {
                return Ok(false);
            };
            let ip = &authority[1..close];
            let tail = &authority[close + 1..];
            if !tail.is_empty() && !test_regex(r"^:[0-9]*$", tail) {
                return Ok(false);
            }
            if !valid_ip_literal(ip) {
                return Ok(false);
            }
        } else {
            let hostport = authority
                .rsplit_once(':')
                .filter(|(_, port)| port.bytes().all(|b| b.is_ascii_digit()))
                .map_or(authority, |(host, _)| host);
            if !test_regex(&format!("^(?:{IRI_ATOM})*$"), hostport) {
                return Ok(false);
            }
        }
    }
    Ok(test_regex(&format!("^(?:{IRI_ATOM}|[:@/])*$"), path))
}
fn valid_ip_literal(value: &str) -> bool {
    if value.contains('.') {
        let Some((prefix, tail)) = value.rsplit_once(':') else {
            return false;
        };
        let octets: Vec<_> = tail.split('.').collect();
        if octets.len() != 4
            || octets.iter().any(|n| {
                n.is_empty()
                    || n.len() > 3
                    || n.len() > 1 && n.starts_with('0')
                    || n.parse::<u16>().map_or(true, |v| v > 255)
            })
        {
            return false;
        }
        return valid_ipv6(&format!("{prefix}:0:0"));
    }
    if value.starts_with('v') || value.starts_with('V') {
        return value.split_once('.').is_some_and(|(v, tail)| {
            v.len() > 1
                && v[1..].bytes().all(|b| b.is_ascii_hexdigit())
                && !tail.is_empty()
                && tail
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._~!$&'()*+,;=:-".contains(&b))
        });
    }
    valid_ipv6(value)
}
fn valid_ipv6(value: &str) -> bool {
    if value.contains(":::")
        || !value.contains("::") && (value.starts_with(':') || value.ends_with(':'))
    {
        return false;
    }
    let halves: Vec<_> = value.split("::").collect();
    if halves.len() > 2 {
        return false;
    }
    let groups: Vec<_> = halves
        .iter()
        .flat_map(|h| h.split(':').filter(|g| !g.is_empty()))
        .collect();
    let valid = groups
        .iter()
        .all(|g| !g.is_empty() && g.len() <= 4 && g.bytes().all(|b| b.is_ascii_hexdigit()));
    valid
        && if halves.len() == 2 {
            groups.len() < 8
        } else {
            groups.len() == 8
        }
}
fn valid_language(v: &Utf16, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    ctx.charge_work(v.len(), Utf16::default())?;
    let Ok(s) = v.to_utf8() else { return Ok(false) };
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return Ok(false);
    }
    let tag = s.to_ascii_lowercase();
    const GRANDFATHERED: &str = "en-gb-oed i-ami i-bnn i-default i-enochian i-hak i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu sgn-be-fr sgn-be-nl sgn-ch-de art-lojban cel-gaulish no-bok no-nyn zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang";
    if GRANDFATHERED.split(' ').any(|known| known == tag) {
        return Ok(true);
    }
    let parts: Vec<_> = tag.split('-').collect();
    let alpha = |p: &str, min: usize, max: usize| {
        p.len() >= min && p.len() <= max && p.bytes().all(|b| b.is_ascii_lowercase())
    };
    let alnum = |p: &str, min: usize, max: usize| {
        p.len() >= min
            && p.len() <= max
            && p.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    };
    if parts[0] == "x" {
        return Ok(parts.len() > 1 && parts[1..].iter().all(|p| alnum(p, 1, 8)));
    }
    let mut i = 0;
    let lang = parts[i];
    i += 1;
    let mut valid = if alpha(lang, 2, 3) {
        let mut extlangs = 0;
        while i < parts.len() && extlangs < 3 && alpha(parts[i], 3, 3) {
            i += 1;
            extlangs += 1;
        }
        true
    } else {
        alpha(lang, 4, 4) || alpha(lang, 5, 8)
    };
    if !valid {
        return Ok(false);
    }
    if i < parts.len() && alpha(parts[i], 4, 4) {
        i += 1;
    }
    if i < parts.len()
        && (alpha(parts[i], 2, 2)
            || parts[i].len() == 3 && parts[i].bytes().all(|b| b.is_ascii_digit()))
    {
        i += 1;
    }
    let mut variants = Vec::<&str>::new();
    while i < parts.len()
        && (alnum(parts[i], 5, 8)
            || parts[i].len() == 4
                && parts[i].as_bytes()[0].is_ascii_digit()
                && alnum(parts[i], 4, 4))
    {
        if variants.contains(&parts[i]) {
            return Ok(false);
        }
        variants.push(parts[i]);
        i += 1;
    }
    let mut singletons = Vec::<&str>::new();
    while i < parts.len() && parts[i].len() == 1 && parts[i] != "x" {
        if !alnum(parts[i], 1, 1) || singletons.contains(&parts[i]) {
            return Ok(false);
        }
        singletons.push(parts[i]);
        i += 1;
        let start = i;
        while i < parts.len() && alnum(parts[i], 2, 8) {
            i += 1;
        }
        if i == start {
            valid = false;
            break;
        }
    }
    if i < parts.len() && parts[i] == "x" {
        i += 1;
        let start = i;
        while i < parts.len() && alnum(parts[i], 1, 8) {
            i += 1;
        }
        if i == start {
            valid = false;
        }
    }
    Ok(valid && i == parts.len())
}

fn validate(
    rt: &RdfRuntime,
    doc: &Value,
    gr: bool,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let reg = if gr {
        &rt.generalized_registry
    } else {
        &rt.rdf_registry
    };
    rt.engine
        .validate_document(doc, reg, &mut Callbacks(rt), ctx)
}
pub fn inspect_rdf_document(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate(rt, doc, false, ctx)
}
pub fn inspect_generalized_rdf_document(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate(rt, doc, true, ctx)
}

fn make_document(ext: &str, id: &Utf16, payload: Value) -> Value {
    object(vec![
        ("umf", Value::string_utf8(CORE_VERSION)),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            object(vec![(
                ext,
                object(vec![("version", Value::string_utf8(EXT_VERSION))]),
            )]),
        ),
        (
            "modules",
            Value::Array(vec![object(vec![
                ("id", Value::string_utf8("dataset")),
                ("namespace", Value::string_utf8("")),
                (
                    "elements",
                    Value::Array(vec![object(vec![
                        ("id", Value::string_utf8("dataset")),
                        ("extensions", object(vec![(ext, payload)])),
                    ])]),
                ),
            ])]),
        ),
    ])
}
fn payload<'a>(
    rt: &RdfRuntime,
    doc: &'a Value,
    ext: &str,
    gr: bool,
    ctx: &mut Context<'_>,
) -> Result<&'a Value, EngineError> {
    let v = validate(rt, doc, gr, ctx)?;
    if !v.valid {
        let diagnostics = Value::Array(v.diagnostics.iter().map(rdf_diagnostic_value).collect());
        return Err(EngineError::new(
            if gr {
                "GENERALIZED_RDF_DOCUMENT"
            } else {
                "RDF_DOCUMENT"
            },
            Utf16::default(),
            serialization::stringify_compact(&diagnostics)?,
        ));
    }
    let module = array(get(doc, "modules"))
        .and_then(|a| {
            a.iter()
                .find(|m| text(get(m, "id")) == Some(&key("dataset")))
        })
        .ok_or_else(|| error("RDF_PAYLOAD", "Expected dataset module"))?;
    let element = array(get(module, "elements"))
        .and_then(|a| {
            a.iter()
                .find(|e| text(get(e, "id")) == Some(&key("dataset")))
        })
        .ok_or_else(|| error("RDF_PAYLOAD", "Expected dataset element"))?;
    let p = get(
        get(element, "extensions").ok_or_else(|| error("RDF_PAYLOAD", "Expected extensions"))?,
        ext,
    )
    .ok_or_else(|| error("RDF_PAYLOAD", "Expected pinned payload"))?;
    let profile_matches = if gr {
        text(get(p, "profile")) == Some(&key(GR_PROFILE))
    } else {
        text(get(p, "profile")).is_some_and(|p| {
            ["rdf11-nquads", "rdf11-turtle", "rdf11-trig"]
                .iter()
                .any(|candidate| p == &key(candidate))
        })
    };
    if !profile_matches {
        return Err(error("RDF_PAYLOAD", "Expected pinned payload"));
    }
    Ok(p)
}
pub fn rdf_diagnostic_value(d: &Diagnostic) -> Value {
    let severity = Value::string_utf8(match d.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    });
    let context_first = [
        "RDF_CONTEXT",
        "RDF_REPRESENTATION",
        "RDF_TERMS",
        "GENERALIZED_RDF_SCOPE",
        "GENERALIZED_RDF_ENCODING",
        "GENERALIZED_RDF_SOURCE",
        "GENERALIZED_RDF_UNSUPPORTED",
    ]
    .iter()
    .any(|code| d.code == key(code));
    let mut fields = vec![
        ("code", Value::String(d.code.clone())),
        ("path", Value::String(d.path.clone())),
    ];
    if context_first {
        fields.extend([
            ("severity", severity),
            ("message", Value::String(d.message.clone())),
        ]);
    } else {
        fields.extend([
            ("message", Value::String(d.message.clone())),
            ("severity", severity),
        ]);
    }
    object(fields)
}
fn set_payload(doc: &mut Value, ext: &str, p: Value) -> Result<(), EngineError> {
    let modules = get_mut(doc, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| error("RDF_EDIT", "Expected modules"))?;
    let module = modules
        .iter_mut()
        .find(|m| text(get(m, "id")) == Some(&key("dataset")))
        .ok_or_else(|| error("RDF_EDIT", "Expected dataset module"))?;
    let elements = get_mut(module, "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| error("RDF_EDIT", "Expected elements"))?;
    let element = elements
        .iter_mut()
        .find(|e| text(get(e, "id")) == Some(&key("dataset")))
        .ok_or_else(|| error("RDF_EDIT", "Expected dataset element"))?;
    let extensions =
        get_mut(element, "extensions").ok_or_else(|| error("RDF_EDIT", "Expected extensions"))?;
    *get_mut(extensions, ext).ok_or_else(|| error("RDF_EDIT", "Expected pinned payload"))? = p;
    Ok(())
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Syntax {
    NQuads,
    Turtle,
    TriG,
}
fn has_rdf_version_directive(source: &str) -> bool {
    let b = source.as_bytes();
    let (mut i, mut comment, mut iri, mut quote, mut escaped) = (0usize, false, false, 0u8, false);
    while i < b.len() {
        let c = b[i];
        if comment {
            if c == b'\n' || c == b'\r' {
                comment = false;
            }
            i += 1;
            continue;
        }
        if iri {
            if escaped {
                escaped = false;
            } else if c == b'\\' {
                escaped = true;
            } else if c == b'>' {
                iri = false;
            }
            i += 1;
            continue;
        }
        if quote != 0 {
            if escaped {
                escaped = false;
            } else if c == b'\\' {
                escaped = true;
            } else if c == quote {
                quote = 0;
            }
            i += 1;
            continue;
        }
        if c == b'#' {
            comment = true;
            i += 1;
            continue;
        }
        if c == b'<' && b.get(i + 1).is_some_and(|n| !n.is_ascii_whitespace()) {
            iri = true;
            i += 1;
            continue;
        }
        if c == b'\'' || c == b'"' {
            quote = c;
            i += 1;
            continue;
        }
        if c == b'@'
            && b.get(i..i + 8)
                .is_some_and(|t| t.eq_ignore_ascii_case(b"@version"))
            && b.get(i + 8).is_some_and(u8::is_ascii_whitespace)
        {
            return true;
        }
        if c.is_ascii_alphabetic() {
            let start = i;
            while i < b.len() && b[i].is_ascii_alphanumeric() {
                i += 1;
            }
            let mut name_start = start;
            while name_start > 0
                && (b[name_start - 1].is_ascii_alphanumeric()
                    || matches!(b[name_start - 1], b'_' | b'-' | b'.' | b':' | b'%'))
            {
                name_start -= 1;
            }
            let is_prefixed_local = b[name_start..start].contains(&b':');
            if b[start..i].eq_ignore_ascii_case(b"VERSION")
                && b.get(i).is_some_and(u8::is_ascii_whitespace)
                && !is_prefixed_local
            {
                return true;
            }
        } else {
            i += 1;
        }
    }
    false
}
fn retain_quad(
    quads: &mut Vec<Quad>,
    quad: Quad,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if quads.len() >= 10_000 {
        return Err(error("RDF_LIMIT", "At most 10,000 quad occurrences"));
    }
    ctx.charge_work(1, Utf16::default())?;
    quads.push(quad);
    Ok(())
}
fn parse_nquads_stream(bytes: &[u8], ctx: &mut Context<'_>) -> Result<Vec<Quad>, EngineError> {
    let mut parser = NQuadsParser::new().low_level();
    let mut quads = Vec::new();
    for chunk in bytes.chunks(8192) {
        ctx.charge_work(1, Utf16::default())?;
        parser.extend_from_slice(chunk);
        while let Some(result) = parser.parse_next() {
            let quad = result.map_err(|e| error("RDF_SYNTAX", &format!("Error: {e}")))?;
            retain_quad(&mut quads, quad, ctx)?;
        }
    }
    parser.end();
    while let Some(result) = parser.parse_next() {
        let quad = result.map_err(|e| error("RDF_SYNTAX", &format!("Error: {e}")))?;
        retain_quad(&mut quads, quad, ctx)?;
    }
    Ok(quads)
}
fn parse_turtle_stream(
    bytes: &[u8],
    base: String,
    ctx: &mut Context<'_>,
) -> Result<Vec<Quad>, EngineError> {
    let parser = TurtleParser::new()
        .with_umf_blank_labels()
        .with_base_iri(base)
        .map_err(|e| error("RDF_BASE", &e.to_string()))?;
    let mut parser = parser.low_level();
    let mut quads = Vec::new();
    for chunk in bytes.chunks(8192) {
        ctx.charge_work(1, Utf16::default())?;
        parser.extend_from_slice(chunk);
        while let Some(result) = parser.parse_next() {
            let triple = result.map_err(|e| error("RDF_SYNTAX", &format!("Error: {e}")))?;
            retain_quad(
                &mut quads,
                Quad::new(
                    triple.subject,
                    triple.predicate,
                    triple.object,
                    GraphName::DefaultGraph,
                ),
                ctx,
            )?;
        }
    }
    parser.end();
    while let Some(result) = parser.parse_next() {
        let triple = result.map_err(|e| error("RDF_SYNTAX", &format!("Error: {e}")))?;
        retain_quad(
            &mut quads,
            Quad::new(
                triple.subject,
                triple.predicate,
                triple.object,
                GraphName::DefaultGraph,
            ),
            ctx,
        )?;
    }
    Ok(quads)
}
fn retain_declared_graphs(
    graphs: &[GraphName],
    seen: &mut usize,
    declared: &mut Vec<Value>,
    source: &str,
    ids: &mut HashMap<String, String>,
    next: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for graph in graphs.iter().skip(*seen) {
        if declared.len() >= 10_000 {
            return Err(error("RDF_LIMIT", "At most 10,000 named graphs"));
        }
        let units = match graph {
            GraphName::NamedNode(n) => n.as_str().encode_utf16().count(),
            GraphName::BlankNode(n) => n.as_str().encode_utf16().count(),
            GraphName::DefaultGraph => 0,
        };
        ctx.charge_work(1usize.saturating_add(units), Utf16::default())?;
        let value = rdf_graph(graph, Syntax::TriG, source, ids, next);
        declared.push(value);
    }
    *seen = graphs.len();
    Ok(())
}
fn parse_trig_stream(
    bytes: &[u8],
    base: String,
    source: &str,
    declared: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<Vec<Quad>, EngineError> {
    let parser = TriGParser::new()
        .with_umf_blank_labels()
        .with_base_iri(base)
        .map_err(|e| error("RDF_BASE", &e.to_string()))?;
    let mut parser = parser.low_level();
    let mut quads = Vec::new();
    let mut ids = HashMap::new();
    let mut next = 0;
    let mut seen_graphs = 0;
    for chunk in bytes.chunks(8192) {
        ctx.charge_work(1, Utf16::default())?;
        parser.extend_from_slice(chunk);
        loop {
            let Some(result) = parser.parse_next() else {
                break;
            };
            let quad = result.map_err(|e| error("RDF_SYNTAX", &format!("Error: {e}")))?;
            retain_quad(&mut quads, quad, ctx)?;
            retain_declared_graphs(
                parser.declared_graphs(),
                &mut seen_graphs,
                declared,
                source,
                &mut ids,
                &mut next,
                ctx,
            )?;
        }
        retain_declared_graphs(
            parser.declared_graphs(),
            &mut seen_graphs,
            declared,
            source,
            &mut ids,
            &mut next,
            ctx,
        )?;
    }
    parser.end();
    loop {
        let Some(result) = parser.parse_next() else {
            break;
        };
        let quad = result.map_err(|e| error("RDF_SYNTAX", &format!("Error: {e}")))?;
        retain_quad(&mut quads, quad, ctx)?;
        retain_declared_graphs(
            parser.declared_graphs(),
            &mut seen_graphs,
            declared,
            source,
            &mut ids,
            &mut next,
            ctx,
        )?;
    }
    retain_declared_graphs(
        parser.declared_graphs(),
        &mut seen_graphs,
        declared,
        source,
        &mut ids,
        &mut next,
        ctx,
    )?;
    Ok(quads)
}
fn blank_id(
    raw: &str,
    syntax: Syntax,
    source: &str,
    ids: &mut HashMap<String, String>,
    next: &mut usize,
) -> String {
    let _ = (syntax, source, ids, next);
    raw.to_owned()
}
fn rdf_node(
    node: &NamedOrBlankNode,
    syntax: Syntax,
    source: &str,
    ids: &mut HashMap<String, String>,
    next: &mut usize,
) -> Value {
    match node {
        NamedOrBlankNode::NamedNode(n) => object(vec![
            ("kind", Value::string_utf8("iri")),
            ("value", Value::string_utf8(n.as_str())),
        ]),
        NamedOrBlankNode::BlankNode(n) => object(vec![
            ("kind", Value::string_utf8("blank")),
            (
                "value",
                Value::string_utf8(&blank_id(n.as_str(), syntax, source, ids, next)),
            ),
        ]),
    }
}
fn rdf_term(
    term: &Term,
    syntax: Syntax,
    source: &str,
    ids: &mut HashMap<String, String>,
    next: &mut usize,
) -> Value {
    match term {
        Term::NamedNode(n) => object(vec![
            ("kind", Value::string_utf8("iri")),
            ("value", Value::string_utf8(n.as_str())),
        ]),
        Term::BlankNode(n) => object(vec![
            ("kind", Value::string_utf8("blank")),
            (
                "value",
                Value::string_utf8(&blank_id(n.as_str(), syntax, source, ids, next)),
            ),
        ]),
        Term::Literal(l) => {
            let mut fields = vec![
                ("kind", Value::string_utf8("literal")),
                ("value", Value::string_utf8(l.value())),
                ("datatype", Value::string_utf8(l.datatype().as_str())),
            ];
            if let Some(language) = l.language().filter(|v| !v.is_empty()) {
                fields.push(("language", Value::string_utf8(language)));
            }
            object(fields)
        }
        #[allow(unreachable_patterns)]
        _ => Value::Null,
    }
}
fn rdf_graph(
    graph: &GraphName,
    syntax: Syntax,
    source: &str,
    ids: &mut HashMap<String, String>,
    next: &mut usize,
) -> Value {
    match graph {
        GraphName::NamedNode(n) => object(vec![
            ("kind", Value::string_utf8("iri")),
            ("value", Value::string_utf8(n.as_str())),
        ]),
        GraphName::BlankNode(n) => object(vec![
            ("kind", Value::string_utf8("blank")),
            (
                "value",
                Value::string_utf8(&blank_id(n.as_str(), syntax, source, ids, next)),
            ),
        ]),
        GraphName::DefaultGraph => object(vec![("kind", Value::string_utf8("default"))]),
    }
}
fn parse_rdf_source(
    source: &[u16],
    syntax: Syntax,
    base: Option<&Utf16>,
    declared: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(Vec<Value>, Utf16), EngineError> {
    if source.len() > 4_000_000 {
        return Err(error(
            "RDF_LIMIT",
            "Expected at most 4,000,000 source characters",
        ));
    }
    ctx.charge_text(source.len(), Utf16::default())?;
    let Ok(text) = String::from_utf16(source) else {
        return Err(error(
            "RDF_UNICODE",
            "Unpaired UTF-16 surrogates cannot represent Unicode scalar values",
        ));
    };
    if syntax != Syntax::NQuads && has_rdf_version_directive(&text) {
        return Err(error(
            "RDF_SYNTAX",
            "UmfError: RDF version directives are outside the RDF 1.1 syntax profile",
        ));
    }
    let parsed = match syntax {
        Syntax::NQuads => parse_nquads_stream(text.as_bytes(), ctx)?,
        Syntax::Turtle => parse_turtle_stream(
            text.as_bytes(),
            base.and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_BASE", "Explicit absolute base IRI required"))?,
            ctx,
        )?,
        Syntax::TriG => parse_trig_stream(
            text.as_bytes(),
            base.and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_BASE", "Explicit absolute base IRI required"))?,
            &text,
            declared,
            ctx,
        )?,
    };
    let mut ids = HashMap::new();
    let mut next = 0;
    let mut quads = Vec::with_capacity(parsed.len());
    for q in &parsed {
        quads.push(object(vec![
            (
                "subject",
                rdf_node(&q.subject, syntax, &text, &mut ids, &mut next),
            ),
            (
                "predicate",
                object(vec![
                    ("kind", Value::string_utf8("iri")),
                    ("value", Value::string_utf8(q.predicate.as_str())),
                ]),
            ),
            (
                "object",
                rdf_term(&q.object, syntax, &text, &mut ids, &mut next),
            ),
            (
                "graph",
                rdf_graph(&q.graph_name, syntax, &text, &mut ids, &mut next),
            ),
        ]));
    }
    Ok((quads, Utf16::new(source.to_vec())))
}
pub fn import_rdf_nquads(
    rt: &RdfRuntime,
    source: &[u16],
    id: &Utf16,
    scope: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (quads, original) = parse_rdf_source(source, Syntax::NQuads, None, &mut Vec::new(), ctx)?;
    let p = object(vec![
        ("profile", Value::string_utf8("rdf11-nquads")),
        ("blankNodeScope", Value::String(scope.unwrap_or(id).clone())),
        ("quads", Value::Array(quads)),
        ("originalSource", Value::String(original)),
    ]);
    let d = make_document(RDF_EXT, id, p);
    if !inspect_rdf_document(rt, &d, ctx)?.valid {
        return Err(error("RDF_DOCUMENT", "Dataset document is invalid"));
    }
    Ok(d)
}
pub fn import_rdf_turtle(
    rt: &RdfRuntime,
    source: &[u16],
    id: &Utf16,
    base: &Utf16,
    scope: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if base.len() > 4096 || !valid_iri(base, ctx)? {
        return Err(error("RDF_BASE", "Explicit absolute base IRI required"));
    }
    let (quads, original) =
        parse_rdf_source(source, Syntax::Turtle, Some(base), &mut Vec::new(), ctx)?;
    let p = object(vec![
        ("profile", Value::string_utf8("rdf11-turtle")),
        ("baseIRI", Value::String(base.clone())),
        ("blankNodeScope", Value::String(scope.unwrap_or(id).clone())),
        ("quads", Value::Array(quads)),
        ("originalSource", Value::String(original)),
    ]);
    let d = make_document(RDF_EXT, id, p);
    if !inspect_rdf_document(rt, &d, ctx)?.valid {
        return Err(error("RDF_DOCUMENT", "Dataset document is invalid"));
    }
    Ok(d)
}
pub fn import_rdf_trig(
    rt: &RdfRuntime,
    source: &[u16],
    id: &Utf16,
    base: &Utf16,
    scope: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if base.len() > 4096 || !valid_iri(base, ctx)? {
        return Err(error("RDF_BASE", "Explicit absolute base IRI required"));
    }
    let mut graphs = Vec::new();
    let (quads, original) = parse_rdf_source(source, Syntax::TriG, Some(base), &mut graphs, ctx)?;
    let p = object(vec![
        ("profile", Value::string_utf8("rdf11-trig")),
        ("baseIRI", Value::String(base.clone())),
        ("blankNodeScope", Value::String(scope.unwrap_or(id).clone())),
        ("namedGraphs", Value::Array(graphs)),
        ("quads", Value::Array(quads)),
        ("originalSource", Value::String(original)),
    ]);
    let d = make_document(RDF_EXT, id, p);
    if !inspect_rdf_document(rt, &d, ctx)?.valid {
        return Err(error("RDF_DOCUMENT", "Dataset document is invalid"));
    }
    Ok(d)
}
fn graph_from_value(v: &Value) -> Result<GraphName, EngineError> {
    match text(get(v, "kind")) {
        Some(k) if k == &key("default") => Ok(GraphName::DefaultGraph),
        Some(k) if k == &key("iri") => Ok(GraphName::NamedNode(
            NamedNode::new(
                text(get(v, "value"))
                    .and_then(|v| v.to_utf8().ok())
                    .ok_or_else(|| error("RDF_TERM", "Expected IRI"))?,
            )
            .map_err(|e| error("RDF_TERM", &e.to_string()))?,
        )),
        Some(k) if k == &key("blank") => Ok(GraphName::BlankNode(
            BlankNode::new(
                text(get(v, "value"))
                    .and_then(|v| v.to_utf8().ok())
                    .ok_or_else(|| error("RDF_TERM", "Expected blank-node label"))?,
            )
            .map_err(|e| error("RDF_TERM", &e.to_string()))?,
        )),
        _ => Err(error("RDF_TERM", "Unsupported graph term")),
    }
}
fn node_from_value(v: &Value) -> Result<NamedOrBlankNode, EngineError> {
    match text(get(v, "kind")) {
        Some(k) if k == &key("iri") => Ok(NamedNode::new(
            text(get(v, "value"))
                .and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_TERM", "Expected IRI"))?,
        )
        .map_err(|e| error("RDF_TERM", &e.to_string()))?
        .into()),
        Some(k) if k == &key("blank") => Ok(BlankNode::new(
            text(get(v, "value"))
                .and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_TERM", "Expected blank-node label"))?,
        )
        .map_err(|e| error("RDF_TERM", &e.to_string()))?
        .into()),
        _ => Err(error("RDF_TERM", "Expected IRI or blank node")),
    }
}
fn term_from_value(v: &Value) -> Result<Term, EngineError> {
    match text(get(v, "kind")) {
        Some(k) if k == &key("iri") => Ok(node_from_value(v)?.into()),
        Some(k) if k == &key("blank") => Ok(node_from_value(v)?.into()),
        Some(k) if k == &key("literal") => {
            let value = text(get(v, "value"))
                .and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_LITERAL", "Expected literal value"))?;
            let datatype = text(get(v, "datatype"))
                .and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_LITERAL", "Expected datatype IRI"))?;
            let dt = NamedNode::new(datatype).map_err(|e| error("RDF_LITERAL", &e.to_string()))?;
            let language = text(get(v, "language")).and_then(|v| v.to_utf8().ok());
            if let Some(language) = language.filter(|l| !l.is_empty()) {
                if dt.as_str() != "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString" {
                    return Err(error(
                        "RDF_LITERAL",
                        "Language literal requires rdf:langString",
                    ));
                }
                Ok(Literal::new_language_tagged_literal(value, language)
                    .map_err(|e| error("RDF_LITERAL", &e.to_string()))?
                    .into())
            } else {
                Ok(Literal::new_typed_literal(value, dt).into())
            }
        }
        _ => Err(error("RDF_TERM", "Unsupported RDF term")),
    }
}
fn quads_from_value(v: &Value) -> Result<Vec<Quad>, EngineError> {
    let Some(items) = array(Some(v)) else {
        return Err(error("RDF_PAYLOAD", "Expected quad array"));
    };
    let mut result = Vec::with_capacity(items.len());
    for q in items {
        result.push(Quad::new(
            node_from_value(
                get(q, "subject").ok_or_else(|| error("RDF_TERM", "Missing subject"))?,
            )?,
            NamedNode::new(
                text(get(
                    get(q, "predicate").ok_or_else(|| error("RDF_TERM", "Missing predicate"))?,
                    "value",
                ))
                .and_then(|v| v.to_utf8().ok())
                .ok_or_else(|| error("RDF_TERM", "Expected predicate IRI"))?,
            )
            .map_err(|e| error("RDF_TERM", &e.to_string()))?,
            term_from_value(get(q, "object").ok_or_else(|| error("RDF_TERM", "Missing object"))?)?,
            graph_from_value(get(q, "graph").ok_or_else(|| error("RDF_TERM", "Missing graph"))?)?,
        ));
    }
    Ok(result)
}
fn append_bounded_output(
    output: &mut String,
    piece: &str,
    units: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let added = piece.encode_utf16().count();
    let next = units.saturating_add(added);
    if next > ctx.limits().max_text_units {
        return Err(error(
            "RDF_LIMIT",
            "Serialized output exceeds the text limit",
        ));
    }
    ctx.charge_text(added, Utf16::default())?;
    ctx.charge_work(added, Utf16::default())?;
    output.push_str(piece);
    *units = next;
    Ok(())
}
fn reserve_bounded_output(
    units: &mut usize,
    added: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let next = units.saturating_add(added);
    if next > ctx.limits().max_text_units {
        return Err(error("RDF_LIMIT", "Serialized output exceeds the text limit"));
    }
    ctx.charge_text(added, Utf16::default())?;
    ctx.charge_work(added, Utf16::default())?;
    *units = next;
    Ok(())
}
fn append_reserved_output(output: &mut String, piece: &str, expected: usize) -> Result<(), EngineError> {
    if piece.encode_utf16().count() != expected {
        return Err(error("RDF_SERIALIZE", "N3 writer length preflight mismatch"));
    }
    output.push_str(piece);
    Ok(())
}
fn n3_escaped_units(value: &str, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let mut units = 0usize;
    for ch in value.chars() {
        ctx.charge_work(ch.len_utf16(), Utf16::default())?;
        units += match ch {
        '\\' | '"' | '\t' | '\n' | '\r' | '\u{0008}' | '\u{000c}' => 2,
        c if (c as u32) <= 0x19 => 6,
        c if (c as u32) >= 0x10000 => 10,
        c => c.len_utf16(),
        };
    }
    Ok(units)
}
fn n3_named_node_units(node: &NamedNode, ctx: &mut Context<'_>) -> Result<usize, EngineError> { Ok(n3_escaped_units(node.as_str(), ctx)? + 2) }
fn n3_subject_units(node: &NamedOrBlankNode, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    match node {
        NamedOrBlankNode::NamedNode(node) => n3_named_node_units(node, ctx),
        NamedOrBlankNode::BlankNode(node) => { let units = node.as_str().encode_utf16().count(); ctx.charge_work(units, Utf16::default())?; Ok(units + 2) },
    }
}
fn n3_graph_name_units(node: &GraphName, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    match node {
        GraphName::NamedNode(node) => n3_named_node_units(node, ctx),
        GraphName::BlankNode(node) => { let units = node.as_str().encode_utf16().count(); ctx.charge_work(units, Utf16::default())?; Ok(units + 2) },
        GraphName::DefaultGraph => Ok(0),
    }
}
fn n3_literal_units(literal: &Literal, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let mut units = n3_escaped_units(literal.value(), ctx)? + 2;
    if let Some(language) = literal.language() {
        let language_units = language.encode_utf16().count();
        ctx.charge_work(language_units, Utf16::default())?;
        units += 1 + language_units;
    } else if literal.datatype().as_str() != "http://www.w3.org/2001/XMLSchema#string" {
        units += 4 + n3_escaped_units(literal.datatype().as_str(), ctx)?;
    }
    Ok(units)
}
fn n3_object_units(term: &Term, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    match term {
        Term::NamedNode(node) => n3_named_node_units(node, ctx),
        Term::BlankNode(node) => { let units = node.as_str().encode_utf16().count(); ctx.charge_work(units, Utf16::default())?; Ok(units + 2) },
        Term::Literal(literal) => n3_literal_units(literal, ctx),
    }
}
fn n3_nquad_line_units(q: &Quad, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    Ok(n3_subject_units(&q.subject, ctx)? + 1 + n3_named_node_units(&q.predicate, ctx)? + 1 + n3_object_units(&q.object, ctx)?
        + if q.graph_name.is_default_graph() { 3 } else { 4 + n3_graph_name_units(&q.graph_name, ctx)? })
}
fn serialize_nquads(quads: &[Quad], ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let mut output = String::new();
    let mut units = 0usize;
    for q in quads {
        let line_units = n3_nquad_line_units(q, ctx)?;
        reserve_bounded_output(&mut units, line_units, ctx)?;
        let mut line = format!("{} {} {}", n3_quad_subject(&q.subject), n3_named_node(&q.predicate), n3_quad_object(&q.object));
        if !q.graph_name.is_default_graph() {
            line.push(' ');
            line.push_str(&n3_graph_name(&q.graph_name));
        }
        line.push_str(" .\n");
        append_reserved_output(&mut output, &line, line_units)?;
    }
    Ok(output)
}

/// Serialize already-admitted RDF quad values using the core N-Quads writer.
/// JSON-LD's indexed RDF formatter is not an N-Quads serializer: in particular,
/// it can render datatype IRIs without the required angle brackets.
pub(crate) fn serialize_nquads_values(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let Some(items) = array(Some(value)) else {
        return Err(error("RDF_PAYLOAD", "Expected quad array"));
    };
    ctx.charge_work(items.len(), Utf16::default())?;
    let quads = quads_from_value(value)?;
    let output = serialize_nquads(&quads, ctx)?;
    ctx.charge_text(output.encode_utf16().count(), Utf16::default())?;
    Ok(Utf16::from(output))
}

// Match N3Writer's line-mode escaping, including lowercase hexadecimal and
// supplementary Unicode scalar escapes. DEL remains literal in N3Writer.
fn n3_escape(value: &str) -> String {
    use std::fmt::Write as _;
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000c}' => out.push_str("\\f"),
            c if (c as u32) <= 0x19 => { let _ = write!(out, "\\u{:04x}", c as u32); }
            c if (c as u32) >= 0x10000 => { let _ = write!(out, "\\U{:08x}", c as u32); }
            c => out.push(c),
        }
    }
    out
}
fn n3_named_node(node: &NamedNode) -> String { format!("<{}>", n3_escape(node.as_str())) }
fn n3_quad_subject(node: &NamedOrBlankNode) -> String {
    match node {
        NamedOrBlankNode::NamedNode(node) => n3_named_node(node),
        NamedOrBlankNode::BlankNode(node) => format!("_:{}", node.as_str()),
    }
}
fn n3_graph_name(node: &GraphName) -> String {
    match node {
        GraphName::NamedNode(node) => n3_named_node(node),
        GraphName::BlankNode(node) => format!("_:{}", node.as_str()),
        GraphName::DefaultGraph => String::new(),
    }
}
fn n3_literal(literal: &Literal) -> String {
    let mut out = format!("\"{}\"", n3_escape(literal.value()));
    if let Some(language) = literal.language() {
        out.push('@');
        out.push_str(language);
    } else if literal.datatype().as_str() != "http://www.w3.org/2001/XMLSchema#string" {
        out.push_str("^^<");
        out.push_str(&n3_escape(literal.datatype().as_str()));
        out.push('>');
    }
    out
}
fn n3_quad_object(term: &Term) -> String {
    match term {
        Term::NamedNode(node) => n3_named_node(node),
        Term::BlankNode(node) => format!("_:{}", node.as_str()),
        Term::Literal(literal) => n3_literal(literal),
    }
}
// RDF's canonical term comparison is independent of JSON member order.
// Unknown encoding fields are retained and diagnosed separately.
fn equivalent_quads(
    left: &[Value],
    right: &[Value],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if left.len() != right.len() {
        return Ok(false);
    }
    for (left, right) in left.iter().zip(right) {
        for role in ["subject", "predicate", "object", "graph"] {
            ctx.charge_work(1, Utf16::default())?;
            let (Some(left), Some(right)) = (get(left, role), get(right, role)) else {
                return Ok(false);
            };
            let (Some(lk), Some(rk)) = (text(get(left, "kind")), text(get(right, "kind"))) else {
                return Ok(false);
            };
            ctx.charge_work(lk.len().saturating_add(rk.len()), Utf16::default())?;
            if lk != rk {
                return Ok(false);
            }
            let names: &[&str] = if lk == &key("literal") {
                &["value", "datatype", "language"]
            } else if lk == &key("default") {
                &[]
            } else {
                &["value"]
            };
            for name in names {
                let empty = Utf16::default();
                let l = text(get(left, name));
                let r = text(get(right, name));
                if *name != "language" && (l.is_none() || r.is_none()) {
                    return Ok(false);
                }
                let l = l.unwrap_or(&empty);
                let r = r.unwrap_or(&empty);
                ctx.charge_work(l.len().saturating_add(r.len()), Utf16::default())?;
                if l != r {
                    return Ok(false);
                }
            }
        }
    }
    Ok(true)
}

fn equivalent_graphs(
    left: &[Value],
    right: &[Value],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if left.len() != right.len() {
        return Ok(false);
    }
    for (left, right) in left.iter().zip(right) {
        ctx.charge_work(1, Utf16::default())?;
        for name in ["kind", "value"] {
            let (Some(l), Some(r)) = (text(get(left, name)), text(get(right, name))) else {
                return Ok(false);
            };
            ctx.charge_work(l.len().saturating_add(r.len()), Utf16::default())?;
            if l != r {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

fn has_unknown_rdf_encoding(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(validate(rt, doc, false, ctx)?
        .diagnostics
        .iter()
        .any(|d| d.code == key("RDF_REPRESENTATION")))
}
pub fn get_rdf_quads(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let p = payload(rt, doc, RDF_EXT, false, ctx)?;
    copy_json(
        get(p, "quads").ok_or_else(|| error("RDF_PAYLOAD", "Quads missing"))?,
        ctx,
    )
}
pub fn export_rdf_nquads(
    rt: &RdfRuntime,
    doc: &Value,
    preserve_source: Option<bool>,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let p = payload(rt, doc, RDF_EXT, false, ctx)?;
    if has_unknown_rdf_encoding(rt, doc, ctx)? {
        return Err(error(
            "RDF_EXPORT",
            "Unknown encoding fields cannot be discarded",
        ));
    }
    let quads = get(p, "quads").ok_or_else(|| error("RDF_PAYLOAD", "Quads missing"))?;
    if let Some(graphs) = array(get(p, "namedGraphs")) {
        for g in graphs {
            if !array(Some(quads))
                .unwrap_or(&[])
                .iter()
                .any(|q| get(q, "graph") == Some(g))
            {
                return Err(error(
                    "RDF_GRAPH_LOSS",
                    "N-Quads cannot represent empty named graphs",
                ));
            }
        }
    }
    let original = text(get(p, "originalSource"))
        .ok_or_else(|| error("RDF_PAYLOAD", "Original source missing"))?;
    if preserve_source != Some(false) && text(get(p, "profile")) == Some(&key("rdf11-nquads")) {
        let parsed =
            parse_rdf_source(original.units(), Syntax::NQuads, None, &mut Vec::new(), ctx)?.0;
        if equivalent_quads(&parsed, array(Some(quads)).unwrap_or(&[]), ctx)? {
            return Ok(original.clone());
        }
    }
    Ok(Utf16::from(serialize_nquads(
        &quads_from_value(quads)?,
        ctx,
    )?))
}
pub fn export_rdf_turtle(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let p = payload(rt, doc, RDF_EXT, false, ctx)?;
    if has_unknown_rdf_encoding(rt, doc, ctx)? {
        return Err(error(
            "RDF_EXPORT",
            "Unknown encoding fields cannot be discarded",
        ));
    }
    if !graphs(p, ctx)?.is_empty() {
        return Err(error(
            "RDF_GRAPH_LOSS",
            "Turtle export cannot silently discard named graphs",
        ));
    }
    let original = text(get(p, "originalSource"))
        .ok_or_else(|| error("RDF_PAYLOAD", "Original source missing"))?;
    if text(get(p, "profile")) == Some(&key("rdf11-turtle")) {
        let parsed = parse_rdf_source(
            original.units(),
            Syntax::Turtle,
            text(get(p, "baseIRI")),
            &mut Vec::new(),
            ctx,
        )?
        .0;
        if equivalent_quads(&parsed, array(get(p, "quads")).unwrap_or(&[]), ctx)? {
            return Ok(original.clone());
        }
    }
    let quads = quads_from_value(get(p, "quads").unwrap())?;
    // The reference writer emits absolute N-Triples (even for the operation
    // named Turtle), preserving the contract's non-abbreviating projection.
    Ok(Utf16::from(serialize_nquads(&quads, ctx)?))
}
fn graph_key(g: &Value) -> (Option<Utf16>, Option<Utf16>) {
    (
        text(get(g, "kind")).cloned(),
        text(get(g, "value")).cloned(),
    )
}
fn graphs(p: &Value, ctx: &mut Context<'_>) -> Result<Vec<Value>, EngineError> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for g in array(get(p, "namedGraphs")).unwrap_or(&[]).iter().chain(
        array(get(p, "quads"))
            .unwrap_or(&[])
            .iter()
            .filter_map(|q| get(q, "graph")),
    ) {
        ctx.charge_work(1, Utf16::default())?;
        if text(get(g, "kind")) != Some(&key("default")) {
            let graph_key = graph_key(g);
            let cost = graph_key
                .0
                .as_ref()
                .map_or(0, Utf16::len)
                .saturating_add(graph_key.1.as_ref().map_or(0, Utf16::len));
            ctx.charge_work(cost, Utf16::default())?;
            if seen.insert(graph_key) {
                result.push(copy_json(g, ctx)?);
            }
        }
    }
    Ok(result)
}
pub fn get_rdf_named_graphs(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let p = payload(rt, doc, RDF_EXT, false, ctx)?;
    Ok(Value::Array(graphs(p, ctx)?))
}
fn trig_text(
    quads: &[Quad],
    named_graphs: &[Value],
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut out = String::new();
    let mut units = 0usize;
    for q in quads {
        let triple_units = n3_subject_units(&q.subject, ctx)? + 1 + n3_named_node_units(&q.predicate, ctx)? + 1 + n3_object_units(&q.object, ctx)? + 2;
        let graph_units = n3_graph_name_units(&q.graph_name, ctx)?;
        let line_units = if q.graph_name.is_default_graph() { triple_units + 1 } else { graph_units + 6 + triple_units };
        reserve_bounded_output(&mut units, line_units, ctx)?;
        let triple = format!("{} {} {} .", n3_quad_subject(&q.subject), n3_named_node(&q.predicate), n3_quad_object(&q.object));
        let line = if q.graph_name.is_default_graph() { format!("{triple}\n") } else { format!("{} {{ {triple} }}\n", n3_graph_name(&q.graph_name)) };
        append_reserved_output(&mut out, &line, line_units)?;
    }
    let mut represented_graphs = HashSet::new();
    for quad in quads {
        let graph = &quad.graph_name;
        let units = match graph {
            GraphName::NamedNode(n) => n.as_str().encode_utf16().count(),
            GraphName::BlankNode(n) => n.as_str().encode_utf16().count(),
            GraphName::DefaultGraph => 0,
        };
        ctx.charge_work(1usize.saturating_add(units), Utf16::default())?;
        represented_graphs.insert(graph);
    }
    for g in named_graphs {
        let graph = graph_from_value(g)?;
        let graph_units = match &graph {
            GraphName::NamedNode(n) => n.as_str().encode_utf16().count(),
            GraphName::BlankNode(n) => n.as_str().encode_utf16().count(),
            GraphName::DefaultGraph => 0,
        };
        ctx.charge_work(1usize.saturating_add(graph_units), Utf16::default())?;
        if !represented_graphs.contains(&graph) {
            let added = n3_graph_name_units(&graph, ctx)? + 4;
            reserve_bounded_output(&mut units, added, ctx)?;
            let graph = n3_graph_name(&graph);
            append_reserved_output(&mut out, &format!("{graph} {{}}\n"), added)?;
        }
    }
    Ok(out)
}
pub fn export_rdf_trig(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let p = payload(rt, doc, RDF_EXT, false, ctx)?;
    if has_unknown_rdf_encoding(rt, doc, ctx)? {
        return Err(error(
            "RDF_EXPORT",
            "Unknown encoding fields cannot be discarded",
        ));
    }
    let original = text(get(p, "originalSource"))
        .ok_or_else(|| error("RDF_PAYLOAD", "Original source missing"))?;
    if text(get(p, "profile")) == Some(&key("rdf11-trig")) {
        let mut parsed_graphs = Vec::new();
        let parsed = parse_rdf_source(
            original.units(),
            Syntax::TriG,
            text(get(p, "baseIRI")),
            &mut parsed_graphs,
            ctx,
        )?
        .0;
        if equivalent_quads(&parsed, array(get(p, "quads")).unwrap_or(&[]), ctx)?
            && equivalent_graphs(
                &parsed_graphs,
                array(get(p, "namedGraphs")).unwrap_or(&[]),
                ctx,
            )?
        {
            return Ok(original.clone());
        }
    }
    let quads =
        quads_from_value(get(p, "quads").ok_or_else(|| error("RDF_PAYLOAD", "Quads missing"))?)?;
    let graphs = graphs(p, ctx)?;
    if graphs.len() > 10_000 {
        return Err(error("RDF_LIMIT", "At most 10,000 named graphs"));
    }
    Ok(Utf16::from(trig_text(&quads, &graphs, ctx)?))
}
pub fn propose_rdf_quad_edit(
    rt: &RdfRuntime,
    doc: &Value,
    index: usize,
    replacement: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let mut next = copy_json(doc, ctx)?;
    let mut p = copy_json(payload(rt, doc, RDF_EXT, false, ctx)?, ctx)?;
    let items = get_mut(&mut p, "quads")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| error("RDF_EDIT", "Expected quad array"))?;
    *items
        .get_mut(index)
        .ok_or_else(|| error("RDF_EDIT", "Expected existing quad index"))? =
        copy_json(replacement, ctx)?;
    set_payload(&mut next, RDF_EXT, p)?;
    let validation = inspect_rdf_document(rt, &next, ctx)?;
    if !validation.valid {
        return Err(error("RDF_EDIT", "Edited dataset is invalid"));
    }
    Ok((next, validation))
}
fn report_diag(code: &str, message: &str, severity: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8("")),
        ("message", Value::string_utf8(message)),
        ("severity", Value::string_utf8(severity)),
    ])
}
fn report_diag_context(code: &str, message: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8("")),
        ("severity", Value::string_utf8("warning")),
        ("message", Value::string_utf8(message)),
    ])
}
fn report_diag_utf16(code: &str, message: Utf16, severity: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8("")),
        ("message", Value::String(message)),
        ("severity", Value::string_utf8(severity)),
    ])
}
fn error_detail(error: &EngineError, prefix: &str) -> Utf16 {
    let mut units = Utf16::from(format!("{prefix}{}: ", error.code)).into_units();
    units.extend_from_slice(error.message.units());
    Utf16::new(units)
}
pub fn propose_rdf_iri_rename(
    rt: &RdfRuntime,
    doc: &Value,
    from: &Utf16,
    to: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (Some(from_s), Some(to_s)) = (from.to_utf8().ok(), to.to_utf8().ok()) else {
        return Err(error(
            "RDF_RENAME_OPTIONS",
            "Expected two nonempty IRI strings of at most 4096 characters",
        ));
    };
    if from_s.is_empty() || to_s.is_empty() || from.len() > 4096 || to.len() > 4096 {
        return Err(error(
            "RDF_RENAME_OPTIONS",
            "Expected two nonempty IRI strings of at most 4096 characters",
        ));
    }
    let source = copy_json(doc, ctx)?;
    let mut report = object(vec![
        ("source", source.clone()),
        ("from", Value::String(from.clone())),
        ("to", Value::String(to.clone())),
        ("status", Value::string_utf8("blocked")),
        ("complete", Value::Bool(false)),
        ("changes", Value::Array(Vec::new())),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    let mut diags = Vec::new();
    let fail = |code: &str, msg: &str, diags: &mut Vec<Value>| {
        diags.push(report_diag(code, msg, "error"));
    };
    if from_s.is_empty() || to_s.is_empty() || from.len() > 4096 || to.len() > 4096 {
        fail(
            "RDF_RENAME_OPTIONS",
            "Expected two nonempty IRI strings of at most 4096 characters",
            &mut diags,
        );
    } else if from == to {
        fail(
            "RDF_RENAME_NOOP",
            "Source and target IRIs must differ",
            &mut diags,
        );
    } else if !valid_iri(from, ctx)? || !valid_iri(to, ctx)? {
        fail(
            "RDF_RENAME_INPUT",
            "IRI spelling is not a well-formed absolute IRI",
            &mut diags,
        );
    } else if let Err(e) = export_rdf_trig(rt, &source, ctx) {
        if e.is_control_failure() {
            return Err(e);
        }
        diags.push(report_diag_utf16(
            "RDF_RENAME_INPUT",
            error_detail(&e, ""),
            "error",
        ));
    } else {
        let mut p = copy_json(payload(rt, &source, RDF_EXT, false, ctx)?, ctx)?;
        let quads =
            array(get(&p, "quads")).ok_or_else(|| error("RDF_PAYLOAD", "Expected quad array"))?;
        let mut target = false;
        let mut selected = Vec::<(String, String, String)>::new();
        for (i, q) in quads.iter().enumerate() {
            for role in ["subject", "predicate", "object", "graph"] {
                if let Some(t) = get(q, role) {
                    if text(get(t, "kind")) == Some(&key("iri")) {
                        let val = text(get(t, "value")).cloned().unwrap_or_default();
                        if &val == to {
                            target = true;
                        }
                        if &val == from {
                            selected.push((
                                format!("/quads/{i}/{role}/value"),
                                role.to_owned(),
                                i.to_string(),
                            ));
                        }
                    } else if text(get(t, "kind")) == Some(&key("literal")) && role == "object" {
                        let val = text(get(t, "datatype")).cloned().unwrap_or_default();
                        if &val == to {
                            target = true;
                        }
                        if &val == from {
                            selected.push((
                                format!("/quads/{i}/object/datatype"),
                                "datatype".to_owned(),
                                i.to_string(),
                            ));
                        }
                    }
                }
            }
        }
        let mut inv = Vec::<usize>::new();
        if let Some(graphs) = get_mut(&mut p, "namedGraphs").and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        }) {
            for (i, g) in graphs.iter().enumerate() {
                if text(get(g, "kind")) == Some(&key("iri")) {
                    let v = text(get(g, "value")).cloned().unwrap_or_default();
                    if &v == to {
                        target = true;
                    }
                    if &v == from {
                        inv.push(i);
                    }
                }
            }
        }
        if target {
            fail("RDF_RENAME_COLLISION","Target IRI already occurs in the dataset; implicit identity coalescing is forbidden",&mut diags);
        } else if selected.is_empty() && inv.is_empty() {
            fail(
                "RDF_RENAME_ABSENT",
                "Source IRI does not occur as an RDF term or datatype",
                &mut diags,
            );
        } else {
            if let Some(quads) = get_mut(&mut p, "quads").and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            }) {
                for (path, role, index) in &selected {
                    let i = index.parse::<usize>().unwrap_or(0);
                    let q = &mut quads[i];
                    let t = get_mut(q, if role == "datatype" { "object" } else { role }).unwrap();
                    *get_mut(
                        t,
                        if role == "datatype" {
                            "datatype"
                        } else {
                            "value"
                        },
                    )
                    .unwrap() = Value::String(to.clone());
                    let before = from.clone();
                    let mut changes = array(get(&report, "changes")).unwrap().to_vec();
                    changes.push(object(vec![
                        ("path", Value::string_utf8(path)),
                        ("before", Value::String(before)),
                        ("after", Value::String(to.clone())),
                    ]));
                    *get_mut(&mut report, "changes").unwrap() = Value::Array(changes);
                }
            }
            if let Some(graphs) = get_mut(&mut p, "namedGraphs").and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            }) {
                for i in inv {
                    *get_mut(&mut graphs[i], "value").unwrap() = Value::String(to.clone());
                    let mut changes = array(get(&report, "changes")).unwrap().to_vec();
                    changes.push(object(vec![
                        (
                            "path",
                            Value::string_utf8(&format!("/namedGraphs/{i}/value")),
                        ),
                        ("before", Value::String(from.clone())),
                        ("after", Value::String(to.clone())),
                    ]));
                    *get_mut(&mut report, "changes").unwrap() = Value::Array(changes);
                }
            }
            let mut candidate = source.clone();
            set_payload(&mut candidate, RDF_EXT, p)?;
            if let Err(e) = export_rdf_trig(rt, &candidate, ctx) {
                if e.is_control_failure() {
                    return Err(e);
                }
                diags.push(report_diag_utf16(
                    "RDF_RENAME_INVALID",
                    error_detail(&e, ""),
                    "error",
                ));
            } else {
                if let Value::Object(fields) = &mut report {
                    fields.push((key("candidate"), candidate));
                }
                *get_mut(&mut report, "status").unwrap() = Value::string_utf8("candidate");
                diags.push(report_diag_context("RDF_RENAME_CONTEXT","Explicit IRI identity change across all term positions and literal datatype IRIs. Literal text, language tags, blank-node scope and duplicate occurrences remain unchanged. Datatype replacement may change value interpretation; vocabulary references, external documents, OWL/SHACL meaning and entailment are not rewritten or proven equivalent. Original source remains archived."));
            }
        }
    }
    *get_mut(&mut report, "diagnostics").unwrap() = Value::Array(diags);
    Ok(report)
}
pub fn propose_rdf_dataset_merge(
    rt: &RdfRuntime,
    documents: &[Value],
    id: &Utf16,
    graph_policy: &str,
    blank_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if documents.is_empty()
        || documents.len() > 100
        || id.is_empty()
        || id.len() > 4096
        || graph_policy != "union-by-name"
        || blank_policy != "disjoint-inputs"
    {
        return Err(error("RDF_MERGE_OPTIONS","Expected 1–100 inputs, a 1–4096 character id, explicit union-by-name and disjoint-inputs policies"));
    }
    let source_value = Value::Array(documents.to_vec());
    let Value::Array(sources) = copy_json(&source_value, ctx)? else {
        return Err(error("RDF_MERGE_INPUT", "Expected source document array"));
    };
    let mut report = object(vec![
        ("sources", Value::Array(Vec::new())),
        ("id", Value::String(id.clone())),
        ("graphPolicy", Value::string_utf8(graph_policy)),
        ("blankNodePolicy", Value::string_utf8(blank_policy)),
        ("status", Value::string_utf8("blocked")),
        ("complete", Value::Bool(false)),
        ("blankNodes", Value::Array(Vec::new())),
        ("quadOrigins", Value::Array(Vec::new())),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    let mut diags = Vec::new();
    let mut all_quads = Vec::<Value>::new();
    let mut all_graphs = Vec::<Value>::new();
    let mut all_graph_keys = HashSet::new();
    let mut blanks = Vec::<Value>::new();
    let mut origins = Vec::<Value>::new();
    let result = (|| -> Result<(), EngineError> {
        for (input, source) in sources.iter().enumerate() {
            export_rdf_trig(rt, source, ctx)?;
            let p = payload(rt, source, RDF_EXT, false, ctx)?;
            let mut labels = HashMap::<Utf16, Utf16>::new();
            for (source_index, q) in array(get(p, "quads")).unwrap_or(&[]).iter().enumerate() {
                let mut q = copy_json(q, ctx)?;
                for role in ["subject", "predicate", "object", "graph"] {
                    if let Some(t) = get_mut(&mut q, role) {
                        if text(get(t, "kind")) == Some(&key("blank")) {
                            let before = text(get(t, "value")).cloned().unwrap_or_default();
                            let after = if let Some(v) = labels.get(&before) {
                                v.clone()
                            } else {
                                let v = key(&format!("m_{input}_{}", labels.len()));
                                labels.insert(before.clone(), v.clone());
                                blanks.push(object(vec![
                                    ("input", Value::Number(input as f64)),
                                    ("before", Value::String(before)),
                                    ("after", Value::String(v.clone())),
                                ]));
                                v
                            };
                            *get_mut(t, "value").unwrap() = Value::String(after);
                        }
                    }
                }
                origins.push(object(vec![
                    ("input", Value::Number(input as f64)),
                    ("sourceIndex", Value::Number(source_index as f64)),
                    ("targetIndex", Value::Number(all_quads.len() as f64)),
                ]));
                all_quads.push(q);
                if all_quads.len() > 10_000 {
                    return Err(error(
                        "RDF_LIMIT",
                        "Merged dataset exceeds 10,000 quad occurrences",
                    ));
                }
            }
            for graph in graphs(p, ctx)? {
                let mut g = graph;
                if text(get(&g, "kind")) == Some(&key("blank")) {
                    let before = text(get(&g, "value")).cloned().unwrap_or_default();
                    let after = if let Some(v) = labels.get(&before) {
                        v.clone()
                    } else {
                        let v = key(&format!("m_{input}_{}", labels.len()));
                        labels.insert(before.clone(), v.clone());
                        blanks.push(object(vec![
                            ("input", Value::Number(input as f64)),
                            ("before", Value::String(before)),
                            ("after", Value::String(v.clone())),
                        ]));
                        v
                    };
                    *get_mut(&mut g, "value").unwrap() = Value::String(after);
                }
                let graph_key = graph_key(&g);
                ctx.charge_work(
                    1usize
                        .saturating_add(graph_key.0.as_ref().map_or(0, Utf16::len))
                        .saturating_add(graph_key.1.as_ref().map_or(0, Utf16::len)),
                    Utf16::default(),
                )?;
                if all_graph_keys.insert(graph_key) {
                    all_graphs.push(g);
                    if all_graphs.len() > 10_000 {
                        return Err(error(
                            "RDF_LIMIT",
                            "Merged dataset exceeds 10,000 named graphs",
                        ));
                    }
                }
            }
        }
        Ok(())
    })();
    match result {
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => diags.push(report_diag_utf16(
            "RDF_MERGE_INPUT",
            error_detail(&e, ""),
            "error",
        )),
        Ok(()) => {
            let p = object(vec![
                ("profile", Value::string_utf8("rdf11-trig")),
                ("baseIRI", Value::string_utf8("urn:umf:merge:")),
                ("blankNodeScope", Value::String(id.clone())),
                ("namedGraphs", Value::Array(all_graphs.clone())),
                ("quads", Value::Array(all_quads.clone())),
                (
                    "originalSource",
                    Value::String(Utf16::from(trig_text(
                        &quads_from_value(&Value::Array(all_quads.clone()))?,
                        &all_graphs,
                        ctx,
                    )?)),
                ),
            ]);
            let candidate = make_document(RDF_EXT, id, p);
            if let Err(e) = export_rdf_trig(rt, &candidate, ctx) {
                if e.is_control_failure() {
                    return Err(e);
                }
                diags.push(report_diag_utf16(
                    "RDF_MERGE_INPUT",
                    error_detail(&e, ""),
                    "error",
                ));
            } else {
                if let Value::Object(fields) = &mut report {
                    fields.push((key("candidate"), candidate));
                }
                *get_mut(&mut report, "status").unwrap() = Value::string_utf8("candidate");
                *get_mut(&mut report, "blankNodes").unwrap() = Value::Array(blanks);
                *get_mut(&mut report, "quadOrigins").unwrap() = Value::Array(origins);
                diags.push(report_diag_context("RDF_MERGE_CONTEXT","RDF dataset projection only. Default graphs and identical IRI graph names are unioned; every input occurrence has a disjoint blank-node space, even for identical document ids or scope strings. Quad occurrences and empty graphs are retained. Complete source documents, unknown metadata and original archives remain in sources, not in the candidate RDF payload. No shared-blank inference, ontology consistency, entailment or canonicalization is asserted."));
            }
        }
    }
    *get_mut(&mut report, "sources").unwrap() = Value::Array(sources);
    *get_mut(&mut report, "diagnostics").unwrap() = Value::Array(diags);
    Ok(report)
}

pub fn import_generalized_rdf_dataset(
    rt: &RdfRuntime,
    source: &[u16],
    id: &Utf16,
    scope: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if source.len() > 4_000_000 {
        return Err(error(
            "GENERALIZED_RDF_LIMIT",
            "Dataset source exceeds 4,000,000 characters",
        ));
    }
    let tree = NativeJsonTree::parse_json(source, ctx)?;
    let p = object(vec![
        ("profile", Value::string_utf8(GR_PROFILE)),
        ("blankNodeScope", Value::String(scope.unwrap_or(id).clone())),
        ("root", tree.tagged_value_preserving_extras(ctx)?),
        ("originalSource", Value::String(Utf16::new(source.to_vec()))),
    ]);
    let doc = make_document(GR_EXT, id, p);
    if !inspect_generalized_rdf_document(rt, &doc, ctx)?.valid {
        return Err(error(
            "GENERALIZED_RDF_DOCUMENT",
            "Imported generalized dataset is invalid",
        ));
    }
    Ok(doc)
}
pub fn export_generalized_rdf_dataset(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let p = payload(rt, doc, GR_EXT, true, ctx)?;
    let root =
        get(p, "root").ok_or_else(|| error("GENERALIZED_RDF_PAYLOAD", "Native root missing"))?;
    let tree = NativeJsonTree::from_tagged_value(root, ctx)?;
    if tree.has_representation_extras() {
        return Err(error(
            "GENERALIZED_RDF_EXPORT",
            "Unknown encoding fields cannot be discarded",
        ));
    }
    if let Value::Object(fields) = p {
        if fields.iter().any(|(k, _)| {
            !["profile", "blankNodeScope", "root", "originalSource"]
                .iter()
                .any(|x| k == &key(x))
        }) {
            return Err(error(
                "GENERALIZED_RDF_EXPORT",
                "Unknown encoding fields cannot be discarded",
            ));
        }
    }
    let original = text(get(p, "originalSource"))
        .ok_or_else(|| error("GENERALIZED_RDF_PAYLOAD", "Original source missing"))?;
    let old = NativeJsonTree::parse_json(original.units(), ctx)?;
    if tree == old {
        return Ok(original.clone());
    }
    let mut rendered = tree.render_compact(ctx)?.units().to_vec();
    rendered.push(10);
    Ok(Utf16::new(rendered))
}
pub fn get_generalized_rdf_quads(
    rt: &RdfRuntime,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let p = payload(rt, doc, GR_EXT, true, ctx)?;
    let v = validate(rt, doc, true, ctx)?;
    if v.diagnostics.iter().any(|d| {
        d.code == key("GENERALIZED_RDF_ENCODING") || d.code == key("GENERALIZED_RDF_UNSUPPORTED")
    }) {
        return Err(error(
            "GENERALIZED_RDF_INTERPRET",
            "Unknown or unsupported dataset semantics; source retained",
        ));
    }
    native_value(
        NativeJsonTree::from_tagged_value(
            get(p, "root")
                .ok_or_else(|| error("GENERALIZED_RDF_PAYLOAD", "Native root missing"))?,
            ctx,
        )?
        .root(),
        ctx,
    )
}
pub fn propose_generalized_rdf_quad_edit(
    rt: &RdfRuntime,
    doc: &Value,
    index: usize,
    replacement: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let quads = get_generalized_rdf_quads(rt, doc, ctx)?;
    let Value::Array(mut items) = quads else {
        return Err(error("GENERALIZED_RDF_EDIT", "Expected quad array"));
    };
    *items
        .get_mut(index)
        .ok_or_else(|| error("GENERALIZED_RDF_EDIT", "Expected existing quad index"))? =
        copy_json(replacement, ctx)?;
    let source = serialization::stringify_compact_metered(&Value::Array(items), ctx)?;
    let tree = NativeJsonTree::parse_json(source.units(), ctx)?;
    let mut next = copy_json(doc, ctx)?;
    let mut p = copy_json(payload(rt, doc, GR_EXT, true, ctx)?, ctx)?;
    *get_mut(&mut p, "root")
        .ok_or_else(|| error("GENERALIZED_RDF_EDIT", "Native root missing"))? =
        tree.tagged_value_preserving_extras(ctx)?;
    set_payload(&mut next, GR_EXT, p)?;
    let validation = inspect_generalized_rdf_document(rt, &next, ctx)?;
    if !validation.valid {
        return Err(error("GENERALIZED_RDF_EDIT", "Edited dataset is invalid"));
    }
    Ok((next, validation))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn serialized_occurrences(quads: &[Quad], ctx: &mut Context<'_>) -> Vec<String> {
        serialize_nquads(quads, ctx)
            .unwrap()
            .lines()
            .map(str::to_owned)
            .collect()
    }
    fn assert_occurrences(actual: &[Quad], expected: &str, ctx: &mut Context<'_>) {
        let mut actual = serialized_occurrences(actual, ctx);
        let mut expected = expected.lines().map(str::to_owned).collect::<Vec<_>>();
        actual.sort();
        expected.sort();
        assert_eq!(actual, expected);
    }
    #[test]
    fn n3_line_writer_uses_ecmascript_utf16_escape_spelling() {
        assert_eq!(n3_escape("\u{7f}\u{80}\u{19}\u{1a}\u{1f}\u{10000}"), "\u{7f}\u{80}\\u0019\u{1a}\u{1f}\\U00010000");
        assert_eq!(n3_escape("quote\"\\\t\n\r\u{8}\u{c}"), "quote\\\"\\\\\\t\\n\\r\\b\\f");
    }

    #[test]
    fn collection_quads_keep_deterministic_storage_order() {
        let mut ctx = Context::ordinary();
        let source: Vec<u16> = "@prefix ex: <http://a.example/> . ex:s ex:p (1) .".encode_utf16().collect();
        let (values, _) = parse_rdf_source(&source, Syntax::Turtle, Some(&key("http://base.example/")), &mut Vec::new(), &mut ctx).unwrap();
        let quads = quads_from_value(&Value::Array(values)).unwrap();
        let (repeated, _) = parse_rdf_source(&source, Syntax::Turtle, Some(&key("http://base.example/")), &mut Vec::new(), &mut ctx).unwrap();
        assert_eq!(quads_from_value(&Value::Array(repeated)).unwrap(), quads);
        assert_occurrences(&quads, "_:g_0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n_:g_0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .\n<http://a.example/s> <http://a.example/p> _:g_0 .\n", &mut ctx);
    }

    #[test]
    fn nested_collection_quads_keep_creation_labels_and_deterministic_order() {
        let mut ctx = Context::ordinary();
        let source: Vec<u16> = "@prefix ex: <http://a.example/> . ex:s ex:p ((1)) .".encode_utf16().collect();
        let (values, _) = parse_rdf_source(&source, Syntax::Turtle, Some(&key("http://base.example/")), &mut Vec::new(), &mut ctx).unwrap();
        let quads = quads_from_value(&Value::Array(values)).unwrap();
        let (repeated, _) = parse_rdf_source(&source, Syntax::Turtle, Some(&key("http://base.example/")), &mut Vec::new(), &mut ctx).unwrap();
        assert_eq!(quads_from_value(&Value::Array(repeated)).unwrap(), quads);
        assert_occurrences(&quads, "_:g_1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n_:g_0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> _:g_1 .\n_:g_1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .\n_:g_0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .\n<http://a.example/s> <http://a.example/p> _:g_0 .\n", &mut ctx);
    }

    #[test]
    fn version_guard_distinguishes_prefix_name_from_version_directive() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let id = key("version-guard");
        let base = key("urn:base:");
        let valid: Vec<u16> = "@prefix VERSION: <urn:example:> . @prefix ex: <urn:ex:> . VERSION:s VERSION:p VERSION:o . ex:s ex:VERSION ex:my-VERSION ."
            .encode_utf16()
            .collect();
        assert!(import_rdf_turtle(&rt, &valid, &id, &base, None, &mut ctx).is_ok());
        for source in ["@version 1.2\n", "VERSION \"1.2\"\n"] {
            let unsupported: Vec<u16> = source.encode_utf16().collect();
            assert_eq!(
                import_rdf_turtle(&rt, &unsupported, &id, &base, None, &mut ctx)
                    .unwrap_err()
                    .code,
                "RDF_SYNTAX"
            );
        }
    }
    #[test]
    fn regenerated_rdf_output_obeys_cumulative_text_limit() {
        let limits = crate::context::Limits {
            max_text_units: 3,
            ..crate::context::Limits::ordinary()
        };
        let mut ctx =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        let mut output = String::new();
        let mut units = 0;
        append_bounded_output(&mut output, "abc", &mut units, &mut ctx).unwrap();
        assert_eq!(output, "abc");
        assert_eq!(
            append_bounded_output(&mut output, "d", &mut units, &mut ctx)
                .unwrap_err()
                .code,
            "RDF_LIMIT"
        );
    }
    #[test]
    fn generalized_rdf_term_guards_cover_iri_and_language_grammar() {
        let mut ctx = Context::ordinary();
        for value in [
            "urn:example:α",
            "https://例.example/資料",
            "mailto:a@example.org",
            "http://[2001:db8::1]/x",
        ] {
            assert!(valid_iri(&key(value), &mut ctx).unwrap(), "{value}");
        }
        for value in [
            "relative/path",
            "urn:bad space",
            "https://example.org/%GG",
            "http://[:::1]/",
        ] {
            assert!(!valid_iri(&key(value), &mut ctx).unwrap(), "{value}");
        }
        for value in [
            "en",
            "zh-Hant-TW",
            "de-CH-1901",
            "en-a-foo-x-bar",
            "i-klingon",
        ] {
            assert!(valid_language(&key(value), &mut ctx).unwrap(), "{value}");
        }
        for value in ["", "en--US", "en-a", "en-1901-1901", "x"] {
            assert!(!valid_language(&key(value), &mut ctx).unwrap(), "{value}");
        }
    }
    #[test]
    fn rdf_syntax_import_retains_nquads_source_and_normalizes_turtle_blank_nodes() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let id = key("rdf");
        let nq: Vec<u16> = b"<urn:s> <urn:p> \"x\" <urn:g> .\n"
            .iter()
            .map(|b| *b as u16)
            .collect();
        let doc = import_rdf_nquads(&rt, &nq, &id, None, &mut ctx).unwrap();
        assert_eq!(
            export_rdf_nquads(&rt, &doc, None, &mut ctx)
                .unwrap()
                .units(),
            nq.as_slice()
        );
        let ttl: Vec<u16> = b"# retained comment\n@prefix ex: <urn:ex:> .\n_:a ex:p [] .\n"
            .iter()
            .map(|b| *b as u16)
            .collect();
        let base = key("urn:base:");
        let mut doc = import_rdf_turtle(&rt, &ttl, &id, &base, None, &mut ctx).unwrap();
        let q = array(get(
            payload(&rt, &doc, RDF_EXT, false, &mut ctx).unwrap(),
            "quads",
        ))
        .unwrap();
        assert_eq!(
            text(get(get(&q[0], "subject").unwrap(), "value")),
            Some(&key("e_000061"))
        );
        assert_eq!(
            text(get(get(&q[0], "object").unwrap(), "value")),
            Some(&key("g_0"))
        );
        assert_eq!(
            export_rdf_turtle(&rt, &doc, &mut ctx).unwrap().units(),
            ttl.as_slice()
        );
        let modules = array_mut(get_mut(&mut doc, "modules").unwrap()).unwrap();
        let elements = array_mut(get_mut(&mut modules[0], "elements").unwrap()).unwrap();
        let extensions = get_mut(&mut elements[0], "extensions").unwrap();
        let rdf_payload = get_mut(extensions, RDF_EXT).unwrap();
        let quads = array_mut(get_mut(rdf_payload, "quads").unwrap()).unwrap();
        *get_mut(&mut quads[0], "object").unwrap() = object(vec![
            ("kind", Value::string_utf8("iri")),
            ("value", Value::string_utf8("urn:changed")),
        ]);
        let changed: Vec<u16> = b"_:e_000061 <urn:ex:p> <urn:changed> .\n"
            .iter()
            .map(|b| *b as u16)
            .collect();
        assert_eq!(
            export_rdf_turtle(&rt, &doc, &mut ctx).unwrap().units(),
            changed.as_slice()
        );
        let trig: Vec<u16> = b"@prefix ex: <urn:ex:> .\nex:empty {}\n"
            .iter()
            .map(|b| *b as u16)
            .collect();
        let doc = import_rdf_trig(&rt, &trig, &id, &base, None, &mut ctx).unwrap();
        assert_eq!(
            array(get(
                payload(&rt, &doc, RDF_EXT, false, &mut ctx).unwrap(),
                "namedGraphs"
            ))
            .unwrap()
            .len(),
            1
        );
        assert_eq!(
            export_rdf_trig(&rt, &doc, &mut ctx).unwrap().units(),
            trig.as_slice()
        );
    }
    #[test]
    fn rdf_turtle_nested_anonymous_nodes_keep_creation_order_labels() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let id = key("nested");
        let base = key("urn:base:");
        let source: Vec<u16> = b"@prefix ex: <urn:ex:> .\n_:root ex:p [ ex:q [] ] .\n"
            .iter()
            .map(|b| *b as u16)
            .collect();
        let doc = import_rdf_turtle(&rt, &source, &id, &base, None, &mut ctx).unwrap();
        let p = payload(&rt, &doc, RDF_EXT, false, &mut ctx).unwrap();
        let qs = array(get(p, "quads")).unwrap();
        assert_eq!(qs.len(), 2);
        assert_eq!(
            text(get(get(&qs[0], "subject").unwrap(), "value")),
            Some(&key("g_0"))
        );
        assert_eq!(
            text(get(get(&qs[0], "object").unwrap(), "value")),
            Some(&key("g_1"))
        );
        assert_eq!(
            text(get(get(&qs[1], "object").unwrap(), "value")),
            Some(&key("g_0"))
        );
    }
    #[test]
    fn trig_empty_named_graph_preserves_unrelated_prefix_decoded_quad() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let id = key("probe-collision");
        let base = key("urn:base:");
        let source: Vec<u16> =
            b"@prefix m: <urn:umf:internal:empty-graph:> .\nm:0 m:0 m:0 .\nm:empty {}\n"
                .iter()
                .map(|b| *b as u16)
                .collect();
        let doc = import_rdf_trig(&rt, &source, &id, &base, None, &mut ctx).unwrap();
        let p = payload(&rt, &doc, RDF_EXT, false, &mut ctx).unwrap();
        assert_eq!(array(get(p, "quads")).unwrap().len(), 1);
        assert_eq!(array(get(p, "namedGraphs")).unwrap().len(), 1);
        let subject = get(array(get(p, "quads")).unwrap().first().unwrap(), "subject").unwrap();
        assert_eq!(
            text(get(subject, "value")),
            Some(&key("urn:umf:internal:empty-graph:0"))
        );
    }
    #[test]
    fn trig_quad_and_named_graph_limits_are_independent() {
        let mut source = String::with_capacity(400_000);
        for _ in 0..10_000 {
            source.push_str("<urn:s> <urn:p> <urn:o> .\n");
        }
        source.push_str("<urn:empty> {}\n");
        let units: Vec<u16> = source.encode_utf16().collect();
        let mut ctx = Context::catalog();
        let mut declared = Vec::new();
        let (quads, _) = parse_rdf_source(
            &units,
            Syntax::TriG,
            Some(&key("urn:base:")),
            &mut declared,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(quads.len(), 10_000);
        assert_eq!(declared.len(), 1);
    }

    #[test]
    fn rdf_quad_getter_matches_reference_for_unknown_encoding_fields() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let source: Vec<u16> = b"<urn:s> <urn:p> <urn:o> .\n"
            .iter()
            .map(|b| *b as u16)
            .collect();
        let mut doc = import_rdf_nquads(&rt, &source, &key("unknown"), None, &mut ctx).unwrap();
        let modules = array_mut(get_mut(&mut doc, "modules").unwrap()).unwrap();
        let elements = array_mut(get_mut(&mut modules[0], "elements").unwrap()).unwrap();
        let extensions = get_mut(&mut elements[0], "extensions").unwrap();
        let rdf_payload = get_mut(extensions, RDF_EXT).unwrap();
        if let Value::Object(fields) = rdf_payload {
            fields.push((key("futureEncodingField"), Value::Bool(true)));
        }
        let quads = get_rdf_quads(&rt, &doc, &mut ctx).unwrap();
        assert_eq!(array(Some(&quads)).unwrap().len(), 1);
    }
    #[test]
    fn generalized_json_exact_round_trip_and_copy_on_write() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let src:Vec<u16>=r#"[{"subject":{"termType":"BlankNode","value":"b0"},"predicate":{"termType":"BlankNode","value":"b0"},"object":{"termType":"Literal","value":"9007199254740993","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#integer"}},"graph":{"termType":"DefaultGraph","value":""}}]"#.encode_utf16().collect();
        let id = key("g");
        let doc = import_generalized_rdf_dataset(&rt, &src, &id, None, &mut ctx).unwrap();
        assert_eq!(
            export_generalized_rdf_dataset(&rt, &doc, &mut ctx)
                .unwrap()
                .units(),
            src.as_slice()
        );
        let mut quad = array(Some(
            &get_generalized_rdf_quads(&rt, &doc, &mut ctx).unwrap(),
        ))
        .unwrap()[0]
            .clone();
        *get_mut(get_mut(&mut quad, "object").unwrap(), "value").unwrap() =
            Value::string_utf8("changed");
        let (edited, _) = propose_generalized_rdf_quad_edit(&rt, &doc, 0, &quad, &mut ctx).unwrap();
        assert_eq!(
            export_generalized_rdf_dataset(&rt, &doc, &mut ctx)
                .unwrap()
                .units(),
            src.as_slice()
        );
        assert_ne!(
            export_generalized_rdf_dataset(&rt, &edited, &mut ctx)
                .unwrap()
                .units(),
            src.as_slice()
        );
    }
    #[test]
    fn runtime_registers_both_real_extension_manifests() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        assert_eq!(rt.rdf_registry.entries().len(), 1);
        assert_eq!(rt.generalized_registry.entries().len(), 1);
    }

    #[test]
    fn generalized_unknown_native_quad_field_survives_but_blocks_interpretation() {
        let mut ctx = Context::ordinary();
        let rt = RdfRuntime::new(&mut ctx).unwrap();
        let source: Vec<u16> = r#"[{"future":"kept","subject":{"termType":"NamedNode","value":"urn:s"},"predicate":{"termType":"NamedNode","value":"urn:p"},"object":{"termType":"NamedNode","value":"urn:o"},"graph":{"termType":"DefaultGraph","value":""}}]"#
            .encode_utf16()
            .collect();
        let id = key("g");
        let doc = import_generalized_rdf_dataset(&rt, &source, &id, None, &mut ctx).unwrap();
        assert_eq!(
            export_generalized_rdf_dataset(&rt, &doc, &mut ctx)
                .unwrap()
                .units(),
            source.as_slice()
        );
        assert_eq!(
            get_generalized_rdf_quads(&rt, &doc, &mut ctx)
                .unwrap_err()
                .code,
            "GENERALIZED_RDF_INTERPRET"
        );
    }

    #[test]
    fn rdf_merge_admits_all_sources_under_one_aggregate_tree_limit() {
        use crate::context::{Limits, ResourceProfile};

        let source = Value::Array(vec![Value::Null; 500]);
        let documents = vec![source.clone(), source];
        let mut setup = Context::ordinary();
        let rt = RdfRuntime::new(&mut setup).unwrap();
        let limits = Limits {
            max_values: 1_000,
            ..Limits::ordinary()
        };
        let mut limited = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let failure = propose_rdf_dataset_merge(
            &rt,
            &documents,
            &key("aggregate"),
            "union-by-name",
            "disjoint-inputs",
            &mut limited,
        )
        .unwrap_err();
        assert_eq!(failure.code, "LIMIT");
        assert_eq!(failure.message, key("JSON structural value limit exceeded"));
    }

    #[test]
    fn rdf_rename_rejects_bad_options_before_document_copy() {
        use crate::context::{Limits, ResourceProfile};

        let mut setup = Context::ordinary();
        let rt = RdfRuntime::new(&mut setup).unwrap();
        let limits = Limits {
            max_values: 1,
            ..Limits::ordinary()
        };
        let mut limited = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let failure = propose_rdf_iri_rename(
            &rt,
            &Value::Array(vec![Value::Null; 100]),
            &key(""),
            &key("urn:target"),
            &mut limited,
        )
        .unwrap_err();
        assert_eq!(failure.code, "RDF_RENAME_OPTIONS");
    }
}
