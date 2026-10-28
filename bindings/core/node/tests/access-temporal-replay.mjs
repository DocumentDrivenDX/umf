// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccessTemporalEngine, ACCESS_TEMPORAL_PROFILE} from '../index.js';

const packet = JSON.parse(readFileSync(new URL('../../../../docs/helix/04-build/evidence/rust-migration/r8-access-temporal/reference-packet.json', import.meta.url), 'utf8'));
assert.equal(packet.profile, ACCESS_TEMPORAL_PROFILE);
assert.equal(packet.operation, 'parseAccessTemporal');
const engine = createAccessTemporalEngine();
for (const candidate of packet.cases) {
  let actual;
  try {
    actual = {status: 'ok', value: engine.parseAccessTemporal(candidate.input.kind, candidate.input.token)};
  } catch (error) {
    actual = {status: 'error', name: error.name, message: error.message};
  }
  assert.deepEqual(actual, candidate.outcome, candidate.id);
}
console.log(`R8 native access-temporal matched ${packet.cases.length}/${packet.cases.length} cases on ${process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`}`);
