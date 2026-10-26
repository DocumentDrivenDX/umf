// SPDX-License-Identifier: MIT OR Apache-2.0
// Authored external resources required to compile the Rust metamodel CLI.
// Keep this list shared by source fingerprinting and generated provenance.
export const rustCompileResources = [
  'spec/core/cardinality-operation-v4.schema.json',
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
