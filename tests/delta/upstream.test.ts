import {test,expect} from 'bun:test';
import {importDeltaSchema,exportDeltaSchema,importDeltaTable,exportDeltaTable,readDocument,writeDocument} from '../../src';
test('US-018-AC8: pinned upstream schema/context corpus preserves source and known rejection',async()=>{
 const report=await Bun.file('fixtures/delta/upstream/results.json').json();expect(report.commit).toBe('90b904ede68627c2450007034d9724c043f1a66b');expect(report.files).toBe(307);expect(report.schemas).toBe(77);expect(report.contexts).toBe(64);let rejected=0;
 for(const c of report.results){const read=c.kind==='schema'?importDeltaSchema:importDeltaTable,emit=c.kind==='schema'?exportDeltaSchema:exportDeltaTable;
  if(c.id==='76'){expect(()=>read(c.text,{id:c.id})).toThrow('schemaString');rejected++;continue;}
  const doc=read(c.text,{id:c.id}),before=emit(doc);for(const f of ['json','yaml'] as const)expect(emit(readDocument(writeDocument(doc,f),f))).toBe(before);
 }expect(rejected).toBe(1);
},60000);
