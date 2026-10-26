// SPDX-License-Identifier: MIT OR Apache-2.0
// Isolated direct TypeScript predecessor run with a synthetic warning policy.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const packet = JSON.parse(readFileSync(resolve(root, 'scripts/rust-migration/r5/selection/input.json'), 'utf8'));
const nativeFreeze = Object.freeze;
Object.freeze = value => value;
let result;
const events = [];
let diagnosticStringifies = 0;
let registryThrownIdentity = false;
try {
  const [{selectCoreElements}, {currentDomainPolicy}] = await Promise.all([
    import(resolve(root, 'src/model/selection.ts')),
    import(resolve(root, 'src/validation/current-policy.ts')),
  ]);
  currentDomainPolicy.extensions.structure.severity = 'warning';
  const structure = () => false;
  const errors = [
    {get instancePath() { events.push('instancePath'); return '/first'; }, get message() { events.push('message'); return 'first warning'; }},
    {get instancePath() { events.push('instancePath'); return '/second'; }, get message() { events.push('message'); return 'second warning'; }},
  ];
  Object.defineProperty(structure, 'errors', {get() { events.push('errors'); return errors; }});
  const registration = {
    manifest: {scopes: {includes: () => true}, capabilities: {validation: 'none'}},
    structure,
  };
  const nativeStringify = JSON.stringify;
  JSON.stringify = function(value, ...args) {
    if (Array.isArray(value) && value[0]?.code === 'EXTENSION_STRUCTURE') diagnosticStringifies++;
    return Reflect.apply(nativeStringify, this, [value, ...args]);
  };
  try {
    result = selectCoreElements(packet.source, packet.queries.all, {get: () => registration});
  } finally {
    JSON.stringify = nativeStringify;
  }
  const sentinel = {directRegistryThrow: true};
  try {
    selectCoreElements(packet.source, packet.queries.all, {get() { throw sentinel; }});
  } catch (error) {
    registryThrownIdentity = error === sentinel;
  }
} finally {
  Object.freeze = nativeFreeze;
}
console.log(JSON.stringify({sourceValidation: result.sourceValidation,
  rootPrototype: Object.getPrototypeOf(result) === null ? 'null' : 'other',
  validationPrototype: Object.getPrototypeOf(result.sourceValidation) === null ? 'null' : 'other',
  diagnosticStringifies, events, registryThrownIdentity}));
