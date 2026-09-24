import {test,expect} from 'bun:test';
import {importIcebergTable,exportIcebergTable,proposeIcebergTableRename,writeDocument,readDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import grammar from '../../spec/extensions/iceberg-table/rename-report-schema.json';
const valid=createValidator().compile(grammar),base='fixtures/iceberg/table-rename/';
test('US-021-AC7: versioned rename retains histories and matches independent native evolution',async()=>{
 const native=await Bun.file(base+'java-results.json').json();
 for(const c of (await Bun.file(base+'results.json').json()).results){
  const source=importIcebergTable(await Bun.file(c.path).text(),{id:c.id}),before=exportIcebergTable(source),r=proposeIcebergTableRename(source,c);
  expect(valid(r.report)).toBe(true);expect(r.report.complete).toBe(false);expect(r.report.bindings.status).toBe('checked');
  const original=JSON.parse(before),edited=JSON.parse(exportIcebergTable(r.document));expect(edited.schemas.slice(0,-1)).toEqual(original.schemas);expect(edited['current-schema-id']).toBe(c.nextSchemaId);
  const appended=edited.schemas.pop();edited['current-schema-id']=original['current-schema-id'];expect(edited).toEqual(original);expect(appended['schema-id']).toBe(c.nextSchemaId);
  expect(exportIcebergTable(source)).toBe(before);expect(native.find((x:any)=>x.id===c.id).formatsAgree).toBe(2);
  for(const f of ['json','yaml'] as const)expect(exportIcebergTable(readDocument(writeDocument(r.document,f),f))).toBe(await Bun.file(base+c.id+'.'+f+'.json').text());
 }
});
test('US-021-AC7: failed renames are atomic and native unknown content survives',async()=>{
 const raw=JSON.parse(await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').text());raw.future={references:['x'],value:'opaque'};raw.schemas[0].future='schema payload';raw.schemas[0]['identifier-field-ids']=[1];
 const source=importIcebergTable(JSON.stringify(raw),{id:'boundaries'}),before=exportIcebergTable(source);
 for(const opts of [{fieldId:1,nextSchemaId:0,newName:'new'},{fieldId:1,nextSchemaId:1,newName:'y'},{fieldId:1,nextSchemaId:1,newName:'x'},{fieldId:99,nextSchemaId:1,newName:'new'},{fieldId:1,nextSchemaId:2147483648,newName:'new'},{fieldId:1,nextSchemaId:1,newName:''}]){expect(()=>proposeIcebergTableRename(source,opts)).toThrow();expect(exportIcebergTable(source)).toBe(before);}
 const result=proposeIcebergTableRename(source,{fieldId:1,nextSchemaId:1,newName:'new'}),out=JSON.parse(exportIcebergTable(result.document));expect(out.future).toEqual(raw.future);expect(out.schemas[1].future).toBe('schema payload');expect(out.schemas[1]['identifier-field-ids']).toEqual([1]);expect(out.schemas[1].fields[0].id).toBe(1);
});
