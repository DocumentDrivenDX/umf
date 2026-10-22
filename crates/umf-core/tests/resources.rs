// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20, US-089-AC24
use umf_core::{
    context::{Context, Limits, ResourceProfile},
    Capabilities, Diagnostic, Engine, EngineError, Registry, ResourceSet, SemanticContext, Utf16,
    Value,
};

fn parse(source: &str) -> Value {
    let units = source.encode_utf16().collect::<Vec<_>>();
    umf_core::serialization::read_json_value(
        &units,
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

#[test]
fn hard_isolated_is_refused_before_context_work() {
    let error: EngineError =
        match Context::with_limits(ResourceProfile::HardIsolated, Limits::ordinary()) {
            Ok(_) => panic!("HardIsolated must be rejected"),
            Err(error) => error,
        };
    assert_eq!(error.code, "RESOURCE_PROFILE_UNAVAILABLE");
    assert_eq!(error.path.len(), 0);
}

#[test]
fn work_meter_failure_propagates() {
    let mut meter = |_amount: usize| {
        Err(EngineError::new(
            "METER_STOP",
            Default::default(),
            "stopped",
        ))
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = ctx.charge_work(1, Default::default()).unwrap_err();
    assert_eq!(error.code, "METER_STOP");
}

#[test]
fn source_entry_reports_copy_cancellation_as_an_operation_error() {
    let engine = engine();
    let document = parse(r#"{"umf":"0.10.0","id":"x","vocabularies":{},"modules":[]}"#);
    let mut cancelled = || true;
    let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
    let error = engine
        .validate_document(&document, &Registry::new(), &mut NoCapabilities, &mut ctx)
        .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
}

#[test]
fn engine_exposes_structural_only_and_constraint_only_paths() {
    let engine = engine();
    let invalid = Value::Object(vec![]);
    let structural = engine
        .core_structure_diagnostics(&invalid, &mut Context::ordinary())
        .unwrap();
    assert!(!structural.is_empty());
    // This entrypoint deliberately bypasses structural validation.
    let _ = engine
        .run_core_constraints(
            &invalid,
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
}

#[test]
fn structural_diagnostic_output_is_metered_before_copying_model_text() {
    let mut policy = parse(include_str!(
        "../../../spec/metamodel/generated/domain-policy.json"
    ));
    let Value::Object(policy_members) = &mut policy else {
        panic!("domain policy object expected")
    };
    let structural_rule = policy_members
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("structuralDiagnostic"))
        .map(|(_, value)| value)
        .expect("structuralDiagnostic rule");
    let Value::Object(rule_members) = structural_rule else {
        panic!("structural diagnostic rule object expected")
    };
    for (key, value) in rule_members {
        if key == &Utf16::from("code") {
            *value = Value::string_utf8("C".repeat(50_001));
        } else if key == &Utf16::from("message") {
            *value = Value::string_utf8("M".repeat(50_001));
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            policy,
        ),
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut meter = |amount: usize| {
        if amount >= 50_000 {
            Err(EngineError::new(
                "DIAGNOSTIC_OUTPUT_METER",
                Utf16::default(),
                "diagnostic output denied",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = engine
        .core_structure_diagnostics(&Value::Object(vec![]), &mut ctx)
        .unwrap_err();
    assert_eq!(error.code, "DIAGNOSTIC_OUTPUT_METER");
}

#[test]
fn schema_resource_snapshot_ids_are_work_metered_without_a_source_cap() {
    const ID_LENGTH: usize = 4_000_001;
    let id = format!("urn:umf:resource:{}", "x".repeat(ID_LENGTH));
    let resources = ResourceSet::new(
        Value::Object(vec![(Utf16::from("$id"), Value::string_utf8(id.clone()))]),
        Value::Bool(true),
        Value::Bool(true),
        parse(include_str!(
            "../../../spec/metamodel/generated/core-constraints.json"
        )),
        parse(include_str!(
            "../../../spec/metamodel/generated/domain-policy.json"
        )),
    );
    let engine = Engine::new(resources, &mut Context::catalog()).unwrap();
    let snapshot = engine
        .schema_resources_with_context(&mut Context::ordinary())
        .unwrap();
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].0.len(), id.encode_utf16().count());
}

#[test]
fn ordinary_constraint_instruction_budget_is_five_million_steps() {
    let mut ctx = Context::ordinary();
    for _ in 0..5_000_000 {
        ctx.charge_constraint_step(Default::default()).unwrap();
    }
    assert_eq!(ctx.constraint_steps(), 5_000_000);
    assert_eq!(
        ctx.charge_constraint_step(Default::default())
            .unwrap_err()
            .code,
        "LIMIT"
    );
}
