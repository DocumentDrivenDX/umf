// SPDX-License-Identifier: MIT OR Apache-2.0
//! OC1 group05: actual Codegen constructor. SOURCE ONLY / NATIVE UNEXECUTED.
//! Core dependency cfg(test) is NOT assumed; only this crate's actual observer.
use super::*;
use std::cell::RefCell;
use std::rc::Rc;

fn json(s: &str) -> Value {
    umf_core::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn core_values() -> [Value; 5] {
    [
        json(include_str!("../../../spec/core/schema.json")),
        json(include_str!(
            "../../../spec/core/semantic-type-reference.schema.json"
        )),
        json(include_str!(
            "../../../spec/core/extension-package.schema.json"
        )),
        json(include_str!(
            "../../../spec/metamodel/generated/core-constraints.json"
        )),
        json(include_str!(
            "../../../spec/metamodel/generated/domain-policy.json"
        )),
    ]
}
fn packages() -> [Value; 4] {
    [
        json(include_str!("../../../spec/extensions/tables/package.json")),
        json(include_str!(
            "../../../spec/extensions/actions/package.json"
        )),
        json(include_str!(
            "../../../spec/extensions/binding/package.json"
        )),
        json(include_str!(
            "../../../spec/extensions/binding-stable/package.json"
        )),
    ]
}
fn construct(invalid_scope: bool, ctx: &mut Context<'_>) -> Result<CodegenResources, EngineError> {
    let [a, b, c, d, e] = core_values();
    let [tables, actions, mut binding, stable] = packages();
    if invalid_scope {
        let Value::Object(m) = &mut binding else {
            panic!("actual package");
        };
        m.iter_mut()
            .find(|(k, _)| k == &Utf16::from("scopes"))
            .unwrap()
            .1 = Value::Array(vec![Value::Number(7.0)]);
    }
    let table_schema = member(&tables, "schema").unwrap().clone();
    let action_schema = member(&actions, "schema").unwrap().clone();
    CodegenResources::new(
        ResourceSet::new(a, b, c, d, e),
        tables,
        table_schema,
        actions,
        action_schema,
        binding,
        stable,
        ctx,
    )
}
#[derive(Clone)]
struct Call {
    event: &'static str,
    root: Value,
    handle: Option<usize>,
}
fn observed<T>(f: impl FnOnce() -> T) -> (T, Vec<Call>) {
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let result = observe_codegen_compilations(
        Box::new(move |event, root, handoff| {
            sink.borrow_mut().push(Call {
                event,
                root: root.clone(),
                // Readback of the actual argument only; never input authority.
                handle: handoff.map(|h| h as *const umf_core::schema::CodegenCatalogue as usize),
            });
        }),
        f,
    );
    let copy = rows.borrow().clone();
    (result, copy)
}
fn expected_roots() -> Vec<Value> {
    let [tables, actions, binding, stable] = packages();
    let action_schema = member(&actions, "schema").unwrap();
    let defs = member(action_schema, "$defs").unwrap();
    let literal = member(defs, "literal").unwrap().clone();
    let literal_wrapper = Value::Object(vec![
        (
            Utf16::from("$defs"),
            Value::Object(vec![(Utf16::from("literal"), literal)]),
        ),
        (
            Utf16::from("$ref"),
            Value::String(Utf16::from("#/$defs/literal")),
        ),
    ]);
    let action_wrapper = Value::Object(vec![
        (Utf16::from("$defs"), defs.clone()),
        (
            Utf16::from("$ref"),
            Value::String(Utf16::from("#/$defs/action")),
        ),
    ]);
    vec![
        umf_core::serialization::read_json_value(
            operation_sources::OPERATION_SCHEMA_UTF16,
            umf_core::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap(),
        umf_core::serialization::read_json_value(
            operation_sources::ROW_EXPRESSION_OPERATION_SCHEMA_UTF16,
            umf_core::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap(),
        member(&binding, "schema").unwrap().clone(),
        member(&stable, "schema").unwrap().clone(),
        member(&tables, "schema").unwrap().clone(),
        action_schema.clone(),
        literal_wrapper,
        action_wrapper,
    ]
}
fn registrations(
    r: &Registry,
) -> Vec<(Utf16, Utf16, Option<u64>, Vec<String>, bool, Value, Value)> {
    r.entries()
        .iter()
        .map(|e| {
            (
                e.id().clone(),
                e.version().clone(),
                e.token(),
                e.scopes().to_vec(),
                e.semantic(),
                e.manifest().clone(),
                e.schema().schema_value().clone(),
            )
        })
        .collect()
}

#[test]
fn oc05_actual_eight_compilers_and_fresh_registry_consumption() {
    let (actual, rows) =
        observed(|| Context::catalog().with_codegen_construction(|ctx| construct(false, ctx)));
    let actual = actual.unwrap();
    let expected = expected_roots();
    let enters: Vec<_> = rows
        .iter()
        .filter(|r| r.event == "oc1-codegen-compile-enter")
        .collect();
    let successes: Vec<_> = rows
        .iter()
        .filter(|r| r.event == "oc1-codegen-compile-success")
        .collect();
    assert_eq!(rows.len(), 16);
    assert_eq!(enters.len(), 8);
    assert_eq!(successes.len(), 8);
    let handle = enters[0]
        .handle
        .expect("genuine completed Engine handoff in same construction scope");
    for (i, pair) in rows.chunks_exact(2).enumerate() {
        assert_eq!(pair[0].event, "oc1-codegen-compile-enter");
        assert_eq!(pair[1].event, "oc1-codegen-compile-success");
        assert_eq!(pair[0].root, expected[i]);
        assert_eq!(pair[1].root, expected[i]);
        assert_eq!(pair[0].handle, Some(handle));
        assert_eq!(pair[1].handle, Some(handle));
    }
    // Independent original ordinary constructor, not helper invocations passed
    // off as eight real callers. All helper roots still must match exactly.
    let (original, raw_rows) = observed(|| construct(false, &mut Context::catalog()));
    let original = original.unwrap();
    assert_eq!(raw_rows.len(), 16);
    assert!(raw_rows.iter().all(|r| r.handle.is_none()));
    for (i, pair) in raw_rows.chunks_exact(2).enumerate() {
        assert_eq!(pair[0].root, expected[i]);
        assert_eq!(pair[1].root, expected[i]);
    }
    assert_eq!(actual.schema_resources(), original.schema_resources());
    let core = core_values();
    let mut export = Vec::new();
    for schema in &core[..3] {
        let Value::String(id) = member(schema, "$id").unwrap() else {
            panic!("real source ID");
        };
        export.push((id.clone(), schema.clone()));
    }
    let packages = packages();
    let table_schema = member(&packages[0], "schema").unwrap();
    let Value::String(id) = member(table_schema, "$id").unwrap() else {
        panic!("table ID");
    };
    if !export.iter().any(|(k, _)| k == id) {
        export.push((id.clone(), table_schema.clone()));
    }
    assert_eq!(
        actual.schema_resources().entries,
        export,
        "retained materialized public export/order/table copy"
    );
    for (a, b, count) in [
        (actual.tables_registry(), original.tables_registry(), 1),
        (actual.actions_registry(), original.actions_registry(), 1),
        (actual.binding_registry(), original.binding_registry(), 2),
    ] {
        assert_eq!(a.entries().len(), count);
        assert_eq!(registrations(a), registrations(b));
    }
    let tokens: Vec<_> = actual
        .tables_registry()
        .entries()
        .iter()
        .chain(actual.actions_registry().entries())
        .chain(actual.binding_registry().entries())
        .map(|r| r.token())
        .collect();
    assert_eq!(tokens, vec![Some(1), Some(2), Some(3), Some(4)]);
    let new_compilers = [
        actual.operation_compiled(),
        actual.row_expression_operation_compiled(),
        actual.binding_compiled(),
        actual.stable_binding_compiled(),
        actual.tables_compiled(),
        actual.actions_compiled(),
        actual.actions_literal_compiled(),
        actual.actions_action_compiled(),
    ];
    let old_compilers = [
        original.operation_compiled(),
        original.row_expression_operation_compiled(),
        original.binding_compiled(),
        original.stable_binding_compiled(),
        original.tables_compiled(),
        original.actions_compiled(),
        original.actions_literal_compiled(),
        original.actions_action_compiled(),
    ];
    for (compiled, old) in new_compilers.into_iter().zip(old_compilers) {
        assert_eq!(compiled.schema_value(), old.schema_value());
        for sample in [Value::Null, Value::Bool(false)] {
            assert_eq!(
                compiled.validate(&sample, &mut Context::catalog()),
                old.validate(&sample, &mut Context::catalog())
            );
        }
    }
    // CoreJSON-valid hostile scopes reach fresh registration AFTER eight roots.
    // Never paste invalid values into an already completed handoff.
    let (bad, rows) =
        observed(|| Context::catalog().with_codegen_construction(|ctx| construct(true, ctx)));
    let old = construct(true, &mut Context::catalog()).err().unwrap();
    assert_eq!(bad.err().unwrap(), old);
    assert_eq!(old.code, "CODEGEN_RESOURCE_INVALID");
    assert_eq!(
        rows.iter()
            .filter(|r| r.event == "oc1-codegen-compile-success")
            .count(),
        8
    );
}
