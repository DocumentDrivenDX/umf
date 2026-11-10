// SPDX-License-Identifier: MIT OR Apache-2.0
//! PS1 independent source controls. UNCOMPILED / NATIVE UNEXECUTED.
//! Tests use real owner bindings, route operations, and semantic callers.
use super::*;
use crate::engine::ResourceSet;
use std::{cell::RefCell, panic::{catch_unwind, AssertUnwindSafe}, rc::Rc};

fn psr_json(s: &str) -> Value {
    crate::serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), crate::serialization::Format::Json, &mut Context::catalog()).unwrap()
}
fn psr_bank_role(s: &Value, role: usize) -> CompiledSchema {
    Context::catalog().with_codegen_construction(|ctx| {
        let set = ResourceSet::new(s.clone(), psr_json(r#"{"$id":"https://ps1.test/ref","type":"string"}"#), psr_json(r#"{"$id":"https://ps1.test/pkg","type":"boolean"}"#), psr_json("{}"), psr_json("{}"));
        let admitted = admitted_bank::SchemaBank::admit_core(set, ctx)?;
        CompiledSchema::compile_input_bank(admitted.bank, role, ctx)
    }).unwrap()
}
fn psr_bank(s: &Value) -> CompiledSchema { psr_bank_role(s, 0) }
fn psr_draft3_bank(s: &Value) -> CompiledSchema {
    Context::catalog().with_codegen_construction(|ctx| {
        let set = ResourceSet::new(
            s.clone(),
            psr_json(r#"{"$schema":"http://json-schema.org/draft-03/schema#","id":"https://ps1.test/ref","type":"string"}"#),
            psr_json(r#"{"$schema":"http://json-schema.org/draft-03/schema#","id":"https://ps1.test/pkg","type":"boolean"}"#),
            psr_json("{}"),
            psr_json("{}"),
        );
        let admitted = admitted_bank::SchemaBank::admit_core(set, ctx)?;
        CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)
    }).unwrap()
}
fn member(v: &Value, name: &str) -> usize {
    let Value::Object(m) = v else { panic!("object fixture") };
    m.iter().position(|(k, _)| k == &Utf16::from(name)).unwrap()
}
fn child<'a>(v: &'a Value, name: &str) -> &'a Value {
    let Value::Object(m) = v else { panic!("object fixture") };
    m.iter().find(|(k, _)| k == &Utf16::from(name)).map(|(_, v)| v).unwrap()
}
fn props<'a>(v: &'a Value) -> &'a Vec<(Utf16, Value)> {
    let Value::Object(m) = child(v, "properties") else { panic!("properties object") };
    m
}

#[test]
fn ps01_actual_specialized_type_field_closure_and_layout() {
    let src = include_str!("schema.rs");
    let fused = src.split("struct FusedPreflightFrame").nth(1).unwrap().split("}\n").next().unwrap();
    let fused_key = src.split("struct FusedPreflightKeyword").nth(1).unwrap().split("}\n").next().unwrap();
    let legacy = src.split("struct LegacyPreflightFrame").nth(1).unwrap().split("}\n").next().unwrap();
    let legacy_key = src.split("struct LegacyPreflightKeyword").nth(1).unwrap().split("}\n").next().unwrap();
    assert!(fused.contains("BorrowedChild") && fused.contains("FusedPreflightFrontier"));
    assert!(!fused.contains("PreflightCold"));
    for forbidden in ["OwnerCursor", "CheckedLocation", "OrderedOwnerChildren"] { assert!(!fused.contains(forbidden)); }
    assert!(fused_key.contains("selected: bool") && fused_key.contains("parent: Option<owner_locations::BorrowedChild") && fused_key.contains("PreflightCold<LegacyPreflightKeyword"));
    for forbidden in ["Option<OwnerCursor", "Option<CheckedLocation", "Option<OrderedOwnerChildren"] { assert!(!fused_key.contains(forbidden)); }
    assert!(legacy.contains("OwnerCursor") && legacy.contains("CheckedLocation") && legacy.contains("OrderedOwnerChildren"));
    assert!(!legacy.contains("BorrowedChild") && legacy_key.contains("selected: bool") && !legacy_key.contains("BorrowedChild"));
    assert!(std::mem::size_of::<FusedPreflightFrame<'static, 'static>>() > 0);
    assert!(std::mem::align_of::<FusedPreflightFrame<'static, 'static>>() > 0);
    assert!(std::mem::size_of::<LegacyPreflightFrame<'static>>() > 0);
    // Layout is target-relative; source field closure, not size, proves absence.
    let direct = src.split("fn preflight_fused_ordered_child").nth(1).unwrap().split("fn preflight_fused_original_child").next().unwrap();
    assert!(direct.contains("walk.select(edge,ctx)?"));
    for absent in ["preflight_ordered_child(", "type Child", "type Nested", "let mut checked", "let mut ordered", "mem::replace", "Some(Some(walk))"] {
        assert!(!direct.contains(absent), "removed mixed transport: {absent}");
    }
    assert!(direct.contains("*frontier=match parent.children(ctx)?"));
    assert!(direct.find("ctx.charge_work(2,").unwrap() < direct.find("if matches!(frontier").unwrap());
    assert!(direct.contains("parent.materialize_cursor(ctx)?"));
    assert!(direct.contains("child_cursor(Some(self),Some(&fallback),edge,ctx)?"));
    // The separate legacy helper and both semantic routes remain real code.
    let legacy_select = src.split("fn preflight_ordered_child").nth(1).unwrap().split("fn preflight_duplicate_child").next().unwrap();
    assert!(legacy_select.contains("checked.take()") && legacy_select.contains("walk.child(edge,ctx)?"));
}

#[test]
fn ps02_real_root_catalogue_and_legacy_calls_share_semantic_body() {
    let s = psr_json(r#"{"allOf":[{"type":"object"}],"properties":{"a":{"type":"integer"},"b":{"type":"string"}}}"#);
    let rows = Rc::new(RefCell::new(Vec::new())); let sink = rows.clone();
    let owner = owner_locations::observe_owner_walk(Box::new(move |e,r,n| sink.borrow_mut().push((e,r,n))), || psr_bank_role(&s, 0));
    let catalogue = psr_bank_role(&s, 1);
    let root = owner.location_root(0, true, &mut Context::catalog()).unwrap();
    assert!(owner.preflight_located(owner.schema_value(), &Utf16::from("#"), "https://ps1.test/root", 0, owner.root_keyword_policy, &mut Context::catalog(), &mut BTreeSet::new(), root).is_ok());
    assert!(rows.borrow().iter().any(|e| e.0 == "ft1-preflight-borrowed-consume"));
    let catalogue_root = catalogue.location_root(0, true, &mut Context::catalog()).unwrap();
    assert!(catalogue.preflight_located(catalogue.schema_value(), &Utf16::from("#"), "https://ps1.test/ref", 0, catalogue.root_keyword_policy, &mut Context::catalog(), &mut BTreeSet::new(), catalogue_root).is_ok());
    let src = include_str!("schema.rs");
    assert!(src.contains("fn preflight_semantic<'a,'binding,R>"));
    assert!(src.contains("R:PreflightRoute<'a,'binding>"));
    assert!(src.contains("preflight_semantic::<FusedPreflightRoute"));
    assert!(src.contains("preflight_semantic::<LegacyPreflightRoute"));
}

#[test]
fn ps03_owned_cold_keyword_keeps_advanced_parent_frontier_and_readback() {
    let s = psr_json(r#"{"allOf":[{"type":"object"}],"properties":{"a":{"type":"integer"},"b":{"type":"string"}}}"#);
    let owner = psr_bank(&s); let mut ctx = Context::catalog();
    let table = owner.owner_locations.as_ref().unwrap();
    let cursor = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    let checked = table.checked(&owner, &cursor, &mut ctx).unwrap().unwrap();
    let owner_locations::OwnerRoute::Fused(binding) = owner_locations::FusedBinding::try_new(checked, &mut ctx).unwrap() else { panic!("real fused root") };
    let parent = binding.root(&mut ctx).unwrap();
    let mut frame = fused_preflight_frame(parent, &mut ctx).unwrap();
    let first = member(&s, "allOf");
    assert!(matches!(owner.preflight_fused_ordered_child(&frame.parent, &mut frame.frontier, first, &mut ctx).unwrap(), FusedPreflightSelection::Located(owner_locations::CheckedOwnerLocation::Fused(_))));
    let mut keyword = FusedPreflightRoute::<'_, '_>::begin_keyword(&owner, &mut frame, &mut ctx).unwrap();
    let second = member(&s, "properties");
    let mut changed_ctx = Context::ordinary();
    FusedPreflightRoute::ensure_keyword(&owner, &mut frame, &mut keyword, second, &mut changed_ctx).unwrap();
    assert!(keyword.legacy.is_some());
    assert!(matches!(&keyword.frontier, FusedPreflightFrontier::Unavailable));
    assert!(matches!(&frame.frontier, FusedPreflightFrontier::Active(_)));
    let legacy = keyword.legacy.as_ref().unwrap().items.first().unwrap();
    assert!(legacy.selected);
    assert!(std::ptr::eq(legacy.checked.as_ref().unwrap().read(&owner, &mut changed_ctx).unwrap().unwrap(), child(owner.schema_value(), "properties")));
}

#[test]
fn ps04_unavailable_transition_uses_two_distinct_retained_legacy_demands() {
    let s = psr_json(r#"{"allOf":[{"type":"object"}],"properties":{"a":{"type":"integer"},"b":{"type":"string"}}}"#);
    let owner = psr_bank(&s); let mut ctx = Context::catalog();
    let table = owner.owner_locations.as_ref().unwrap();
    let cursor = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    let checked = table.checked(&owner, &cursor, &mut ctx).unwrap().unwrap();
    let owner_locations::OwnerRoute::Fused(binding) = owner_locations::FusedBinding::try_new(checked, &mut ctx).unwrap() else { panic!("real fused root") };
    let parent = binding.root(&mut ctx).unwrap();
    let mut frame = fused_preflight_frame(parent, &mut ctx).unwrap();
    let mut keyword = FusedPreflightRoute::<'_, '_>::begin_keyword(&owner, &mut frame, &mut ctx).unwrap();
    let edge = member(&s, "properties"); let mut path = construction_index::ScopedPreflightPath::new(&Utf16::from("#"), &mut ctx).unwrap(); let mut seen = BTreeSet::new();
    let mut changed_ctx = Context::ordinary();
    FusedPreflightRoute::ensure_keyword(&owner, &mut frame, &mut keyword, edge, &mut changed_ctx).unwrap();
    assert!(matches!(&keyword.frontier, FusedPreflightFrontier::Unavailable));
    // The changed-context transition above reaches cold Owned fallback and publishes
    // a retained LegacyPreflightKeyword. These two calls exercise that legacy walker;
    // they do not claim the separate direct original-demand branch is reached here.
    for (i, (name, value)) in props(owner.schema_value()).iter().enumerate() {
        FusedPreflightRoute::recurse_ordered(&owner, &mut frame, &mut keyword, edge, i, value, &mut path, PreflightChildPath::Key(name), None, "https://ps1.test/root", 1, owner.root_keyword_policy, &mut changed_ctx, &mut seen, |_,_| Ok(())).unwrap();
    }
    assert_eq!(path.text(), &Utf16::from("#"));
    assert!(matches!(&keyword.frontier, FusedPreflightFrontier::Unavailable));
    assert_eq!(props(owner.schema_value()).len(), 2);

    // A fresh real children attempt in a changed profile actually declines;
    // this reaches the direct Cursor fallback, not the cold Owned arm above.
    let mut direct_frontier = FusedPreflightFrontier::Unattempted;
    let fallback_events = Rc::new(RefCell::new(Vec::new())); let fallback_sink = fallback_events.clone();
    let direct = owner_locations::observe_owner_walk(Box::new(move |e, r, n| fallback_sink.borrow_mut().push((e, r, n))), ||
        owner.preflight_fused_ordered_child(&frame.parent, &mut direct_frontier, edge, &mut changed_ctx)).unwrap();
    let FusedPreflightSelection::Cursor(direct_cursor) = direct else { panic!("declined children retain original cursor demand") };
    assert!(matches!(&direct_frontier, FusedPreflightFrontier::Unavailable));
    assert!(std::ptr::eq(table.read(&owner, &direct_cursor, &mut changed_ctx).unwrap().unwrap(), child(owner.schema_value(), "properties")));
    let original_parent = frame.parent.materialize_cursor(&mut changed_ctx).unwrap();
    let original_child = table.child(&owner, &original_parent, edge, &mut changed_ctx).unwrap().unwrap();
    assert!(direct_cursor.same_location(&original_child));
    assert_eq!(fallback_events.borrow().iter().filter(|e| e.0 == "ft1-owning-cursor-materialized").count(), 1);
    assert!(!fallback_events.borrow().iter().any(|e| e.0 == "ft1-frontier-publication"));
    assert!(matches!(owner.preflight_fused_ordered_child(&frame.parent, &mut direct_frontier, usize::MAX, &mut changed_ctx).unwrap(), FusedPreflightSelection::Missing));
    assert!(matches!(&direct_frontier, FusedPreflightFrontier::Unavailable));
}

#[test]
fn ps05_semantic_error_path_and_order_match_original_preflight() {
    for text in [r#"{"patternProperties":{"[":{"type":7}}}"#, r#"{"type":"object","required":[7],"properties":{"x":{"type":false}}}"#, r##"{"$ref":"#/missing","minimum":"bad"}"##] {
        let value = psr_json(text);
        let actual = Context::catalog().with_codegen_construction(|ctx| CompiledSchema::compile(&value, &SchemaResources::default(), ctx)).map(|_|());
        let original = CompiledSchema::compile(&value, &SchemaResources::default(), &mut Context::catalog()).map(|_|());
        assert_eq!(actual, original, "original semantic result for {text}");
    }
    let src = include_str!("schema.rs");
    assert!(src.contains("pathmark(keyword"));
    assert!(src.contains("restore_after_failure"));

    assert!(src.contains("R::recurse_duplicate(self,&mut frame,&mut keyword,member_index,val,path,Some(key)"));
    assert!(src.contains("R::recurse_ordered(self,&mut frame,&mut keyword,member_index,index,branch,path,PreflightChildPath::Index(index),Some(key)"));
    let duplicate = src.split("fn preflight_legacy_duplicate_from_keyword").nth(1).unwrap().split("fn preflight_carried_checked").next().unwrap();
    assert!(duplicate.find("preflight_duplicate_child").unwrap() < duplicate.find("append_preflight_keyword_path").unwrap());

    // Draft3 array-of-object is admissible and reaches the real bank-backed
    // route. The second ordered selection is the array child; it must precede
    // the deferred `type` buffer write and carried-child consumption.
    let array_fixture = psr_json(r#"{"$schema":"http://json-schema.org/draft-03/schema#","type":[{"type":"string"}]}"#);
    let array_owner = psr_draft3_bank(&array_fixture);
    let mut root_ctx = Context::catalog();
    let root = array_owner.location_root(0, true, &mut root_ctx).unwrap();
    let trace = Rc::new(RefCell::new(Vec::<String>::new()));
    let owner_trace = trace.clone(); let path_trace = trace.clone(); let call_trace = trace.clone();
    let result = owner_locations::observe_owner_walk(Box::new(move |e, r, n| owner_trace.borrow_mut().push(format!("{e}:{r}:{n}"))), || {
        construction_index::observe_paths(Box::new(move |e| path_trace.borrow_mut().push(e.to_owned())), ||
            construction_index::observe_scoped_path_calls(Box::new(move |site, _, _| call_trace.borrow_mut().push(format!("scoped:{site}"))), ||
                array_owner.preflight_located(array_owner.schema_value(), &Utf16::from("#"), "https://ps1.test/draft3", 0, array_owner.root_keyword_policy, &mut Context::catalog(), &mut BTreeSet::new(), root)
            )
        )
    });
    assert!(result.is_ok());
    let trace = trace.borrow();
    let selections: Vec<usize> = trace.iter().enumerate().filter_map(|(i, e)| (e == "sp1-ordered-selection-performed").then_some(i)).collect();
    assert!(selections.len() >= 2, "keyword and actual array-child selections: {trace:?}");
    let keyword_path = trace.iter().position(|e| e == "sp1-buffer-after-append").unwrap();
    assert!(selections[1] < keyword_path, "array child selection precedes deferred type path write: {trace:?}");
    let child_consume = trace.iter().enumerate().skip(keyword_path + 1).find(|(_, e)| e.starts_with("ft1-preflight-borrowed-consume:")).map(|(i, _)| i).unwrap();
    assert!(keyword_path < child_consume, "type path precedes exact carried child consumption: {trace:?}");
    assert!(trace.iter().any(|e| e.starts_with("ft1-borrowed-child-published:")));

    // The object-valued arm is rejected by Draft3 metaschema validation as a
    // complete schema. Exercise its production duplicate-route component with
    // a separately valid Draft3 owner as dialect/config only and no owner cursor.
    // This proves selector-debit-before-path behavior without claiming a
    // successful public compile or an owner-bound child identity.
    let valid_owner = psr_draft3_bank(&psr_json(r#"{"$schema":"http://json-schema.org/draft-03/schema#","type":"string"}"#));
    let component = psr_json(r#"{"type":{"type":"string"}}"#);
    let type_key = match &component { Value::Object(rows) => &rows[0].0, _ => unreachable!() };
    let type_child = child(&component, "type");
    let route_fee = 5 * catalogue_words::<Option<&Utf16>>()
        + 3 * catalogue_words::<Option<&mut Option<construction_index::ScopedPreflightMark>>>() + 3;
    let duplicate_fee = (std::mem::size_of::<Option<OwnerCursor>>()
        + std::mem::size_of::<Option<owner_locations::CheckedLocation<'_>>>()
        + std::mem::size_of::<Option<owner_locations::BorrowedChild<'_, '_>>>())
        .div_ceil(std::mem::size_of::<usize>()) + 2;
    let mut route_admitted = false;
    let callback_amounts = Rc::new(RefCell::new(Vec::new()));
    let amounts = callback_amounts.clone();
    let mut control = move |amount| {
        amounts.borrow_mut().push(amount);
        if !route_admitted && amount == route_fee { route_admitted = true; Ok(()) }
        else { Err(EngineError::new("PS1_DRAFT3_DUPLICATE_DENIAL", Utf16::from("/ps1/draft3/duplicate"), "denied at duplicate selector admission")) }
    };
    let mut setup_ctx = Context::catalog();
    let mut frame = legacy_preflight_frame(None, None, &mut setup_ctx).unwrap();
    let mut keyword = LegacyPreflightRoute::begin_keyword(&valid_owner, &mut frame, &mut setup_ctx).unwrap();
    LegacyPreflightRoute::ensure_keyword(&valid_owner, &mut frame, &mut keyword, member(&component, "type"), &mut setup_ctx).unwrap();
    assert!(keyword.selected);
    let mut path = construction_index::ScopedPreflightPath::new(&Utf16::from("#"), &mut setup_ctx).unwrap();
    let mut seen = BTreeSet::new();
    let mut denied_ctx = Context::catalog().with_host_control(&mut control);
    let path_events = Rc::new(RefCell::new(Vec::<&'static str>::new())); let path_sink = path_events.clone();
    let result = construction_index::observe_paths(Box::new(move |e| path_sink.borrow_mut().push(e)), ||
        LegacyPreflightRoute::recurse_duplicate(&valid_owner, &mut frame, &mut keyword, member(&component, "type"), type_child, &mut path, Some(type_key), "https://ps1.test/draft3", 1, valid_owner.root_keyword_policy, &mut denied_ctx, &mut seen)
    );
    let error = match result { Err(error) => error, Ok(()) => panic!("duplicate selector debit must deny before keyword path") };
    assert!(error.is_control_failure());
    assert_eq!(error.code, "PS1_DRAFT3_DUPLICATE_DENIAL");
    assert_eq!(error.path, Utf16::from("/ps1/draft3/duplicate"));
    assert_eq!(error.message, Utf16::from("denied at duplicate selector admission"));
    assert_eq!(&*callback_amounts.borrow(), &[route_fee, duplicate_fee]);
    assert_eq!(path.text(), &Utf16::from("#"));
    assert!(!path_events.borrow().contains(&"sp1-pre-effect-suffix-write-admitted"));
}

#[test]
fn ps06_changed_limits_and_foreign_owner_fail_real_borrowed_readback() {
    let s = psr_json(r#"{"allOf":[{"type":"object"}],"properties":{"a":{"type":"integer"}}}"#);
    let owner = psr_bank(&s); let other = psr_bank(&psr_json(r#"{"type":"string"}"#));
    let mut ctx = Context::catalog(); let table = owner.owner_locations.as_ref().unwrap();
    let cursor = table.root(&owner, 0, &mut ctx).unwrap().unwrap(); let checked = table.checked(&owner, &cursor, &mut ctx).unwrap().unwrap();
    let owner_locations::OwnerRoute::Fused(binding) = owner_locations::FusedBinding::try_new(checked, &mut ctx).unwrap() else { panic!("real fused root") };
    let parent = binding.root(&mut ctx).unwrap();
    assert!(parent.read_for(&owner, &mut ctx).unwrap().is_some());
    assert!(parent.read_for(&other, &mut ctx).unwrap().is_none());
    let mut changed = Context::ordinary();
    assert!(parent.read_for(&owner, &mut changed).unwrap().is_none());

    // The actual recursive route must enter through carried checked readback
    // after the before-pattern callback, then enter the child's policy body.
    let edge = member(&s, "properties");
    let Value::Object(property_rows) = child(owner.schema_value(), "properties") else { panic!("properties object") };
    let (name, child_schema) = &property_rows[0];
    let mut entry_ctx = Context::catalog();
    let mut frame = fused_preflight_frame(parent, &mut entry_ctx).unwrap();
    let mut keyword = FusedPreflightRoute::<'_, '_>::begin_keyword(&owner, &mut frame, &mut entry_ctx).unwrap();
    let mut path = construction_index::ScopedPreflightPath::new(&Utf16::from("#"), &mut entry_ctx).unwrap();
    let mut seen = BTreeSet::new();
    let trace = Rc::new(RefCell::new(Vec::<String>::new()));
    let owner_trace = trace.clone(); let path_trace = trace.clone(); let call_trace = trace.clone(); let before_trace = trace.clone();
    let result = owner_locations::observe_owner_walk(Box::new(move |e, r, n| owner_trace.borrow_mut().push(format!("{e}:{r}:{n}"))), || {
        construction_index::observe_paths(Box::new(move |e| path_trace.borrow_mut().push(e.to_owned())), ||
            construction_index::observe_scoped_path_calls(Box::new(move |site, _, _| call_trace.borrow_mut().push(format!("scoped:{site}"))), ||
                {
                    let mark = path.mark(&mut entry_ctx)?;
                    path.append(&Utf16::from("properties"), PathKind::RawSchemaStep, &mut entry_ctx)?;
                    *FusedPreflightRoute::<'_, '_>::pathmark(&mut keyword) = Some(mark);
                    FusedPreflightRoute::ensure_keyword(&owner, &mut frame, &mut keyword, edge, &mut entry_ctx)?;
                    FusedPreflightRoute::recurse_ordered(&owner, &mut frame, &mut keyword, edge, 0, child_schema, &mut path, PreflightChildPath::Key(name), None, "https://ps1.test/root", 1, owner.root_keyword_policy, &mut entry_ctx, &mut seen, move |_, _| { before_trace.borrow_mut().push("before-entry".to_owned()); Ok(()) })
                }
            )
        )
    });
    assert!(result.is_ok());
    let trace = trace.borrow();
    let pos = |needle: &str| trace.iter().position(|event| event.starts_with(needle)).unwrap();
    let before = pos("before-entry");
    let (published, child_coord) = trace.iter().enumerate().filter(|(i, event)| *i < before && event.starts_with("ft1-borrowed-child-published:")).last().map(|(i, event)| (i, event.splitn(2, ':').nth(1).unwrap().to_owned())).unwrap();
    let readback = trace.iter().position(|event| event == &format!("ft1-borrowed-readback:{child_coord}")).unwrap();
    let consume = trace.iter().position(|event| event == &format!("ft1-preflight-borrowed-consume:{child_coord}")).unwrap();
    let child_policy = pos("scoped:sp1-preflight-policy-route");
    assert!(published < before && before < readback && readback < consume && consume < child_policy, "child-entry custody order: {trace:?}");
    let keyword_path = pos("sp1-buffer-after-append");
    let keyword_selection = pos("sp1-ordered-selection-performed");
    assert!(keyword_path < keyword_selection, "ordinary branches retain keyword path-first order: {trace:?}");
}

#[test]
fn ps07_pre_effect_cold_denial_retains_real_owned_checked_custody() {
    let s = psr_json(r#"{"allOf":[{"type":"object"}],"properties":{"a":{"type":"integer"}}}"#);
    let owner = psr_bank(&s);
    // This is a separate denial target from the publisher callbacks below: begin
    // with a genuine active FusedChildren frontier and deny the wrapper's first
    // admission, before its first frontier inspection or selection/owner observation.
    let mut retry_ctx = Context::catalog();
    let table = owner.owner_locations.as_ref().unwrap();
    let cursor = table.root(&owner, 0, &mut retry_ctx).unwrap().unwrap();
    let checked = table.checked(&owner, &cursor, &mut retry_ctx).unwrap().unwrap();
    let owner_locations::OwnerRoute::Fused(binding) = owner_locations::FusedBinding::try_new(checked, &mut retry_ctx).unwrap() else { panic!("real fused root") };
    let parent = binding.root(&mut retry_ctx).unwrap();
    let mut frontier = FusedPreflightFrontier::Unattempted;
    let first = owner.preflight_fused_ordered_child(&parent, &mut frontier, member(&s, "allOf"), &mut retry_ctx).unwrap();
    assert!(matches!(first, FusedPreflightSelection::Located(owner_locations::CheckedOwnerLocation::Fused(_))));
    assert!(matches!(&frontier, FusedPreflightFrontier::Active(_)));

    // Two existing-frontier discriminations; no replacement or temporary
    // frontier is created. Branch-local transport is admitted separately.
    let expected = 2;
    let amounts = Rc::new(RefCell::new(Vec::new()));
    let recorded = amounts.clone();
    let mut deny_wrapper = move |amount| {
        recorded.borrow_mut().push(amount);
        Err(EngineError::new("PS1_WRAPPER_DENIAL", Utf16::from("/ps1/wrapper"), "wrapper predebit denied"))
    };
    let mut denied_ctx = Context::catalog().with_host_control(&mut deny_wrapper);
    let owner_events = Rc::new(RefCell::new(Vec::new())); let owner_sink = owner_events.clone();
    let path_events = Rc::new(RefCell::new(Vec::new())); let path_sink = path_events.clone();
    let denied = owner_locations::observe_owner_walk(Box::new(move |e, r, n| owner_sink.borrow_mut().push((e, r, n))), || {
        construction_index::observe_paths(Box::new(move |e| path_sink.borrow_mut().push(e)), ||
            owner.preflight_fused_ordered_child(&parent, &mut frontier, member(&s, "properties"), &mut denied_ctx))
    });
    let error = match denied { Err(error) => error, Ok(_) => panic!("wrapper admission denial must abort before selection") };
    assert!(error.is_control_failure());
    assert_eq!(error.code, "PS1_WRAPPER_DENIAL");
    assert_eq!(error.path, Utf16::from("/ps1/wrapper"));
    assert_eq!(error.message, Utf16::from("wrapper predebit denied"));
    assert_eq!(&*amounts.borrow(), &[expected]);
    assert!(owner_events.borrow().is_empty());
    assert!(path_events.borrow().is_empty());
    assert!(matches!(&frontier, FusedPreflightFrontier::Active(_)));
    drop(denied_ctx);

    let resume_owner_events = Rc::new(RefCell::new(Vec::new())); let resume_owner_sink = resume_owner_events.clone();
    let resume_path_events = Rc::new(RefCell::new(Vec::new())); let resume_path_sink = resume_path_events.clone();
    let resumed = owner_locations::observe_owner_walk(Box::new(move |e, r, n| resume_owner_sink.borrow_mut().push((e, r, n))), || {
        construction_index::observe_paths(Box::new(move |e| resume_path_sink.borrow_mut().push(e)), ||
            owner.preflight_fused_ordered_child(&parent, &mut frontier, member(&s, "properties"), &mut retry_ctx))
    }).unwrap();
    let FusedPreflightSelection::Located(owner_locations::CheckedOwnerLocation::Fused(selected)) = resumed else { panic!("active frontier resumes with the next fused child") };
    assert!(std::ptr::eq(selected.read_for(&owner, &mut retry_ctx).unwrap().unwrap(), child(owner.schema_value(), "properties")));
    assert!(!resume_owner_events.borrow().iter().any(|event| event.0 == "ft1-frontier-publication"));
    assert!(resume_owner_events.borrow().iter().any(|event| event.0 == "ft1-selected-row-read"));
    assert!(resume_path_events.borrow().contains(&"sp1-ordered-selection-performed"));

    // Independent target-layout formulas derived from the branch's actual
    // typed results and publications, not a production fee constant/helper.
    let word = std::mem::size_of::<usize>();
    let lazy_fee = 3 * std::mem::size_of::<Result<Option<owner_locations::FusedChildren<'_, '_>>, EngineError>>().div_ceil(word)
        + 2 * std::mem::size_of::<Option<owner_locations::FusedChildren<'_, '_>>>().div_ceil(word)
        + std::mem::size_of::<FusedPreflightFrontier<'_, '_>>().div_ceil(word) + 3;
    let selected_fee = 3 * std::mem::size_of::<Result<Option<owner_locations::CheckedOwnerLocation<'_, '_>>, EngineError>>().div_ceil(word)
        + 2 * std::mem::size_of::<Option<owner_locations::CheckedOwnerLocation<'_, '_>>>().div_ceil(word)
        + 3 * std::mem::size_of::<FusedPreflightSelection<'_, '_>>().div_ceil(word) + 2;
    for (active, denied_call, branch_fee) in [(false, 1usize, 0usize), (false, 2, lazy_fee), (true, 2, selected_fee)] {
        let mut branch_frontier = FusedPreflightFrontier::Unattempted;
        if active { owner.preflight_fused_ordered_child(&parent, &mut branch_frontier, member(&s, "allOf"), &mut retry_ctx).unwrap(); }
        let branch_amounts = Rc::new(RefCell::new(Vec::new())); let branch_recorded = branch_amounts.clone();
        let mut deny = move |amount| {
            let mut rows = branch_recorded.borrow_mut(); rows.push(amount);
            if rows.len() == denied_call { Err(EngineError::new("PS1_BRANCH_DENIAL", Utf16::from("/ps1/branch"), "branch predebit denied")) } else { Ok(()) }
        };
        let mut branch_ctx = Context::catalog().with_host_control(&mut deny);
        let events = Rc::new(RefCell::new(Vec::new())); let sink = events.clone();
        let paths = Rc::new(RefCell::new(Vec::new())); let path_sink = paths.clone();
        let denied = owner_locations::observe_owner_walk(Box::new(move |e, r, n| sink.borrow_mut().push((e, r, n))), ||
            construction_index::observe_paths(Box::new(move |e| path_sink.borrow_mut().push(e)), ||
                owner.preflight_fused_ordered_child(&parent, &mut branch_frontier, member(&s, "properties"), &mut branch_ctx)));
        let error = match denied { Err(e) => e, Ok(_) => panic!("branch admission must deny before effect") };
        assert!(error.is_control_failure()); assert_eq!(error.path, Utf16::from("/ps1/branch"));
        if denied_call == 1 { assert_eq!(&*branch_amounts.borrow(), &[2]); }
        else { assert_eq!(&*branch_amounts.borrow(), &[2, branch_fee]); }
        assert!(events.borrow().is_empty() && paths.borrow().is_empty());
        drop(branch_ctx);
        if active {
            assert!(matches!(&branch_frontier, FusedPreflightFrontier::Active(_)));
            let next = owner.preflight_fused_ordered_child(&parent, &mut branch_frontier, member(&s, "properties"), &mut retry_ctx).unwrap();
            let FusedPreflightSelection::Located(owner_locations::CheckedOwnerLocation::Fused(next)) = next else { panic!("pre-effect denial retains live walk") };
            assert!(std::ptr::eq(next.read_for(&owner, &mut retry_ctx).unwrap().unwrap(), child(owner.schema_value(), "properties")));
        } else { assert!(matches!(&branch_frontier, FusedPreflightFrontier::Unattempted)); }
    }

    // Admission inside select is different: its existing guard poisons the
    // actual walk, so a later request cannot resume through a forged frontier.
    let mut failed_walk = FusedPreflightFrontier::Unattempted;
    owner.preflight_fused_ordered_child(&parent, &mut failed_walk, member(&s, "allOf"), &mut retry_ctx).unwrap();
    let mut call = 0;
    let mut deny_select = |_| { call += 1; if call == 3 { Err(EngineError::new("PS1_SELECT_DENIAL", Utf16::from("/ps1/select"), "selector guard admission denied")) } else { Ok(()) } };
    let mut select_ctx = Context::catalog().with_host_control(&mut deny_select);
    let error = match owner.preflight_fused_ordered_child(&parent, &mut failed_walk, member(&s, "properties"), &mut select_ctx) { Err(e) => e, Ok(_) => panic!("selector must deny") };
    assert!(error.is_control_failure()); assert_eq!(error.code, "PS1_SELECT_DENIAL"); drop(select_ctx);
    let after = Rc::new(RefCell::new(Vec::new())); let sink = after.clone();
    let missing = owner_locations::observe_owner_walk(Box::new(move |e, r, n| sink.borrow_mut().push((e, r, n))), ||
        owner.preflight_fused_ordered_child(&parent, &mut failed_walk, member(&s, "properties"), &mut retry_ctx)).unwrap();
    assert!(matches!(missing, FusedPreflightSelection::Missing));
    assert!(after.borrow().is_empty());

    // The following deny_at cases target PreflightCold::publish's own two
    // admission boundaries; their callback indices are independent of the
    // wrapper-predebit denial above.
    for deny_at in [1usize,2] {
        let mut retry_ctx=Context::catalog();
        let table=owner.owner_locations.as_ref().unwrap();
        let cursor=table.root(&owner,0,&mut retry_ctx).unwrap().unwrap();
        let checked=table.checked(&owner,&cursor,&mut retry_ctx).unwrap().unwrap();
        let owner_locations::OwnerRoute::Fused(binding)=owner_locations::FusedBinding::try_new(checked,&mut retry_ctx).unwrap() else {panic!("real fused root")};
        let parent=binding.root(&mut retry_ctx).unwrap(); let mut retry_frontier=FusedPreflightFrontier::Unattempted;
        let first=owner.preflight_fused_ordered_child(&parent,&mut retry_frontier,member(&s,"allOf"),&mut retry_ctx).unwrap();
        assert!(matches!(first,FusedPreflightSelection::Located(owner_locations::CheckedOwnerLocation::Fused(_))));
        let mut changed_ctx=Context::ordinary();
        let owned=owner.preflight_fused_ordered_child(&parent,&mut retry_frontier,member(&s,"properties"),&mut changed_ctx).unwrap();
        let FusedPreflightSelection::Located(owner_locations::CheckedOwnerLocation::Owned(owned))=owned else {panic!("real Owned fallback")};
        let calls=Rc::new(std::cell::Cell::new(0usize)); let observed=calls.clone();
        let mut control=move |_| { let n=observed.get()+1; observed.set(n); if n==deny_at { Err(EngineError::new("PS1_HOST_DENIAL",Utf16::from("/cold"),"denied")) } else { Ok(()) } };
        let mut denied=Context::ordinary().with_host_control(&mut control);
        let mut staged=Some(LegacyPreflightKeyword{cursor:None,checked:Some(owned),ordered:None,selected:true,mark:None});
        let result=PreflightCold::publish(&mut staged,&mut denied);
        let error=match result { Err(e)=>e, Ok(_)=>panic!("host refusal required") };
        assert_eq!(error.code,"PS1_HOST_DENIAL"); assert!(staged.is_some());
        drop(denied);
        let mut verify=Context::ordinary();
        assert!(std::ptr::eq(staged.as_ref().unwrap().checked.as_ref().unwrap().read(&owner,&mut verify).unwrap().unwrap(),child(owner.schema_value(),"properties")));
        assert_eq!(calls.get(),deny_at);
    }
    let src=include_str!("schema.rs"); let start=src.find("fn publish(value: &mut Option<T>").unwrap(); let end=src[start..].find("\n    }\n").unwrap()+start;
    let body=&src[start..end]; assert!(body.find("try_reserve_exact(1").unwrap()<body.find("value.take()").unwrap());
    assert!(body.find("ctx.charge_work(words(std::mem::size_of::<Self>()) + requested_capacity_words + 3").unwrap()<body.find("try_reserve_exact(1").unwrap());
    assert!(body.find("ctx.charge_work(lifecycle_words").unwrap()<body.find("value.take()").unwrap());
    let route=src.split("impl<'owner:'binding,'binding> PreflightRoute<'owner,'binding> for FusedPreflightRoute").nth(1).unwrap();
    let route=route.split("impl<'owner:'binding,'binding> PreflightRoute<'owner,'binding> for LegacyPreflightRoute").next().unwrap();
    assert!(route.contains("ctx.charge_work(std::mem::size_of::<LegacyPreflightKeyword<'owner>>().div_ceil(std::mem::size_of::<usize>())+1,Utf16::default())?;"));
}

#[test]
fn ps08_independent_reentry_and_panic_poison_cleanup() {
    let s=psr_json(r#"{"allOf":[{"type":"object"}],"properties":{"a":{"type":"integer"}}}"#);
    let owner=psr_bank(&s); let mut ctx=Context::catalog(); let table=owner.owner_locations.as_ref().unwrap();
    let cursor=table.root(&owner,0,&mut ctx).unwrap().unwrap(); let checked=table.checked(&owner,&cursor,&mut ctx).unwrap().unwrap();
    let owner_locations::OwnerRoute::Fused(binding)=owner_locations::FusedBinding::try_new(checked,&mut ctx).unwrap() else {panic!("real fused root")};
    let parent=binding.root(&mut ctx).unwrap(); let mut frame=fused_preflight_frame(parent,&mut ctx).unwrap();
    let edge=member(&s,"allOf"); let mut keyword=FusedPreflightRoute::<'_, '_>::begin_keyword(&owner,&mut frame,&mut ctx).unwrap();
    FusedPreflightRoute::ensure_keyword(&owner,&mut frame,&mut keyword,edge,&mut ctx).unwrap();
    let Value::Array(items)=child(owner.schema_value(),"allOf") else {panic!("owner allOf array fixture")}; let child_schema=&items[0];
    let mut path=construction_index::ScopedPreflightPath::new(&Utf16::from("#"),&mut ctx).unwrap(); let mut seen=BTreeSet::new(); let inner=psr_json(r#"{"type":"string"}"#);
    let outcome=FusedPreflightRoute::recurse_ordered(&owner,&mut frame,&mut keyword,edge,0,child_schema,&mut path,PreflightChildPath::Index(0),None,"https://ps1.test/root",1,owner.root_keyword_policy,&mut ctx,&mut seen,|_,_|{assert!(CompiledSchema::compile(&inner,&SchemaResources::default(),&mut Context::catalog()).is_ok());Ok(())});
    assert!(outcome.is_ok()); assert_eq!(path.text(),&Utf16::from("#"));
    let mut poisoned=construction_index::ScopedPreflightPath::new(&Utf16::from("#"),&mut ctx).unwrap();
    let result=catch_unwind(AssertUnwindSafe(|| owner.with_preflight_child_path(&mut poisoned,PreflightChildPath::Index(0),&mut ctx,|_,_|panic!("original panic"),|_,_|Ok::<(),EngineError>(()))));
    assert!(result.is_err()); assert!(poisoned.observe().poisoned);

    // Unwinding inside the unchanged selector must poison its in-place walk;
    // the wrapper cannot reset it to an unattempted, resumable state.
    let mut panic_walk = FusedPreflightFrontier::Unattempted;
    owner.preflight_fused_ordered_child(&parent, &mut panic_walk, edge, &mut ctx).unwrap();
    let mut calls = 0;
    let mut panic_select = |_| { calls += 1; if calls == 3 { panic!("selector control panic"); } Ok(()) };
    let mut panic_ctx = Context::catalog().with_host_control(&mut panic_select);
    let panic = catch_unwind(AssertUnwindSafe(|| owner.preflight_fused_ordered_child(&parent, &mut panic_walk, member(&s, "properties"), &mut panic_ctx)));
    assert!(panic.is_err()); drop(panic_ctx);
    assert!(matches!(owner.preflight_fused_ordered_child(&parent, &mut panic_walk, member(&s, "properties"), &mut ctx).unwrap(), FusedPreflightSelection::Missing));
}
