// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent raw-value review: JavaScript own-key semantics stay local to
//! the compiler's source-defined Object.entries traversal, never the core wire.
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, ResourceSet, Utf16, Value};
fn parse(s: &str) -> Value {
    read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, k: &str) -> &'a Value {
    umf_codegen::value::member(v, k).unwrap()
}
fn load(path: &str) -> Value {
    parse(
        &std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../..")
                .join(path),
        )
        .unwrap(),
    )
}
fn resources() -> CodegenResources {
    let t = load("spec/extensions/tables/package.json");
    let a = load("spec/extensions/actions/package.json");
    let ts = get(&t, "schema").clone();
    let ac = get(&a, "schema").clone();
    CodegenResources::new(
        ResourceSet::new(
            load("spec/core/schema.json"),
            load("spec/core/semantic-type-reference.schema.json"),
            load("spec/core/extension-package.schema.json"),
            load("spec/metamodel/generated/core-constraints.json"),
            load("spec/metamodel/generated/domain-policy.json"),
        ),
        t,
        ts,
        a,
        ac,
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .unwrap()
}
#[test]
fn raw_deployment_group_aliases_use_numeric_ownkey_order() {
    let fixture = load(
        "docs/helix/04-build/evidence/rust-migration/r3/sol-second-numeric-keys-review/frozen.json",
    );
    let Value::Array(cases) = get(&fixture, "cases") else {
        panic!("cases")
    };
    let mut request = get(&cases[0], "request").clone();
    let Value::Object(request_members) = &mut request else {
        panic!("request")
    };
    let Value::Object(configuration) = &mut request_members
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("configuration"))
        .unwrap()
        .1
    else {
        panic!("configuration")
    };
    let aliases = &mut configuration
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("groupRoles"))
        .unwrap()
        .1;
    *aliases = Value::Object(vec![
        (Utf16::from("2"), Value::string_utf8("")),
        (Utf16::from("1"), Value::string_utf8("")),
    ]);
    let resources = resources();
    let actual = CodegenEngine::new(&resources)
        .compile_table_deployment(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&actual, get(get(&cases[0], "expected"), "result"));
}

#[test]
fn table_schema_hop_adapter_preserves_invocation_constraint_budget() {
    let fixture =
        load("docs/helix/04-build/evidence/rust-migration/r3/sol-second-shared-review/frozen.json");
    let Value::Array(cases) = get(&fixture, "cases") else {
        panic!("cases")
    };
    let request = get(&cases[0], "request");
    let Value::String(text) = get(request, "text") else {
        panic!("text")
    };
    let document = parse(&text.to_utf8().unwrap());
    let resources = resources();
    let mut context = Context::ordinary();
    for _ in 0..context.limits().max_constraint_steps {
        context.charge_constraint_step(Utf16::default()).unwrap();
    }
    let result = CodegenEngine::new(&resources).inspect_table_lifecycle(&document, &mut context);
    assert!(
        matches!(result,Err(ref error)if error.code=="LIMIT"),
        "exhausted caller constraint budget must refuse"
    );
}
