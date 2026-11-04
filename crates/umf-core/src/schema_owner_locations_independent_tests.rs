// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent structural-location controls; SOURCE ONLY / NATIVE UNEXECUTED.
//! Child of schema::owned_plans. H owns production and module wiring.
//! Cursors come only from real admitted owners and the actual table API.
use super::*;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

fn json(source: &str) -> Value {
    crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn admitted(source: &Value, resources: &SchemaResources) -> CompiledSchema {
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| CompiledSchema::compile(source, resources, ctx))
        .unwrap();
    assert!(owner.owner_lineage.is_some());
    assert!(owner.owner_plans.is_some());
    assert!(ctx.schema_construction.is_none());
    // ColdResourceIndex eligibility is deliberately not an owner/table proof.
    owner
}

fn built(owner: &CompiledSchema) -> Arc<OwnerLocations> {
    OwnerLocations::build(owner, &mut Context::catalog())
        .unwrap()
        .expect("small genuinely admitted fixture must be representable")
}

fn tree_readback(
    table: &OwnerLocations,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    original: &Value,
    ctx: &mut Context<'_>,
) -> usize {
    let observed = table.read(owner, cursor, ctx).unwrap().unwrap();
    assert_eq!(observed, original);
    assert!(
        std::ptr::eq(observed, original),
        "actual owner storage readback"
    );
    let children: Vec<&Value> = match original {
        Value::Object(members) => members.iter().map(|(_, v)| v).collect(),
        Value::Array(values) => values.iter().collect(),
        _ => Vec::new(),
    };
    let mut visited = 1;
    for (edge, value) in children.iter().enumerate() {
        let child = table.child(owner, cursor, edge, ctx).unwrap().unwrap();
        visited += tree_readback(table, owner, &child, value, ctx);
    }
    assert!(
        table
            .child(owner, cursor, children.len(), ctx)
            .unwrap()
            .is_none()
    );
    visited
}

fn data_fixture() -> (Value, SchemaResources) {
    let source = json(
        r#"{"type":"object","default":{"a/b~☃":[{"𐀀":[null,true,"x"]},[],{}],"":"empty","a~1b":"distinct"}}"#,
    );
    let resource = json(r#"{"type":"array","default":[{"same":[1,2]},false,null]}"#);
    let resources = SchemaResources {
        entries: vec![
            (
                Utf16::from("https://locations.test/first"),
                resource.clone(),
            ),
            (Utf16::from("https://locations.test/second"), resource),
        ],
    };
    (source, resources)
}

fn sentinel() -> EngineError {
    let mut error = EngineError::new(
        "LOCATION_FIRST_DENIAL",
        Utf16::new(vec![47, 0xd800, 126]),
        "original location host error",
    );
    error.python_message_origin = Some(crate::python_value::PyText::from_utf8("origin-δ"));
    error
}

fn original_error(actual: &EngineError, expected: &EngineError) {
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
}

// Explicit raw-owner expectations remain independent of either resolver body.
fn selected_cursor(
    owner: &CompiledSchema,
    text: &str,
    path: &Utf16,
    scope: Option<&str>,
    expected: &Value,
    expected_path: &str,
) -> OwnerCursor {
    let reference = Value::string_utf8(text);
    let original = owner
        .resolve_ref_unplanned(&reference, path, scope, &mut Context::catalog())
        .unwrap();
    assert_eq!(original.0, expected, "fixture target: {text}");
    assert!(
        std::ptr::eq(original.0, expected),
        "fixture owner role: {text}"
    );
    assert_eq!(
        original.1,
        Utf16::from(expected_path),
        "fixture path: {text}"
    );
    let (target, resolved_path, cursor) = owner
        .resolve_ref_unplanned_located(&reference, path, scope, &mut Context::catalog())
        .unwrap();
    assert_eq!((target, &resolved_path), (original.0, &original.1));
    assert_eq!(target, expected);
    assert!(std::ptr::eq(target, expected));
    assert_eq!(resolved_path, Utf16::from(expected_path));
    let cursor = cursor.expect("real representable owner traversal must carry its selected cursor");
    let table = owner.owner_locations.as_ref().unwrap();
    let read = table
        .read(owner, &cursor, &mut Context::catalog())
        .unwrap()
        .unwrap();
    assert_eq!(read, expected);
    assert!(std::ptr::eq(read, target));
    cursor
}

#[test]
fn pinned_twenty_real_admission_reads_every_root_and_descendant_in_owner_storage() {
    let pinned = json(include_str!("schema_metas.json"));
    let Value::Array(entries) = get(&pinned, "resources").unwrap() else {
        panic!("pinned resources")
    };
    assert_eq!(entries.len(), 20);
    let source =
        json(r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}"#);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        CompiledSchema::compile(&source, &SchemaResources::default(), ctx)?;
        let meta = {
            let state = ctx.schema_construction.as_ref().unwrap().borrow();
            Arc::clone(
                &state
                    .meta_validators
                    .iter()
                    .find(|(_, dialect, _)| *dialect == SchemaDialect::Draft2020_12)
                    .expect("actual production metaschema admission")
                    .2,
            )
        };
        assert!(meta.owner_lineage.is_some());
        assert!(meta.owner_plans.is_some());
        let table = meta
            .owner_locations
            .as_ref()
            .expect("actual installed structural table");
        let cursor = table.root(&meta, 0, ctx)?.unwrap();
        tree_readback(table, &meta, &cursor, &meta.schema, ctx);
        assert_eq!(meta.resources.entries.len(), entries.len());
        for (i, entry) in entries.iter().enumerate() {
            let (id, resource) = &meta.resources.entries[i];
            assert_eq!(&Value::String(id.clone()), get(entry, "id").unwrap());
            assert_eq!(resource, get(entry, "schema").unwrap());
            let cursor = table.root(&meta, i + 1, ctx)?.unwrap();
            tree_readback(table, &meta, &cursor, resource, ctx);
            let text = id.to_utf8().unwrap();
            // This pinned fixture includes the root schema again at role13;
            // the authoritative root identity wins that exact retrieval alias.
            let expected = if text == "https://json-schema.org/draft/2020-12/schema" {
                &*meta.schema
            } else {
                resource
            };
            assert_eq!(expected, get(entry, "schema").unwrap());
            selected_cursor(
                &meta,
                &text,
                &Utf16::from("https://json-schema.org/draft/2020-12/schema#"),
                None,
                expected,
                &format!("{text}#"),
            );
        }
        assert!(table.root(&meta, entries.len() + 1, ctx)?.is_none());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
    // Real resolver-selected cursors are read back above. Warm-cache
    // consumption wiring is separately owned; no reverse-DFS-elimination claim.
}

#[test]
fn object_and_array_ordinals_preserve_unicode_keys_equal_roles_and_nested_id_fallback() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let table = built(&owner);
    let mut ctx = Context::catalog();
    let cursor = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    assert!(tree_readback(&table, &owner, &cursor, &owner.schema, &mut ctx) > 1);
    for (i, (_, resource)) in owner.resources.entries.iter().enumerate() {
        let cursor = table.root(&owner, i + 1, &mut ctx).unwrap().unwrap();
        tree_readback(&table, &owner, &cursor, resource, &mut ctx);
    }
    assert_eq!(owner.resources.entries[0].1, owner.resources.entries[1].1);
    // Relative nested IDs disqualify the cold resource index, not the genuine
    // immutable owner or its raw structural coordinates.
    let nested = json(
        r#"{"$id":"https://locations.test/root","$defs":{"nested":{"$id":"child","$anchor":"leaf","type":"boolean"},"a/b~☃":{"anyOf":[{"type":"integer"},{"type":"string"}]}}}"#,
    );
    let aliased = SchemaResources {
        entries: vec![
            (
                Utf16::from("https://locations.test/retrieval"),
                json(
                    r#"{"$id":"https://locations.test/authored","$defs":{"t":{"type":"string"}}}"#,
                ),
            ),
            (
                Utf16::from("https://locations.test/other"),
                json(r#"{"$id":"https://locations.test/authored","type":"null"}"#),
            ),
            (
                Utf16::from("https://locations.test/a/child"),
                json(r#"{"type":"integer"}"#),
            ),
            (
                Utf16::from("https://locations.test/b/child"),
                json(r#"{"type":"boolean"}"#),
            ),
        ],
    };
    let nested_owner = admitted(&nested, &aliased);
    assert!(nested_owner.cold_resource_index.is_none());
    let nested_table = built(&nested_owner);
    let cursor = nested_table
        .root(&nested_owner, 0, &mut ctx)
        .unwrap()
        .unwrap();
    tree_readback(
        &nested_table,
        &nested_owner,
        &cursor,
        &nested_owner.schema,
        &mut ctx,
    );
    let path = Utf16::from("https://locations.test/root#");
    let nested_target = get(get(&nested_owner.schema, "$defs").unwrap(), "nested").unwrap();
    assert_eq!(
        nested_target,
        &json(r#"{"$id":"child","$anchor":"leaf","type":"boolean"}"#)
    );
    for text in ["child", "child#leaf"] {
        selected_cursor(
            &nested_owner,
            text,
            &path,
            None,
            nested_target,
            "https://locations.test/child#",
        );
    }
    let definitions = get(&nested_owner.schema, "$defs").unwrap();
    let alternatives = get(get(definitions, "a/b~☃").unwrap(), "anyOf").unwrap();
    let Value::Array(alternatives) = alternatives else {
        panic!("authored alternatives")
    };
    assert_eq!(alternatives[1], json(r#"{"type":"string"}"#));
    selected_cursor(
        &nested_owner,
        "#/$defs/a~1b~0%E2%98%83/anyOf/1",
        &path,
        None,
        &alternatives[1],
        "https://locations.test/root#/$defs/a~1b~0☃/anyOf/1",
    );
    let retrieved = &nested_owner.resources.entries[0].1;
    for (text, expected_path) in [
        (
            "https://locations.test/retrieval",
            "https://locations.test/retrieval#",
        ),
        (
            "https://locations.test/authored",
            "https://locations.test/authored#",
        ),
    ] {
        selected_cursor(&nested_owner, text, &path, None, retrieved, expected_path);
    }
    let leaf = get(get(retrieved, "$defs").unwrap(), "t").unwrap();
    assert_eq!(leaf, &json(r#"{"type":"string"}"#));
    selected_cursor(
        &nested_owner,
        "https://locations.test/retrieval#/$defs/t",
        &path,
        None,
        leaf,
        "https://locations.test/retrieval#/$defs/t",
    );
    for (i, scope, expected_path) in [
        (
            2,
            "https://locations.test/a/",
            "https://locations.test/a/child#",
        ),
        (
            3,
            "https://locations.test/b/",
            "https://locations.test/b/child#",
        ),
    ] {
        selected_cursor(
            &nested_owner,
            "child",
            &path,
            Some(scope),
            &nested_owner.resources.entries[i].1,
            expected_path,
        );
    }
    let mut reverse = aliased.clone();
    reverse.entries.reverse();
    let reversed = admitted(&nested, &reverse);
    assert!(reversed.cold_resource_index.is_none());
    assert_eq!(
        reversed.resources.entries[2].1,
        json(r#"{"$id":"https://locations.test/authored","type":"null"}"#)
    );
    selected_cursor(
        &reversed,
        "https://locations.test/authored",
        &path,
        None,
        &reversed.resources.entries[2].1,
        "https://locations.test/authored#",
    );
    // Exact retrieval still selects its own role despite the authored collision.
    selected_cursor(
        &reversed,
        "https://locations.test/retrieval",
        &path,
        None,
        &reversed.resources.entries[3].1,
        "https://locations.test/retrieval#",
    );
}

#[test]
fn owner_move_keeps_coordinates_live_while_public_clone_drops_lineage_authority() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let table = built(&owner);
    let mut ctx = Context::catalog();
    let cursor = selected_cursor(
        &owner,
        "https://locations.test/first",
        &Utf16::from("#"),
        None,
        &owner.resources.entries[0].1,
        "https://locations.test/first#",
    );
    let moved = Box::new(owner);
    tree_readback(
        &table,
        &moved,
        &cursor,
        &moved.resources.entries[0].1,
        &mut ctx,
    );
    let after_move = selected_cursor(
        &moved,
        "https://locations.test/first",
        &Utf16::from("#"),
        None,
        &moved.resources.entries[0].1,
        "https://locations.test/first#",
    );
    assert!(std::ptr::eq(
        table.read(&moved, &cursor, &mut ctx).unwrap().unwrap(),
        table.read(&moved, &after_move, &mut ctx).unwrap().unwrap()
    ));
    let cloned = (*moved).clone();
    let reference = Value::string_utf8("https://locations.test/first");
    let original = cloned
        .resolve_ref_unplanned(&reference, &Utf16::from("#"), None, &mut ctx)
        .unwrap();
    let located = cloned
        .resolve_ref_unplanned_located(&reference, &Utf16::from("#"), None, &mut ctx)
        .unwrap();
    assert_eq!((located.0, located.1), original);
    assert_eq!(located.0, &cloned.resources.entries[0].1);
    assert!(
        located.2.is_none(),
        "absent optional lineage preserves acceptance"
    );
    assert!(cloned.owner_lineage.is_none());
    assert!(cloned.owner_locations.is_none());
    assert!(OwnerLocations::build(&cloned, &mut ctx).unwrap().is_none());
    assert!(table.root(&cloned, 1, &mut ctx).unwrap().is_none());
    assert!(table.read(&cloned, &cursor, &mut ctx).unwrap().is_none());
    assert!(
        table
            .child(&cloned, &cursor, 0, &mut ctx)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        moved.validate(&json(r#"{}"#), &mut ctx).unwrap(),
        cloned.validate(&json(r#"{}"#), &mut ctx).unwrap()
    );
    drop(moved);
    assert!(table.read(&cloned, &cursor, &mut ctx).unwrap().is_none());
}

#[test]
fn foreign_lineages_and_reordered_catalogues_cannot_reuse_identical_ordinals() {
    let (source, resources) = data_fixture();
    let first = admitted(&source, &resources);
    let equal = admitted(&source, &resources);
    let a = built(&first);
    let b = built(&equal);
    let mut ctx = Context::catalog();
    let ca = selected_cursor(
        &first,
        "https://locations.test/first",
        &Utf16::from("#"),
        None,
        &first.resources.entries[0].1,
        "https://locations.test/first#",
    );
    let cb = selected_cursor(
        &equal,
        "https://locations.test/first",
        &Utf16::from("#"),
        None,
        &equal.resources.entries[0].1,
        "https://locations.test/first#",
    );
    assert_eq!(
        a.read(&first, &ca, &mut ctx).unwrap(),
        b.read(&equal, &cb, &mut ctx).unwrap()
    );
    assert!(a.read(&equal, &ca, &mut ctx).unwrap().is_none());
    assert!(a.read(&first, &cb, &mut ctx).unwrap().is_none());
    assert!(b.child(&equal, &ca, 0, &mut ctx).unwrap().is_none());
    assert!(a.root(&equal, 1, &mut ctx).unwrap().is_none());
    let resources = SchemaResources {
        entries: vec![
            (
                Utf16::from("https://locations.test/one"),
                json(r#"{"type":"integer"}"#),
            ),
            (
                Utf16::from("https://locations.test/two"),
                json(r#"{"type":"string"}"#),
            ),
        ],
    };
    let ordered = admitted(&source, &resources);
    let mut reverse_resources = resources.clone();
    reverse_resources.entries.reverse();
    let reversed = admitted(&source, &reverse_resources);
    let ordered_table = built(&ordered);
    let reversed_table = built(&reversed);
    let old = ordered_table.root(&ordered, 1, &mut ctx).unwrap().unwrap();
    let new = reversed_table
        .root(&reversed, 1, &mut ctx)
        .unwrap()
        .unwrap();
    assert_ne!(
        ordered_table.read(&ordered, &old, &mut ctx).unwrap(),
        reversed_table.read(&reversed, &new, &mut ctx).unwrap()
    );
    assert!(
        reversed_table
            .read(&reversed, &old, &mut ctx)
            .unwrap()
            .is_none()
    );
    for owner in [&ordered, &reversed] {
        let table = built(owner);
        for (i, (_, resource)) in owner.resources.entries.iter().enumerate() {
            let cursor = table.root(owner, i + 1, &mut ctx).unwrap().unwrap();
            tree_readback(&table, owner, &cursor, resource, &mut ctx);
        }
    }
    // Real successful reference/evaluation plans retain the authoritative
    // resolver cursor; a second call must consume those same published plans.
    let warm = admitted(
        &json(r#"{"$id":"https://locations.test/cache","$defs":{"t":{"type":"integer"}}}"#),
        &SchemaResources::default(),
    );
    let foreign = admitted(
        &json(r#"{"$id":"https://locations.test/cache","$defs":{"t":{"type":"string"}}}"#),
        &SchemaResources::default(),
    );
    let cache = warm.owner_plans.as_ref().unwrap();
    let reference = Value::string_utf8("#/$defs/t");
    let Value::String(text) = &reference else {
        unreachable!()
    };
    let diagnostic = Utf16::from("https://locations.test/cache#/independent-use/$ref");
    let expected_path = Utf16::from("https://locations.test/cache#/$defs/t");
    let expected = get(get(&warm.schema, "$defs").unwrap(), "t").unwrap();
    assert_eq!(expected, &json(r#"{"type":"integer"}"#));
    let key = (diagnostic.clone(), text.clone(), None);
    let first = cache
        .resolve_located(&warm, &reference, &diagnostic, None, &mut ctx)
        .unwrap();
    assert_eq!((first.0, &first.1), (expected, &expected_path));
    let cursor = first.2.expect("actual reference plan location");
    let published = cache.references.lock().unwrap().get(&key).cloned().unwrap();
    assert!(std::ptr::eq(
        published.target.get(&warm, &mut ctx).unwrap(),
        expected
    ));
    for _ in 0..2 {
        let actual = cache
            .resolve_located(&warm, &reference, &diagnostic, None, &mut ctx)
            .unwrap();
        assert_eq!((actual.0, &actual.1), (expected, &expected_path));
        let returned = actual.2.unwrap();
        assert!(std::ptr::eq(
            warm.owner_locations
                .as_ref()
                .unwrap()
                .read(&warm, &returned, &mut ctx)
                .unwrap()
                .unwrap(),
            expected
        ));
        assert!(Arc::ptr_eq(
            &published,
            &cache.references.lock().unwrap().get(&key).cloned().unwrap()
        ));
    }
    let eval_key = (diagnostic.clone(), text.clone());
    let original = warm
        .resolve_eval_ref_unplanned(&reference, &diagnostic, &mut ctx)
        .unwrap();
    assert_eq!(original, (expected, expected_path.clone(), true));
    let first_eval = cache
        .resolve_eval_located(&warm, &reference, &diagnostic, &mut ctx)
        .unwrap();
    assert_eq!(
        (first_eval.0, &first_eval.1, first_eval.2),
        (expected, &expected_path, true)
    );
    let eval_cursor = first_eval.3.unwrap();
    assert!(std::ptr::eq(
        warm.owner_locations
            .as_ref()
            .unwrap()
            .read(&warm, &eval_cursor, &mut ctx)
            .unwrap()
            .unwrap(),
        expected
    ));
    let evaluated = cache
        .evaluations
        .lock()
        .unwrap()
        .get(&eval_key)
        .cloned()
        .unwrap();
    assert!(std::ptr::eq(
        evaluated.target.get(&warm, &mut ctx).unwrap(),
        expected
    ));
    for _ in 0..2 {
        let actual = cache
            .resolve_eval_located(&warm, &reference, &diagnostic, &mut ctx)
            .unwrap();
        assert_eq!(
            (actual.0, &actual.1, actual.2),
            (expected, &expected_path, true)
        );
        assert!(std::ptr::eq(
            warm.owner_locations
                .as_ref()
                .unwrap()
                .read(&warm, &actual.3.unwrap(), &mut ctx)
                .unwrap()
                .unwrap(),
            expected
        ));
        assert!(Arc::ptr_eq(
            &evaluated,
            &cache
                .evaluations
                .lock()
                .unwrap()
                .get(&eval_key)
                .cloned()
                .unwrap()
        ));
    }
    let node = cache
        .node_at(
            &warm,
            expected,
            &expected_path,
            true,
            Some(&cursor),
            &mut ctx,
        )
        .unwrap()
        .unwrap();
    assert_eq!(node.keywords, vec![Some("type".to_owned())]);
    assert!(!node.has_ref);
    assert!(std::ptr::eq(
        node.locator.get(&warm, &mut ctx).unwrap(),
        expected
    ));
    let frame_oracle = warm
        .effective_frame_unplanned(expected, &expected_path, true, &mut ctx)
        .unwrap();
    assert_eq!(frame_oracle, expected_path);
    assert_eq!(
        cache
            .frame_at(
                &warm,
                expected,
                &expected_path,
                true,
                Some(&cursor),
                &mut ctx
            )
            .unwrap(),
        expected_path
    );
    let frame = cache
        .frames
        .lock()
        .unwrap()
        .get(&(expected_path.clone(), true))
        .cloned()
        .unwrap();
    for _ in 0..2 {
        let actual = cache
            .node_at(
                &warm,
                expected,
                &expected_path,
                true,
                Some(&eval_cursor),
                &mut ctx,
            )
            .unwrap()
            .unwrap();
        assert!(Arc::ptr_eq(&node, &actual));
        assert_eq!(
            cache
                .frame_at(
                    &warm,
                    expected,
                    &expected_path,
                    true,
                    Some(&eval_cursor),
                    &mut ctx
                )
                .unwrap(),
            expected_path
        );
        assert!(Arc::ptr_eq(
            &frame,
            &cache
                .frames
                .lock()
                .unwrap()
                .get(&(expected_path.clone(), true))
                .cloned()
                .unwrap()
        ));
    }
    let foreign_expected = get(get(&foreign.schema, "$defs").unwrap(), "t").unwrap();
    assert_eq!(foreign_expected, &json(r#"{"type":"string"}"#));
    let foreign_cursor = selected_cursor(
        &foreign,
        "#/$defs/t",
        &diagnostic,
        None,
        foreign_expected,
        "https://locations.test/cache#/$defs/t",
    );
    assert!(
        cache
            .node_at(
                &warm,
                expected,
                &expected_path,
                true,
                Some(&foreign_cursor),
                &mut ctx
            )
            .unwrap()
            .is_none()
    );
    assert_eq!(
        cache
            .frame_at(
                &warm,
                expected,
                &expected_path,
                true,
                Some(&foreign_cursor),
                &mut ctx
            )
            .unwrap(),
        frame_oracle
    );
    let foreign_original = foreign
        .resolve_ref_unplanned(&reference, &diagnostic, None, &mut ctx)
        .unwrap();
    assert_eq!(foreign_original, (foreign_expected, expected_path.clone()));
    let no_reuse = cache
        .resolve_located(&foreign, &reference, &diagnostic, None, &mut ctx)
        .unwrap();
    assert_eq!((no_reuse.0, no_reuse.1), foreign_original);
    assert!(
        no_reuse.2.is_none(),
        "foreign plan binding uses original semantic fallback"
    );
    let no_reuse = cache
        .resolve_eval_located(&foreign, &reference, &diagnostic, &mut ctx)
        .unwrap();
    assert_eq!(
        (no_reuse.0, no_reuse.1, no_reuse.2),
        (foreign_expected, expected_path.clone(), true)
    );
    assert!(no_reuse.3.is_none());
    assert!(
        cache
            .node_at(
                &foreign,
                foreign_expected,
                &expected_path,
                true,
                Some(&foreign_cursor),
                &mut ctx
            )
            .unwrap()
            .is_none()
    );
    assert_eq!(
        cache
            .frame_at(
                &foreign,
                foreign_expected,
                &expected_path,
                true,
                Some(&foreign_cursor),
                &mut ctx
            )
            .unwrap(),
        expected_path
    );
    assert!(Arc::ptr_eq(
        &published,
        &cache.references.lock().unwrap().get(&key).cloned().unwrap()
    ));
    assert!(Arc::ptr_eq(
        &evaluated,
        &cache
            .evaluations
            .lock()
            .unwrap()
            .get(&eval_key)
            .cloned()
            .unwrap()
    ));
}

#[test]
fn real_policy_origin_and_representation_limits_use_fallback_without_transferring_proof() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let table = built(&owner);
    let mut limits = Context::catalog().limits();
    limits.max_values = resources.entries.len(); // fewer than required root slots
    let mut bounded =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let events = RefCell::new(Vec::new());
    assert!(
        OwnerLocations::build_with_events(&owner, &mut bounded, |event| events
            .borrow_mut()
            .push(event))
        .unwrap()
        .is_none()
    );
    assert!(
        events.borrow().is_empty(),
        "unrepresentable root set reserves nothing"
    );
    let mut limits = Context::catalog().limits();
    limits.max_depth = 1;
    let mut bounded =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    assert!(
        OwnerLocations::build(&owner, &mut bounded)
            .unwrap()
            .is_none()
    );
    let mut ctx = Context::catalog();
    let root = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    let Value::Object(members) = &*owner.schema else {
        panic!("fixture object")
    };
    let default_edge = members
        .iter()
        .position(|(k, _)| k == &Utf16::from("default"))
        .unwrap();
    let default = table
        .child(&owner, &root, default_edge, &mut ctx)
        .unwrap()
        .unwrap();
    let deep = table.child(&owner, &default, 0, &mut ctx).unwrap().unwrap();
    let mut values_limit = Context::catalog().limits();
    values_limit.max_values = 1;
    let mut values_bounded =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, values_limit).unwrap();
    assert_eq!(
        table.read(&owner, &root, &mut values_bounded).unwrap(),
        Some(&*owner.schema)
    );
    assert!(
        table
            .read(&owner, &deep, &mut values_bounded)
            .unwrap()
            .is_none()
    );
    assert!(table.read(&owner, &deep, &mut bounded).unwrap().is_none());
    let reference = Value::string_utf8("#/default/a~1b~0%E2%98%83/0");
    let expected = owner
        .resolve_ref_unplanned(&reference, &Utf16::from("#"), None, &mut Context::catalog())
        .unwrap();
    let located = owner
        .resolve_ref_unplanned_located(&reference, &Utf16::from("#"), None, &mut bounded)
        .unwrap();
    let Value::Array(data) = get(get(&owner.schema, "default").unwrap(), "a/b~☃").unwrap() else {
        panic!("fixture array")
    };
    assert_eq!(located.0, &data[0]);
    assert_eq!(located.1, Utf16::from("#/default/a~1b~0☃/0"));
    assert_eq!((located.0, located.1), expected);
    assert!(
        located.2.is_none(),
        "depth-bounded cursor fallback cannot reject original target"
    );

    assert!(
        table
            .child(&owner, &default, 0, &mut bounded)
            .unwrap()
            .is_none()
    );
    ctx.with_codegen_construction(|ctx| {
        let inactive = CompiledSchema::compile_inner(
            &source,
            &resources,
            SchemaDialect::Draft2020_12,
            true,
            RegexProfile::Ecma262Unicode,
            true,
            false,
            false,
            true,
            KeywordPolicy {
                validation: false,
                ..KeywordPolicy::DRAFT2020
            },
            ctx,
        )?;
        assert!(inactive.owner_lineage.is_none());
        assert!(OwnerLocations::build(&inactive, ctx)?.is_none());
        assert!(table.root(&inactive, 0, ctx)?.is_none());
        assert!(table.read(&inactive, &root, ctx)?.is_none());
        assert!(inactive.validate(&Value::Bool(true), ctx)?.is_empty());
        assert!(!owner.validate(&Value::Bool(true), ctx)?.is_empty());
        let python_source = crate::python_value::python_from_core_value(&source, ctx)?;
        let python = CompiledSchema::compile_python_source(
            &python_source,
            &crate::python_value::PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            ctx,
        )?;
        assert!(python.compiled.owner_lineage.is_none());
        assert!(!python.compiled.python_text_origins.is_empty());
        assert!(OwnerLocations::build(&python.compiled, ctx)?.is_none());
        assert!(table.root(&python.compiled, 0, ctx)?.is_none());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
}

#[test]
fn out_of_range_roles_edges_and_scalar_children_return_none_without_another_read() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let table = built(&owner);
    let mut ctx = Context::catalog();
    for role in [owner.resources.entries.len() + 1, usize::MAX] {
        assert!(table.root(&owner, role, &mut ctx).unwrap().is_none());
    }
    let root = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    let Value::Object(members) = &*owner.schema else {
        panic!("fixture object")
    };
    for edge in [members.len(), usize::MAX] {
        assert!(
            table
                .child(&owner, &root, edge, &mut ctx)
                .unwrap()
                .is_none()
        );
    }
    let type_edge = members
        .iter()
        .position(|(k, _)| k == &Utf16::from("type"))
        .unwrap();
    let scalar = table
        .child(&owner, &root, type_edge, &mut ctx)
        .unwrap()
        .unwrap();
    assert_eq!(
        table.read(&owner, &scalar, &mut ctx).unwrap(),
        Some(&Value::string_utf8("object"))
    );
    assert!(table.child(&owner, &scalar, 0, &mut ctx).unwrap().is_none());
    tree_readback(&table, &owner, &root, &owner.schema, &mut ctx);
}

#[test]
fn each_real_reserve_and_publication_gate_denies_before_its_event_and_stays_terminal() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
    let callbacks = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut observe = |_| {
        callbacks.set(callbacks.get() + 1);
        Ok(())
    };
    let complete = OwnerLocations::build_with_events(
        &owner,
        &mut Context::catalog().with_host_control(&mut observe),
        |event| trace.borrow_mut().push((event, callbacks.get())),
    )
    .unwrap()
    .unwrap();
    let root = complete
        .root(&owner, 0, &mut Context::catalog())
        .unwrap()
        .unwrap();
    assert_eq!(
        complete
            .read(&owner, &root, &mut Context::catalog())
            .unwrap(),
        Some(&*owner.schema)
    );
    let trace = trace.into_inner();
    for site in ["roots-reserve", "nodes-reserve", "edges-reserve", "publish"] {
        let deny_at = trace
            .iter()
            .find(|(event, _)| *event == site)
            .expect("real event must be reached")
            .1;
        let calls = Cell::new(0usize);
        let error = sentinel();
        let events = RefCell::new(Vec::new());
        let mut control = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == deny_at {
                Err(error.clone())
            } else {
                Ok(())
            }
        };
        let phase = Cell::new("outer-site");
        let role = Cell::new("outer-role");
        let mut ctx = Context::catalog()
            .with_host_control(&mut control)
            .with_work_phase_observer(&phase)
            .with_constructor_root_observer(&role);
        let failure = OwnerLocations::build_with_events(&owner, &mut ctx, |event| {
            events.borrow_mut().push((event, calls.get()))
        })
        .unwrap_err();
        original_error(&failure, &error);
        assert_eq!(calls.get(), deny_at, "no callback after first denial");
        let expected: Vec<_> = trace
            .iter()
            .copied()
            .filter(|(_, charge)| *charge < deny_at)
            .collect();
        assert_eq!(
            *events.borrow(),
            expected,
            "denied precharge cannot reach effect event"
        );
        assert_eq!(phase.get(), "outer-site");
        assert_eq!(role.get(), "outer-role");
        assert!(ctx.schema_construction.is_none());
        assert!(Arc::ptr_eq(
            owner.owner_locations.as_ref().unwrap(),
            &installed
        ));
    }
}

#[test]
fn reentry_and_unwind_restore_context_and_never_expose_an_in_progress_table() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let other = admitted(
        &json(r#"{"type":"boolean","default":[false,true]}"#),
        &SchemaResources::default(),
    );
    let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
    let reentered = Cell::new(false);
    let mut control = |_| {
        if !reentered.replace(true) {
            for target in [&owner, &other] {
                let nested = built(target);
                let mut inner = Context::catalog();
                let root = nested.root(target, 0, &mut inner).unwrap().unwrap();
                tree_readback(&nested, target, &root, &target.schema, &mut inner);
                assert!(inner.schema_construction.is_none());
            }
        }
        Ok(())
    };
    let events = RefCell::new(Vec::new());
    let table = OwnerLocations::build_with_events(
        &owner,
        &mut Context::catalog().with_host_control(&mut control),
        |event| {
            assert!(Arc::ptr_eq(
                owner.owner_locations.as_ref().unwrap(),
                &installed
            ));
            let mut read_ctx = Context::catalog();
            let root = installed.root(&owner, 0, &mut read_ctx).unwrap().unwrap();
            assert!(std::ptr::eq(
                installed
                    .read(&owner, &root, &mut read_ctx)
                    .unwrap()
                    .unwrap(),
                &*owner.schema
            ));
            events.borrow_mut().push(event);
        },
    )
    .unwrap()
    .unwrap();
    assert!(reentered.get());
    assert_eq!(events.borrow().last(), Some(&"publish"));
    let phase = Cell::new("caller-phase");
    let role = Cell::new("caller-role");
    let armed = Cell::new(false);
    let denied_calls = Cell::new(0usize);
    let mut deny = |_| {
        if armed.get() {
            denied_calls.set(denied_calls.get() + 1);
            Err(sentinel())
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog()
        .with_host_control(&mut deny)
        .with_work_phase_observer(&phase)
        .with_constructor_root_observer(&role);
    ctx.with_codegen_construction(|outer| {
        let prior = Rc::clone(outer.schema_construction.as_ref().unwrap());
        let failure = outer
            .with_codegen_construction(|inner| {
                assert!(inner.in_codegen_construction());
                armed.set(true);
                OwnerLocations::build(&owner, inner)?;
                Ok(())
            })
            .unwrap_err();
        armed.set(false);
        original_error(&failure, &sentinel());
        assert_eq!(denied_calls.get(), 1, "no callback after nested denial");
        assert!(Rc::ptr_eq(
            outer.schema_construction.as_ref().unwrap(),
            &prior
        ));
        let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            outer.with_codegen_construction(|inner| {
                OwnerLocations::build_with_events(&owner, inner, |event| {
                    if event == "nodes-reserve" {
                        panic!("owned test unwind after precharge");
                    }
                })
            })
        }));
        assert!(unwind.is_err());
        assert!(Rc::ptr_eq(
            outer.schema_construction.as_ref().unwrap(),
            &prior
        ));
        assert_eq!(phase.get(), "caller-phase");
        assert_eq!(role.get(), "caller-role");
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
    assert_eq!(phase.get(), "caller-phase");
    assert_eq!(role.get(), "caller-role");
    let root = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    tree_readback(&table, &owner, &root, &owner.schema, &mut ctx);
}

#[test]
fn root_child_and_read_refusals_keep_original_error_and_stop_callbacks_immediately() {
    let (source, resources) = data_fixture();
    let owner = admitted(&source, &resources);
    let table = built(&owner);
    let root = table
        .root(&owner, 0, &mut Context::catalog())
        .unwrap()
        .unwrap();
    for operation in ["root", "child", "read"] {
        let calls = Cell::new(0usize);
        let error = sentinel();
        let mut deny = |_| {
            calls.set(calls.get() + 1);
            Err(error.clone())
        };
        let phase = Cell::new("caller-phase");
        let role = Cell::new("caller-role");
        let mut ctx = Context::catalog()
            .with_host_control(&mut deny)
            .with_work_phase_observer(&phase)
            .with_constructor_root_observer(&role);
        let failed = match operation {
            "root" => table.root(&owner, 0, &mut ctx).map(|_| ()),
            "child" => table.child(&owner, &root, 0, &mut ctx).map(|_| ()),
            "read" => table.read(&owner, &root, &mut ctx).map(|_| ()),
            _ => unreachable!(),
        }
        .unwrap_err();
        original_error(&failed, &error);
        assert_eq!(calls.get(), 1);
        assert_eq!(phase.get(), "caller-phase");
        assert_eq!(role.get(), "caller-role");
    }
}
