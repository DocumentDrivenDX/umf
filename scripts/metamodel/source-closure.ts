// SPDX-License-Identifier: MIT OR Apache-2.0
// Authored external resources required to compile the Rust metamodel CLI.
// Keep this list shared by source fingerprinting and generated provenance.
export const rustCompileResources = [
  'spec/core/cardinality-operation-v6.schema.json',
  'spec/core/kind-operation-v8.schema.json',
  'spec/core/nullability-operation-v7.schema.json',
  'spec/extensions/tables/operation.schema.json',
];
// Rust packages compiled into the source-bound bootstrap executable.
export const rustCompilePackages = [
  'crates/umf-core',
  'crates/umf-metamodel',
  'crates/umf-tagged-wire',
  'crates/umf-metamodel-cli',
];
// Generated DATA derived from the metamodel outputs (tools/generate_codegen_resource_literals.py).
// It embeds the compiler digest, so it cannot be an input to that digest without a hash cycle.
// It is still listed in manifest sources/compilerInputs and still part of the build fingerprint.
export const compilerDigestExcluded = ['crates/umf-core/src/canonical_codegen_literals.rs'];
