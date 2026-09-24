import assert from 'node:assert/strict';
import {avroKeyProjectionCases} from './key-avro-projection-cases';
import {projectKeysToAvro,recoverKeysAvroIdeal} from '../../src/core-ideals/key-avro-projection';
import {exportAvroSchema,importAvroSchema} from '../../src/adapters/avro';
const cases=[];
for(const c of avroKeyProjectionCases()){
 const r=projectKeysToAvro(c.source,c.authors,c.request);assert.equal(r.status,c.expected);if(r.status==='blocked')continue;
 const schemaText=exportAvroSchema(r.target!);assert.deepEqual(recoverKeysAvroIdeal(r,importAvroSchema(schemaText,{id:c.request.id})),c.source);cases.push({name:c.name,schemaText,keyMappings:r.mappings});
}
await Bun.write('fixtures/avro/key-projection-generated.json',JSON.stringify({scope:'Generated required scalar Avro records; named authored key obligations remain in retained UMF residuals',cases},null,2)+'\n');
const p=Bun.spawn(['.venv/bin/python','scripts/core-ideals/key-avro-projection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await p.exited,0);
