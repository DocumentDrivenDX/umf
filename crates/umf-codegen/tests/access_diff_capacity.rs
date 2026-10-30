// SPDX-License-Identifier: MIT OR Apache-2.0
//! Access package archives have aggregate bounds independent of document parsing.
use std::{fs, path::Path};
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, ResourceSet, Value};
fn root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn load(path: &str) -> Value {
    let text = fs::read_to_string(root().join(path)).unwrap();
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::with_limits(
            umf_core::ResourceProfile::Cooperative,
            umf_core::Limits {
                max_text_units: 32 * 1024 * 1024,
                ..umf_core::Limits::catalog()
            },
        )
        .unwrap(),
    )
    .unwrap()
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn resources() -> CodegenResources {
    let t = load("spec/extensions/tables/package.json");
    let a = load("spec/extensions/actions/package.json");
    let ts = umf_codegen::value::member(&t, "schema").unwrap().clone();
    let as_ = umf_codegen::value::member(&a, "schema").unwrap().clone();
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
        as_,
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .unwrap()
}
#[test]
fn aggregate_archive_is_not_a_single_source_document() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let corpus =
        load("tests/rust-core/fixtures/r3/generation-review/frozen.json");
    let cases =
        umf_codegen::value::array_items(umf_codegen::value::member(&corpus, "cases").unwrap())
            .unwrap();
    let first = &cases[0];
    let expected = umf_codegen::value::member(first, "expected").unwrap();
    let before = umf_codegen::value::member(expected, "result").unwrap();
    let mut after = before.clone();
    if let Value::Object(members) = &mut after {
        let Value::Array(files) = &mut members
            .iter_mut()
            .find(|(k, _)| k == &"files".into())
            .unwrap()
            .1
        else {
            panic!("files")
        };
        for file in files {
            let Some(path) =
                umf_codegen::value::string_member(file, "path").and_then(|v| v.to_utf8().ok())
            else {
                continue;
            };
            if !path.ends_with("/_umf/sources.json") {
                continue;
            }
            let Value::Object(file) = file else {
                panic!("file")
            };
            let text = &mut file
                .iter_mut()
                .find(|(k, _)| k == &"text".into())
                .unwrap()
                .1;
            let Value::String(original) = text else {
                panic!("archive")
            };
            let mut archive = original
                .to_utf8()
                .unwrap()
                .trim_end()
                .trim_end_matches(']')
                .to_owned();
            for i in 0..2 {
                archive.push_str(&format!(
                    ",{{\"id\":\"unused-{i}\",\"format\":\"json\",\"text\":\""
                ));
                archive.push_str(&" ".repeat(2_100_000));
                archive.push_str("{\\\"umf\\\":\\\"0.10.0\\\",\\\"id\\\":\\\"unused\\\",\\\"vocabularies\\\":{},\\\"modules\\\":[]}\"}");
            }
            archive.push(']');
            *text = Value::string_utf8(archive);
        }
    }
    let files =
        umf_codegen::value::array_items(umf_codegen::value::member(&after, "files").unwrap())
            .unwrap();
    let archive = files
        .iter()
        .find(|f| {
            umf_codegen::value::string_member(f, "path")
                .unwrap()
                .to_utf8()
                .unwrap()
                .ends_with("/_umf/sources.json")
        })
        .and_then(|f| umf_codegen::value::string_member(f, "text"))
        .unwrap();
    assert!(archive.len() > 4_000_000);
    // This is the predecessor's mistaken single-source parse, isolated as a
    // control. The package operation must use its separate aggregate budget.
    let predecessor =
        read_json_value(archive.units(), Format::Json, &mut Context::ordinary()).unwrap_err();
    assert_eq!(predecessor.code, "LIMIT");
    let result = engine.diff_access_packages(before, &after, &mut Context::ordinary());
    assert!(
        result.is_ok(),
        "aggregate archive refused as a source: {result:?}"
    );
}
