// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20, US-089-AC24
use umf_core::{registry::Registry, Utf16};

fn parse(source: &str) -> umf_core::Value {
    let input: Vec<u16> = source.encode_utf16().collect();
    umf_core::serialization::read_json_value(
        &input,
        umf_core::serialization::Format::Json,
        &mut umf_core::Context::ordinary(),
    )
    .unwrap()
}
fn member<'a>(value: &'a umf_core::Value, name: &str) -> Option<&'a umf_core::Value> {
    match value {
        umf_core::Value::Object(members) => members
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

#[test]
fn registry_is_explicit_and_has_no_ambient_entries() {
    let registry = Registry::new();
    assert!(registry
        .get(&Utf16::from("urn:example"), &Utf16::from("1.0.0"))
        .is_none());
}

#[test]
fn extension_compatibility_registration_uses_supplied_package_schema_resources() {
    let engine = umf_core::Engine::new(
        umf_core::ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut umf_core::Context::ordinary(),
    )
    .unwrap();
    let mut registry = Registry::new();
    let schema = engine
        .schema_resources_with_context(&mut umf_core::Context::catalog())
        .unwrap();
    let manifest = parse(
        r#"{"id":"urn:test:extension","version":"1.0.0","coreVersion":"0.10.0","description":"Registered through Extension compatibility API","semantics":"host capability","schema":true,"scopes":["document"],"capabilities":{"validation":"semantic","directions":[],"evidence":[]}}"#,
    );
    assert!(engine
        .package_schema()
        .validate(&manifest, &mut umf_core::Context::ordinary())
        .unwrap()
        .is_empty());
    registry
        .register_extension(
            &Utf16::from("urn:test:extension"),
            &Utf16::from("1.0.0"),
            &[Utf16::from("document")],
            &umf_core::Value::Bool(true),
            true,
            Some(42),
            engine.package_schema(),
            &schema,
            &mut umf_core::Context::ordinary(),
        )
        .unwrap();
    assert!(registry
        .get(&Utf16::from("urn:test:extension"), &Utf16::from("1.0.0"))
        .is_some());

    let long_id_text = format!("urn:test:{}", "x".repeat(4_000_001));
    let long_id = Utf16::from(long_id_text);
    registry
        .register_extension(
            &long_id,
            &Utf16::from("2.0.0"),
            &[Utf16::from("document")],
            &umf_core::Value::Bool(true),
            false,
            None,
            engine.package_schema(),
            &schema,
            &mut umf_core::Context::ordinary(),
        )
        .unwrap();
    assert!(registry.get(&long_id, &Utf16::from("2.0.0")).is_some());

    let mut meter = |amount: usize| {
        if amount > 1_000_000 {
            Err(umf_core::EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "stopped",
            ))
        } else {
            Ok(())
        }
    };
    let error = Registry::new()
        .register_extension(
            &long_id,
            &Utf16::from("3.0.0"),
            &[Utf16::from("document")],
            &umf_core::Value::Bool(true),
            false,
            None,
            engine.package_schema(),
            &schema,
            &mut umf_core::Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
}

#[test]
fn python_extension_profile_uses_supplied_package_version_and_python_regex() {
    let engine = umf_core::Engine::new(
        umf_core::ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut umf_core::Context::ordinary(),
    )
    .unwrap();
    let mut package_schema = parse(include_str!(
        "../../../spec/core/extension-package.schema.json"
    ));
    if let umf_core::Value::Object(members) = &mut package_schema {
        let properties = members
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("properties"))
            .unwrap();
        if let umf_core::Value::Object(properties) = &mut properties.1 {
            let core_version = properties
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("coreVersion"))
                .unwrap();
            if let umf_core::Value::Object(core_version) = &mut core_version.1 {
                let value = core_version
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("const"))
                    .unwrap();
                value.1 = umf_core::Value::string_utf8("9.8.7");
            }
        }
    }
    let resources = engine
        .schema_resources_with_context(&mut umf_core::Context::catalog())
        .unwrap();
    let package = umf_core::schema::CompiledSchema::compile(
        &package_schema,
        &resources,
        &mut umf_core::Context::ordinary(),
    )
    .unwrap();
    let schema = parse(r#"{"$schema":"http://json-schema.org/draft-07/schema#","pattern":"\\a"}"#);
    let mut registry = Registry::new();
    registry
        .register_extension_with_python_profile(
            &Utf16::from("urn:test:python"),
            &Utf16::from("1.0.0"),
            &[Utf16::from("document")],
            &schema,
            false,
            Some(77),
            umf_core::PythonReVersion::V3_11,
            &package,
            &resources,
            &mut umf_core::Context::ordinary(),
        )
        .unwrap();
    let registration = registry
        .get(&Utf16::from("urn:test:python"), &Utf16::from("1.0.0"))
        .unwrap();
    assert_eq!(
        member(registration.manifest(), "coreVersion"),
        Some(&umf_core::Value::string_utf8("9.8.7")),
    );
    assert!(registration
        .schema()
        .validate(
            &umf_core::Value::String(Utf16::new(vec![7])),
            &mut umf_core::Context::ordinary(),
        )
        .unwrap()
        .is_empty());
}
