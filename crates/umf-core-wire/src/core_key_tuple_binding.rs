// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned per-instance prepared Key tuple binding state.

use std::sync::Arc;
use umf_core::copy_json;
use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, Utf16, Value,
    core_key_tuple::{self, PreparedCoreKeyTuples, VerifiedCoreKeyTupleReceipt},
};

// A 4,000,000-byte tuple receipt carries 8,000,000 UTF-16 hex units; source,
// current document, and tuple values can coexist in the verification input.
// Bound this exceptional receipt profile by Context's 32 Mi-unit ceiling;
// core still enforces the predecessor's 4,000,000-byte tuple limit.
const KEY_TUPLE_TEXT_SCOPE: usize = 32 * 1024 * 1024;

fn take_required(
    fields: &mut Vec<(Utf16, Value)>,
    name: &str,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Charge the lookup before scanning/moving the field. Ownership transfer
    // avoids cloning decoded schema trees before Engine admission.
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

struct NoExtensionCapabilities;
impl Capabilities for NoExtensionCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "No extension callback is installed for prepared Key tuple validation",
        ))
    }
}

/// Owns the immutable model resources needed by direct tuple operations.
#[derive(Clone)]
pub struct CoreKeyTupleRuntime {
    engine: Arc<Engine>,
    registry: Arc<Registry>,
}

/// One-shot source/identity/value admission stage. The binding carries its
/// TransportUsage into the options stage so work remains cumulative.
pub struct CoreKeyTupleEncodeStage {
    runtime: CoreKeyTupleRuntime,
    source: Value,
    identity: Value,
    values: Value,
}

impl CoreKeyTupleEncodeStage {
    pub fn finish(
        self,
        options: Option<&Value>,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        self.runtime
            .encode_options(&self.source, &self.identity, &self.values, options, context)
    }
}

impl CoreKeyTupleRuntime {
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
            Ok((engine, registry))
        })?;
        Ok(Self {
            engine: Arc::new(engine),
            registry: Arc::new(registry),
        })
    }

    pub fn prepare(
        &self,
        source: &Value,
        context: &mut Context<'_>,
    ) -> Result<PreparedCoreKeyTupleBinding, EngineError> {
        let mut capabilities = NoExtensionCapabilities;
        let prepared = core_key_tuple::prepare_core_key_tuples(
            source,
            &self.engine,
            &self.registry,
            &mut capabilities,
            context,
        )?;
        Ok(PreparedCoreKeyTupleBinding {
            prepared,
            runtime: self.clone(),
        })
    }

    /// Encode directly against this admitted Engine/Registry. Input copies,
    /// semantic work, receipt construction, and output limits share one call
    /// Context supplied by the binding.
    pub fn encode(
        &self,
        source: &Value,
        identity: &Value,
        values: &Value,
        profile: Option<&str>,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            core_key_tuple::encode_core_key_tuple(
                source,
                identity,
                values,
                profile,
                &self.engine,
                &self.registry,
                &mut NoExtensionCapabilities,
                context,
            )
        })
    }

    /// Direct-request variant that preserves the wire API's full options
    /// shape check while keeping option admission after source/identity/value
    /// transport admission.
    pub fn encode_options(
        &self,
        source: &Value,
        identity: &Value,
        values: &Value,
        options: Option<&Value>,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let profile = options.map(|options| match options {
            Value::Object(fields) if fields.len() == 1 && fields[0].0 == Utf16::from("profile") => {
                match &fields[0].1 {
                    Value::String(text) => text
                        .to_utf8()
                        .unwrap_or_else(|_| "<invalid-profile>".to_owned()),
                    _ => "<invalid-profile>".to_owned(),
                }
            }
            _ => "<invalid-profile>".to_owned(),
        });
        self.encode(source, identity, values, profile.as_deref(), context)
    }

    pub fn prepare_encode_stage(
        &self,
        source: Value,
        identity: Value,
        values: Value,
    ) -> Result<CoreKeyTupleEncodeStage, EngineError> {
        core_key_tuple::validate_core_key_tuple_encode_prefix(&source, &identity)?;
        Ok(CoreKeyTupleEncodeStage {
            runtime: self.clone(),
            source,
            identity,
            values,
        })
    }

    /// Validate and exactly recompute a receipt before the host reads current.
    pub fn prepare_verification(
        &self,
        receipt: &Value,
        context: &mut Context<'_>,
    ) -> Result<PreparedCoreKeyTupleVerification, EngineError> {
        let verified = context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            core_key_tuple::validate_core_key_tuple_receipt(
                receipt,
                &self.engine,
                &self.registry,
                &mut NoExtensionCapabilities,
                context,
            )
        })?;
        Ok(PreparedCoreKeyTupleVerification { verified })
    }

    pub fn read_bytes(
        &self,
        receipt: &Value,
        current: &Value,
        context: &mut Context<'_>,
    ) -> Result<Vec<u8>, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            core_key_tuple::read_core_key_tuple_bytes(
                receipt,
                current,
                &self.engine,
                &self.registry,
                &mut NoExtensionCapabilities,
                context,
            )
        })
    }

    /// Admit and exactly recompute a receipt before the host reads `current`.
    pub fn prepare_byte_read(
        &self,
        receipt: &Value,
        context: &mut Context<'_>,
    ) -> Result<PreparedCoreKeyTupleByteRead, EngineError> {
        let verified = self.prepare_verification(receipt, context)?.verified;
        Ok(PreparedCoreKeyTupleByteRead { verified })
    }
}

/// Receipt-first stage shared by direct verify and raw byte read. Bindings
/// retain this value between two host calls so current is decoded only after
/// receipt admission succeeds.
#[derive(Debug)]
pub struct PreparedCoreKeyTupleVerification {
    verified: VerifiedCoreKeyTupleReceipt,
}

impl PreparedCoreKeyTupleVerification {
    pub fn verify_current(
        &self,
        current: &Value,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            core_key_tuple::validate_verified_core_key_tuple_current(
                &self.verified,
                current,
                context,
            )?;
            copy_json(self.verified.as_value(), context)
        })
    }

    pub fn read_bytes(
        &self,
        current: &Value,
        context: &mut Context<'_>,
    ) -> Result<Vec<u8>, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            core_key_tuple::validate_verified_core_key_tuple_current(
                &self.verified,
                current,
                context,
            )?;
            core_key_tuple::read_verified_core_key_tuple_bytes(&self.verified, context)
        })
    }
}

/// Rust-owned result of receipt-first admission. The host cannot construct or
/// modify this value between receipt validation and current-document reading.
#[derive(Debug)]
pub struct PreparedCoreKeyTupleByteRead {
    verified: VerifiedCoreKeyTupleReceipt,
}

impl PreparedCoreKeyTupleByteRead {
    pub fn read_bytes(
        &self,
        current: &Value,
        context: &mut Context<'_>,
    ) -> Result<Vec<u8>, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            core_key_tuple::validate_verified_core_key_tuple_current(
                &self.verified,
                current,
                context,
            )?;
            core_key_tuple::read_verified_core_key_tuple_bytes(&self.verified, context)
        })
    }
}

/// Owns a validated source snapshot and runtime; each operation supplies a
/// fresh Context while reusing Rust's admitted validation diagnostics.
pub struct PreparedCoreKeyTupleBinding {
    prepared: PreparedCoreKeyTuples,
    runtime: CoreKeyTupleRuntime,
}

impl PreparedCoreKeyTupleBinding {
    pub fn source(&self) -> &Value {
        self.prepared.source()
    }

    /// Return the retained source through the tagged transport profile while
    /// keeping the caller's work/control accounting on the same Context.
    pub fn source_wire(&self, context: &mut Context<'_>) -> Result<String, EngineError> {
        context.with_tagged_transport_limit(|transport| crate::encode(self.source(), transport))
    }

    pub fn encode(
        &self,
        identity: &Value,
        values: &Value,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            self.prepared.encode(
                identity,
                values,
                &self.runtime.engine,
                &self.runtime.registry,
                &mut NoExtensionCapabilities,
                context,
            )
        })
    }

    pub fn verify(&self, receipt: &Value, context: &mut Context<'_>) -> Result<Value, EngineError> {
        context.with_aggregate_text_limit(KEY_TUPLE_TEXT_SCOPE, |context| {
            self.prepared.verify(
                receipt,
                &self.runtime.engine,
                &self.runtime.registry,
                &mut NoExtensionCapabilities,
                context,
            )
        })
    }

    pub fn read_bytes(
        &self,
        receipt: &Value,
        current: &Value,
        context: &mut Context<'_>,
    ) -> Result<Vec<u8>, EngineError> {
        self.runtime.read_bytes(receipt, current, context)
    }
}

#[cfg(test)]
mod direct_runtime_tests {
    use super::*;
    use umf_core::context::TransportUsage;
    use umf_core::serialization::{self, Format};

    fn value(json: &str) -> Value {
        let source = json.encode_utf16().collect::<Vec<_>>();
        serialization::read_json_value(&source, Format::Json, &mut Context::ordinary()).unwrap()
    }

    fn resources() -> Value {
        value(&format!(
            "{{\"coreSchema\":{},\"referenceSchema\":{},\"packageSchema\":{},\"constraints\":{},\"domainPolicy\":{}}}",
            include_str!("../../../spec/core/schema.json"),
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            include_str!("../../../spec/core/extension-package.schema.json"),
            include_str!("../../../spec/metamodel/generated/core-constraints.json"),
            include_str!("../../../spec/metamodel/generated/domain-policy.json"),
        ))
    }

    fn runtime() -> CoreKeyTupleRuntime {
        CoreKeyTupleRuntime::new(resources(), &mut Context::ordinary()).unwrap()
    }

    fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
        match value {
            Value::Object(fields) => fields
                .iter()
                .find(|(key, _)| key.to_utf8().ok().as_deref() == Some(name))
                .map(|(_, value)| value)
                .unwrap_or_else(|| panic!("missing field {name}")),
            _ => panic!("expected object for field {name}"),
        }
    }

    fn text(value: &Value) -> String {
        match value {
            Value::String(value) => value.to_utf8().unwrap(),
            _ => panic!("expected string"),
        }
    }

    fn error_matches(error: &EngineError, expected: &Value) {
        assert_eq!(error.code, text(field(expected, "code")));
        assert_eq!(
            error.message.to_utf8().unwrap(),
            text(field(expected, "message"))
        );
        assert_eq!(
            error.path,
            match field(expected, "path") {
                Value::String(path) => path.clone(),
                _ => panic!("expected path string"),
            }
        );
    }

    fn packet() -> Value {
        value(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r5-core-key-tuple/frozen-typescript.json"
        ))
    }

    #[test]
    fn direct_runtime_matches_frozen_in_profile_encoders_and_receipt_first_verification() {
        let packet = packet();
        let runtime = runtime();
        let cases = match field(&packet, "cases") {
            Value::Object(fields) => fields,
            _ => panic!(),
        };
        let mut matched = 0;
        for (id, item) in cases {
            let id = id.to_utf8().unwrap();
            let source = field(item, "source");
            let identity = field(item, "identity");
            let mut values = field(item, "values").clone();
            if id == "integer-host-number" {
                if let Value::Array(items) = &mut values {
                    if let Value::Object(fields) = &mut items[0] {
                        let (_, token) = fields
                            .iter_mut()
                            .find(|(key, _)| key.to_utf8().ok().as_deref() == Some("integerToken"))
                            .unwrap();
                        *token = Value::Number(9_007_199_254_740_992.0);
                    }
                }
            }
            let profile = match item {
                Value::Object(fields) => fields
                    .iter()
                    .find(|(key, _)| key.to_utf8().ok().as_deref() == Some("profile"))
                    .map(|(_, value)| match value {
                        Value::String(value) => value.to_utf8().unwrap(),
                        _ => panic!(),
                    }),
                _ => panic!("expected case object"),
            };
            let result = runtime.encode(
                source,
                identity,
                &values,
                profile.as_deref(),
                &mut Context::ordinary(),
            );
            if id == "integer-host-number" {
                let expected = field(field(&packet, "outcomes"), "integer-host-number");
                let expected = field(expected, "error");
                error_matches(&result.unwrap_err(), &expected);
                continue;
            }
            let outcome = field(field(&packet, "outcomes"), &id);
            if matches!(field(outcome, "ok"), Value::Bool(false)) {
                error_matches(&result.unwrap_err(), field(outcome, "error"));
            } else {
                let actual = result.unwrap_or_else(|error| panic!("encoder case {id}: {error:?}"));
                assert_eq!(actual, field(outcome, "value").clone(), "encoder case {id}");
            }
            matched += 1;
        }
        assert_eq!(matched, 87);

        let verification_cases = match field(&packet, "verificationCases") {
            Value::Object(fields) => fields,
            _ => panic!(),
        };
        let mut verified = 0;
        for (id, item) in verification_cases {
            let id = id.to_utf8().unwrap();
            let receipt = field(item, "receipt");
            let current = field(item, "current");
            let result = runtime
                .prepare_verification(receipt, &mut Context::ordinary())
                .and_then(|stage| stage.verify_current(current, &mut Context::ordinary()));
            let expected = field(field(&packet, "verificationOutcomes"), &id);
            if matches!(field(expected, "ok"), Value::Bool(false)) {
                error_matches(&result.unwrap_err(), field(expected, "error"));
            } else {
                assert_eq!(
                    result.unwrap(),
                    field(expected, "value").clone(),
                    "verification case {id}"
                );
            }
            verified += 1;
        }
        assert_eq!(verified, 5);
    }

    #[test]
    fn direct_verification_stage_carries_transport_usage_without_double_charging() {
        let packet = packet();
        let item = field(field(&packet, "cases"), "decimal-scale-2-short-lexical");
        let receipt = field(
            field(field(&packet, "outcomes"), "decimal-scale-2-short-lexical"),
            "value",
        )
        .clone();
        let current = field(item, "source").clone();
        let runtime = runtime();
        let charged = std::cell::Cell::new(0usize);
        let mut hook = |amount| {
            charged.set(charged.get() + amount);
            Ok(())
        };
        let mut receipt_context = Context::ordinary().with_host_control(&mut hook);
        let stage = runtime
            .prepare_verification(&receipt, &mut receipt_context)
            .unwrap();
        let mut usage = TransportUsage::default();
        usage.capture(&receipt_context);
        let receipt_work = receipt_context.charged_work();
        let receipt_steps = receipt_context.constraint_steps();
        let charged_after_receipt = charged.get();
        drop(receipt_context);

        // The binding seeds this usage before decoding current. The seeded
        // counters constrain the same logical operation without a second host
        // notification for work already admitted during receipt validation.
        let mut next = Context::ordinary().with_host_control(&mut hook);
        usage.seed(&mut next);
        assert_eq!(next.charged_work(), receipt_work);
        assert_eq!(next.constraint_steps(), receipt_steps);
        let charged_before_current = charged.get();
        stage.verify_current(&current, &mut next).unwrap();
        let current_delta = next.charged_work() - receipt_work;
        let notified_delta = charged.get() - charged_before_current;
        assert_eq!(current_delta as usize, notified_delta);
        assert!(charged_after_receipt > 0);

        let next_public_call = Context::ordinary();
        assert_eq!(next_public_call.charged_work(), 0);
        assert_eq!(next_public_call.constraint_steps(), 0);
    }
}
