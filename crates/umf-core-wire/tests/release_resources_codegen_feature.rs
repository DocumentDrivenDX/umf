// SPDX-License-Identifier: MIT OR Apache-2.0
//! The fixed codegen resource accessor is reachable through umf-core-wire's
//! `codegen` feature without that crate's other default features. Note that
//! `umf-codegen` itself depends on `umf-core` with default features, so
//! `umf-core`'s defaults (including `embedded-adapters`) are enabled whenever
//! `umf-codegen` is in the graph; this test does not prove otherwise.
//! Run with `--no-default-features --features codegen`.
#![cfg(feature = "codegen")]

#[test]
fn accessor_is_reachable_through_the_codegen_feature() {
    let mut ctx = umf_core::Context::catalog();
    let resources = umf_codegen::CodegenResources::release(&mut ctx).unwrap();
    let _engine = umf_codegen::CodegenEngine::new(&resources);
    umf_codegen::CodegenResources::release_with_sagas(&mut ctx).unwrap();
    assert_eq!(umf_codegen::release_resources().len(), 10);
    assert_eq!(umf_codegen::release_manifest_sha256().len(), 64);
}
