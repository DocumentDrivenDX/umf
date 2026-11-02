// SPDX-License-Identifier: MIT OR Apache-2.0
//! The access inspector must validate supplied bindings with the explicit
//! trusted package/schema set held by CodegenResources.
use std::{fs, path::Path};

use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::{
    serialization::{read_json_value, Format},
    Context, ResourceSet, Utf16, Value,
};

fn root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn load(path: &str) -> Value {
    let source = fs::read_to_string(root().join(path)).unwrap();
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    umf_codegen::value::member(value, name).unwrap()
}
fn require_marker(package: &mut Value) {
    let Value::Object(members) = package else {
        panic!("binding package object")
    };
    let schema = members
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("schema"))
        .unwrap();
    let Value::Object(schema) = &mut schema.1 else {
        panic!("binding schema object")
    };
    let required = schema
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("required"))
        .unwrap();
    let Value::Array(required) = &mut required.1 else {
        panic!("schema required list")
    };
    required.push(Value::String(Utf16::from("trustedOverrideRequired")));
}
fn resources(mut binding: Value, mut stable: Value) -> CodegenResources {
    let tables = load("spec/extensions/tables/package.json");
    let actions = load("spec/extensions/actions/package.json");
    let tables_schema = member(&tables, "schema").clone();
    let actions_schema = member(&actions, "schema").clone();
    require_marker(&mut binding);
    require_marker(&mut stable);
    CodegenResources::new(
        ResourceSet::new(
            load("spec/core/schema.json"),
            load("spec/core/semantic-type-reference.schema.json"),
            load("spec/core/extension-package.schema.json"),
            load("spec/metamodel/generated/core-constraints.json"),
            load("spec/metamodel/generated/domain-policy.json"),
        ),
        tables,
        tables_schema,
        actions,
        actions_schema,
        binding,
        stable,
        &mut Context::catalog(),
    )
    .unwrap()
}

#[test]
fn trusted_binding_schema_override_is_used_for_access_binding_admission() {
    let corpus =
        load("tests/rust-core/fixtures/r3/binding-admission-review/frozen.json");
    let cases = umf_codegen::value::array_items(member(&corpus, "cases")).unwrap();
    let resources = resources(
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
    );
    let engine = CodegenEngine::new(&resources);
    for case_id in ["binding-legacy-postgresql", "binding-stable-postgresql"] {
        let case = cases
            .iter()
            .find(|case| {
                umf_codegen::value::string_member(case, "id")
                    .and_then(|s| s.to_utf8().ok())
                    .as_deref()
                    == Some(case_id)
            })
            .unwrap();
        let wrapper = member(case, "request");
        let actual = engine
            .generate_access_package(
                member(wrapper, "request"),
                member(wrapper, "profile"),
                &mut Context::ordinary(),
            )
            .unwrap();
        assert_eq!(
            umf_codegen::value::string_member(&actual, "outcome")
                .unwrap()
                .to_utf8()
                .unwrap(),
            "refused"
        );
        let diagnostics = umf_codegen::value::array_items(member(&actual, "diagnostics")).unwrap();
        assert!(
            diagnostics.iter().any(|diagnostic| {
                umf_codegen::value::string_member(diagnostic, "accessCode")
                    .and_then(|s| s.to_utf8().ok())
                    .as_deref()
                    == Some("ACCESS_REFERENCE")
                    && umf_codegen::value::string_member(diagnostic, "pointer")
                        .and_then(|s| s.to_utf8().ok())
                        .is_some_and(|p| p.ends_with("/columns/0/binding"))
            }),
            "overridden registered schema was ignored for {case_id}"
        );
    }
}
