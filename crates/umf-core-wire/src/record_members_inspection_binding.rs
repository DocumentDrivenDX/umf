// SPDX-License-Identifier: MIT OR Apache-2.0
//! Retained, opt-in runtime for Core Record Members inspection.
use std::sync::Arc;

use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, Utf16, Value,
    record_members_inspection::{self, RecordMembersInspectionSchema},
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
            "No extension callback is installed for Core Record Members inspection",
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

/// Immutable Engine/Registry/schema owner for repeated record-members inspection.
pub struct CoreRecordMembersInspectionRuntime {
    engine: Arc<Engine>,
    registry: Arc<Registry>,
    schema: RecordMembersInspectionSchema,
}

impl CoreRecordMembersInspectionRuntime {
    /// Construct from exactly the five checked-in Core Engine resources.
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
        let schema =
            record_members_inspection::prepare_record_members_inspection_schema(&engine, ctx)?;
        Ok(Self {
            engine: Arc::new(engine),
            registry: Arc::new(registry),
            schema,
        })
    }

    /// Inspect one source/identity pair with caller-owned, per-call controls.
    pub fn inspect(
        &self,
        source: &Value,
        identity: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut capabilities = NoExtensionCapabilities;
        record_members_inspection::inspect_core_record_members_prepared(
            source,
            identity,
            &self.engine,
            &self.registry,
            &mut capabilities,
            ctx,
            &self.schema,
        )
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

    fn text(value: &Value) -> String {
        match value {
            Value::String(value) => value.to_utf8().unwrap(),
            _ => panic!("expected string"),
        }
    }

    fn frozen() -> Value {
        parse(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json"
        ))
    }

    fn fixture(case_name: &str) -> (Value, Value) {
        let packet = frozen();
        let Value::Object(root) = packet else {
            panic!("packet")
        };
        let cases = root
            .iter()
            .find(|(key, _)| key == &Utf16::from("cases"))
            .map(|(_, value)| value)
            .unwrap();
        let Value::Object(cases) = cases else {
            panic!("cases")
        };
        let case = cases
            .iter()
            .find(|(key, _)| key == &Utf16::from(case_name))
            .map(|(_, value)| value)
            .unwrap();
        let source = get(case, "source").clone();
        let identity = get(case, "identity").clone();
        (source, identity)
    }

    #[test]
    fn constructor_requires_exact_resources_and_inspector_replays_known_case() {
        let mut bad = resources();
        let Value::Object(fields) = &mut bad else {
            unreachable!()
        };
        fields.push((Utf16::from("future"), Value::Bool(true)));
        let bad_result = CoreRecordMembersInspectionRuntime::new(bad, &mut Context::ordinary());
        assert_eq!(bad_result.err().unwrap().code, "REQUEST");

        let mut missing = resources();
        let Value::Object(fields) = &mut missing else {
            unreachable!()
        };
        fields.retain(|(key, _)| key != &Utf16::from("domainPolicy"));
        let missing_result =
            CoreRecordMembersInspectionRuntime::new(missing, &mut Context::ordinary());
        assert_eq!(missing_result.err().unwrap().code, "REQUEST");

        let mut setup = Context::ordinary();
        let runtime = CoreRecordMembersInspectionRuntime::new(resources(), &mut setup).unwrap();
        let (source, identity) = fixture("known");
        let result = runtime
            .inspect(&source, &identity, &mut Context::ordinary())
            .unwrap();
        let expected = frozen();
        let Value::Object(root) = expected else {
            unreachable!()
        };
        let outcomes = root
            .iter()
            .find(|(key, _)| key == &Utf16::from("outcomes"))
            .map(|(_, value)| value)
            .unwrap();
        let Value::Object(outcomes) = outcomes else {
            unreachable!()
        };
        let expected = outcomes
            .iter()
            .find(|(key, _)| key == &Utf16::from("known"))
            .map(|(_, value)| value)
            .unwrap();
        let Value::Object(expected) = expected else {
            unreachable!()
        };
        let expected = expected
            .iter()
            .find(|(key, _)| key == &Utf16::from("value"))
            .map(|(_, value)| value)
            .unwrap();
        assert_eq!(&result, expected);
    }

    #[test]
    fn retained_runtime_matches_all_frozen_successes_and_refusals() {
        let packet = frozen();
        let cases = get(&packet, "cases");
        let outcomes = get(&packet, "outcomes");
        let Value::Object(cases) = cases else {
            panic!("cases")
        };
        let mut setup = Context::ordinary();
        let runtime = CoreRecordMembersInspectionRuntime::new(resources(), &mut setup).unwrap();
        for (name, case) in cases {
            let source = get(case, "source");
            let identity = get(case, "identity");
            let expected = get(outcomes, &name.to_utf8().unwrap());
            let actual = runtime.inspect(source, identity, &mut Context::ordinary());
            if get(expected, "ok") == &Value::Bool(true) {
                assert_eq!(actual.unwrap(), *get(expected, "value"), "case={name:?}");
            } else {
                let error = actual.unwrap_err();
                let expected_error = get(expected, "error");
                assert_eq!(
                    error.code,
                    text(get(expected_error, "code")),
                    "case={name:?}"
                );
                assert_eq!(
                    Value::String(error.message),
                    *get(expected_error, "message"),
                    "case={name:?}"
                );
                assert_eq!(
                    Value::String(error.path),
                    *get(expected_error, "path"),
                    "case={name:?}"
                );
            }
        }
    }

    #[test]
    fn no_extension_callback_is_installed() {
        let error = NoExtensionCapabilities
            .validate_extension(
                1,
                &Value::Null,
                &umf_core::SemanticContext {
                    document: Value::Null,
                    source_document: None,
                    source_payload: None,
                    path: Utf16::default(),
                    scope: String::new(),
                },
            )
            .unwrap_err();
        assert_eq!(
            error.to_utf8().unwrap(),
            "No extension callback is installed for Core Record Members inspection"
        );
    }
}
