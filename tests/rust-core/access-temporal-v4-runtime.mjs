// SPDX-License-Identifier: MIT OR Apache-2.0
// Run with Node and Bun after `bun run build`.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as root from '../../dist/umf-node.js';

const packet = JSON.parse(readFileSync(new URL('../../docs/helix/04-build/evidence/rust-migration/r8-access-temporal/reference-packet.json', import.meta.url), 'utf8'));
assert.equal(root.ACCESS_TEMPORAL_PROFILE, 'umf-access-temporal/0.1.0');
for (const candidate of packet.cases) {
  let actual;
  try {
    const value = root.parseAccessTemporal(candidate.input.kind, candidate.input.token);
    assert.equal(Object.isFrozen(value), true, candidate.id);
    actual = {status: 'ok', value};
  } catch (error) {
    actual = {status: 'error', name: error.name, message: error.message};
  }
  assert.equal(JSON.stringify(actual), JSON.stringify(candidate.outcome), candidate.id);
}

let traps = 0;
let getters = 0;
const proxy = new Proxy({}, {
  getPrototypeOf() { traps++; throw Error('observed proxy'); },
  ownKeys() { traps++; throw Error('observed proxy'); },
});
const accessor = Object.defineProperty({}, 'value', {enumerable: true, get() { getters++; throw Error('observed getter'); }});
for (const token of [null, 42, {}, [], new Date(0), new String('2024-01-01'), proxy, accessor]) {
  assert.throws(() => root.parseAccessTemporal('date', token), error =>
    error instanceof TypeError && error.message === 'Access temporal requires text');
}
assert.equal(traps, 0);
assert.equal(getters, 0);
console.log(`V4 default access-temporal replay passed: ${packet.cases.length} tagged cases, eight raw-host refusals`);
