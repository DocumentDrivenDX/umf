/** Native discovery prerequisite. Authored projection is not implemented here. */
import assert from 'node:assert/strict';
const p=Bun.spawn(['.venv/bin/python','scripts/core-ideals/key-avro-discovery-native.py'],{stdout:'inherit',stderr:'inherit'});
assert.equal(await p.exited,0,'Pinned Avro native discovery failed');
