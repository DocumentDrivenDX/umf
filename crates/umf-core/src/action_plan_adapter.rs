// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned admission and first-set action plan operations.
//!
//! This is a scratch implementation of `src/extensions/actions/plans.ts`.
//! It deliberately keeps the external selection interpreter behind the wire
//! continuation; the interpreter never supplies plan eligibility or action
//! validation results.
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const ACTION_TOKEN: u64 = 0x4143_5449_4f4e_0001;
const PLAN_MAX: usize = 1_048_576;
const PLAN_URI: &str = "urn:umf:actions:plan:1";
const EXECUTOR_PROFILE_URI: &str = "urn:umf:actions:executor-profile:0.1.0";
const CORE_VERSION: &str = "0.10.0";

#[derive(Clone, Debug)]
pub struct ActionPlanSelectionRequest {
    pub token: u64,
    pub profile: Value,
    pub artifact: Value,
    pub model: Value,
    pub target: Value,
}

#[derive(Debug)]
pub struct ActionPlanPendingInspection {
    pub source: Value,
    pub plan: Value,
    pub document: Value,
    pub assessment: Option<(Value, Value)>,
    pub ddd_interpreted: bool,
}

#[derive(Debug)]
pub struct ActionPlanRuntime {
    engine: Engine,
    registry: Registry,
    plan_schema: CompiledSchema,
    model_schema: CompiledSchema,
    capabilities_schema: CompiledSchema,
    inspection_schema: CompiledSchema,
    assessment_schema: CompiledSchema,
    manifest_schema: CompiledSchema,
    manifest_inspection_schema: CompiledSchema,
    next_selection_token: u64,
}

impl ActionPlanRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            ctx.charge_text(source.encode_utf16().count(), Utf16::default())?;
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
        let resources = engine.schema_resources_with_context(ctx)?;
        let actions_package = read(
            include_str!("../../../spec/extensions/actions/package.json"),
            ctx,
        )?;
        let mut registry = Registry::new();
        registry.register(
            &actions_package,
            Some(ACTION_TOKEN),
            engine.package_schema(),
            &resources,
            ctx,
        )?;
        let mut action_resources = resources;
        let executor_profile = read(
            include_str!("../../../spec/extensions/actions/executor-profile.schema.json"),
            ctx,
        )?;
        action_resources
            .entries
            .push((Utf16::from(EXECUTOR_PROFILE_URI), executor_profile));
        let plan_value = read(
            include_str!("../../../spec/extensions/actions/plan.schema.json"),
            ctx,
        )?;
        action_resources
            .entries
            .push((Utf16::from(PLAN_URI), copy_json(&plan_value, ctx)?));
        let plan_schema = CompiledSchema::compile(&plan_value, &action_resources, ctx)?;
        let model_schema = compile_resource(
            include_str!("../../../spec/extensions/actions/plan-model.schema.json"),
            &action_resources,
            ctx,
        )?;
        let capabilities_schema = compile_resource(
            include_str!("../../../spec/extensions/actions/plan-capabilities.schema.json"),
            &action_resources,
            ctx,
        )?;
        let inspection_schema = compile_resource(
            include_str!("../../../spec/extensions/actions/plan-inspection.schema.json"),
            &action_resources,
            ctx,
        )?;
        let assessment_schema = compile_resource(
            include_str!("../../../spec/extensions/actions/plan-assessment.schema.json"),
            &action_resources,
            ctx,
        )?;
        let manifest_schema = compile_resource(
            include_str!("../../../spec/extensions/actions/manifest.schema.json"),
            &action_resources,
            ctx,
        )?;
        let manifest_root = read(
            include_str!("../../../spec/extensions/actions/manifest.schema.json"),
            ctx,
        )?;
        action_resources.entries.push((
            Utf16::from("urn:umf:actions:manifest:1"),
            copy_json(&manifest_root, ctx)?,
        ));
        let plan_inspection_root = read(
            include_str!("../../../spec/extensions/actions/plan-inspection.schema.json"),
            ctx,
        )?;
        action_resources.entries.push((
            Utf16::from("urn:umf:actions:plan-inspection:1"),
            copy_json(&plan_inspection_root, ctx)?,
        ));
        let manifest_inspection_schema = compile_resource(
            include_str!("../../../spec/extensions/actions/manifest-inspection.schema.json"),
            &action_resources,
            ctx,
        )?;
        Ok(Self {
            engine,
            registry,
            plan_schema,
            model_schema,
            capabilities_schema,
            inspection_schema,
            assessment_schema,
            manifest_schema,
            manifest_inspection_schema,
            next_selection_token: 1,
        })
    }

    /// Inspect one original manifest after its nested Action Plan has already
    /// passed the staged Registry and selection continuations. The plan
    /// inspection is checked against the exact nested source before its
    /// resolved pins and Rust Action analysis are used.
    pub fn inspect_manifest(
        &self,
        artifact: &Value,
        plan_inspection: &Value,
        models: &Value,
        actions: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        const MANIFEST_MAX: usize = 16_777_216;
        let source = read_artifact_source(artifact, MANIFEST_MAX, ctx)?;
        let parsed = parse_artifact(&source, ctx);
        let mut manifest_value = None;
        let mut plan_value = None;
        let mut diagnostics = Vec::new();
        let validation = (|| {
            let manifest = parsed?;
            manifest_value = Some(copy_json(&manifest, ctx)?);
            plan_value = Some(copy_json(plan_inspection, ctx)?);
            validate_schema(&self.manifest_schema, &manifest, "PAP_INVALID", ctx)?;
            reject_unknown_members(
                &manifest,
                &[
                    "protocol",
                    "plan",
                    "action",
                    "basis",
                    "items",
                    "batches",
                    "annotations",
                ],
                "PAP_UNKNOWN",
            )?;
            reject_unknown_members(
                field(&manifest, "action").unwrap_or(&Value::Null),
                &["target", "documentSha256", "invocation"],
                "PAP_UNKNOWN",
            )?;
            reject_unknown_members(
                field(field(&manifest, "action").unwrap_or(&Value::Null), "target")
                    .unwrap_or(&Value::Null),
                &["module", "action", "revision"],
                "PAP_UNKNOWN",
            )?;
            reject_unknown_members(
                field(
                    field(&manifest, "action").unwrap_or(&Value::Null),
                    "invocation",
                )
                .unwrap_or(&Value::Null),
                &["id", "version"],
                "PAP_UNKNOWN",
            )?;
            reject_unknown_members(
                field(&manifest, "basis").unwrap_or(&Value::Null),
                &["profile", "store", "epoch", "cut", "selectionSha256"],
                "PAP_UNKNOWN",
            )?;
            reject_unknown_members(
                field(field(&manifest, "basis").unwrap_or(&Value::Null), "profile")
                    .unwrap_or(&Value::Null),
                &["id", "version"],
                "PAP_UNKNOWN",
            )?;
            validate_schema(&self.inspection_schema, plan_inspection, "PAP_INVALID", ctx)?;
            if bool_field(plan_inspection, "eligible") != Some(true) {
                return Err(err("PAP_ACTION", "Original plan is ineligible"));
            }
            let plan_source = field(plan_inspection, "source")
                .ok_or_else(|| err("PAP_INVALID", "Fresh plan source missing"))?;
            if !json_equal(
                field(&manifest, "plan").unwrap_or(&Value::Null),
                plan_source,
                ctx,
            )? {
                return Err(err(
                    "PAP_INTEGRITY",
                    "Manifest plan differs from fresh plan source",
                ));
            }
            let plan = field(plan_inspection, "plan")
                .filter(|value| !matches!(value, Value::Null))
                .ok_or_else(|| err("PAP_ACTION", "Fresh plan interpretation is absent"))?;
            let model_pin =
                field(plan, "model").ok_or_else(|| err("PAP_INVALID", "Model pin missing"))?;
            let action_pin =
                field(plan, "action").ok_or_else(|| err("PAP_INVALID", "Action pin missing"))?;
            let (document, action, _, _, action_path, warnings) =
                self.resolve_originals(model_pin, action_pin, models, actions, ctx)?;
            let bound = first_set_subset(
                &document,
                &action,
                &action_path,
                &warnings,
                ddd_declared(&document),
                ctx,
            )?;
            validate_assignments(&document, plan, &bound, &self.engine, ctx)?;
            let action_header = field(&manifest, "action")
                .ok_or_else(|| err("PAP_INVALID", "Action correspondence missing"))?;
            let header_target = field(action_header, "target")
                .ok_or_else(|| err("PAP_INVALID", "Action target missing"))?;
            if text(field(header_target, "module"))
                != text(field(
                    field(action_pin, "identity").unwrap_or(&Value::Null),
                    "module",
                ))
                || text(field(header_target, "action"))
                    != text(field(
                        field(action_pin, "identity").unwrap_or(&Value::Null),
                        "action",
                    ))
                || field(action_header, "documentSha256") != field(action_pin, "documentSha256")
                || !json_equal(
                    field(action_header, "invocation").unwrap_or(&Value::Null),
                    field(action_pin, "invocation").unwrap_or(&Value::Null),
                    ctx,
                )?
            {
                return Err(err("PAP_ACTION", "Original action correspondence mismatch"));
            }
            let selection =
                field(plan, "selection").ok_or_else(|| err("PAP_INVALID", "Selection missing"))?;
            let selection_artifact = field(selection, "artifact")
                .ok_or_else(|| err("PAP_INVALID", "Selection artifact missing"))?;
            let basis = field(&manifest, "basis")
                .ok_or_else(|| err("PAP_INVALID", "Manifest basis missing"))?;
            if field(basis, "selectionSha256") != field(selection_artifact, "sha256") {
                return Err(err("PAP_INTEGRITY", "Selection basis digest differs"));
            }
            let limits =
                field(plan, "limits").ok_or_else(|| err("PAP_INVALID", "Plan limits missing"))?;
            let max_items = number(field(limits, "maxItems")).unwrap_or(-1.0) as usize;
            let max_bytes = number(field(limits, "maxManifestBytes")).unwrap_or(-1.0) as usize;
            let utf8 = text(field(&source, "utf8"))
                .ok_or_else(|| err("PAP_INVALID", "Manifest source invalid"))?;
            if utf8.len() > max_bytes {
                return Err(err("PAP_LIMIT", "Original plan manifest limit exceeded"));
            }
            let items = array_field(&manifest, "items")
                .ok_or_else(|| err("PAP_INVALID", "Manifest items missing"))?;
            let batches = array_field(&manifest, "batches")
                .ok_or_else(|| err("PAP_INVALID", "Manifest batches missing"))?;
            if items.len() > max_items {
                return Err(err(
                    "PAP_LIMIT",
                    "Original plan manifest item limit exceeded",
                ));
            }
            let execution =
                field(plan, "execution").ok_or_else(|| err("PAP_INVALID", "Execution missing"))?;
            let batch_size = number(field(execution, "batchSize"))
                .filter(|n| *n >= 1.0)
                .ok_or_else(|| err("PAP_INVALID", "Batch size missing"))?
                as usize;
            if batches.len() != items.len().div_ceil(batch_size) {
                return Err(err("PAP_INVALID", "Incomplete deterministic partition"));
            }
            for (index, batch) in batches.iter().enumerate() {
                reject_unknown_members(batch, &["ordinal", "start", "count"], "PAP_UNKNOWN")?;
                let start = index.saturating_mul(batch_size);
                let count = batch_size.min(items.len().saturating_sub(start));
                if number(field(batch, "ordinal")) != Some(index as f64)
                    || number(field(batch, "start")) != Some(start as f64)
                    || number(field(batch, "count")) != Some(count as f64)
                {
                    return Err(EngineError::new(
                        "PAP_INVALID",
                        Utf16::from(format!("/batches/{index}")),
                        "Full-first manifest-order partition required",
                    ));
                }
            }
            let basis_store = field(basis, "store");
            let basis_epoch = field(basis, "epoch");
            let mut guard_profile: Option<Value> = None;
            let mut identities = BTreeSet::new();
            let mut tuple_keys = BTreeSet::new();
            let entity_parameter = text(Some(&bound.entity_parameter))
                .ok_or_else(|| err("PAP_ACTION", "Entity parameter missing"))?;
            let mut expected_inputs = BTreeSet::new();
            expected_inputs.insert(entity_parameter.clone());
            let plan_inputs =
                field(plan, "inputs").ok_or_else(|| err("PAP_INVALID", "Plan inputs missing"))?;
            for assignment in array_field(plan_inputs, "assignments")
                .ok_or_else(|| err("PAP_INVALID", "Plan assignments missing"))?
            {
                expected_inputs.insert(
                    text(field(assignment, "input"))
                        .ok_or_else(|| err("PAP_INVALID", "Assignment input missing"))?,
                );
            }
            let expected_frames = array(&bound.frames).unwrap_or(&[]);
            for (index, item) in items.iter().enumerate() {
                let path = format!("/items/{index}");
                reject_unknown_members(
                    item,
                    &["ordinal", "entity", "guard", "inputs", "expectedVersions"],
                    "PAP_UNKNOWN",
                )?;
                let item_entity = field(item, "entity").unwrap_or(&Value::Null);
                reject_unknown_members(item_entity, &["key", "components"], "PAP_UNKNOWN")?;
                reject_unknown_members(
                    field(item_entity, "key").unwrap_or(&Value::Null),
                    &["module", "element", "key"],
                    "PAP_UNKNOWN",
                )?;
                reject_unknown_members(
                    field(item, "guard").unwrap_or(&Value::Null),
                    &["profile", "store", "epoch", "identity", "version"],
                    "PAP_UNKNOWN",
                )?;
                reject_unknown_members(
                    field(field(item, "guard").unwrap_or(&Value::Null), "profile")
                        .unwrap_or(&Value::Null),
                    &["id", "version"],
                    "PAP_UNKNOWN",
                )?;
                for entry in array_field(item, "expectedVersions").unwrap_or(&[]) {
                    reject_unknown_members(entry, &["frame", "version"], "PAP_UNKNOWN")?;
                }
                if number(field(item, "ordinal")) != Some(index as f64) {
                    return Err(EngineError::new(
                        "PAP_INVALID",
                        Utf16::from(path.as_str()),
                        "Consecutive item ordinal required",
                    ));
                }
                let guard =
                    field(item, "guard").ok_or_else(|| err("PAP_INVALID", "Guard missing"))?;
                if field(guard, "store") != basis_store || field(guard, "epoch") != basis_epoch {
                    return Err(EngineError::new(
                        "PAP_GUARD",
                        Utf16::from(format!("{path}/guard")),
                        "Guard scope mismatch",
                    ));
                }
                let profile = field(guard, "profile")
                    .ok_or_else(|| err("PAP_PROFILE", "Guard profile missing"))?;
                if let Some(previous) = &guard_profile {
                    if !json_equal(previous, profile, ctx)? {
                        return Err(EngineError::new(
                            "PAP_PROFILE",
                            Utf16::from(format!("{path}/guard/profile")),
                            "One declared guard profile required",
                        ));
                    }
                } else {
                    guard_profile = Some(copy_json(profile, ctx)?);
                }
                let identity = text(field(guard, "identity"))
                    .ok_or_else(|| err("PAP_GUARD", "Guard identity missing"))?;
                if !identities.insert(identity) {
                    return Err(EngineError::new(
                        "PAP_SELECTION",
                        Utf16::from(format!("{path}/guard/identity")),
                        "Duplicate canonical identity",
                    ));
                }
                let entity =
                    field(item, "entity").ok_or_else(|| err("PAP_INVALID", "Entity missing"))?;
                let key =
                    field(entity, "key").ok_or_else(|| err("PAP_INVALID", "Entity Key missing"))?;
                if !json_equal(key, &bound.target, ctx)? {
                    return Err(EngineError::new(
                        "PAP_ACTION",
                        Utf16::from(format!("{path}/entity")),
                        "Exact original entity Key required",
                    ));
                }
                let components = field(entity, "components")
                    .ok_or_else(|| err("PAP_INVALID", "Key components missing"))?;
                let mut native_capabilities = NativeActionCapabilities;
                let receipt = crate::core_key_tuple::encode_core_key_tuple(
                    &document,
                    key,
                    components,
                    None,
                    &self.engine,
                    &self.registry,
                    &mut native_capabilities,
                    ctx,
                )?;
                let tuple = text(field(&receipt, "bytesHex"))
                    .ok_or_else(|| err("PAP_INVALID", "Key tuple bytes missing"))?;
                if !tuple_keys.insert(tuple) {
                    return Err(EngineError::new(
                        "PAP_SELECTION",
                        Utf16::from(format!("{path}/entity")),
                        "Nonunique logical Key",
                    ));
                }
                let inputs = field(item, "inputs")
                    .ok_or_else(|| err("PAP_INVALID", "Manifest inputs missing"))?;
                let Value::Object(input_fields) = inputs else {
                    return Err(err("PAP_ACTION", "Action inputs must be an object"));
                };
                if input_fields.len() != expected_inputs.len()
                    || input_fields
                        .iter()
                        .any(|(id, _)| !expected_inputs.contains(&id.to_utf8().unwrap_or_default()))
                {
                    return Err(EngineError::new(
                        "PAP_ACTION",
                        Utf16::from(format!("{path}/inputs")),
                        "Complete original action inputs required",
                    ));
                }
                let entity_input = field(inputs, &entity_parameter)
                    .ok_or_else(|| err("PAP_ACTION", "Entity input missing"))?;
                if !json_equal(entity_input, entity, ctx)? {
                    return Err(EngineError::new(
                        "PAP_ACTION",
                        Utf16::from(format!("{path}/inputs")),
                        "Entity input correspondence mismatch",
                    ));
                }
                for assignment in array_field(plan_inputs, "assignments").unwrap_or(&[]) {
                    let id = text(field(assignment, "input"))
                        .ok_or_else(|| err("PAP_INVALID", "Assignment input missing"))?;
                    if !json_equal(
                        field(inputs, &id).unwrap_or(&Value::Null),
                        field(assignment, "value").unwrap_or(&Value::Null),
                        ctx,
                    )? {
                        return Err(EngineError::new(
                            "PAP_ACTION",
                            Utf16::from(format!("{path}/inputs/{id}")),
                            "Input differs from exact plan constant",
                        ));
                    }
                }
                let versions = array_field(item, "expectedVersions")
                    .ok_or_else(|| err("PAP_INVALID", "Expected versions missing"))?;
                let version = field(guard, "version")
                    .ok_or_else(|| err("PAP_GUARD", "Whole-entity version missing"))?;
                if versions.len() != expected_frames.len()
                    || versions.iter().zip(expected_frames).any(|(entry, frame)| {
                        field(entry, "frame") != Some(frame)
                            || field(entry, "version") != Some(version)
                    })
                {
                    return Err(EngineError::new(
                        "PAP_GUARD",
                        Utf16::from(format!("{path}/expectedVersions")),
                        "Every original frame requires ordered whole-entity version",
                    ));
                }
            }
            Ok(())
        })();
        if let Err(failure) = validation {
            if failure.is_control_failure() {
                return Err(failure);
            }
            diagnostics.push(error_as_plan_diagnostic(failure));
        }
        let result = object(vec![
            ("manifest", manifest_value.unwrap_or(Value::Null)),
            ("source", source),
            ("plan", plan_value.unwrap_or(Value::Null)),
            ("eligible", Value::Bool(diagnostics.is_empty())),
            ("diagnostics", Value::Array(diagnostics)),
        ]);
        validate_schema(
            &self.manifest_inspection_schema,
            &result,
            "PAP_INVALID",
            ctx,
        )?;
        Ok(result)
    }

    pub fn construct_manifest(
        &self,
        request: &Value,
        plan_inspection: &Value,
        models: &Value,
        actions: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        reject_unknown_members(request, &["plan", "action", "basis", "rows"], "PAP_INVALID")?;
        validate_schema(&self.inspection_schema, plan_inspection, "PAP_INVALID", ctx)?;
        if bool_field(plan_inspection, "eligible") != Some(true) {
            return Err(err("PAP_ACTION", "Original plan is ineligible"));
        }
        let plan = field(plan_inspection, "plan")
            .ok_or_else(|| err("PAP_INVALID", "Plan inspection missing"))?;
        let plan = if matches!(plan, Value::Null) {
            return Err(err("PAP_ACTION", "Original plan is ineligible"));
        } else {
            plan
        };
        if !json_equal(
            field(request, "plan").unwrap_or(&Value::Null),
            field(plan_inspection, "source").unwrap_or(&Value::Null),
            ctx,
        )? {
            return Err(err(
                "PAP_INTEGRITY",
                "Construction plan differs from fresh original plan",
            ));
        }
        let rows = array_field(request, "rows")
            .ok_or_else(|| err("PAP_INVALID", "Selected rows array required"))?;
        if rows.len() > 10_000 {
            return Err(err("PAP_LIMIT", "Selected row bound exceeded"));
        }
        let model_pin =
            field(plan, "model").ok_or_else(|| err("PAP_INVALID", "Model pin missing"))?;
        let action_pin =
            field(plan, "action").ok_or_else(|| err("PAP_INVALID", "Action pin missing"))?;
        let (document, action, _, _, action_path, warnings) =
            self.resolve_originals(model_pin, action_pin, models, actions, ctx)?;
        let bound = first_set_subset(
            &document,
            &action,
            &action_path,
            &warnings,
            ddd_declared(&document),
            ctx,
        )?;
        validate_assignments(&document, plan, &bound, &self.engine, ctx)?;
        let limits =
            field(plan, "limits").ok_or_else(|| err("PAP_INVALID", "Plan limits missing"))?;
        if rows.len() > number(field(limits, "maxItems")).unwrap_or(0.0) as usize {
            return Err(err("PAP_LIMIT", "Selected rows exceed original plan limit"));
        }
        let mut items = Vec::with_capacity(rows.len());
        let mut key_receipts = Vec::with_capacity(rows.len());
        let plan_inputs =
            field(plan, "inputs").ok_or_else(|| err("PAP_INVALID", "Plan inputs missing"))?;
        let entity_parameter = text(field(plan_inputs, "entityParameter"))
            .ok_or_else(|| err("PAP_ACTION", "Entity parameter missing"))?;
        let execution =
            field(plan, "execution").ok_or_else(|| err("PAP_INVALID", "Execution missing"))?;
        let frames = array(&bound.frames).unwrap_or(&[]);
        for (ordinal, row) in rows.iter().enumerate() {
            reject_unknown_members(row, &["entity", "guard", "keyReceipt"], "PAP_INVALID")?;
            let entity = field(row, "entity")
                .ok_or_else(|| err("PAP_INVALID", "Selected entity missing"))?;
            reject_unknown_members(entity, &["key", "components"], "PAP_INVALID")?;
            let guard =
                field(row, "guard").ok_or_else(|| err("PAP_INVALID", "Selected guard missing"))?;
            let version = text(field(guard, "version"))
                .filter(|v| !v.is_empty() && v.encode_utf16().count() <= 256)
                .ok_or_else(|| err("PAP_INVALID", "Bounded original guard version required"))?;
            let receipt = field(row, "keyReceipt")
                .ok_or_else(|| err("PAP_INVALID", "Original Core Key receipt required"))?;
            let mut native_capabilities = NativeActionCapabilities;
            let verified = crate::core_key_tuple::verify_core_key_tuple(
                receipt,
                &document,
                &self.engine,
                &self.registry,
                &mut native_capabilities,
                ctx,
            )?;
            let identity = field(&verified, "identity")
                .ok_or_else(|| err("PAP_GUARD", "Key receipt identity missing"))?;
            let key = field(entity, "key")
                .ok_or_else(|| err("PAP_INVALID", "Selected entity Key missing"))?;
            if !json_equal(identity, &bound.target, ctx)? || !json_equal(key, &bound.target, ctx)? {
                return Err(err(
                    "PAP_GUARD",
                    "Original selected Key receipt identity mismatch",
                ));
            }
            let mut native_capabilities = NativeActionCapabilities;
            let selected = crate::core_key_tuple::encode_core_key_tuple(
                &document,
                key,
                field(entity, "components")
                    .ok_or_else(|| err("PAP_INVALID", "Key components missing"))?,
                None,
                &self.engine,
                &self.registry,
                &mut native_capabilities,
                ctx,
            )?;
            if field(&selected, "bytesHex") != field(&verified, "bytesHex") {
                return Err(err(
                    "PAP_GUARD",
                    "Original selected Key receipt tuple mismatch",
                ));
            }
            key_receipts.push(verified);
            let mut input_fields = vec![(
                Utf16::from(entity_parameter.as_str()),
                copy_json(entity, ctx)?,
            )];
            for assignment in array_field(plan_inputs, "assignments")
                .ok_or_else(|| err("PAP_INVALID", "Plan assignments missing"))?
            {
                let input = text(field(assignment, "input"))
                    .ok_or_else(|| err("PAP_INVALID", "Assignment input missing"))?;
                input_fields.push((
                    Utf16::from(input),
                    copy_json(
                        field(assignment, "value")
                            .ok_or_else(|| err("PAP_INVALID", "Assignment value missing"))?,
                        ctx,
                    )?,
                ));
            }
            let inputs = Value::Object(input_fields);
            let mut versions = Vec::with_capacity(frames.len());
            for frame in frames {
                versions.push(object(vec![
                    ("frame", copy_json(frame, ctx)?),
                    ("version", s(&version)),
                ]));
            }
            let expected_versions = Value::Array(versions);
            items.push(object(vec![
                ("ordinal", Value::Number(ordinal as f64)),
                ("entity", copy_json(entity, ctx)?),
                ("guard", copy_json(guard, ctx)?),
                ("inputs", inputs),
                ("expectedVersions", expected_versions),
            ]));
        }
        let batch_size = number(field(execution, "batchSize"))
            .filter(|v| *v >= 1.0)
            .ok_or_else(|| err("PAP_INVALID", "Batch size missing"))?
            as usize;
        let batches = (0..rows.len().div_ceil(batch_size))
            .map(|ordinal| {
                let start = ordinal * batch_size;
                object(vec![
                    ("ordinal", Value::Number(ordinal as f64)),
                    ("start", Value::Number(start as f64)),
                    (
                        "count",
                        Value::Number(batch_size.min(rows.len() - start) as f64),
                    ),
                ])
            })
            .collect();
        let manifest = object(vec![
            ("protocol", s("umf.actions.manifest/1")),
            (
                "plan",
                copy_json(field(plan_inspection, "source").unwrap(), ctx)?,
            ),
            (
                "action",
                copy_json(
                    field(request, "action")
                        .ok_or_else(|| err("PAP_INVALID", "Action header missing"))?,
                    ctx,
                )?,
            ),
            (
                "basis",
                copy_json(
                    field(request, "basis")
                        .ok_or_else(|| err("PAP_INVALID", "Manifest basis missing"))?,
                    ctx,
                )?,
            ),
            ("items", Value::Array(items)),
            ("batches", Value::Array(batches)),
        ]);
        validate_schema(&self.manifest_schema, &manifest, "PAP_INVALID", ctx)?;
        let mut canonical = copy_json(&manifest, ctx)?;
        sort_object_keys(&mut canonical);
        let utf8_units = serialization::stringify_compact(&canonical)?;
        let utf8 = utf8_units
            .to_utf8()
            .map_err(|_| err("PAP_INVALID", "Canonical manifest contains invalid Unicode"))?;
        if utf8.len() > number(field(limits, "maxManifestBytes")).unwrap_or(0.0) as usize {
            return Err(err("PAP_LIMIT", "Manifest byte limit exceeded"));
        }
        let artifact = object(vec![
            ("mediaType", s("application/json")),
            ("utf8", Value::String(utf8_units)),
            ("sha256", s(&hex(&Sha256::digest(utf8.as_bytes())))),
        ]);
        let checked = self.inspect_manifest(&artifact, plan_inspection, models, actions, ctx)?;
        if bool_field(&checked, "eligible") != Some(true) {
            return Err(err(
                "PAP_ACTION",
                "Constructed manifest refused by fresh inspector",
            ));
        }
        Ok(object(vec![
            ("artifact", artifact),
            ("keyReceipts", Value::Array(key_receipts)),
            ("sealed", Value::Bool(false)),
            ("complete", Value::Bool(false)),
            ("authority", Value::Bool(false)),
        ]))
    }

    pub fn assess_manifest(
        &self,
        supplied: &Value,
        fresh: &Value,
        capabilities: &Value,
        plan_assessment: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let refusal = |error: EngineError| -> Value {
            object(vec![
                ("compatible", Value::Bool(false)),
                ("executionVerified", Value::Bool(false)),
                ("obligations", Value::Array(Vec::new())),
                (
                    "diagnostics",
                    Value::Array(vec![error_as_plan_diagnostic(error)]),
                ),
            ])
        };
        let result = (|| {
            reject_unknown_members(
                supplied,
                &["manifest", "source", "plan", "eligible", "diagnostics"],
                "PAP_INVALID",
            )?;
            reject_unknown_members(
                fresh,
                &["manifest", "source", "plan", "eligible", "diagnostics"],
                "PAP_INVALID",
            )?;
            validate_schema(
                &self.manifest_inspection_schema,
                supplied,
                "PAP_INVALID",
                ctx,
            )?;
            validate_schema(&self.manifest_inspection_schema, fresh, "PAP_INVALID", ctx)?;
            validate_schema(&self.assessment_schema, plan_assessment, "PAP_INVALID", ctx)?;
            if bool_field(fresh, "eligible") != Some(true) || !json_equal(supplied, fresh, ctx)? {
                return Err(err(
                    "PAP_ACTION",
                    "Manifest inspection differs from fresh original inspection or is ineligible",
                ));
            }
            if bool_field(plan_assessment, "compatible") != Some(true) {
                return Ok(copy_json(plan_assessment, ctx)?);
            }
            let manifest = field(fresh, "manifest")
                .ok_or_else(|| err("PAP_INVALID", "Fresh manifest missing"))?;
            let basis_profile = field(field(manifest, "basis").unwrap_or(&Value::Null), "profile")
                .ok_or_else(|| err("PAP_PROFILE", "Manifest basis profile missing"))?;
            let snapshot_profile = field(
                field(capabilities, "snapshot").unwrap_or(&Value::Null),
                "profile",
            )
            .ok_or_else(|| err("PAP_PROFILE", "Snapshot capability profile missing"))?;
            if !json_equal(basis_profile, snapshot_profile, ctx)? {
                return Err(err(
                    "PAP_PROFILE",
                    "Exact manifest snapshot capability required",
                ));
            }
            for item in array_field(manifest, "items").unwrap_or(&[]) {
                let guard_profile = field(field(item, "guard").unwrap_or(&Value::Null), "profile")
                    .ok_or_else(|| err("PAP_PROFILE", "Manifest guard profile missing"))?;
                let cap_profile = field(
                    field(capabilities, "guard").unwrap_or(&Value::Null),
                    "profile",
                )
                .ok_or_else(|| err("PAP_PROFILE", "Guard capability profile missing"))?;
                if !json_equal(guard_profile, cap_profile, ctx)? {
                    return Err(err(
                        "PAP_PROFILE",
                        "Exact manifest guard capability required",
                    ));
                }
            }
            Ok(copy_json(plan_assessment, ctx)?)
        })();
        Ok(match result {
            Ok(value) => value,
            Err(error) if error.is_control_failure() => return Err(error),
            Err(error) => refusal(error),
        })
    }

    pub fn prepare_model(
        &self,
        model_pin: &Value,
        action_pin: &Value,
        models: &Value,
        actions: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let (document, action, model, portable_action, action_path, warnings) =
            self.resolve_originals(model_pin, action_pin, models, actions, ctx)?;
        let bound = first_set_subset(
            &document,
            &action,
            &action_path,
            &warnings,
            ddd_declared(&document),
            ctx,
        )?;
        let value = object(vec![
            ("protocol", s("umf.actions.plan-model/1")),
            ("model", copy_json(&model, ctx)?),
            ("action", copy_json(&portable_action, ctx)?),
            ("entityParameter", bound.entity_parameter),
            ("target", bound.target),
            ("assignments", bound.assignments),
            ("frames", bound.frames),
            (
                "producer",
                object(vec![
                    ("id", s("umf.actions.plan-model")),
                    ("version", s("1")),
                    ("build", producer_build(ctx)?),
                ]),
            ),
            (
                "schema",
                object(vec![
                    ("id", s("urn:umf:actions:plan-model:1")),
                    (
                        "sha256",
                        s(&hex(&Sha256::digest(include_bytes!(
                            "../../../spec/extensions/actions/plan-model.schema.json"
                        )))),
                    ),
                ]),
            ),
            (
                "obligations",
                prepared_obligations(
                    array(&bound.obligations)
                        .ok_or_else(|| err("PAP_INVALID", "Prepared obligations are malformed"))?,
                    ctx,
                )?,
            ),
        ]);
        validate_schema(&self.model_schema, &value, "PAP_INVALID", ctx)?;
        prepared_artifact(value, ctx)
    }

    /// Source that a caller-supplied Registry must validate before this
    /// operation is allowed to return a portable artifact.
    pub fn model_registry_source(
        &self,
        model_pin: &Value,
        action_pin: &Value,
        models: &Value,
        actions: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let (document, action, _, _, path, warnings) =
            self.resolve_originals(model_pin, action_pin, models, actions, ctx)?;
        let _ = first_set_subset(
            &document,
            &action,
            &path,
            &warnings,
            ddd_declared(&document),
            ctx,
        )?;
        copy_json(&document, ctx)
    }

    /// Admit the external Action Plan artifact exactly as the public read
    /// boundary does, before any non-throwing inspection report is created.
    pub fn read_inspection_source(
        &self,
        artifact: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        read_artifact_source(artifact, PLAN_MAX, ctx)
    }

    /// Ordinary inspection failures after artifact admission are report data,
    /// matching the synchronous public Action Plan contract.
    pub fn blocked_inspection(
        &self,
        source: Value,
        failure: EngineError,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if failure.is_control_failure() {
            return Err(failure);
        }
        let result = object(vec![
            ("plan", Value::Null),
            ("source", source),
            ("eligible", Value::Bool(false)),
            (
                "diagnostics",
                Value::Array(vec![error_as_plan_diagnostic(failure)]),
            ),
        ]);
        validate_schema(&self.inspection_schema, &result, "PAP_INVALID", ctx)?;
        Ok(result)
    }

    /// Assessment is always a report, including failures before the fresh
    /// selection continuation can be requested.
    pub fn blocked_assessment(
        &self,
        failure: EngineError,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if failure.is_control_failure() {
            return Err(failure);
        }
        let result = object(vec![
            ("compatible", Value::Bool(false)),
            ("executionVerified", Value::Bool(false)),
            ("obligations", Value::Array(Vec::new())),
            (
                "diagnostics",
                Value::Array(vec![error_as_plan_diagnostic(failure)]),
            ),
        ]);
        validate_schema(&self.assessment_schema, &result, "PAP_INVALID", ctx)?;
        Ok(result)
    }

    /// Admit only diagnostics produced by the explicitly installed host
    /// Registry. Rust still computes first-set semantics and eligibility.
    pub fn registry_diagnostics_refusal(
        &self,
        document: &Value,
        action_pin: &Value,
        diagnostics: &Value,
        ddd_semantics: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Vec<Value>>, EngineError> {
        let diagnostics = array(diagnostics)
            .ok_or_else(|| err("PAP_PROFILE", "Registry diagnostics must be an array"))?;
        if diagnostics.len() > 4096 {
            return Err(err("PAP_LIMIT", "Registry diagnostic bound exceeded"));
        }
        ctx.charge_work(diagnostics.len(), Utf16::default())?;
        let (action, path) = locate_action(document, action_pin, ctx)?;
        let ddd_interpreted = ddd_semantics && ddd_declared(document);
        let checked = match first_set_subset(document, &action, &path, &[], ddd_interpreted, ctx) {
            Ok(value) => value,
            Err(error) if error.is_control_failure() => return Err(error),
            Err(error) => return Ok(Some(vec![error_as_plan_diagnostic(error)])),
        };
        let obligations = array(&checked.obligations).unwrap_or(&[]);
        ctx.charge_work(obligations.len(), Utf16::default())?;
        let mut model_paths = Vec::with_capacity(obligations.len());
        for obligation in obligations {
            if text(field(obligation, "kind")).as_deref() == Some("model") {
                if let Some(path) = text(field(obligation, "path")) {
                    model_paths.push(path);
                }
            }
        }
        let mut retained = Vec::with_capacity(diagnostics.len());
        let mut refusal = false;
        for diagnostic in diagnostics {
            reject_unknown_members(
                diagnostic,
                &["code", "path", "message", "severity"],
                "PAP_PROFILE",
            )?;
            let code = text(field(diagnostic, "code"))
                .ok_or_else(|| err("PAP_PROFILE", "Registry diagnostic code missing"))?;
            let path = text(field(diagnostic, "path"))
                .ok_or_else(|| err("PAP_PROFILE", "Registry diagnostic path missing"))?;
            let message = text(field(diagnostic, "message"))
                .ok_or_else(|| err("PAP_PROFILE", "Registry diagnostic message missing"))?;
            let severity = text(field(diagnostic, "severity"))
                .ok_or_else(|| err("PAP_PROFILE", "Registry diagnostic severity missing"))?;
            if code.is_empty()
                || code.encode_utf16().count() > 256
                || path.encode_utf16().count() > 4096
                || message.encode_utf16().count() > 1024
                || !matches!(severity.as_str(), "error" | "warning")
            {
                return Err(err("PAP_PROFILE", "Malformed Registry diagnostic"));
            }
            retained.push(plan_diagnostic(&code, &path, &message));
            if severity == "error" {
                refusal = true;
                continue;
            }
            // Rust owns Action meaning; foreign Registry warnings block only
            // when they touch a model dependency this plan relies on.
            if !code.starts_with("ACTION_")
                && model_paths
                    .iter()
                    .any(|base| path == *base || path.starts_with(&(base.clone() + "/")))
            {
                refusal = true;
            }
        }
        if refusal {
            Ok(Some(retained))
        } else {
            Ok(None)
        }
    }

    pub fn prepare_inspection(
        &mut self,
        artifact: &Value,
        models: &Value,
        actions: &Value,
        selections: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(ActionPlanSelectionRequest, ActionPlanPendingInspection), EngineError> {
        let source = read_artifact(artifact, PLAN_MAX, ctx)?;
        let plan = parse_artifact(&source, ctx)?;
        validate_schema(&self.plan_schema, &plan, "PAP_INVALID", ctx)?;
        reject_unknown_members(
            &plan,
            &[
                "protocol",
                "model",
                "source",
                "selection",
                "action",
                "target",
                "inputs",
                "execution",
                "limits",
                "annotations",
            ],
            "PAP_UNKNOWN",
        )?;
        validate_plan_envelopes(&plan)?;
        let (document, action, model, portable_action, action_path, warnings) = self
            .resolve_originals(
                field(&plan, "model").ok_or_else(|| err("PAP_INVALID", "model pin missing"))?,
                field(&plan, "action").ok_or_else(|| err("PAP_INVALID", "action pin missing"))?,
                models,
                actions,
                ctx,
            )?;
        let bound = first_set_subset(
            &document,
            &action,
            &action_path,
            &warnings,
            ddd_declared(&document),
            ctx,
        )?;
        for plan_source in [
            field(&plan, "source").ok_or_else(|| err("PAP_INVALID", "plan source missing"))?,
            field(
                field(&plan, "selection").ok_or_else(|| err("PAP_INVALID", "selection missing"))?,
                "artifact",
            )
            .ok_or_else(|| err("PAP_INVALID", "selection artifact missing"))?,
        ] {
            let artifact = read_artifact(plan_source, PLAN_MAX, ctx)?;
            let _ = parse_artifact(&artifact, ctx)?;
        }
        compare_target(field(&plan, "target"), &bound.target, ctx)?;
        validate_assignments(&document, &plan, &bound, &self.engine, ctx)?;
        let selection =
            field(&plan, "selection").ok_or_else(|| err("PAP_INVALID", "selection missing"))?;
        let profile = field(selection, "profile")
            .ok_or_else(|| err("PAP_INVALID", "selection profile missing"))?;
        find_profile(selections, profile, ctx)?;
        let token = self.next_selection_token;
        self.next_selection_token = token
            .checked_add(1)
            .ok_or_else(|| err("PAP_LIMIT", "selection token exhausted"))?;
        let request = ActionPlanSelectionRequest {
            token,
            profile: copy_json(profile, ctx)?,
            artifact: copy_json(
                field(selection, "artifact")
                    .ok_or_else(|| err("PAP_INVALID", "selection artifact missing"))?,
                ctx,
            )?,
            model: copy_json(&document, ctx)?,
            target: copy_json(
                field(&plan, "target").ok_or_else(|| err("PAP_INVALID", "target missing"))?,
                ctx,
            )?,
        };
        let ddd_interpreted = ddd_declared(&document);
        let pending = ActionPlanPendingInspection {
            source,
            plan,
            document,
            assessment: None,
            ddd_interpreted,
        };
        Ok((request, pending))
    }

    pub fn complete_inspection(
        &self,
        pending: ActionPlanPendingInspection,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut pending = pending;
        let assessment = pending.assessment.take();
        let completed = (|| {
            let selection = field(&pending.plan, "selection")
                .ok_or_else(|| err("PAP_INVALID", "selection missing"))?;
            let eligible = bool_field(response, "eligible")
                .ok_or_else(|| err("PAP_PROFILE", "selection callback eligible must be boolean"))?;
            let dependencies = array_field(response, "dependencies").ok_or_else(|| {
                err(
                    "PAP_PROFILE",
                    "selection callback dependencies must be an array",
                )
            })?;
            let diagnostics = array_field(response, "diagnostics").ok_or_else(|| {
                err(
                    "PAP_PROFILE",
                    "selection callback diagnostics must be an array",
                )
            })?;
            if dependencies.len() > 256 || diagnostics.len() > 128 {
                return Err(err("PAP_LIMIT", "selection callback result bound exceeded"));
            }
            ctx.charge_work(
                dependencies.len().saturating_add(diagnostics.len()),
                Utf16::default(),
            )?;
            let supplied = array_field(selection, "dependencies")
                .ok_or_else(|| err("PAP_INVALID", "selection dependencies missing"))?;
            let mut result_diagnostics = Vec::new();
            let dependencies_value = field(response, "dependencies")
                .ok_or_else(|| err("PAP_PROFILE", "selection callback dependencies missing"))?;
            let supplied_value = field(selection, "dependencies")
                .ok_or_else(|| err("PAP_INVALID", "selection dependencies missing"))?;
            if !json_equal(dependencies_value, supplied_value, ctx)? {
                result_diagnostics.push(plan_diagnostic(
                    "PAP_ACTION",
                    "/selection/dependencies",
                    "Selection dependency coverage/order mismatch",
                ));
            } else if let Err(error) =
                validate_selection_dependencies(&pending.document, &pending.plan, dependencies, ctx)
            {
                if error.is_control_failure() {
                    return Err(error);
                }
                result_diagnostics.push(error_as_plan_diagnostic(error));
            }
            let mut issues = Vec::new();
            if !eligible || result_diagnostics.len() > 0 {
                issues.push(plan_diagnostic(
                    "PAP_PROFILE",
                    "",
                    "Selected program is not fully interpreted",
                ));
            }
            for diagnostic in diagnostics {
                if !is_diagnostic(diagnostic) {
                    return Err(err("PAP_PROFILE", "Malformed selection diagnostic"));
                }
                if issues.len() >= 128 {
                    return Err(err("PAP_LIMIT", "Diagnostic capacity exceeded"));
                }
                issues.push(copy_json(diagnostic, ctx)?);
            }
            if issues.len() + result_diagnostics.len() > 128 {
                return Err(err("PAP_LIMIT", "Diagnostic capacity exceeded"));
            }
            issues.extend(result_diagnostics);
            let fresh = object(vec![
                ("plan", copy_json(&pending.plan, ctx)?),
                ("source", copy_json(&pending.source, ctx)?),
                ("eligible", Value::Bool(eligible && issues.is_empty())),
                ("diagnostics", Value::Array(issues)),
            ]);
            validate_schema(&self.inspection_schema, &fresh, "PAP_INVALID", ctx)?;
            Ok(fresh)
        })();
        let fresh = match completed {
            Ok(value) => value,
            Err(error) if error.is_control_failure() => return Err(error),
            Err(error) => {
                let result = object(vec![
                    ("plan", copy_json(&pending.plan, ctx)?),
                    ("source", copy_json(&pending.source, ctx)?),
                    ("eligible", Value::Bool(false)),
                    (
                        "diagnostics",
                        Value::Array(vec![error_as_plan_diagnostic(error)]),
                    ),
                ]);
                validate_schema(&self.inspection_schema, &result, "PAP_INVALID", ctx)?;
                result
            }
        };
        if let Some((supplied, capabilities)) = assessment {
            return self.assess_fresh(
                &fresh,
                &supplied,
                &capabilities,
                &pending.document,
                pending.ddd_interpreted,
                ctx,
            );
        }
        Ok(fresh)
    }

    pub fn block_inspection(
        &self,
        pending: ActionPlanPendingInspection,
        error: EngineError,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if error.is_control_failure() {
            return Err(error);
        }
        self.block_inspection_with_diagnostics(pending, vec![error_as_plan_diagnostic(error)], ctx)
    }

    pub fn block_inspection_with_diagnostics(
        &self,
        pending: ActionPlanPendingInspection,
        diagnostics: Vec<Value>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let result = object(vec![
            ("plan", copy_json(&pending.plan, ctx)?),
            ("source", copy_json(&pending.source, ctx)?),
            ("eligible", Value::Bool(false)),
            ("diagnostics", Value::Array(diagnostics)),
        ]);
        validate_schema(&self.inspection_schema, &result, "PAP_INVALID", ctx)?;
        if let Some((supplied, capabilities)) = pending.assessment {
            self.assess_fresh(
                &result,
                &supplied,
                &capabilities,
                &pending.document,
                pending.ddd_interpreted,
                ctx,
            )
        } else {
            Ok(result)
        }
    }

    pub fn prepare_assessment(
        &mut self,
        supplied_inspection: &Value,
        capabilities: &Value,
        models: &Value,
        actions: &Value,
        selections: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(ActionPlanSelectionRequest, ActionPlanPendingInspection), EngineError> {
        validate_schema(
            &self.assessment_schema,
            &object(vec![
                ("compatible", Value::Bool(false)),
                ("executionVerified", Value::Bool(false)),
                ("obligations", Value::Array(Vec::new())),
                ("diagnostics", Value::Array(Vec::new())),
            ]),
            "PAP_INVALID",
            ctx,
        )?;
        let supplied = copy_json(supplied_inspection, ctx)?;
        let capabilities = copy_json(capabilities, ctx)?;
        let source = field(&supplied, "source")
            .ok_or_else(|| err("PAP_INVALID", "inspection source missing"))?;
        let source = copy_json(source, ctx)?;
        let artifact = read_artifact(&source, PLAN_MAX, ctx)?;
        let (request, mut pending) =
            self.prepare_inspection(&artifact, models, actions, selections, ctx)?;
        pending.assessment = Some((supplied, capabilities));
        Ok((request, pending))
    }

    fn assess_fresh(
        &self,
        fresh: &Value,
        supplied: &Value,
        capabilities: &Value,
        document: &Value,
        ddd_interpreted: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut result = object(vec![
            ("compatible", Value::Bool(false)),
            ("executionVerified", Value::Bool(false)),
            ("obligations", Value::Array(Vec::new())),
            ("diagnostics", Value::Array(Vec::new())),
        ]);
        let assessed = (|| {
            if !json_equal(supplied, fresh, ctx)? || bool_field(fresh, "eligible") != Some(true) {
                return Err(err(
                    "PAP_ACTION",
                    "Inspection differs from fresh original inspection or is ineligible",
                ));
            }
            let plan = field(fresh, "plan").ok_or_else(|| err("PAP_INVALID", "plan missing"))?;
            self.validate_capabilities(
                plan,
                capabilities,
                document,
                ddd_interpreted,
                &mut result,
                ctx,
            )
        })();
        if let Err(error) = assessed {
            if error.is_control_failure() {
                return Err(error);
            }
            if let Value::Array(diagnostics) = field_mut(&mut result, "diagnostics").unwrap() {
                diagnostics.push(error_as_plan_diagnostic(error));
            }
        }
        let compatible = array_field(&result, "diagnostics").is_some_and(|d| d.is_empty());
        if let Value::Bool(value) = field_mut(&mut result, "compatible").unwrap() {
            *value = compatible;
        }
        validate_schema(&self.assessment_schema, &result, "PAP_INVALID", ctx)?;
        Ok(result)
    }

    fn validate_capabilities(
        &self,
        plan: &Value,
        capabilities: &Value,
        document: &Value,
        ddd_interpreted: bool,
        result: &mut Value,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        validate_schema(&self.capabilities_schema, capabilities, "PAP_PROFILE", ctx)?;
        reject_unknown_members(
            capabilities,
            &[
                "plan",
                "selection",
                "manifest",
                "bulk",
                "guard",
                "snapshot",
                "action",
            ],
            "PAP_UNKNOWN",
        )?;
        let selection =
            field(plan, "selection").ok_or_else(|| err("PAP_INVALID", "selection missing"))?;
        let invocation = field(
            field(plan, "action").ok_or_else(|| err("PAP_INVALID", "action missing"))?,
            "invocation",
        )
        .ok_or_else(|| err("PAP_INVALID", "invocation missing"))?;
        let local = text(field(invocation, "id")).as_deref() != Some("umf.actions.tx");
        let fixed = [
            ("plan", "umf.actions.plan", "1"),
            ("manifest", "umf.actions.manifest", "1"),
            ("guard", "", ""),
            ("snapshot", "", ""),
            (
                "bulk",
                if local {
                    "umf.actions.local-bulk"
                } else {
                    "umf.actions.bulk"
                },
                "1",
            ),
        ];
        let required: [(&str, &[&str]); 6] = [
            ("plan", &["plan.integrity", "plan.actionBinding"]),
            (
                "selection",
                &["selection.interpretation", "selection.completeRead"],
            ),
            ("manifest", &["manifest.partition", "manifest.sealCustody"]),
            ("guard", &["guard.identityVersion"]),
            ("snapshot", &["snapshot.coherentCut"]),
            (
                "bulk",
                &[
                    "bulk.atomicBatch",
                    "bulk.replay",
                    "bulk.principal",
                    "bulk.recovery",
                    "bulk.cancel",
                    "bulk.retention",
                ],
            ),
        ];
        for (family, ids) in required {
            let cap = field(capabilities, family)
                .ok_or_else(|| err("PAP_PROFILE", "capability family missing"))?;
            let profile = field(cap, "profile")
                .ok_or_else(|| err("PAP_PROFILE", "capability profile missing"))?;
            if family == "selection" {
                if !json_equal(profile, field(selection, "profile").unwrap(), ctx)? {
                    return Err(err("PAP_PROFILE", "Selection capability/profile mismatch"));
                }
            } else {
                let (_, id, version) = fixed.iter().find(|(name, _, _)| *name == family).unwrap();
                if !id.is_empty()
                    && (text(field(profile, "id")).as_deref() != Some(*id)
                        || text(field(profile, "version")).as_deref() != Some(*version))
                {
                    return Err(err("PAP_PROFILE", "Companion version mismatch"));
                }
            }
            let claims = array_field(cap, "claims")
                .ok_or_else(|| err("PAP_PROFILE", "capability claims missing"))?;
            if claims.len() != ids.len() {
                return Err(err("PAP_PROFILE", "Missing/extra companion claim"));
            }
            let mapped_ids: Vec<String> = ids
                .iter()
                .map(|id| {
                    if local && *id == "bulk.principal" {
                        "bulk.localOwner".to_owned()
                    } else {
                        (*id).to_owned()
                    }
                })
                .collect();
            for id in &mapped_ids {
                let mut matches = claims
                    .iter()
                    .filter(|claim| text(field(claim, "id")).as_deref() == Some(id.as_str()));
                let claim = matches
                    .next()
                    .ok_or_else(|| err("PAP_PROFILE", "Missing companion claim"))?;
                if matches.next().is_some() {
                    return Err(err("PAP_PROFILE", "Duplicate companion claim"));
                }
                let status = text(field(claim, "status"))
                    .ok_or_else(|| err("PAP_PROFILE", "Claim status missing"))?;
                if status == "supported"
                    && array_field(claim, "evidence").is_none_or(|e| e.is_empty())
                {
                    return Err(err("PAP_PROFILE", "Supported claim lacks evidence"));
                }
                if status != "supported" {
                    let diagnostics = field_mut(result, "diagnostics")
                        .and_then(|v| {
                            if let Value::Array(a) = v {
                                Some(a)
                            } else {
                                None
                            }
                        })
                        .unwrap();
                    diagnostics.push(plan_diagnostic(
                        "PAP_PROFILE",
                        &format!("/capabilities/{family}"),
                        &format!("Companion obligation {status}"),
                    ));
                }
                field_mut(result, "obligations")
                    .and_then(|v| {
                        if let Value::Array(a) = v {
                            Some(a)
                        } else {
                            None
                        }
                    })
                    .unwrap()
                    .push(copy_json(claim, ctx)?);
            }
        }
        let original = field(capabilities, "action")
            .ok_or_else(|| err("PAP_PROFILE", "action capability missing"))?;
        reject_unknown_members(
            original,
            &[
                "id",
                "version",
                "actionVersion",
                "coreVersion",
                "source",
                "identity",
                "claims",
            ],
            "PAP_UNKNOWN",
        )?;
        if text(field(original, "id")).is_none_or(|v| v.is_empty())
            || text(field(original, "version")).is_none_or(|v| v.is_empty())
            || text(field(original, "actionVersion")).as_deref() != Some("0.1.0")
            || text(field(original, "coreVersion")).as_deref() != Some(CORE_VERSION)
            || !json_equal(
                field(original, "source")
                    .ok_or_else(|| err("PAP_PROFILE", "action source missing"))?,
                document,
                ctx,
            )?
            || !json_equal(
                field(original, "identity")
                    .ok_or_else(|| err("PAP_PROFILE", "action identity missing"))?,
                field(field(plan, "action").unwrap(), "identity").unwrap(),
                ctx,
            )?
        {
            return Err(err(
                "PAP_PROFILE",
                "Action profile must retain the exact source and identity",
            ));
        }
        let claims = array_field(original, "claims")
            .ok_or_else(|| err("PAP_PROFILE", "action claims missing"))?;
        let obligations = Self::action_obligations(plan, document, ddd_interpreted, ctx)?;
        if claims.len() > obligations.len() {
            return Err(err(
                "PAP_PROFILE",
                "Claim count exceeds obligation inventory",
            ));
        }
        let obligation_ids: BTreeSet<String> = obligations
            .iter()
            .filter_map(|item| text(field(item, "id")))
            .collect();
        let mut claim_ids = BTreeSet::new();
        for claim in claims {
            reject_unknown_members(claim, &["obligation", "status", "evidence"], "PAP_UNKNOWN")?;
            let id = text(field(claim, "obligation"))
                .ok_or_else(|| err("PAP_PROFILE", "Action claim obligation missing"))?;
            if !obligation_ids.contains(&id) || !claim_ids.insert(id) {
                return Err(err("PAP_PROFILE", "Duplicate or extra action claim"));
            }
            if !matches!(
                text(field(claim, "status")).as_deref(),
                Some("supported" | "unsupported" | "unknown")
            ) {
                return Err(err("PAP_PROFILE", "Invalid action claim status"));
            }
            if array_field(claim, "evidence").is_none_or(|items| {
                items.len() > 64
                    || items.iter().any(|item| {
                        text(Some(item)).is_none_or(|value| {
                            value.is_empty() || value.encode_utf16().count() > 2048
                        })
                    })
            }) {
                return Err(err("PAP_PROFILE", "Invalid action claim evidence"));
            }
        }
        for obligation in obligations {
            let id = text(field(&obligation, "id")).unwrap_or_default();
            let mut matching = claims
                .iter()
                .filter(|c| text(field(c, "obligation")).as_deref() == Some(id.as_str()));
            let claim = matching.next();
            if matching.next().is_some() {
                return Err(err("PAP_PROFILE", "Duplicate action obligation claim"));
            }
            if let Some(claim) = claim {
                reject_unknown_members(
                    claim,
                    &["obligation", "status", "evidence"],
                    "PAP_UNKNOWN",
                )?;
                if array_field(claim, "evidence").is_none_or(|e| {
                    e.len() > 64
                        || e.iter().any(|item| {
                            text(Some(item))
                                .is_none_or(|s| s.is_empty() || s.encode_utf16().count() > 2048)
                        })
                }) {
                    return Err(err("PAP_PROFILE", "Malformed action claim evidence"));
                }
            }
            let status = claim
                .and_then(|c| text(field(c, "status")))
                .unwrap_or_else(|| "unknown".into());
            if status == "supported"
                && claim
                    .and_then(|c| array_field(c, "evidence"))
                    .is_none_or(|e| e.is_empty())
            {
                return Err(err(
                    "PAP_PROFILE",
                    "Supported action claim requires evidence",
                ));
            }
            if status != "supported" {
                field_mut(result, "diagnostics")
                    .and_then(|v| {
                        if let Value::Array(a) = v {
                            Some(a)
                        } else {
                            None
                        }
                    })
                    .unwrap()
                    .push(plan_diagnostic(
                        "PAP_PROFILE",
                        &format!("/capabilities/action/{id}"),
                        &format!("Action obligation is {status}"),
                    ));
            }
            let evidence = match claim.and_then(|c| field(c, "evidence")) {
                Some(value) => copy_json(value, ctx)?,
                None => Value::Array(Vec::new()),
            };
            field_mut(result, "obligations")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .unwrap()
                .push(object(vec![
                    ("id", s(&id)),
                    ("status", s(&status)),
                    ("evidence", evidence),
                ]));
        }
        Ok(())
    }

    fn action_obligations(
        plan: &Value,
        document: &Value,
        ddd_interpreted: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Value>, EngineError> {
        let action_pin =
            field(plan, "action").ok_or_else(|| err("PAP_INVALID", "action missing"))?;
        let (action, path) = locate_action(document, action_pin, ctx)?;
        let obligations = first_set_subset(document, &action, &path, &[], ddd_interpreted, ctx)?;
        array(&obligations.obligations)
            .unwrap_or(&[])
            .iter()
            .map(|value| copy_json(value, ctx))
            .collect()
    }

    fn resolve_originals(
        &self,
        model_pin: &Value,
        action_pin: &Value,
        models: &Value,
        actions: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(Value, Value, Value, Value, String, Vec<Diagnostic>), EngineError> {
        validate_model_pin(model_pin)?;
        validate_action_pin(action_pin, model_pin)?;
        let model_artifact = unique_snapshot(models, model_pin, "model", ctx)?;
        let action_artifact = unique_snapshot(actions, action_pin, "action", ctx)?;
        if field(model_pin, "umfVersion") != Some(&s(CORE_VERSION))
            || field(action_pin, "documentSha256") != field(model_pin, "sha256")
            || field(&action_artifact, "utf8") != field(&model_artifact, "utf8")
        {
            return Err(err(
                "PAP_INTEGRITY",
                "Original model/action pins do not agree",
            ));
        }
        let document = parse_artifact(&model_artifact, ctx)?;
        if field(&document, "id") != field(model_pin, "documentId")
            || field(&document, "umf") != Some(&s(CORE_VERSION))
        {
            return Err(err(
                "PAP_INTEGRITY",
                "Original document identity/version mismatch",
            ));
        }
        let mut caps = NativeActionCapabilities;
        let validation =
            self.engine
                .validate_document(&document, &self.registry, &mut caps, ctx)?;
        if !validation.valid {
            return Err(err("PAP_ACTION", "Original action/model validation failed"));
        }
        let warnings = validation
            .diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity == Severity::Warning)
            .cloned()
            .collect();
        let (action, action_path) = locate_action(&document, action_pin, ctx)?;
        let local_invocation = text(field(field(action_pin, "invocation").unwrap(), "id"))
            .as_deref()
            == Some("umf.actions.local-tx");
        if local_invocation != has_local_action_bundle(&action, ctx)? {
            return Err(err(
                "PAP_PROFILE",
                "Invocation differs from local actor/policy bundle",
            ));
        }
        Ok((
            document,
            action,
            copy_json(model_pin, ctx)?,
            copy_json(action_pin, ctx)?,
            action_path,
            warnings,
        ))
    }
}

struct NativeActionCapabilities;
impl Capabilities for NativeActionCapabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token == ACTION_TOKEN {
            Ok(Vec::new())
        } else {
            Err(Utf16::from("Unexpected action semantic token"))
        }
    }
}

struct BoundSubset {
    entity_parameter: Value,
    target: Value,
    assignments: Value,
    frames: Value,
    obligations: Value,
}

fn first_set_subset(
    document: &Value,
    action: &Value,
    action_path: &str,
    warnings: &[Diagnostic],
    ddd_interpreted: bool,
    ctx: &mut Context<'_>,
) -> Result<BoundSubset, EngineError> {
    let known_action = [
        "id",
        "name",
        "description",
        "parameters",
        "outputs",
        "preconditions",
        "postconditions",
        "failures",
        "reads",
        "writes",
        "binding",
        "authorization",
        "attribution",
        "atomicity",
        "idempotency",
        "result",
        "dddOperation",
    ];
    reject_unknown_members(action, &known_action, "PAP_UNKNOWN")?;
    let ddd_reference = validate_ddd_operation(document, action, warnings, ddd_interpreted, ctx)?;
    validate_action_metadata(action)?;
    let parameters =
        array_field(action, "parameters").ok_or_else(|| err("PAP_ACTION", "parameters missing"))?;
    let outputs =
        array_field(action, "outputs").ok_or_else(|| err("PAP_ACTION", "outputs missing"))?;
    let reads = array_field(action, "reads").ok_or_else(|| err("PAP_ACTION", "reads missing"))?;
    let writes =
        array_field(action, "writes").ok_or_else(|| err("PAP_ACTION", "writes missing"))?;
    if outputs.len() != 0
        || !empty_array(action, "preconditions")
        || !empty_array(action, "postconditions")
        || !empty_array(action, "failures")
        || parameters.len() < 2
        || parameters.len() > 64
        || reads.len() + writes.len() > 256
        || writes.is_empty()
    {
        return Err(err("PAP_ACTION", "Outside first bounded set-action subset"));
    }
    ctx.charge_work(
        parameters
            .len()
            .saturating_add(reads.len())
            .saturating_add(writes.len()),
        Utf16::default(),
    )?;
    let mut entity = None;
    let mut values = BTreeMap::new();
    let mut parameter_ids = BTreeSet::new();
    for parameter in parameters {
        let id = text(field(parameter, "id"))
            .ok_or_else(|| err("PAP_ACTION", "parameter id missing"))?;
        if !parameter_ids.insert(id.clone()) {
            return Err(err("PAP_ACTION", "duplicate parameter id"));
        }
        reject_unknown_members(
            parameter,
            if text(field(parameter, "kind")).as_deref() == Some("entity") {
                &["id", "kind", "target", "required"]
            } else {
                &["id", "kind", "field", "required"]
            },
            "PAP_UNKNOWN",
        )?;
        match text(field(parameter, "kind")).as_deref() {
            Some("entity")
                if entity.is_none() && bool_field(parameter, "required") == Some(true) =>
            {
                entity = Some((
                    id.to_owned(),
                    field(parameter, "target")
                        .ok_or_else(|| err("PAP_ACTION", "entity target missing"))?,
                ))
            }
            Some("value") if bool_field(parameter, "required") == Some(true) => {
                if values
                    .insert(
                        id.to_owned(),
                        field(parameter, "field")
                            .ok_or_else(|| err("PAP_ACTION", "value field missing"))?,
                    )
                    .is_some()
                {
                    return Err(err("PAP_ACTION", "duplicate parameter id"));
                }
            }
            _ => return Err(err("PAP_ACTION", "Unsupported action parameter")),
        }
    }
    let (entity_id, target) = entity.ok_or_else(|| {
        err(
            "PAP_ACTION",
            "Exactly one required entity input is required",
        )
    })?;
    reject_unknown_members(target, &["module", "element", "key"], "PAP_UNKNOWN")?;
    if text(field(
        field(action, "binding").unwrap_or(&Value::Null),
        "kind",
    ))
    .as_deref()
        != Some("recipe")
    {
        return Err(err("PAP_ACTION", "Recipe binding required"));
    }
    let binding = field(action, "binding").unwrap();
    let profile = field(binding, "profile").unwrap();
    if text(field(profile, "id")).as_deref() != Some("graph-write")
        || text(field(profile, "version")).as_deref() != Some("1")
    {
        return Err(err("PAP_ACTION", "graph-write/1 required"));
    }
    let effects =
        array_field(binding, "effects").ok_or_else(|| err("PAP_ACTION", "effects missing"))?;
    reject_unknown_members(binding, &["kind", "profile", "effects"], "PAP_UNKNOWN")?;
    reject_unknown_members(profile, &["id", "version"], "PAP_UNKNOWN")?;
    if effects.len() != 1
        || text(field(&effects[0], "kind")).as_deref() != Some("set")
        || !json_equal(
            field(&effects[0], "entity").unwrap_or(&Value::Null),
            &object(vec![("parameter", s(&entity_id))]),
            ctx,
        )?
    {
        return Err(err(
            "PAP_ACTION",
            "Exact parameter-bound single set effect required",
        ));
    }
    reject_unknown_members(
        &effects[0],
        &["id", "kind", "entity", "values"],
        "PAP_UNKNOWN",
    )?;
    let record_ref = object(vec![
        (
            "module",
            copy_json(
                field(target, "module")
                    .ok_or_else(|| err("PAP_ACTION", "target module missing"))?,
                ctx,
            )?,
        ),
        (
            "element",
            copy_json(
                field(target, "element")
                    .ok_or_else(|| err("PAP_ACTION", "target element missing"))?,
                ctx,
            )?,
        ),
    ]);
    let record = resolve_element(document, &record_ref, Some("record"))?;
    ensure_known_model(
        document,
        &record_ref,
        Some("record"),
        warnings,
        ddd_interpreted,
        ctx,
    )?;
    let keys = array_field(record, "keys")
        .ok_or_else(|| err("PAP_ACTION", "target Record keys missing"))?;
    let target_key = field(target, "key").ok_or_else(|| err("PAP_ACTION", "target key missing"))?;
    if !keys.iter().any(|key| field(key, "id") == Some(target_key)) {
        return Err(err("PAP_ACTION", "Target key does not resolve on Record"));
    }
    let members = array_field(record, "members").unwrap_or(&[]);
    let values_assign = array_field(&effects[0], "values")
        .ok_or_else(|| err("PAP_ACTION", "set values missing"))?;
    if values_assign.len() != values.len() {
        return Err(err(
            "PAP_ACTION",
            "Every value input must bind exactly one set field",
        ));
    }
    let mut assignments = Vec::new();
    let mut seen = BTreeSet::new();
    for assignment in values_assign {
        reject_unknown_members(assignment, &["field", "value"], "PAP_UNKNOWN")?;
        let field_ref =
            field(assignment, "field").ok_or_else(|| err("PAP_ACTION", "field missing"))?;
        let member = members.iter().try_fold(false, |found, member| {
            Ok::<_, EngineError>(found || json_equal(member, field_ref, ctx)?)
        })?;
        if !member {
            return Err(err(
                "PAP_ACTION",
                "Assignment field is not a target Record member",
            ));
        }
        let input = text(field(
            field(assignment, "value").unwrap_or(&Value::Null),
            "parameter",
        ))
        .ok_or_else(|| err("PAP_ACTION", "Assignment requires a value parameter"))?;
        if seen.contains(&input)
            || !values.contains_key(&input)
            || !json_equal(values[&input], field_ref, ctx)?
        {
            return Err(err("PAP_ACTION", "Assignment value/input field mismatch"));
        }
        seen.insert(input.clone());
        let f = resolve_element(document, field_ref, Some("field"))?;
        ensure_known_model(
            document,
            field_ref,
            Some("field"),
            warnings,
            ddd_interpreted,
            ctx,
        )?;
        if text(field(f, "nullability")).as_deref() != Some("required")
            || text(field(f, "cardinality")).as_deref() != Some("one")
            || !matches!(
                text(field(f, "scalarType")).as_deref(),
                Some("boolean" | "integer" | "string")
            )
        {
            return Err(err("PAP_ACTION", "Unsupported mutation Field domain"));
        }
        for key in keys {
            for key_field in array_field(key, "fields").unwrap_or(&[]) {
                if json_equal(key_field, field_ref, ctx)? {
                    return Err(err("PAP_ACTION", "Key Fields cannot be mutated"));
                }
            }
        }
        assignments.push(object(vec![
            ("input", s(&input)),
            ("field", copy_json(field_ref, ctx)?),
        ]));
    }
    let mut frames = Vec::new();
    let mut declared_write_fields = BTreeSet::new();
    for (group, list) in [("reads", reads), ("writes", writes)] {
        for frame in list {
            reject_unknown_members(
                frame,
                &[
                    "id",
                    "record",
                    "selector",
                    "maxEntities",
                    "fields",
                    "relationships",
                    "create",
                    "delete",
                ],
                "PAP_UNKNOWN",
            )?;
            if !json_equal(
                field(frame, "record").ok_or_else(|| err("PAP_ACTION", "frame record missing"))?,
                &record_ref,
                ctx,
            )? || number(field(frame, "maxEntities")) != Some(1.0)
                || bool_field(frame, "create") != Some(false)
                || bool_field(frame, "delete") != Some(false)
                || !empty_array(frame, "relationships")
            {
                return Err(err(
                    "PAP_ACTION",
                    "Frame outside bounded frozen single-entity set subset",
                ));
            }
            let selector = field(frame, "selector")
                .ok_or_else(|| err("PAP_ACTION", "frame selector missing"))?;
            reject_unknown_members(
                selector,
                &["language", "version", "expression", "references"],
                "PAP_UNKNOWN",
            )?;
            let expression = match field(selector, "expression") {
                Some(Value::String(expression)) => {
                    serialization::read_json_value(expression.units(), Format::Json, ctx).map_err(
                        |error| {
                            if error.is_control_failure() {
                                error
                            } else {
                                err("PAP_ACTION", "Selector expression is invalid JSON")
                            }
                        },
                    )?
                }
                _ => return Err(err("PAP_ACTION", "Selector expression must be text")),
            };
            if text(field(selector, "language")).as_deref() != Some("umf.actions.keys")
                || text(field(selector, "version")).as_deref() != Some("1")
                || !json_equal(&expression, &object(vec![("entity", s(&entity_id))]), ctx)?
            {
                return Err(err(
                    "PAP_ACTION",
                    "Selector expression is outside supported exact entity subset",
                ));
            }
            let selector_refs = array_field(selector, "references")
                .ok_or_else(|| err("PAP_ACTION", "selector references missing"))?;
            if selector_refs.len() == 1 {
                reject_unknown_members(&selector_refs[0], &["parameter"], "PAP_UNKNOWN")?;
            }
            if selector_refs.len() != 1
                || text(field(&selector_refs[0], "parameter")).as_deref() != Some(&entity_id)
            {
                return Err(err("PAP_ACTION", "Selector must bind exact entity input"));
            }
            let id = text(field(frame, "id"))
                .ok_or_else(|| err("PAP_ACTION", "frame identity missing"))?;
            frames.push(s(&id));
            let field_refs = array_field(frame, "fields")
                .ok_or_else(|| err("PAP_ACTION", "frame fields missing"))?;
            let mut seen_frame_fields = BTreeSet::new();
            for reference in field_refs {
                reject_unknown_members(reference, &["module", "element"], "PAP_UNKNOWN")?;
                let member = members.iter().try_fold(false, |found, candidate| {
                    Ok::<_, EngineError>(found || json_equal(candidate, reference, ctx)?)
                })?;
                if !member || !seen_frame_fields.insert(ref_key(reference)) {
                    return Err(err(
                        "PAP_ACTION",
                        "Frame fields must be unique target Record members",
                    ));
                }
                let field_node = resolve_element(document, reference, Some("field"))?;
                ensure_known_model(
                    document,
                    reference,
                    Some("field"),
                    warnings,
                    ddd_interpreted,
                    ctx,
                )?;
                if !matches!(
                    text(field(field_node, "scalarType")).as_deref(),
                    Some("boolean" | "integer" | "decimal" | "string" | "binary")
                ) {
                    return Err(err("PAP_ACTION", "Frame Field scalar type is unsupported"));
                }
                if group == "writes" {
                    let module = text(field(reference, "module")).unwrap_or_default();
                    let element = text(field(reference, "element")).unwrap_or_default();
                    declared_write_fields.insert(format!("{module}\0{element}"));
                }
            }
        }
    }
    let assigned: BTreeSet<String> = values_assign
        .iter()
        .map(|a| {
            let f = field(a, "field").unwrap();
            format!(
                "{}\0{}",
                text(field(f, "module")).unwrap_or_default(),
                text(field(f, "element")).unwrap_or_default()
            )
        })
        .collect();
    if assigned != declared_write_fields {
        return Err(err(
            "PAP_ACTION",
            "Write frame fields must exactly match assigned fields",
        ));
    }
    let (module_index, record_index) = element_indices(document, &record_ref)?;
    let mut obligations = Vec::new();
    for (index, parameter) in parameters.iter().enumerate() {
        let kind = if text(field(parameter, "kind")).as_deref() == Some("entity") {
            "key"
        } else {
            "value"
        };
        obligations.push(obligation(
            format!("{action_path}/parameters/{index}"),
            kind,
        ));
        if kind == "key" {
            push_obligation_once(
                &mut obligations,
                obligation(
                    format!("/modules/{module_index}/elements/{record_index}"),
                    "model",
                ),
            );
            let target_key_fields = keys
                .iter()
                .find(|key| field(key, "id") == Some(target_key))
                .and_then(|key| array_field(key, "fields"))
                .unwrap_or(&[]);
            for key_field in target_key_fields {
                let (mi, ei) = element_indices(document, key_field)?;
                push_obligation_once(
                    &mut obligations,
                    obligation(format!("/modules/{mi}/elements/{ei}"), "model"),
                );
            }
            let key_index = keys
                .iter()
                .position(|key| field(key, "id") == Some(target_key))
                .unwrap_or(0);
            obligations.push(obligation(
                format!("/modules/{module_index}/elements/{record_index}/keys/{key_index}"),
                "key",
            ));
        } else {
            let field_ref = field(parameter, "field")
                .ok_or_else(|| err("PAP_ACTION", "value parameter field missing"))?;
            let (mi, ei) = element_indices(document, field_ref)?;
            push_obligation_once(
                &mut obligations,
                obligation(format!("/modules/{mi}/elements/{ei}"), "model"),
            );
        }
    }
    for (group, list) in [("reads", reads), ("writes", writes)] {
        for (index, frame) in list.iter().enumerate() {
            let frame_path = format!("{action_path}/{group}/{index}");
            obligations.push(obligation(frame_path.clone(), "frame"));
            obligations.push(obligation(format!("{frame_path}/selector"), "selector"));
        }
    }
    for member in [
        "authorization",
        "attribution",
        "atomicity",
        "idempotency",
        "result",
        "binding",
    ] {
        obligations.push(obligation(format!("{action_path}/{member}"), member));
    }
    obligations.push(obligation(
        format!("{action_path}/binding/effects/0"),
        "effect",
    ));
    if let Some(reference) = ddd_reference {
        let (module_index, item_index) = element_indices(document, &reference)?;
        push_obligation_once(
            &mut obligations,
            obligation(
                format!("/modules/{module_index}/elements/{item_index}"),
                "model",
            ),
        );
    }
    augment_action_model_obligations(document, action, action_path, &mut obligations, ctx)?;
    Ok(BoundSubset {
        entity_parameter: s(&entity_id),
        target: copy_json(target, ctx)?,
        assignments: Value::Array(assignments),
        frames: Value::Array(frames),
        obligations: Value::Array(obligations),
    })
}

/// Add the full recursively reachable model inventory for the admitted Action.
/// This inventory is independent of first-set code generation eligibility: the
/// plan compiler can refuse an Action while assessment still reports every
/// source dependency used by native Action inspection.
pub fn augment_action_model_obligations(
    document: &Value,
    action: &Value,
    action_path: &str,
    obligations: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending: Vec<(Value, Option<String>, String)> = Vec::new();
    for group in ["parameters", "outputs"] {
        for (index, item) in array_field(action, group).unwrap_or(&[]).iter().enumerate() {
            let at = format!("{action_path}/{group}/{index}");
            match text(field(item, "kind")).as_deref() {
                Some("value") => {
                    push_obligation_once(obligations, obligation(at.clone(), "value"));
                    if let Some(reference) = field(item, "field") {
                        pending.push((
                            copy_json(reference, ctx)?,
                            Some("field".into()),
                            format!("{at}/field"),
                        ));
                    }
                }
                Some("entity") => {
                    push_obligation_once(obligations, obligation(at.clone(), "key"));
                    if let Some(reference) = field(item, "target") {
                        pending.push((
                            copy_json(reference, ctx)?,
                            Some("record".into()),
                            format!("{at}/target"),
                        ));
                    }
                }
                _ => {}
            }
        }
    }
    for group in ["reads", "writes"] {
        for (index, frame) in array_field(action, group).unwrap_or(&[]).iter().enumerate() {
            let at = format!("{action_path}/{group}/{index}");
            if let Some(reference) = field(frame, "record") {
                pending.push((
                    copy_json(reference, ctx)?,
                    Some("record".into()),
                    format!("{at}/record"),
                ));
            }
            for (field_index, reference) in array_field(frame, "fields")
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                let path = format!("{at}/fields/{field_index}");
                push_obligation_once(obligations, obligation(path.clone(), "value"));
                pending.push((copy_json(reference, ctx)?, Some("field".into()), path));
            }
            for (relation_index, reference) in array_field(frame, "relationships")
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                let path = format!("{at}/relationships/{relation_index}");
                pending.push((
                    copy_json(reference, ctx)?,
                    Some("relationship".into()),
                    path,
                ));
            }
        }
    }
    if text(field(
        field(action, "binding").unwrap_or(&Value::Null),
        "kind",
    ))
    .as_deref()
        == Some("recipe")
    {
        for (index, effect) in
            array_field(field(action, "binding").unwrap_or(&Value::Null), "effects")
                .unwrap_or(&[])
                .iter()
                .enumerate()
        {
            let at = format!("{action_path}/binding/effects/{index}");
            match text(field(effect, "kind")).as_deref() {
                Some("create") => {
                    if let Some(reference) = field(effect, "record") {
                        pending.push((
                            copy_json(reference, ctx)?,
                            Some("record".into()),
                            format!("{at}/record"),
                        ));
                    }
                }
                Some("set") => {
                    if let Some(entity) = field(effect, "entity") {
                        if let Some(reference) = field(entity, "parameter") {
                            // Entity parameters carry a Record/Key reference. The
                            // source parameter is already included above.
                            let _ = reference;
                        }
                    }
                }
                Some("link") | Some("unlink") => {
                    if let Some(reference) = field(effect, "relationship") {
                        pending.push((
                            copy_json(reference, ctx)?,
                            Some("relationship".into()),
                            format!("{at}/relationship"),
                        ));
                    }
                }
                _ => {}
            }
            for (assignment_index, assignment) in array_field(effect, "values")
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                let path = format!("{at}/values/{assignment_index}/field");
                if let Some(reference) = field(assignment, "field") {
                    pending.push((copy_json(reference, ctx)?, Some("field".into()), path));
                }
            }
        }
    }
    if let Some(reference) = field(action, "dddOperation") {
        if let Some(element) = field(reference, "element") {
            let _ = element;
            pending.push((
                object(vec![
                    (
                        "module",
                        field(reference, "module").cloned().unwrap_or(Value::Null),
                    ),
                    (
                        "element",
                        field(reference, "element").cloned().unwrap_or(Value::Null),
                    ),
                ]),
                None,
                format!("{action_path}/dddOperation"),
            ));
        }
    }
    let mut visited = BTreeSet::new();
    let mut count = 0usize;
    while let Some((reference, expected, reference_path)) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        count = count.saturating_add(1);
        if count > 4096 {
            return Err(err("PAP_LIMIT", "Action dependency closure exceeds bound"));
        }
        let kind = expected.as_deref().unwrap_or("any");
        if kind == "relationship" {
            let module = text(field(&reference, "module")).unwrap_or_default();
            let id = text(field(&reference, "relationship")).unwrap_or_default();
            for (module_index, item) in array_field(document, "modules")
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                if text(field(item, "id")).as_deref() != Some(module.as_str()) {
                    continue;
                }
                for (relation_index, relation) in array_field(item, "relationships")
                    .unwrap_or(&[])
                    .iter()
                    .enumerate()
                {
                    if text(field(relation, "id")).as_deref() != Some(id.as_str()) {
                        continue;
                    }
                    let relation_path =
                        format!("/modules/{module_index}/relationships/{relation_index}");
                    push_obligation_once(obligations, obligation(relation_path.clone(), "model"));
                    for endpoint in ["source", "target"] {
                        for endpoint_ref in array_field(relation, endpoint).unwrap_or(&[]) {
                            let record = object(vec![
                                (
                                    "module",
                                    field(endpoint_ref, "module")
                                        .cloned()
                                        .unwrap_or(Value::Null),
                                ),
                                (
                                    "element",
                                    field(endpoint_ref, "element")
                                        .cloned()
                                        .unwrap_or(Value::Null),
                                ),
                            ]);
                            pending.push((
                                record,
                                Some("record".into()),
                                format!("{relation_path}/{endpoint}"),
                            ));
                        }
                    }
                    if let Some(record) = field(relation, "associationRecord") {
                        pending.push((
                            copy_json(record, ctx)?,
                            Some("record".into()),
                            format!("{relation_path}/associationRecord"),
                        ));
                    }
                }
            }
            let _ = reference_path;
            continue;
        }
        let module = text(field(&reference, "module")).unwrap_or_default();
        let id = text(field(&reference, "element")).unwrap_or_default();
        let mut found = None;
        for (module_index, item) in array_field(document, "modules")
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            if text(field(item, "id")).as_deref() != Some(module.as_str()) {
                continue;
            }
            for (element_index, element) in array_field(item, "elements")
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                if text(field(element, "id")).as_deref() == Some(id.as_str())
                    && (kind == "any" || text(field(element, "kind")).as_deref() == Some(kind))
                {
                    found = Some((module_index, element_index, element));
                    break;
                }
            }
        }
        let Some((module_index, element_index, element)) = found else {
            continue;
        };
        let element_path = format!("/modules/{module_index}/elements/{element_index}");
        if !visited.insert(element_path.clone()) {
            continue;
        }
        push_obligation_once(obligations, obligation(element_path.clone(), "model"));
        for member in array_field(element, "members").unwrap_or(&[]) {
            pending.push((
                copy_json(member, ctx)?,
                Some("field".into()),
                format!("{element_path}/members"),
            ));
        }
        for (key_index, key) in array_field(element, "keys")
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            push_obligation_once(
                obligations,
                obligation(format!("{element_path}/keys/{key_index}"), "key"),
            );
            for field_ref in array_field(key, "fields").unwrap_or(&[]) {
                pending.push((
                    copy_json(field_ref, ctx)?,
                    Some("field".into()),
                    format!("{element_path}/keys/{key_index}/fields"),
                ));
            }
        }
        for relation in array_field(element, "references").unwrap_or(&[]) {
            let reference = object(vec![
                (
                    "module",
                    field(relation, "module").cloned().unwrap_or(Value::Null),
                ),
                (
                    "relationship",
                    field(relation, "element").cloned().unwrap_or_else(|| {
                        field(relation, "relationship")
                            .cloned()
                            .unwrap_or(Value::Null)
                    }),
                ),
            ]);
            pending.push((
                reference,
                Some("relationship".into()),
                format!("{element_path}/references"),
            ));
        }
        if let Some(item_type) = field(element, "itemType") {
            pending.push((
                copy_json(item_type, ctx)?,
                Some("field".into()),
                format!("{element_path}/itemType"),
            ));
        }
    }
    Ok(())
}

fn validate_assignments(
    document: &Value,
    plan: &Value,
    bound: &BoundSubset,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if text(field(
        field(plan, "inputs").unwrap_or(&Value::Null),
        "entityParameter",
    )) != text(Some(&bound.entity_parameter))
    {
        return Err(err(
            "PAP_ACTION",
            "Entity parameter differs from original action",
        ));
    }
    let assignments = array_field(
        field(plan, "inputs").ok_or_else(|| err("PAP_INVALID", "inputs missing"))?,
        "assignments",
    )
    .ok_or_else(|| err("PAP_INVALID", "assignments missing"))?;
    let mut seen = BTreeSet::new();
    for assignment in assignments {
        let input = text(field(assignment, "input"))
            .ok_or_else(|| err("PAP_ACTION", "assignment input missing"))?;
        let matched = array(&bound.assignments)
            .unwrap_or(&[])
            .iter()
            .find(|a| text(field(a, "input")).as_deref() == Some(&input))
            .ok_or_else(|| err("PAP_ACTION", "assignment input does not resolve"))?;
        if !json_equal(
            field(assignment, "field").unwrap_or(&Value::Null),
            field(matched, "field").unwrap_or(&Value::Null),
            ctx,
        )? {
            return Err(err("PAP_ACTION", "assignment field differs from source"));
        }
        if !seen.insert(input) {
            return Err(err("PAP_ACTION", "duplicate input assignment"));
        }
        let field_value =
            resolve_element(document, field(assignment, "field").unwrap(), Some("field"))?;
        let literal = field(assignment, "value")
            .ok_or_else(|| err("PAP_ACTION", "assignment value missing"))?;
        let validation =
            engine.validate_schema_literal_public(document, field_value, literal, ctx)?;
        if !validation.valid {
            return Err(err("PAP_ACTION", "Constant value violates original Field"));
        }
    }
    if seen.len() != array(&bound.assignments).unwrap().len() {
        return Err(err("PAP_ACTION", "Incomplete input assignment set"));
    }
    Ok(())
}

fn ensure_known_model(
    document: &Value,
    reference: &Value,
    expected: Option<&str>,
    warnings: &[Diagnostic],
    ddd_interpreted: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending = vec![(copy_json(reference, ctx)?, expected.map(str::to_owned))];
    let mut visited = BTreeSet::new();
    while let Some((reference, kind)) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        if visited.len() >= 4096 {
            return Err(err("PAP_LIMIT", "Relevant model closure exceeds bound"));
        }
        let element = resolve_element(document, &reference, kind.as_deref())?;
        let (mi, ei) = element_indices(document, &reference)?;
        let path = format!("/modules/{mi}/elements/{ei}");
        let identity = format!("{mi}/{ei}");
        if !visited.insert(identity) {
            continue;
        }
        if warnings.iter().any(|warning| {
            let unknown_extension = warning
                .code
                .to_utf8()
                .is_ok_and(|code| code == "UNKNOWN_EXTENSION");
            warning.path.to_utf8().is_ok_and(|warning_path| {
                (!unknown_extension || !ddd_interpreted)
                    && (warning_path == path || warning_path.starts_with(&(path.clone() + "/")))
            })
        }) {
            return Err(err(
                "PAP_UNKNOWN",
                "Referenced model has an unchecked core warning",
            ));
        }
        reject_unknown_members(
            element,
            &[
                "id",
                "name",
                "description",
                "kind",
                "scalarType",
                "nullability",
                "cardinality",
                "facets",
                "itemType",
                "members",
                "keys",
                "references",
                "extensions",
                "title",
                "aliases",
                "examples",
                "allowedValues",
                "default",
            ],
            "PAP_UNKNOWN",
        )?;
        if let Some(Value::Object(extensions)) = field(element, "extensions") {
            if extensions
                .iter()
                .any(|(key, _)| key != &Utf16::from("umf.ddd") || !ddd_interpreted)
            {
                return Err(err(
                    "PAP_UNKNOWN",
                    "Referenced model extensions require interpretation",
                ));
            }
        }
        if let Some(facets) = field(element, "facets") {
            reject_unknown_members(
                facets,
                &[
                    "length",
                    "precision",
                    "scale",
                    "integerWidth",
                    "range",
                    "collectionSize",
                ],
                "PAP_UNKNOWN",
            )?;
            for (name, allowed) in [
                ("length", &["min", "max", "unit"][..]),
                ("integerWidth", &["bits", "signed"][..]),
                ("range", &["min", "max", "minInclusive", "maxInclusive"][..]),
                ("collectionSize", &["min", "max"][..]),
            ] {
                if let Some(value) = field(facets, name) {
                    reject_unknown_members(value, allowed, "PAP_UNKNOWN")?;
                }
            }
        }
        let mut add_ref = |value: &Value, expected: Option<&str>| -> Result<(), EngineError> {
            pending.push((copy_json(value, ctx)?, expected.map(str::to_owned)));
            Ok(())
        };
        for member in array_field(element, "members").unwrap_or(&[]) {
            add_ref(member, Some("field"))?;
        }
        for key in array_field(element, "keys").unwrap_or(&[]) {
            reject_unknown_members(key, &["id", "name", "fields", "primary"], "PAP_UNKNOWN")?;
            for field_ref in array_field(key, "fields").unwrap_or(&[]) {
                add_ref(field_ref, Some("field"))?;
            }
        }
        for model_ref in array_field(element, "references").unwrap_or(&[]) {
            reject_unknown_members(model_ref, &["role", "module", "element"], "PAP_UNKNOWN")?;
            add_ref(model_ref, None)?;
        }
        if let Some(item_type) = field(element, "itemType") {
            add_ref(item_type, Some("field"))?;
        }
    }
    Ok(())
}

fn validate_ddd_operation(
    document: &Value,
    action: &Value,
    warnings: &[Diagnostic],
    ddd_interpreted: bool,
    ctx: &mut Context<'_>,
) -> Result<Option<Value>, EngineError> {
    let Some(operation) = field(action, "dddOperation") else {
        return Ok(None);
    };
    reject_unknown_members(
        operation,
        &["module", "element", "operation"],
        "PAP_UNKNOWN",
    )?;
    if !ddd_interpreted {
        return Err(err(
            "PAP_UNKNOWN",
            "DDD operation requires an explicitly installed DDD interpreter",
        ));
    }
    let module = field(operation, "module")
        .ok_or_else(|| err("PAP_REFERENCE", "DDD service module missing"))?;
    let element = field(operation, "element")
        .ok_or_else(|| err("PAP_REFERENCE", "DDD service element missing"))?;
    let name = text(field(operation, "operation"))
        .ok_or_else(|| err("PAP_REFERENCE", "DDD operation name missing"))?;
    let reference = object(vec![
        ("module", copy_json(module, ctx)?),
        ("element", copy_json(element, ctx)?),
    ]);
    let _ = element_indices(document, &reference)?;
    let service = resolve_element(document, &reference, None)?;
    ensure_known_model(document, &reference, None, warnings, true, ctx)?;
    let definition = field(
        field(service, "extensions").unwrap_or(&Value::Null),
        "umf.ddd",
    )
    .ok_or_else(|| err("PAP_REFERENCE", "DDD service definition missing"))?;
    if text(field(definition, "kind")).as_deref() != Some("domain-service") {
        return Err(err(
            "PAP_REFERENCE",
            "DDD operation target is not a service",
        ));
    }
    let operations = array_field(definition, "operations")
        .ok_or_else(|| err("PAP_REFERENCE", "DDD service operations missing"))?;
    let mut matches = 0usize;
    for candidate in operations {
        if text(field(candidate, "name")).as_deref() == Some(name.as_str()) {
            matches += 1;
        }
    }
    if matches != 1 {
        return Err(err(
            "PAP_REFERENCE",
            "Explicit DDD service operation must resolve exactly once",
        ));
    }
    Ok(Some(reference))
}

fn ddd_declared(document: &Value) -> bool {
    text(field(
        field(
            field(document, "vocabularies").unwrap_or(&Value::Null),
            "umf.ddd",
        )
        .unwrap_or(&Value::Null),
        "version",
    ))
    .as_deref()
        == Some("0.1.0")
}

fn validate_selection_dependencies(
    document: &Value,
    plan: &Value,
    deps: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let target = field(plan, "target").unwrap();
    let module = text(field(target, "module")).unwrap();
    let record = text(field(target, "element")).unwrap();
    let target_record = resolve_element(
        document,
        &object(vec![("module", s(&module)), ("element", s(&record))]),
        Some("record"),
    )?;
    let members = array_field(target_record, "members").unwrap_or(&[]);
    let mut seen = BTreeSet::new();
    for dep in deps {
        if text(field(dep, "module")).is_none() || text(field(dep, "element")).is_none() {
            return Err(err("PAP_ACTION", "Malformed selection dependency"));
        }
        let is_member = members.iter().try_fold(false, |found, member| {
            Ok::<_, EngineError>(found || json_equal(member, dep, ctx)?)
        })?;
        if !is_member || !seen.insert(ref_key(dep)) {
            return Err(err(
                "PAP_ACTION",
                "Selection dependency is not a unique target Record member",
            ));
        }
        let element = resolve_element(document, dep, Some("field"))?;
        if text(field(element, "nullability")).as_deref() != Some("required")
            || text(field(element, "cardinality")).as_deref() != Some("one")
            || !matches!(
                text(field(element, "scalarType")).as_deref(),
                Some("boolean" | "integer" | "string")
            )
        {
            return Err(err("PAP_ACTION", "Unsupported selection Field domain"));
        }
    }
    Ok(())
}

fn validate_action_metadata(action: &Value) -> Result<(), EngineError> {
    let authorization =
        field(action, "authorization").ok_or_else(|| err("PAP_ACTION", "authorization missing"))?;
    let auth_profile = field(authorization, "profile")
        .ok_or_else(|| err("PAP_ACTION", "authorization profile missing"))?;
    reject_unknown_members(auth_profile, &["id", "version"], "PAP_UNKNOWN")?;
    match text(field(authorization, "kind")).as_deref() {
        Some("roles") => {
            reject_unknown_members(authorization, &["kind", "profile", "roles"], "PAP_UNKNOWN")?;
            if text(field(auth_profile, "id")).as_deref() != Some("umf.actions.roles")
                || text(field(auth_profile, "version")).as_deref() != Some("1")
            {
                return Err(err(
                    "PAP_UNKNOWN",
                    "Authorization profile is not interpreted",
                ));
            }
            let roles = array_field(authorization, "roles")
                .ok_or_else(|| err("PAP_ACTION", "roles missing"))?;
            if roles.iter().any(|role| {
                text(Some(role)).is_none_or(|s| s.is_empty() || s.encode_utf16().count() > 256)
            }) {
                return Err(err("PAP_LIMIT", "Role identity exceeds bound"));
            }
        }
        Some("policy") => {
            reject_unknown_members(
                authorization,
                &["kind", "profile", "resources"],
                "PAP_UNKNOWN",
            )?;
            if text(field(auth_profile, "id")).as_deref() != Some("umf.actions.local-store-owner")
                || text(field(auth_profile, "version")).as_deref() != Some("1")
            {
                return Err(err(
                    "PAP_UNKNOWN",
                    "Authorization policy profile is not interpreted",
                ));
            }
        }
        _ => return Err(err("PAP_ACTION", "Unsupported authorization declaration")),
    }
    let attribution =
        field(action, "attribution").ok_or_else(|| err("PAP_ACTION", "attribution missing"))?;
    match text(field(attribution, "subject")).as_deref() {
        Some("person-required") => {
            reject_unknown_members(attribution, &["subject"], "PAP_UNKNOWN")?
        }
        Some("actor-profile") => {
            reject_unknown_members(attribution, &["subject", "profile"], "PAP_UNKNOWN")?;
            let profile = field(attribution, "profile")
                .ok_or_else(|| err("PAP_ACTION", "actor profile missing"))?;
            reject_unknown_members(profile, &["id", "version"], "PAP_UNKNOWN")?;
            if text(field(profile, "id")).as_deref() != Some("umf.actions.local-owner")
                || text(field(profile, "version")).as_deref() != Some("1")
            {
                return Err(err("PAP_UNKNOWN", "Actor profile is not interpreted"));
            }
        }
        _ => return Err(err("PAP_ACTION", "Unsupported attribution declaration")),
    }
    if text(field(action, "atomicity")).as_deref() != Some("single-store")
        || text(field(action, "idempotency")).as_deref() != Some("caller-key-optional")
    {
        return Err(err(
            "PAP_ACTION",
            "Atomicity/idempotency profile is unsupported",
        ));
    }
    let result =
        field(action, "result").ok_or_else(|| err("PAP_ACTION", "result profile missing"))?;
    reject_unknown_members(result, &["identities", "version", "receipt"], "PAP_UNKNOWN")?;
    if text(field(result, "identities")).as_deref() != Some("created-and-changed")
        || text(field(result, "version")).as_deref() != Some("store-opaque")
        || text(field(result, "receipt")).as_deref() != Some("read-at-least")
    {
        return Err(err("PAP_ACTION", "Result profile is unsupported"));
    }
    Ok(())
}

fn has_local_action_bundle(action: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let attribution = field(action, "attribution").unwrap_or(&Value::Null);
    let authorization = field(action, "authorization").unwrap_or(&Value::Null);
    let actor = text(field(attribution, "subject")).as_deref() == Some("actor-profile")
        && text(field(
            field(attribution, "profile").unwrap_or(&Value::Null),
            "id",
        ))
        .as_deref()
            == Some("umf.actions.local-owner")
        && text(field(
            field(attribution, "profile").unwrap_or(&Value::Null),
            "version",
        ))
        .as_deref()
            == Some("1");
    let policy = text(field(authorization, "kind")).as_deref() == Some("policy")
        && text(field(
            field(authorization, "profile").unwrap_or(&Value::Null),
            "id",
        ))
        .as_deref()
            == Some("umf.actions.local-store-owner")
        && text(field(
            field(authorization, "profile").unwrap_or(&Value::Null),
            "version",
        ))
        .as_deref()
            == Some("1");
    if !actor || !policy {
        return Ok(false);
    }
    let frames: Vec<Value> = array_field(action, "reads")
        .unwrap_or(&[])
        .iter()
        .chain(array_field(action, "writes").unwrap_or(&[]))
        .map(|frame| field(frame, "id").cloned().unwrap_or(Value::Null))
        .collect();
    let resources = array_field(authorization, "resources")
        .ok_or_else(|| err("PAP_PROFILE", "Local policy resources missing"))?;
    if resources.len() != frames.len() {
        return Ok(false);
    }
    for (left, right) in resources.iter().zip(&frames) {
        if !json_equal(left, right, ctx)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn find_profile(
    selections: &Value,
    profile: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let list = array(selections)
        .ok_or_else(|| err("PAP_PROFILE", "selection interpreter list required"))?;
    if list.len() > 64 {
        return Err(err("PAP_LIMIT", "selection interpreter limit"));
    }
    let mut matches = 0usize;
    for item in list {
        let Value::Object(fields) = item else {
            return Err(err(
                "PAP_PROFILE",
                "selection interpreter declaration must be an object",
            ));
        };
        if fields.len() != 1 || fields[0].0 != Utf16::from("profile") {
            return Err(err(
                "PAP_PROFILE",
                "selection interpreter declaration must contain only its profile",
            ));
        }
        if json_equal(&fields[0].1, profile, ctx)? {
            matches += 1;
        }
    }
    if matches != 1 {
        return Err(err(
            "PAP_PROFILE",
            "One exact installed selection interpreter required",
        ));
    }
    Ok(())
}
fn unique_snapshot(
    items: &Value,
    pin: &Value,
    label: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let list = array(items).ok_or_else(|| err("PAP_INTEGRITY", "original snapshots required"))?;
    if list.len() != 1 {
        return Err(err("PAP_LIMIT", "Exactly one original snapshot required"));
    }
    let item = &list[0];
    if !json_equal(field(item, "pin").unwrap_or(&Value::Null), pin, ctx)? {
        return Err(err("PAP_INTEGRITY", &format!("{label} pin mismatch")));
    }
    let artifact =
        field(item, "artifact").ok_or_else(|| err("PAP_INTEGRITY", "original artifact missing"))?;
    let artifact = read_artifact(artifact, PLAN_MAX, ctx)?;
    let source =
        text(field(&artifact, "utf8")).ok_or_else(|| err("PAP_INTEGRITY", "source missing"))?;
    let _ = parse_artifact(&artifact, ctx)?;
    if source.len() > PLAN_MAX {
        return Err(err("PAP_LIMIT", "Original artifact bound exceeded"));
    }
    Ok(artifact)
}
fn locate_action(
    document: &Value,
    pin: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, String), EngineError> {
    let identity = field(pin, "identity").ok_or_else(|| err("PAP_ACTION", "identity missing"))?;
    let module =
        text(field(identity, "module")).ok_or_else(|| err("PAP_ACTION", "module missing"))?;
    let action_id =
        text(field(identity, "action")).ok_or_else(|| err("PAP_ACTION", "action missing"))?;
    let mut found = None;
    for (module_index, m) in array_field(document, "modules")
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if text(field(m, "id")).as_deref() != Some(&module) {
            continue;
        }
        let payload = field(
            field(m, "extensions").unwrap_or(&Value::Null),
            "umf.actions",
        )
        .ok_or_else(|| err("PAP_ACTION", "actions package missing"))?;
        reject_unknown_members(payload, &["actions"], "PAP_UNKNOWN")?;
        let declared = array_field(payload, "actions")
            .ok_or_else(|| err("PAP_ACTION", "actions list missing"))?;
        let mut ids = BTreeSet::new();
        let mut names = BTreeSet::new();
        for (action_index, a) in declared.iter().enumerate() {
            let id = text(field(a, "id")).ok_or_else(|| err("PAP_ACTION", "action id missing"))?;
            let name =
                text(field(a, "name")).ok_or_else(|| err("PAP_ACTION", "action name missing"))?;
            if !ids.insert(id) || !names.insert(name) {
                return Err(err("PAP_ACTION", "Duplicate action ID/name"));
            }
            if text(field(a, "id")).as_deref() == Some(&action_id) {
                if found.is_some() {
                    return Err(err("PAP_ACTION", "action identity is ambiguous"));
                }
                found = Some((
                    copy_json(a, ctx)?,
                    format!(
                        "/modules/{module_index}/extensions/umf.actions/actions/{action_index}"
                    ),
                ));
            }
        }
    }
    found.ok_or_else(|| err("PAP_ACTION", "Action identity must resolve"))
}
fn resolve_element<'a>(
    document: &'a Value,
    reference: &Value,
    kind: Option<&str>,
) -> Result<&'a Value, EngineError> {
    let module =
        text(field(reference, "module")).ok_or_else(|| err("PAP_REFERENCE", "module missing"))?;
    let element =
        text(field(reference, "element")).ok_or_else(|| err("PAP_REFERENCE", "element missing"))?;
    for m in array_field(document, "modules").unwrap_or(&[]) {
        if text(field(m, "id")).as_deref() == Some(&module) {
            for e in array_field(m, "elements").unwrap_or(&[]) {
                if text(field(e, "id")).as_deref() == Some(&element)
                    && kind.is_none_or(|k| text(field(e, "kind")).as_deref() == Some(k))
                {
                    return Ok(e);
                }
            }
        }
    }
    Err(err(
        "PAP_REFERENCE",
        "Reference must resolve exact element kind",
    ))
}
fn parse_artifact(a: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Some(Value::String(source)) = field(a, "utf8") else {
        return Err(err("PAP_INVALID", "artifact UTF-8 source missing"));
    };
    serialization::read_json_value(source.units(), Format::Json, ctx).map_err(|error| {
        if error.is_control_failure() || error.code == "LIMIT" {
            error
        } else {
            err("PAP_INVALID", "Invalid exact JSON artifact")
        }
    })
}
fn read_artifact(a: &Value, max: usize, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let source = read_artifact_source(a, max, ctx)?;
    parse_artifact(&source, ctx)?;
    Ok(source)
}

/// Read and authenticate an artifact wrapper without parsing its content.
/// Inspection calls this outside its report-producing boundary so malformed
/// JSON can be retained in the blocked report, matching the public API.
fn read_artifact_source(
    a: &Value,
    max: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    reject_unknown_members(a, &["mediaType", "utf8", "sha256"], "PAP_UNKNOWN")?;
    if text(field(a, "mediaType")).as_deref() != Some("application/json") {
        return Err(err("PAP_INVALID", "JSON artifact required"));
    }
    let Some(Value::String(source_units)) = field(a, "utf8") else {
        return Err(err("PAP_INVALID", "artifact source missing"));
    };
    let digest =
        text(field(a, "sha256")).ok_or_else(|| err("PAP_INVALID", "artifact digest missing"))?;
    if source_units.len() > max {
        return Err(err("PAP_LIMIT", "Artifact bound exceeded"));
    }
    ctx.charge_text(source_units.len(), Utf16::default())?;
    let source = source_units
        .to_utf8()
        .map_err(|_| err("PAP_INVALID", "Artifact source must be valid Unicode"))?;
    let bytes = source.as_bytes();
    if bytes.len() > max
        || digest.len() != 64
        || !digest
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(err("PAP_LIMIT", "Artifact bound or digest shape invalid"));
    }
    let actual = hex(&Sha256::digest(bytes));
    if actual != digest {
        return Err(err("PAP_INTEGRITY", "Artifact digest mismatch"));
    }
    Ok(object(vec![
        ("mediaType", s("application/json")),
        ("utf8", s(&source)),
        ("sha256", s(&digest)),
    ]))
}
fn prepared_artifact(value: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let text = serialization::stringify_compact(&value)?;
    if text.len() > PLAN_MAX {
        return Err(err("PAP_LIMIT", "prepared artifact byte bound exceeded"));
    }
    ctx.charge_text(text.len(), Utf16::default())?;
    let utf8 = text
        .to_utf8()
        .map_err(|_| err("PAP_INVALID", "prepared artifact contains invalid UTF-16"))?;
    if utf8.len() > PLAN_MAX {
        return Err(err("PAP_LIMIT", "prepared artifact byte bound exceeded"));
    }
    let digest = hex(&Sha256::digest(utf8.as_bytes()));
    Ok(object(vec![
        ("mediaType", s("application/json")),
        ("utf8", Value::String(text)),
        ("sha256", s(&digest)),
    ]))
}
fn compile_resource(
    src: &str,
    res: &SchemaResources,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    let val =
        serialization::read_json_value(&src.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)?;
    CompiledSchema::compile(&val, res, ctx)
}
fn validate_schema(
    schema: &CompiledSchema,
    value: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let failures = schema.validate(value, ctx)?;
    if let Some(failure) = failures.first() {
        return Err(EngineError::new(
            code,
            failure.instance_path.clone(),
            format!(
                "Value does not match its pinned schema ({})",
                failure.keyword
            ),
        ));
    }
    Ok(())
}
fn compare_target(
    actual: Option<&Value>,
    expected: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(actual) = actual {
        if json_equal(actual, expected, ctx)? {
            return Ok(());
        }
    }
    Err(err(
        "PAP_ACTION",
        "Plan target differs from original action",
    ))
}
fn json_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut left_value = copy_json(a, ctx)?;
    let mut right_value = copy_json(b, ctx)?;
    sort_object_keys(&mut left_value);
    sort_object_keys(&mut right_value);
    let left = serialization::stringify_compact(&left_value)?;
    let right = serialization::stringify_compact(&right_value)?;
    ctx.charge_work(left.len().saturating_add(right.len()), Utf16::default())?;
    Ok(left == right)
}
fn sort_object_keys(value: &mut Value) {
    match value {
        Value::Object(fields) => {
            for (_, child) in fields.iter_mut() {
                sort_object_keys(child);
            }
            fields.sort_by(|a, b| a.0.cmp(&b.0));
        }
        Value::Array(items) => {
            for item in items {
                sort_object_keys(item)
            }
        }
        _ => {}
    }
}
fn reject_unknown_members(value: &Value, allowed: &[&str], code: &str) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("PAP_INVALID", "Expected object"));
    };
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        if !seen.insert(key) {
            return Err(err(code, "Duplicate relevant member"));
        }
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(err(code, "Unknown relevant member"));
        }
    }
    Ok(())
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn producer_build(ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    const SOURCE: &[u8] = include_bytes!("action_plan_adapter.rs");
    const MODEL_SCHEMA: &[u8] =
        include_bytes!("../../../spec/extensions/actions/plan-model.schema.json");
    ctx.charge_work(
        SOURCE.len().saturating_add(MODEL_SCHEMA.len()),
        Utf16::default(),
    )?;
    let mut digest = Sha256::new();
    digest.update(b"umf.actions.plan-model.producer/1\0");
    digest.update(SOURCE);
    digest.update(MODEL_SCHEMA);
    let text = format!("sha256:{}", hex(&digest.finalize()));
    ctx.charge_text(text.encode_utf16().count(), Utf16::default())?;
    Ok(s(&text))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn s(text: &str) -> Value {
    Value::String(Utf16::from(text))
}
fn text(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(s)) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn number(v: Option<&Value>) -> Option<f64> {
    if let Some(Value::Number(n)) = v {
        Some(*n)
    } else {
        None
    }
}
fn bool_field(v: &Value, n: &str) -> Option<bool> {
    if let Some(Value::Bool(x)) = field(v, n) {
        Some(*x)
    } else {
        None
    }
}
fn empty_array(v: &Value, n: &str) -> bool {
    array_field(v, n).is_some_and(|a| a.is_empty())
}
fn field<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn field_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut()
            .find(|(key, _)| key == &Utf16::from(n))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn array_field<'a>(v: &'a Value, n: &str) -> Option<&'a [Value]> {
    if let Value::Array(a) = field(v, n)? {
        Some(a)
    } else {
        None
    }
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn obligation(path: String, kind: &str) -> Value {
    object(vec![
        ("id", s(&path)),
        ("status", s("checked")),
        ("kind", s(kind)),
        ("path", s(&path)),
    ])
}
fn prepared_obligations(values: &[Value], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(values.len(), Utf16::default())?;
    let mut result = Vec::with_capacity(values.len());
    for value in values {
        result.push(object(vec![
            (
                "id",
                copy_json(
                    field(value, "id").ok_or_else(|| err("PAP_ACTION", "obligation id missing"))?,
                    ctx,
                )?,
            ),
            ("status", s("checked")),
        ]));
    }
    Ok(Value::Array(result))
}
fn validate_model_pin(pin: &Value) -> Result<(), EngineError> {
    reject_unknown_members(
        pin,
        &["documentId", "revision", "umfVersion", "sha256"],
        "PAP_UNKNOWN",
    )?;
    for key in ["documentId", "revision"] {
        let text =
            text(field(pin, key)).ok_or_else(|| err("PAP_INVALID", "model pin text missing"))?;
        if text.is_empty() || text.encode_utf16().count() > 256 {
            return Err(err("PAP_LIMIT", "model pin text bound exceeded"));
        }
    }
    let digest =
        text(field(pin, "sha256")).ok_or_else(|| err("PAP_INVALID", "model digest missing"))?;
    if digest.len() != 64
        || !digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(err("PAP_INVALID", "model digest must be lowercase SHA-256"));
    }
    if text(field(pin, "umfVersion")).as_deref() != Some(CORE_VERSION) {
        return Err(err("PAP_PROFILE", "Unsupported core version"));
    }
    Ok(())
}
fn validate_action_pin(pin: &Value, model: &Value) -> Result<(), EngineError> {
    reject_unknown_members(
        pin,
        &["identity", "documentSha256", "invocation"],
        "PAP_UNKNOWN",
    )?;
    let identity =
        field(pin, "identity").ok_or_else(|| err("PAP_INVALID", "action identity missing"))?;
    reject_unknown_members(identity, &["module", "action"], "PAP_UNKNOWN")?;
    for key in ["module", "action"] {
        let text = text(field(identity, key))
            .ok_or_else(|| err("PAP_INVALID", "action identity text missing"))?;
        if text.is_empty() || text.encode_utf16().count() > 256 {
            return Err(err("PAP_LIMIT", "action identity bound exceeded"));
        }
    }
    if field(pin, "documentSha256") != field(model, "sha256") {
        return Err(err("PAP_INTEGRITY", "action document pin mismatch"));
    }
    let invocation =
        field(pin, "invocation").ok_or_else(|| err("PAP_PROFILE", "invocation profile missing"))?;
    reject_unknown_members(invocation, &["id", "version"], "PAP_UNKNOWN")?;
    if !matches!(
        text(field(invocation, "id")).as_deref(),
        Some("umf.actions.tx" | "umf.actions.local-tx")
    ) || text(field(invocation, "version")).as_deref() != Some("1")
    {
        return Err(err("PAP_PROFILE", "Unsupported invocation profile"));
    }
    Ok(())
}
fn validate_plan_envelopes(plan: &Value) -> Result<(), EngineError> {
    reject_unknown_members(
        field(plan, "model").ok_or_else(|| err("PAP_INVALID", "model missing"))?,
        &["documentId", "revision", "umfVersion", "sha256"],
        "PAP_UNKNOWN",
    )?;
    reject_unknown_members(
        field(plan, "action").ok_or_else(|| err("PAP_INVALID", "action missing"))?,
        &["identity", "documentSha256", "invocation"],
        "PAP_UNKNOWN",
    )?;
    let selection =
        field(plan, "selection").ok_or_else(|| err("PAP_INVALID", "selection missing"))?;
    reject_unknown_members(
        selection,
        &["profile", "artifact", "dependencies"],
        "PAP_UNKNOWN",
    )?;
    let inputs = field(plan, "inputs").ok_or_else(|| err("PAP_INVALID", "inputs missing"))?;
    reject_unknown_members(inputs, &["entityParameter", "assignments"], "PAP_UNKNOWN")?;
    for assignment in array_field(inputs, "assignments").unwrap_or(&[]) {
        reject_unknown_members(assignment, &["input", "field", "value"], "PAP_UNKNOWN")?;
    }
    for (name, allowed) in [
        (
            "execution",
            &[
                "selection",
                "atomicity",
                "conflict",
                "partition",
                "batchSize",
            ][..],
        ),
        ("limits", &["maxItems", "maxManifestBytes"][..]),
    ] {
        reject_unknown_members(
            field(plan, name).ok_or_else(|| err("PAP_INVALID", "execution/limits missing"))?,
            allowed,
            "PAP_UNKNOWN",
        )?;
    }
    Ok(())
}
fn push_obligation_once(out: &mut Vec<Value>, value: Value) {
    let id = field(&value, "id").cloned();
    if !out
        .iter()
        .any(|existing| field(existing, "id") == id.as_ref())
    {
        out.push(value);
    }
}
fn element_indices(document: &Value, reference: &Value) -> Result<(usize, usize), EngineError> {
    let module =
        text(field(reference, "module")).ok_or_else(|| err("PAP_REFERENCE", "module missing"))?;
    let element =
        text(field(reference, "element")).ok_or_else(|| err("PAP_REFERENCE", "element missing"))?;
    for (mi, m) in array_field(document, "modules")
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if text(field(m, "id")).as_deref() == Some(module.as_str()) {
            for (ei, e) in array_field(m, "elements").unwrap_or(&[]).iter().enumerate() {
                if text(field(e, "id")).as_deref() == Some(element.as_str()) {
                    return Ok((mi, ei));
                }
            }
        }
    }
    Err(err("PAP_REFERENCE", "Reference must resolve"))
}
fn ref_key(v: &Value) -> String {
    format!(
        "{}\0{}",
        text(field(v, "module")).unwrap_or_default(),
        text(field(v, "element")).unwrap_or_default()
    )
}
fn is_diagnostic(v: &Value) -> bool {
    text(field(v, "code")).is_some_and(|x| !x.is_empty() && x.encode_utf16().count() <= 256)
        && text(field(v, "path")).is_some_and(|x| x.encode_utf16().count() <= 4096)
        && text(field(v, "message"))
            .is_some_and(|x| !x.is_empty() && x.encode_utf16().count() <= 1024)
}
fn plan_diagnostic(code: &str, path: &str, message: &str) -> Value {
    object(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
    ])
}
fn error_as_plan_diagnostic(error: EngineError) -> Value {
    let code = if error.code.starts_with("PAP_") {
        error.code
    } else if error.code == "LIMIT" {
        "PAP_LIMIT".to_owned()
    } else {
        "PAP_ACTION".to_owned()
    };
    let path = error.path.to_utf8().unwrap_or_default();
    plan_diagnostic(
        &code,
        &path,
        "Original declaration, profile, or input was refused",
    )
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
