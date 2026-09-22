import {createHash} from 'node:crypto';
import {importAvroSchema,getAvroFieldMetadata} from '../../src/adapters/avro';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyAvroField,recoverAvroFieldBundle} from '../../src/core-ideals/avro-field';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const fixture='fixtures/avro/nullability-cases.json';
const cases=await Bun.file(fixture).json();const rows=[];
for(const c of cases.cases){
 const source=upgradeFieldEnvelope(importAvroSchema(c.schema,{id:c.id})).target;
 const field=getAvroFieldMetadata(source).find(f=>f.record==='availability.Example'&&f.element.name==='value');if(!field)throw Error('Missing field');
 const request={column:field.element.id,nativeSource:c.schema,mode:'strict' as const};
 const receipt=classifyAvroField(source,request);if(!receipt.target)throw Error('Field classification blocked');
 for(const format of ['json','yaml'] as const){
  const back=readJsonValue(writeJsonValue(receipt,format),format) as unknown as typeof receipt;
  const recovered=recoverAvroFieldBundle(back,back.target!);if(recovered.schema!==c.schema||recovered.dependencies.length)throw Error('Source loss');
  rows.push({id:c.id,format,schema:recovered.schema});
 }
}
const paths=[fixture,'scripts/core-ideals/nullability-avro-oracle.ts','src/adapters/avro/index.ts','src/core-ideals/avro-field.ts','src/model/native-json.ts'];
const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/nullability-avro-recovered.json',JSON.stringify({scope:'Existing Field archival receipts preserve native availability corpus; this does not classify Nullability',rows,fingerprints},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/nullability-avro-native.py'],{stdout:'inherit',stderr:'inherit'});if(await child.exited!==0)throw Error('Native availability oracle failed');
