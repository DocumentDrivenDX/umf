// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {inspectDomainPackLoaderWire} from '../index.js';
import {inspectDomainPackLoader as inspectDefault} from '../../../../src/index-node-v4.ts';
import {inspectDomainPackLoader as inspectReference} from '../../../../src/domain-packs/loader.ts';
import {withCatalogResourceProfile} from '../../../../src/model/json.ts';

const loader = {
  version: '1.0.0', id: 'umf.document-loader', implementation_version: '1.0.0',
  profile: 'documents', runtime: 'bun', entrypoint: 'run.ts',
  configuration_schema: 'inventory.schema.json', qualification: 'q',
  artifacts: [
    {reference: 'run.ts', sha256: 'a'.repeat(64)},
    {reference: 'inventory.schema.json', sha256: 'b'.repeat(64)},
  ],
};

test('default Node loader inspection matches the reference for lone UTF-16 surrogates', () => {
  const input = {
    ...loader,
    qualification: '\uD800',
    [`future_\uD800`]: '\uDFFF',
    artifacts: [{...loader.artifacts[0], annotation: '\uDFFF'}, {...loader.artifacts[1]}],
  };
  expect(inspectDefault.name).toBe('inspectDomainPackLoader');
  expect(inspectDefault.length).toBe(1);
  expect(inspectDefault(input)).toEqual(inspectReference(input));
});

test('default Node loader inspection accepts the host maximum depth in unknown annotations', () => {
  let deep = null;
  for (let index = 0; index < 127; index++) deep = [deep];
  const input = {...loader, future_annotation: deep};
  expect(inspectDefault(input)).toEqual(inspectReference(input));
  expect(JSON.parse(inspectDomainPackLoaderWire(JSON.stringify(input)))).toEqual(inspectReference(input));
});

test('Rust wire and default Node route retain catalog-profile value capacity', () => {
  const input = {...loader, future_annotation: Array.from({length: 100_001}, () => true)};
  const reference = withCatalogResourceProfile(() => inspectReference(input));
  expect(withCatalogResourceProfile(() => inspectDefault(input))).toEqual(reference);
  expect(JSON.parse(inspectDomainPackLoaderWire(JSON.stringify(input)))).toEqual(reference);
});
