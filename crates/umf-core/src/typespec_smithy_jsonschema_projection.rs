// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned policy, resource and target admission for TypeSpec/Smithy JSON Schema emission.
use crate::{
    context::Context,
    error::{Diagnostic, EngineError},
    json_schema_adapter::{self, SchemaPosition},
    native_json::NativeJsonNode,
    value::{copy_json, Utf16, Value},
};
use std::collections::BTreeSet;
fn e(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(t: &str) -> Value {
    Value::string_utf8(t)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn member<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn utf8(v: Option<&Value>) -> Option<String> {
    text(v)?.to_utf8().ok()
}
fn issue(code: &str, class: &str, detail: &str) -> Value {
    obj(vec![
        ("path", s("")),
        ("code", s(code)),
        ("classification", s(class)),
        ("detail", s(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn diagnostic_issue(d: Diagnostic, class: &str) -> Value {
    obj(vec![
        ("path", Value::String(d.path)),
        ("code", Value::String(d.code)),
        ("classification", s(class)),
        ("detail", Value::String(d.message)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn fields(v: &Value) -> Result<&[(Utf16, Value)], EngineError> {
    if let Value::Object(x) = v {
        Ok(x)
    } else {
        Err(e("PROJECTION_POLICY", "Expected an object policy"))
    }
}
fn allowed(v: &Value, keys: &[&str], code: &str, msg: &str) -> Result<(), EngineError> {
    if fields(v)?
        .iter()
        .any(|(name, _)| !keys.iter().any(|x| name == &k(x)))
    {
        Err(e(code, msg))
    } else {
        Ok(())
    }
}
fn parse_abs(
    uri: &Utf16,
    code: &str,
    msg: &str,
    ctx: &mut Context<'_>,
) -> Result<url::Url, EngineError> {
    ctx.charge_text(uri.len(), Utf16::default())?;
    let raw = uri.to_utf8().map_err(|_| e(code, msg))?;
    url::Url::parse(&raw).map_err(|_| e(code, msg))
}
fn validate_typespec_policy(policy: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    allowed(
        policy,
        &[
            "id",
            "rootFile",
            "retrievalBase",
            "options",
            "usage",
            "lossPolicy",
        ],
        "TYPESPEC_PROJECTION_POLICY",
        "Explicit native-emission policy, JSON file type and root output file are required",
    )?;
    let id = utf8(member(policy, "id"));
    let root = utf8(member(policy, "rootFile"));
    let base = text(member(policy, "retrievalBase"));
    let usage = utf8(member(policy, "usage"));
    let loss = utf8(member(policy, "lossPolicy"));
    let options = member(policy, "options");
    if id.as_deref().unwrap_or("").is_empty()
        || root.as_deref().unwrap_or("").is_empty()
        || base.is_none()
        || usage.as_deref() != Some("native-emission")
        || !matches!(loss.as_deref(), Some("strict" | "allow-reported-loss"))
        || !matches!(options, Some(Value::Object(_)))
        || utf8(options.and_then(|x| member(x, "file-type"))).as_deref() != Some("json")
    {
        return Err(e(
            "TYPESPEC_PROJECTION_POLICY",
            "Explicit native-emission policy, JSON file type and root output file are required",
        ));
    }
    let base = base.unwrap();
    let url = parse_abs(
        base,
        "TYPESPEC_PROJECTION_POLICY",
        "Retrieval base must be an absolute HTTP(S) directory without query or fragment",
        ctx,
    )?;
    let raw = base.to_utf8().map_err(|_| {
        e(
            "TYPESPEC_PROJECTION_POLICY",
            "Retrieval base must be an absolute HTTP(S) directory without query or fragment",
        )
    })?;
    if !["http", "https"].contains(&url.scheme())
        || url.query().is_some()
        || url.fragment().is_some()
        || raw.contains('#')
        || !url.path().ends_with('/')
    {
        return Err(e(
            "TYPESPEC_PROJECTION_POLICY",
            "Retrieval base must be an absolute HTTP(S) directory without query or fragment",
        ));
    }
    Ok(())
}
pub fn prepare_typespec(
    source: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_typespec_policy(policy, ctx)?;
    Ok(obj(vec![
        ("source", copy_json(source, ctx)?),
        ("policy", copy_json(policy, ctx)?),
    ]))
}
fn encode_segment(segment: &str) -> String {
    let mut out = String::new();
    for b in segment.bytes() {
        if b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            out.push(b as char)
        } else {
            out.push('%');
            out.push_str(&format!("{b:02X}"));
        }
    }
    out
}
fn typespec_resource_uri(
    base: &url::Url,
    file: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    ctx.charge_work(
        file.len().saturating_mul(4).saturating_add(1),
        Utf16::default(),
    )?;
    if !file.ends_with(".json")
        || file.starts_with('/')
        || file
            .split('/')
            .any(|x| x.is_empty() || x == "." || x == "..")
    {
        return Err(e(
            "TYPESPEC_OUTPUT_RESOURCE",
            "Output file cannot be registered as a JSON resource",
        ));
    }
    let encoded = file
        .split('/')
        .map(encode_segment)
        .collect::<Vec<_>>()
        .join("/");
    base.join(&encoded).map(|url| url.to_string()).map_err(|_| {
        e(
            "TYPESPEC_OUTPUT_RESOURCE",
            "Output file cannot be registered as a JSON resource",
        )
    })
}
pub fn complete_typespec(
    source: &Value,
    policy: &Value,
    emission: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_typespec_policy(policy, ctx)?;
    if member(emission, "source") != Some(source) {
        return Err(e(
            "TYPESPEC_HOST_RESPONSE",
            "Emitter response source does not match the projection source",
        ));
    }
    let mut issues=vec![issue("TYPESPEC_UNREVIEWED_SEMANTICS","not-enforced","Native emission has no exhaustive per-concept fidelity audit. Source operations, decorators and runtime semantics are not guaranteed in target validation. This is not an instance converter."),issue("TYPESPEC_NUMERIC_PRECISION","representation-change","Pinned native emitter can round exact numeric literals; int64-strategy does not prevent this. Original source retains exact values."),issue("TYPESPEC_INT64_CONSTRAINTS","not-enforced","Pinned native emitter omits int64/uint64 bounds and string numeric syntax constraints. These are global risks, not per-source findings.")];
    let mut result = vec![
        (k("status"), s("blocked")),
        (k("source"), copy_json(source, ctx)?),
        (k("policy"), copy_json(policy, ctx)?),
        (k("complete"), Value::Bool(false)),
        (k("emission"), copy_json(emission, ctx)?),
        (k("issues"), Value::Array(Vec::new())),
        (k("resources"), Value::Array(Vec::new())),
    ];
    let Some(Value::String(status)) = member(emission, "status") else {
        return Err(e("TYPESPEC_HOST_RESPONSE", "Emitter status is required"));
    };
    if status.to_utf8().ok().as_deref() != Some("emitted") {
        let st = status.to_utf8().unwrap_or_else(|_| "unknown".into());
        issues.push(issue(
            "TYPESPEC_EMISSION_UNAVAILABLE",
            "unsupported",
            &format!("Native emission is {st}"),
        ));
    } else if utf8(member(policy, "lossPolicy")).as_deref() == Some("strict") {
        // Strict policy is a refusal after retaining the native emission report.
    } else {
        let Some(Value::Object(emitted_files)) = member(emission, "files") else {
            return Err(e(
                "TYPESPEC_HOST_RESPONSE",
                "Emitter files must be an object",
            ));
        };
        let Some(root_file) = utf8(member(policy, "rootFile")) else {
            return Err(e(
                "TYPESPEC_PROJECTION_POLICY",
                "Root output file must be text",
            ));
        };
        let Some((_, Value::String(root_source))) = emitted_files
            .iter()
            .find(|(file, _)| file.to_utf8().ok().as_deref() == Some(root_file.as_str()))
        else {
            issues.push(issue(
                "TYPESPEC_ROOT_UNAVAILABLE",
                "unsupported",
                "Selected root output file is absent",
            ));
            result[0].1 = s("blocked");
            result[5].1 = Value::Array(issues);
            return Ok(Value::Object(result));
        };
        let base = text(member(policy, "retrievalBase"))
            .ok_or_else(|| e("TYPESPEC_PROJECTION_POLICY", "Retrieval base is required"))?;
        let base_url = parse_abs(
            base,
            "TYPESPEC_PROJECTION_POLICY",
            "Invalid retrieval base",
            ctx,
        )?;
        let mut resources = Vec::new();
        let mut resource_sources = Vec::new();
        let mut root_uri = String::new();
        for (file, value) in emitted_files {
            ctx.charge_work(file.len().saturating_add(1), Utf16::default())?;
            let (Some(file_text), Value::String(contents)) = (file.to_utf8().ok(), value) else {
                return Err(e(
                    "TYPESPEC_HOST_RESPONSE",
                    "Emitter files and values must be valid text",
                ));
            };
            let uri = match typespec_resource_uri(&base_url, &file_text, ctx) {
                Ok(uri) => uri,
                Err(error) if error.is_control_failure() || error.code == "LIMIT" => {
                    return Err(error)
                }
                Err(_) => {
                    issues.push(issue(
                        "TYPESPEC_OUTPUT_RESOURCE",
                        "unsupported",
                        &format!(
                            "Output file cannot be registered as a JSON resource: {file_text}"
                        ),
                    ));
                    result[0].1 = s("blocked");
                    result[5].1 = Value::Array(issues);
                    result[6].1 = Value::Array(resources);
                    return Ok(Value::Object(result));
                }
            };
            resources.push(obj(vec![
                ("file", s(&file_text)),
                ("retrievalUri", s(&uri)),
            ]));
            if file_text == root_file {
                root_uri = uri;
            } else {
                resource_sources.push((Utf16::from(uri), contents.units().to_vec()));
            }
        }
        result[6].1 = Value::Array(resources);
        let Some(id) = text(member(policy, "id")) else {
            return Err(e("TYPESPEC_PROJECTION_POLICY", "ID required"));
        };
        match json_schema_adapter::import_json_schema(
            root_source.units(),
            id,
            &Utf16::from(root_uri),
            &resource_sources,
            ctx,
        ) {
            Ok(target) => {
                let validation = json_schema_adapter::inspect_json_schema(&target, ctx)?;
                for diagnostic in validation.diagnostics.iter().cloned() {
                    let class = if diagnostic.severity == crate::error::Severity::Error {
                        "unsupported"
                    } else {
                        "not-enforced"
                    };
                    issues.push(diagnostic_issue(diagnostic, class));
                }
                if validation.valid {
                    result[0].1 = s("projected");
                    result.push((k("target"), target));
                } else {
                    issues.push(issue(
                        "TYPESPEC_TARGET_INVALID",
                        "unsupported",
                        "Generated target failed JSON Schema validation",
                    ));
                }
            }
            Err(error) if !error.is_control_failure() && error.code != "LIMIT" => {
                issues.push(issue(
                    "TYPESPEC_TARGET_INVALID",
                    "unsupported",
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid generated JSON Schema".to_owned()),
                ))
            }
            Err(error) => return Err(error),
        }
    }
    result[5].1 = Value::Array(issues);
    Ok(Value::Object(result))
}
fn schema_pointer_set(positions: &[SchemaPosition]) -> BTreeSet<Utf16> {
    positions.iter().map(|x| x.pointer.clone()).collect()
}
fn decode_pointer(uri: &str) -> Option<String> {
    let raw = uri.strip_prefix('#')?;
    let bytes = raw.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let h = *bytes.get(i + 1)?;
            let l = *bytes.get(i + 2)?;
            let digit = |x: u8| match x {
                b'0'..=b'9' => Some(x - b'0'),
                b'a'..=b'f' => Some(x - b'a' + 10),
                b'A'..=b'F' => Some(x - b'A' + 10),
                _ => None,
            };
            out.push(digit(h)? * 16 + digit(l)?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}
fn native_truthy(value: &NativeJsonNode) -> bool {
    match value {
        NativeJsonNode::Null | NativeJsonNode::Boolean(false) => false,
        NativeJsonNode::String(value) => !value.is_empty(),
        NativeJsonNode::Number(value) => value.parse::<f64>().map_or(true, |number| number != 0.0),
        NativeJsonNode::Boolean(true) | NativeJsonNode::Array(_) | NativeJsonNode::Object(_) => {
            true
        }
    }
}
fn schema_refs(
    document: &Value,
    positions: &[SchemaPosition],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let set = schema_pointer_set(positions);
    for position in positions {
        let NativeJsonNode::Object(members) = position.node.root() else {
            continue;
        };
        for name in ["$id", "$dynamicRef"] {
            let value = members
                .iter()
                .find(|(member, _)| member == &k(name))
                .map(|(_, value)| value);
            if value.is_some_and(native_truthy) {
                return Err(e("SMITHY_EMISSION_REFERENCES", "This native profile does not support nested resource or dynamic-reference semantics"));
            }
        }
        let Some((_, reference_node)) = members.iter().find(|(member, _)| member == &k("$ref"))
        else {
            continue;
        };
        let NativeJsonNode::String(reference) = reference_node else {
            return Err(e(
                "SMITHY_EMISSION_REFERENCES",
                "Native-profile references must be local JSON pointers",
            ));
        };
        let uri = reference.to_utf8().map_err(|_| {
            e(
                "SMITHY_EMISSION_REFERENCES",
                "Native-profile references must be local JSON pointers",
            )
        })?;
        if !uri.starts_with('#') {
            return Err(e(
                "SMITHY_EMISSION_REFERENCES",
                "Native-profile references must be local JSON pointers",
            ));
        }
        let path = decode_pointer(&uri).ok_or_else(|| {
            e(
                "SMITHY_EMISSION_REFERENCES",
                "Native-profile references must be valid encoded JSON pointers",
            )
        })?;
        if !set.contains(&Utf16::from(path.as_str())) {
            return Err(e(
                "SMITHY_EMISSION_REFERENCES",
                "Reference target is not a schema position",
            ));
        }
        let resolved =
            json_schema_adapter::get_json_schema_node(document, &Utf16::from(path), ctx)?;
        if !matches!(
            resolved.root(),
            NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
        ) {
            return Err(e(
                "SMITHY_EMISSION_REFERENCES",
                "Reference target is not a schema",
            ));
        }
    }
    Ok(())
}
fn validate_smithy_policy(policy: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    allowed(
        policy,
        &[
            "id",
            "baseUri",
            "rootShape",
            "profile",
            "serviceContext",
            "usage",
            "lossPolicy",
        ],
        "SMITHY_PROJECTION_POLICY",
        "Explicit native emission profile, root shape and loss policy are required",
    )?;
    let id = utf8(member(policy, "id"));
    let base = text(member(policy, "baseUri"));
    let root = utf8(member(policy, "rootShape"));
    let profile = utf8(member(policy, "profile"));
    let usage = utf8(member(policy, "usage"));
    let loss = utf8(member(policy, "lossPolicy"));
    if id.as_deref().unwrap_or("").is_empty()
        || base.is_none()
        || root.as_deref().unwrap_or("").is_empty()
        || !matches!(
            profile.as_deref(),
            Some(
                "native-defaults-2020-12"
                    | "native-root-definition-2020-12"
                    | "native-service-context-2020-12"
            )
        )
        || usage.as_deref() != Some("native-emission")
        || !matches!(loss.as_deref(), Some("strict" | "allow-reported-loss"))
    {
        return Err(e(
            "SMITHY_PROJECTION_POLICY",
            "Explicit native emission profile, root shape and loss policy are required",
        ));
    }
    let context = text(member(policy, "serviceContext"));
    if (profile.as_deref() == Some("native-service-context-2020-12")
        && context.is_none_or(|x| x.is_empty()))
        || (profile.as_deref() != Some("native-service-context-2020-12") && context.is_some())
    {
        return Err(e(
            "SMITHY_PROJECTION_POLICY",
            "Service context is required only for the service-context profile",
        ));
    }
    parse_abs(
        base.unwrap(),
        "SMITHY_PROJECTION_POLICY",
        "An absolute retrieval URI is required",
        ctx,
    )?;
    Ok(())
}
pub fn prepare_smithy(
    source: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_smithy_policy(policy, ctx)?;
    let id = text(member(policy, "id")).unwrap();
    Ok(obj(vec![
        ("source", copy_json(source, ctx)?),
        ("policy", copy_json(policy, ctx)?),
        (
            "assemblyId",
            s(&format!(
                "{}-assembled",
                id.to_utf8()
                    .map_err(|_| e("SMITHY_PROJECTION_POLICY", "ID must be text"))?
            )),
        ),
    ]))
}
pub fn complete_smithy(
    source: &Value,
    policy: &Value,
    assembly: &Value,
    raw: Option<&Value>,
    adapted: Option<&Value>,
    host_failure: Option<&Value>,
    service_capability: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_smithy_policy(policy, ctx)?;
    let mut issues=vec![issue("SMITHY_UNREVIEWED_SEMANTICS","not-enforced","Native data-shape conversion does not preserve all traits, operations, resources, protocols or source-domain validation. This is not an instance converter."),issue("SMITHY_NATIVE_NUMERIC_MAPPING","representation-change","Native defaults map integer shapes to JSON number and do not guarantee native width/precision constraints; timestamps, blobs and unions use native JSON representation strategies.")];
    let mut out = vec![
        (k("status"), s("blocked")),
        (
            k("converter"),
            copy_json(member(assembly, "compiler").unwrap_or(&Value::Null), ctx)?,
        ),
        (k("source"), copy_json(source, ctx)?),
        (k("assembly"), copy_json(assembly, ctx)?),
        (k("policy"), copy_json(policy, ctx)?),
        (k("complete"), Value::Bool(false)),
        (k("issues"), Value::Array(Vec::new())),
    ];
    if utf8(member(assembly, "status")).as_deref() != Some("assembled") {
        issues.push(issue(
            "SMITHY_ASSEMBLY_UNAVAILABLE",
            "unsupported",
            "Source assembly failed",
        ));
        out[6].1 = Value::Array(issues);
        return Ok(Value::Object(out));
    }
    let profile = utf8(member(policy, "profile")).unwrap_or_default();
    if profile == "native-service-context-2020-12" {
        issues.push(issue("SMITHY_SERVICE_CONTEXT","representation-change","The selected native service closure and its declared renames determine definition pointers; original qualified identities remain in source. This does not convert service operations."));
    }
    if let Some(Value::String(failure)) = host_failure {
        issues.push(issue(
            "SMITHY_EMISSION_FAILED",
            "unsupported",
            &failure
                .to_utf8()
                .unwrap_or_else(|_| "Native JSON Schema emission failed".into()),
        ));
        out[6].1 = Value::Array(issues);
        return Ok(Value::Object(out));
    }
    let Some(Value::String(raw_schema)) = raw else {
        issues.push(issue(
            "SMITHY_EMISSION_FAILED",
            "unsupported",
            "Native JSON Schema emission is unavailable",
        ));
        out[6].1 = Value::Array(issues);
        return Ok(Value::Object(out));
    };
    if raw_schema.len() > 1_000_000 {
        issues.push(issue(
            "SMITHY_EMISSION_FAILED",
            "unsupported",
            "Expected bounded native JSON Schema text",
        ));
        out[6].1 = Value::Array(issues);
        return Ok(Value::Object(out));
    }
    out.push((k("nativeSchema"), Value::String(raw_schema.clone())));
    let selected = if profile == "native-root-definition-2020-12"
        || profile == "native-service-context-2020-12"
    {
        let Some(Value::String(value)) = adapted else {
            issues.push(issue(
                "SMITHY_EMISSION_FAILED",
                "unsupported",
                "Backend does not support selected root-definition emission",
            ));
            out[6].1 = Value::Array(issues);
            return Ok(Value::Object(out));
        };
        if value.len() > 1_000_000 {
            issues.push(issue(
                "SMITHY_EMISSION_FAILED",
                "unsupported",
                "Expected bounded adapted JSON Schema text",
            ));
            out[6].1 = Value::Array(issues);
            return Ok(Value::Object(out));
        }
        out.push((k("adaptedSchema"), Value::String(value.clone())));
        issues.push(issue("SMITHY_ROOT_DEFINITION_ADDED","representation-change","The emitted root schema is also registered at the native converter root pointer. Original native output is retained separately. Instance-valued keywords are unchanged."));
        value
    } else {
        raw_schema
    };
    let id = text(member(policy, "id")).unwrap();
    let uri = text(member(policy, "baseUri")).unwrap();
    let target = match json_schema_adapter::import_json_schema(selected.units(), id, uri, &[], ctx)
    {
        Ok(value) => value,
        Err(error) if !error.is_control_failure() => {
            issues.push(issue(
                "SMITHY_EMISSION_FAILED",
                "unsupported",
                &error
                    .message
                    .to_utf8()
                    .unwrap_or_else(|_| "Invalid generated JSON Schema".into()),
            ));
            out[6].1 = Value::Array(issues);
            return Ok(Value::Object(out));
        }
        Err(error) => return Err(error),
    };
    let positions = json_schema_adapter::walk_json_schema(&target, ctx)?;
    if let Err(error) = schema_refs(&target, &positions, ctx) {
        if error.is_control_failure() || error.code == "LIMIT" {
            return Err(error);
        }
        issues.push(issue(
            "SMITHY_EMISSION_REFERENCES",
            "unsupported",
            &error
                .message
                .to_utf8()
                .unwrap_or_else(|_| "Unsupported emitted reference".into()),
        ));
        out[6].1 = Value::Array(issues);
        return Ok(Value::Object(out));
    }
    let validation = json_schema_adapter::inspect_json_schema(&target, ctx)?;
    for diagnostic in validation.diagnostics.iter().cloned() {
        let unsupported = diagnostic.severity == crate::error::Severity::Error
            || diagnostic.code.to_utf8().ok().as_deref() == Some("JSON_SCHEMA_COMPILE");
        issues.push(diagnostic_issue(
            diagnostic,
            if unsupported {
                "unsupported"
            } else {
                "not-enforced"
            },
        ));
    }
    if !validation.valid
        || issues
            .iter()
            .any(|x| utf8(member(x, "code")).as_deref() == Some("JSON_SCHEMA_COMPILE"))
        || utf8(member(policy, "lossPolicy")).as_deref() == Some("strict")
    {
        out[6].1 = Value::Array(issues);
        return Ok(Value::Object(out));
    }
    out[0].1 = s("projected");
    out[6].1 = Value::Array(issues);
    out.push((k("target"), target));
    Ok(Value::Object(out))
}
