// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent calls to real compilation/admission guards, never synthetic proofs.
use super::*;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn typed(kind: &str) -> Value {
    object(vec![("type", Value::string_utf8(kind))])
}
fn root_ref() -> Value {
    object(vec![
        (
            "$ref",
            Value::string_utf8("https://independent.test/a.json"),
        ),
        (
            "default",
            object(vec![("opaque", Value::String(Utf16::new(vec![0xd800])))]),
        ),
    ])
}
fn catalogue() -> SchemaResources {
    SchemaResources {
        entries: vec![
            (
                Utf16::from("https://independent.test/a.json"),
                typed("integer"),
            ),
            (
                Utf16::from("https://independent.test/b.json"),
                typed("boolean"),
            ),
        ],
    }
}
fn shared(schema: &CompiledSchema) -> Arc<SchemaResources> {
    match &schema.resources {
        SchemaBacking::Shared(value) => Arc::clone(value),
        SchemaBacking::Owned(_) => panic!("expected actual admitted shared backing"),
    }
}
fn proof_count(ctx: &Context<'_>) -> usize {
    ctx.schema_construction
        .as_ref()
        .unwrap()
        .borrow()
        .completed
        .len()
}

#[derive(Clone, Copy)]
struct Profile {
    dialect: SchemaDialect,
    strict: bool,
    regex: RegexProfile,
    resolve: bool,
    local_gate: bool,
    duplicates: bool,
    finite: bool,
    keywords: KeywordPolicy,
}
impl Profile {
    fn ordinary() -> Self {
        Self {
            dialect: SchemaDialect::Draft2020_12,
            strict: true,
            regex: RegexProfile::Ecma262Unicode,
            resolve: true,
            local_gate: false,
            duplicates: false,
            finite: true,
            keywords: KeywordPolicy::DRAFT2020,
        }
    }
    fn compile(
        self,
        schema: &Value,
        resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<CompiledSchema, EngineError> {
        // Argument harness ONLY; eligibility is decided by the production call.
        CompiledSchema::compile_inner(
            schema,
            resources,
            self.dialect,
            self.strict,
            self.regex,
            self.resolve,
            self.local_gate,
            self.duplicates,
            self.finite,
            self.keywords,
            ctx,
        )
    }
}

#[test]
fn actual_completed_proof_reuses_only_in_its_cold_scope() {
    let mut ctx = Context::catalog();
    let retained = ctx
        .with_codegen_construction(|ctx| {
            let source = root_ref();
            let first = CompiledSchema::compile(&source, &catalogue(), ctx)?;
            let count = proof_count(ctx);
            let second = CompiledSchema::compile(&source, &catalogue(), ctx)?;
            assert_eq!(proof_count(ctx), count);
            assert!(Arc::ptr_eq(&shared(&first), &shared(&second)));
            assert_eq!(first.schema_value(), &source); // Includes complete default data.
            assert!(first.validate(&Value::Number(7.0), ctx)?.is_empty());
            assert!(!first.validate(&Value::Bool(true), ctx)?.is_empty());
            Ok(shared(&first))
        })
        .unwrap();
    assert!(ctx.schema_construction.is_none());
    ctx.with_codegen_construction(|ctx| {
        assert!(ctx
            .schema_construction
            .as_ref()
            .unwrap()
            .borrow()
            .completed
            .is_empty());
        let next = CompiledSchema::compile(&root_ref(), &catalogue(), ctx)?;
        assert!(!Arc::ptr_eq(&retained, &shared(&next)));
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let ordinary =
        CompiledSchema::compile(&typed("object"), &SchemaResources::default(), &mut ctx).unwrap();
    assert!(matches!(&ordinary.resources, SchemaBacking::Owned(_)));
}

#[test]
fn complete_ordered_catalogue_not_root_id_or_equal_prefix_controls_reuse() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let first = CompiledSchema::compile(&root_ref(), &catalogue(), ctx)?;
        let count = proof_count(ctx);
        let mut changed_unused = catalogue();
        changed_unused.entries[1].1 = typed("string");
        let second = CompiledSchema::compile(&root_ref(), &changed_unused, ctx)?;
        assert!(!Arc::ptr_eq(&shared(&first), &shared(&second)));
        assert!(proof_count(ctx) > count);
        let mut reordered = catalogue();
        reordered.entries.reverse();
        let third = CompiledSchema::compile(&root_ref(), &reordered, ctx)?;
        assert!(!Arc::ptr_eq(&shared(&first), &shared(&third)));
        let mut changed_target = catalogue();
        changed_target.entries[0].1 = typed("boolean");
        let fourth = CompiledSchema::compile(&root_ref(), &changed_target, ctx)?;
        assert!(fourth.validate(&Value::Bool(true), ctx)?.is_empty());
        assert!(!fourth.validate(&Value::Number(7.0), ctx)?.is_empty());
        assert!(first.validate(&Value::Number(7.0), ctx)?.is_empty());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn dialect_and_effective_context_limits_are_part_of_actual_proof_identity() {
    let mut ctx = Context::ordinary();
    ctx.with_codegen_construction(|ctx| {
        let source = typed("object");
        let resources = SchemaResources::default();
        let first = Profile::ordinary().compile(&source, &resources, ctx)?;
        let mut draft7 = Profile::ordinary();
        draft7.dialect = SchemaDialect::Draft7;
        let count = proof_count(ctx);
        let other = draft7.compile(&source, &resources, ctx)?;
        assert_eq!(other.dialect, SchemaDialect::Draft7);
        assert!(proof_count(ctx) > count);
        let deeper = ctx.with_schema_depth_allowance(544, |ctx| {
            Profile::ordinary().compile(&source, &resources, ctx)
        })?;
        assert!(!Arc::ptr_eq(&shared(&first), &shared(&deeper)));
        let catalog_limit = ctx.with_catalog_value_limit(|ctx| {
            Profile::ordinary().compile(&source, &resources, ctx)
        })?;
        assert!(!Arc::ptr_eq(&shared(&first), &shared(&catalog_limit)));
        let restored = Profile::ordinary().compile(&source, &resources, ctx)?;
        assert!(Arc::ptr_eq(&shared(&first), &shared(&restored)));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn each_nonordinary_compiler_policy_invokes_original_path_not_prior_proof() {
    let mut profiles = Vec::new();
    let mut p = Profile::ordinary();
    p.strict = false;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.regex = RegexProfile::Python(PythonReVersion::V3_11);
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.resolve = false;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.local_gate = true;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.duplicates = true;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.finite = false;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.keywords.validation = false;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.keywords.applicator = false;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.keywords.unevaluated = false;
    profiles.push(p);
    let mut p = Profile::ordinary();
    p.keywords.custom = true;
    profiles.push(p);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let source = typed("object");
        let resources = SchemaResources::default();
        CompiledSchema::compile(&source, &resources, ctx)?;
        let count = proof_count(ctx);
        for profile in profiles {
            let compiled = profile.compile(&source, &resources, ctx)?;
            assert!(matches!(&compiled.resources, SchemaBacking::Owned(_)));
            assert_eq!(proof_count(ctx), count);
            if !profile.keywords.validation {
                assert!(compiled.validate(&Value::Bool(true), ctx)?.is_empty());
            }
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn python_source_origin_compilation_is_not_replaced_by_ordinary_cached_proof() {
    use crate::python_value::{PyText, PythonConsumerValue, PythonSchemaResources};
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        CompiledSchema::compile(&typed("object"), &SchemaResources::default(), ctx)?;
        let count = proof_count(ctx);
        let source = PythonConsumerValue::Object(vec![(
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("object")),
        )]);
        let python = CompiledSchema::compile_python_source(
            &source,
            &PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            ctx,
        )?;
        assert!(matches!(
            &python.compiled.resources,
            SchemaBacking::Owned(_)
        ));
        assert!(!python.compiled.python_text_origins.is_empty());
        assert_eq!(proof_count(ctx), count);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn supplied_absolute_relative_and_dynamic_targets_keep_original_dialect_meaning() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let target = object(vec![
            (
                "$id",
                Value::string_utf8("https://independent.test/child.json"),
            ),
            ("$dynamicAnchor", Value::string_utf8("node")),
            ("type", Value::string_utf8("integer")),
        ]);
        let resources = SchemaResources {
            entries: vec![(Utf16::from("https://independent.test/child.json"), target)],
        };
        for (keyword, reference) in [
            ("$ref", "https://independent.test/child.json#node"),
            ("$ref", "child.json#node"),
            ("$dynamicRef", "child.json#node"),
        ] {
            let source = object(vec![
                (
                    "$id",
                    Value::string_utf8("https://independent.test/root.json"),
                ),
                (keyword, Value::string_utf8(reference)),
            ]);
            let compiled = CompiledSchema::compile(&source, &resources, ctx)?;
            assert!(compiled.validate(&Value::Number(2.0), ctx)?.is_empty());
            assert!(!compiled.validate(&Value::Bool(true), ctx)?.is_empty());
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn malformed_catalogue_and_dangling_static_relative_dynamic_refs_never_publish_proof() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        CompiledSchema::compile(&root_ref(), &catalogue(), ctx)?;
        let count = proof_count(ctx);
        let mut conflict = catalogue();
        conflict
            .entries
            .push((conflict.entries[0].0.clone(), typed("string")));
        assert_eq!(
            CompiledSchema::compile(&root_ref(), &conflict, ctx)
                .unwrap_err()
                .code,
            "SCHEMA_ID_CONFLICT"
        );
        for keyword in ["$ref", "$dynamicRef"] {
            let bad = object(vec![
                (
                    "$id",
                    Value::string_utf8("https://independent.test/root.json"),
                ),
                (keyword, Value::string_utf8("missing.json#node")),
            ]);
            assert_eq!(
                CompiledSchema::compile(&bad, &catalogue(), ctx)
                    .unwrap_err()
                    .code,
                "SCHEMA_REF_UNRESOLVED"
            );
            assert_eq!(proof_count(ctx), count);
        }
        let unknown = object(vec![("unsupported-root-keyword", Value::Bool(true))]);
        assert_eq!(
            CompiledSchema::compile(&unknown, &catalogue(), ctx)
                .unwrap_err()
                .code,
            "SCHEMA_UNKNOWN_KEYWORD"
        );
        assert_eq!(proof_count(ctx), count);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn cumulative_one_below_actual_fresh_compile_preserves_first_denial_and_drops_state() {
    let sum = Cell::new(0u64);
    let mut observe = |amount| {
        sum.set(sum.get() + amount as u64);
        Ok(())
    };
    let mut reference = Context::catalog().with_host_control(&mut observe);
    reference
        .with_codegen_construction(|ctx| {
            CompiledSchema::compile(&typed("object"), &SchemaResources::default(), ctx).map(|_| ())
        })
        .unwrap();
    let allowance = sum.get() - 1;
    drop(reference);
    let attempted = Cell::new(0u64);
    let after_denial = Cell::new(0usize);
    let first = RefCell::new(None);
    let mut stop = |amount| {
        attempted.set(attempted.get() + amount as u64);
        if first.borrow().is_some() {
            after_denial.set(after_denial.get() + 1);
            return Err(EngineError::new("WRONG", Utf16::default(), "later error"));
        }
        if attempted.get() > allowance {
            *first.borrow_mut() = Some((amount, attempted.get()));
            return Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::from("/first"),
                "first compile denial",
            ));
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut stop);
    let mut weak = None;
    let result = ctx.with_codegen_construction(|ctx| {
        weak = Some(Rc::downgrade(ctx.schema_construction.as_ref().unwrap()));
        CompiledSchema::compile(&typed("object"), &SchemaResources::default(), ctx)
    });
    let error = result.unwrap_err();
    assert_eq!(error.code, "RESOURCE_LIMIT");
    assert_eq!(error.path, Utf16::from("/first"));
    assert_eq!(error.message, Utf16::from("first compile denial"));
    assert!(error.is_control_failure());
    assert_eq!(ctx.charged_work(), attempted.get());
    assert!(first.borrow().as_ref().unwrap().0 > 0);
    assert_eq!(first.borrow().as_ref().unwrap().1, attempted.get());
    assert_eq!(after_denial.get(), 0);
    assert!(ctx.schema_construction.is_none());
    assert!(weak.unwrap().upgrade().is_none());
}
