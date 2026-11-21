// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {backend} from '../../native/arrow/runtime';
import {importArrowSchema,exportArrowSchemaIpc,proposeArrowNodeEdit,exportArrowSchema} from '../../src/index-node-v4';
import {RecordBatchReader} from 'apache-arrow';
const cases=await Bun.file('fixtures/arrow/schema-cases.json').json();
test('US-016-AC4: guarded native schema IPC preserves known fields and blocks known native losses',()=>{
 let success=0,blocked=0;
 for(const c of cases){const doc=importArrowSchema(JSON.stringify(c.input),{id:c.id});
  if(['type-47','type-48','type-49','duplicate-metadata'].includes(c.id)){expect(()=>exportArrowSchemaIpc(doc,backend)).toThrow();blocked++;continue;}
  const bytes=exportArrowSchemaIpc(doc,backend);expect(RecordBatchReader.from(bytes).open().schema.fields.length).toBe(1);success++;
 }
 expect(success).toBe(48);expect(blocked).toBe(4);
},20000);
test('US-016-AC4: native edits propagate and defaults normalize without mutating source',()=>{
 const doc=importArrowSchema('{"fields":[{"name":"original","nullable":true,"type":{"name":"struct"},"children":[{"name":"child","nullable":true,"type":{"name":"timestamp","unit":"SECOND"}}]}]}',{id:'edit'});
 const before=exportArrowSchema(doc);const changed=proposeArrowNodeEdit(doc,'/fields/0/name','"changed"').document;
 expect(RecordBatchReader.from(exportArrowSchemaIpc(changed,backend)).open().schema.fields[0]!.name).toBe('changed');expect(exportArrowSchema(doc)).toBe(before);
});
test('US-016-AC4: unknown content, unsafe IDs and backend semantic drift cannot leak through IPC',()=>{
 for(const source of ['{"fields":[],"future":true}','{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":9223372036854775807}}]}'])expect(()=>exportArrowSchemaIpc(importArrowSchema(source,{id:'blocked'}),backend)).toThrow();
 const doc=importArrowSchema(JSON.stringify(cases[0].input),{id:'drift'});
 const drift={...backend,encode(schema:unknown){const result=backend.encode(schema);result.after.fields[0].name='drift';return result;}};
 expect(()=>exportArrowSchemaIpc(doc,drift)).toThrow('re-read changed');
});

test('canonical dictionary longs and unzoned nested timestamps survive both native encoders',()=>{
 const inputs=[{fields:[{name:'dict',nullable:true,type:{name:'utf8'},dictionary:{id:9007199254740991,indexType:{name:'int',bitWidth:32,isSigned:true},isOrdered:true}}]},{fields:[{name:'outer',nullable:true,type:{name:'struct'},children:[{name:'local',nullable:true,type:{name:'timestamp',unit:'SECOND'}}]}]}];
 for(const input of inputs){const doc=importArrowSchema(JSON.stringify(input),{id:'canonical-ipc'}),before=exportArrowSchema(doc);
  for(const encoder of [backend,undefined])expect(RecordBatchReader.from(exportArrowSchemaIpc(doc,encoder)).open().schema.fields).toHaveLength(1);
  expect(exportArrowSchema(doc)).toBe(before);
 }
});
