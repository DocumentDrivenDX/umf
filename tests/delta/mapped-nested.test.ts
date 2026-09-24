import {test,expect} from 'bun:test';
import {importDeltaTable,exportDeltaTable,renameDeltaMappedField,readDocument,writeDocument} from '../../src';
test('US-018-AC7: array and map-value field renames preserve mapping across both protocol families',async()=>{
 const base='fixtures/delta/mapped-nested/',report=await Bun.file(base+'native-results.json').json();expect(report.cases).toBe(4);
 for(const c of report.results){const text=await Bun.file(base+c.id+'/context.json').text(),source=importDeltaTable(text,{id:c.id});let doc=source;
  for(const [fieldPointer,name] of [['/fields/1','lines'],['/fields/1/type/elementType/fields/0','quantity'],['/fields/2/type/valueType/fields/0','amount']]){const result=renameDeltaMappedField(doc,{fieldPointer:fieldPointer!,name:name!,uninterpretedReferences:'preserve-and-report'});expect(result.partitionUpdates).toEqual([]);doc=result.document;}
  expect(exportDeltaTable(source)).toBe(text);expect(exportDeltaTable(doc)).toBe(await Bun.file(base+c.id+'/renamed.json').text());for(const f of ['json','yaml'] as const)expect(exportDeltaTable(readDocument(writeDocument(doc,f),f))).toBe(exportDeltaTable(doc));
 }
},30000);
