// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    registry::Registry,
    serialization::{read_json_value, Format},
    Context, Diagnostic, EngineError, Utf16, Value,
};

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn resources() -> ResourceSet {
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
    )
}

fn run_with_meter(
    link_count: usize,
    stop_before: Option<usize>,
) -> (Result<Value, EngineError>, usize) {
    let references = (0..link_count)
        .map(|_| r#"{"role":"record-type","module":"m","element":"target"}"#)
        .collect::<Vec<_>>()
        .join(",");
    let source = parse(&format!(
        r#"{{"umf":"0.10.0","id":"meter-fixture","vocabularies":{{}},"modules":[{{"id":"m","namespace":"m","elements":[{{"id":"owner","kind":"record","members":[],"extensions":{{}},"references":[{references}]}},{{"id":"target","kind":"record","members":[],"extensions":{{}}}}]}}]}}"#
    ));
    let identity = parse(r#"{"module":"m","element":"owner"}"#);
    let engine = Engine::new(resources(), &mut Context::ordinary()).unwrap();
    let mut total = 0usize;
    let mut meter = |amount: usize| {
        total = total.saturating_add(amount);
        if stop_before.is_some_and(|limit| total > limit) {
            Err(EngineError::new(
                "REFERENCE_LINKS_WORK_STOP",
                Utf16::default(),
                "reference link work stopped",
            ))
        } else {
            Ok(())
        }
    };
    let result = umf_core::reference_links_inspection::inspect_core_reference_links(
        &source,
        &identity,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    (result, total)
}

#[test]
fn repeated_links_are_metered_and_work_budget_refusal_propagates() {
    let (one, one_work) = run_with_meter(1, None);
    assert!(one.is_ok());
    let (repeated, repeated_work) = run_with_meter(64, None);
    assert!(repeated.is_ok());
    assert!(repeated_work > one_work);
    let (stopped, _) = run_with_meter(64, Some(repeated_work.saturating_sub(1)));
    assert_eq!(stopped.unwrap_err().code, "REFERENCE_LINKS_WORK_STOP");
}
