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


// SOURCE ONLY, UNCOMPILED/UNEXECUTED: physical detach uses the actual helper.
fn storage_fixture()->Value {
    // Explicitly SYNTHETIC physical-storage control, not Engine lineage,
    // constructor admission, schema/Registry success or runtime qualification.
    // All finite owned data is ACTUALLY admitted BEFORE any sweep meter.
    let raw=Value::Object(vec![
        (Utf16::new(vec![0xd800]),Value::Array(vec![Value::Null,Value::Bool(false),
            Value::Number(1.25),Value::String(Utf16::new(vec![0xdc00,0,0xd800])),
            Value::Array(vec![]),Value::Object(vec![]),
            Value::Object(vec![(Utf16::from("unknown/ordered~"),Value::Array(vec![Value::Bool(true)]))])])),
        (Utf16::from("second"),Value::Number(-0.0)),
    ]);
    umf_core::copy_json(&raw,&mut Context::catalog()).unwrap()
}
#[test]
fn paid_storage_copy_is_not_current_limit_readmission_and_stops_at_each_denial() {
    let source=storage_fixture();
    let limits=umf_core::context::Limits{max_values:0,max_depth:0,max_text_units:0,..umf_core::context::Limits::ordinary()};
    let calls=std::cell::Cell::new(0usize);
    let mut meter=|_|{calls.set(calls.get()+1);Ok(())};
    let copied=copy_value_storage(&source,&mut Context::with_limits(umf_core::context::ResourceProfile::Cooperative,limits).unwrap().with_meter(&mut meter)).unwrap();
    assert_eq!(copied,source);
    assert!(umf_core::copy_json(&source,&mut Context::with_limits(umf_core::context::ResourceProfile::Cooperative,limits).unwrap()).is_err(),"new-input boundary still refuses");
    for deny in 0..calls.get(){
        let at=std::cell::Cell::new(0usize);let mut stop=|_|{
            let n=at.replace(at.get()+1);
            if n==deny{Err(EngineError::new("HOST_STORAGE_STOP",Utf16::from("host"),"original"))}else{Ok(())}
        };
        let err=copy_value_storage(&source,&mut Context::catalog().with_meter(&mut stop)).unwrap_err();
        assert_eq!(err.code,"HOST_STORAGE_STOP");assert_eq!(err.path,Utf16::from("host"));
        assert_eq!(source,storage_fixture());assert_eq!(at.get(),deny+1,"cleanup cannot reenter host");
    }
    let mut cancel=||true;
    assert_eq!(copy_value_storage(&source,&mut Context::catalog().with_cancellation(&mut cancel)).unwrap_err().code,"CANCELLED");
    let mut clock=||Some(10u64);
    assert_eq!(copy_value_storage(&source,&mut Context::catalog().with_clock(&mut clock,0)).unwrap_err().code,"DEADLINE");
}
#[test]
fn snapshot_insert_unique_shared_denial_and_public_deep_clone_are_isolated() {
    let mut resources=construct(false,&mut Context::catalog()).unwrap();
    // Getter's actual static return type stays SchemaResources; clone is deep.
    let mut public:SchemaResources=resources.schema_resources().clone();
    let original=resources.schema_resources().clone();
    public.entries.clear();assert_eq!(resources.schema_resources(),&original);
    let old=resources.clone();
    assert!(std::sync::Arc::ptr_eq(&old.schema_resources,&resources.schema_resources));
    let row=(Utf16::from("storage-row"),storage_fixture());
    resources.insert_snapshot_row(row.clone(),&mut Context::catalog()).unwrap();
    assert_eq!(old.schema_resources(),&original);
    assert!(!std::sync::Arc::ptr_eq(&old.schema_resources,&resources.schema_resources));
    assert_eq!(resources.schema_resources().entries.last(),Some(&row));
    let unique_address=std::sync::Arc::as_ptr(&resources.schema_resources);
    resources.insert_snapshot_row((Utf16::from("unique-row"),Value::Null),&mut Context::catalog()).unwrap();
    assert_eq!(std::sync::Arc::as_ptr(&resources.schema_resources),unique_address);
    // Full ACTUAL four-root snapshot still gets a real success trace and a
    // final-publication refusal, but never a quadratic every-prefix campaign.
    assert_eq!(&resources.schema_resources().entries[..original.entries.len()],original.entries.as_slice());
    fn host_stop()->EngineError{EngineError::new("HOST_DETACH_STOP",Utf16::new(vec![47,0xd800]),"original detach refusal")}
    fn check_host(error:&EngineError){
        let expected=host_stop();
        assert_eq!(error.code,expected.code);assert_eq!(error.path,expected.path);
        assert_eq!(error.message,expected.message);
        assert_eq!(error.python_message_origin,expected.python_message_origin);
        assert!(error.is_control_failure());
    }
    let full_trace=RefCell::new(Vec::new());let mut meter=|n|{full_trace.borrow_mut().push(n);Ok(())};
    let mut success=old.clone();success.insert_snapshot_row(row.clone(),&mut Context::catalog().with_meter(&mut meter)).unwrap();
    assert_eq!(&success.schema_resources().entries[..original.entries.len()],original.entries.as_slice());
    assert_eq!(success.schema_resources().entries.last(),Some(&row));
    let full_trace=full_trace.into_inner();
    let publication_index=full_trace.len().checked_sub(1).expect("actual full detach trace");
    let publication_amount=*full_trace.last().unwrap();
    assert_eq!(publication_amount,3*storage_words::<SchemaResources>()+4*storage_words::<std::sync::Arc<SchemaResources>>()+12);
    let mut attempt=old.clone();let at=std::cell::Cell::new(0usize);
    let mut stop=|n|{let index=at.replace(at.get()+1);if index==publication_index{assert_eq!(n,publication_amount);Err(host_stop())}else{Ok(())}};
    check_host(&attempt.insert_snapshot_row(row.clone(),&mut Context::catalog().with_meter(&mut stop)).unwrap_err());
    assert!(std::sync::Arc::ptr_eq(&attempt.schema_resources,&old.schema_resources));
    assert_eq!(attempt.schema_resources(),&original);
    assert_eq!(old.schema_resources(),&original);
    assert_eq!(at.get(),publication_index+1,"no callback after terminal publication denial");

    // Tiny SYNTHETIC private storage owner. The entire finite Value (including
    // row keys) passes real copy_json before it becomes the fixture. It is NOT
    // a constructor receipt and never enters schema/Engine qualification.
    let raw_rows=Value::Object(vec![(Utf16::from("tiny-storage"),storage_fixture()),(Utf16::from("scalar"),Value::Null)]);
    let admitted=umf_core::copy_json(&raw_rows,&mut Context::catalog()).unwrap();
    let Value::Object(entries)=admitted else{panic!("admitted tiny rows");};
    let tiny_owner=std::sync::Arc::new(SchemaResources{entries});
    let tiny_rows=tiny_owner.as_ref().clone();
    // Only the private snapshot field is used by this actual insertion helper.
    // Reuse one shell so denial prefixes do not repeatedly clone whole Core.
    let mut tiny=old.clone();tiny.schema_resources=std::sync::Arc::clone(&tiny_owner);
    let tiny_row=(Utf16::from("new-tiny-row"),umf_core::copy_json(&Value::Bool(true),&mut Context::catalog()).unwrap());
    let calls=std::cell::Cell::new(0usize);let mut count=|_|{calls.set(calls.get()+1);Ok(())};
    tiny.insert_snapshot_row(tiny_row.clone(),&mut Context::catalog().with_meter(&mut count)).unwrap();
    assert_eq!(&tiny.schema_resources().entries[..tiny_rows.entries.len()],tiny_rows.entries.as_slice());
    assert_eq!(tiny.schema_resources().entries.last(),Some(&tiny_row));
    assert_eq!(tiny_owner.as_ref(),&tiny_rows);
    assert!(calls.get()<full_trace.len(),"exhaustive fixture is small, not full Core");
    for deny in 0..calls.get(){
        tiny.schema_resources=std::sync::Arc::clone(&tiny_owner);
        let at=std::cell::Cell::new(0usize);let mut stop=|_|{let index=at.replace(at.get()+1);if index==deny{Err(host_stop())}else{Ok(())}};
        check_host(&tiny.insert_snapshot_row(tiny_row.clone(),&mut Context::catalog().with_meter(&mut stop)).unwrap_err());
        assert!(std::sync::Arc::ptr_eq(&tiny.schema_resources,&tiny_owner));
        assert_eq!(tiny.schema_resources(),&tiny_rows);assert_eq!(tiny_owner.as_ref(),&tiny_rows);
        assert_eq!(at.get(),deny+1,"no terminal callback replay");
    }
    // UNIQUE fixture controls retain only a raw pointer + deep rows, NOT a
    // second Arc owner which would accidentally select the shared-copy route.
    tiny.schema_resources=std::sync::Arc::new(tiny_rows.clone());
    let unique_trace=RefCell::new(Vec::new());let mut count=|n|{unique_trace.borrow_mut().push(n);Ok(())};
    let unique_pointer=std::sync::Arc::as_ptr(&tiny.schema_resources);
    tiny.insert_snapshot_row(tiny_row.clone(),&mut Context::catalog().with_meter(&mut count)).unwrap();
    assert_eq!(std::sync::Arc::as_ptr(&tiny.schema_resources),unique_pointer);
    assert_eq!(&tiny.schema_resources().entries[..tiny_rows.entries.len()],tiny_rows.entries.as_slice());
    assert_eq!(tiny.schema_resources().entries.last(),Some(&tiny_row));
    let unique_last=unique_trace.into_inner().len().checked_sub(1).unwrap();
    for deny in [0,unique_last]{
        tiny.schema_resources=std::sync::Arc::new(tiny_rows.clone());
        let pointer=std::sync::Arc::as_ptr(&tiny.schema_resources);
        assert_eq!(std::sync::Arc::strong_count(&tiny.schema_resources),1);
        let at=std::cell::Cell::new(0usize);let mut stop=|_|{let index=at.replace(at.get()+1);if index==deny{Err(host_stop())}else{Ok(())}};
        check_host(&tiny.insert_snapshot_row(tiny_row.clone(),&mut Context::catalog().with_meter(&mut stop)).unwrap_err());
        assert_eq!(std::sync::Arc::as_ptr(&tiny.schema_resources),pointer);
        assert_eq!(tiny.schema_resources(),&tiny_rows);assert_eq!(at.get(),deny+1);
    }

}

#[test]
fn saga_two_insertions_are_isolated_and_old_core_limits_still_refuse_in_compiler() {
    let original=construct(false,&mut Context::catalog()).unwrap();
    let package=json(include_str!("../../../spec/extensions/saga/package.json"));
    let schema=member(&package,"schema").unwrap().clone();
    let before=original.schema_resources().clone();
    let installed=original.clone().with_sagas(package.clone(),schema.clone(),&mut Context::catalog()).unwrap();
    assert_eq!(original.schema_resources(),&before);
    assert_eq!(installed.schema_resources().entries.len(),before.entries.len()+2);
    let added=&installed.schema_resources().entries[before.entries.len()..];
    assert_eq!(&added[0].1,&original.actions_schema);
    assert_eq!(&added[1].1,&schema);
    let limits=umf_core::context::Limits{max_values:1000,..umf_core::context::Limits::catalog()};
    let limited=||Context::with_limits(umf_core::context::ResourceProfile::Cooperative,limits).unwrap();
    // Expected ORIGINAL later semantic boundary on the original materialized
    // rows plus both original new copies. Storage ownership grants no admission.
    let expected=CompiledSchema::compile(&schema,installed.schema_resources(),&mut limited()).err().unwrap();
    let actual=original.clone().with_sagas(package,schema,&mut limited()).err().unwrap();
    assert_eq!(actual,expected);
    assert_eq!(original.schema_resources(),&before);
}
