// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, setDefaultTimeout, test} from 'bun:test';
import {createRequire} from 'node:module';
import {coreElementSelectionHostInput} from '../src/host-json.js';
import {UmfCoreError} from '../index.js';
import {readFileSync} from 'node:fs';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const require = createRequire(import.meta.url);
const addon = require(process.env.UMF_SELECTION_ADDON ?? '../umf_core_node.node');
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const packet = JSON.parse(readFileSync(new URL('../../../../scripts/rust-migration/r5/selection/input.json', import.meta.url), 'utf8'));
const frozen = JSON.parse(readFileSync(new URL('../../../../scripts/rust-migration/r5/selection/frozen-typescript.json', import.meta.url), 'utf8'));
setDefaultTimeout(30_000);

test('private host Selection route matches the complete frozen R5 result with an omitted Registry', () => {
  const output = coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, undefined, UmfCoreError);
  expect(output).toEqual(frozen.cases.all);
});

test('private host Selection defers Registry.get until source admission and preserves lookup throw identity', () => {
  const malformedSource = structuredClone(packet.source);
  delete malformedSource.modules[0].elements[0].id;
  const sentinel = {registryTrap: true};
  let calls = 0;
  const registry = {get() { calls++; throw sentinel; }};
  expect(() => coreElementSelectionHostInput(addon, resources, malformedSource, packet.queries.all, registry, UmfCoreError))
    .toThrow(expect.objectContaining({code: 'CORE_SELECTION_SOURCE'}));
  expect(calls).toBe(0);

  const invalidQuery = {references: 'none', names: [17]};
  expect(() => coreElementSelectionHostInput(addon, resources, packet.source, invalidQuery, registry, UmfCoreError))
    .toThrow(expect.objectContaining({code: 'CORE_SELECTION_QUERY'}));
  expect(calls).toBe(0);

  const validRegistry = {get() { calls++; throw sentinel; }};
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, validRegistry, UmfCoreError);
    throw new Error('expected Registry.get throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
  expect(calls).toBe(1);
});

test('private host Selection refuses an opaque registration before reading caller-owned fields', () => {
  let reads = 0;
  const registration = new Proxy({}, {get() { reads++; throw new Error('must stay opaque'); }});
  const registry = {get() { return registration; }};
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, registry, UmfCoreError);
    throw new Error('expected staged-registration boundary');
  } catch (error) {
    expect(error).toBeInstanceOf(UmfCoreError);
    expect(error.code).toBe('HOST_JSON_UNSUPPORTED');
  }
  expect(reads).toBe(0);
});
