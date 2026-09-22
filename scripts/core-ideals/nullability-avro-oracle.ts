import {createHash} from 'node:crypto';
import {avroAvailabilitySource} from './nullability-avro-cases';
import {classifyAvroNullability,recoverAvroNullabilityBundle} from '../../src/core-ideals/nullability-avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const fixture='fixtures/avro/nullability-cases.json';
const cases=await Bun.file(fixture).json();const rows=[];
for(const c of cases.cases){
 const {source,column}=avroAvailabilitySource(c.schema);
 const request={column,nativeSource:c.schema,mode:'strict' as const,scope:'underlying-field-value' as const,carrier:'avro-null' as const};
 const receipt=classifyAvroNullability(source,request);if(!receipt.target)throw Error('Nullability classification blocked');
 for(const format of ['json','yaml'] as const){
  const back=readJsonValue(writeJsonValue(receipt,format),format) as unknown as typeof receipt;
  const recovered=recoverAvroNullabilityBundle(back,back.target!);if(recovered.schema!==c.schema||recovered.dependencies.length)throw Error('Source loss');
  rows.push({id:c.id,format,schema:recovered.schema,nullability:back.mapping.nullability,scope:back.mapping.scope,carrier:back.mapping.carrier});
 }
}
const paths=[fixture,'scripts/core-ideals/nullability-avro-oracle.ts','src/adapters/avro/index.ts','src/core-ideals/nullability-avro.ts','src/core-ideals/avro-availability-type.ts','scripts/core-ideals/nullability-avro-cases.ts','spec/core/avro-nullability-classification.schema.json','spec/extensions/avro-nullability/schema.json','spec/extensions/avro-nullability/package.json','src/model/native-json.ts'];
const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/nullability-avro-recovered.json',JSON.stringify({scope:'Scoped underlying-field-value Nullability classifications retain the native availability corpus',rows,fingerprints},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/nullability-avro-native.py'],{stdout:'inherit',stderr:'inherit'});if(await child.exited!==0)throw Error('Native availability oracle failed');
