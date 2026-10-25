// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned, one-use receipt-first verification stages for Core Key operations.
use std::sync::Arc;

use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, Utf16, Value,
    core_keys::PreparedCoreKeyOperationVerification,
};

struct NoExtensionCapabilities;
impl Capabilities for NoExtensionCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "No extension callback is installed for prepared Core Key verification",
        ))
    }
}

fn take_required(
    fields: &mut Vec<(Utf16, Value)>,
    name: &str,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    context.charge_work(fields.len().saturating_add(name.len()), Utf16::from(name))?;
    let key = Utf16::from(name);
    let position = fields
        .iter()
        .position(|(candidate, _)| candidate == &key)
        .ok_or_else(|| {
            EngineError::new(
                "REQUEST",
                Utf16::from(name),
                "Explicit resource is required",
            )
        })?;
    Ok(fields.remove(position).1)
}

#[derive(Clone)]
pub struct CoreKeyVerificationRuntime {
    engine: Arc<Engine>,
    registry: Arc<Registry>,
    owner: Arc<()>,
}

pub struct PreparedCoreKeyVerification {
    stage: PreparedCoreKeyOperationVerification,
    owner: Arc<()>,
}

impl CoreKeyVerificationRuntime {
    pub fn new(resources: Value, context: &mut Context<'_>) -> Result<Self, EngineError> {
        let Value::Object(mut fields) = resources else {
            return Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Explicit resources must be an object",
            ));
        };
        let core_schema = take_required(&mut fields, "coreSchema", context)?;
        let reference_schema = take_required(&mut fields, "referenceSchema", context)?;
        let package_schema = take_required(&mut fields, "packageSchema", context)?;
        let constraints = take_required(&mut fields, "constraints", context)?;
        let domain_policy = take_required(&mut fields, "domainPolicy", context)?;
        if !fields.is_empty() {
            return Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Unknown explicit resource field",
            ));
        }
        let (engine, registry) = context.with_catalog_value_limit(|catalog| {
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
        Ok(Self {
            engine: Arc::new(engine),
            registry: Arc::new(registry),
            owner: Arc::new(()),
        })
    }

    pub fn prepare(
        &self,
        receipt: &Value,
        context: &mut Context<'_>,
    ) -> Result<PreparedCoreKeyVerification, EngineError> {
        let mut capabilities = NoExtensionCapabilities;
        let stage = umf_core::core_keys::prepare_core_key_operation_verification(
            receipt,
            &self.engine,
            &self.registry,
            &mut capabilities,
            context,
        )?;
        Ok(PreparedCoreKeyVerification {
            stage,
            owner: self.owner.clone(),
        })
    }

    pub fn finish(
        &self,
        prepared: PreparedCoreKeyVerification,
        current: &Value,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if !Arc::ptr_eq(&prepared.owner, &self.owner) {
            return Err(EngineError::new(
                "CORE_KEY_STAGE",
                Utf16::default(),
                "Prepared verification stage belongs to another engine",
            ));
        }
        prepared.stage.verify_current(current, context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::serialization::{self, Format};

    fn parse(text: &str) -> Value {
        serialization::read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
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
    fn set(value: &mut Value, name: &str, replacement: Value) {
        let Value::Object(fields) = value else {
            panic!("object")
        };
        let (_, slot) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .unwrap();
        *slot = replacement;
    }
    fn resources() -> Value {
        Value::Object(vec![
            (
                "coreSchema".into(),
                parse(include_str!("../../../spec/core/schema.json")),
            ),
            (
                "referenceSchema".into(),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
            ),
            (
                "packageSchema".into(),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
            ),
            (
                "constraints".into(),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
            ),
            (
                "domainPolicy".into(),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
        ])
    }
    fn receipt() -> Value {
        let frozen = parse(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json"
        ));
        let outcomes = get(&frozen, "outcomes");
        get(get(outcomes, "declare_key_explicit_primary"), "value").clone()
    }

    #[test]
    fn staged_core_key_verification_retains_receipt_and_rejects_cross_runtime_finish() {
        let receipt = receipt();
        let mut context = Context::ordinary();
        let runtime = CoreKeyVerificationRuntime::new(resources(), &mut context).unwrap();
        let mut other_context = Context::ordinary();
        let other = CoreKeyVerificationRuntime::new(resources(), &mut other_context).unwrap();
        let prepared = runtime.prepare(&receipt, &mut Context::ordinary()).unwrap();
        let current = get(&receipt, "target");
        let error = other
            .finish(prepared, current, &mut Context::ordinary())
            .unwrap_err();
        assert_eq!(error.code, "CORE_KEY_STAGE");

        let prepared = runtime.prepare(&receipt, &mut Context::ordinary()).unwrap();
        assert_eq!(
            runtime
                .finish(prepared, current, &mut Context::ordinary())
                .unwrap(),
            receipt
        );
    }

    #[test]
    fn runtime_rejects_unrecognized_resource_fields() {
        let Value::Object(mut fields) = resources() else {
            unreachable!()
        };
        fields.push((Utf16::from("futureResource"), Value::Null));
        let error = match CoreKeyVerificationRuntime::new(
            Value::Object(fields),
            &mut Context::ordinary(),
        ) {
            Ok(_) => panic!("expected closed resource-profile refusal"),
            Err(error) => error,
        };
        assert_eq!(error.code, "REQUEST");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Unknown explicit resource field"
        );
    }

    #[test]
    fn staged_verification_moves_large_retained_unknown_receipt_without_recopy() {
        // The predecessor packet exercises 700k retained units. Add the same
        // unknown root member to the valid source and target so receipt
        // recomputation must preserve it through both stages.
        let mut receipt = receipt();
        let retained = Value::String(Utf16::from("x".repeat(700_000)));
        let mut source = get(&receipt, "source").clone();
        let mut target = get(&receipt, "target").clone();
        if let Value::Object(fields) = &mut source {
            fields.push((Utf16::from("futureRetained"), retained.clone()));
        }
        if let Value::Object(fields) = &mut target {
            fields.push((Utf16::from("futureRetained"), retained));
        }
        set(&mut receipt, "source", source);
        set(&mut receipt, "target", target);
        let mut context = Context::ordinary();
        let runtime = CoreKeyVerificationRuntime::new(resources(), &mut context).unwrap();
        let prepared = runtime.prepare(&receipt, &mut Context::ordinary()).unwrap();
        let current = get(&receipt, "target");
        let returned = runtime
            .finish(prepared, current, &mut Context::ordinary())
            .unwrap();
        assert_eq!(returned, receipt);
    }
}
