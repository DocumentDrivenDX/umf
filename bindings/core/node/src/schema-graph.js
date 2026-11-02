// SPDX-License-Identifier: MIT OR Apache-2.0

/** Fail closed when a Node addon predates any V4 schema graph operation. */
export function requireSchemaGraphProviders(binding) {
  if (typeof binding?.domainPackSchemaGraphJson !== 'function' || typeof binding?.datasetSourceSchemaGraphJson !== 'function' || typeof binding?.artifactCollectionSchemaGraphJson !== 'function' || typeof binding?.domainPackLoaderSchemaGraphJson !== 'function' || typeof binding?.loaderInventorySchemaGraphJson !== 'function') {
    throw new Error('RUST_NODE_BINDING_MISSING');
  }
  return Object.freeze({
    domainPackSchemaGraphJson: () => binding.domainPackSchemaGraphJson(),
    datasetSourceSchemaGraphJson: () => binding.datasetSourceSchemaGraphJson(),
    artifactCollectionSchemaGraphJson: () => binding.artifactCollectionSchemaGraphJson(),
    domainPackLoaderSchemaGraphJson: () => binding.domainPackLoaderSchemaGraphJson(),
    loaderInventorySchemaGraphJson: () => binding.loaderInventorySchemaGraphJson(),
  });
}
