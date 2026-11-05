// SPDX-License-Identifier: MIT OR Apache-2.0
//! AP1 independent bank SOURCE controls. NATIVE UNCOMPILED/UNEXECUTED.
//! Child of schema::admitted_bank. H owns production/include wiring.
use super::*;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &units(s),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(m) = value else {
        panic!("fixture object")
    };
    &m.iter().find(|(k, _)| k == &Utf16::from(name)).unwrap().1
}
fn canonical() -> ResourceSet {
    ResourceSet::new(
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
    )
}
fn small() -> ResourceSet {
    ResourceSet::new(
        json(r#"{"$id":"urn:bank-independent:core","type":"integer","default":{"opaque":"keep"}}"#),
        json(r#"{"$id":"urn:bank-independent:reference","type":"string"}"#),
        json(r#"{"$id":"urn:bank-independent:package","type":"boolean"}"#),
        json(r#"{"marker":"constraints"}"#),
        json(r#"{"marker":"policy"}"#),
    )
}
fn five(r: &ResourceSet) -> [&Value; 5] {
    [
        &r.core_schema,
        &r.reference_schema,
        &r.package_schema,
        &r.constraints,
        &r.domain_policy,
    ]
}
fn slot(r: &mut ResourceSet, i: usize) -> &mut Value {
    match i {
        0 => &mut r.core_schema,
        1 => &mut r.reference_schema,
        2 => &mut r.package_schema,
        3 => &mut r.constraints,
        4 => &mut r.domain_policy,
        _ => panic!("fixture role"),
    }
}
fn original_five(r: &ResourceSet, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    // Exact original engine admission order, through the original validator.
    for value in five(r) {
        crate::copy_json(value, ctx)?;
    }
    Ok(())
}
fn same_five(a: &ResourceSet, b: &ResourceSet) {
    for (actual, expected) in five(a).into_iter().zip(five(b)) {
        assert_eq!(actual, expected);
    }
}
fn context(limits: crate::context::Limits) -> Context<'static> {
    Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap()
}
fn owned_meta_tree(source: &[u16], ctx: &mut Context<'_>) -> Arc<Value> {
    assert!(ctx.in_codegen_construction());
    let tree = crate::serialization::read_construction_json_owned(source, ctx).unwrap();
    ctx.charge_work(
        std::mem::size_of::<Value>()
            .div_ceil(std::mem::size_of::<usize>())
            .saturating_add(2),
        Utf16::default(),
    )
    .unwrap();
    Arc::new(tree)
}
fn meta(source: &[u16], ctx: &mut Context<'_>) -> Arc<SchemaBank> {
    SchemaBank::from_meta(
        owned_meta_tree(source, ctx),
        SchemaDialect::Draft2020_12,
        ctx,
    )
    .unwrap()
}
fn sentinel() -> EngineError {
    let mut e = EngineError::new(
        "BANK_FIRST_DENIAL",
        Utf16::new(vec![47, 0xd800]),
        "original bank host error",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("bank-origin-δ"));
    e
}
fn exact_host_error(a: &EngineError, b: &EngineError) {
    assert_eq!(a.code, b.code);
    assert_eq!(a.path, b.path);
    assert_eq!(a.message, b.message);
    assert_eq!(a.python_message_origin, b.python_message_origin);
    assert!(a.is_control_failure());
}

#[test]
fn cold_canonical_five_admissions_have_ordered_roles_and_first_semantic_validation() {
    let input = canonical();
    let expected = input.clone();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        assert!(
            ctx.schema_construction
                .as_ref()
                .unwrap()
                .borrow()
                .meta_validators
                .is_empty()
        );
        let a = SchemaBank::admit_core(input, ctx)?;
        same_five(&a.resources, &expected);
        assert!(a.bank.input_compatible(ctx)?);
        assert!(
            ctx.schema_construction
                .as_ref()
                .unwrap()
                .borrow()
                .meta_validators
                .is_empty(),
            "JSON bank cannot mint schema success"
        );
        let ids = [
            "urn:umf:core:0.10.0",
            "urn:umf:core:semantic-type-reference:1.0.0",
            "urn:umf:extension-package:0.10.0",
        ];
        assert_eq!(a.bank.len(), 3);
        for (role, id) in ids.iter().enumerate() {
            let root = a.bank.root_checked(BankRoot::Core(role)).unwrap();
            assert_eq!(root, five(&expected)[role]);
            assert!(std::ptr::eq(root, five(&a.resources)[role]));
            let (actual, value) = a.bank.get(role).unwrap();
            assert_eq!(actual, &Utf16::from(*id));
            assert!(std::ptr::eq(value, root));
            assert!(a.bank.anchor_free_core_role(role, ctx)?);
        }
        assert!(a.bank.get(3).is_none());
        assert!(a.bank.root_checked(BankRoot::Core(3)).is_none());
        assert!(a.bank.root_checked(BankRoot::Meta).is_none());
        let compiled = CompiledSchema::compile_input_bank(Arc::clone(&a.bank), 0, ctx)?;
        assert!(Arc::ptr_eq(
            compiled
                .resource_bank
                .as_ref()
                .expect("actual bank consumption"),
            &a.bank
        ));
        assert!(matches!(
            &compiled.schema,
            SchemaRoot::Bank(_, BankRoot::Core(0))
        ));
        assert!(std::ptr::eq(
            &*compiled.schema,
            a.bank.root_checked(BankRoot::Core(0)).unwrap()
        ));
        assert!(
            !ctx.schema_construction
                .as_ref()
                .unwrap()
                .borrow()
                .meta_validators
                .is_empty(),
            "first semantic validation still runs"
        );
        let original = CompiledSchema::compile(&expected.core_schema, &a.bank.snapshot(ctx)?, ctx)?;
        for value in [json(r#"{}"#), Value::Null] {
            assert_eq!(
                compiled.validate(&value, ctx)?,
                original.validate(&value, ctx)?
            );
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
}

#[test]
fn whole_owned_metatree_all_twenty_roles_and_unknown_content_survive_projection() {
    let source = include_str!("schema_metas.json");
    let expected = json(source);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let bank=meta(&units(source),ctx);assert!(bank.input_compatible(ctx)?);assert_eq!(bank.whole_metatree().unwrap(),&expected);
        assert_eq!(bank.root_checked(BankRoot::Meta).unwrap(),field(field(&expected,"metaschemas"),"Draft202012Validator"));assert!(bank.root_checked(BankRoot::Core(0)).is_none());
        let Value::Array(entries)=field(&expected,"resources") else{panic!("pinned resources")};
        let whole=bank.whole_metatree().unwrap();let Value::Array(owned)=field(whole,"resources") else{panic!("owned rows")};
        assert_eq!(entries.len(),20);assert_eq!(bank.len(),20);
        for(i,row) in entries.iter().enumerate() {
            let Value::String(id)=field(row,"id") else{panic!("retrieval ID")};let(actual,value)=bank.get(i).unwrap();
            assert_eq!(actual,id);assert_eq!(value,field(row,"schema"));assert!(std::ptr::eq(value,field(&owned[i],"schema")));
        }
        assert!(bank.get(20).is_none());let original=whole.clone();let snapshot=bank.snapshot(ctx)?;
        assert_eq!(snapshot.entries.len(),20);assert_eq!(bank.whole_metatree().unwrap(),&original);
        for(i,(id,value)) in snapshot.entries.iter().enumerate(){assert_eq!((id,value),bank.get(i).unwrap());}
        assert!(source.starts_with('{'));
        let extended=format!(r#"{{"x-independent-bank":{{"a/b~☃":[null,"\ud800"]}},{}"#,&source[1..]);
        let extended=meta(&units(&extended),ctx);assert_eq!(extended.len(),20);
        assert_eq!(field(field(extended.whole_metatree().unwrap(),"x-independent-bank"),"a/b~☃"),&Value::Array(vec![Value::Null,Value::String(Utf16::new(vec![0xd800]))]));
        for name in ["profile","sources"] {assert_eq!(field(extended.whole_metatree().unwrap(),name),field(&expected,name));}
        let tree=owned_meta_tree(&units(source),ctx);let draft4=SchemaBank::from_meta(tree,SchemaDialect::Draft4,ctx)?;
        assert_eq!(draft4.len(),20);assert_eq!(draft4.root_checked(BankRoot::Meta).unwrap(),field(field(&expected,"metaschemas"),"Draft4Validator"));
        let tree=owned_meta_tree(&units(r#"{"metaschemas":{"Draft202012Validator":{"type":"object"}},"resources":[{"id":"\ud800","schema":{}}]}"#),ctx);
        let error=SchemaBank::from_meta(tree,SchemaDialect::Draft2020_12,ctx).unwrap_err();
        assert_eq!(error.code,"SCHEMA_INTERNAL");assert!(error.path.units().is_empty());assert_eq!(error.message,Utf16::from("Pinned metaschema resource has no id"));
        Ok::<(),EngineError>(())
    }).unwrap();
    assert!(ctx.schema_construction.is_none());
}

#[test]
fn changed_content_order_retrieval_and_equal_distinct_inputs_remain_exact_owned_roles() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let input=small();let equal=input.clone();let a=SchemaBank::admit_core(input,ctx)?;let b=SchemaBank::admit_core(equal,ctx)?;
        assert!(!Arc::ptr_eq(&a.bank,&b.bank));assert!(!Arc::ptr_eq(&a.resources,&b.resources));same_five(&a.resources,&b.resources);
        let mut changed=small();changed.core_schema=json(r#"{"$id":"urn:bank-independent:core","type":"string"}"#);let changed=SchemaBank::admit_core(changed,ctx)?;
        assert_eq!(a.bank.get(0).unwrap().0,changed.bank.get(0).unwrap().0);assert_ne!(a.bank.get(0).unwrap().1,changed.bank.get(0).unwrap().1);
        let old=CompiledSchema::compile_input_bank(Arc::clone(&a.bank),0,ctx)?;let new=CompiledSchema::compile_input_bank(Arc::clone(&changed.bank),0,ctx)?;
        assert!(old.resource_bank.is_some()&&new.resource_bank.is_some());
        for(value,old_valid,new_valid) in [(Value::Number(1.0),true,false),(Value::string_utf8("x"),false,true)]{
            assert_eq!(old.validate(&value,ctx)?.is_empty(),old_valid);assert_eq!(new.validate(&value,ctx)?.is_empty(),new_valid);
        }
        let mut reverse=small();std::mem::swap(&mut reverse.core_schema,&mut reverse.reference_schema);let reverse=SchemaBank::admit_core(reverse,ctx)?;
        assert_eq!(reverse.bank.get(0).unwrap().0,&Utf16::from("urn:bank-independent:reference"));assert_eq!(reverse.bank.root_checked(BankRoot::Core(0)).unwrap(),a.bank.root_checked(BankRoot::Core(1)).unwrap());
        for(text,id,kind) in [
            (r#"{"metaschemas":{"Draft202012Validator":{"type":"object"}},"resources":[{"id":"urn:row:a","schema":{"$id":"urn:authored","type":"integer"}},{"id":"urn:row:b","schema":{"type":"string"}}]}"#,"urn:row:a","integer"),
            (r#"{"metaschemas":{"Draft202012Validator":{"type":"object"}},"resources":[{"id":"urn:row:b","schema":{"type":"string"}},{"id":"urn:row:a","schema":{"$id":"urn:authored","type":"integer"}}]}"#,"urn:row:b","string"),
            (r#"{"metaschemas":{"Draft202012Validator":{"type":"object"}},"resources":[{"id":"urn:changed","schema":{"$id":"urn:authored","type":"integer"}},{"id":"urn:row:b","schema":{"type":"string"}}]}"#,"urn:changed","integer"),
        ]{let bank=meta(&units(text),ctx);assert_eq!(bank.len(),2);let(actual,value)=bank.get(0).unwrap();assert_eq!(actual,&Utf16::from(id));assert_eq!(field(value,"type"),&Value::string_utf8(kind));assert!(bank.input_compatible(ctx)?);}
        Ok::<(),EngineError>(())
    }).unwrap();
}

#[test]
fn construction_lifetime_and_limits_never_transfer_input_proof_to_foreign_context() {
    let mut ctx = Context::catalog();
    let bank = ctx
        .with_codegen_construction(|ctx| {
            let a = SchemaBank::admit_core(small(), ctx)?;
            assert!(a.bank.input_compatible(ctx)?);
            let prior = Rc::clone(ctx.schema_construction.as_ref().unwrap());
            let smaller = ctx.limits().max_text_units - 1;
            ctx.with_aggregate_text_limit(smaller, |changed| {
                assert!(Rc::ptr_eq(
                    changed.schema_construction.as_ref().unwrap(),
                    &prior
                ));
                assert!(!a.bank.input_compatible(changed)?);
                let result = CompiledSchema::compile_input_bank(Arc::clone(&a.bank), 0, changed)?;
                assert!(
                    result.resource_bank.is_none(),
                    "same genuine lifetime with changed limits uses paid fallback"
                );
                assert!(result.validate(&Value::Number(1.0), changed)?.is_empty());
                Ok::<(), EngineError>(())
            })?;
            assert!(a.bank.input_compatible(ctx)?);
            let source =
                crate::python_value::python_from_core_value(&a.resources.core_schema, ctx)?;
            let python = CompiledSchema::compile_python_source(
                &source,
                &crate::python_value::PythonSchemaResources::default(),
                false,
                PythonReVersion::V3_11,
                ctx,
            )?;
            assert!(python.compiled.resource_bank.is_none());
            assert!(!python.compiled.python_text_origins.is_empty());
            ctx.with_codegen_construction(|inner| {
                assert!(!a.bank.input_compatible(inner)?);
                let independent = SchemaBank::admit_core(small(), inner)?;
                assert!(independent.bank.input_compatible(inner)?);
                assert!(!a.bank.input_compatible(inner)?);
                let compiled = CompiledSchema::compile_input_bank(Arc::clone(&a.bank), 0, inner)?;
                assert!(compiled.resource_bank.is_none());
                assert!(compiled.validate(&Value::Number(1.0), inner)?.is_empty());
                Ok::<(), EngineError>(())
            })?;
            assert!(Rc::ptr_eq(
                ctx.schema_construction.as_ref().unwrap(),
                &prior
            ));
            assert!(a.bank.input_compatible(ctx)?);
            Ok(a.bank)
        })
        .unwrap();
    assert!(!bank.input_compatible(&mut ctx)?);
    ctx.with_codegen_construction(|ctx| {
        assert!(!bank.input_compatible(ctx)?);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let refusal = Context::with_limits(
        crate::context::ResourceProfile::HardIsolated,
        Context::catalog().limits(),
    )
    .err()
    .unwrap();
    assert_eq!(refusal.code, "RESOURCE_PROFILE_UNAVAILABLE");
}

#[test]
fn nested_id_anchor_and_noncanonical_role_facts_decline_only_optional_sharing() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx|{
        let successes=Cell::new(0usize);
        for text in [
            r#"{"$id":"https://bank-independent.test/root","$defs":{"n":{"$id":"child","type":"integer"}}}"#,
            r#"{"$id":"urn:bank-independent:core","$dynamicAnchor":"node","type":"integer"}"#,
            r#"{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"urn:bank-independent:core","$recursiveAnchor":true,"type":"integer"}"#,
            r#"{"$id":"relative","type":"integer"}"#,r#"{"$id":"urn:bank-independent:core#fragment","type":"integer"}"#,r#"{"$id":"urn:☃","type":"integer"}"#,r#"{"type":"integer"}"#,
        ]{
            let mut input=small();input.core_schema=json(text);let a=SchemaBank::admit_core(input,ctx)?;assert!(!a.bank.anchor_free_core_role(0,ctx)?);
            let original=CompiledSchema::compile(a.bank.root_checked(BankRoot::Core(0)).unwrap(),&a.bank.snapshot(ctx)?,ctx);
            let actual=CompiledSchema::compile_input_bank(Arc::clone(&a.bank),0,ctx);
            match(original,actual){(Ok(original),Ok(actual))=>{successes.set(successes.get()+1);assert!(actual.resource_bank.is_none());for value in [Value::Number(1.0),Value::string_utf8("x")]{assert_eq!(actual.validate(&value,ctx)?,original.validate(&value,ctx)?);}},(Err(expected),Err(actual))=>assert_eq!(actual,expected),_=>panic!("optional role sharing changed original schema acceptance")}
        }
        assert!(successes.get()>0,"fallback controls must include genuine successful compilation");Ok::<(),EngineError>(())
    }).unwrap();
}

#[test]
fn original_five_resource_error_order_numeric_duplicates_depth_nodes_and_utf16_are_exact() {
    for index in 0..5 {
        let mut input = small();
        for later in index..5 {
            *slot(&mut input, later) = Value::Object(vec![(
                Utf16::from(format!("bad-{later}")),
                Value::Number(-0.0),
            )]);
        }
        let expected = original_five(&input, &mut Context::catalog()).unwrap_err();
        assert_eq!(expected.code, "NUMBER");
        assert_eq!(expected.path, Utf16::from(format!("/bad-{index}")));
        let actual = Context::catalog()
            .with_codegen_construction(|ctx| SchemaBank::admit_core(input, ctx))
            .err()
            .unwrap();
        assert_eq!(actual, expected);
    }
    for value in [
        Value::Number(f64::NAN),
        Value::Number(f64::INFINITY),
        Value::Number(9007199254740992.0),
    ] {
        let mut input = small();
        input.reference_schema = value;
        let expected = original_five(&input, &mut Context::catalog()).unwrap_err();
        assert_eq!(expected.code, "NUMBER");
        assert!(expected.path.units().is_empty());
        let actual = Context::catalog()
            .with_codegen_construction(|ctx| SchemaBank::admit_core(input, ctx))
            .err()
            .unwrap();
        assert_eq!(actual, expected);
    }
    let mut input = small();
    input.core_schema = Value::Object(vec![
        (Utf16::new(vec![0xd800]), Value::Null),
        (Utf16::new(vec![0xd800]), Value::Number(f64::NAN)),
    ]);
    let expected = original_five(&input, &mut Context::catalog()).unwrap_err();
    assert_eq!(expected.code, "DUPLICATE_KEY");
    assert!(expected.path.units().is_empty());
    let actual = Context::catalog()
        .with_codegen_construction(|ctx| SchemaBank::admit_core(input, ctx))
        .err()
        .unwrap();
    assert_eq!(actual, expected);
    let mut input = small();
    input.core_schema = Value::Array(vec![Value::Array(vec![Value::Null])]);
    let mut limits = Context::catalog().limits();
    limits.max_depth = 1;
    let expected = original_five(&input, &mut context(limits)).unwrap_err();
    assert_eq!(expected.code, "LIMIT");
    assert_eq!(expected.path, Utf16::from("/0/0"));
    let actual = context(limits)
        .with_codegen_construction(|ctx| SchemaBank::admit_core(input, ctx))
        .err()
        .unwrap();
    assert_eq!(actual, expected);
    let mut input = small();
    input.core_schema = Value::Array(vec![Value::Null, Value::Null]);
    let mut limits = Context::catalog().limits();
    limits.max_values = 2;
    let expected = original_five(&input, &mut context(limits)).unwrap_err();
    assert_eq!(expected.code, "LIMIT");
    assert!(expected.path.units().is_empty());
    let actual = context(limits)
        .with_codegen_construction(|ctx| SchemaBank::admit_core(input, ctx))
        .err()
        .unwrap();
    assert_eq!(actual, expected);
    let mut input = small();
    input.constraints = Value::String(Utf16::new(vec![0xd800, 0xdc00, 0xdc00]));
    Context::catalog()
        .with_codegen_construction(|ctx| {
            let a = SchemaBank::admit_core(input, ctx)?;
            assert_eq!(
                a.resources.constraints,
                Value::String(Utf16::new(vec![0xd800, 0xdc00, 0xdc00]))
            );
            Ok::<(), EngineError>(())
        })
        .unwrap();
}

#[test]
fn paid_snapshots_and_exposed_resource_cow_mutation_cannot_change_the_bank() {
    let mut input = small();
    let expected = input.clone();
    let independent = input.clone();
    input.constraints = Value::Bool(false);
    Context::catalog()
        .with_codegen_construction(|ctx| {
            let mut a = SchemaBank::admit_core(independent, ctx)?;
            let retained = Arc::clone(&a.resources);
            let calls = Cell::new(0usize);
            let mut observe = |_| {
                calls.set(calls.get() + 1);
                Ok(())
            };
            let mut snapshot = a
                .bank
                .snapshot(&mut Context::catalog().with_host_control(&mut observe))?;
            assert!(calls.get() > 0);
            snapshot.entries[0].0 = Utf16::from("urn:changed");
            snapshot.entries[0].1 = Value::Bool(false);
            Arc::make_mut(&mut a.resources).core_schema = Value::Bool(false);
            Arc::make_mut(&mut a.resources).domain_policy = Value::string_utf8("changed");
            same_five(&retained, &expected);
            assert_ne!(a.resources.core_schema, expected.core_schema);
            assert_eq!(
                a.bank.get(0).unwrap().0,
                &Utf16::from("urn:bank-independent:core")
            );
            assert_eq!(
                a.bank.root_checked(BankRoot::Core(0)).unwrap(),
                &expected.core_schema
            );
            assert_eq!(a.bank.snapshot(ctx)?.entries[0].1, expected.core_schema);
            let compiled = CompiledSchema::compile_input_bank(Arc::clone(&a.bank), 0, ctx)?;
            assert!(compiled.resource_bank.is_some());
            assert!(compiled.validate(&Value::Number(1.0), ctx)?.is_empty());
            Ok::<(), EngineError>(())
        })
        .unwrap();
}

#[test]
fn json_bank_never_supplies_schema_success_and_registry_checks_remain_fresh() {
    Context::catalog()
        .with_codegen_construction(|ctx| {
            let mut invalid = small();
            invalid.core_schema =
                json(r#"{"$id":"urn:bank-independent:core","unknown-schema-keyword":true}"#);
            let invalid = SchemaBank::admit_core(invalid, ctx)?;
            assert!(invalid.bank.input_compatible(ctx)?);
            let expected = CompiledSchema::compile(
                invalid.bank.root_checked(BankRoot::Core(0)).unwrap(),
                &invalid.bank.snapshot(ctx)?,
                ctx,
            )
            .unwrap_err();
            assert_eq!(expected.code, "SCHEMA_UNKNOWN_KEYWORD");
            let actual =
                CompiledSchema::compile_input_bank(Arc::clone(&invalid.bank), 0, ctx).unwrap_err();
            assert_eq!(actual, expected);
            let engine = crate::engine::Engine::new(canonical(), ctx)?;
            let package = engine.package_schema();
            let bank = package
                .resource_bank
                .as_ref()
                .expect("actual retained Engine bank route");
            assert!(Arc::ptr_eq(
                bank,
                engine.reference_schema().resource_bank.as_ref().unwrap()
            ));
            assert_eq!(
                field(package.schema_value(), "$id"),
                &Value::string_utf8("urn:umf:extension-package:0.10.0")
            );
            let schemas = engine.schema_resources_with_context(ctx)?;
            let mut registry = crate::registry::Registry::new();
            let id = Utf16::from("urn:bank-independent:extension");
            let version = Utf16::from("1.0.0");
            let schema = json(r#"{"type":"integer"}"#);
            registry.register_extension(
                &id,
                &version,
                &[Utf16::from("document")],
                &schema,
                false,
                Some(7),
                package,
                &schemas,
                ctx,
            )?;
            assert_eq!(registry.get(&id, &version).unwrap().token(), Some(7));
            let refusal = registry
                .register_extension(
                    &id,
                    &version,
                    &[Utf16::from("module")],
                    &schema,
                    false,
                    Some(8),
                    package,
                    &schemas,
                    ctx,
                )
                .unwrap_err();
            assert_eq!(refusal.code, "DUPLICATE_VERSION");
            assert_eq!(registry.get(&id, &version).unwrap().token(), Some(7));
            let second = Utf16::from("1.0.1");
            registry.register_extension(
                &id,
                &second,
                &[Utf16::from("module")],
                &schema,
                false,
                Some(8),
                package,
                &schemas,
                ctx,
            )?;
            assert_eq!(
                registry.get(&id, &second).unwrap().scopes(),
                &["module".to_owned()]
            );
            assert_eq!(registry.get(&id, &second).unwrap().token(), Some(8));
            let refusal = registry
                .register_extension(
                    &id,
                    &Utf16::from("1.0.2"),
                    &[Utf16::from("unsupported")],
                    &schema,
                    false,
                    None,
                    package,
                    &schemas,
                    ctx,
                )
                .unwrap_err();
            assert_eq!(refusal.code, "PACKAGE_STRUCTURE");
            assert!(
                registry
                    .register_extension(
                        &id,
                        &Utf16::from("1.0.2"),
                        &[Utf16::from("document")],
                        &json(r#"{"type":"not-real"}"#),
                        false,
                        None,
                        package,
                        &schemas,
                        ctx
                    )
                    .is_err()
            );
            assert_eq!(registry.entries().len(), 2);
            let mut fresh = crate::registry::Registry::new();
            fresh.register_extension(
                &id,
                &version,
                &[Utf16::from("element")],
                &schema,
                false,
                Some(9),
                package,
                &schemas,
                ctx,
            )?;
            assert_eq!(fresh.get(&id, &version).unwrap().token(), Some(9));
            assert_eq!(
                fresh.get(&id, &version).unwrap().scopes(),
                &["element".to_owned()]
            );
            assert_eq!(registry.entries().len(), 2);
            Ok::<(), EngineError>(())
        })
        .unwrap();
}

#[derive(Clone, Copy, Debug)]
enum Stage {
    Core,
    Meta,
    Snapshot,
}
fn operation(
    stage: Stage,
    ctx: &mut Context<'_>,
    mut observer: Option<&mut dyn FnMut(&'static str)>,
) -> Result<(), EngineError> {
    ctx.with_codegen_construction(|ctx|{
        match stage {
            Stage::Core=>{
                let a=match observer.as_deref_mut(){Some(e)=>SchemaBank::admit_core_with_events(small(),ctx,e)?,None=>SchemaBank::admit_core(small(),ctx)?};
                assert_eq!(a.bank.len(),3);assert_eq!(a.bank.get(0).unwrap().0,&Utf16::from("urn:bank-independent:core"));
            },
            Stage::Meta=>{
                let tree=owned_meta_tree(&units(r#"{"metaschemas":{"Draft202012Validator":{"type":"object"}},"resources":[{"id":"urn:projection:a","schema":{"type":"integer"}},{"id":"urn:projection:b","schema":{"type":"string"}}],"unknown":[null,true]}"#),ctx);
                let bank=match observer.as_deref_mut(){Some(e)=>SchemaBank::from_meta_with_events(tree,SchemaDialect::Draft2020_12,ctx,e)?,None=>SchemaBank::from_meta(tree,SchemaDialect::Draft2020_12,ctx)?};
                assert_eq!(bank.len(),2);assert_eq!(bank.get(0).unwrap().0,&Utf16::from("urn:projection:a"));assert_eq!(field(bank.whole_metatree().unwrap(),"unknown"),&Value::Array(vec![Value::Null,Value::Bool(true)]));
            },
            Stage::Snapshot=>{
                let a=SchemaBank::admit_core(small(),ctx)?;let snapshot=match observer.as_deref_mut(){Some(e)=>a.bank.snapshot_with_events(ctx,e)?,None=>a.bank.snapshot(ctx)?};assert_eq!(snapshot.entries.len(),3);assert_eq!(snapshot.entries[0].0,Utf16::from("urn:bank-independent:core"));
            },
        } Ok(())
    })
}

#[test]
fn actual_fact_allocation_projection_and_snapshot_effects_share_real_denial_boundaries() {
    for stage in [Stage::Core, Stage::Meta, Stage::Snapshot] {
        let calls = Cell::new(0usize);
        let trace = RefCell::new(Vec::new());
        let charges = RefCell::new(Vec::new());
        let mut control = |n| {
            calls.set(calls.get() + 1);
            charges.borrow_mut().push(n);
            Ok(())
        };
        let mut event = |label| trace.borrow_mut().push((label, calls.get()));
        operation(
            stage,
            &mut Context::catalog().with_host_control(&mut control),
            Some(&mut event),
        )
        .unwrap();
        let trace = trace.into_inner();
        assert!(!trace.is_empty());
        let sites: &[&str] = match stage {
            Stage::Core => &[
                "input-fact",
                "owner-allocation",
                "row-allocation",
                "bank-publication",
            ],
            Stage::Meta => &[
                "projection-key",
                "row-allocation",
                "projection-id",
                "projection-row",
                "bank-publication",
            ],
            Stage::Snapshot => &[
                "snapshot-allocation",
                "snapshot-row",
                "snapshot-publication",
            ],
        };
        let last = if matches!(stage, Stage::Snapshot) {
            "snapshot-publication"
        } else {
            "bank-publication"
        };
        assert_eq!(trace.last().map(|v| v.0), Some(last));
        assert_eq!(
            trace.last().unwrap().1,
            calls.get(),
            "no callback after publication"
        );
        let plain = RefCell::new(Vec::new());
        let mut nohook = |n| {
            plain.borrow_mut().push(n);
            Ok(())
        };
        operation(
            stage,
            &mut Context::catalog().with_host_control(&mut nohook),
            None,
        )
        .unwrap();
        assert_eq!(*charges.borrow(), *plain.borrow());
        for site in sites {
            // Several markers may share one actual prior admission. Suppress
            // every marker in that callback group, not only the selected name.
            let denied = trace
                .iter()
                .find(|(label, _)| label == site)
                .expect("real effect reached")
                .1;
            let calls = Cell::new(0usize);
            let events = RefCell::new(Vec::new());
            let error = sentinel();
            let mut deny = |_| {
                calls.set(calls.get() + 1);
                if calls.get() == denied {
                    Err(error.clone())
                } else {
                    Ok(())
                }
            };
            let mut observe = |label| events.borrow_mut().push((label, calls.get()));
            let phase = Cell::new("outer-phase");
            let root = Cell::new("outer-root");
            let mut ctx = Context::catalog()
                .with_host_control(&mut deny)
                .with_work_phase_observer(&phase)
                .with_constructor_root_observer(&root);
            let failure = operation(stage, &mut ctx, Some(&mut observe)).unwrap_err();
            exact_host_error(&failure, &error);
            assert_eq!(calls.get(), denied);
            let prefix: Vec<_> = trace
                .iter()
                .copied()
                .filter(|(_, at)| *at < denied)
                .collect();
            assert_eq!(*events.borrow(), prefix);
            assert!(!events.borrow().iter().any(|(name, _)| *name == last));
            assert!(ctx.schema_construction.is_none());
            assert_eq!(phase.get(), "outer-phase");
            assert_eq!(root.get(), "outer-root");
        }
    }
}

#[test]
fn reentry_and_prepublication_unwind_cannot_reuse_partial_bank_or_lose_outer_scope() {
    let published = Cell::new(false);
    let phase = Cell::new("outer-phase");
    let root = Cell::new("outer-root");
    let mut ctx = Context::catalog()
        .with_work_phase_observer(&phase)
        .with_constructor_root_observer(&root);
    ctx.with_codegen_construction(|outer| {
        let retained = SchemaBank::admit_core(small(), outer)?;
        let prior = Rc::clone(outer.schema_construction.as_ref().unwrap());
        let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            outer.with_codegen_construction(|inner| {
                let mut event = |label| {
                    if label == "bank-publication" {
                        published.set(true);
                    }
                    if label == "row-allocation" {
                        panic!("independent bank reservation unwind");
                    }
                };
                SchemaBank::admit_core_with_events(small(), inner, &mut event)
            })
        }));
        assert!(unwind.is_err());
        assert!(!published.get());
        assert!(Rc::ptr_eq(
            outer.schema_construction.as_ref().unwrap(),
            &prior
        ));
        assert!(retained.bank.input_compatible(outer)?);
        assert_eq!(phase.get(), "outer-phase");
        assert_eq!(root.get(), "outer-root");
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
    let total = Cell::new(0usize);
    let trigger = Cell::new(None);
    let mut measure = |_| {
        total.set(total.get() + 1);
        Ok(())
    };
    let mut fact = |label| {
        if label == "input-fact" && trigger.get().is_none() {
            trigger.set(Some(total.get()));
        }
    };
    operation(
        Stage::Core,
        &mut Context::catalog().with_host_control(&mut measure),
        Some(&mut fact),
    )
    .unwrap();
    let point = trigger.get().unwrap();
    let calls = Cell::new(0usize);
    let reached = Cell::new(false);
    let mut callback = |_| {
        calls.set(calls.get() + 1);
        if calls.get() == point {
            reached.set(true);
            let mut inner = Context::catalog();
            inner
                .with_codegen_construction(|inner| {
                    let bank = SchemaBank::admit_core(small(), inner)?;
                    assert!(bank.bank.input_compatible(inner)?);
                    assert_eq!(
                        bank.bank.root_checked(BankRoot::Core(0)).unwrap(),
                        &small().core_schema
                    );
                    Ok::<(), EngineError>(())
                })
                .unwrap();
            assert!(inner.schema_construction.is_none());
        }
        Ok(())
    };
    operation(
        Stage::Core,
        &mut Context::catalog().with_host_control(&mut callback),
        None,
    )
    .unwrap();
    assert!(reached.get());
}
