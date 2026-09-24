/** Host-only Key binding discovery and emitted native declaration verification. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tableSpecKeyProjectionCases} from './key-tablespec-projection-cases';
import {projectKeysToTableSpec} from '../../src/core-ideals/key-tablespec-projection';
import {exportTableSpec} from '../../src/adapters/tablespec';
const discovery=Bun.spawn(['bun','scripts/core-ideals/key-tablespec-discovery-oracle.ts'],{stdout:'inherit',stderr:'inherit'});assert.equal(await discovery.exited,0);
const rows=[];
for(const c of tableSpecKeyProjectionCases()){const r=projectKeysToTableSpec(c.source,c.authors,c.request);assert.equal(r.status,c.expected);if(r.target)rows.push({name:c.name,nativeText:exportTableSpec(r.target)});}
assert.equal(rows.length,7);
await Bun.write('fixtures/validation/key-tablespec-projected-schemas.json',JSON.stringify(rows,null,2)+'\n');
const python=process.env.UMF_TABLESPEC_PYTHON??'/home/erik/Projects/tablespec/.venv/bin/python';
const child=Bun.spawn([python,'scripts/core-ideals/key-tablespec-projection-oracle.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0,'Native Key projection probe failed');
const proof=await Bun.file('fixtures/validation/key-tablespec-projection-native.json').json();assert.equal(proof.rows.length,7);assert.equal(proof.nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
for(const [path,hash] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),hash,`Stale native proof: ${path}`);
console.log(JSON.stringify({projectedSchemas:rows.length,checkedFingerprints:Object.keys(proof.sha256).length,enforcementEstablished:false,bindingAcceptance:false}));
