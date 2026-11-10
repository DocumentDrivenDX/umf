// SPDX-License-Identifier: MIT OR Apache-2.0
//! PRE1 independent SOURCE controls. UNCOMPILED / NATIVE UNEXECUTED.
//! Actual compiler/preflight callers, original resolver and genuine owner cursors.
//! Addresses below are OUTPUT readback only, never passed as acceptance authority.
use super::super::preflight_reference_observation::with_observer;
use super::*;
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

const ROOT: &str = "https://pre1.test/root";
const SOURCE: &str = r##"{"$id":"https://pre1.test/root","$defs":{"a/b~☃":{"type":"string"}},"properties":{"left":{"$ref":"#/$defs/a~1b~0☃"},"right":{"$ref":"#/$defs/a~1b~0☃"}}}"##;
#[derive(Clone, Debug)]
struct Readback {
    reference_address: usize,
    reference: Value,
    path: Utf16,
    scope: String,
    result: Result<(usize, Value, Utf16), EngineError>,
}
fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn observed<T>(operation: impl FnOnce() -> T) -> (T, Vec<Readback>) {
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let result = with_observer(
        Box::new(move |reference, path, scope, result| {
            sink.borrow_mut().push(Readback {
                reference_address: reference as *const Value as usize,
                reference: reference.clone(),
                path: path.clone(),
                scope: scope.to_owned(),
                result: result
                    .as_ref()
                    .map(|(node, path)| {
                        (
                            *node as *const Value as usize,
                            (**node).clone(),
                            path.clone(),
                        )
                    })
                    .map_err(|error| (*error).clone()),
            });
        }),
        operation,
    );
    let copy = rows.borrow().clone();
    (result, copy)
}
fn compile(s: &str, resources: &SchemaResources) -> CompiledSchema {
    Context::catalog()
        .with_codegen_construction(|ctx| CompiledSchema::compile(&json(s), resources, ctx))
        .unwrap()
}
fn owner() -> CompiledSchema {
    let o = compile(SOURCE, &SchemaResources::default());
    assert!(o.owner_plans.is_some() && o.owner_locations.is_some());
    o
}
fn plans(o: &CompiledSchema) -> &OwnerPlans {
    o.owner_plans.as_ref().unwrap()
}
fn locate<'a>(o: &'a CompiledSchema, role: usize, keys: &[&str]) -> (OwnerCursor, &'a Value) {
    let mut ctx = Context::catalog();
    let table = o.owner_locations.as_ref().unwrap();
    let mut cursor = o.location_root(role, true, &mut ctx).unwrap().unwrap();
    for key in keys {
        let Value::Object(m) = table.read(o, &cursor, &mut ctx).unwrap().unwrap() else {
            panic!("authored object cursor");
        };
        let index = m.iter().position(|(k, _)| k == &Utf16::from(*key)).unwrap();
        cursor = table.child(o, &cursor, index, &mut ctx).unwrap().unwrap();
    }
    let v = cursor.get(o, &mut ctx).unwrap();
    (cursor, v)
}
fn preflight(o: &CompiledSchema, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let path = schema_origin_path(&*o.schema);
    let scope = schema_id(&*o.schema).unwrap_or_default();
    let cursor = o.location_root(0, true, ctx)?;
    o.preflight_located(
        &*o.schema,
        &path,
        &scope,
        0,
        o.root_keyword_policy,
        ctx,
        &mut BTreeSet::new(),
        cursor,
    )
}
#[derive(Clone)]
struct Memos {
    references: Vec<((Utf16, Utf16, Option<String>), Arc<ReferencePlan>)>,
    evaluations: Vec<((Utf16, Utf16), Arc<ReferencePlan>)>,
    frames: Vec<((Utf16, bool), Arc<ReferencePlan>)>,
}
fn memos(o: &CompiledSchema) -> Memos {
    let p = plans(o);
    Memos {
        references: p
            .references
            .lock()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        evaluations: p
            .evaluations
            .lock()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        frames: p
            .frames
            .lock()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    }
}
fn same<K: PartialEq + std::fmt::Debug>(
    a: &[(K, Arc<ReferencePlan>)],
    b: &[(K, Arc<ReferencePlan>)],
) {
    assert_eq!(a.len(), b.len());
    for ((ka, va), (kb, vb)) in a.iter().zip(b) {
        assert_eq!(ka, kb);
        assert!(Arc::ptr_eq(va, vb));
    }
}
fn unchanged(o: &CompiledSchema, before: &Memos) {
    let after = memos(o);
    same(&before.references, &after.references);
    same(&before.evaluations, &after.evaluations);
    same(&before.frames, &after.frames);
}
fn parity(
    o: &CompiledSchema,
    row: &Readback,
    actual_reference: &Value,
    expected_node: &Value,
    expected_path: &str,
) {
    assert_eq!(
        row.reference_address,
        actual_reference as *const Value as usize
    );
    assert_eq!(&row.reference, actual_reference);
    let original = o
        .resolve_ref_unplanned(
            actual_reference,
            &row.path,
            Some(&row.scope),
            &mut Context::catalog(),
        )
        .unwrap();
    assert!(std::ptr::eq(original.0, expected_node));
    assert_eq!(original.1, Utf16::from(expected_path));
    let (address, node, path) = row.result.as_ref().expect("real original caller resolved");
    assert_eq!(*address, expected_node as *const Value as usize);
    assert_eq!(node, expected_node);
    assert_eq!(path, &original.1);
}

#[test]
fn pre01_real_preflight_records_genuine_reference_target_location_and_full_origin() {
    let o = owner();
    assert!(memos(&o).references.is_empty());
    assert!(
        plans(&o).binding.lock().unwrap().is_none(),
        "fresh PRE1 owner binding is genuinely deferred"
    );
    assert!(plans(&o).nodes.lock().unwrap().is_empty());
    let before = memos(&o);
    let (_, root) = locate(&o, 0, &[]);
    assert!(std::ptr::eq(root, &*o.schema));
    let (_, target) = locate(&o, 0, &["$defs", "a/b~☃"]);
    assert_eq!(target, &json(r#"{"type":"string"}"#));
    let (_, left) = locate(&o, 0, &["properties", "left", "$ref"]);
    let (_, right) = locate(&o, 0, &["properties", "right", "$ref"]);
    let mut ctx = Context::catalog();
    let start = ctx.charged_work();
    let (result, rows) = observed(|| preflight(&o, &mut ctx));
    result.unwrap();
    assert_eq!(rows.len(), 2);
    for (row, key, r) in [(&rows[0], "left", left), (&rows[1], "right", right)] {
        assert_eq!(
            row.path,
            Utf16::from(format!("{ROOT}#/properties/{key}/$ref").as_str())
        );
        assert_eq!(row.scope, ROOT);
        parity(&o, row, r, target, "https://pre1.test/root#/$defs/a~1b~0☃");
    }
    unchanged(&o, &before);
    assert!(
        plans(&o).binding.lock().unwrap().is_none(),
        "preflight is not runtime memo initialization"
    );
    assert!(
        plans(&o).nodes.lock().unwrap().is_empty(),
        "resolver readback mints no NodePlan"
    );
    assert!(ctx.charged_work() > start);
}

#[test]
fn pre02_effective_local_ids_and_relative_scope_do_not_collapse_equal_reference_text() {
    let resources = SchemaResources {
        entries: vec![
            (
                Utf16::from("https://pre1.test/a/child"),
                json(r#"{"$id":"https://pre1.test/a/child","type":"string"}"#),
            ),
            (
                Utf16::from("https://pre1.test/b/child"),
                json(r#"{"$id":"https://pre1.test/b/child","type":"boolean"}"#),
            ),
        ],
    };
    let source = r#"{"$id":"https://pre1.test/start","$defs":{"a":{"$id":"https://pre1.test/a/root","$ref":"child"},"b":{"$id":"https://pre1.test/b/root","$ref":"child"}}}"#;
    let o = compile(source, &resources);
    let before = memos(&o);
    let (result, rows) = observed(|| preflight(&o, &mut Context::catalog()));
    result.unwrap();
    assert_eq!(rows.len(), 2);
    for (row, branch) in rows.iter().zip(["a", "b"]) {
        let expected_scope = format!("https://pre1.test/{branch}/root");
        assert_eq!(row.scope, expected_scope);
        // Original diagnostic child follows source traversal; effective scope
        // follows nested $id. PRE1 must preserve BOTH, not conflate the two.
        assert_eq!(
            row.path,
            Utf16::from(format!("https://pre1.test/start#/$defs/{branch}/$ref").as_str())
        );
        let expected_id = format!("https://pre1.test/{branch}/child");
        let role = o
            .catalogue_entries()
            .iter()
            .position(|(id, _)| id == &Utf16::from(expected_id.as_str()))
            .unwrap()
            + 1;
        let (_, target) = locate(&o, role, &[]);
        let (_, reference) = locate(&o, 0, &["$defs", branch, "$ref"]);
        parity(&o, row, reference, target, &format!("{expected_id}#"));
    }
    assert_ne!(
        rows[0].result.as_ref().unwrap().1,
        rows[1].result.as_ref().unwrap().1
    );
    unchanged(&o, &before);
}

#[test]
fn pre03_supported_dynamic_and_recursive_preflight_keeps_original_root_identity() {
    for source in [
        r##"{"$id":"https://pre1.test/dynamic","$dynamicAnchor":"node","$dynamicRef":"#node"}"##,
        r##"{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"https://pre1.test/recursive","$recursiveAnchor":true,"$recursiveRef":"#"}"##,
    ] {
        let o = compile(source, &SchemaResources::default());
        let before = memos(&o);
        let (result, rows) = observed(|| preflight(&o, &mut Context::catalog()));
        result.unwrap();
        assert_eq!(rows.len(), 1);
        let keyword = if get(&*o.schema, "$dynamicRef").is_some() {
            "$dynamicRef"
        } else {
            "$recursiveRef"
        };
        let reference = get(&*o.schema, keyword).unwrap();
        let id = schema_id(&*o.schema).unwrap();
        parity(&o, &rows[0], reference, &*o.schema, &format!("{id}#"));
        unchanged(&o, &before);
    }
    // Actual dynamic runtime branch remains separate from preflight resolution.
    let base = json(
        r##"{"$id":"https://pre1.test/base","$dynamicAnchor":"node","type":"object","properties":{"next":{"$dynamicRef":"#node"}}}"##,
    );
    let resources = SchemaResources {
        entries: vec![(Utf16::from("https://pre1.test/base"), base)],
    };
    let o = compile(
        r#"{"$id":"https://pre1.test/outer","$dynamicAnchor":"node","$ref":"https://pre1.test/base","required":["tag"],"properties":{"tag":{"type":"string"}}}"#,
        &resources,
    );
    let plain = o.clone();
    for (s, valid) in [
        (r#"{"tag":"outer","next":{"tag":"inner"}}"#, true),
        (r#"{"tag":"outer","next":{}}"#, false),
    ] {
        let value = json(s);
        let expected = plain.validate(&value, &mut Context::catalog()).unwrap();
        let actual = o.validate(&value, &mut Context::catalog()).unwrap();
        assert_eq!(actual, expected);
        assert_eq!(actual.is_empty(), valid);
    }
}

#[test]
fn pre04_actual_compiler_first_refusal_and_nonstring_check_keep_original_order() {
    let source = r#"{"$id":"https://pre1.test/root","allOf":[{"$ref":"urn:pre1:missing-first"},{"$ref":true}]}"#;
    let (result, rows) = observed(|| {
        Context::catalog().with_codegen_construction(|ctx| {
            CompiledSchema::compile(&json(source), &SchemaResources::default(), ctx)
        })
    });
    let error = result.err().expect("real compiler refuses");
    assert_eq!(error.code, "SCHEMA_REF_UNRESOLVED");
    assert_eq!(
        error.path,
        Utf16::from("https://pre1.test/root#/allOf/0/$ref")
    );
    assert_eq!(
        error.message,
        Utf16::from("Schema reference is not in the supplied resource set")
    );
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].result.as_ref().err().unwrap(), &error);
    let o = owner();
    let original = o
        .resolve_ref_unplanned(
            &Value::string_utf8("urn:pre1:missing-first"),
            &error.path,
            Some(ROOT),
            &mut Context::catalog(),
        )
        .err()
        .unwrap();
    assert_eq!(error, original);
    let (result, rows) = observed(|| {
        Context::catalog().with_codegen_construction(|ctx| {
            CompiledSchema::compile(
                &json(r#"{"$id":"https://pre1.test/root","$ref":true}"#),
                &SchemaResources::default(),
                ctx,
            )
        })
    });
    let error = result.err().unwrap();
    assert_eq!(error.code, "SCHEMA_INVALID");
    assert_eq!(error.path, Utf16::from("https://pre1.test/root#/$ref"));
    assert_eq!(
        error.message,
        Utf16::from("reference keyword must be a string")
    );
    assert!(
        rows.is_empty(),
        "nonstring rejection precedes resolver caller event"
    );
}

#[test]
fn pre05_runtime_reference_evaluation_and_frame_caches_still_reuse_complete_context_keys() {
    let o = owner();
    let (_, reference) = locate(&o, 0, &["properties", "left", "$ref"]);
    let (_, target) = locate(&o, 0, &["$defs", "a/b~☃"]);
    assert!(memos(&o).references.is_empty());
    for (path, scope) in [
        ("https://pre1.test/root#/one", Some(ROOT)),
        ("https://pre1.test/root#/two", Some(ROOT)),
        ("https://pre1.test/root#/one", None),
        ("https://pre1.test/root#/one", Some("")),
    ] {
        let path = Utf16::from(path);
        let value = o
            .resolve_ref_scoped(reference, &path, scope, &mut Context::catalog())
            .unwrap();
        assert!(std::ptr::eq(value.0, target));
        let Value::String(text) = reference else {
            panic!("actual reference string");
        };
        let key = (path.clone(), text.clone(), scope.map(str::to_owned));
        let first = plans(&o)
            .references
            .lock()
            .unwrap()
            .get(&key)
            .unwrap()
            .clone();
        let again = o
            .resolve_ref_scoped(reference, &path, scope, &mut Context::catalog())
            .unwrap();
        assert!(std::ptr::eq(again.0, target));
        assert!(Arc::ptr_eq(
            &first,
            plans(&o).references.lock().unwrap().get(&key).unwrap()
        ));
    }
    assert_eq!(plans(&o).references.lock().unwrap().len(), 4);
    {
        let binding = plans(&o).binding.lock().unwrap();
        let binding = binding
            .as_ref()
            .expect("first actual runtime access binds owner");
        assert!(Arc::ptr_eq(
            &binding.lineage,
            o.owner_lineage.as_ref().unwrap()
        ));
        assert_eq!(binding.dialect, o.dialect);
        assert_eq!(binding.strict, o.strict);
        assert_eq!(binding.policy, o.root_keyword_policy);
        assert_eq!(binding.resolved, o.resolve_references_at_compile);
    }
    // Production resolve_ref uses None. A private Some("") remains a DISTINCT
    // complete Option<String> key even though this fixture resolves same node.
    let path = Utf16::from("https://pre1.test/root#/one");
    let Value::String(text) = reference else {
        panic!("actual reference");
    };
    let none_key = (path.clone(), text.clone(), None);
    let empty_key = (path.clone(), text.clone(), Some(String::new()));
    let none_plan = plans(&o)
        .references
        .lock()
        .unwrap()
        .get(&none_key)
        .unwrap()
        .clone();
    let empty_plan = plans(&o)
        .references
        .lock()
        .unwrap()
        .get(&empty_key)
        .unwrap()
        .clone();
    assert!(!Arc::ptr_eq(&none_plan, &empty_plan));
    let actual = o
        .resolve_ref(reference, &path, &mut Context::catalog())
        .unwrap();
    assert!(std::ptr::eq(actual.0, target));
    assert!(Arc::ptr_eq(
        &none_plan,
        plans(&o).references.lock().unwrap().get(&none_key).unwrap()
    ));
    let path = Utf16::from("https://pre1.test/root#/eval");
    let expected = o
        .resolve_eval_ref_unplanned(reference, &path, &mut Context::catalog())
        .unwrap();
    let actual = o
        .resolve_eval_ref(reference, &path, &mut Context::catalog())
        .unwrap();
    assert_eq!(actual, expected);
    let evals = memos(&o).evaluations;
    assert!(!evals.is_empty());
    o.resolve_eval_ref(reference, &path, &mut Context::catalog())
        .unwrap();
    same(&evals, &memos(&o).evaluations);
    let (cursor, root) = locate(&o, 0, &[]);
    let base = Utf16::from("https://pre1.test/root#");
    let expected = o
        .effective_frame_unplanned(root, &base, false, &mut Context::catalog())
        .unwrap();
    let actual = plans(&o)
        .frame_at(
            &o,
            root,
            &base,
            false,
            Some(&cursor),
            &mut Context::catalog(),
        )
        .unwrap();
    assert_eq!(actual, expected);
    let frames = memos(&o).frames;
    assert!(!frames.is_empty());
    plans(&o)
        .frame_at(
            &o,
            root,
            &base,
            false,
            Some(&cursor),
            &mut Context::catalog(),
        )
        .unwrap();
    same(&frames, &memos(&o).frames);
    let before = memos(&o);
    for _ in 0..2 {
        let (r, rows) = observed(|| preflight(&o, &mut Context::catalog()));
        r.unwrap();
        assert_eq!(rows.len(), 2);
        unchanged(&o, &before);
    }
}

#[test]
fn pre06_real_semantic_depth_and_owner_eligibility_guards_remain_unchanged() {
    let o = owner();
    // A PRE1 owner may still have an unbound plan bank. First VALID runtime
    // use is allowed to bind it, so establish the real owning lineage FIRST.
    let (_, own_reference) = locate(&o, 0, &["properties", "left", "$ref"]);
    let own_path = Utf16::from("https://pre1.test/root#/bind-own-owner");
    let own = o
        .resolve_ref(own_reference, &own_path, &mut Context::catalog())
        .unwrap();
    let (_, own_target) = locate(&o, 0, &["$defs", "a/b~☃"]);
    assert!(std::ptr::eq(own.0, own_target));
    let binding_before = {
        let binding = plans(&o).binding.lock().unwrap();
        let binding = binding
            .as_ref()
            .expect("genuine own lookup binds owning lineage");
        assert!(Arc::ptr_eq(
            &binding.lineage,
            o.owner_lineage.as_ref().unwrap()
        ));
        (
            Arc::clone(&binding.lineage),
            binding.dialect,
            binding.strict,
            binding.policy,
            binding.resolved,
        )
    };
    let before = memos(&o);
    let mut limits = Context::catalog().limits();
    limits.max_depth = 0;
    let mut ctx =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let (result, rows) = observed(|| {
        o.preflight_located(
            &*o.schema,
            &Utf16::from("https://pre1.test/root#"),
            ROOT,
            1,
            o.root_keyword_policy,
            &mut ctx,
            &mut BTreeSet::new(),
            None,
        )
    });
    let error = result.unwrap_err();
    assert_eq!(error.code, "LIMIT");
    assert_eq!(error.path, Utf16::from("https://pre1.test/root#"));
    assert_eq!(error.message, Utf16::from("Schema nesting depth exceeded"));
    assert!(rows.is_empty());
    unchanged(&o, &before);
    let foreign = owner();
    let (_, reference) = locate(&foreign, 0, &["properties", "left", "$ref"]);
    let path = Utf16::from("https://pre1.test/root#/foreign");
    let expected = foreign
        .resolve_ref_unplanned(reference, &path, Some(ROOT), &mut Context::catalog())
        .unwrap();
    let actual = plans(&o)
        .resolve(
            &foreign,
            reference,
            &path,
            Some(ROOT),
            &mut Context::catalog(),
        )
        .unwrap();
    assert_eq!(actual, expected);
    unchanged(&o, &before);
    {
        let binding = plans(&o).binding.lock().unwrap();
        let binding = binding.as_ref().unwrap();
        assert!(Arc::ptr_eq(&binding.lineage, &binding_before.0));
        assert_eq!(
            (
                binding.dialect,
                binding.strict,
                binding.policy,
                binding.resolved
            ),
            (
                binding_before.1,
                binding_before.2,
                binding_before.3,
                binding_before.4
            )
        );
    }
    // PRE1 returns only authoritative node/path, with tracked=false. An actual
    // node readback WITHOUT a current locator cannot enable NodePlan reuse.
    let (cursor, target) = locate(&o, 0, &["$defs", "a/b~☃"]);
    assert_eq!(target, &json(r#"{"type":"string"}"#));
    let diagnostic = Utf16::from("https://pre1.test/root#/$defs/a~1b~0☃");
    let mut standard = Context::catalog();
    let n = plans(&o).nodes.lock().unwrap().len();
    assert!(plans(&o)
        .node_at(&o, target, &diagnostic, true, None, &mut standard)
        .unwrap()
        .is_none());
    assert_eq!(plans(&o).nodes.lock().unwrap().len(), n);
    let normal = plans(&o)
        .node_at(&o, target, &diagnostic, true, Some(&cursor), &mut standard)
        .unwrap()
        .unwrap();
    assert_eq!(normal.limits, standard.limits());
    assert!(std::ptr::eq(
        normal.locator.get(&o, &mut standard).unwrap(),
        target
    ));
    let mut limits = Context::catalog().limits();
    limits.max_text_units -= 1;
    let mut limited =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let current = plans(&o)
        .node_at(&o, target, &diagnostic, true, Some(&cursor), &mut limited)
        .unwrap()
        .unwrap();
    assert_eq!(current.limits, limits);
    assert!(!Arc::ptr_eq(&normal, &current));
    assert!(std::ptr::eq(
        current.locator.get(&o, &mut limited).unwrap(),
        target
    ));
    let (foreign_cursor, _) = locate(&foreign, 0, &["$defs", "a/b~☃"]);
    assert!(plans(&o)
        .node_at(
            &o,
            target,
            &diagnostic,
            true,
            Some(&foreign_cursor),
            &mut limited
        )
        .unwrap()
        .is_none());
}

#[test]
fn pre07_existing_inactive_compile_resolution_gate_does_not_resolve_missing_reference() {
    let source = json(r#"{"$id":"https://pre1.test/inactive","$ref":"urn:pre1:absent"}"#);
    let (result, rows) = observed(|| {
        CompiledSchema::compile_inner(
            &source,
            &SchemaResources::default(),
            SchemaDialect::Draft2020_12,
            true,
            RegexProfile::Ecma262Unicode,
            false,
            false,
            false,
            true,
            KeywordPolicy::DRAFT2020,
            &mut Context::catalog(),
        )
    });
    let o = result.unwrap();
    assert!(!o.resolve_references_at_compile);
    assert!(rows.is_empty());
    assert!(
        o.owner_plans.is_none(),
        "normal inactive constructor eligibility, not mutated fields"
    );
    let (result, rows) = observed(|| preflight(&o, &mut Context::catalog()));
    result.unwrap();
    assert!(rows.is_empty());
    assert!(
        o.resolve_ref_unplanned(
            get(&*o.schema, "$ref").unwrap(),
            &Utf16::from("https://pre1.test/inactive#/$ref"),
            Some("https://pre1.test/inactive"),
            &mut Context::catalog()
        )
        .is_err(),
        "reference really absent, not a fake success fixture"
    );
}

#[test]
fn pre08_real_resolver_refusal_host_identity_and_scoped_observer_unwind_restore() {
    let o = Rc::new(owner());
    let before = memos(&o);
    let calls = Rc::new(Cell::new(0usize));
    let tally = calls.clone();
    let target = Rc::new(Cell::new(None));
    let edge = target.clone();
    let at_event = calls.clone();
    let mut counter = |_: usize| {
        tally.set(tally.get() + 1);
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut counter);
    with_observer(
        Box::new(move |_, _, _, result| {
            assert!(result.is_ok());
            if edge.get().is_none() {
                edge.set(Some(at_event.get()));
            }
        }),
        || preflight(&o, &mut ctx),
    )
    .unwrap();
    let target = target.get().expect("actual first completed resolver event");
    assert!(target > 0);
    let seen = Rc::new(RefCell::new(Vec::new()));
    let record = seen.clone();
    let count = Cell::new(0usize);
    let later = Cell::new(0usize);
    let denied = Cell::new(false);
    let original = {
        let mut e = EngineError::new(
            "PRE1_HOST",
            Utf16::new(vec![35, 47, 0xd800]),
            "first authoritative refusal",
        );
        e.python_message_origin = Some(crate::python_value::PyText::from_utf8("pre1-host-δ"));
        e
    };
    let mut host = |_: usize| {
        count.set(count.get() + 1);
        if denied.get() {
            later.set(later.get() + 1);
        }
        if count.get() == target {
            denied.set(true);
            Err(original.clone())
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_host_control(&mut host);
    let result = with_observer(
        Box::new(move |_, _, _, r| {
            if let Err(e) = r {
                record.borrow_mut().push(e.clone());
            }
        }),
        || preflight(&o, &mut ctx),
    );
    let error = result.err().expect("selected callback refuses");
    assert_eq!(error.code, original.code);
    assert_eq!(error.path, original.path);
    assert_eq!(error.message, original.message);
    assert_eq!(error.python_message_origin, original.python_message_origin);
    assert!(error.is_control_failure());
    assert_eq!(later.get(), 0);
    assert_eq!(count.get(), target);
    // Actual first caller event selected the ending resolver callback. The
    // refusal must be returned through that SAME caller, not a precheck only.
    assert_eq!(seen.borrow().as_slice(), &[error]);
    unchanged(&o, &before);
    let outer = Rc::new(Cell::new(0usize));
    let outer_sink = outer.clone();
    let nested = o.clone();
    with_observer(
        Box::new(move |_, _, _, _| outer_sink.set(outer_sink.get() + 1)),
        || {
            let panic = catch_unwind(AssertUnwindSafe(|| {
                with_observer(
                    Box::new(|_, _, _, _| panic!("PRE1 observer unwind")),
                    || preflight(&nested, &mut Context::catalog()),
                )
            }));
            assert!(panic.is_err());
            preflight(&o, &mut Context::catalog()).unwrap();
        },
    );
    assert_eq!(outer.get(), 2);
    unchanged(&o, &before);
}

#[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]
#[test]
fn counted_pointer_path_matches_original_target_and_utf16_with_paid_move() {
    let denied_amount = Cell::new(None);
    let refused = Cell::new(false);
    let mut host = |amount| {
        if denied_amount.get() == Some(amount) {
            refused.set(true);
            return Err(EngineError::new("COUNTED_HOST", Utf16::from("#/host"), "counted pointer refusal"));
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut host);
    crate::value::OwnedCoreOperation::with_context(&mut ctx, |ctx, operation| {
        let raw = crate::canonical_codegen_resources::materialize_counted_installed_codegen_resources(ctx, operation)?;
        let mut admitted = raw.admit_all(operation, ctx)?;
        ctx.with_codegen_construction(|ctx| {
            let mut prepared = admitted.prepare(ctx)?;
            let bank = prepared.core.admit_bank(ctx)?.bank;
            assert!(bank.is_counted_core());
            let owner = CompiledSchema::compile_input_bank_for::<true>(bank, 0, ctx)?;
            assert!(owner.cold_resource_index.is_some());
            let base = "urn:umf:core:0.10.0";
            let path = Utf16::from("#/$ref");
            assert!(!owner.counted_pointer_root(Some((&*owner.schema, 2)), ctx)?);
            for text in ["#/$defs/id", "#/%24defs/id", "#/$defs/scalarType/anyOf/0"] {
                let reference = Value::String(Utf16::from(text));
                let before = ctx.charged_work();
                let (old_node, old_path, _) = owner.resolve_ref_location_impl::<false>(&reference, &path, Some(base), false, ctx)?;
                let old_work = ctx.charged_work() - before;
                let before = ctx.charged_work();
                let (new_node, new_path, cursor) = owner.resolve_ref_location_impl::<true>(&reference, &path, Some(base), false, ctx)?;
                assert!(std::ptr::eq(old_node, new_node));
                assert_eq!(old_path.units(), new_path.units());
                assert!(cursor.is_none());
                assert!(ctx.charged_work() - before < old_work);
            }
            let reference = Value::String(Utf16::from("#/$defs/id"));
            let (old, old_path, _) = owner.resolve_ref_location_impl::<false>(&reference, &path, Some(base), true, ctx)?;
            let (tracked, tracked_path, cursor) = owner.resolve_ref_location_impl::<true>(&reference, &path, Some(base), true, ctx)?;
            assert!(std::ptr::eq(old, tracked));
            assert_eq!(old_path, tracked_path);
            if let Some(cursor) = cursor {
                assert!(std::ptr::eq(cursor.get(&owner, ctx)?, tracked));
            }
            denied_amount.set(Some(16));
            let error = match owner.resolve_ref_location_impl::<true>(&reference, &path, Some(base), false, ctx) {
                Ok(_) => panic!("denied identity-path move must not resolve"),
                Err(error) => error,
            };
            assert!(refused.get());
            assert_eq!(error.code, "COUNTED_HOST");
            assert_eq!(error.path, Utf16::from("#/host"));
            Ok(())
        })
    }).unwrap();
}
