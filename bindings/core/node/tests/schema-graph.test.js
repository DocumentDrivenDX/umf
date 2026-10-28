import {expect, test} from 'bun:test';
import {requireSchemaGraphProviders} from '../src/schema-graph.js';

test('Node V4 schema graph providers require all Rust exports at initialization', () => {
  expect(() => requireSchemaGraphProviders({})).toThrow('RUST_NODE_BINDING_MISSING');
  expect(() => requireSchemaGraphProviders({domainPackSchemaGraphJson() { return '{}'; }})).toThrow('RUST_NODE_BINDING_MISSING');
  expect(() => requireSchemaGraphProviders({
    domainPackSchemaGraphJson() { return '{}'; },
    datasetSourceSchemaGraphJson() { return '{}'; },
  })).toThrow('RUST_NODE_BINDING_MISSING');
  expect(() => requireSchemaGraphProviders({
    domainPackSchemaGraphJson() { return '{}'; },
    datasetSourceSchemaGraphJson() { return '{}'; },
    artifactCollectionSchemaGraphJson() { return '{}'; },
    domainPackLoaderSchemaGraphJson() { return '{}'; },
  })).toThrow('RUST_NODE_BINDING_MISSING');

  const calls = [];
  const providers = requireSchemaGraphProviders({
    domainPackSchemaGraphJson() { calls.push('domain-pack'); return '{"schema":{},"aliasGroups":[]}'; },
    datasetSourceSchemaGraphJson() { calls.push('dataset-source'); return '{"schema":{},"aliasGroups":[]}'; },
    artifactCollectionSchemaGraphJson() { calls.push('artifact-collection'); return '{"schema":{},"aliasGroups":[]}'; },
    domainPackLoaderSchemaGraphJson() { calls.push('domain-pack-loader'); return '{"schema":{},"aliasGroups":[]}'; },
    loaderInventorySchemaGraphJson() { calls.push('loader-inventory'); return '{"schema":{},"aliasGroups":[]}'; },
  });
  expect(providers.domainPackSchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(providers.datasetSourceSchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(providers.artifactCollectionSchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(providers.domainPackLoaderSchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(providers.loaderInventorySchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(calls).toEqual(['domain-pack', 'dataset-source', 'artifact-collection', 'domain-pack-loader', 'loader-inventory']);
});
