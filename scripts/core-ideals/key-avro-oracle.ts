/** Host-only native discovery and generated authored-carrier execution. */
import assert from 'node:assert/strict';
for(const command of [
 ['.venv/bin/python','scripts/core-ideals/key-avro-discovery-native.py'],
 ['bun','scripts/core-ideals/key-avro-projection-oracle.ts']
]){
 const p=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'});
 assert.equal(await p.exited,0,'Pinned Avro native oracle failed: '+command.at(-1));
}
