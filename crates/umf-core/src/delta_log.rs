// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact bounded Delta JSONL source capture and envelope inspection.
//! Inspection preserves source text; it does not establish native Delta validity.

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value},
};

const EXT: &str = "umf.delta.log";
const PROFILE: &str = "delta-jsonl-source";
const MAX_TEXT: usize = 1_000_000;
const TOKEN: u64 = 0x4445_4c54_414c_4f01;

pub struct DeltaLogResources {
    engine: Engine,
    registry: Registry,
}
impl DeltaLogResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                ctx,
            )
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
        let manifest = read(
            include_str!("../../../spec/extensions/delta-log/package.json"),
            ctx,
        )?;
        let schemas = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &manifest,
            Some(TOKEN),
            engine.package_schema(),
            &schemas,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }
}

struct LogCapabilities;
impl Capabilities for LogCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
    fn validate_extension_with_context(
        &mut self,
        _token: u64,
        _payload: &Value,
        _semantic: &SemanticContext,
        _ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        Ok(Vec::new())
    }
}

pub fn capture_delta_log(
    source: &[u16],
    id: &Utf16,
    resources: &DeltaLogResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if source.len() > MAX_TEXT {
        return Err(err(
            "DELTA_LOG_LIMIT",
            "Expected at most 1000000 UTF-16 code units",
        ));
    }
    let payload = obj(vec![
        ("profile", Value::string_utf8(PROFILE)),
        ("text", Value::String(Utf16::new(source.to_vec()))),
    ]);
    let element = obj(vec![
        ("id", Value::string_utf8("source")),
        ("extensions", obj(vec![(EXT, payload)])),
    ]);
    let module = obj(vec![
        ("id", Value::string_utf8("log")),
        ("namespace", Value::string_utf8("")),
        ("elements", Value::Array(vec![element])),
    ]);
    let document = obj(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            obj(vec![(
                EXT,
                obj(vec![("version", Value::string_utf8("0.1.0"))]),
            )]),
        ),
        ("modules", Value::Array(vec![module])),
    ]);
    let document = crate::copy_json(&document, ctx)?;
    if !validate(&document, resources, ctx)?.valid {
        return Err(err("DELTA_LOG_DOCUMENT", "Invalid source capture envelope"));
    }
    Ok(document)
}

pub fn export_delta_log(
    document: &Value,
    resources: &DeltaLogResources,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    if !validate(document, resources, ctx)?.valid {
        return Err(err("DELTA_LOG_DOCUMENT", "Invalid source capture envelope"));
    }
    let payload = log_payload(document)
        .ok_or_else(|| err("DELTA_LOG_DOCUMENT", "Invalid source capture envelope"))?;
    if str_field(payload, "profile").as_deref() != Some(PROFILE)
        || str_field(document, "umf").as_deref() != Some("0.10.0")
        || !has_version(document)
    {
        return Err(err("DELTA_LOG_PAYLOAD", "Expected pinned log payload"));
    }
    if obj_fields(payload).is_none_or(|f| {
        f.iter()
            .any(|(k, _)| !["profile", "text"].contains(&k.to_utf8().ok().as_deref().unwrap_or("")))
    }) {
        return Err(err(
            "DELTA_LOG_REPRESENTATION",
            "Unknown representation fields cannot be dropped from native export",
        ));
    }
    let Some(Value::String(text)) = field(payload, "text") else {
        return Err(err(
            "DELTA_LOG_LIMIT",
            "Expected at most 1000000 UTF-16 code units",
        ));
    };
    if text.len() > MAX_TEXT {
        return Err(err(
            "DELTA_LOG_LIMIT",
            "Expected at most 1000000 UTF-16 code units",
        ));
    }
    ctx.charge_work(text.len(), Utf16::default())?;
    Ok(text.clone())
}

pub fn inspect_delta_log(
    document: &Value,
    resources: &DeltaLogResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let text = export_delta_log(document, resources, ctx)?;
    let mut lines = Vec::new();
    let mut diagnostics = vec![diag("DELTA_LOG_UNVERIFIED", "", "Parsed action envelopes do not establish action semantics, transaction validity or reconciled state", false)];
    let mut parsed_all = true;
    let units = text.units();
    let (mut start, mut line_no) = (0usize, 0usize);
    while start < units.len() {
        if line_no >= 10_000 {
            parsed_all = false;
            diagnostics.push(diag(
                "DELTA_LOG_LINE_LIMIT",
                "",
                "Inspection stopped after 10000 lines; remaining source remains captured",
                true,
            ));
            break;
        }
        let newline = units[start..]
            .iter()
            .position(|u| *u == 10)
            .map(|i| start + i);
        let next = newline.map_or(units.len(), |i| i + 1);
        let term_len = if newline.is_none() {
            0
        } else if newline.unwrap() > start && units[newline.unwrap() - 1] == 13 {
            2
        } else {
            1
        };
        let end = next - term_len;
        line_no += 1;
        let path = format!("/lines/{}", line_no - 1);
        let raw = &units[start..end];
        let terminator = match term_len {
            0 => "",
            1 => "\n",
            _ => "\r\n",
        };
        let mut status = "invalid";
        let mut action: Option<Utf16> = None;
        let mut node: Option<Value> = None;
        if raw.iter().all(|u| matches!(*u, 9 | 13 | 32)) {
            status = "blank";
            diagnostics.push(diag(
                "DELTA_LOG_BLANK",
                &path,
                "Blank line preserved; it is not an action",
                false,
            ));
        } else {
            match NativeJsonTree::parse_json(raw, ctx) {
                Err(e) => {
                    parsed_all = false;
                    diagnostics.push(DiagnosticBuild::from_error("DELTA_LOG_JSON", &path, e));
                }
                Ok(tree) => {
                    let tagged = tree.tagged_value_preserving_extras(ctx)?;
                    node = Some(tagged);
                    if let NativeJsonNode::Object(fields) = tree.root() {
                        if fields.len() != 1 {
                            parsed_all = false;
                            diagnostics.push(diag(
                                "DELTA_LOG_ACTION_ENVELOPE",
                                &path,
                                "Expected exactly one action key in an object",
                                true,
                            ));
                        } else {
                            let (key, value) = &fields[0];
                            action = Some(key.clone());
                            status = "parsed";
                            let name = key.to_utf8().unwrap_or_default();
                            if ![
                                "add",
                                "remove",
                                "metaData",
                                "protocol",
                                "txn",
                                "commitInfo",
                                "cdc",
                                "domainMetadata",
                                "sidecar",
                                "checkpointMetadata",
                            ]
                            .contains(&name.as_str())
                            {
                                diagnostics.push(diag(
                                    "DELTA_LOG_UNKNOWN_ACTION",
                                    &path,
                                    &format!(
                                        "Unknown action retained without interpretation: {name}"
                                    ),
                                    false,
                                ));
                            } else if name != "commitInfo"
                                && !matches!(value, NativeJsonNode::Object(_))
                            {
                                parsed_all = false;
                                status = "invalid";
                                diagnostics.push(diag(
                                    "DELTA_LOG_ACTION_VALUE",
                                    &path,
                                    "Known action requires an object value",
                                    true,
                                ));
                            }
                        }
                    } else {
                        parsed_all = false;
                        diagnostics.push(diag(
                            "DELTA_LOG_ACTION_ENVELOPE",
                            &path,
                            "Expected exactly one action key in an object",
                            true,
                        ));
                    }
                }
            }
        }
        let mut fields = vec![
            (Utf16::from("line"), Value::Number(line_no as f64)),
            (Utf16::from("start"), Value::Number(start as f64)),
            (Utf16::from("end"), Value::Number(end as f64)),
            (Utf16::from("terminator"), Value::string_utf8(terminator)),
            (Utf16::from("status"), Value::string_utf8(status)),
        ];
        if let Some(a) = action {
            fields.push((Utf16::from("action"), Value::String(a)));
        }
        if let Some(n) = node {
            fields.push((Utf16::from("node"), n));
        }
        lines.push(Value::Object(fields));
        start = next;
    }
    if lines.is_empty() {
        diagnostics.push(diag(
            "DELTA_LOG_EMPTY",
            "",
            "Empty source is preserved; it is not evidence of a valid commit",
            false,
        ));
    }
    Ok(obj(vec![
        ("source", crate::copy_json(document, ctx)?),
        ("complete", Value::Bool(false)),
        ("parsedAll", Value::Bool(parsed_all)),
        ("lines", Value::Array(lines)),
        (
            "diagnostics",
            Value::Array(diagnostics.into_iter().map(|d| d.value()).collect()),
        ),
    ]))
}

struct DiagnosticBuild {
    code: &'static str,
    path: String,
    message: Utf16,
    error: bool,
}
impl DiagnosticBuild {
    fn value(self) -> Value {
        obj(vec![
            ("code", Value::string_utf8(self.code)),
            ("path", Value::string_utf8(self.path)),
            (
                "severity",
                Value::string_utf8(if self.error { "error" } else { "warning" }),
            ),
            ("message", Value::String(self.message)),
        ])
    }
    fn from_error(code: &'static str, path: &str, e: EngineError) -> Self {
        Self {
            code,
            path: path.into(),
            message: e.message,
            error: true,
        }
    }
}
fn diag(code: &str, path: &str, message: &str, error: bool) -> DiagnosticBuild {
    DiagnosticBuild {
        code: match code {
            "DELTA_LOG_UNVERIFIED" => "DELTA_LOG_UNVERIFIED",
            "DELTA_LOG_LINE_LIMIT" => "DELTA_LOG_LINE_LIMIT",
            "DELTA_LOG_BLANK" => "DELTA_LOG_BLANK",
            "DELTA_LOG_JSON" => "DELTA_LOG_JSON",
            "DELTA_LOG_ACTION_ENVELOPE" => "DELTA_LOG_ACTION_ENVELOPE",
            "DELTA_LOG_UNKNOWN_ACTION" => "DELTA_LOG_UNKNOWN_ACTION",
            "DELTA_LOG_ACTION_VALUE" => "DELTA_LOG_ACTION_VALUE",
            "DELTA_LOG_EMPTY" => "DELTA_LOG_EMPTY",
            _ => "DELTA_LOG_JSON",
        },
        path: path.into(),
        message: Utf16::from(message),
        error,
    }
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn field<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn obj_fields(v: &Value) -> Option<&Vec<(Utf16, Value)>> {
    if let Value::Object(f) = v {
        Some(f)
    } else {
        None
    }
}
fn str_field(v: &Value, key: &str) -> Option<String> {
    field(v, key).and_then(str_value)
}
fn has_version(doc: &Value) -> bool {
    field(doc, "vocabularies")
        .and_then(|v| field(v, EXT))
        .and_then(|v| field(v, "version"))
        .and_then(|v| {
            if let Value::String(s) = v {
                s.to_utf8().ok()
            } else {
                None
            }
        })
        .as_deref()
        == Some("0.1.0")
}
fn as_array(v: &Value) -> Option<&Vec<Value>> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn log_payload(doc: &Value) -> Option<&Value> {
    let modules = as_array(field(doc, "modules")?)?;
    let m = modules
        .iter()
        .find(|m| field(m, "id").and_then(str_value).as_deref() == Some("log"))?;
    let elements = as_array(field(m, "elements")?)?;
    let e = elements
        .iter()
        .find(|e| field(e, "id").and_then(str_value).as_deref() == Some("source"))?;
    field(field(e, "extensions")?, EXT)
}
fn str_value(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn validate(
    document: &Value,
    resources: &DeltaLogResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut capabilities = LogCapabilities;
    resources
        .engine
        .validate_document(document, &resources.registry, &mut capabilities, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_source_offsets_terms_and_native_number_tokens() {
        let source="😀\r\n\t \n{\"txn\":{\"appId\":\"x\",\"version\":9223372036854775807}}\n{\"future\":{\"n\":1e400}}\n{\"metaData\":null}";
        let mut ctx = Context::ordinary();
        let resources = DeltaLogResources::new(&mut ctx).unwrap();
        let doc = capture_delta_log(
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("log"),
            &resources,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            export_delta_log(&doc, &resources, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            source
        );
        let report = inspect_delta_log(&doc, &resources, &mut ctx).unwrap();
        let lines = as_array(field(&report, "lines").unwrap()).unwrap();
        assert_eq!(lines.len(), 5);
        assert_eq!(field(&lines[1], "start"), Some(&Value::Number(4.0)));
        assert_eq!(
            str_value(field(&lines[0], "terminator").unwrap()).as_deref(),
            Some("\r\n")
        );
        let node = field(&lines[2], "node").unwrap();
        let members = field(node, "members").unwrap();
        let txn = field(members, "txn").unwrap();
        let txn_members = field(txn, "members").unwrap();
        let number = field(txn_members, "version").unwrap();
        assert_eq!(
            str_value(field(number, "value").unwrap()).as_deref(),
            Some("9223372036854775807")
        );
        let diagnostics = as_array(field(&report, "diagnostics").unwrap()).unwrap();
        assert_eq!(
            str_value(field(&diagnostics[2], "code").unwrap()).as_deref(),
            Some("DELTA_LOG_BLANK")
        );
    }
    #[test]
    fn empty_and_duplicate_key_sources_remain_captured() {
        let mut ctx = Context::ordinary();
        let resources = DeltaLogResources::new(&mut ctx).unwrap();
        let empty = capture_delta_log(&[], &Utf16::from("empty"), &resources, &mut ctx).unwrap();
        let empty_report = inspect_delta_log(&empty, &resources, &mut ctx).unwrap();
        assert!(as_array(field(&empty_report, "lines").unwrap())
            .unwrap()
            .is_empty());
        assert_eq!(
            str_value(
                field(
                    &as_array(field(&empty_report, "diagnostics").unwrap()).unwrap()[1],
                    "code"
                )
                .unwrap()
            )
            .as_deref(),
            Some("DELTA_LOG_EMPTY")
        );
        let text = "{\"txn\":{\"appId\":\"x\",\"app\\u0049d\":\"y\"}}";
        let duplicate = capture_delta_log(
            &text.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("dup"),
            &resources,
            &mut ctx,
        )
        .unwrap();
        let r = inspect_delta_log(&duplicate, &resources, &mut ctx).unwrap();
        assert!(!matches!(field(&r, "parsedAll"), Some(Value::Bool(true))));
        assert_eq!(
            export_delta_log(&duplicate, &resources, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            text
        );
    }
}
