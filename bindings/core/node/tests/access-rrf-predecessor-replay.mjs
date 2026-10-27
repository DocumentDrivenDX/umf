// Replay the pure Rust scorer against frozen CONTRACT-074 Python outcomes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createAccessRrfEngine} from '../index.js';
import {compareRrfReplay, prepareRrfReplayCases} from './access-rrf-replay.js';

const root = resolve(import.meta.dirname, '../../../..');
const packet = JSON.parse(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-postgres-search-rrf-20261027/predecessor.json'), 'utf8'));
const cases = prepareRrfReplayCases(packet);
const engine = createAccessRrfEngine({controls: {maxWork: 100_000}});
const result = compareRrfReplay(engine, cases);
console.log(JSON.stringify({format: 'umf-r8-access-rrf-node-current-source/1', profile: engine.profile, ...result}));
assert.equal(result.mismatches.length, 0);
