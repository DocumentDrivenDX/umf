import {test,expect} from 'bun:test';
import {importIcebergTable,exportIcebergTable,inspectIcebergTableTransforms as inspect,writeDocument,readDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/iceberg-table/transform-binding-schema.json';
const minimal=await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').json(),valid=createValidator().compile(schema);
function check(raw:any){const d=importIcebergTable(JSON.stringify(raw),{id:'binding'}),source=exportIcebergTable(d),r=inspect(d);expect(valid(r)).toBe(true);expect(r.complete).toBe(false);for(const f of ['json','yaml'] as const)expect(inspect(readDocument(writeDocument(d,f),f))).toEqual(r);expect(exportIcebergTable(d)).toBe(source);return r;}
test('US-021-AC6: selected fields bind by ID, including nested structs and names containing dots',()=>{
 const base=check(minimal);expect(base.status).toBe('checked');expect(base.bindings).toHaveLength(3);
 const nested=structuredClone(minimal);nested.schemas[0].fields[0]={id:4,name:'nested',required:true,type:{type:'struct',fields:[{id:1,name:'a.b',required:true,type:'long'}]}};
 expect(check(nested).bindings[0]!.sourcePath).toBe('/schemas/0/fields/0/type/fields/0');
 const renamed=structuredClone(nested);renamed.schemas[0].fields[0].type.fields[0].name='renamed';expect(check(renamed).bindings).toEqual(check(nested).bindings);
});
test('US-021-AC6: invalid current binding is diagnosed without interpreting historical specs',()=>{
 for(const change of [
  (x:any)=>x['partition-specs'][0].fields[0]['source-id']=99,
  (x:any)=>x.schemas[0].fields[2].type='boolean',
  (x:any)=>x['sort-orders'][0].fields[0].direction='sideways',
  (x:any)=>x['sort-orders'][0].fields[0]['null-order']='unknown',
  (x:any)=>{x['default-sort-order-id']=0;x['sort-orders'][0]['order-id']=0;},
  (x:any)=>x['partition-specs'][0].fields.push(structuredClone(x['partition-specs'][0].fields[0])),
  (x:any)=>x['partition-specs'][0].fields[0].transform='future[2]',
 ]){const x=structuredClone(minimal);change(x);expect(check(x).status).toBe('blocked');}
 const historical=structuredClone(minimal);historical['partition-specs'].push({'spec-id':8,fields:[{'source-id':999,'field-id':1001,name:'expired',transform:'identity'}]});expect(check(historical).status).toBe('checked');
});
test('US-021-AC6: v3 multi-source fields preserve both formats but remain unbound',()=>{
 const x=structuredClone(minimal);x['format-version']=3;x['next-row-id']=0;
 for(const field of [x['partition-specs'][0].fields[0],x['sort-orders'][0].fields[0]]){delete field['source-id'];field['source-ids']=[1,2];field.transform='future_pair';}
 const r=check(x);expect(r.status).toBe('blocked');expect(r.diagnostics.filter(d=>d.path.endsWith('/source-ids'))).toHaveLength(2);
 const v2=structuredClone(x);v2['format-version']=2;expect(()=>importIcebergTable(JSON.stringify(v2),{id:'bad'})).toThrow();
 x['partition-specs'][0].fields[0]['source-id']=1;expect(()=>importIcebergTable(JSON.stringify(x),{id:'both'})).toThrow();
 const missing=structuredClone(minimal);delete missing['partition-specs'][0].fields[0]['field-id'];expect(()=>importIcebergTable(JSON.stringify(missing),{id:'missing'})).toThrow();
});
test('US-021-AC6: struct fields within collections cannot act as scalar sources',()=>{
 const x=structuredClone(minimal);x.schemas[0].fields[0]={id:4,name:'nested',required:true,type:{type:'list','element-id':5,'element-required':true,element:{type:'struct',fields:[{id:1,name:'x',required:true,type:'long'}]}}};expect(check(x).status).toBe('blocked');
});
test('US-021-AC6: native nested tables agree; v3 multi-source parser limitation remains explicit',async()=>{
 const report=await Bun.file('fixtures/iceberg/table-binding/java-oracle-results.json').json();
 expect(report.results.find((r:any)=>r.id==='nested')).toMatchObject({nativeAccepted:true,formatsAgree:2,editVerified:true});
 expect(report.results.find((r:any)=>r.id==='multi')).toMatchObject({nativeAccepted:false});
 const source=await Bun.file('fixtures/iceberg/table-binding/multi.source.json').json();expect(check(source).status).toBe('blocked');
});
