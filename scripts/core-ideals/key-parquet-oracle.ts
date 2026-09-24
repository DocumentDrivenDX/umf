/** Native discovery prerequisite; authored Key projection has separate future evidence. */
import assert from 'node:assert/strict';
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/key-parquet-discovery-native.py'],{stdout:'inherit',stderr:'inherit'});
assert.equal(await child.exited,0,'Pinned Parquet native discovery failed');
