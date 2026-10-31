// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in core Key inspection and authoring operations.
//!
//! These operations preserve the complete source and unknown qualifiers. They
//! are consistency receipts, not authentication or a default runtime route.
use std::collections::BTreeSet;

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

const DECLARATION_SCHEMA: &str = include_str!("../../../spec/core/key-operation-v2.schema.json");
const INSPECTION_SCHEMA: &str = include_str!("../../../spec/core/key-operation-v4.schema.json");
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn raw(v: &Value) -> Option<Utf16> {
    if let Value::String(s) = v {
        Some(s.clone())
    } else {
        None
    }
}
fn eq(v: Option<&Value>, s: &str) -> bool {
    v.and_then(raw).is_some_and(|x| x == k(s))
}
fn canonical_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(a, b)| canonical_equal(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter().all(|(key, value)| {
                    y.iter()
                        .find(|(other, _)| other == key)
                        .is_some_and(|(_, other)| canonical_equal(value, other))
                })
        }
        _ => a == b,
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn set(o: &mut Value, name: &str, value: Value) -> Result<(), EngineError> {
    set_utf16(o, k(name), value)
}
fn set_utf16(o: &mut Value, name: Utf16, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = o else {
        return Err(err("CORE_KEY_SHAPE", "Expected object", ""));
    };
    if let Some((_, v)) = fields.iter_mut().find(|(n, _)| n == &name) {
        *v = value
    } else {
        fields.push((name, value))
    };
    Ok(())
}
fn validate_source(
    v: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Vec<crate::error::Diagnostic>, EngineError> {
    let out = e.validate_document(v, r, c, x)?;
    if out.valid {
        Ok(out.diagnostics)
    } else {
        let ds = Value::Array(
            out.diagnostics
                .into_iter()
                .map(|d| {
                    obj(vec![
                        ("code", Value::String(d.code)),
                        ("path", Value::String(d.path)),
                        ("message", Value::String(d.message)),
                        (
                            "severity",
                            t(if d.severity == Severity::Warning {
                                "warning"
                            } else {
                                "error"
                            }),
                        ),
                    ])
                })
                .collect(),
        );
        let msg = crate::serialization::stringify_compact_metered(&ds, x)?
            .to_utf8()
            .unwrap_or_default();
        Err(err("CORE_KEY_SOURCE", &msg, ""))
    }
}
fn diagnostics_message(
    diagnostics: Vec<crate::error::Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let values = Value::Array(
        diagnostics
            .into_iter()
            .map(|d| {
                obj(vec![
                    ("code", Value::String(d.code)),
                    ("path", Value::String(d.path)),
                    ("message", Value::String(d.message)),
                    (
                        "severity",
                        t(if d.severity == Severity::Warning {
                            "warning"
                        } else {
                            "error"
                        }),
                    ),
                ])
            })
            .collect(),
    );
    Ok(
        crate::serialization::stringify_compact_metered(&values, ctx)?
            .to_utf8()
            .unwrap_or_default(),
    )
}
fn validate_result(
    v: &Value,
    schema_text: &str,
    code: &str,
    e: &Engine,
    x: &mut Context<'_>,
) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &schema_text.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        x,
    )?;
    let resources = e.schema_resources_with_context(x)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, x)?;
    if let Some(problem) = compiled.validate(v, x)?.first() {
        return Err(EngineError::new(
            code,
            problem.instance_path.clone(),
            problem.message.clone(),
        ));
    }
    Ok(())
}
fn validate_receipt_shape(
    receipt: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let schema_text = if eq(get(receipt, "version"), "4.0.0") {
        INSPECTION_SCHEMA
    } else {
        DECLARATION_SCHEMA
    };
    let schema = crate::serialization::read_json_value(
        &schema_text.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    if !compiled.validate(receipt, ctx)?.is_empty() {
        return Err(err("CORE_KEY_RECEIPT", "Malformed key operation", ""));
    }
    Ok(())
}
fn unknown_paths(
    diagnostics: &[crate::error::Diagnostic],
    path: &str,
    warnings_only: bool,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let prefix = Utf16::from(format!("{path}/"));
    let mut paths = vec![];
    for d in diagnostics {
        ctx.charge_work(1, k(path))?;
        if d.code == k("UNKNOWN_KEY_QUALIFIER")
            && (!warnings_only || d.severity == Severity::Warning)
            && (d.path == k(path) || d.path.units().starts_with(prefix.units()))
        {
            paths.push(Value::String(d.path.clone()))
        }
    }
    Ok(paths)
}
fn locate(
    source: &Value,
    identity: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<
    (
        Value,
        Value,
        usize,
        usize,
        Vec<crate::error::Diagnostic>,
        String,
    ),
    EngineError,
> {
    let src = copy_json(source, ctx)?;
    let id = copy_json(identity, ctx)?;
    let (Some(module), Some(element)) = (
        get(&id, "module").and_then(raw).filter(|s| !s.is_empty()),
        get(&id, "element").and_then(raw).filter(|s| !s.is_empty()),
    ) else {
        return Err(err(
            "CORE_KEY_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    };
    if let Value::Object(fields) = &id {
        if fields
            .iter()
            .any(|(n, _)| n != &k("module") && n != &k("element"))
        {
            return Err(err(
                "CORE_KEY_IDENTITY",
                "Expected exact module and element identity",
                "",
            ));
        }
    }
    let diagnostics = validate_source(&src, engine, registry, caps, ctx)?;
    let Value::Array(modules) = get(&src, "modules")
        .ok_or_else(|| err("CORE_KEY_MISSING", "Element identity does not resolve", ""))?
    else {
        return Err(err(
            "CORE_KEY_MISSING",
            "Element identity does not resolve",
            "",
        ));
    };
    for (mi, m) in modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if get(m, "id").and_then(raw).as_ref() != Some(&module) {
            continue;
        }
        let Some(Value::Array(elements)) = get(m, "elements") else {
            continue;
        };
        for (ei, el) in elements.iter().enumerate() {
            ctx.charge_work(1, k(&format!("/modules/{mi}/elements")))?;
            if get(el, "id").and_then(raw).as_ref() == Some(&element) {
                return Ok((
                    src,
                    id,
                    mi,
                    ei,
                    diagnostics,
                    format!("/modules/{mi}/elements/{ei}"),
                ));
            }
        }
    }
    Err(err(
        "CORE_KEY_MISSING",
        "Element identity does not resolve",
        "",
    ))
}
fn check_record(src: &Value, mi: usize, ei: usize, path: &str) -> Result<(), EngineError> {
    if !eq(get(src, "umf"), "0.10.0") {
        return Err(err(
            "CORE_KEY_VERSION",
            "Current core 0.10.0 source required",
            "",
        ));
    }
    let el = &get(src, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(mi)
            } else {
                None
            }
        })
        .and_then(|m| get(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(ei)
            } else {
                None
            }
        })
        .expect("located element");
    if !eq(get(el, "kind"), "record") {
        return Err(err(
            "CORE_KEY_ROLE",
            "Keys and membership apply only to explicit Records",
            path,
        ));
    }
    Ok(())
}
fn member_refs(request: &Value) -> Result<&Vec<Value>, EngineError> {
    if let Value::Array(a) = request {
        Ok(a)
    } else {
        Err(err(
            "CORE_MEMBERS_REQUEST",
            "Expected exact ordered Field references",
            "",
        ))
    }
}
fn identity_key(v: &Value) -> Option<Vec<Utf16>> {
    Some(vec![
        get(v, "module")?.clone().into_string()?,
        get(v, "element")?.clone().into_string()?,
    ])
}
trait IntoString {
    fn into_string(self) -> Option<Utf16>;
}
impl IntoString for Value {
    fn into_string(self) -> Option<Utf16> {
        raw(&self)
    }
}
fn same_ref(a: &Value, b: &Value) -> bool {
    identity_key(a) == identity_key(b)
}
fn unknown_qualifier(v: &Value, allowed: &[&str]) -> bool {
    matches!(v,Value::Object(fields) if fields.iter().any(|(n,_)|!allowed.iter().any(|a|n==&k(a))))
}
fn member_req_valid(req: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let Value::Array(items) = req else {
        return Ok(false);
    };
    let mut seen = BTreeSet::new();
    for item in items {
        ctx.charge_work(1, k("/request"))?;
        if !matches!(item,Value::Object(fields) if fields.len()==2 && get(item,"module").and_then(raw).is_some_and(|s|!s.is_empty()) && get(item,"element").and_then(raw).is_some_and(|s|!s.is_empty()))
        {
            return Ok(false);
        }
        let key = identity_key(item).expect("validated member identity");
        if !seen.insert(key) {
            return Ok(false);
        }
    }
    Ok(true)
}
fn key_request_valid(req: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let Value::Object(fields) = req else {
        return Ok(false);
    };
    if fields
        .iter()
        .any(|(n, _)| ![k("id"), k("name"), k("fields"), k("primary")].contains(n))
    {
        return Ok(false);
    }
    if get(req, "id").and_then(raw).is_none_or(|s| s.is_empty())
        || get(req, "name").and_then(raw).is_none_or(|s| s.is_empty())
    {
        return Ok(false);
    }
    if get(req, "primary").is_some_and(|v| !matches!(v, Value::Bool(_))) {
        return Ok(false);
    }
    let Some(Value::Array(refs)) = get(req, "fields") else {
        return Ok(false);
    };
    if refs.is_empty() {
        return Ok(false);
    }
    let mut seen = BTreeSet::new();
    for reference in refs {
        ctx.charge_work(1, k("/request/fields"))?;
        if !matches!(reference,Value::Object(m) if m.len()==2&&["module","element"].iter().all(|n|get(reference,n).and_then(raw).is_some_and(|s|!s.is_empty())))
        {
            return Ok(false);
        }
        if !seen.insert(identity_key(reference).expect("validated key component")) {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Copy and validate a record-member request before a caller admits its source.
pub fn admit_core_key_member_request(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy_json(request, ctx)?;
    if !member_req_valid(&request, ctx)? {
        return Err(err(
            "CORE_MEMBERS_REQUEST",
            "Expected exact ordered Field references",
            "",
        ));
    }
    Ok(request)
}

/// Copy and validate a Key request before a caller admits its source.
pub fn admit_core_key_request(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy_json(request, ctx)?;
    if !key_request_valid(&request, ctx)? {
        return Err(err(
            "CORE_KEY_REQUEST",
            "Expected key ID, name, ordered components and optional primary",
            "",
        ));
    }
    Ok(request)
}

/// Copy and validate a stable Key identity before a caller admits its source.
pub fn admit_core_key_identity(
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let identity = copy_json(identity, ctx)?;
    match &identity {
        Value::Object(fields)
            if fields.len() == 3
                && fields
                    .iter()
                    .all(|(name, _)| [k("module"), k("element"), k("key")].contains(name)) =>
        {
            let valid = ["module", "element", "key"].iter().all(|name| {
                get(&identity, name)
                    .and_then(raw)
                    .is_some_and(|value| !value.is_empty())
            });
            if valid {
                return Ok(identity);
            }
        }
        _ => {}
    }
    Err(err(
        "CORE_KEY_IDENTITY",
        "Explicit stable key identity is required",
        "",
    ))
}
fn target_element_mut(target: &mut Value, mi: usize, ei: usize) -> Result<&mut Value, EngineError> {
    let Value::Object(root) = target else {
        return Err(err("CORE_KEY_SHAPE", "Expected document object", ""));
    };
    let modules = root
        .iter_mut()
        .find(|(n, _)| n == &k("modules"))
        .and_then(|(_, v)| {
            if let Value::Array(a) = v {
                a.get_mut(mi)
            } else {
                None
            }
        })
        .ok_or_else(|| err("CORE_KEY_SHAPE", "Missing modules", ""))?;
    let Value::Object(m) = modules else {
        return Err(err("CORE_KEY_SHAPE", "Expected module object", ""));
    };
    m.iter_mut()
        .find(|(n, _)| n == &k("elements"))
        .and_then(|(_, v)| {
            if let Value::Array(a) = v {
                a.get_mut(ei)
            } else {
                None
            }
        })
        .ok_or_else(|| err("CORE_KEY_SHAPE", "Missing element", ""))
}

/// Copy and expose key meaning for an explicitly selected element.
pub fn inspect_core_keys(
    input: &Value,
    identity: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, id, mi, ei, diagnostics, base) =
        locate(input, identity, engine, registry, caps, ctx)?;
    let path = format!("{base}/keys");
    let el = &get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(mi)
            } else {
                None
            }
        })
        .and_then(|m| get(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(ei)
            } else {
                None
            }
        })
        .expect("located");
    let meaning = if !eq(get(el, "kind"), "record") {
        obj(vec![("state", t("inapplicable"))])
    } else if get(el, "keys").is_none() {
        obj(vec![("state", t("missing"))])
    } else {
        let keys = copy_json(get(el, "keys").unwrap(), ctx)?;
        let unknown = unknown_paths(&diagnostics, &path, true, ctx)?;
        obj(vec![
            (
                "state",
                t(if unknown.is_empty() {
                    "known"
                } else {
                    "partial"
                }),
            ),
            ("keys", keys),
            ("uninterpretedPaths", Value::Array(unknown)),
        ])
    };
    let result = obj(vec![
        ("operation", t("inspect-core-keys")),
        ("version", t("4.0.0")),
        ("source", source),
        ("identity", id),
        ("path", t(&path)),
        ("meaning", meaning),
        ("provenance", t("unverified")),
    ]);
    validate_result(&result, INSPECTION_SCHEMA, "CORE_KEY_RESULT", engine, ctx)?;
    Ok(result)
}

/// Resolve by explicit Record identity and stable key ID; no name or position fallback.
pub fn lookup_core_key(
    input: &Value,
    identity: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let key_identity = admit_core_key_identity(identity, ctx)?;
    let module = get(&key_identity, "module")
        .and_then(raw)
        .filter(|v| !v.is_empty());
    let element = get(&key_identity, "element")
        .and_then(raw)
        .filter(|v| !v.is_empty());
    let keyid = get(&key_identity, "key")
        .and_then(raw)
        .filter(|v| !v.is_empty());
    let (Some(module), Some(element), Some(keyid)) = (module, element, keyid) else {
        return Err(err(
            "CORE_KEY_IDENTITY",
            "Explicit stable key identity is required",
            "",
        ));
    };
    let identity_record = obj(vec![
        ("module", Value::String(module)),
        ("element", Value::String(element)),
    ]);
    let (source, id, mi, ei, diagnostics, base) =
        locate(input, &identity_record, engine, registry, caps, ctx)?;
    check_record(&source, mi, ei, &base)?;
    let el = &get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(mi)
            } else {
                None
            }
        })
        .and_then(|m| get(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(ei)
            } else {
                None
            }
        })
        .unwrap();
    let Some(Value::Array(keys)) = get(el, "keys") else {
        return Err(err(
            "CORE_KEY_MISSING",
            "Stable key ID does not resolve",
            "",
        ));
    };
    let mut selected = None;
    for (index, candidate) in keys.iter().enumerate() {
        ctx.charge_work(1, k(&format!("{base}/keys")))?;
        if get(candidate, "id").and_then(raw).as_ref() == Some(&keyid) {
            selected = Some((index, candidate));
            break;
        }
    }
    let Some((index, key)) = selected else {
        return Err(err(
            "CORE_KEY_MISSING",
            "Stable key ID does not resolve",
            "",
        ));
    };
    let path = format!("{base}/keys/{index}");
    let unknown = unknown_paths(&diagnostics, &path, false, ctx)?;
    let key_copy = copy_json(key, ctx)?;
    let result = obj(vec![
        ("operation", t("lookup-core-key")),
        ("version", t("4.0.0")),
        ("source", source),
        ("identity", id_with_key(&id, keyid)),
        ("path", t(&path)),
        ("key", key_copy),
        ("uninterpretedPaths", Value::Array(unknown)),
        ("provenance", t("unverified")),
    ]);
    validate_result(&result, INSPECTION_SCHEMA, "CORE_KEY_RESULT", engine, ctx)?;
    Ok(result)
}
fn id_with_key(id: &Value, key: Utf16) -> Value {
    let mut fields = if let Value::Object(m) = id {
        m.clone()
    } else {
        vec![]
    };
    fields.push((k("key"), Value::String(key)));
    Value::Object(fields)
}

/// Declare an ordered Record membership list atomically. Existing qualifiers on
/// retained references are copied, while removing opaque references is refused.
pub fn declare_core_record_members(
    input: &Value,
    identity: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let req = admit_core_key_member_request(request, ctx)?;
    let (source, id, mi, ei, _, base) = locate(input, identity, engine, registry, caps, ctx)?;
    check_record(&source, mi, ei, &base)?;
    let current = &get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(mi)
            } else {
                None
            }
        })
        .and_then(|m| get(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(ei)
            } else {
                None
            }
        })
        .unwrap();
    let old = get(current, "members");
    if let Some(Value::Array(previous)) = old {
        for r in previous {
            ctx.charge_work(1, k(&format!("{base}/members")))?;
            if !member_refs(&req)?.iter().any(|x| same_ref(x, r))
                && unknown_qualifier(r, &["module", "element"])
            {
                return Err(err(
                    "CORE_MEMBERS_UNKNOWN",
                    "Cannot remove a member with unknown qualifiers",
                    &format!("{base}/members"),
                ));
            }
        }
    }
    let mut target = copy_json(&source, ctx)?;
    let previous = old
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.clone())
            } else {
                None
            }
        })
        .unwrap_or_default();
    let mut merged = vec![];
    for reference in member_refs(&req)? {
        ctx.charge_work(1, k(&format!("{base}/members")))?;
        let mut v = previous
            .iter()
            .find(|p| same_ref(p, reference))
            .cloned()
            .unwrap_or(Value::Object(vec![]));
        if let (Value::Object(fields), Value::Object(new)) = (&mut v, reference) {
            for (name, value) in new {
                if let Some((_, slot)) = fields.iter_mut().find(|(n, _)| n == name) {
                    *slot = value.clone()
                } else {
                    fields.push((name.clone(), value.clone()))
                }
            }
        }
        merged.push(v)
    }
    set(
        target_element_mut(&mut target, mi, ei)?,
        "members",
        Value::Array(merged),
    )?;
    let validation = engine.validate_document(&target, registry, caps, ctx)?;
    if !validation.valid {
        let msg = diagnostics_message(validation.diagnostics, ctx)?;
        return Err(err("CORE_MEMBERS_CONFLICT", &msg, ""));
    }
    let result = obj(vec![
        ("operation", t("declare-core-record-members")),
        ("version", t("2.0.0")),
        ("source", source),
        ("target", target),
        ("identity", id),
        ("request", req),
        (
            "provenance",
            provenance(&format!("{base}/members"), "members"),
        ),
    ]);
    validate_result(&result, DECLARATION_SCHEMA, "CORE_KEY_RESULT", engine, ctx)?;
    Ok(result)
}
fn provenance(path: &str, leaf: &str) -> Value {
    obj(vec![
        ("origin", t("authored")),
        ("idealPath", t(path)),
        ("basis", t("explicit-author-declaration")),
        ("nativePath", Value::Null),
        (
            "binding",
            obj(vec![
                (
                    "id",
                    t(if leaf == "members" {
                        "umf.core.members.authoring"
                    } else {
                        "umf.core.key.authoring"
                    }),
                ),
                ("version", t("2.0.0")),
            ]),
        ),
    ])
}

/// Declare or update one key by ID while preserving its ordered tuple and unknown qualifiers.
pub fn declare_core_key(
    input: &Value,
    identity: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let req = admit_core_key_request(request, ctx)?;
    let (Some(key_id), Some(name), Some(Value::Array(fields))) = (
        get(&req, "id").and_then(raw),
        get(&req, "name").and_then(raw),
        get(&req, "fields"),
    ) else {
        return Err(err(
            "CORE_KEY_REQUEST",
            "Expected key ID, name and ordered components",
            "",
        ));
    };
    let (source, id, mi, ei, _, base) = locate(input, identity, engine, registry, caps, ctx)?;
    check_record(&source, mi, ei, &base)?;
    let el = &get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(mi)
            } else {
                None
            }
        })
        .and_then(|m| get(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(ei)
            } else {
                None
            }
        })
        .unwrap();
    let old = get(el, "keys").and_then(|v| {
        if let Value::Array(a) = v {
            Some(a)
        } else {
            None
        }
    });
    let mut index = None;
    for (i, candidate) in old.into_iter().flatten().enumerate() {
        ctx.charge_work(1, k(&format!("{base}/keys")))?;
        if get(candidate, "id").and_then(raw).as_ref() == Some(&key_id) {
            index = Some(i);
            break;
        }
    }
    let previous = index.and_then(|i| old.and_then(|items| items.get(i)));
    if let Some(prev) = previous {
        let Some(Value::Array(old_fields)) = get(prev, "fields") else {
            return Err(err(
                "CORE_KEY_ID_CONFLICT",
                "Existing key tuple is malformed",
                &format!("{base}/keys/{}", index.unwrap_or(0)),
            ));
        };
        if old_fields.len() != fields.len()
            || old_fields.iter().zip(fields).any(|(a, b)| !same_ref(a, b))
        {
            return Err(err(
                "CORE_KEY_ID_CONFLICT",
                "Existing key ID cannot change its ordered component tuple",
                &format!("{base}/keys/{}", index.unwrap_or(0)),
            ));
        }
    }
    let mut next = match previous {
        Some(previous) => copy_json(previous, ctx)?,
        None => obj(vec![]),
    };
    set(&mut next, "id", Value::String(key_id.clone()))?;
    set(&mut next, "name", Value::String(name.clone()))?;
    let mut merged = vec![];
    for (i, field) in fields.iter().enumerate() {
        ctx.charge_work(1, k(&format!("{base}/keys")))?;
        let mut value = previous
            .and_then(|p| get(p, "fields"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get(i)
                } else {
                    None
                }
            })
            .map(|value| copy_json(value, ctx))
            .transpose()?
            .unwrap_or(obj(vec![]));
        if let Value::Object(new) = field {
            for (n, v) in new {
                set_utf16(&mut value, n.clone(), copy_json(v, ctx)?)?
            }
        }
        merged.push(value)
    }
    set(&mut next, "fields", Value::Array(merged))?;
    if let Some(primary) = get(&req, "primary") {
        set(&mut next, "primary", copy_json(primary, ctx)?)?
    }
    let old_keys = old.map(Vec::as_slice).unwrap_or(&[]);
    ctx.charge_work(old_keys.len(), k(&format!("{base}/keys")))?;
    let additional = if index.is_none() { 1 } else { 0 };
    let mut result_keys = Vec::with_capacity(old_keys.len().saturating_add(additional));
    for key in old_keys {
        result_keys.push(copy_json(key, ctx)?);
    }
    if let Some(i) = index {
        result_keys[i] = next
    } else {
        result_keys.push(next)
    }
    let mut target = copy_json(&source, ctx)?;
    set(
        target_element_mut(&mut target, mi, ei)?,
        "keys",
        Value::Array(result_keys),
    )?;
    let validation = engine.validate_document(&target, registry, caps, ctx)?;
    if !validation.valid {
        let msg = diagnostics_message(validation.diagnostics, ctx)?;
        return Err(err("CORE_KEY_CONFLICT", &msg, ""));
    }
    let idx = index.unwrap_or(old_keys.len());
    let result = obj(vec![
        ("operation", t("declare-core-key")),
        ("version", t("2.0.0")),
        ("source", source),
        ("target", target),
        ("identity", id),
        ("request", req),
        (
            "provenance",
            provenance(&format!("{base}/keys/{idx}"), "key"),
        ),
    ]);
    validate_result(&result, DECLARATION_SCHEMA, "CORE_KEY_RESULT", engine, ctx)?;
    Ok(result)
}

fn checked_key_receipt(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = copy_json(receipt, ctx)?;
    validate_receipt_shape(&r, engine, ctx)?;
    let op = get(&r, "operation")
        .and_then(raw)
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let expected = match op.as_str() {
        "inspect-core-keys" => inspect_core_keys(
            get(&r, "source").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing source", ""))?,
            get(&r, "identity").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing identity", ""))?,
            engine,
            registry,
            caps,
            ctx,
        )?,
        "lookup-core-key" => lookup_core_key(
            get(&r, "source").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing source", ""))?,
            get(&r, "identity").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing identity", ""))?,
            engine,
            registry,
            caps,
            ctx,
        )?,
        "declare-core-key" => declare_core_key(
            get(&r, "source").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing source", ""))?,
            get(&r, "identity").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing identity", ""))?,
            get(&r, "request").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing request", ""))?,
            engine,
            registry,
            caps,
            ctx,
        )?,
        "declare-core-record-members" => declare_core_record_members(
            get(&r, "source").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing source", ""))?,
            get(&r, "identity").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing identity", ""))?,
            get(&r, "request").ok_or_else(|| err("CORE_KEY_RECEIPT", "Missing request", ""))?,
            engine,
            registry,
            caps,
            ctx,
        )?,
        _ => return Err(err("CORE_KEY_RECEIPT", "Unknown key operation", "")),
    };
    if !canonical_equal(&expected, &r) {
        return Err(err(
            "CORE_KEY_RECEIPT",
            "Operation differs from retained source/request",
            "",
        ));
    }
    Ok(r)
}

/// Admit, schema-check, recompute, and compare a key receipt before current is read.
pub fn prepare_core_key_verification(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    checked_key_receipt(receipt, engine, registry, caps, ctx)
}

/// Rust-owned receipt-first verification state. Unlike the generic wire
/// preparation result, this value cannot be serialized or reconstructed by a
/// caller; host bindings retain it between receipt and current admission.
#[derive(Debug)]
pub struct PreparedCoreKeyOperationVerification {
    receipt: Value,
}

impl PreparedCoreKeyOperationVerification {
    /// Compare a newly admitted current document to the retained operation
    /// target without recomputing the operation receipt.
    pub fn verify_current(
        self,
        current: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let now = copy_json(current, ctx)?;
        if !canonical_equal(
            get(&self.receipt, "target").unwrap_or(get(&self.receipt, "source").unwrap()),
            &now,
        ) {
            return Err(err(
                "CORE_KEY_STALE",
                "Current document changed after operation",
                "",
            ));
        }
        // The stage is one-use, so the already-admitted receipt can be moved
        // out directly. Re-copying here would charge and traverse retained
        // unknown content a second time without adding isolation.
        Ok(self.receipt)
    }
}

/// Admit, schema-check, recompute, and compare a key receipt, then retain the
/// verified receipt in a non-serializable Rust value for one-shot host stages.
pub fn prepare_core_key_operation_verification(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<PreparedCoreKeyOperationVerification, EngineError> {
    let receipt = checked_key_receipt(receipt, engine, registry, caps, ctx)?;
    Ok(PreparedCoreKeyOperationVerification { receipt })
}

/// Recompute an operation from its archived source and reject altered or stale receipts.
pub fn verify_core_key_operation(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = checked_key_receipt(receipt, engine, registry, caps, ctx)?;
    let now = copy_json(current, ctx)?;
    if !canonical_equal(
        get(&r, "target").unwrap_or(get(&r, "source").unwrap()),
        &now,
    ) {
        return Err(err(
            "CORE_KEY_STALE",
            "Current document changed after operation",
            "",
        ));
    }
    Ok(r)
}
