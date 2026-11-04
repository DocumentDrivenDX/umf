// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY. Integrate as a separate cfg(test) child of schema.rs.
//! No new production seam: real compile/validate, compared with unscoped route.
use super::*;
use std::cell::{Cell, RefCell};

fn json(text: &str) -> Value {
    crate::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn resources(fourth: bool) -> SchemaResources {
    let mut entries = vec![
        (
            Utf16::from("https://controls.test/retrieval"),
            json(r#"{"$id":"https://controls.test/authored","type":"integer"}"#),
        ),
        (
            Utf16::from("https://controls.test/b"),
            json(r#"{"type":"boolean"}"#),
        ),
        (
            Utf16::from("https://controls.test/c"),
            json(r#"{"type":"string"}"#),
        ),
    ];
    if fourth {
        entries.push((
            Utf16::from("https://controls.test/d"),
            json(r#"{"type":"null"}"#),
        ));
    }
    SchemaResources { entries }
}
fn compare(schema: &Value, catalogue: &SchemaResources, samples: &[(&str, bool)]) {
    let old = CompiledSchema::compile(schema, catalogue, &mut Context::catalog()).unwrap();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let indexed = CompiledSchema::compile(schema, catalogue, ctx)?;
        assert_eq!(indexed.schema_value(), schema);
        for (text, valid) in samples {
            let instance = json(text);
            let expected = old.validate(&instance, &mut Context::catalog())?;
            let actual = indexed.validate(&instance, ctx)?;
            assert_eq!(&actual, &expected, "complete ordered errors for {text}");
            assert_eq!(actual.is_empty(), *valid, "independent validity for {text}");
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn three_and_four_resource_catalogues_keep_retrieval_and_authored_identity() {
    let root = json(r#"{"$ref":"https://controls.test/retrieval"}"#);
    let three = resources(false);
    let four = resources(true);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let a = CompiledSchema::compile(&root, &three, ctx)?;
        let b = CompiledSchema::compile(&root, &four, ctx)?;
        assert_eq!(a.resources.entries.len(), 3);
        assert_eq!(b.resources.entries.len(), 4);
        match (&a.resources, &b.resources) {
            (SchemaBacking::Shared(a), SchemaBacking::Shared(b)) => assert!(!Arc::ptr_eq(a, b)),
            _ => panic!("construction must admit actual catalogue backing"),
        }
        for (uri, count) in [
            ("https://controls.test/authored", 3),
            ("https://controls.test/d", 4),
        ] {
            let s = Value::Object(vec![(Utf16::from("$ref"), Value::string_utf8(uri))]);
            let cat = if count == 3 { &three } else { &four };
            let c = CompiledSchema::compile(&s, cat, ctx)?;
            assert!(c
                .validate(
                    &if count == 3 {
                        Value::Number(3.0)
                    } else {
                        Value::Null
                    },
                    ctx
                )?
                .is_empty());
        }
        let missing = json(r#"{"$ref":"https://controls.test/d"}"#);
        assert_eq!(
            CompiledSchema::compile(&missing, &three, ctx)
                .unwrap_err()
                .code,
            "SCHEMA_REF_UNRESOLVED"
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn catalogue_order_shared_authored_ids_and_duplicate_retrieval_keys_keep_existing_rules() {
    let retrieval = json(r#"{"$ref":"https://controls.test/retrieval"}"#);
    let authored = json(r#"{"$ref":"https://controls.test/authored"}"#);
    let mut shared_id = resources(true);
    // Distinct retrieval keys may advertise the same authored ID. Existing
    // ordered embedded-resource lookup selects the FIRST matching authored ID.
    shared_id.entries.push((
        Utf16::from("https://controls.test/other"),
        json(r#"{"$id":"https://controls.test/authored","type":"string"}"#),
    ));
    compare(&authored, &shared_id, &[("2", true), (r#""text""#, false)]);
    compare(&retrieval, &shared_id, &[("2", true), (r#""text""#, false)]);
    shared_id.entries.reverse();
    compare(&authored, &shared_id, &[("2", false), (r#""text""#, true)]);
    // Exact retrieval-key lookup has priority over authored-ID discovery.
    compare(&retrieval, &shared_id, &[("2", true), (r#""text""#, false)]);

    // SCHEMA_ID_CONFLICT applies to conflicting contents under the SAME
    // catalogue retrieval key, not the shared authored-ID case above.
    let mut conflict = resources(true);
    conflict.entries.push((
        Utf16::from("https://controls.test/retrieval"),
        json(r#"{"type":"string"}"#),
    ));
    for scoped in [false, true] {
        let mut ctx = Context::catalog();
        let result = if scoped {
            ctx.with_codegen_construction(|ctx| CompiledSchema::compile(&retrieval, &conflict, ctx))
        } else {
            CompiledSchema::compile(&retrieval, &conflict, &mut ctx)
        };
        assert_eq!(result.unwrap_err().code, "SCHEMA_ID_CONFLICT");
    }
}

#[test]
fn combinator_annotations_are_branch_local_and_errors_keep_order_and_escaped_paths() {
    let empty = SchemaResources::default();
    for keyword in ["anyOf", "oneOf"] {
        let s = json(&format!(
            r#"{{"type":"object","{keyword}":[{{"required":["a"],"properties":{{"a":{{"type":"integer"}}}}}},{{"required":["b"],"properties":{{"b":{{"type":"string"}}}}}}],"unevaluatedProperties":false}}"#
        ));
        compare(
            &s,
            &empty,
            &[
                (r#"{"a":1}"#, true),
                (r#"{"b":"ok"}"#, true),
                (r#"{"a":"wrong","b":"ok"}"#, false),
                (r#"{"other":1}"#, false),
            ],
        );
    }
    compare(
        &json(
            r#"{"anyOf":[{"prefixItems":[{"type":"integer"}]},{"prefixItems":[{"type":"string"}]}],"unevaluatedItems":false}"#,
        ),
        &empty,
        &[
            ("[1]", true),
            (r#"["s"]"#, true),
            ("[true]", false),
            ("[1,2]", false),
        ],
    );
    let schema = json(
        r#"{"type":"object","properties":{"a/~😀":{"type":"integer"},"z":{"type":"boolean"}}}"#,
    );
    let instance = json(r#"{"a/~😀":"wrong","z":0}"#);
    compare(&schema, &empty, &[(r#"{"a/~😀":"wrong","z":0}"#, false)]);
    let compiled = CompiledSchema::compile(&schema, &empty, &mut Context::catalog()).unwrap();
    let errors = compiled
        .validate(&instance, &mut Context::catalog())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|e| e.instance_path.clone())
            .collect::<Vec<_>>(),
        vec![Utf16::from("/a~1~0😀"), Utf16::from("/z")]
    );
}

#[test]
fn dynamic_scope_rebinds_recursive_target_without_leaking_between_siblings() {
    let tree = json(
        r##"{"$id":"https://controls.test/tree","$dynamicAnchor":"node","type":"object","properties":{"value":{"type":"integer"},"children":{"type":"array","items":{"$dynamicRef":"#node"}}}}"##,
    );
    let cat = SchemaResources {
        entries: vec![(Utf16::from("https://controls.test/tree"), tree)],
    };
    let strict = json(
        r#"{"$id":"https://controls.test/strict","$dynamicAnchor":"node","$ref":"https://controls.test/tree","unevaluatedProperties":false}"#,
    );
    compare(
        &strict,
        &cat,
        &[
            (r#"{"value":1,"children":[{"value":2}]}"#, true),
            (r#"{"children":[{"extra":true}]}"#, false),
            (r#"{"children":[{"value":"bad"},{"value":3}]}"#, false),
        ],
    );
    let loose = json(r#"{"$ref":"https://controls.test/tree"}"#);
    compare(&loose, &cat, &[(r#"{"children":[{"extra":true}]}"#, true)]);
}

#[test]
fn effective_schema_depth_limit_still_applies_after_successful_indexed_evaluation() {
    let schema = json(r#"{"allOf":[{"type":"integer"}]}"#);
    // Scalar input has depth zero. The bound must be reached by schema
    // evaluation descending into allOf, not by rejecting a nested input tree.
    let instance = Value::Number(1.0);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let compiled = CompiledSchema::compile(&schema, &SchemaResources::default(), ctx)?;
        assert!(compiled.validate(&instance, ctx)?.is_empty());
        let mut limits = crate::context::Limits::catalog();
        limits.max_depth = 0;
        let mut constrained =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits)?;
        // Explicitly prove depth-zero scalar admission before the evaluator.
        let scalar = crate::value::copy_json(&instance, &mut constrained)?;
        let error = compiled.validate(&scalar, &mut constrained).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            error.message,
            Utf16::from("Schema evaluation depth exceeded")
        );
        assert!(compiled.validate(&instance, ctx)?.is_empty());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn fresh_index_one_below_total_preserves_first_denial_and_no_candidate_publication() {
    let schema = json(r#"{"$ref":"https://controls.test/authored"}"#);
    let cat = resources(true);
    let reference = Cell::new(0u64);
    let mut observer = |n| {
        reference.set(reference.get() + n as u64);
        Ok(())
    };
    let mut cold = Context::catalog().with_host_control(&mut observer);
    cold.with_codegen_construction(|ctx| CompiledSchema::compile(&schema, &cat, ctx))
        .unwrap();
    drop(cold);
    assert!(reference.get() > 0);
    let attempted = Cell::new(0u64);
    let denial = RefCell::new(None);
    let late = Cell::new(0usize);
    let mut control = |n| {
        attempted.set(attempted.get() + n as u64);
        if denial.borrow().is_some() {
            late.set(late.get() + 1);
        }
        if attempted.get() > reference.get() - 1 {
            if denial.borrow().is_none() {
                *denial.borrow_mut() = Some((n, attempted.get()));
            }
            return Err(EngineError::new(
                "CANCELLED",
                Utf16::from("/index/first"),
                "first actual cold denial",
            ));
        }
        Ok(())
    };
    let mut stopped = Context::catalog().with_host_control(&mut control);
    let result =
        stopped.with_codegen_construction(|ctx| CompiledSchema::compile(&schema, &cat, ctx));
    let error = result.unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert_eq!(error.path, Utf16::from("/index/first"));
    assert_eq!(error.message, Utf16::from("first actual cold denial"));
    assert_eq!(late.get(), 0);
    assert_eq!(stopped.charged_work(), attempted.get());
    assert_eq!(denial.borrow().as_ref().unwrap().1, attempted.get());
    assert!(stopped.schema_construction.is_none());
}

#[test]
fn generic_python_origin_spellings_survive_construction_scope_without_reprofiling() {
    use crate::python_value::{PyText, PythonConsumerValue, PythonSchemaResources};
    let spelling = PyText::from_codepoints(vec![0xd83d, 0xde00, 0x2f, 0xd800]).unwrap();
    let source = PythonConsumerValue::Object(vec![
        (
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("object")),
        ),
        (
            PyText::from_utf8("default"),
            PythonConsumerValue::Object(vec![(
                spelling.clone(),
                PythonConsumerValue::String(spelling.clone()),
            )]),
        ),
    ]);
    let resources = PythonSchemaResources::default();
    let baseline = CompiledSchema::compile_python_source(
        &source,
        &resources,
        false,
        PythonReVersion::V3_11,
        &mut Context::catalog(),
    )
    .unwrap();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let candidate = CompiledSchema::compile_python_source(
            &source,
            &resources,
            false,
            PythonReVersion::V3_11,
            ctx,
        )?;
        assert!(matches!(
            &candidate.compiled.resources,
            SchemaBacking::Owned(_)
        ));
        assert_eq!(
            candidate.compiled.python_text_origins,
            baseline.compiled.python_text_origins
        );
        assert!(candidate
            .compiled
            .python_text_origins
            .values()
            .any(|v| v == &spelling));
        assert_eq!(
            candidate.compiled.schema_value(),
            baseline.compiled.schema_value()
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
}
