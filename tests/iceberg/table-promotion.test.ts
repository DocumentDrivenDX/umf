import {test,expect} from 'bun:test';
import {importIcebergTable,exportIcebergTable,proposeIcebergTablePromotion,writeDocument,readDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import grammar from '../../spec/extensions/iceberg-table/promotion-report-schema.json';
const valid=createValidator().compile(grammar),base='fixtures/iceberg/table-promotion/';
test('US-021-AC8: six primitive widenings match independent native evolution and preserve history',async()=>{
 const native=await Bun.file(base+'java-results.json').json();expect(native).toHaveLength(6);
 for(const c of (await Bun.file(base+'results.json').json()).results){
  const raw=await Bun.file(c.path).text(),source=importIcebergTable(raw,{id:c.id}),before=exportIcebergTable(source),r=proposeIcebergTablePromotion(source,c);
  expect(valid(r.report)).toBe(true);expect(r.report.bindings.status).toBe('checked');expect(r.report.checkedPartitionFields).toEqual(['/partition-specs/0/fields/0']);
  const original=JSON.parse(raw),edited=JSON.parse(exportIcebergTable(r.document)),appended=edited.schemas.pop();expect(appended.fields[0].type).toBe(c.targetType);expect(appended.fields[0].id).toBe(1);expect(appended['schema-id']).toBe(c.nextSchemaId);
  const expectedSchema=structuredClone(original.schemas[0]);expectedSchema['schema-id']=c.nextSchemaId;expectedSchema.fields[0].type=c.targetType;expect(appended).toEqual(expectedSchema);
  edited['current-schema-id']=original['current-schema-id'];expect(edited).toEqual(original);expect(exportIcebergTable(source)).toBe(before);
  expect(native.find((x:any)=>x.id===c.id).formatsAgree).toBe(2);
  for(const f of ['json','yaml'] as const)expect(exportIcebergTable(readDocument(writeDocument(r.document,f),f))).toBe(await Bun.file(base+c.id+'.'+f+'.json').text());
 }
});
test('US-021-AC8: invalid promotions and unknown historical dependencies fail atomically',async()=>{
 const raw=await Bun.file(base+'int-bucket.source.json').json(),source=importIcebergTable(JSON.stringify(raw),{id:'limits'}),before=exportIcebergTable(source);
 for(const opts of [{fieldId:1,nextSchemaId:1,targetType:'string'},{fieldId:1,nextSchemaId:1,targetType:'int'},{fieldId:1,nextSchemaId:0,targetType:'long'},{fieldId:99,nextSchemaId:1,targetType:'long'}]){expect(()=>proposeIcebergTablePromotion(source,opts)).toThrow();expect(exportIcebergTable(source)).toBe(before);}
 raw['partition-specs'].push({'spec-id':9,fields:[{'source-id':1,'field-id':1001,name:'old',transform:'future'}]});expect(()=>proposeIcebergTablePromotion(importIcebergTable(JSON.stringify(raw),{id:'unknown'}),{fieldId:1,nextSchemaId:1,targetType:'long'})).toThrow();
 const decimal=await Bun.file(base+'decimal-bucket.source.json').json();for(const targetType of ['decimal(8, 2)','decimal(10, 3)','decimal(39, 2)'])expect(()=>proposeIcebergTablePromotion(importIcebergTable(JSON.stringify(decimal),{id:'decimal'}),{fieldId:1,nextSchemaId:1,targetType})).toThrow();
});
