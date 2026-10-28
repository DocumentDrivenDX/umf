import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseAccessTemporal, ACCESS_TEMPORAL_PROFILE } from '../../../../src/adapters/access-temporal';

const packet = JSON.parse(readFileSync(
  'docs/helix/04-build/evidence/rust-migration/r8-access-temporal/reference-packet.json',
  'utf8',
));
for (const [path, expected] of Object.entries(packet.sourceHashes as Record<string, string>)) {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(actual, expected, `source drift: ${path}`);
}
assert.equal(packet.profile, ACCESS_TEMPORAL_PROFILE);
assert.equal(packet.operation, 'parseAccessTemporal');
for (const candidate of packet.cases) {
  let actual: Record<string, unknown>;
  try {
    actual = { status: 'ok', value: parseAccessTemporal(candidate.input.kind, candidate.input.token) };
  } catch (error) {
    const e = error as Error;
    actual = { status: 'error', name: e.name, message: e.message };
  }
  assert.deepEqual(actual, candidate.outcome, candidate.id);
}
console.log(`R8 TypeScript reference matched ${packet.cases.length}/${packet.cases.length} cases on Bun ${Bun.version}`);
