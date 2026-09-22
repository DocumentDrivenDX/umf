import {facetsAvroProjectionCases} from './facets-avro-projection-cases';
import {projectFacetsToAvro,recoverFacetsFromAvro} from '../../src/core-ideals/facets-avro-projection';
import assert from 'node:assert/strict';
const rows=facetsAvroProjectionCases(),targets=[];
for(const row of rows){const r=projectFacetsToAvro(row.author,row.request);if(r.status==='blocked'){assert.equal(r.target,undefined);assert.ok(r.residuals.length);continue;}assert.deepEqual(recoverFacetsFromAvro(r,r.nativeSchema!),row.author.target);targets.push({id:row.id,request:row.request,schema:r.nativeSchema});}
await Bun.write('fixtures/validation/facets-avro-projection-targets.json',JSON.stringify(targets,null,2)+'\n');
const native=Bun.spawn(['.venv/bin/python','scripts/core-ideals/facets-avro-projection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await native.exited,0);
console.log(JSON.stringify({cases:rows.length,emitted:targets.length,blocked:rows.length-targets.length}));
