// SPDX-License-Identifier: MIT OR Apache-2.0

/** Fail closed when a Node addon predates either V4 schema graph operation. */
export function requireSchemaGraphProviders(binding) {
  if (typeof binding?.domainPackSchemaGraphJson !== 'function' || typeof binding?.datasetSourceSchemaGraphJson !== 'function') {
    throw new Error('RUST_NODE_BINDING_MISSING');
  }
  return Object.freeze({
    domainPackSchemaGraphJson: () => binding.domainPackSchemaGraphJson(),
    datasetSourceSchemaGraphJson: () => binding.datasetSourceSchemaGraphJson(),
  });
}
