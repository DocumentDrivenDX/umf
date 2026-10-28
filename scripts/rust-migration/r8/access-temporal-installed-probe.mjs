import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const packet = JSON.parse(await readFile(process.argv[2], 'utf8'));
const api = await import('@umf/core');
const reference = await import('@umf/core/reference');
assert.equal(packet.cases.length, 48);
assert.equal(api.ACCESS_TEMPORAL_PROFILE, 'umf-access-temporal/0.1.0');

const outcome = (fn, input) => {
  try { return {status: 'ok', value: fn(input.kind, input.token)}; }
  catch (error) { return {status: 'error', name: error.name, message: error.message}; }
};
for (const candidate of packet.cases) {
  const actual = outcome(api.parseAccessTemporal, candidate.input);
  const expected = outcome(reference.parseAccessTemporal, candidate.input);
  assert.deepEqual(actual, candidate.outcome, `${candidate.id} installed default vs packet`);
  assert.deepEqual(expected, candidate.outcome, `${candidate.id} installed reference vs packet`);
  assert.deepEqual(actual, expected, `${candidate.id} installed default vs reference`);
}

let proxyTraps = 0;
let getterCalls = 0;
const proxy = new Proxy({}, {
  getPrototypeOf() { proxyTraps++; throw new Error('unexpected proxy observation'); },
  ownKeys() { proxyTraps++; throw new Error('unexpected proxy observation'); },
});
const accessor = Object.defineProperty({}, 'value', {
  enumerable: true,
  get() { getterCalls++; throw new Error('unexpected getter observation'); },
});
const rawInputs = [null, 42, {}, [], new Date(0), new String('2024-01-01'), proxy, accessor];
for (const token of rawInputs) {
  for (const fn of [api.parseAccessTemporal, reference.parseAccessTemporal]) {
    assert.throws(() => fn('date', token), error =>
      error instanceof TypeError && error.message === 'Access temporal requires text');
  }
}
assert.equal(proxyTraps, 0);
assert.equal(getterCalls, 0);
console.log(JSON.stringify({
  runtime: typeof Bun === 'undefined' ? `Node ${process.version}` : `Bun ${Bun.version}`,
  packageDefault: 'dist/umf-node.js', packageReference: 'dist/umf.js',
  taggedCases: `${packet.cases.length}/${packet.cases.length}`,
  packetParity: true, defaultReferenceParity: true,
  rawHostRefusals: `${rawInputs.length}/${rawInputs.length}`,
  proxyTraps, getterCalls,
}));
