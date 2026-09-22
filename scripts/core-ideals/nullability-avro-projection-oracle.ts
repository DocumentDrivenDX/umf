import {createHash} from 'node:crypto';
import {avroNullabilityProjectionCases} from './nullability-avro-projection-cases';
import {projectNullabilityToAvro,recoverNullabilityFromAvro} from '../../src/core-ideals/nullability-avro-projection';
import {classifyAvroNullability,recoverAvroNullabilityBundle} from '../../src/core-ideals/nullability-avro';
import {avroAvailabilitySource} from './nullability-avro-cases';
import {exportAvroSchema} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
const rows=[];let idealRecoveries=0,nativeRecoveries=0,classified=0,blocked=0;
for(const c of avroNullabilityProjectionCases()){
 const result=projectNullabilityToAvro(c.author,c.request);if(result.status!==c.status)throw Error('Unexpected outcome');
 if(!result.target){rows.push({...c,result});blocked++;continue;}
 const text=exportAvroSchema(result.target),{source,column}=avroAvailabilitySource(text);
 const up=classifyAvroNullability(source,{column,nativeSource:text,scope:'underlying-field-value',carrier:'avro-null',mode:'strict'});
 if(!up.target||up.mapping.nullability!==(c.allowsNull?'absent-allowed':'required'))throw Error('Unexpected native reclassification');classified++;
 for(const format of ['json','yaml'] as const){
  const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;
  if(JSON.stringify(recoverNullabilityFromAvro(receipt,text))!==JSON.stringify(c.author.target))throw Error('Ideal loss');idealRecoveries++;
  const native=readJsonValue(writeJsonValue(copyJson(up),format),format) as unknown as typeof up;
  if(recoverAvroNullabilityBundle(native,native.target!).schema!==text)throw Error('Native loss');nativeRecoveries++;
 }
 rows.push({...c,result,text});
}
const paths=['scripts/core-ideals/nullability-avro-projection-oracle.ts','scripts/core-ideals/nullability-avro-projection-cases.ts','scripts/core-ideals/nullability-avro-cases.ts','src/core-ideals/nullability-avro-projection.ts','src/core-ideals/nullability-avro.ts','src/core-ideals/avro-availability-type.ts','spec/core/nullability-avro-projection.schema.json'];
const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/nullability-avro-projection-corpus.json',JSON.stringify({rows,blocked,classified,idealRecoveries,nativeRecoveries,fingerprints},null,2)+'\n');
const native=Bun.spawn(['.venv/bin/python','scripts/core-ideals/nullability-avro-projection-native.py'],{stdout:'inherit',stderr:'inherit'});if(await native.exited!==0)throw Error('Native projection validation failed');
console.log(JSON.stringify({cases:rows.length,blocked,classified,idealRecoveries,nativeRecoveries}));
