// SPDX-License-Identifier: MIT OR Apache-2.0
//! The public fixed-cohort accessor must expose exactly the bytes and identity
//! UMF's generators, CLI handshake and Python wheel snapshot already use.
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use umf_codegen::{
    release_manifest_json, release_manifest_sha256, release_resource, release_resource_digests,
    release_resources, CodegenEngine, CodegenResources,
};
use umf_core::{serialization::Format, Context, ResourceSet, Utf16, Value};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[test]
fn cohort_is_the_ten_named_resources_in_manifest_order() {
    let names: Vec<_> = release_resources().iter().map(|r| r.name).collect();
    assert_eq!(
        names,
        [
            "actions.package.json",
            "binding.package.json",
            "core.constraints.json",
            "core.domain-policy.json",
            "core.package-schema.json",
            "core.reference-schema.json",
            "core.schema.json",
            "saga.package.json",
            "stable-binding.package.json",
            "tables.package.json",
        ]
    );
    assert!(release_resource("saga.package.json").is_some());
    assert!(release_resource("missing.json").is_none());
}

#[test]
fn embedded_bytes_are_the_tracked_spec_files() {
    // Generator currency of the spec files themselves is proven by
    // `bun scripts/metamodel/build.ts --check`; this proves the accessor embeds
    // exactly those tracked files.
    for resource in release_resources() {
        let on_disk = std::fs::read(root().join(resource.source_path)).unwrap();
        assert_eq!(resource.bytes, on_disk.as_slice(), "{}", resource.name);
        assert_eq!(resource.sha256(), hex(&on_disk), "{}", resource.name);
    }
}

#[test]
fn digests_equal_the_python_wheel_manifest_and_pin() {
    let manifest = include_bytes!(
        "../../../python/umf_codegen/src/umf_codegen/_resources/manifest.json"
    );
    assert_eq!(release_manifest_json().as_bytes(), manifest.as_slice());
    assert_eq!(release_manifest_sha256(), hex(manifest));
    let release = include_str!("../../../python/umf_codegen/src/umf_codegen/_release.py");
    let pin = format!("RESOURCE_MANIFEST_SHA256 = \"{}\"", release_manifest_sha256());
    assert!(release.lines().any(|line| line == pin));
    let digests = release_resource_digests();
    assert_eq!(digests.len(), 10);
    for (name, digest) in digests {
        let wheel_copy = std::fs::read(
            root()
                .join("python/umf_codegen/src/umf_codegen/_resources")
                .join(name),
        )
        .unwrap();
        assert_eq!(digest, hex(&wheel_copy), "{name}");
    }
}

fn parse(name: &str) -> Value {
    let resource = release_resource(name).unwrap();
    umf_codegen::value::read_source_value(
        &Utf16::from(std::str::from_utf8(resource.bytes).unwrap()),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn explicit_with_tables_schema(tables_schema: Option<Value>) -> Result<CodegenResources, umf_core::EngineError> {
    let tables = parse("tables.package.json");
    let actions = parse("actions.package.json");
    let tables_schema = tables_schema
        .unwrap_or_else(|| umf_codegen::value::member(&tables, "schema").unwrap().clone());
    let actions_schema = umf_codegen::value::member(&actions, "schema").unwrap().clone();
    CodegenResources::new(
        ResourceSet::new(
            parse("core.schema.json"),
            parse("core.reference-schema.json"),
            parse("core.package-schema.json"),
            parse("core.constraints.json"),
            parse("core.domain-policy.json"),
        ),
        tables,
        tables_schema,
        actions,
        actions_schema,
        parse("binding.package.json"),
        parse("stable-binding.package.json"),
        &mut Context::catalog(),
    )
}

fn explicit() -> CodegenResources {
    explicit_with_tables_schema(None).unwrap()
}

fn explicit_with_sagas() -> CodegenResources {
    let saga = parse("saga.package.json");
    let schema = umf_codegen::value::member(&saga, "schema").unwrap().clone();
    explicit()
        .with_sagas(saga, schema, &mut Context::catalog())
        .unwrap()
}

fn inspect(resources: &CodegenResources) -> Value {
    let document = umf_codegen::value::read_source_value(
        &Utf16::from(include_str!("../../../fixtures/access/commerce/engine-only.json")),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap();
    let selected = umf_codegen::value::read_source_value(
        &Utf16::from(r#"[{"module":"commerce","element":"Order"}]"#),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap();
    CodegenEngine::new(resources)
        .inspect_access_views(
            &document,
            &selected,
            &Value::Array(Vec::new()),
            &Value::string_utf8("logical"),
            &mut Context::ordinary(),
        )
        .unwrap()
}

#[test]
fn release_matches_the_explicit_nine_resource_engine() {
    let release = CodegenResources::release(&mut Context::catalog()).unwrap();
    assert_eq!(inspect(&release), inspect(&explicit()));
}

#[test]
fn release_with_sagas_matches_the_explicit_ten_resource_engine() {
    let release = CodegenResources::release_with_sagas(&mut Context::catalog()).unwrap();
    assert_eq!(inspect(&release), inspect(&explicit_with_sagas()));
}

#[test]
fn malformed_resource_is_refused_through_the_public_constructor() {
    // A tables schema without `$id` reaches CODEGEN_RESOURCE_INVALID.
    let error = explicit_with_tables_schema(Some(Value::Object(Vec::new()))).unwrap_err();
    assert_eq!(error.code, "CODEGEN_RESOURCE_INVALID");
}
