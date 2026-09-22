import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {avroCardinalityProjectionCases} from './cardinality-avro-projection-cases';
import {projectCardinalityToAvro} from '../../src/core-ideals/cardinality-avro-projection';
import {verifyAvroCardinalityComposition} from './cardinality-avro-composition';
const rows=[];let blocked=0,recoveries=0,nativeRecoveries=0;
for(const c of avroCardinalityProjectionCases()){
 const r=projectCardinalityToAvro(c.author,c.request);if(!r.nativeBundle){blocked++;rows.push({id:c.id,status:r.status});continue;}
 const composed=verifyAvroCardinalityComposition(r);recoveries+=composed.idealRecoveries;nativeRecoveries+=composed.nativeRecoveries;
 rows.push({id:c.id,status:r.status,bundle:r.nativeBundle,composed,sample:c.sample,expectedValue:c.expectedValue});
}
await Bun.write('fixtures/validation/cardinality-avro-projection-candidates.json',JSON.stringify({rows,blocked,recoveries,nativeRecoveries},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/cardinality-avro-projection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);
const paths=['scripts/core-ideals/cardinality-avro-composition.ts','scripts/core-ideals/nullability-avro-cases.ts','src/core-ideals/cardinality-avro.ts','src/adapters/avro/index.ts','spec/core/avro-cardinality-classification.schema.json','scripts/core-ideals/cardinality-avro-projection-oracle.ts','scripts/core-ideals/cardinality-avro-projection-native.py','scripts/core-ideals/cardinality-avro-projection-cases.ts','src/core-ideals/cardinality-avro-projection.ts','src/core-ideals/avro-cardinality-type.ts','spec/core/cardinality-avro-projection.schema.json','fixtures/validation/cardinality-avro-projection-candidates.json','fixtures/validation/cardinality-avro-projection-native.json'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-avro-projection-oracle.json',JSON.stringify({scope:'Explicit Avro carrier projection and retained ideal recovery; binding acceptance remains pending',cases:rows.length,blocked,recoveries,nativeRecoveries,sha256},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,blocked,recoveries,nativeRecoveries}));
