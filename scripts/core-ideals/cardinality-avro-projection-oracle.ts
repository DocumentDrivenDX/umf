import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {avroCardinalityProjectionCases} from './cardinality-avro-projection-cases';
import {projectCardinalityToAvro,recoverCardinalityFromAvro} from '../../src/core-ideals/cardinality-avro-projection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const rows=[];let blocked=0,recoveries=0;
for(const c of avroCardinalityProjectionCases()){
 const r=projectCardinalityToAvro(c.author,c.request);if(!r.nativeBundle){blocked++;rows.push({id:c.id,status:r.status});continue;}
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;assert.deepEqual(recoverCardinalityFromAvro(saved,saved.nativeBundle!),c.author.target);recoveries++;}
 rows.push({id:c.id,status:r.status,bundle:r.nativeBundle,sample:c.sample,expectedValue:c.expectedValue});
}
await Bun.write('fixtures/validation/cardinality-avro-projection-candidates.json',JSON.stringify({rows,blocked,recoveries},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/cardinality-avro-projection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);
const paths=['scripts/core-ideals/cardinality-avro-projection-oracle.ts','scripts/core-ideals/cardinality-avro-projection-native.py','scripts/core-ideals/cardinality-avro-projection-cases.ts','src/core-ideals/cardinality-avro-projection.ts','src/core-ideals/avro-cardinality-type.ts','spec/core/cardinality-avro-projection.schema.json','fixtures/validation/cardinality-avro-projection-candidates.json','fixtures/validation/cardinality-avro-projection-native.json'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-avro-projection-oracle.json',JSON.stringify({scope:'Explicit Avro carrier projection and retained ideal recovery; binding acceptance remains pending',cases:rows.length,blocked,recoveries,sha256},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,blocked,recoveries}));
