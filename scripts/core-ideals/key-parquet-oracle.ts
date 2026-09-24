/** Host-only native discovery and generated authored-carrier execution. */
import assert from 'node:assert/strict';
for(const command of [
 ['.venv/bin/python','scripts/core-ideals/key-parquet-discovery-native.py'],
 ['bun','scripts/core-ideals/key-parquet-projection-oracle.ts']
]){
 const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'});
 assert.equal(await child.exited,0,'Pinned Parquet native oracle failed: '+command.at(-1));
}
