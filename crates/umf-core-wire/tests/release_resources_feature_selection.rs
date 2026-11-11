// SPDX-License-Identifier: MIT OR Apache-2.0
//! Downstream feature selection: `umf-core` with `default-features = false,
//! features = ["full-core"]` plus `umf-codegen` must build the fixed cohort
//! without caller-supplied resource files.
//! Run with `--no-default-features --features codegen`.
#![cfg(feature = "codegen")]

#[test]
fn fixed_cohort_builds_under_the_full_core_feature_selection() {
    let mut ctx = umf_core::Context::catalog();
    let resources = umf_codegen::CodegenResources::release(&mut ctx).unwrap();
    let _engine = umf_codegen::CodegenEngine::new(&resources);
    assert_eq!(umf_codegen::release_resources().len(), 10);
    assert_eq!(umf_codegen::release_manifest_sha256().len(), 64);
}
