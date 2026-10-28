import {expect, test} from 'bun:test';
import {requireSchemaGraphProviders} from '../src/schema-graph.js';

test('Node V4 schema graph providers require both new Rust exports at initialization', () => {
  expect(() => requireSchemaGraphProviders({})).toThrow('RUST_NODE_BINDING_MISSING');
  expect(() => requireSchemaGraphProviders({domainPackSchemaGraphJson() { return '{}'; }})).toThrow('RUST_NODE_BINDING_MISSING');

  const calls = [];
  const providers = requireSchemaGraphProviders({
    domainPackSchemaGraphJson() { calls.push('domain-pack'); return '{"schema":{},"aliasGroups":[]}'; },
    datasetSourceSchemaGraphJson() { calls.push('dataset-source'); return '{"schema":{},"aliasGroups":[]}'; },
  });
  expect(providers.domainPackSchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(providers.datasetSourceSchemaGraphJson()).toBe('{"schema":{},"aliasGroups":[]}');
  expect(calls).toEqual(['domain-pack', 'dataset-source']);
});
