// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in `umf.core-wire/1` transport for the pinned dbt artifact operations.

use std::sync::{Arc, OnceLock};

use umf_core::{
    dbt::{self, DbtRuntime, DbtSelection},
    error::Validation,
    Context, EngineError, Utf16, Value,
};

use crate::{decode, encode, field, result_envelope, text_field};

pub const PROFILE: &str = "umf-r9-dbt-preservation/0.1.0";

fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn dbt_error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn array(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}

fn validation_value(validation: Validation) -> Value {
    dbt::validation_to_value(&validation)
}

struct RuntimeCache;
impl RuntimeCache {
    fn shared(ctx: &mut Context<'_>) -> Result<Arc<DbtRuntime>, EngineError> {
        static RUNTIME: OnceLock<Arc<DbtRuntime>> = OnceLock::new();
        // A warm immutable resource cache still participates in this call's
        // control budget. Runtime state contains no host callbacks or inputs.
        ctx.charge_work(1, Utf16::default())?;
        let ordinary = ctx.profile() == umf_core::context::ResourceProfile::Cooperative
            && ctx.limits() == umf_core::context::Limits::ordinary();
        if ordinary {
            if let Some(runtime) = RUNTIME.get() {
                return Ok(Arc::clone(runtime));
            }
        }
        // Construct outside the OnceLock initialization closure: a host control
        // callback can reenter without waiting on a held initialization lock.
        let runtime = Arc::new(DbtRuntime::new(ctx)?);
        if ordinary {
            let _ = RUNTIME.set(Arc::clone(&runtime));
        }
        Ok(runtime)
    }
}

fn input_text<'a>(request: &'a Value, key: &str, message: &str) -> Result<&'a Utf16, EngineError> {
    match field(request, key) {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request_error(message)),
    }
}

fn document<'a>(request: &'a Value) -> Result<&'a Value, EngineError> {
    field(request, "document").ok_or_else(|| request_error("document is required"))
}

fn import_id(request: &Value, ctx: &mut Context<'_>) -> Result<Option<Value>, EngineError> {
    let options = field(request, "options").ok_or_else(|| request_error("options is required"))?;
    if !matches!(options, Value::Object(_)) {
        return Err(request_error("options must be an object"));
    }
    ensure_unique_members(options, ctx)?;
    // This is data for the core document schema to validate. In particular,
    // malformed ids are DBT_*_DOCUMENT failures, not wire REQUEST failures.
    Ok(member(options, "id").cloned())
}

fn optional_selection_bool(options: &Value, name: &str) -> Result<Option<bool>, EngineError> {
    match member(options, name) {
        None => Ok(None),
        Some(Value::Bool(value)) => Ok(Some(*value)),
        Some(_) => Err(dbt_error(
            "DBT_SELECTION_OPTIONS",
            "Expected boolean includeMacros, depth 0–128 and node limit 1–10000",
        )),
    }
}

fn optional_selection_usize(options: &Value, name: &str) -> Result<Option<usize>, EngineError> {
    match member(options, name) {
        None => Ok(None),
        Some(Value::Number(value))
            if value.is_finite()
                && *value >= 0.0
                && value.fract() == 0.0
                && *value <= usize::MAX as f64 =>
        {
            Ok(Some(*value as usize))
        }
        Some(_) => Err(dbt_error(
            "DBT_SELECTION_OPTIONS",
            "Expected boolean includeMacros, depth 0–128 and node limit 1–10000",
        )),
    }
}

fn selection_options(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Vec<Utf16>, Option<bool>, Option<usize>, Option<usize>), EngineError> {
    let options = field(request, "options")
        .ok_or_else(|| dbt_error("DBT_SELECTION_OPTIONS", "Expected selection options"))?;
    let Value::Object(_) = options else {
        return Err(dbt_error(
            "DBT_SELECTION_OPTIONS",
            "Expected selection options",
        ));
    };
    ensure_unique_members(options, ctx)?;
    let root_ids = selection_roots(options, ctx)?;
    Ok((
        root_ids,
        optional_selection_bool(options, "includeMacros")?,
        optional_selection_usize(options, "maxDepth")?,
        optional_selection_usize(options, "maxNodes")?,
    ))
}

fn selection_roots(options: &Value, ctx: &mut Context<'_>) -> Result<Vec<Utf16>, EngineError> {
    let roots = member(options, "roots").ok_or_else(|| {
        dbt_error("DBT_SELECTION_OPTIONS", "Provide 1–64 bounded nonempty root IDs")
    })?;
    let root_ids = dbt::parse_manifest_selection_roots(roots)?;
    for root in &root_ids {
        ctx.charge_work(root.len(), Utf16::default())?;
    }
    Ok(root_ids)
}

fn ensure_unique_members(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Ok(());
    };
    let mut seen = std::collections::BTreeSet::new();
    for (index, (key, _)) in fields.iter().enumerate() {
        // Meter a conservative bound for comparisons before inserting into the
        // bounded balanced tree. No quadratic prefix scans of host options.
        let levels = (usize::BITS - (index + 1).leading_zeros()) as usize + 1;
        let work = key
            .len()
            .saturating_add(1)
            .saturating_mul(levels)
            .saturating_mul(16);
        ctx.charge_work(work, Utf16::default())?;
        if !seen.insert(key) {
            return Err(request_error("DBT options contain duplicate members"));
        }
    }
    Ok(())
}

fn negative_zero_depth(options: &Value) -> bool {
    matches!(member(options, "maxDepth"), Some(Value::Number(value)) if *value == 0.0 && value.is_sign_negative())
}

fn selection_value(mut selection: DbtSelection, preserve_negative_zero_depth: bool) -> Value {
    if preserve_negative_zero_depth {
        if let Value::Object(fields) = &mut selection.selection {
            if let Some((_, depth)) = fields.iter_mut().find(|(name, _)| name == &Utf16::from("maxDepth")) {
                *depth = Value::Number(-0.0);
            }
        }
    }
    object([
        ("source", selection.source),
        ("selection", selection.selection),
    ])
}

fn request_members(
    request: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = request else {
        return Err(request_error("DBT request must be an object"));
    };
    for (index, (name, _)) in fields.iter().enumerate() {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| name == &Utf16::from(*candidate))
            || fields[..index].iter().any(|(prior, _)| prior == name)
        {
            return Err(request_error(
                "DBT request has an unknown or duplicate member",
            ));
        }
    }
    Ok(())
}

fn operation_fields(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "dbt.importManifest" | "dbt.importArtifact" | "dbt.importSemanticManifest" => {
            &["profile", "op", "text", "options"]
        }
        "dbt.exportManifest"
        | "dbt.inspectManifest"
        | "dbt.exportArtifact"
        | "dbt.inspectArtifact"
        | "dbt.exportSemanticManifest"
        | "dbt.inspectSemanticManifest"
        | "dbt.inspectManifestGraph" => &["profile", "op", "document"],
        "dbt.getManifestNode" | "dbt.getArtifactNode" | "dbt.getSemanticManifestNode" => {
            &["profile", "op", "document", "path"]
        }
        "dbt.editManifest" | "dbt.editArtifact" | "dbt.editSemanticManifest" => {
            &["profile", "op", "document", "path", "text"]
        }
        "dbt.prepareImportText" => &["profile", "op", "text"],
        "dbt.prepareManifestSelectionBounds" => &["profile", "op"],
        "dbt.prepareManifestSelectionRootItem" => &["profile", "op", "item"],
        "dbt.prepareManifestSelectionRoots" => &["profile", "op", "options"],
        "dbt.prepareManifestSelectionSettings" => &["profile", "op", "options"],
        "dbt.prepareManifestSelectionGraph" => &["profile", "op", "document"],
        "dbt.finishManifestSelection" => &["profile", "op", "document", "roots", "options"],
        "dbt.selectManifestDependencies" => &["profile", "op", "document", "options"],
        _ => return None,
    })
}

fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let operation = text_field(request, "op").ok_or_else(|| request_error("op is required"))?;
    if text_field(request, "profile").as_deref() != Some(PROFILE) {
        return Err(request_error("DBT binding profile is required"));
    }
    let allowed = operation_fields(&operation)
        .ok_or_else(|| request_error("Unknown DBT binding operation"))?;
    request_members(request, allowed, ctx)?;
    if operation == "dbt.prepareImportText" {
        dbt::validate_import_source(
            input_text(request, "text", "text must be a string")?.units(),
            ctx,
        )?;
        return Ok(Value::Null);
    }
    if operation == "dbt.prepareManifestSelectionBounds" {
        return Ok(object([
            ("minimum", Value::Number(1.0)),
            ("maximum", Value::Number(64.0)),
        ]));
    }
    if operation == "dbt.prepareManifestSelectionRootItem" {
        let invalid = match field(request, "item") {
            Some(Value::String(root)) => dbt::validate_manifest_selection_roots(std::slice::from_ref(root)).is_err(),
            _ => true,
        };
        return Ok(Value::Bool(invalid));
    }
    if operation == "dbt.prepareManifestSelectionRoots" {
        let options = field(request, "options")
            .ok_or_else(|| dbt_error("DBT_SELECTION_OPTIONS", "Expected selection options"))?;
        if !matches!(options, Value::Object(_)) {
            return Err(dbt_error("DBT_SELECTION_OPTIONS", "Expected selection options"));
        }
        ensure_unique_members(options, ctx)?;
        let roots = selection_roots(options, ctx)?;
        return Ok(array(roots.into_iter().map(Value::String)));
    }
    if operation == "dbt.prepareManifestSelectionSettings" {
        let options = field(request, "options")
            .ok_or_else(|| dbt_error("DBT_SELECTION_OPTIONS", "Expected selection options"))?;
        if !matches!(options, Value::Object(_)) {
            return Err(dbt_error("DBT_SELECTION_OPTIONS", "Expected selection options"));
        }
        ensure_unique_members(options, ctx)?;
        let include_macros = optional_selection_bool(options, "includeMacros")?.unwrap_or(false);
        let max_depth = optional_selection_usize(options, "maxDepth")?.unwrap_or(16);
        let max_nodes = optional_selection_usize(options, "maxNodes")?.unwrap_or(256);
        if max_depth > 128 || max_nodes == 0 || max_nodes > 10000 {
            return Err(dbt_error("DBT_SELECTION_OPTIONS", "Expected boolean includeMacros, depth 0–128 and node limit 1–10000"));
        }
        return Ok(object([
            ("includeMacros", Value::Bool(include_macros)),
            ("maxDepth", Value::Number(if negative_zero_depth(options) { -0.0 } else { max_depth as f64 })),
            ("maxNodes", Value::Number(max_nodes as f64)),
        ]));
    }
    if operation == "dbt.prepareManifestSelectionGraph" {
        let runtime = RuntimeCache::shared(ctx)?;
        let _ = dbt::prepare_manifest_selection_graph(&runtime, document(request)?, ctx)?;
        return Ok(Value::Null);
    }
    if operation == "dbt.finishManifestSelection" {
        let options = field(request, "options")
            .ok_or_else(|| request_error("prepared selection options are required"))?;
        let roots = match field(request, "roots") {
            Some(Value::Array(values)) => values.iter().map(|value| match value {
                Value::String(root) => Ok(root.clone()),
                _ => Err(request_error("prepared selection roots must be strings")),
            }).collect::<Result<Vec<_>, _>>()?,
            _ => return Err(request_error("prepared selection roots are required")),
        };
        let include_macros = optional_selection_bool(options, "includeMacros")?;
        let max_depth = optional_selection_usize(options, "maxDepth")?;
        let max_nodes = optional_selection_usize(options, "maxNodes")?;
        let preserve_negative_zero_depth = negative_zero_depth(options);
        let runtime = RuntimeCache::shared(ctx)?;
        let (source, graph) = dbt::prepare_manifest_selection_graph(&runtime, document(request)?, ctx)?;
        return Ok(selection_value(dbt::select_manifest_dependencies_prepared(source, graph, &roots, include_macros, max_depth, max_nodes, ctx)?, preserve_negative_zero_depth));
    }
    // Validate raw transport types and optional-value presence before the
    // expensive immutable runtime is fetched or constructed. In particular,
    // absent selection options mean the TS defaults; explicit null is invalid.
    let selection = match operation.as_str() {
        "dbt.selectManifestDependencies" => {
            let parsed = selection_options(request, ctx)?;
            document(request)?;
            Some(parsed)
        }
        "dbt.importManifest" | "dbt.importArtifact" | "dbt.importSemanticManifest" => {
            input_text(request, "text", "text must be a string")?;
            import_id(request, ctx)?;
            None
        }
        "dbt.exportManifest"
        | "dbt.inspectManifest"
        | "dbt.exportArtifact"
        | "dbt.inspectArtifact"
        | "dbt.exportSemanticManifest"
        | "dbt.inspectSemanticManifest"
        | "dbt.inspectManifestGraph" => {
            document(request)?;
            None
        }
        "dbt.getManifestNode" | "dbt.getArtifactNode" | "dbt.getSemanticManifestNode" => {
            document(request)?;
            input_text(request, "path", "path must be a string")?;
            None
        }
        "dbt.editManifest" | "dbt.editArtifact" | "dbt.editSemanticManifest" => {
            document(request)?;
            input_text(request, "path", "path must be a string")?;
            input_text(request, "text", "text must be a string")?;
            None
        }
        _ => None,
    };
    let runtime = RuntimeCache::shared(ctx)?;
    Ok(match operation.as_str() {
        "dbt.importManifest" => dbt::import_manifest_with_id(
            &runtime,
            input_text(request, "text", "text must be a string")?.units(),
            import_id(request, ctx)?,
            ctx,
        )?,
        "dbt.exportManifest" => {
            Value::String(dbt::export_manifest(&runtime, document(request)?, ctx)?)
        }
        "dbt.inspectManifest" => {
            validation_value(dbt::inspect_manifest(&runtime, document(request)?, ctx)?)
        }
        "dbt.getManifestNode" => dbt::get_manifest_node(
            &runtime,
            document(request)?,
            input_text(request, "path", "path must be a string")?,
            ctx,
        )?,
        "dbt.editManifest" => {
            let (document, validation) = dbt::propose_manifest_node_edit(
                &runtime,
                document(request)?,
                input_text(request, "path", "path must be a string")?,
                input_text(request, "text", "text must be a string")?.units(),
                ctx,
            )?;
            object([
                ("document", document),
                ("validation", validation_value(validation)),
            ])
        }
        "dbt.importArtifact" => dbt::import_artifact_with_id(
            &runtime,
            input_text(request, "text", "text must be a string")?.units(),
            import_id(request, ctx)?,
            ctx,
        )?,
        "dbt.exportArtifact" => {
            Value::String(dbt::export_artifact(&runtime, document(request)?, ctx)?)
        }
        "dbt.inspectArtifact" => {
            validation_value(dbt::inspect_artifact(&runtime, document(request)?, ctx)?)
        }
        "dbt.getArtifactNode" => dbt::get_artifact_node(
            &runtime,
            document(request)?,
            input_text(request, "path", "path must be a string")?,
            ctx,
        )?,
        "dbt.editArtifact" => {
            let (document, validation) = dbt::propose_artifact_node_edit(
                &runtime,
                document(request)?,
                input_text(request, "path", "path must be a string")?,
                input_text(request, "text", "text must be a string")?.units(),
                ctx,
            )?;
            object([
                ("document", document),
                ("validation", validation_value(validation)),
            ])
        }
        "dbt.importSemanticManifest" => dbt::import_semantic_manifest_with_id(
            &runtime,
            input_text(request, "text", "text must be a string")?.units(),
            import_id(request, ctx)?,
            ctx,
        )?,
        "dbt.exportSemanticManifest" => Value::String(dbt::export_semantic_manifest(
            &runtime,
            document(request)?,
            ctx,
        )?),
        "dbt.inspectSemanticManifest" => validation_value(dbt::inspect_semantic_manifest(
            &runtime,
            document(request)?,
            ctx,
        )?),
        "dbt.getSemanticManifestNode" => dbt::get_semantic_manifest_node(
            &runtime,
            document(request)?,
            input_text(request, "path", "path must be a string")?,
            ctx,
        )?,
        "dbt.editSemanticManifest" => {
            let (document, validation) = dbt::propose_semantic_manifest_node_edit(
                &runtime,
                document(request)?,
                input_text(request, "path", "path must be a string")?,
                input_text(request, "text", "text must be a string")?.units(),
                ctx,
            )?;
            object([
                ("document", document),
                ("validation", validation_value(validation)),
            ])
        }
        "dbt.inspectManifestGraph" => {
            dbt::inspect_manifest_graph(&runtime, document(request)?, ctx)?
        }
        "dbt.selectManifestDependencies" => {
            let (roots, include_macros, max_depth, max_nodes) = selection
                .ok_or_else(|| request_error("Selection options were not prevalidated"))?;
            let preserve_negative_zero_depth = field(request, "options").is_some_and(negative_zero_depth);
            selection_value(dbt::select_manifest_dependencies(
                &runtime,
                document(request)?,
                &roots,
                include_macros,
                max_depth,
                max_nodes,
                ctx,
            )?, preserve_negative_zero_depth)
        }
        _ => return Err(request_error("Unknown DBT binding operation")),
    })
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let output = execute(&request, &mut ctx)?;
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}
