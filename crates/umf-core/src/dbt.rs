// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact dbt manifest, artifact, semantic-manifest preservation and bounded
//! dependency inspection. Native JSON remains authoritative; shape and graph
//! reports are deliberately incomplete interpretations.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{native_pointer, NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

pub const DBT_MANIFEST_EXTENSION: &str = "umf.dbt.manifest";
pub const DBT_ARTIFACT_EXTENSION: &str = "umf.dbt.artifact";
pub const DBT_SEMANTIC_MANIFEST_EXTENSION: &str = "umf.dbt.semantic";
const CORE_VERSION: &str = "0.10.0";
const EXTENSION_VERSION: &str = "0.1.0";
const MANIFEST_V12: &str = "https://schemas.getdbt.com/dbt/manifest/v12.json";
const ARTIFACT_SCHEMAS: &[(&str, &str)] = &[
    (
        "https://schemas.getdbt.com/dbt/run-results/v6.json",
        "run_results",
    ),
    ("https://schemas.getdbt.com/dbt/catalog/v1.json", "catalog"),
    ("https://schemas.getdbt.com/dbt/sources/v3.json", "sources"),
];

#[derive(Clone, Debug, PartialEq)]
pub struct DbtSelection {
    pub source: Value,
    pub selection: Value,
}

/// Prepared DBT resources. Construct once per binding instance; each call
/// still receives its own Context and the caller owns TransportUsage carry.
pub struct DbtRuntime {
    engine: Engine,
    registry: Registry,
    manifest_native: CompiledSchema,
    artifact_native: Vec<(Utf16, CompiledSchema)>,
    semantic_native: CompiledSchema,
}

impl DbtRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let source = text.encode_utf16().collect::<Vec<_>>();
            ctx.charge_text(source.len(), Utf16::default())?;
            serialization::read_json_value(&source, Format::Json, ctx)
        }
        let engine = Engine::new(
            ResourceSet::new(
                resource(include_str!("../../../spec/core/schema.json"), ctx)?,
                resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                resource(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                resource(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                resource(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        for (manifest, token) in [
            (
                include_str!("../../../spec/extensions/dbt-manifest/package.json"),
                1,
            ),
            (
                include_str!("../../../spec/extensions/dbt-artifact/package.json"),
                2,
            ),
            (
                include_str!("../../../spec/extensions/dbt-semantic/package.json"),
                3,
            ),
        ] {
            let manifest = resource(manifest, ctx)?;
            registry.register(
                &manifest,
                Some(token),
                engine.package_schema(),
                &schema_resources,
                ctx,
            )?;
        }
        let manifest_native = compile_schema(
            include_str!("../../../spec/extensions/dbt-manifest/native-schema.json"),
            &schema_resources,
            ctx,
        )?;
        let artifact_native = vec![
            (
                Utf16::from(ARTIFACT_SCHEMAS[0].0),
                compile_schema(
                    include_str!(
                        "../../../spec/extensions/dbt-artifact/run-results-v6-schema.json"
                    ),
                    &schema_resources,
                    ctx,
                )?,
            ),
            (
                Utf16::from(ARTIFACT_SCHEMAS[1].0),
                compile_schema(
                    include_str!("../../../spec/extensions/dbt-artifact/catalog-v1-schema.json"),
                    &schema_resources,
                    ctx,
                )?,
            ),
            (
                Utf16::from(ARTIFACT_SCHEMAS[2].0),
                compile_schema(
                    include_str!("../../../spec/extensions/dbt-artifact/sources-v3-schema.json"),
                    &schema_resources,
                    ctx,
                )?,
            ),
        ];
        let semantic_native = compile_schema(
            include_str!("../../../spec/extensions/dbt-semantic/native-schema.json"),
            &schema_resources,
            ctx,
        )?;
        Ok(Self {
            engine,
            registry,
            manifest_native,
            artifact_native,
            semantic_native,
        })
    }
}

fn compile_schema(
    source: &str,
    resources: &SchemaResources,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    let schema = read_json(source, ctx)?;
    CompiledSchema::compile_consumer(&schema, resources, false, ctx)
}

fn read_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = source.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), Utf16::default())?;
    serialization::read_json_value(&units, Format::Json, ctx)
}

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn array(values: Vec<Value>) -> Value {
    Value::Array(values)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn key(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}
fn text(value: &Value) -> Option<&Utf16> {
    if let Value::String(v) = value {
        Some(v)
    } else {
        None
    }
}
fn list(value: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = value {
        Some(v)
    } else {
        None
    }
}
fn is_object(value: &Value) -> bool {
    matches!(value, Value::Object(_))
}
fn append_pointer(
    path: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let added = 1usize.saturating_add(
        segment
            .units()
            .iter()
            .map(|unit| if *unit == 126 || *unit == 47 { 2 } else { 1 })
            .sum::<usize>(),
    );
    ctx.charge_work(added, path.clone())?;
    let mut out = path.units().to_vec();
    out.push(47);
    for unit in segment.units() {
        match unit {
            126 => out.extend([126, 48]),
            47 => out.extend([126, 49]),
            u => out.push(*u),
        }
    }
    Ok(Utf16::new(out))
}
fn diagnostic(code: &str, path: Utf16, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path,
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn diagnostic_utf16(code: &str, path: Utf16, message: Utf16, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path,
        python_source_path: false,
        message,
        severity,
        python_text_origin: None,
    }
}
fn message_with_id(
    prefix: &str,
    id: &Utf16,
    suffix: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let prefix_len = prefix.encode_utf16().count();
    let suffix_len = suffix.encode_utf16().count();
    ctx.charge_work(
        prefix_len
            .saturating_add(id.len())
            .saturating_add(suffix_len),
        Utf16::default(),
    )?;
    let prefix = prefix.encode_utf16().collect::<Vec<_>>();
    let suffix = suffix.encode_utf16().collect::<Vec<_>>();
    let mut units = prefix;
    units.extend_from_slice(id.units());
    units.extend(suffix);
    Ok(Utf16::new(units))
}
fn native_to_value(
    node: &NativeJsonNode,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, path.clone())?;
    Ok(match node {
        NativeJsonNode::Null => Value::Null,
        NativeJsonNode::Boolean(v) => Value::Bool(*v),
        NativeJsonNode::String(v) => {
            ctx.charge_work(v.len(), path.clone())?;
            Value::String(v.clone())
        }
        NativeJsonNode::Number(v) => {
            ctx.charge_work(v.len(), path.clone())?;
            Value::Number(v.parse::<f64>().unwrap_or(f64::INFINITY))
        }
        NativeJsonNode::Array(items) => Value::Array(
            items
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    let child = append_pointer(path, &key(&i.to_string()), ctx)?;
                    native_to_value(v, &child, ctx)
                })
                .collect::<Result<_, _>>()?,
        ),
        NativeJsonNode::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(k, v)| {
                    let child = append_pointer(path, k, ctx)?;
                    native_to_value(v, &child, ctx).map(|value| (k.clone(), value))
                })
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

struct DbtCallbacks<'a> {
    runtime: &'a DbtRuntime,
}
impl Capabilities for DbtCallbacks<'_> {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        let operation_context = context;
        let _ = operation_context;
        let mut ctx = Context::ordinary();
        inspect_payload(self.runtime, token, payload, &mut ctx).map_err(|e| e.message)
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        let _ = context;
        inspect_payload(self.runtime, token, payload, ctx).map_err(CapabilityError::Engine)
    }
}

fn validate(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    runtime.engine.validate_document(
        document,
        &runtime.registry,
        &mut DbtCallbacks { runtime },
        ctx,
    )
}
fn require_valid(
    runtime: &DbtRuntime,
    document: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let report = validate(runtime, document, ctx)?;
    if report.valid {
        Ok(report)
    } else {
        let diagnostics = Value::Array(report.diagnostics.iter().map(diagnostic_value).collect());
        Err(EngineError::new(
            code,
            Utf16::default(),
            serialization::stringify_compact(&diagnostics)?,
        ))
    }
}
fn diagnostic_value(d: &Diagnostic) -> Value {
    let severity = s(match d.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    });
    let before_message = [
        "DBT_MANIFEST_CONTEXT",
        "DBT_ARTIFACT_CONTEXT",
        "DBT_SEMANTIC_MANIFEST_CONTEXT",
        "DBT_MANIFEST_GRAPH_INCOMPLETE",
        "DBT_SELECTION_ROOT",
        "DBT_SELECTION_CONTEXT",
    ]
    .iter()
    .any(|code| d.code == key(code));
    let mut fields = vec![
        ("code", Value::String(d.code.clone())),
        ("path", Value::String(d.path.clone())),
    ];
    if before_message {
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
    obj(fields)
}

/// Preserve the predecessor's complete validation DTO and diagnostic ordering.
pub fn validation_to_value(report: &Validation) -> Value {
    obj(vec![
        ("valid", Value::Bool(report.valid)),
        ("complete", Value::Bool(report.complete)),
        (
            "diagnostics",
            Value::Array(report.diagnostics.iter().map(diagnostic_value).collect()),
        ),
    ])
}

fn inspect_payload(
    runtime: &DbtRuntime,
    token: u64,
    payload: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let (profile,context_code,representation_code,structure_code,version_code,native_code,truncate_code,context_message)=match token {
        1=>("dbt-manifest-json","DBT_MANIFEST_CONTEXT","DBT_MANIFEST_REPRESENTATION","DBT_MANIFEST_STRUCTURE","DBT_MANIFEST_VERSION","DBT_MANIFEST_NATIVE_SCHEMA","DBT_MANIFEST_DIAGNOSTICS_TRUNCATED","Native schema shapes do not establish graph/SQL/Jinja validity, format constraints or exact-number constraints beyond JS precision"),
        2=>("dbt-artifact-json","DBT_ARTIFACT_CONTEXT","DBT_ARTIFACT_REPRESENTATION","DBT_ARTIFACT_STRUCTURE","DBT_ARTIFACT_VERSION","DBT_ARTIFACT_NATIVE_SCHEMA","DBT_ARTIFACT_DIAGNOSTICS_TRUNCATED","Native shapes do not establish execution outcomes, warehouse state, artifact correlation, format constraints or exact-number constraints beyond JS precision"),
        3=>("dbt-semantic-json","DBT_SEMANTIC_MANIFEST_CONTEXT","DBT_SEMANTIC_MANIFEST_REPRESENTATION","DBT_SEMANTIC_MANIFEST_STRUCTURE","DBT_SEMANTIC_MANIFEST_VERSION","DBT_SEMANTIC_MANIFEST_NATIVE_SCHEMA","DBT_SEMANTIC_MANIFEST_DIAGNOSTICS_TRUNCATED","Derived nullable shapes do not establish semantic rule validity, metric execution, joins, SQL semantics, parser coercion/defaults or exact-number constraints beyond JS precision"),
        _=>return Err(err("DBT_RUNTIME","Unknown DBT package token")),
    };
    let mut diagnostics = vec![diagnostic(
        context_code,
        Utf16::default(),
        context_message,
        Severity::Warning,
    )];
    let profile_value = member(payload, "profile");
    if text(profile_value.unwrap_or(&Value::Null)).is_some_and(|v| v != &Utf16::from(profile)) {
        diagnostics.push(diagnostic(
            structure_code,
            Utf16::from("/profile"),
            "Unexpected DBT payload profile",
            Severity::Error,
        ));
    }
    if let Value::Object(fields) = payload {
        let mut unknown = false;
        for (name, _) in fields {
            ctx.charge_work(1, name.clone())?;
            if name != &key("profile") && name != &key("root") {
                unknown = true;
            }
        }
        if unknown {
            diagnostics.push(diagnostic(
                representation_code,
                Utf16::default(),
                "Unknown representation fields remain in UMF",
                Severity::Warning,
            ));
        }
    }
    let root = member(payload, "root").ok_or_else(|| err(structure_code, "Missing native root"))?;
    let tree = NativeJsonTree::from_tagged_value(root, ctx)?;
    inspect_tagged_representation(
        root,
        &Utf16::default(),
        representation_code,
        &mut diagnostics,
        ctx,
    )?;
    let native_value = native_to_value(tree.root(), &Utf16::default(), ctx)?;
    let (known, version_path) = if token == 3 {
        if !matches!(tree.root(), NativeJsonNode::Object(_)) {
            diagnostics.push(diagnostic(
                structure_code,
                Utf16::default(),
                "Expected semantic manifest object",
                Severity::Error,
            ));
            return Ok(diagnostics);
        }
        let version =
            native_path_value(&native_value, "/project_configuration/dsi_package_version");
        let known = version.is_some_and(|_| {
            ["major_version", "minor_version", "patch_version"]
                .iter()
                .zip(["0", "8", "5"])
                .all(|(k, w)| {
                    native_path_value(
                        &native_value,
                        &format!("/project_configuration/dsi_package_version/{k}"),
                    )
                    .and_then(text)
                        == Some(&Utf16::from(w))
                })
        });
        (known, "/project_configuration/dsi_package_version")
    } else {
        let version = native_path_value(&native_value, "/metadata/dbt_schema_version");
        if text(version.unwrap_or(&Value::Null)).is_none() {
            let message = if token == 1 {
                "Expected manifest object with metadata object and schema version string"
            } else {
                "Expected artifact object with metadata object and schema version string"
            };
            diagnostics.push(diagnostic(
                structure_code,
                Utf16::from("/metadata/dbt_schema_version"),
                message,
                Severity::Error,
            ));
            return Ok(diagnostics);
        }
        let known = if token == 1 {
            text(version.unwrap()).is_some_and(|v| v == &Utf16::from(MANIFEST_V12))
        } else {
            ARTIFACT_SCHEMAS
                .iter()
                .any(|(v, _)| text(version.unwrap()) == Some(&Utf16::from(*v)))
        };
        (known, "/metadata/dbt_schema_version")
    };
    if !known {
        let message = match token {
            1 | 2 => "Unknown artifact version preserved without interpretation",
            3 => "Missing or unknown DSI version preserved without interpretation",
            _ => unreachable!(),
        };
        diagnostics.push(diagnostic(
            version_code,
            Utf16::from(version_path),
            message,
            Severity::Warning,
        ));
        return Ok(diagnostics);
    }
    let schema = match token {
        1 => &runtime.manifest_native,
        2 => {
            let version = native_path_value(&native_value, "/metadata/dbt_schema_version")
                .and_then(text)
                .unwrap()
                .to_utf8()
                .unwrap_or_default();
            let index = ARTIFACT_SCHEMAS
                .iter()
                .position(|(v, _)| *v == version)
                .unwrap();
            &runtime.artifact_native[index].1
        }
        3 => &runtime.semantic_native,
        _ => unreachable!(),
    };
    let native_errors = schema.validate_native_json_codegen_errors(&native_value, ctx)?;
    for error in native_errors.iter().take(100) {
        diagnostics.push(diagnostic_utf16(
            native_code,
            error.instance_path.clone(),
            error.message.clone(),
            Severity::Warning,
        ));
    }
    if native_errors.len() > 100 {
        diagnostics.push(diagnostic(
            truncate_code,
            Utf16::default(),
            "More than 100 native schema diagnostics; first 100 retained",
            Severity::Warning,
        ));
    }
    Ok(diagnostics)
}

fn native_path_value<'a>(root: &'a Value, path: &str) -> Option<&'a Value> {
    let mut node = root;
    if path.is_empty() {
        return Some(node);
    }
    for segment in path.trim_start_matches('/').split('/') {
        let decoded = segment.replace("~1", "/").replace("~0", "~");
        node = match node {
            Value::Object(m) => m
                .iter()
                .find(|(k, _)| k.to_utf8().ok().as_deref() == Some(&decoded))
                .map(|(_, v)| v)?,
            Value::Array(items) => items.get(decoded.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(node)
}
fn inspect_tagged_representation(
    node: &Value,
    path: &Utf16,
    code: &str,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = node else {
        return Ok(());
    };
    let kind = member(node, "kind")
        .and_then(text)
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let known: &[&str] = match kind.as_str() {
        "null" => &["kind"],
        "boolean" | "string" | "number" => &["kind", "value"],
        "array" => &["kind", "items"],
        "object" => &["kind", "members"],
        _ => &["kind"],
    };
    let mut unknown = false;
    for (name, _) in fields {
        ctx.charge_work(1, path.clone())?;
        if !known.iter().any(|candidate| name == &key(candidate)) {
            unknown = true;
        }
    }
    if unknown {
        out.push(diagnostic(
            code,
            path.clone(),
            "Unknown tagged-tree fields remain in UMF",
            Severity::Warning,
        ));
    }
    match kind.as_str() {
        "object" => {
            if let Some(Value::Object(members)) = member(node, "members") {
                for (name, child) in members {
                    let child_path = append_pointer(path, name, ctx)?;
                    inspect_tagged_representation(child, &child_path, code, out, ctx)?;
                }
            }
        }
        "array" => {
            if let Some(Value::Array(items)) = member(node, "items") {
                for (i, child) in items.iter().enumerate() {
                    let child_path = append_pointer(path, &key(&i.to_string()), ctx)?;
                    inspect_tagged_representation(child, &child_path, code, out, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn extension_id(token: u64) -> &'static str {
    match token {
        1 => DBT_MANIFEST_EXTENSION,
        2 => DBT_ARTIFACT_EXTENSION,
        3 => DBT_SEMANTIC_MANIFEST_EXTENSION,
        _ => "",
    }
}
fn module_id(token: u64) -> &'static str {
    match token {
        1 => "manifest",
        2 => "artifact",
        3 => "semantic",
        _ => "",
    }
}
fn profile_id(token: u64) -> &'static str {
    match token {
        1 => "dbt-manifest-json",
        2 => "dbt-artifact-json",
        3 => "dbt-semantic-json",
        _ => "",
    }
}
fn error_prefix(token: u64) -> &'static str {
    match token {
        1 => "DBT_MANIFEST",
        2 => "DBT_ARTIFACT",
        3 => "DBT_SEMANTIC_MANIFEST",
        _ => "DBT",
    }
}

fn native_payload(
    runtime: &DbtRuntime,
    document: &Value,
    token: u64,
    ctx: &mut Context<'_>,
) -> Result<(Value, NativeJsonTree), EngineError> {
    require_valid(
        runtime,
        document,
        &format!("{}_DOCUMENT", error_prefix(token)),
        ctx,
    )?;
    let modules = list(member(document, "modules").unwrap_or(&Value::Null)).ok_or_else(|| {
        err(
            &format!("{}_PAYLOAD", error_prefix(token)),
            "Expected pinned dbt payload",
        )
    })?;
    let module = modules
        .iter()
        .find(|m| text(member(m, "id").unwrap_or(&Value::Null)) == Some(&key(module_id(token))))
        .ok_or_else(|| {
            err(
                &format!("{}_PAYLOAD", error_prefix(token)),
                "Expected pinned dbt payload",
            )
        })?;
    let elements = list(member(module, "elements").unwrap_or(&Value::Null)).ok_or_else(|| {
        err(
            &format!("{}_PAYLOAD", error_prefix(token)),
            "Expected pinned dbt payload",
        )
    })?;
    let element = elements
        .iter()
        .find(|e| text(member(e, "id").unwrap_or(&Value::Null)) == Some(&key(module_id(token))))
        .ok_or_else(|| {
            err(
                &format!("{}_PAYLOAD", error_prefix(token)),
                "Expected pinned dbt payload",
            )
        })?;
    let payload = member(
        member(element, "extensions").ok_or_else(|| {
            err(
                &format!("{}_PAYLOAD", error_prefix(token)),
                "Expected pinned dbt payload",
            )
        })?,
        &extension_id(token),
    )
    .ok_or_else(|| {
        err(
            &format!("{}_PAYLOAD", error_prefix(token)),
            "Expected pinned dbt payload",
        )
    })?;
    if text(member(payload, "profile").unwrap_or(&Value::Null)) != Some(&key(profile_id(token))) {
        return Err(err(
            &format!("{}_PAYLOAD", error_prefix(token)),
            "Expected pinned dbt payload",
        ));
    }
    let version = member(
        member(document, "vocabularies").unwrap_or(&Value::Null),
        extension_id(token),
    )
    .and_then(|v| member(v, "version"))
    .and_then(text);
    if version != Some(&key(EXTENSION_VERSION)) {
        return Err(err(
            &format!("{}_PAYLOAD", error_prefix(token)),
            "Expected pinned dbt payload",
        ));
    }
    let root = member(payload, "root").ok_or_else(|| {
        err(
            &format!("{}_PAYLOAD", error_prefix(token)),
            "Expected pinned dbt payload",
        )
    })?;
    Ok((
        copy_json(payload, ctx)?,
        NativeJsonTree::from_tagged_value(root, ctx)?,
    ))
}

fn write_payload_root(document: &mut Value, token: u64, root: Value) -> Result<(), EngineError> {
    let Value::Object(doc) = document else {
        return Err(err("DBT_EDIT", "Expected document object"));
    };
    let modules = doc
        .iter_mut()
        .find(|(k, _)| k == &key("modules"))
        .and_then(|(_, v)| {
            if let Value::Array(v) = v {
                Some(v)
            } else {
                None
            }
        })
        .ok_or_else(|| err("DBT_EDIT", "Expected modules"))?;
    let module = modules
        .iter_mut()
        .find(|m| text(member(m, "id").unwrap_or(&Value::Null)) == Some(&key(module_id(token))))
        .ok_or_else(|| err("DBT_EDIT", "Expected DBT module"))?;
    let elements = member_mut(module, "elements")
        .and_then(|v| {
            if let Value::Array(v) = v {
                Some(v)
            } else {
                None
            }
        })
        .ok_or_else(|| err("DBT_EDIT", "Expected DBT elements"))?;
    let element = elements
        .iter_mut()
        .find(|e| text(member(e, "id").unwrap_or(&Value::Null)) == Some(&key(module_id(token))))
        .ok_or_else(|| err("DBT_EDIT", "Expected DBT element"))?;
    let payload = member_mut(
        member_mut(element, "extensions")
            .ok_or_else(|| err("DBT_EDIT", "Expected DBT extensions"))?,
        extension_id(token),
    )
    .ok_or_else(|| err("DBT_EDIT", "Expected DBT extension"))?;
    if let Value::Object(fields) = payload {
        if let Some((_, target)) = fields.iter_mut().find(|(k, _)| k == &key("root")) {
            *target = root;
            return Ok(());
        }
    }
    Err(err("DBT_EDIT", "Expected DBT native root"))
}
fn member_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(k, _)| k == &key(name))
        .map(|(_, v)| v)
}

/// Validate a DBT import's source before observing a non-JSON host id.
/// This private binding stage preserves the predecessor's source-parse
/// precedence while leaving all document validation in the Rust kernel.
pub fn validate_import_source(source: &[u16], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let _ = NativeJsonTree::parse_json(source, ctx)?;
    Ok(())
}

fn import_native(
    runtime: &DbtRuntime,
    token: u64,
    text_source: &[u16],
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native_with_id(runtime, token, text_source, Some(Value::String(id.clone())), ctx)
}

fn import_native_with_id(
    runtime: &DbtRuntime,
    token: u64,
    text_source: &[u16],
    id: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::parse_json(text_source, ctx)?;
    let payload = obj(vec![
        ("profile", s(profile_id(token))),
        ("root", tree.tagged_value_preserving_extras(ctx)?),
    ]);
    let element = obj(vec![
        ("id", s(module_id(token))),
        ("extensions", obj(vec![(extension_id(token), payload)])),
    ]);
    let module = obj(vec![
        ("id", s(module_id(token))),
        ("namespace", s("")),
        ("elements", array(vec![element])),
    ]);
    let mut document_fields = vec![
        ("umf", s(CORE_VERSION)),
        (
            "vocabularies",
            obj(vec![(
                extension_id(token),
                obj(vec![("version", s(EXTENSION_VERSION))]),
            )]),
        ),
        ("modules", array(vec![module])),
    ];
    if let Some(id) = id {
        document_fields.insert(1, ("id", id));
    }
    let document = obj(document_fields);
    require_valid(
        runtime,
        &document,
        &format!("{}_DOCUMENT", error_prefix(token)),
        ctx,
    )?;
    Ok(document)
}
fn export_native(
    runtime: &DbtRuntime,
    token: u64,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let (payload, tree) = native_payload(runtime, document, token, ctx)?;
    if has_extra_payload_fields(&payload) || tree.has_representation_extras() {
        return Err(err(
            &format!("{}_EXPORT", error_prefix(token)),
            "Unknown representation fields cannot be discarded",
        ));
    }
    tree.render_compact(ctx)
}
fn has_extra_payload_fields(payload: &Value) -> bool {
    match payload {
        Value::Object(fields) => fields
            .iter()
            .any(|(k, _)| k != &key("profile") && k != &key("root")),
        _ => true,
    }
}

pub fn import_manifest(
    runtime: &DbtRuntime,
    text_source: &[u16],
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native(runtime, 1, text_source, id, ctx)
}
pub fn import_manifest_with_id(
    runtime: &DbtRuntime,
    text_source: &[u16],
    id: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native_with_id(runtime, 1, text_source, id, ctx)
}
pub fn export_manifest(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    export_native(runtime, 1, document, ctx)
}
pub fn inspect_manifest(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate(runtime, document, ctx)
}
pub fn get_manifest_node(
    runtime: &DbtRuntime,
    document: &Value,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, tree) = native_payload(runtime, document, 1, ctx)?;
    Ok(tree
        .subtree_clone(pointer, ctx)?
        .tagged_value_preserving_extras(ctx)?)
}
pub fn propose_manifest_node_edit(
    runtime: &DbtRuntime,
    document: &Value,
    pointer: &Utf16,
    replacement_source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    edit_native(runtime, 1, document, pointer, replacement_source, ctx)
}

pub fn import_artifact(
    runtime: &DbtRuntime,
    text_source: &[u16],
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native(runtime, 2, text_source, id, ctx)
}
pub fn import_artifact_with_id(
    runtime: &DbtRuntime,
    text_source: &[u16],
    id: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native_with_id(runtime, 2, text_source, id, ctx)
}
pub fn export_artifact(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    export_native(runtime, 2, document, ctx)
}
pub fn inspect_artifact(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate(runtime, document, ctx)
}
pub fn get_artifact_node(
    runtime: &DbtRuntime,
    document: &Value,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, tree) = native_payload(runtime, document, 2, ctx)?;
    Ok(tree
        .subtree_clone(pointer, ctx)?
        .tagged_value_preserving_extras(ctx)?)
}
pub fn propose_artifact_node_edit(
    runtime: &DbtRuntime,
    document: &Value,
    pointer: &Utf16,
    replacement_source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    edit_native(runtime, 2, document, pointer, replacement_source, ctx)
}

pub fn import_semantic_manifest(
    runtime: &DbtRuntime,
    text_source: &[u16],
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native(runtime, 3, text_source, id, ctx)
}
pub fn import_semantic_manifest_with_id(
    runtime: &DbtRuntime,
    text_source: &[u16],
    id: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_native_with_id(runtime, 3, text_source, id, ctx)
}
pub fn export_semantic_manifest(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    export_native(runtime, 3, document, ctx)
}
pub fn inspect_semantic_manifest(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate(runtime, document, ctx)
}
pub fn get_semantic_manifest_node(
    runtime: &DbtRuntime,
    document: &Value,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, tree) = native_payload(runtime, document, 3, ctx)?;
    Ok(tree
        .subtree_clone(pointer, ctx)?
        .tagged_value_preserving_extras(ctx)?)
}
pub fn propose_semantic_manifest_node_edit(
    runtime: &DbtRuntime,
    document: &Value,
    pointer: &Utf16,
    replacement_source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    edit_native(runtime, 3, document, pointer, replacement_source, ctx)
}

fn edit_native(
    runtime: &DbtRuntime,
    token: u64,
    document: &Value,
    pointer: &Utf16,
    replacement_source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let (_, tree) = native_payload(runtime, document, token, ctx)?;
    native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement_source, ctx)?;
    let candidate_tree = if pointer.is_empty() {
        replacement
    } else {
        tree.replace_node(pointer, &replacement, ctx)?
    };
    let mut candidate = copy_json(document, ctx)?;
    write_payload_root(
        &mut candidate,
        token,
        candidate_tree.tagged_value_preserving_extras(ctx)?,
    )?;
    let report = require_valid(
        runtime,
        &candidate,
        &format!("{}_DOCUMENT", error_prefix(token)),
        ctx,
    )?;
    Ok((candidate, report))
}

struct GraphNode<'a> {
    id: Utf16,
    collection: Utf16,
    value: &'a Value,
    path: Utf16,
}
fn pointer_child(
    path: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    append_pointer(path, segment, ctx)
}
fn graph_root(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let (_, tree) = native_payload(runtime, document, 1, ctx)?;
    let root = native_to_value(tree.root(), &Utf16::default(), ctx)?;
    let report = inspect_manifest(runtime, document, ctx)?;
    if !report.valid {
        return Err(err("DBT_MANIFEST_DOCUMENT", "Manifest document is invalid"));
    }
    Ok((root, report))
}
fn graph_error(diagnostics: &mut Vec<Diagnostic>, path: Utf16, message: &str) {
    diagnostics.push(diagnostic(
        "DBT_MANIFEST_GRAPH",
        path,
        message,
        Severity::Error,
    ));
}
fn graph_report_value(
    status: &str,
    nodes: Vec<Value>,
    edges: Vec<Value>,
    diagnostics: Vec<Diagnostic>,
) -> Value {
    obj(vec![
        ("status", s(status)),
        ("complete", Value::Bool(false)),
        ("nodes", array(nodes)),
        ("edges", array(edges)),
        (
            "diagnostics",
            array(diagnostics.iter().map(diagnostic_value).collect()),
        ),
    ])
}

/// Report explicit dbt manifest dependency occurrences. Edges point from a
/// dependent resource to the referenced dependency; no SQL/Jinja inference is attempted.
pub fn inspect_manifest_graph(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (root, admission) = graph_root(runtime, document, ctx)?;
    let mut diagnostics = admission.diagnostics;
    let mut nodes = Vec::<Value>::new();
    let mut edges = Vec::<Value>::new();
    let mut index = Vec::<GraphNode<'_>>::new();
    let version = native_path_value(&root, "/metadata/dbt_schema_version").and_then(text);
    if version != Some(&key(MANIFEST_V12)) {
        graph_error(
            &mut diagnostics,
            Utf16::from("/metadata/dbt_schema_version"),
            "Unknown version: dependency interpretation unavailable",
        );
        return Ok(graph_report_value("blocked", nodes, edges, diagnostics));
    }
    const RESOURCES: &[&str] = &[
        "nodes",
        "sources",
        "exposures",
        "metrics",
        "semantic_models",
        "saved_queries",
        "unit_tests",
    ];
    const INDEXED: &[&str] = &[
        "nodes",
        "sources",
        "exposures",
        "metrics",
        "semantic_models",
        "saved_queries",
        "unit_tests",
        "macros",
        "docs",
        "groups",
    ];
    let mut identities = BTreeSet::<Utf16>::new();
    let mut invalid = BTreeSet::<Utf16>::new();
    for collection_name in INDEXED {
        let collection = key(collection_name);
        let value = member(&root, collection_name).unwrap_or(&Value::Null);
        let Value::Object(entries) = value else {
            graph_error(
                &mut diagnostics,
                Utf16::from(format!("/{collection_name}")),
                "Expected resource dictionary",
            );
            continue;
        };
        for (id, resource) in entries {
            ctx.charge_work(
                id.len()
                    .saturating_add(collection_name.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            let path = pointer_child(&Utf16::from(format!("/{collection_name}")), id, ctx)?;
            nodes.push(obj(vec![
                ("id", Value::String(id.clone())),
                ("collection", s(collection_name)),
                ("path", Value::String(path.clone())),
            ]));
            if !is_object(resource) || member(resource, "unique_id").and_then(text) != Some(id) {
                graph_error(
                    &mut diagnostics,
                    pointer_child(&path, &key("unique_id"), ctx)?,
                    "Resource key must equal its declared unique_id",
                );
                identities.insert(id.clone());
                invalid.insert(id.clone());
                continue;
            }
            if !identities.insert(id.clone()) {
                graph_error(&mut diagnostics, path, "Duplicate active resource identity");
                invalid.insert(id.clone());
                continue;
            }
            ctx.charge_work(id.len().saturating_add(collection.len()), path.clone())?;
            index.push(GraphNode {
                id: id.clone(),
                collection: collection.clone(),
                value: resource,
                path,
            });
        }
    }
    index.retain(|entry| !invalid.contains(&entry.id));
    let mut resource_parents: Vec<(Utf16, Vec<Utf16>)> = Vec::new();
    let mut resource_children: Vec<(Utf16, Vec<Utf16>)> = Vec::new();
    for node in &nodes {
        let id = member(node, "id").and_then(text).unwrap();
        if RESOURCES
            .iter()
            .any(|name| member(node, "collection").and_then(text) == Some(&key(name)))
        {
            ctx.charge_work(
                resource_parents
                    .len()
                    .saturating_mul(id.len().saturating_add(1)),
                Utf16::default(),
            )?;
            if !resource_parents.iter().any(|(prior, _)| prior == id) {
                resource_parents.push((id.clone(), Vec::new()));
                resource_children.push((id.clone(), Vec::new()));
            }
        }
    }
    let mut index_by_id = BTreeMap::<Utf16, usize>::new();
    for (position, entry) in index.iter().enumerate() {
        ctx.charge_work(entry.id.len().saturating_add(1), entry.path.clone())?;
        index_by_id.insert(entry.id.clone(), position);
    }
    for entry in index.iter().filter(|entry| {
        INDEXED[..8]
            .iter()
            .any(|name| entry.collection == key(name))
    }) {
        let deps = member(&entry.value, "depends_on");
        if deps.is_none() {
            continue;
        }
        let deps = deps.unwrap();
        if !is_object(deps) {
            graph_error(
                &mut diagnostics,
                pointer_child(&entry.path, &key("depends_on"), ctx)?,
                "Expected dependency object",
            );
            continue;
        }
        for (field, kind) in [("nodes", "resource"), ("macros", "macro")] {
            let Some(values) = member(deps, field) else {
                continue;
            };
            let base = pointer_child(
                &pointer_child(&entry.path, &key("depends_on"), ctx)?,
                &key(field),
                ctx,
            )?;
            let Some(values) = list(values) else {
                graph_error(&mut diagnostics, base, "Expected dependency list");
                continue;
            };
            for (i, dependency) in values.iter().enumerate() {
                let path = pointer_child(&base, &key(&i.to_string()), ctx)?;
                let Some(target_id) = text(dependency) else {
                    graph_error(&mut diagnostics, path, "Expected dependency ID string");
                    continue;
                };
                let target = index_by_id
                    .get(target_id)
                    .filter(|_| !invalid.contains(target_id))
                    .and_then(|position| index.get(*position));
                let resolved = target.is_some_and(|target| {
                    if kind == "macro" {
                        target.collection == key("macros")
                    } else {
                        RESOURCES.iter().any(|name| target.collection == key(name))
                    }
                });
                edges.push(obj(vec![
                    ("dependent", Value::String(entry.id.clone())),
                    ("dependency", Value::String(target_id.clone())),
                    ("kind", s(kind)),
                    ("path", Value::String(path.clone())),
                    ("resolved", Value::Bool(resolved)),
                ]));
                if !resolved {
                    diagnostics.push(diagnostic_utf16(
                        "DBT_MANIFEST_GRAPH",
                        path,
                        message_with_id(
                            "Dependency has no unique active target of the expected kind: ",
                            target_id,
                            "",
                            ctx,
                        )?,
                        Severity::Error,
                    ));
                } else if kind == "resource" {
                    if let Some((_, parents)) =
                        resource_parents.iter_mut().find(|(id, _)| id == &entry.id)
                    {
                        if !parents.contains(target_id) {
                            parents.push(target_id.clone());
                        }
                        if let Some((_, children)) =
                            resource_children.iter_mut().find(|(id, _)| id == target_id)
                        {
                            if !children.contains(&entry.id) {
                                children.push(entry.id.clone());
                            }
                        }
                    }
                }
            }
        }
    }
    for (name, expected) in [
        ("parent_map", &resource_parents),
        ("child_map", &resource_children),
    ] {
        let map = member(&root, name).unwrap_or(&Value::Null);
        let Value::Object(entries) = map else {
            graph_error(
                &mut diagnostics,
                Utf16::from(format!("/{name}")),
                "Expected redundant dependency map",
            );
            continue;
        };
        for (id, actual) in entries {
            let path = pointer_child(&Utf16::from(format!("/{name}")), id, ctx)?;
            let Some((_, wanted)) = expected.iter().find(|(expected_id, _)| expected_id == id)
            else {
                graph_error(
                    &mut diagnostics,
                    path,
                    "Map entry is not an active graph resource",
                );
                continue;
            };
            let Some(actual) = list(actual) else {
                graph_error(&mut diagnostics, path, "Expected ID list");
                continue;
            };
            if actual.iter().any(|value| text(value).is_none()) {
                graph_error(&mut diagnostics, path, "Expected ID list");
                continue;
            }
            let actual_set: BTreeSet<Utf16> =
                actual.iter().filter_map(|v| text(v).cloned()).collect();
            let wanted_set: BTreeSet<Utf16> = wanted.iter().cloned().collect();
            if actual_set != wanted_set {
                graph_error(
                    &mut diagnostics,
                    path,
                    "Redundant map disagrees with explicit resource dependencies",
                );
            }
        }
        for (id, _) in expected {
            if !entries.iter().any(|(candidate, _)| candidate == id) {
                graph_error(
                    &mut diagnostics,
                    pointer_child(&Utf16::from(format!("/{name}")), id, ctx)?,
                    "Missing active resource map entry",
                );
            }
        }
    }
    diagnostics.push(diagnostic("DBT_MANIFEST_GRAPH_INCOMPLETE",Utf16::default(),"Explicit active references and redundant maps only; disabled alternatives, inferred SQL/Jinja references, group semantics, cycle legality and execution are not validated. Duplicate edge occurrences are retained.",Severity::Warning));
    let status = if diagnostics.iter().any(|d| d.severity == Severity::Error) {
        "blocked"
    } else {
        "checked"
    };
    Ok(graph_report_value(status, nodes, edges, diagnostics))
}

/// Select an upstream explicit-reference context while retaining a full deep
/// copy of the source document. This is metadata context, never a runnable subset.
pub fn select_manifest_dependencies(
    runtime: &DbtRuntime,
    document: &Value,
    roots: &[Utf16],
    include_macros: Option<bool>,
    max_depth: Option<usize>,
    max_nodes: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<DbtSelection, EngineError> {
    validate_manifest_selection_roots(roots)?;
    if max_depth.unwrap_or(16) > 128 || max_nodes.unwrap_or(256) == 0 || max_nodes.unwrap_or(256) > 10000 {
        return Err(err(
            "DBT_SELECTION_OPTIONS",
            "Expected boolean includeMacros, depth 0–128 and node limit 1–10000",
        ));
    }
    let (source, graph) = prepare_manifest_selection_graph(runtime, document, ctx)?;
    select_manifest_dependencies_prepared(source, graph, roots, include_macros, max_depth, max_nodes, ctx)
}

/// The public host reads the final root iterator only after source copying and
/// graph inspection. Keep those operations in Rust while preserving that order.
pub fn prepare_manifest_selection_graph(
    runtime: &DbtRuntime,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value), EngineError> {
    let source = copy_json(document, ctx)?;
    let graph = inspect_manifest_graph(runtime, &source, ctx)?;
    Ok((source, graph))
}

/// Finish a graph already inspected by the public host's ordered selection
/// path. Roots came from the host's actual Set iterator, after root preflight.
pub fn select_manifest_dependencies_prepared(
    source: Value,
    graph: Value,
    roots: &[Utf16],
    include_macros: Option<bool>,
    max_depth: Option<usize>,
    max_nodes: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<DbtSelection, EngineError> {
    let include_macros = include_macros.unwrap_or(false);
    let max_depth = max_depth.unwrap_or(16);
    let max_nodes = max_nodes.unwrap_or(256);
    if max_depth > 128 || max_nodes == 0 || max_nodes > 10000 {
        return Err(err(
            "DBT_SELECTION_OPTIONS",
            "Expected boolean includeMacros, depth 0–128 and node limit 1–10000",
        ));
    }
    let mut distinct = Vec::<Utf16>::new();
    let mut seen = BTreeSet::<Utf16>::new();
    for id in roots {
        let levels = (usize::BITS - (seen.len() + 1).leading_zeros()) as usize + 1;
        ctx.charge_work(id.len().saturating_add(1).saturating_mul(levels), Utf16::default())?;
        if seen.insert(id.clone()) {
            distinct.push(id.clone());
        }
    }
    let graph_status = text(member(&graph, "status").unwrap_or(&Value::Null))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let graph_nodes = list(member(&graph, "nodes").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let graph_edges = list(member(&graph, "edges").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut diagnostics = list(member(&graph, "diagnostics").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .to_vec();
    let root_values = distinct
        .iter()
        .cloned()
        .map(Value::String)
        .collect::<Vec<_>>();
    let mut selected = obj(vec![
        ("status", s("blocked")),
        ("complete", Value::Bool(false)),
        ("roots", array(root_values)),
        ("includeMacros", Value::Bool(include_macros)),
        ("maxDepth", Value::Number(max_depth as f64)),
        ("maxNodes", Value::Number(max_nodes as f64)),
        ("nodes", array(Vec::new())),
        ("edges", array(Vec::new())),
        ("boundary", array(Vec::new())),
        ("diagnostics", array(diagnostics.clone())),
    ]);
    if graph_status != "checked" {
        return Ok(DbtSelection {
            source,
            selection: selected,
        });
    }
    let mut node_index = BTreeMap::<Utf16, Value>::new();
    for node in graph_nodes {
        ctx.charge_work(1, Utf16::default())?;
        if let Some(id) = member(node, "id").and_then(text) {
            node_index.insert(id.clone(), copy_json(node, ctx)?);
        }
    }
    for id in &distinct {
        if !node_index.contains_key(id) {
            let d = diagnostic_utf16(
                "DBT_SELECTION_ROOT",
                Utf16::default(),
                message_with_id("Root is not an active resource: ", id, "", ctx)?,
                Severity::Error,
            );
            diagnostics.push(diagnostic_value(&d));
        }
    }
    if distinct.len() > max_nodes {
        diagnostics.push(diagnostic_value(&diagnostic(
            "DBT_SELECTION_ROOT",
            Utf16::default(),
            "Node limit cannot contain every requested root",
            Severity::Error,
        )));
    }
    if diagnostics
        .iter()
        .any(|d| text(member(d, "severity").unwrap_or(&Value::Null)) == Some(&key("error")))
    {
        member_mut(&mut selected, "diagnostics").map(|v| *v = array(diagnostics));
        return Ok(DbtSelection {
            source,
            selection: selected,
        });
    }
    let mut outgoing = BTreeMap::<Utf16, Vec<Value>>::new();
    for edge in graph_edges {
        ctx.charge_work(1, Utf16::default())?;
        if let Some(id) = member(edge, "dependent").and_then(text) {
            outgoing.entry(id.clone()).or_default().push(edge.clone());
        }
    }
    let mut depths = BTreeMap::<Utf16, usize>::new();
    let mut queue = VecDeque::<Utf16>::new();
    for id in &distinct {
        depths.insert(id.clone(), 0);
        queue.push_back(id.clone());
    }
    let mut selected_nodes = Vec::<Value>::new();
    let mut selected_edges = Vec::<Value>::new();
    let mut boundary = Vec::<Value>::new();
    while let Some(id) = queue.pop_front() {
        let depth = depths[&id];
        let original = node_index.get(&id).unwrap();
        let mut node = copy_json(&original, ctx)?;
        if let Value::Object(fields) = &mut node {
            fields.push((key("depth"), Value::Number(depth as f64)));
        }
        selected_nodes.push(node);
        if let Some(edges) = outgoing.get(&id) {
            for edge in edges {
                let dependency = member(edge, "dependency")
                    .and_then(text)
                    .cloned()
                    .unwrap_or_default();
                let is_macro = member(edge, "kind").and_then(text) == Some(&key("macro"));
                let reason = if is_macro && !include_macros {
                    Some("macro-excluded")
                } else if !depths.contains_key(&dependency) && depth >= max_depth {
                    Some("depth-limit")
                } else if !depths.contains_key(&dependency) && depths.len() >= max_nodes {
                    Some("node-limit")
                } else {
                    None
                };
                if let Some(reason) = reason {
                    boundary.push(obj(vec![
                        ("edge", copy_json(edge, ctx)?),
                        ("reason", s(reason)),
                    ]));
                } else {
                    selected_edges.push(copy_json(edge, ctx)?);
                    if !depths.contains_key(&dependency) {
                        depths.insert(dependency.clone(), depth + 1);
                        queue.push_back(dependency);
                    }
                }
            }
        }
    }
    diagnostics.push(diagnostic_value(&diagnostic("DBT_SELECTION_CONTEXT",Utf16::default(),"Upstream explicit-reference view only. Full original source is retained; boundary entries record omitted edges. Not a standalone runnable manifest or complete SQL/Jinja context.",Severity::Warning)));
    member_mut(&mut selected, "status").map(|v| *v = s("selected"));
    member_mut(&mut selected, "nodes").map(|v| *v = array(selected_nodes));
    member_mut(&mut selected, "edges").map(|v| *v = array(selected_edges));
    member_mut(&mut selected, "boundary").map(|v| *v = array(boundary));
    member_mut(&mut selected, "diagnostics").map(|v| *v = array(diagnostics));
    Ok(DbtSelection {
        source,
        selection: selected,
    })
}

/// Validate the root-list part of the pinned public selection contract. The
/// wire preparation stage and final selection operation share this routine.
pub fn validate_manifest_selection_roots(roots: &[Utf16]) -> Result<(), EngineError> {
    if roots.is_empty()
        || roots.len() > 64
        || roots.iter().any(|id| id.is_empty() || id.len() > 4096)
    {
        return Err(err(
            "DBT_SELECTION_OPTIONS",
            "Provide 1–64 bounded nonempty root IDs",
        ));
    }
    Ok(())
}

/// Admit raw root values in predecessor order: array shape and length are
/// rejected before any element is interpreted, then each present root is
/// checked for string type and bounds.
pub fn parse_manifest_selection_roots(value: &Value) -> Result<Vec<Utf16>, EngineError> {
    let Value::Array(values) = value else {
        return Err(err(
            "DBT_SELECTION_OPTIONS",
            "Provide 1–64 bounded nonempty root IDs",
        ));
    };
    if values.is_empty() || values.len() > 64 {
        return Err(err(
            "DBT_SELECTION_OPTIONS",
            "Provide 1–64 bounded nonempty root IDs",
        ));
    }
    let mut roots = Vec::with_capacity(values.len());
    for value in values {
        let Value::String(root) = value else {
            return Err(err(
                "DBT_SELECTION_OPTIONS",
                "Provide 1–64 bounded nonempty root IDs",
            ));
        };
        roots.push(root.clone());
    }
    validate_manifest_selection_roots(&roots)?;
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runtime(ctx: &mut Context<'_>) -> DbtRuntime {
        DbtRuntime::new(ctx).unwrap()
    }

    #[test]
    fn artifact_round_trip_keeps_future_versions_and_exact_native_source() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let source=br#"{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/run-results/v99.json"},"n":9007199254740993}"#.iter().map(|b|u16::from(*b)).collect::<Vec<_>>();
        let id = Utf16::from("artifact");
        let document = import_artifact(&runtime, &source, &id, &mut ctx).unwrap();
        let exported = export_artifact(&runtime, &document, &mut ctx).unwrap();
        assert_eq!(exported.units(), source.as_slice());
        let report = inspect_artifact(&runtime, &document, &mut ctx).unwrap();
        assert!(report.valid);
        assert!(report
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("DBT_ARTIFACT_VERSION")));
    }

    #[test]
    fn manifest_edit_is_copy_on_write_and_reads_the_edited_node() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let source=br#"{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v12.json"},"label":"old"}"#.iter().map(|b|u16::from(*b)).collect::<Vec<_>>();
        let document =
            import_manifest(&runtime, &source, &Utf16::from("manifest"), &mut ctx).unwrap();
        let edit = br#""new""#.iter().map(|b| u16::from(*b)).collect::<Vec<_>>();
        let (candidate, _) = propose_manifest_node_edit(
            &runtime,
            &document,
            &Utf16::from("/label"),
            &edit,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            export_manifest(&runtime, &document, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            String::from_utf16(&source).unwrap()
        );
        assert_eq!(
            export_manifest(&runtime, &candidate, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            r#"{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v12.json"},"label":"new"}"#
        );
        let got =
            get_manifest_node(&runtime, &candidate, &Utf16::from("/label"), &mut ctx).unwrap();
        assert_eq!(
            text(member(&got, "value").unwrap()).unwrap(),
            &Utf16::from("new")
        );
    }

    #[test]
    fn graph_and_selection_preserve_explicit_edges_and_source() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let source=br#"{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v12.json"},"nodes":{"model.x.a":{"unique_id":"model.x.a","depends_on":{"nodes":["seed.x.s"]}},"seed.x.s":{"unique_id":"seed.x.s"}},"sources":{},"exposures":{},"metrics":{},"semantic_models":{},"saved_queries":{},"unit_tests":{},"macros":{},"docs":{},"groups":{},"parent_map":{"model.x.a":["seed.x.s"],"seed.x.s":[]},"child_map":{"model.x.a":[],"seed.x.s":["model.x.a"]}}"#.iter().map(|b|u16::from(*b)).collect::<Vec<_>>();
        let document =
            import_manifest(&runtime, &source, &Utf16::from("manifest"), &mut ctx).unwrap();
        let graph = inspect_manifest_graph(&runtime, &document, &mut ctx).unwrap();
        assert_eq!(
            text(member(&graph, "status").unwrap()).unwrap(),
            &Utf16::from("checked")
        );
        let selection = select_manifest_dependencies(
            &runtime,
            &document,
            &[Utf16::from("model.x.a")],
            Some(false),
            None,
            None,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            text(member(&selection.selection, "status").unwrap()).unwrap(),
            &Utf16::from("selected")
        );
        assert_eq!(
            list(member(&selection.selection, "nodes").unwrap())
                .unwrap()
                .len(),
            2
        );
        assert_eq!(selection.source, document);
    }
}
