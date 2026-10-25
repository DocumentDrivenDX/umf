// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in retained Core Record Type verification runtime.
use std::sync::Arc;

use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, Utf16, Value,
    copy_json,
    core_record_type::{self, RecordTypeOperationSchema},
};

struct NoExtensionCapabilities;
impl Capabilities for NoExtensionCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "No extension callback is installed for Core Record Type verification",
        ))
    }
}

fn take_required(
    fields: &mut Vec<(Utf16, Value)>,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(fields.len().saturating_add(name.len()), Utf16::from(name))?;
    let key = Utf16::from(name);
    let index = fields
        .iter()
        .position(|(candidate, _)| candidate == &key)
        .ok_or_else(|| {
            EngineError::new(
                "REQUEST",
                Utf16::from(name),
                "Explicit resource is required",
            )
        })?;
    Ok(fields.remove(index).1)
}

#[derive(Debug)]
pub struct CoreRecordTypeVerificationRuntime {
    engine: Arc<Engine>,
    registry: Arc<Registry>,
    schema: RecordTypeOperationSchema,
    owner: Arc<()>,
}

#[derive(Debug)]
pub struct PreparedCoreRecordTypeVerification {
    receipt: Value,
    charged_work: u64,
    constraint_steps: usize,
    owner: Arc<()>,
}

impl PreparedCoreRecordTypeVerification {
    /// Carry receipt-admission work into the context that will admit `current`.
    /// Call only after `begin_finish` has validated and consumed the stage.
    pub fn seed_finish_context(&self, ctx: &mut Context<'_>) {
        ctx.carry_transport_usage(self.charged_work, self.constraint_steps);
    }
}

impl CoreRecordTypeVerificationRuntime {
    /// Build an immutable runtime from exactly the five Core Engine resources.
    pub fn new(resources: Value, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let Value::Object(mut fields) = resources else {
            return Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Explicit resources must be an object",
            ));
        };
        let core_schema = take_required(&mut fields, "coreSchema", ctx)?;
        let reference_schema = take_required(&mut fields, "referenceSchema", ctx)?;
        let package_schema = take_required(&mut fields, "packageSchema", ctx)?;
        let constraints = take_required(&mut fields, "constraints", ctx)?;
        let domain_policy = take_required(&mut fields, "domainPolicy", ctx)?;
        if !fields.is_empty() {
            return Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Unknown explicit resource field",
            ));
        }
        let (engine, registry) = ctx.with_catalog_value_limit(|catalog| {
            let engine = Engine::new(
                ResourceSet::new(
                    core_schema,
                    reference_schema,
                    package_schema,
                    constraints,
                    domain_policy,
                ),
                catalog,
            )?;
            let registry = engine.registry(catalog)?;
            Ok::<_, EngineError>((engine, registry))
        })?;
        let schema = core_record_type::prepare_record_type_operation_schema(ctx)?;
        Ok(Self {
            engine: Arc::new(engine),
            registry: Arc::new(registry),
            schema,
            owner: Arc::new(()),
        })
    }

    /// Admit and recompute the receipt before the caller admits `current`.
    pub fn prepare(
        &self,
        receipt: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<PreparedCoreRecordTypeVerification, EngineError> {
        let mut capabilities = NoExtensionCapabilities;
        let receipt = core_record_type::prepare_core_record_type_verification_prepared(
            receipt,
            &self.engine,
            &self.registry,
            &mut capabilities,
            ctx,
            &self.schema,
        )?;
        Ok(PreparedCoreRecordTypeVerification {
            receipt,
            charged_work: ctx.charged_work(),
            constraint_steps: ctx.constraint_steps(),
            owner: self.owner.clone(),
        })
    }

    /// Consume and validate the stage before a host binding admits `current`.
    pub fn begin_finish(
        &self,
        prepared: PreparedCoreRecordTypeVerification,
    ) -> Result<PreparedCoreRecordTypeVerification, EngineError> {
        if !Arc::ptr_eq(&prepared.owner, &self.owner) {
            return Err(EngineError::new(
                "CORE_RECORD_TYPE_STAGE",
                Utf16::default(),
                "Prepared verification stage belongs to another engine",
            ));
        }
        Ok(prepared)
    }

    /// Consume a receipt stage, then admit and compare the current document.
    pub fn finish(
        &self,
        prepared: PreparedCoreRecordTypeVerification,
        current: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if !Arc::ptr_eq(&prepared.owner, &self.owner) {
            return Err(EngineError::new(
                "CORE_RECORD_TYPE_STAGE",
                Utf16::default(),
                "Prepared verification stage belongs to another engine",
            ));
        }
        if ctx.charged_work() < prepared.charged_work
            || ctx.constraint_steps() < prepared.constraint_steps
        {
            return Err(EngineError::new(
                "CORE_RECORD_TYPE_STAGE",
                Utf16::default(),
                "Finish context was not seeded with prepared verification usage",
            ));
        }
        // The caller seeds this context with the consumed stage's counters
        // before admitting `current`, so decode and comparison share limits.
        let current = copy_json(current, ctx)?;
        core_record_type::finish_core_record_type_verification(prepared.receipt, current, ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::{
        Limits, ResourceProfile,
        serialization::{self, Format},
    };

    fn parse(text: &str) -> Value {
        serialization::read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn resources() -> Value {
        parse(concat!(
            "{\"coreSchema\":",
            include_str!("../../../spec/core/schema.json"),
            ",\"referenceSchema\":",
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            ",\"packageSchema\":",
            include_str!("../../../spec/core/extension-package.schema.json"),
            ",\"constraints\":",
            include_str!("../../../spec/metamodel/generated/core-constraints.json"),
            ",\"domainPolicy\":",
            include_str!("../../../spec/metamodel/generated/domain-policy.json"),
            "}"
        ))
    }

    fn receipt() -> Value {
        let packet = parse(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r5-core-record-type/frozen-typescript.json"
        ));
        let Value::Object(fields) = packet else {
            panic!("packet object")
        };
        let (_, successes) = fields
            .into_iter()
            .find(|(key, _)| key == &Utf16::from("successes"))
            .unwrap();
        let Value::Object(fields) = successes else {
            panic!("successes object")
        };
        fields
            .into_iter()
            .find(|(key, _)| key == &Utf16::from("declare-nested"))
            .unwrap()
            .1
    }

    fn runtime(ctx: &mut Context<'_>) -> CoreRecordTypeVerificationRuntime {
        CoreRecordTypeVerificationRuntime::new(resources(), ctx).unwrap()
    }

    fn get<'a>(value: &'a Value, name: &str) -> &'a Value {
        let Value::Object(fields) = value else {
            panic!("object")
        };
        fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .unwrap()
    }

    #[test]
    fn retained_stage_verifies_current_with_cumulative_context() {
        let receipt = receipt();
        let current = get(&receipt, "target").clone();
        let mut setup = Context::ordinary();
        let runtime = runtime(&mut setup);
        let stage = runtime.prepare(&receipt, &mut Context::ordinary()).unwrap();
        let stage = runtime.begin_finish(stage).unwrap();
        let mut finish_context = Context::ordinary();
        stage.seed_finish_context(&mut finish_context);
        let result = runtime
            .finish(stage, &current, &mut finish_context)
            .unwrap();
        assert_eq!(result, receipt);
        assert!(finish_context.charged_work() > 0);
    }

    #[test]
    fn retained_stage_seeds_finish_context_before_current_admission() {
        let receipt = receipt();
        let mut setup = Context::ordinary();
        let runtime = runtime(&mut setup);
        let mut first = Context::ordinary();
        let stage = runtime.prepare(&receipt, &mut first).unwrap();
        assert!(stage.charged_work > 0);
        assert!(stage.constraint_steps > 0);

        let stage = runtime.begin_finish(stage).unwrap();
        let mut limits = Limits::ordinary();
        limits.max_constraint_steps = stage.constraint_steps;
        let mut second = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        stage.seed_finish_context(&mut second);
        assert_eq!(second.charged_work(), stage.charged_work);
        assert_eq!(second.constraint_steps(), stage.constraint_steps);
        // The stage's work has already consumed the complete instruction
        // budget, so an instruction encountered while admitting current fails.
        let error = second.charge_constraint_step(Utf16::default()).unwrap_err();
        assert_eq!(error.code, "LIMIT");
    }

    #[test]
    fn retained_stage_rejects_cross_engine_before_current_is_available() {
        let receipt = receipt();
        let mut setup_a = Context::ordinary();
        let runtime_a = runtime(&mut setup_a);
        let mut setup_b = Context::ordinary();
        let runtime_b = runtime(&mut setup_b);
        let stage = runtime_a
            .prepare(&receipt, &mut Context::ordinary())
            .unwrap();
        let error = runtime_b.begin_finish(stage).unwrap_err();
        assert_eq!(error.code, "CORE_RECORD_TYPE_STAGE");
    }

    #[test]
    fn retained_stage_refuses_finish_when_context_was_not_seeded() {
        let receipt = receipt();
        let current = get(&receipt, "target").clone();
        let mut setup = Context::ordinary();
        let runtime = runtime(&mut setup);
        let stage = runtime.prepare(&receipt, &mut Context::ordinary()).unwrap();
        let stage = runtime.begin_finish(stage).unwrap();
        let mut unseeded = Context::ordinary();
        let error = runtime.finish(stage, &current, &mut unseeded).unwrap_err();
        assert_eq!(error.code, "CORE_RECORD_TYPE_STAGE");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Finish context was not seeded with prepared verification usage"
        );
    }
}
