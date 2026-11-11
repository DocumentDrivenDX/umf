// SPDX-License-Identifier: MIT OR Apache-2.0
//! The public fixed-cohort accessor must expose exactly the bytes and identity
//! UMF's generators, CLI handshake and Python wheel snapshot already use.
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use umf_codegen::{
    release_manifest_json, release_manifest_sha256, release_resource, release_resource_digests,
    release_resources, CodegenResources,
};
use umf_core::Context;

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
fn bytes_equal_the_spec_files_the_generators_produce() {
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

#[test]
fn release_resources_build_with_sagas_without_caller_files() {
    CodegenResources::release(&mut Context::catalog()).unwrap();
}
