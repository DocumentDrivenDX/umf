// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent registration custody using the genuine package schema, not true.
use super::*;
use std::cell::Cell;

fn parsed(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units: Vec<u16> = source.encode_utf16().collect();
    crate::serialization::read_json_value(&units, crate::serialization::Format::Json, ctx)
}
fn genuine_package_schema(
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, SchemaResources), EngineError> {
    let reference = parsed(
        include_str!("../../../spec/core/semantic-type-reference.schema.json"),
        ctx,
    )?;
    let package = parsed(
        include_str!("../../../spec/core/extension-package.schema.json"),
        ctx,
    )?;
    let resources = SchemaResources {
        entries: vec![
            (
                Utf16::from("urn:umf:core:semantic-type-reference:1.0.0"),
                reference,
            ),
            (
                Utf16::from("urn:umf:extension-package:0.10.0"),
                package.clone(),
            ),
        ],
    };
    let compiled = CompiledSchema::compile(&package, &resources, ctx)?;
    Ok((compiled, resources))
}
fn extension_schema() -> Value {
    Value::Object(vec![
        (Utf16::from("type"), Value::string_utf8("object")),
        (
            Utf16::from("default"),
            Value::Object(vec![(
                Utf16::from("future.vendor"),
                Value::String(Utf16::new(vec![0xd800])),
            )]),
        ),
    ])
}

#[test]
fn valid_changed_identity_version_scopes_token_and_semantics_are_new_stored_values() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let (package, resources) = genuine_package_schema(ctx)?;
        let cases = [
            (
                "independent.alpha",
                "0.1.0",
                vec!["document"],
                Some(10),
                true,
            ),
            (
                "independent.beta",
                "0.1.0",
                vec!["document"],
                Some(10),
                true,
            ),
            (
                "independent.alpha",
                "0.2.0",
                vec!["document"],
                Some(10),
                true,
            ),
            (
                "independent.alpha",
                "0.1.0",
                vec!["module", "element"],
                Some(10),
                true,
            ),
            (
                "independent.alpha",
                "0.1.0",
                vec!["document"],
                Some(20),
                true,
            ),
            ("independent.alpha", "0.1.0", vec!["document"], None, false),
        ];
        for (id, version, scopes, token, semantic) in cases {
            // New registry for each valid variation: same-version replacement
            // in an existing registry is separately required to refuse.
            let mut registry = Registry::new();
            let id = Utf16::from(id);
            let version = Utf16::from(version);
            let scopes: Vec<Utf16> = scopes.into_iter().map(Utf16::from).collect();
            let mut schema = extension_schema();
            let expected_schema = schema.clone();
            let before = ctx.charged_work();
            registry.register_extension(
                &id, &version, &scopes, &schema, semantic, token, &package, &resources, ctx,
            )?;
            assert!(ctx.charged_work() > before);
            assert_eq!(registry.entries.len(), 1);
            let entry = registry.get(&id, &version).unwrap();
            assert_eq!(entry.id(), &id);
            assert_eq!(entry.version(), &version);
            assert_eq!(entry.token(), token);
            assert_eq!(entry.semantic(), semantic);
            let expected_scopes: Vec<String> =
                scopes.iter().map(|s| s.to_utf8().unwrap()).collect();
            assert_eq!(entry.scopes(), expected_scopes.as_slice());
            assert_eq!(entry.schema().schema_value(), &expected_schema);
            assert_eq!(
                get(entry.manifest(), "id"),
                Some(&Value::String(id.clone()))
            );
            assert_eq!(
                get(entry.manifest(), "version"),
                Some(&Value::String(version.clone()))
            );
            let validation =
                get(get(entry.manifest(), "capabilities").unwrap(), "validation").unwrap();
            assert_eq!(
                validation,
                &Value::string_utf8(if semantic { "semantic" } else { "structural" })
            );
            if let Value::Object(fields) = &mut schema {
                fields.clear();
            }
            assert_eq!(
                registry.get(&id, &version).unwrap().schema().schema_value(),
                &expected_schema
            );
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn every_registration_revalidates_manifest_after_identical_schema_completed() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let (package, resources) = genuine_package_schema(ctx)?;
        let schema = extension_schema();
        let mut registry = Registry::new();
        registry.register_extension(
            &Utf16::from("kept"),
            &Utf16::from("0.1.0"),
            &[Utf16::from("document")],
            &schema,
            true,
            Some(11),
            &package,
            &resources,
            ctx,
        )?;
        let cases = [
            ("", "0.1.0", vec!["document"]),
            ("other", "not-semver", vec!["document"]),
            ("other", "0.1.0", vec![]),
            ("other", "0.1.0", vec!["unknown-scope"]),
            ("other", "0.1.0", vec!["document", "document"]),
        ];
        for (id, version, scopes) in cases {
            let scopes: Vec<Utf16> = scopes.into_iter().map(Utf16::from).collect();
            let before = ctx.charged_work();
            let error = registry
                .register_extension_owned_inner(
                    Utf16::from(id),
                    Utf16::from(version),
                    scopes,
                    schema.clone(),
                    true,
                    Some(22),
                    None,
                    &package,
                    &resources,
                    ctx,
                )
                .unwrap_err();
            assert_eq!(error.code, "PACKAGE_STRUCTURE");
            assert!(ctx.charged_work() > before);
            assert_eq!(registry.entries.len(), 1);
            assert_eq!(
                registry
                    .get(&Utf16::from("kept"), &Utf16::from("0.1.0"))
                    .unwrap()
                    .token(),
                Some(11)
            );
        }
        // A malformed schema carrier is a genuine package-structure refusal;
        // a cached completed object schema cannot authorize this manifest.
        let malformed = registry
            .register_extension_owned_inner(
                Utf16::from("bad-schema"),
                Utf16::from("0.1.0"),
                vec![Utf16::from("document")],
                Value::Null,
                true,
                Some(22),
                None,
                &package,
                &resources,
                ctx,
            )
            .unwrap_err();
        assert_eq!(malformed.code, "PACKAGE_STRUCTURE");
        assert_eq!(registry.entries.len(), 1);
        let duplicate = registry
            .register_extension(
                &Utf16::from("kept"),
                &Utf16::from("0.1.0"),
                &[Utf16::from("module")],
                &schema,
                false,
                Some(99),
                &package,
                &resources,
                ctx,
            )
            .unwrap_err();
        assert_eq!(duplicate.code, "DUPLICATE_VERSION");
        assert_eq!(registry.entries.len(), 1);
        assert_eq!(registry.entries[0].token(), Some(11));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn failed_extension_schema_compile_publishes_no_registration_and_no_stale_identity() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let (package, resources) = genuine_package_schema(ctx)?;
        let mut registry = Registry::new();
        let invalid = Value::Object(vec![(
            Utf16::from("unknown-schema-keyword"),
            Value::Bool(true),
        )]);
        let error = registry
            .register_extension(
                &Utf16::from("retry-id"),
                &Utf16::from("0.1.0"),
                &[Utf16::from("document")],
                &invalid,
                true,
                Some(7),
                &package,
                &resources,
                ctx,
            )
            .unwrap_err();
        assert_eq!(error.code, "SCHEMA_UNKNOWN_KEYWORD");
        assert!(registry.entries.is_empty());
        // Explicit new registration, not automatic retry or a cached identity.
        registry.register_extension(
            &Utf16::from("retry-id"),
            &Utf16::from("0.1.0"),
            &[Utf16::from("element")],
            &extension_schema(),
            false,
            Some(8),
            &package,
            &resources,
            ctx,
        )?;
        let stored = registry
            .get(&Utf16::from("retry-id"), &Utf16::from("0.1.0"))
            .unwrap();
        assert_eq!(stored.token(), Some(8));
        assert_eq!(stored.scopes(), &["element".to_string()]);
        assert!(!stored.semantic());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn cancellation_keeps_first_denied_charge_and_publishes_no_partial_registration() {
    let armed = Cell::new(false);
    let denied_events = Cell::new(0usize);
    let attempted = Cell::new(0u64);
    let mut stop = |amount| {
        attempted.set(attempted.get() + amount as u64);
        if armed.get() {
            denied_events.set(denied_events.get() + 1);
            Err(EngineError::new(
                "CANCELLED",
                Utf16::from("/registration"),
                "first registry denial",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_host_control(&mut stop);
    let mut registry = Registry::new();
    let error = ctx
        .with_codegen_construction(|ctx| {
            let (package, resources) = genuine_package_schema(ctx)?;
            armed.set(true);
            registry.register_extension(
                &Utf16::from("not-published"),
                &Utf16::from("0.1.0"),
                &[Utf16::from("document")],
                &extension_schema(),
                true,
                Some(3),
                &package,
                &resources,
                ctx,
            )
        })
        .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert_eq!(error.message, Utf16::from("first registry denial"));
    assert_eq!(error.path, Utf16::from("/registration"));
    assert!(error.is_control_failure());
    assert_eq!(denied_events.get(), 1);
    assert_eq!(ctx.charged_work(), attempted.get());
    assert!(registry.entries.is_empty());
    assert!(ctx.schema_construction.is_none());
}
