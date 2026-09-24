import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importAvroSchema,exportAvroSchema,inspectAvro,readDocument,writeDocument} from '../../src';
import manifest from '../../fixtures/avro/upstream/manifest.json';

test('US-007-AC6: pinned Apache schema corpus survives with per-file interpretation status',async()=>{
 const results=[];
 for(const file of manifest.files){
  const text=await Bun.file('fixtures/avro/upstream/'+file.path).text();
  expect(createHash('sha256').update(text).digest('hex')).toBe(file.sha256);
  const doc=importAvroSchema(text,{id:file.path});
  for(const format of ['json','yaml'] as const){
   const returned=readDocument(writeDocument(doc,format),format);
   expect(JSON.parse(exportAvroSchema(returned))).toEqual(JSON.parse(text));
  }
  const output=exportAvroSchema(doc);
  const status=inspectAvro(doc);
  results.push({path:file.path,sha256:file.sha256,valid:status.valid,complete:status.complete,diagnostics:status.diagnostics,exported:output});
 }
 expect(results.length).toBe(20);
 await Bun.write('fixtures/avro/corpus-results.json',JSON.stringify({commit:manifest.commit,scope:manifest.scope,files:results},null,2)+'\n');
});
