// SPDX-License-Identifier: MIT OR Apache-2.0
//! PTH1 independent source controls: UNCOMPILED / NATIVE UNEXECUTED.
//! Written seam v2; actual borrowed owner/path observations are routing only.
//! Helper parity and real caller consumption are asserted separately.
use super::*;
use construction_index::{observe_paths, CarriedPath, PathSelector};
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn compiled(schema: &Value, resources: &SchemaResources) -> CompiledSchema {
    Context::catalog()
        .with_codegen_construction(|ctx| CompiledSchema::compile(schema, resources, ctx))
        .unwrap()
}
fn simple() -> CompiledSchema {
    compiled(
        &json(r#"{"$id":"https://pth.test/root","type":"integer"}"#),
        &SchemaResources::default(),
    )
}
fn aliases() -> CompiledSchema {
    compiled(
        &json(r#"{"$id":"https://pth.test/root","type":"integer"}"#),
        &SchemaResources {
            entries: vec![
                (
                    Utf16::from("https://pth.test/alias"),
                    json(
                        r#"{"$id":"https://pth.test/target","$dynamicAnchor":"first","type":"integer"}"#,
                    ),
                ),
                (
                    Utf16::from("https://pth.test/target"),
                    json(
                        r#"{"$id":"https://pth.test/other","$dynamicAnchor":"second","type":"boolean"}"#,
                    ),
                ),
            ],
        },
    )
}
fn observed<T>(op: impl FnOnce() -> T) -> (T, Vec<&'static str>) {
    let events = Rc::new(RefCell::new(Vec::new()));
    let sink = events.clone();
    let result = observe_paths(Box::new(move |e| sink.borrow_mut().push(e)), op);
    let copy = events.borrow().clone();
    (result, copy)
}
fn generic(
    index: &construction_index::ColdResourceIndex,
    text: &Utf16,
    selector: PathSelector,
    ctx: &mut Context<'_>,
) -> Result<Option<usize>, EngineError> {
    match selector {
        PathSelector::Policy => index.policy_path(text, ctx),
        PathSelector::Common => index.for_path(text, ctx),
        PathSelector::Dynamic => index.dynamic_path(text, ctx),
    }
}
fn syntax(path: &CarriedPath) {
    let text = path.text().units();
    assert_eq!(
        path.syntax_for_test(),
        Some((
            text.iter().position(|u| *u == 35),
            text.iter().any(|u| (0xd800..=0xdfff).contains(u))
        ))
    );
}
fn select(
    owner: &CompiledSchema,
    path: &CarriedPath,
    selector: PathSelector,
    ctx: &mut Context<'_>,
) -> Option<usize> {
    let index = owner
        .cold_resource_index
        .as_ref()
        .expect("genuine indexed owner");
    let actual = index.select_carried(owner, path, selector, ctx).unwrap();
    assert_eq!(
        actual,
        generic(index, path.text(), selector, &mut Context::catalog()).unwrap()
    );
    actual
}

#[derive(Clone)]
struct PathCallReadback {
    site: &'static str,
    owner_schema: Value,
    lineage: Option<Arc<()>>,
    path: Utf16,
    syntax: Option<(Option<usize>, bool)>,
    selections: Option<[Option<Option<usize>>; 3]>,
    indexed: bool,
}
fn observed_calls<T>(operation: impl FnOnce() -> T) -> (T, Vec<PathCallReadback>) {
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let result = construction_index::observe_path_calls(
        Box::new(move |site, owner, path| {
            sink.borrow_mut().push(PathCallReadback {
                site,
                owner_schema: owner.schema_value().clone(),
                lineage: owner.owner_lineage.clone(),
                path: path.text().clone(),
                syntax: path.syntax_for_test(),
                selections: path.selections_for_test(),
                indexed: owner.cold_resource_index.is_some(),
            });
        }),
        operation,
    );
    let copy = rows.borrow().clone();
    (result, copy)
}

fn calls_for<'a>(
    rows: &'a [PathCallReadback],
    owner: &CompiledSchema,
    site: &str,
) -> Vec<&'a PathCallReadback> {
    rows.iter()
        .filter(|r| {
            r.site == site
                && r.owner_schema == *owner.schema_value()
                && match (&r.lineage, &owner.owner_lineage) {
                    (Some(a), Some(b)) => Arc::ptr_eq(a, b),
                    (None, None) => true,
                    _ => false,
                }
        })
        .collect()
}
fn preflight_again(owner: &CompiledSchema, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let path = schema_origin_path(owner.schema_value());
    let scope = schema_id(owner.schema_value()).unwrap_or_default();
    let cursor = owner.location_root(0, true, ctx)?;
    owner.preflight_located(
        owner.schema_value(),
        &path,
        &scope,
        0,
        owner.root_keyword_policy,
        ctx,
        &mut BTreeSet::new(),
        cursor,
    )
}

#[test]
fn pth01_genuine_seed_append_and_retarget_match_paid_original_path_oracle() {
    let mut ctx = Context::catalog();
    for root in [
        "",
        "#",
        "https://pth.test/root",
        "https://pth.test/root#",
        "https://pth.test/root#/",
    ] {
        let parent = CarriedPath::seed(Utf16::from(root), &mut ctx).unwrap();
        syntax(&parent);
        for step in ["first#later", "a/b~☃", "0", "9", "10", "99", "100"] {
            for kind in [
                PathKind::RawSchemaStep,
                PathKind::SchemaPointer,
                PathKind::InstancePointer,
            ] {
                let segment = Utf16::from(step);
                let child = parent.append(&segment, kind, &mut ctx).unwrap();
                let expected = match kind {
                    PathKind::RawSchemaStep => append_schema_path(parent.text(), step),
                    PathKind::SchemaPointer => append_schema_pointer(parent.text(), &segment),
                    PathKind::InstancePointer => append_instance_path(parent.text(), &segment),
                };
                assert_eq!(child.text(), &expected);
                syntax(&child);
                if root.contains('#') {
                    assert_eq!(
                        child.syntax_for_test().unwrap().0,
                        parent.syntax_for_test().unwrap().0
                    );
                }
                assert_eq!(parent.text(), &Utf16::from(root));
            }
        }
    }
    let plain = CarriedPath::seed(Utf16::from("origin"), &mut ctx).unwrap();
    let introduced = plain
        .append(&Utf16::from("#first"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(introduced.text(), &Utf16::from("origin/#first"));
    assert_eq!(introduced.syntax_for_test(), Some((Some(7), false)));
    // Authoritative retarget text is reseeded, never relabeled with prior facts.
    let retarget = CarriedPath::seed(Utf16::from("new#target"), &mut ctx).unwrap();
    assert_eq!(retarget.syntax_for_test(), Some((Some(3), false)));
    assert_eq!(retarget.selections_for_test(), None);
}

#[test]
fn pth02_any_surrogate_suffix_preserves_conservative_index_fallback() {
    let owner = simple();
    let mut ctx = Context::catalog();
    let parent = CarriedPath::seed(Utf16::from("https://pth.test/root#"), &mut ctx).unwrap();
    assert_eq!(
        select(&owner, &parent, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    for units in [
        vec![0xd800],
        vec![0xdc00],
        vec![0xd83d, 0xde00],
        vec![35, 0xd83d, 0xde00],
    ] {
        let child = parent
            .append(&Utf16::new(units), PathKind::SchemaPointer, &mut ctx)
            .unwrap();
        syntax(&child);
        assert!(child.syntax_for_test().unwrap().1);
        for selector in [
            PathSelector::Policy,
            PathSelector::Common,
            PathSelector::Dynamic,
        ] {
            assert_eq!(select(&owner, &child, selector, &mut ctx), None);
        }
        let sibling = parent
            .append(&Utf16::from("safe"), PathKind::SchemaPointer, &mut ctx)
            .unwrap();
        assert_eq!(sibling.syntax_for_test().unwrap().1, false);
        assert_eq!(
            select(&owner, &sibling, PathSelector::Policy, &mut ctx),
            Some(0)
        );
    }
    for units in [vec![0xd800, 35], vec![0xd83d, 0xde00, 35]] {
        let path = CarriedPath::seed(Utf16::new(units), &mut ctx).unwrap();
        assert_eq!(select(&owner, &path, PathSelector::Common, &mut ctx), None);
    }
}

#[test]
fn pth03_policy_common_dynamic_selectors_remain_independent_and_lazy() {
    let owner = aliases();
    let mut ctx = Context::catalog();
    let index = owner.cold_resource_index.as_ref().unwrap();
    let path = CarriedPath::seed(Utf16::from("https://pth.test/target#"), &mut ctx).unwrap();
    assert_eq!(path.selections_for_test(), None);
    assert_eq!(
        select(&owner, &path, PathSelector::Policy, &mut ctx),
        Some(1)
    );
    assert_eq!(
        path.selections_for_test(),
        Some([Some(Some(1)), None, None])
    );
    assert_eq!(select(&owner, &path, PathSelector::Common, &mut ctx), None);
    assert_eq!(
        path.selections_for_test(),
        Some([Some(Some(1)), Some(None), None])
    );
    assert_eq!(
        select(&owner, &path, PathSelector::Dynamic, &mut ctx),
        Some(1)
    );
    assert_eq!(
        path.selections_for_test(),
        Some([Some(Some(1)), Some(None), Some(Some(1))])
    );
    // Actual ambiguous alias makes frame_safe false in the original index.
    assert!(!index.matches_frame(1, path.text(), &mut ctx).unwrap());
    let fragment = CarriedPath::seed(Utf16::from("#/properties/x"), &mut ctx).unwrap();
    assert!(!index.matches_frame(1, fragment.text(), &mut ctx).unwrap());
    assert_eq!(
        select(&owner, &fragment, PathSelector::Common, &mut ctx),
        Some(0)
    );
    for near in ["https://pth.test/rootX#", "https://pth.test/root/child#"] {
        let near = CarriedPath::seed(Utf16::from(near), &mut ctx).unwrap();
        assert!(!index.matches_frame(0, near.text(), &mut ctx).unwrap());
        assert_eq!(select(&owner, &near, PathSelector::Common, &mut ctx), None);
    }
    assert!(index
        .matches_frame(0, &Utf16::from("https://pth.test/root#/x"), &mut ctx)
        .unwrap());
    assert!(!index
        .matches_frame_carried(&owner, 1, &path, &mut ctx)
        .unwrap());
    assert!(!index
        .matches_frame_carried(&owner, 1, &fragment, &mut ctx)
        .unwrap());
    assert_eq!(
        select(&owner, &fragment, PathSelector::Common, &mut ctx),
        Some(0)
    );
    for near in ["https://pth.test/rootX#", "https://pth.test/root/child#"] {
        let near = CarriedPath::seed(Utf16::from(near), &mut ctx).unwrap();
        assert_eq!(
            index
                .matches_frame_carried(&owner, 0, &near, &mut ctx)
                .unwrap(),
            index
                .matches_frame(0, near.text(), &mut Context::catalog())
                .unwrap()
        );
    }
}

#[test]
fn pth04_local_schema_and_multi_invalid_order_precede_origin_selection() {
    // Genuine compiler entries, not a mock policy function. Root-local dialect
    // refusal precedes any path selector. Nested caller observations require H's
    // completed routing seam; they are not inferred from these root cases.
    for text in [
        r#"{"$schema":7,"type":7}"#,
        r#"{"$schema":"https://pth.test/unknown","type":7}"#,
    ] {
        let schema = json(text);
        let expected = CompiledSchema::compile(
            &schema,
            &SchemaResources::default(),
            &mut Context::catalog(),
        )
        .err()
        .expect("invalid dialect");
        let (actual, events) = observed(|| {
            Context::catalog().with_codegen_construction(|ctx| {
                CompiledSchema::compile(&schema, &SchemaResources::default(), ctx)
            })
        });
        assert_eq!(actual.err().unwrap(), expected);
        assert!(!events.contains(&"pth-selector-entry"));
    }
    let schema =
        json(r#"{"$id":"https://pth.test/root","properties":{"a":{"$schema":7,"type":7}}}"#);
    let expected = CompiledSchema::compile(
        &schema,
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .err()
    .unwrap();
    let actual = Context::catalog()
        .with_codegen_construction(|ctx| {
            CompiledSchema::compile(&schema, &SchemaResources::default(), ctx)
        })
        .err()
        .unwrap();
    assert_eq!(actual, expected);
    let (result, rows) = observed_calls(|| {
        Context::catalog().with_codegen_construction(|ctx| {
            CompiledSchema::compile(&schema, &SchemaResources::default(), ctx)
        })
    });
    assert_eq!(result.err().unwrap(), expected);
    let child_path = Utf16::from("https://pth.test/root#/properties/a");
    assert!(rows.iter().any(|r| r.owner_schema == schema
        && r.site == "pth-preflight-policy"
        && r.path == child_path));
    assert!(
        !rows.iter().any(|r| r.owner_schema == schema
            && r.site == "pth-selector-consumer"
            && r.path == child_path),
        "local invalid $schema must refuse before its path selector"
    );
    let custom_resources = SchemaResources {
        entries: vec![(
            Utf16::from("https://pth.test/custom"),
            json(
                r#"{"$id":"https://pth.test/custom","$schema":"https://json-schema.org/draft/2020-12/schema","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true,"https://json-schema.org/draft/2020-12/vocab/validation":true}}"#,
            ),
        )],
    };
    let custom = json(
        r#"{"$id":"https://pth.test/root","properties":{"a":{"$schema":"https://pth.test/custom","type":"integer","x-opaque":{"retained":true}}}}"#,
    );
    let actual = compiled(&custom, &custom_resources);
    let original =
        CompiledSchema::compile(&custom, &custom_resources, &mut Context::catalog()).unwrap();
    let (outcome, rows) = observed_calls(|| preflight_again(&actual, &mut Context::catalog()));
    assert_eq!(outcome, preflight_again(&original, &mut Context::catalog()));
    assert!(outcome.is_ok());
    let child = Utf16::from("https://pth.test/root#/properties/a");
    assert!(calls_for(&rows, &actual, "pth-preflight-policy")
        .iter()
        .any(|r| r.path == child));
    assert!(
        !calls_for(&rows, &actual, "pth-selector-consumer")
            .iter()
            .any(|r| r.path == child),
        "custom local dialect is handled before path-origin selector"
    );
    assert_eq!(
        actual.schema_value(),
        &custom,
        "unknown custom content remains intact"
    );
}

#[test]
fn pth05_actual_caller_inherited_policy_and_effective_limits_are_preserved() {
    let owner = simple();
    let legacy = CompiledSchema::compile(
        owner.schema_value(),
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .unwrap();
    let mut ctx = Context::catalog();
    let path =
        CarriedPath::seed(Utf16::from("https://pth.test/root#/properties/x"), &mut ctx).unwrap();
    assert_eq!(
        select(&owner, &path, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    let mut limits = ctx.limits();
    limits.max_depth -= 1;
    let mut changed = Context::with_limits(ctx.profile(), limits).unwrap();
    let before = path.selections_for_test();
    let (result, events) = observed(|| select(&owner, &path, PathSelector::Dynamic, &mut changed));
    assert_eq!(result, Some(0));
    assert!(!events.contains(&"pth-selector-hit"));
    assert!(!events.contains(&"pth-selector-publication"));
    assert_eq!(path.selections_for_test(), before);
    assert_eq!(
        owner
            .keyword_policy_for(
                owner.schema_value(),
                path.text(),
                owner.root_keyword_policy,
                &mut changed
            )
            .unwrap(),
        legacy
            .keyword_policy_for(
                legacy.schema_value(),
                path.text(),
                legacy.root_keyword_policy,
                &mut Context::catalog()
            )
            .unwrap()
    );
    for sample in [Value::Number(1.0), Value::Bool(false)] {
        assert_eq!(
            owner.validate(&sample, &mut changed).unwrap(),
            legacy.validate(&sample, &mut Context::catalog()).unwrap()
        );
    }
    let source = json(
        r#"{"$id":"https://pth.test/root","properties":{"a/b~☃":{"type":"integer"}},"allOf":[{"type":"object"}]}"#,
    );
    let routed = compiled(&source, &SchemaResources::default());
    let original = CompiledSchema::compile(
        &source,
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .unwrap();
    let (actual, rows) = observed_calls(|| preflight_again(&routed, &mut Context::catalog()));
    assert_eq!(actual, preflight_again(&original, &mut Context::catalog()));
    let calls = calls_for(&rows, &routed, "pth-preflight-policy");
    for expected in [
        "https://pth.test/root#",
        "https://pth.test/root#/properties/a~1b~0☃",
        "https://pth.test/root#/allOf/0",
    ] {
        assert!(
            calls
                .iter()
                .any(|r| r.path == Utf16::from(expected) && r.syntax.is_some() && r.indexed),
            "missing actual recursive preflight consumer {expected}"
        );
    }
    let sample = json(r#"{"a/b~☃":false}"#);
    let (actual, rows) = observed_calls(|| routed.validate(&sample, &mut Context::catalog()));
    assert_eq!(actual, original.validate(&sample, &mut Context::catalog()));
    assert!(!calls_for(&rows, &routed, "pth-evaluator-frame").is_empty());
    assert!(!calls_for(&rows, &routed, "pth-selector-consumer").is_empty());
    assert!(!calls_for(&rows, &routed, "pth-anchor-consumer").is_empty());
}

#[test]
fn pth06_foreign_owner_arena_and_retarget_invalidate_optional_facts() {
    let owner = simple();
    let foreign = simple();
    let mut ctx = Context::catalog();
    let path = CarriedPath::seed(Utf16::from("https://pth.test/root#"), &mut ctx).unwrap();
    assert_eq!(
        select(&owner, &path, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    let prior = path.selections_for_test();
    let (_, events) = observed(|| select(&foreign, &path, PathSelector::Common, &mut ctx));
    assert!(!events.contains(&"pth-selector-hit"));
    assert!(!events.contains(&"pth-selector-publication"));
    assert_eq!(path.selections_for_test(), prior);
    let moved = owner;
    assert_eq!(
        select(&moved, &path, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    let retarget = CarriedPath::seed(Utf16::from("https://pth.test/missing#"), &mut ctx).unwrap();
    assert_eq!(retarget.selections_for_test(), None);
    assert_eq!(
        select(&moved, &retarget, PathSelector::Policy, &mut ctx),
        None
    );
    // A genuine ordinary compiler does not enroll an index or a lineage token.
    let ordinary = CompiledSchema::compile(
        moved.schema_value(),
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .unwrap();
    assert!(ordinary.cold_resource_index.is_none());
    assert_eq!(
        ordinary.validate(&Value::Number(1.0), &mut ctx).unwrap(),
        moved.validate(&Value::Number(1.0), &mut ctx).unwrap()
    );
    // Plain constructor carries no syntax; selection must use original lookup.
    let plain = CarriedPath::plain(Utf16::from("https://pth.test/root#"));
    assert_eq!(plain.syntax_for_test(), None);
    assert_eq!(
        select(&moved, &plain, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    assert_eq!(plain.selections_for_test(), None);
    let (_, rows) =
        observed_calls(|| ordinary.validate(&Value::Bool(false), &mut Context::catalog()));
    let calls = calls_for(&rows, &ordinary, "pth-evaluator-frame");
    assert!(!calls.is_empty());
    assert!(calls
        .iter()
        .all(|r| !r.indexed && r.syntax.is_none() && r.selections.is_none()));
    // Nested-ID unsupported index: a genuinely compiled owner chooses fallback.
    let nested = json(
        r#"{"$id":"https://pth.test/root","$defs":{"inner":{"$id":"nested","type":"integer"}},"type":"integer"}"#,
    );
    let fallback = compiled(&nested, &SchemaResources::default());
    assert!(fallback.cold_resource_index.is_none());
    let (_, rows) =
        observed_calls(|| fallback.validate(&Value::Bool(false), &mut Context::catalog()));
    assert!(!calls_for(&rows, &fallback, "pth-evaluator-frame").is_empty());
    assert!(calls_for(&rows, &fallback, "pth-evaluator-frame")
        .iter()
        .all(|r| r.syntax.is_none()));
}

#[test]
fn pth07_genuine_selector_miss_reuse_and_origin_change_reselection() {
    let owner = simple();
    let mut ctx = Context::catalog();
    let miss = CarriedPath::seed(Utf16::from("https://pth.test/missing#"), &mut ctx).unwrap();
    assert_eq!(select(&owner, &miss, PathSelector::Policy, &mut ctx), None);
    assert_eq!(miss.selections_for_test(), Some([Some(None), None, None]));
    let (_, events) = observed(|| select(&owner, &miss, PathSelector::Policy, &mut ctx));
    assert!(events.contains(&"pth-selector-hit"));
    assert!(!events.contains(&"pth-selector-original-read"));
    let later = miss
        .append(&Utf16::from("#later"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(
        later.syntax_for_test().unwrap().0,
        miss.syntax_for_test().unwrap().0
    );
    assert_eq!(select(&owner, &later, PathSelector::Policy, &mut ctx), None);
    let no_hash = CarriedPath::seed(Utf16::from("https://pth.test/root"), &mut ctx).unwrap();
    assert_eq!(
        select(&owner, &no_hash, PathSelector::Policy, &mut ctx),
        None
    );
    let first = no_hash
        .append(&Utf16::from("#"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    // The producer inserted '/', so this is NOT the parent's root URI.
    assert_eq!(first.text(), &Utf16::from("https://pth.test/root/#"));
    assert_eq!(select(&owner, &first, PathSelector::Policy, &mut ctx), None);
    let retarget = CarriedPath::seed(Utf16::from("https://pth.test/root#"), &mut ctx).unwrap();
    assert_eq!(
        select(&owner, &retarget, PathSelector::Policy, &mut ctx),
        Some(0)
    );
}

#[test]
fn pth08_plain_marked_reference_and_dynamic_scope_spelling_remains_exact() {
    let schema = json(
        r##"{"$id":"https://pth.test/root","$defs":{"a/b~☃":{"type":"integer"}},"properties":{"x":{"$ref":"#/$defs/a~1b~0☃"}}}"##,
    );
    let indexed = compiled(&schema, &SchemaResources::default());
    let original = CompiledSchema::compile(
        &schema,
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .unwrap();
    let bad = json(r#"{"x":false}"#);
    let errors = indexed.validate(&bad, &mut Context::catalog()).unwrap();
    assert!(!errors.is_empty());
    assert_eq!(
        errors,
        original.validate(&bad, &mut Context::catalog()).unwrap()
    );
    let dynamic = aliases();
    let legacy = CompiledSchema::compile(
        dynamic.schema_value(),
        &dynamic.resources,
        &mut Context::catalog(),
    )
    .unwrap();
    let path = Utf16::from("https://pth.test/target#");
    let actual = dynamic
        .dynamic_resource_for_path(&path, &mut Context::catalog())
        .unwrap()
        .unwrap();
    let expected = legacy
        .dynamic_resource_for_path(&path, &mut Context::catalog())
        .unwrap()
        .unwrap();
    assert_eq!(actual.0, expected.0);
    assert_eq!(actual.1, expected.1);
    let python = CompiledSchema::compile_python_schema(
        &schema,
        &SchemaResources::default(),
        false,
        PythonReVersion::V3_14,
        &mut Context::catalog(),
    )
    .unwrap();
    assert!(python.cold_resource_index.is_none());
    assert_eq!(
        python
            .validate(&bad, &mut Context::catalog())
            .unwrap()
            .is_empty(),
        false
    );
    // Genuine Python source binding, independently authored marked-key paths.
    // Compare against literal spelling, NOT core/Python cross-profile equality.
    let marked_schema = json(r#"{"properties":{"a/~":{"type":"string"}}}"#);
    let marked_bad = json(r#"{"a/~":true}"#);
    let mut ctx = Context::catalog();
    let source = crate::python_value::python_from_core_value(&marked_schema, &mut ctx).unwrap();
    let python_source = CompiledSchema::compile_python_source(
        &source,
        &crate::python_value::PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_14,
        &mut ctx,
    )
    .unwrap();
    assert!(python_source.compiled.cold_resource_index.is_none());
    let instance = crate::python_value::python_from_core_value(&marked_bad, &mut ctx).unwrap();
    instance.admit(&mut ctx).unwrap();
    let (outcome, rows) = observed_calls(|| {
        python_source.compiled.evaluate_instance_with_mode(
            &instance,
            EvaluationMode::AllErrors,
            &mut ctx,
        )
    });
    let outcome = outcome.unwrap();
    assert!(outcome.terminal_error.is_none());
    let errors = outcome.errors;
    let calls = calls_for(&rows, &python_source.compiled, "pth-evaluator-frame");
    assert!(
        !calls.is_empty(),
        "genuine Python-profile evaluator consumed plain paths"
    );
    assert!(calls.iter().all(|r| !r.indexed && r.syntax.is_none()));
    assert!(ctx.evaluation_paths.is_none());
    assert_eq!(errors.len(), 1);
    assert!(errors[0].python_source_path);
    assert_eq!(errors[0].schema_path, Utf16::from("#/~p00007000007200006f000070000065000072000074000069000065000073/~p00006100002f00007e/~p000074000079000070000065"));
    assert_eq!(
        errors[0].instance_path,
        Utf16::from("/~p00006100002f00007e")
    );
    let (actual_errors, rows) = observed_calls(|| indexed.validate(&bad, &mut Context::catalog()));
    assert_eq!(
        actual_errors.unwrap(),
        original.validate(&bad, &mut Context::catalog()).unwrap()
    );
    let refs = calls_for(&rows, &indexed, "pth-evaluator-frame");
    assert!(
        refs.iter()
            .any(|r| r.path == Utf16::from("https://pth.test/root#/$defs/a~1b~0☃")),
        "actual resolved reference path, not helper-only spelling"
    );
    assert!(!calls_for(&rows, &indexed, "pth-anchor-consumer").is_empty());
    let (actual, rows) =
        observed_calls(|| dynamic.validate(&Value::Number(1.0), &mut Context::catalog()));
    assert_eq!(
        actual.unwrap(),
        legacy
            .validate(&Value::Number(1.0), &mut Context::catalog())
            .unwrap()
    );
    assert!(!calls_for(&rows, &dynamic, "pth-evaluator-frame").is_empty());
    // This genuine alias-ref entry makes common selection miss, so the actual
    // evaluator must reach dynamic fallback. Boolean acceptance is authored:
    // the retrieval target selects the second, boolean-valued resource.
    let ref_schema = json(r#"{"$id":"https://pth.test/root","$ref":"https://pth.test/target"}"#);
    let ref_owner = compiled(&ref_schema, &dynamic.resources);
    let ref_original =
        CompiledSchema::compile(&ref_schema, &dynamic.resources, &mut Context::catalog()).unwrap();
    let (actual, rows) =
        observed_calls(|| ref_owner.validate(&Value::Bool(true), &mut Context::catalog()));
    let actual = actual.unwrap();
    assert!(actual.is_empty());
    assert_eq!(
        actual,
        ref_original
            .validate(&Value::Bool(true), &mut Context::catalog())
            .unwrap()
    );
    assert!(
        calls_for(&rows, &ref_owner, "pth-dynamic-consumer")
            .iter()
            .any(|r| r
                .path
                .units()
                .starts_with(Utf16::from("https://pth.test/target#").units())),
        "actual ambiguous-alias evaluator dynamic fallback"
    );
}

#[test]
fn pth09_real_pre_effect_denials_preserve_first_host_error_and_no_publication() {
    let owner = simple();
    // Replay each REAL control callback, not assumed one event per callback.
    for operation in 0..3 {
        let run = |ctx: &mut Context<'_>, path: &CarriedPath| -> Result<(), EngineError> {
            match operation {
                0 => {
                    CarriedPath::seed(Utf16::from("https://pth.test/root#"), ctx)?;
                }
                1 => {
                    path.append(&Utf16::from("a/~#"), PathKind::SchemaPointer, ctx)?;
                }
                _ => {
                    owner.cold_resource_index.as_ref().unwrap().select_carried(
                        &owner,
                        path,
                        PathSelector::Policy,
                        ctx,
                    )?;
                }
            }
            Ok(())
        };
        let calls = Cell::new(0);
        let mut meter = |_| {
            calls.set(calls.get() + 1);
            Ok(())
        };
        let path = CarriedPath::seed(
            Utf16::from("https://pth.test/root#"),
            &mut Context::catalog(),
        )
        .unwrap();
        run(&mut Context::catalog().with_host_control(&mut meter), &path).unwrap();
        let total = calls.get();
        assert!(total > 0);
        for denied in 1..=total {
            let path = CarriedPath::seed(
                Utf16::from("https://pth.test/root#"),
                &mut Context::catalog(),
            )
            .unwrap();
            let events = Rc::new(RefCell::new(Vec::new()));
            let sink = events.clone();
            let calls = Cell::new(0);
            let at_denial = Cell::new(usize::MAX);
            let error = EngineError::new(
                "HOST_FIRST",
                Utf16::new(vec![47, 0xd800]),
                "distinct host message",
            );
            let mut stop = |_| {
                calls.set(calls.get() + 1);
                if calls.get() == denied {
                    at_denial.set(events.borrow().len());
                    Err(error.clone())
                } else {
                    Ok(())
                }
            };
            let result = observe_paths(Box::new(move |e| sink.borrow_mut().push(e)), || {
                run(&mut Context::catalog().with_host_control(&mut stop), &path)
            });
            assert_eq!(result.unwrap_err(), error.from_host());
            assert_eq!(calls.get(), denied, "callback after first denial");
            assert_eq!(
                events.borrow().len(),
                at_denial.get(),
                "effect/routing event after denial"
            );
            assert_eq!(path.text(), &Utf16::from("https://pth.test/root#"));
            assert_eq!(
                path.selections_for_test(),
                None,
                "no partial selection published"
            );
        }
    }
}

#[test]
fn pth10_reentry_return_error_and_unwind_restore_parent_custody() {
    let owner = simple();
    let mut ctx = Context::catalog();
    let parent = CarriedPath::seed(Utf16::from("https://pth.test/root#"), &mut ctx).unwrap();
    assert_eq!(
        select(&owner, &parent, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    for panic_branch in [false, true] {
        let (_, outer_events) = observed(|| {
            let result = catch_unwind(AssertUnwindSafe(|| {
                observe_paths(Box::new(|_| {}), || {
                    let child = parent
                        .append(&Utf16::new(vec![0xd800]), PathKind::RawSchemaStep, &mut ctx)
                        .unwrap();
                    assert_eq!(select(&owner, &child, PathSelector::Policy, &mut ctx), None);
                    if panic_branch {
                        panic!("independent branch unwind");
                    }
                    Err::<(), _>(EngineError::new(
                        "BRANCH",
                        child.text().clone(),
                        "branch error",
                    ))
                })
            }));
            assert_eq!(result.is_err(), panic_branch);
            let sibling = parent
                .append(&Utf16::from("safe"), PathKind::SchemaPointer, &mut ctx)
                .unwrap();
            assert_eq!(sibling.syntax_for_test().unwrap().1, false);
            assert_eq!(
                select(&owner, &sibling, PathSelector::Policy, &mut ctx),
                Some(0)
            );
        });
        assert!(
            outer_events.contains(&"pth-append-output"),
            "outer observer not restored"
        );
    }
    // Reenter at the actual post-admission publication event, AFTER the
    // outer selector captured its epoch. A first guard callback is too early.
    let owner = Rc::new(owner);
    let fresh =
        Rc::new(CarriedPath::seed(Utf16::from("https://pth.test/root#"), &mut ctx).unwrap());
    let once = Rc::new(Cell::new(false));
    let inner_owner = owner.clone();
    let inner_path = fresh.clone();
    let entered = once.clone();
    let result = observe_paths(
        Box::new(move |event| {
            if event == "pth-selector-publication" && !entered.replace(true) {
                assert_eq!(
                    inner_path.selections_for_test(),
                    None,
                    "outer has not published"
                );
                assert_eq!(
                    select(
                        &inner_owner,
                        &inner_path,
                        PathSelector::Dynamic,
                        &mut Context::catalog()
                    ),
                    Some(0)
                );
                assert_eq!(
                    inner_path.selections_for_test(),
                    Some([None, None, Some(Some(0))])
                );
            }
        }),
        || select(&owner, &fresh, PathSelector::Policy, &mut ctx),
    );
    assert_eq!(result, Some(0));
    assert!(once.get(), "publication reentry must actually occur");
    assert_eq!(
        fresh.selections_for_test(),
        Some([None, None, Some(Some(0))]),
        "stale outer publication must neither overwrite inner state nor store Policy"
    );
    // A later independent call may legitimately complete the still-pending slot.
    assert_eq!(
        select(&owner, &fresh, PathSelector::Policy, &mut ctx),
        Some(0)
    );
    assert_eq!(
        fresh.selections_for_test(),
        Some([Some(Some(0)), None, Some(Some(0))])
    );
}
