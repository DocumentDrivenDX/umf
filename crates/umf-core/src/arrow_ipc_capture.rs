// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact, bounded Arrow IPC source capture (CONTRACT-016).
//! Captures preserve bytes and deliberately make no native validity claim.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet},
    error::EngineError,
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value},
};

pub const PROFILE: &str = "arrow-ipc-source";
pub const MAX_BYTES: usize = 1_000_000;
const TOKEN: u64 = 0x4152_524f_5749_5001;

pub struct ArrowIpcResources {
    engine: Engine,
    registry: Registry,
}
impl ArrowIpcResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
        let package = read(
            include_str!("../../../spec/extensions/arrow-ipc/package.json"),
            ctx,
        )?;
        let schemas = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(TOKEN),
            engine.package_schema(),
            &schemas,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }
}

struct Accept;
impl Capabilities for Accept {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &crate::engine::SemanticContext,
    ) -> Result<Vec<crate::error::Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

pub fn capture_arrow_ipc(
    bytes: &[u8],
    id: &Utf16,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if bytes.len() > MAX_BYTES {
        return Err(err(
            "ARROW_IPC_LIMIT",
            "Expected at most 1000000 source bytes",
        ));
    }
    let doc = document(id, &hex(bytes));
    let validation =
        resources
            .engine
            .validate_document(&doc, &resources.registry, &mut Accept, ctx)?;
    if !validation.valid {
        return Err(err("ARROW_IPC_CAPTURE", "Invalid IPC capture envelope"));
    }
    Ok(doc)
}

pub fn export_arrow_ipc_capture(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let report = inspect_arrow_ipc_capture(document, resources, ctx)?;
    if field(&report, "valid") != Some(&Value::Bool(true)) {
        return Err(err("ARROW_IPC_CAPTURE", "Invalid IPC capture envelope"));
    }
    let payload =
        payload(document).map_err(|_| err("ARROW_IPC_CAPTURE", "Expected pinned IPC capture"))?;
    if !pinned(document, payload) {
        return Err(err("ARROW_IPC_CAPTURE", "Expected pinned IPC capture"));
    }
    if members(payload).is_none_or(|m| {
        m.iter().any(|(k, _)| {
            !["profile", "encoding", "bytes"]
                .iter()
                .any(|n| k == &Utf16::from(*n))
        })
    }) {
        return Err(err(
            "ARROW_IPC_REPRESENTATION",
            "Unknown capture representation fields cannot be exported as native bytes",
        ));
    }
    unhex(
        text(payload, "bytes")?
            .to_utf8()
            .map_err(|_| err("ARROW_IPC_CAPTURE", "bytes must be UTF-8"))?
            .as_str(),
    )
}

pub fn inspect_arrow_ipc_capture(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validation =
        resources
            .engine
            .validate_document(document, &resources.registry, &mut Accept, ctx)?;
    let mut diagnostics: Vec<Value> = validation
        .diagnostics
        .iter()
        .map(|d| {
            diagnostic_severity(
                &d.code.to_utf8().unwrap_or_default(),
                &d.path.to_utf8().unwrap_or_default(),
                &d.message.to_utf8().unwrap_or_default(),
                if d.severity == crate::error::Severity::Error {
                    "error"
                } else {
                    "warning"
                },
            )
        })
        .collect();
    diagnostics.push(diagnostic("ARROW_IPC_UNINTERPRETED", "", "Captured bytes are authoritative; complete IPC framing, native schema and data validity are unverified"));
    let complete = false;
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(complete)),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ]))
}

fn document(id: &Utf16, bytes: &str) -> Value {
    obj(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            obj(vec![(
                "umf.arrow.ipc",
                obj(vec![("version", Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (
            "modules",
            Value::Array(vec![obj(vec![
                ("id", Value::string_utf8("ipc")),
                ("namespace", Value::string_utf8("")),
                (
                    "elements",
                    Value::Array(vec![obj(vec![
                        ("id", Value::string_utf8("source")),
                        (
                            "extensions",
                            obj(vec![(
                                "umf.arrow.ipc",
                                obj(vec![
                                    ("profile", Value::string_utf8(PROFILE)),
                                    ("encoding", Value::string_utf8("hex")),
                                    ("bytes", Value::string_utf8(bytes)),
                                ]),
                            )]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ])
}
fn payload(doc: &Value) -> Result<&Value, EngineError> {
    let modules =
        array(field(doc, "modules").ok_or_else(|| err("ARROW_IPC_CAPTURE", "Missing modules"))?)
            .ok_or_else(|| err("ARROW_IPC_CAPTURE", "modules must be array"))?;
    let module = unique(modules, "ipc")?;
    let elements = array(
        field(module, "elements").ok_or_else(|| err("ARROW_IPC_CAPTURE", "Missing elements"))?,
    )
    .ok_or_else(|| err("ARROW_IPC_CAPTURE", "elements must be array"))?;
    let element = unique(elements, "source")?;
    field(
        field(element, "extensions")
            .ok_or_else(|| err("ARROW_IPC_CAPTURE", "Missing extensions"))?,
        "umf.arrow.ipc",
    )
    .ok_or_else(|| err("ARROW_IPC_CAPTURE", "Missing Arrow IPC payload"))
}
fn pinned(doc: &Value, p: &Value) -> bool {
    field(doc, "vocabularies")
        .and_then(|v| field(v, "umf.arrow.ipc"))
        .and_then(|v| field(v, "version"))
        .and_then(|v| {
            if let Value::String(s) = v {
                Some(s)
            } else {
                None
            }
        })
        == Some(&Utf16::from("0.1.0"))
        && text(p, "profile").ok() == Some(&Utf16::from(PROFILE))
        && text(p, "encoding").ok() == Some(&Utf16::from("hex"))
}
fn unique<'a>(xs: &'a [Value], id: &str) -> Result<&'a Value, EngineError> {
    let mut m = xs
        .iter()
        .filter(|v| text(v, "id").ok().is_some_and(|s| s == &Utf16::from(id)));
    let x = m
        .next()
        .ok_or_else(|| err("ARROW_IPC_CAPTURE", "Missing source identity"))?;
    if m.next().is_some() {
        return Err(err("ARROW_IPC_CAPTURE", "Duplicate source identity"));
    }
    Ok(x)
}
fn text<'a>(v: &'a Value, k: &str) -> Result<&'a Utf16, EngineError> {
    match field(v, k) {
        Some(Value::String(s)) => Ok(s),
        _ => Err(err("ARROW_IPC_CAPTURE", "Required text member is missing")),
    }
}
fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    members(v)?
        .iter()
        .find(|(x, _)| x == &Utf16::from(k))
        .map(|(_, v)| v)
}
fn members(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(v) = v {
        Some(v)
    } else {
        None
    }
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = v {
        Some(v)
    } else {
        None
    }
}
fn obj(xs: Vec<(&str, Value)>) -> Value {
    Value::Object(xs.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn hex(xs: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(xs.len() * 2);
    for b in xs {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char);
    }
    s
}
fn unhex(s: &str) -> Result<Vec<u8>, EngineError> {
    if s.len() % 2 != 0
        || s.len() > MAX_BYTES * 2
        || !s
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(err(
            "ARROW_IPC_CAPTURE",
            "Capture must be at most 1000000 bytes in lowercase hexadecimal",
        ));
    }
    Ok(s.as_bytes()
        .chunks_exact(2)
        .map(|p| {
            ((p[0] - if p[0] <= b'9' { b'0' } else { b'a' - 10 }) << 4)
                | (p[1] - if p[1] <= b'9' { b'0' } else { b'a' - 10 })
        })
        .collect())
}
fn err(code: &'static str, msg: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn diagnostic(code: &str, path: &str, message: &str) -> Value {
    diagnostic_severity(code, path, message, "warning")
}
fn diagnostic_severity(code: &str, path: &str, message: &str, severity: &str) -> Value {
    obj(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        ("message", Value::string_utf8(message)),
        ("severity", Value::string_utf8(severity)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_refuses_bytes_above_one_megabyte_before_document_construction() {
        let mut ctx = Context::ordinary();
        let resources = ArrowIpcResources::new(&mut ctx).unwrap();
        let error = capture_arrow_ipc(
            &vec![0; MAX_BYTES + 1],
            &Utf16::from("oversized"),
            &resources,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "ARROW_IPC_LIMIT");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Expected at most 1000000 source bytes"
        );
    }
}
