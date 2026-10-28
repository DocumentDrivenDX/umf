import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseAccessTemporal, ACCESS_TEMPORAL_PROFILE } from '../../../../src/adapters/access-temporal';

const predecessorPath = 'docs/helix/04-build/evidence/rust-migration/r5-access-temporal/predecessor.json';
const predecessorBytes = readFileSync(predecessorPath);
const predecessor = JSON.parse(predecessorBytes.toString('utf8'));
const cases = predecessor.cases.filter((candidate: { hostOnly?: boolean }) => !candidate.hostOnly);
assert.equal(cases.length, 48, 'expected the complete tagged subset of the pinned R5 packet');
assert.equal(predecessor.profile, ACCESS_TEMPORAL_PROFILE);

for (const candidate of cases) {
  let actual: Record<string, unknown>;
  try {
    actual = { status: 'ok', value: parseAccessTemporal(candidate.input.kind, candidate.input.token) };
  } catch (error) {
    const e = error as Error;
    actual = { status: 'error', name: e.name, message: e.message };
  }
  assert.deepEqual(actual, candidate.outcome, `TypeScript predecessor drift: ${candidate.id}`);
}

const sources = [
  'src/adapters/access-temporal.ts',
  'src/adapters/gregorian-date.ts',
  'src/adapters/rfc3339-exact-instant.ts',
  predecessorPath,
  'docs/helix/02-design/contracts/CONTRACT-065-rfc3339-exact-instant.md',
  'docs/helix/02-design/contracts/CONTRACT-066-gregorian-date-operations.md',
  'docs/helix/02-design/contracts/CONTRACT-075-access-temporal-profile.md',
];
const sourceHashes = Object.fromEntries(sources.map((path) => [
  path,
  createHash('sha256').update(readFileSync(path)).digest('hex'),
]));
const packet = {
  format: 'umf-r8-access-temporal-reference/1',
  profile: ACCESS_TEMPORAL_PROFILE,
  operation: 'parseAccessTemporal',
  predecessor: predecessorPath,
  predecessorSha256: createHash('sha256').update(predecessorBytes).digest('hex'),
  sourceHashes,
  cases,
};
const output = 'docs/helix/04-build/evidence/rust-migration/r8-access-temporal/reference-packet.json';
writeFileSync(output, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Captured ${cases.length} TypeScript reference cases to ${output}`);
