// SPDX-License-Identifier: MIT OR Apache-2.0
//! The fixed resource cohort of this UMF source, with its identity.
//!
//! UMF owns the ten resources a codegen engine needs: nine source resources
//! (the core schema, reference schema, package schema, constraints, domain
//! policy and the tables, actions, binding and stable-binding extension
//! packages) plus the saga package as the tenth. The bytes are embedded at
//! compile time from UMF's own `spec/` tree, so a downstream crate that
//! depends on this crate needs no resource files of its own.
//!
//! Nothing here touches the filesystem, clock, environment or threads. The
//! names are the cohort's wire names, shared with `umf codegen --version`,
//! the resource manifest and the Python `umf_codegen` wheel.

use crate::resources::CodegenResources;
use sha2::{Digest, Sha256};
use umf_core::{serialization::Format, Context, EngineError, ResourceSet, Utf16, Value};

/// Manifest profile identifying the ten-resource cohort handshake.
pub const RESOURCE_PROFILE: &str = "umf.codegen-resources/1";

/// One fixed resource: its cohort name, UMF source path and exact bytes.
#[derive(Clone, Copy, Debug)]
pub struct ReleaseResource {
    /// Cohort name, e.g. `core.schema.json`. Stable across the CLI, manifest
    /// and Python wheel.
    pub name: &'static str,
    /// Repository-relative path the bytes are embedded from.
    pub source_path: &'static str,
    /// The exact resource bytes (UTF-8 JSON).
    pub bytes: &'static [u8],
}

impl ReleaseResource {
    /// Lowercase hexadecimal SHA-256 of [`Self::bytes`].
    pub fn sha256(&self) -> String {
        sha256_hex(self.bytes)
    }
}

const fn resource(
    name: &'static str,
    source_path: &'static str,
    bytes: &'static [u8],
) -> ReleaseResource {
    ReleaseResource { name, source_path, bytes }
}

/// All ten resources, sorted by name (the manifest order).
static RESOURCES: [ReleaseResource; 10] = [
    resource(
        "actions.package.json",
        "spec/extensions/actions/package.json",
        include_bytes!("../../../spec/extensions/actions/package.json"),
    ),
    resource(
        "binding.package.json",
        "spec/extensions/binding/package.json",
        include_bytes!("../../../spec/extensions/binding/package.json"),
    ),
    resource(
        "core.constraints.json",
        "spec/metamodel/generated/core-constraints.json",
        include_bytes!("../../../spec/metamodel/generated/core-constraints.json"),
    ),
    resource(
        "core.domain-policy.json",
        "spec/metamodel/generated/domain-policy.json",
        include_bytes!("../../../spec/metamodel/generated/domain-policy.json"),
    ),
    resource(
        "core.package-schema.json",
        "spec/core/extension-package.schema.json",
        include_bytes!("../../../spec/core/extension-package.schema.json"),
    ),
    resource(
        "core.reference-schema.json",
        "spec/core/semantic-type-reference.schema.json",
        include_bytes!("../../../spec/core/semantic-type-reference.schema.json"),
    ),
    resource(
        "core.schema.json",
        "spec/core/schema.json",
        include_bytes!("../../../spec/core/schema.json"),
    ),
    resource(
        "saga.package.json",
        "spec/extensions/saga/package.json",
        include_bytes!("../../../spec/extensions/saga/package.json"),
    ),
    resource(
        "stable-binding.package.json",
        "spec/extensions/binding-stable/package.json",
        include_bytes!("../../../spec/extensions/binding-stable/package.json"),
    ),
    resource(
        "tables.package.json",
        "spec/extensions/tables/package.json",
        include_bytes!("../../../spec/extensions/tables/package.json"),
    ),
];

/// The fixed ten-resource cohort of this UMF source, sorted by name.
pub fn release_resources() -> &'static [ReleaseResource] {
    &RESOURCES
}

/// Look up one resource by its cohort name.
pub fn release_resource(name: &str) -> Option<&'static ReleaseResource> {
    RESOURCES.iter().find(|resource| resource.name == name)
}

/// Per-resource `(name, sha256)` pairs in manifest order.
pub fn release_resource_digests() -> Vec<(&'static str, String)> {
    RESOURCES.iter().map(|r| (r.name, r.sha256())).collect()
}

/// The canonical manifest bytes whose SHA-256 is the cohort handshake digest:
/// compact, key-sorted JSON `{"files":{name:sha256,...},"profile":...}` plus a
/// trailing newline. Identical to `manifest.json` in the Python wheel.
pub fn release_manifest_json() -> String {
    let mut text = String::from("{\"files\":{");
    for (index, resource) in RESOURCES.iter().enumerate() {
        if index > 0 {
            text.push(',');
        }
        text.push('"');
        text.push_str(resource.name);
        text.push_str("\":\"");
        text.push_str(&resource.sha256());
        text.push('"');
    }
    text.push_str("},\"profile\":\"");
    text.push_str(RESOURCE_PROFILE);
    text.push_str("\"}\n");
    text
}

/// Lowercase hexadecimal SHA-256 of [`release_manifest_json`]: the cohort
/// digest a caller records to say exactly which resources it compiled with.
pub fn release_manifest_sha256() -> String {
    sha256_hex(release_manifest_json().as_bytes())
}

fn sha256_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(64);
    for byte in Sha256::digest(bytes) {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 15) as usize] as char);
    }
    out
}

fn invalid_resource() -> EngineError {
    EngineError::new(
        "CODEGEN_RESOURCE_INVALID",
        Utf16::default(),
        "Embedded codegen resource is invalid",
    )
}

fn parse(name: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let resource = release_resource(name).ok_or_else(invalid_resource)?;
    let text = std::str::from_utf8(resource.bytes).map_err(|_| invalid_resource())?;
    umf_core::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}

fn schema_of(package: &Value) -> Result<Value, EngineError> {
    crate::value::member(package, "schema")
        .cloned()
        .ok_or_else(invalid_resource)
}

impl CodegenResources {
    /// Build the engine resources from UMF's own fixed cohort, including the
    /// saga package as the tenth resource. The cohort is identified by
    /// [`release_manifest_sha256`] and the per-resource digests.
    ///
    /// `ctx` meters the admission and compilation work, as for
    /// [`CodegenResources::new`]; `Context::catalog()` is the context UMF's
    /// own CLI uses.
    pub fn release(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let tables = parse("tables.package.json", ctx)?;
        let actions = parse("actions.package.json", ctx)?;
        let binding = parse("binding.package.json", ctx)?;
        let stable_binding = parse("stable-binding.package.json", ctx)?;
        let tables_schema = schema_of(&tables)?;
        let actions_schema = schema_of(&actions)?;
        let core = ResourceSet::new(
            parse("core.schema.json", ctx)?,
            parse("core.reference-schema.json", ctx)?,
            parse("core.package-schema.json", ctx)?,
            parse("core.constraints.json", ctx)?,
            parse("core.domain-policy.json", ctx)?,
        );
        let resources = Self::new(
            core,
            tables,
            tables_schema,
            actions,
            actions_schema,
            binding,
            stable_binding,
            ctx,
        )?;
        let saga = parse("saga.package.json", ctx)?;
        let saga_schema = schema_of(&saga)?;
        resources.with_sagas(saga, saga_schema, ctx)
    }
}
