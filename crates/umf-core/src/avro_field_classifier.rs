// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Avro declared-field membership classification.
//!
//! This ports only `classifyAvroField`'s record/error membership assertion.
//! Scalar families, logical refinements, presence, and value-domain equivalence
//! remain outside this classifier's claim.

use crate::{
    avro_document,
    avro_fields::{derive_avro_fields, AvroDependency},
    context::Context,
    core_kind,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::NativeJsonTree,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/avro-field-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn text(s: &str) -> Value {
    Value::string_utf8(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn str_value(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, key(path), message)
}

struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn json_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}

fn operation_schemas(
    ctx: &mut Context<'_>,
) -> Result<std::sync::Arc<(CompiledSchema, CompiledSchema)>, EngineError> {
    use std::sync::{Arc, OnceLock};
    static SCHEMAS: OnceLock<Arc<(CompiledSchema, CompiledSchema)>> = OnceLock::new();
    ctx.charge_work(1, key(""))?;
    let ordinary = ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary();
    if ordinary {
        if let Some(schemas) = SCHEMAS.get() {
            return Ok(Arc::clone(schemas));
        }
    }
    let schemas = Arc::new(build_operation_schemas(ctx)?);
    if ordinary {
        let _ = SCHEMAS.set(Arc::clone(&schemas));
    }
    Ok(schemas)
}

fn build_operation_schemas(
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let operation_schema = json_resource(CLASSIFICATION_SCHEMA, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (key("urn:umf:core:0.10.0"), json_resource(CORE_SCHEMA, ctx)?),
            (
                key("urn:umf:core:semantic-type-reference:1.0.0"),
                json_resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (
                key("urn:umf:core:kind-operation:6.0.0"),
                json_resource(KIND_SCHEMA, ctx)?,
            ),
        ],
    };
    let result_schema = CompiledSchema::compile(&operation_schema, &resources, ctx)?;
    let request_schema = get(&operation_schema, "properties")
        .and_then(|v| get(v, "request"))
        .ok_or_else(|| {
            err(
                "AVRO_FIELD_RESULT",
                "Classification schema has no request shape",
                "",
            )
        })?;
    let request_schema = CompiledSchema::compile(request_schema, &resources, ctx)?;
    Ok((result_schema, request_schema))
}

struct Runtime {
    engine: Engine,
    registry: Registry,
}

fn engine(ctx: &mut Context<'_>) -> Result<std::sync::Arc<Runtime>, EngineError> {
    use std::sync::{Arc, OnceLock};
    static RUNTIME: OnceLock<Arc<Runtime>> = OnceLock::new();
    ctx.charge_work(1, key(""))?;
    let ordinary = ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary();
    if ordinary {
        if let Some(runtime) = RUNTIME.get() {
            return Ok(Arc::clone(runtime));
        }
    }
    // Build under the invoking context. Only successful immutable runtime
    // resources enter the ordinary-context cache.
    let runtime = Arc::new(build_engine(ctx)?);
    if ordinary {
        let _ = RUNTIME.set(Arc::clone(&runtime));
    }
    Ok(runtime)
}

fn build_engine(ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    let engine = Engine::new(
        ResourceSet::new(
            json_resource(CORE_SCHEMA, ctx)?,
            json_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let mut registry = Registry::new();
    let manifest = json_resource(
        include_str!("../../../spec/extensions/avro/package.json"),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    registry.register(&manifest, None, engine.package_schema(), &resources, ctx)?;
    Ok(Runtime { engine, registry })
}

fn validate_document(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut callbacks = NoCallbacks;
    let result = engine.validate_document(source, registry, &mut callbacks, ctx)?;
    if result.valid {
        Ok(())
    } else {
        Err(err(
            "AVRO_FIELD_VERSION",
            "Valid current 0.10.0 envelope required",
            "",
        ))
    }
}

fn set_field_kind(target: &mut Value, mi: usize, ei: usize) -> Result<(), EngineError> {
    let modules = match target {
        Value::Object(m) => m
            .iter_mut()
            .find(|(k, _)| k == &key("modules"))
            .and_then(|(_, v)| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            }),
        _ => None,
    }
    .ok_or_else(|| {
        err(
            "AVRO_FIELD_METADATA",
            "Derived field module is required",
            "/modules",
        )
    })?;
    let fields = modules
        .get_mut(mi)
        .and_then(|m| match m {
            Value::Object(m) => {
                m.iter_mut()
                    .find(|(k, _)| k == &key("elements"))
                    .and_then(|(_, v)| {
                        if let Value::Array(a) = v {
                            a.get_mut(ei)
                        } else {
                            None
                        }
                    })
            }
            _ => None,
        })
        .and_then(|e| {
            if let Value::Object(m) = e {
                Some(m)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            err(
                "AVRO_FIELD_METADATA",
                "Derived field identity is absent",
                "/modules",
            )
        })?;
    if let Some((_, kind)) = fields.iter_mut().find(|(k, _)| k == &key("kind")) {
        *kind = text("field");
    } else {
        fields.push((key("kind"), text("field")));
    }
    Ok(())
}

/// Classify one Avro-derived element as a core Field using declared record or
/// error membership. `request` follows `avro-field-classification.schema.json`.
pub fn classify_field(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    let schemas = operation_schemas(ctx)?;
    let (result_schema, request_schema) = (&schemas.0, &schemas.1);
    let request_errors = request_schema.validate(&request, ctx)?;
    if let Some(first) = request_errors.first() {
        return Err(EngineError::new(
            "AVRO_FIELD_REQUEST",
            first.instance_path.clone(),
            first.message.clone(),
        ));
    }
    let runtime = engine(ctx)?;
    validate_document(&source, &runtime.engine, &runtime.registry, ctx)?;
    let column = str_value(
        get(&request, "column")
            .ok_or_else(|| err("AVRO_FIELD_REQUEST", "column is required", "/column"))?,
    )
    .ok_or_else(|| err("AVRO_FIELD_REQUEST", "column must be a string", "/column"))?
    .clone();
    let mode = str_value(
        get(&request, "mode")
            .ok_or_else(|| err("AVRO_FIELD_REQUEST", "mode is required", "/mode"))?,
    )
    .and_then(|v| v.to_utf8().ok())
    .ok_or_else(|| {
        err(
            "AVRO_FIELD_REQUEST",
            "mode must be strict or report",
            "/mode",
        )
    })?;
    if mode != "strict" && mode != "report" {
        return Err(err(
            "AVRO_FIELD_REQUEST",
            "mode must be strict or report",
            "/mode",
        ));
    }
    let native_source = str_value(get(&request, "nativeSource").ok_or_else(|| {
        err(
            "AVRO_FIELD_REQUEST",
            "nativeSource is required",
            "/nativeSource",
        )
    })?)
    .ok_or_else(|| {
        err(
            "AVRO_FIELD_REQUEST",
            "nativeSource must be a string",
            "/nativeSource",
        )
    })?;
    // Match the predecessor's archive-first refusal order before parsing the
    // caller's native capture or looking up its requested field identity.
    let bundle = avro_document::export_bundle(&source, ctx)?;
    let root = NativeJsonTree::parse_json(native_source.units(), ctx)?;
    let expected_root = root.render_compact(ctx)?;
    if !bundle.schema_json.units().ends_with(&[10])
        || &bundle.schema_json.units()[..bundle.schema_json.len() - 1] != expected_root.units()
    {
        return Err(err(
            "AVRO_FIELD_ARCHIVE",
            "Native bundle archive differs from retained schemas",
            "",
        ));
    }
    let requested_dependencies = get(&request, "dependencies")
        .and_then(|value| {
            if let Value::Array(items) = value {
                Some(items)
            } else {
                None
            }
        })
        .map_or(0, Vec::len);
    if bundle.dependencies.len() != requested_dependencies {
        return Err(err(
            "AVRO_FIELD_ARCHIVE",
            "Native bundle archive differs from retained schemas",
            "",
        ));
    }
    let mut dependency_trees = Vec::<(Utf16, NativeJsonTree)>::new();
    if let Some(Value::Array(deps)) = get(&request, "dependencies") {
        for dep in deps {
            let id = str_value(get(dep, "id").ok_or_else(|| {
                err(
                    "AVRO_FIELD_REQUEST",
                    "dependency id is required",
                    "/dependencies",
                )
            })?)
            .ok_or_else(|| {
                err(
                    "AVRO_FIELD_REQUEST",
                    "dependency id must be a string",
                    "/dependencies",
                )
            })?
            .clone();
            let schema = str_value(get(dep, "schema").ok_or_else(|| {
                err(
                    "AVRO_FIELD_REQUEST",
                    "dependency schema is required",
                    "/dependencies",
                )
            })?)
            .ok_or_else(|| {
                err(
                    "AVRO_FIELD_REQUEST",
                    "dependency schema must be a string",
                    "/dependencies",
                )
            })?;
            let tree = NativeJsonTree::parse_json(schema.units(), ctx)?;
            let rendered = tree.render_compact(ctx)?;
            let index = dependency_trees.len();
            let (actual_id, actual_schema) = &bundle.dependencies[index];
            if actual_id != &id
                || !actual_schema.units().ends_with(&[10])
                || &actual_schema.units()[..actual_schema.len() - 1] != rendered.units()
            {
                return Err(err(
                    "AVRO_FIELD_ARCHIVE",
                    "Native bundle archive differs from retained schemas",
                    "",
                ));
            }
            dependency_trees.push((id, tree));
        }
    }
    let deps = dependency_trees
        .iter()
        .map(|(id, tree)| AvroDependency { id, root: tree })
        .collect::<Vec<_>>();
    let fields = derive_avro_fields(&root, &deps, ctx)?;
    let field = fields
        .iter()
        .find(|f| f.element_id == column)
        .ok_or_else(|| err("AVRO_FIELD_COLUMN", "Declared field identity not found", ""))?;
    let (mi, ei) = locate_element(&source, &column)?;
    let ideal_path = Utf16::from(format!("/modules/{mi}/elements/{ei}/kind"));
    let element = get(&source, "modules")
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
    let mut status = "classified";
    let mut outcome = "exact";
    let mut reason = None;
    if let Some(author) = get(&request, "author") {
        let mut callbacks = NoCallbacks;
        match core_kind::verify_core_kind_declaration(
            author,
            &source,
            &runtime.engine,
            &runtime.registry,
            &mut callbacks,
            ctx,
        ) {
            Ok(receipt) => {
                if get(&receipt, "identity")
                    .and_then(|v| get(v, "module"))
                    .and_then(str_value)
                    != Some(&key("avro.fields"))
                    || get(&receipt, "identity")
                        .and_then(|v| get(v, "element"))
                        .and_then(str_value)
                        != Some(&column)
                {
                    reason = Some("Author receipt identifies another field".to_owned());
                } else if get(&receipt, "provenance")
                    .and_then(|v| get(v, "kind"))
                    .and_then(str_value)
                    != Some(&key("field"))
                {
                    reason = Some(
                        "Authored kind conflicts with native record field membership".to_owned(),
                    );
                }
            }
            Err(e) if e.code == "LIMIT" || e.is_control_failure() => return Err(e),
            Err(e) => reason = Some(format!("Invalid or stale author provenance: {}", e.code)),
        }
    } else if get(element, "kind").is_some() {
        reason = Some(
            "Existing kind needs verified author provenance; native observation cannot replace it"
                .to_owned(),
        );
    }
    let mut target = None;
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    if let Some(reason) = reason {
        status = "blocked";
        outcome = "unknown";
        residuals.push(object(vec![("path", Value::String(ideal_path.clone())), ("value", get(element,"kind").cloned().unwrap_or(Value::Null)), ("reason", text(&reason)), ("recovery", text("Original assertion and native fragment retained in source; reclassify with corrected provenance"))]));
        diagnostics.push(object(vec![
            ("code", text("AVRO_FIELD_CONFLICT")),
            ("path", Value::String(ideal_path.clone())),
            ("message", text(&reason)),
            ("severity", text("error")),
        ]));
    } else {
        let mut copied = copy_json(&source, ctx)?;
        set_field_kind(&mut copied, mi, ei)?;
        target = Some(copied);
    }
    let binding = object(vec![("id", text("umf.avro.field")), ("version", text("1.0.0")), ("nativeVersion", text("1.12.0")), ("subset", text("Declared record/error field membership with named dependencies; logical refinements, presence and value-domain equivalence excluded"))]);
    let mut mapping_fields = vec![
        ("origin", text("classified")),
        ("kind", text("field")),
        ("idealPath", Value::String(ideal_path)),
        ("nativePath", Value::String(field.path.clone())),
    ];
    if let Some(id) = field.dependency_id.clone() {
        mapping_fields.push(("dependencyId", Value::String(id)));
    }
    mapping_fields.extend([
        (
            "nativeFragment",
            field.native_field.tagged_value_preserving_extras(ctx)?,
        ),
        ("basis", text("checked-record-field-membership")),
        ("outcome", text(outcome)),
    ]);
    let mapping = object(mapping_fields);
    let mut report = vec![
        ("operation", text("classify-avro-field")),
        ("version", text("1.0.0")),
        ("status", text(status)),
        ("source", source),
        ("request", request),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if let Some(target) = target {
        report.push(("target", target));
    }
    let report = object(report);
    let report_errors = result_schema.validate(&report, ctx)?;
    if let Some(first) = report_errors.first() {
        return Err(EngineError::new(
            "AVRO_FIELD_RESULT",
            first.instance_path.clone(),
            first.message.clone(),
        ));
    }
    Ok(report)
}

fn locate_element(source: &Value, id: &Utf16) -> Result<(usize, usize), EngineError> {
    let modules = get(source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            err(
                "AVRO_FIELD_METADATA",
                "Derived field module is required",
                "/modules",
            )
        })?;
    let mi = modules
        .iter()
        .position(|m| get(m, "id").and_then(str_value) == Some(&key("avro.fields")))
        .ok_or_else(|| {
            err(
                "AVRO_FIELD_METADATA",
                "Derived field module is required",
                "/modules",
            )
        })?;
    let elements = get(&modules[mi], "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            err(
                "AVRO_FIELD_METADATA",
                "Derived field module is required",
                "/modules",
            )
        })?;
    let ei = elements
        .iter()
        .position(|e| get(e, "id").and_then(str_value) == Some(id))
        .ok_or_else(|| err("AVRO_FIELD_COLUMN", "Declared field identity not found", ""))?;
    Ok((mi, ei))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source() -> Value {
        avro_document::import_schema(
            &key("receipt"),
            &r#"{"type":"record","name":"R","fields":[{"name":"f","type":{"type":"array","items":"string"}}]}"#.encode_utf16().collect::<Vec<_>>(),
            &[],
            &mut Context::ordinary(),
        ).unwrap()
    }

    fn request_for(source: &Value, mode: &str) -> Value {
        let bundle = avro_document::export_bundle(source, &mut Context::ordinary()).unwrap();
        object(vec![
            ("column", text(r#"[null,"/fields/0"]"#)),
            ("nativeSource", Value::String(bundle.schema_json)),
            ("mode", text(mode)),
        ])
    }

    #[test]
    fn authored_receipts_are_checked_in_strict_and_report_modes() {
        let source = source();
        let runtime = engine(&mut Context::ordinary()).unwrap();
        let identity = core_kind::Identity {
            module: key("avro.fields"),
            element: key(r#"[null,"/fields/0"]"#),
        };
        let mut callbacks = NoCallbacks;
        let authored_field = core_kind::declare_core_kind(
            &source,
            &identity,
            "field",
            &runtime.engine,
            &runtime.registry,
            &mut callbacks,
            &mut Context::ordinary(),
        )
        .unwrap();
        let mut request = request_for(get(&authored_field, "target").unwrap(), "strict");
        if let Value::Object(members) = &mut request {
            members.push((key("author"), authored_field.clone()));
        }
        let accepted = classify_field(
            get(&authored_field, "target").unwrap(),
            &request,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(get(&accepted, "status"), Some(&text("classified")));

        let authored_record = core_kind::declare_core_kind(
            &source,
            &identity,
            "record",
            &runtime.engine,
            &runtime.registry,
            &mut callbacks,
            &mut Context::ordinary(),
        )
        .unwrap();
        for mode in ["strict", "report"] {
            let mut request = request_for(&source, mode);
            if let Value::Object(members) = &mut request {
                members.push((key("author"), authored_record.clone()));
            }
            let blocked = classify_field(&source, &request, &mut Context::ordinary()).unwrap();
            assert_eq!(get(&blocked, "status"), Some(&text("blocked")));
        }

        let mut stale_source = source.clone();
        if let Value::Object(members) = &mut stale_source {
            members
                .iter_mut()
                .find(|(name, _)| name == &key("id"))
                .unwrap()
                .1 = text("changed");
        }
        let mut stale_request = request_for(&stale_source, "report");
        if let Value::Object(members) = &mut stale_request {
            members.push((key("author"), authored_field));
        }
        let blocked =
            classify_field(&stale_source, &stale_request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&blocked, "status"), Some(&text("blocked")));

        let source_with_two_fields = avro_document::import_schema(
            &key("receipt"),
            &r#"{"type":"record","name":"R","fields":[{"name":"f","type":{"type":"array","items":"string"}},{"name":"g","type":{"type":"array","items":"string"}}]}"#.encode_utf16().collect::<Vec<_>>(),
            &[], &mut Context::ordinary(),
        ).unwrap();
        let other_identity = core_kind::Identity {
            module: key("avro.fields"),
            element: key(r#"[null,"/fields/1"]"#),
        };
        let other_author = core_kind::declare_core_kind(
            &source_with_two_fields,
            &other_identity,
            "field",
            &runtime.engine,
            &runtime.registry,
            &mut callbacks,
            &mut Context::ordinary(),
        )
        .unwrap();
        let current = get(&other_author, "target").unwrap();
        let mut wrong_identity_request = request_for(current, "strict");
        if let Value::Object(members) = &mut wrong_identity_request {
            members.push((key("author"), other_author.clone()));
        }
        let blocked =
            classify_field(current, &wrong_identity_request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&blocked, "status"), Some(&text("blocked")));
    }

    #[test]
    fn immutable_resources_are_shared_between_ordinary_contexts() {
        let first_runtime = engine(&mut Context::ordinary()).unwrap();
        let second_runtime = engine(&mut Context::ordinary()).unwrap();
        assert!(std::sync::Arc::ptr_eq(&first_runtime, &second_runtime));
        let first_schemas = operation_schemas(&mut Context::ordinary()).unwrap();
        let second_schemas = operation_schemas(&mut Context::ordinary()).unwrap();
        assert!(std::sync::Arc::ptr_eq(&first_schemas, &second_schemas));
    }
}
