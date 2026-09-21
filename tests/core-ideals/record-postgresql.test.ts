import {test,expect} from 'bun:test';
import {classifyPostgresqlRecord,recoverPostgresqlRecordCapture} from '../../src/core-ideals/postgresql-record';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const fixture=await Bun.file('fixtures/validation/field-postgresql-native.json').json();
function sample(kind='r',duplicate=false){
 const capture=JSON.parse(fixture.nativeSource),table=capture.snapshot.relations.find((r:any)=>r.schema==='sales'&&r.name==='scalar_types');capture.state='modified';
 const relation={...table,name:'Customer',kind,columns:[table.columns[0],table.columns.find((c:any)=>c.name==='items')]};
 capture.snapshot.relations=[relation,{...relation,schema:duplicate?'sales':'support'}];
 const nativeSource=' \n'+JSON.stringify(capture)+'\n',source=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'context-fixture'})).target;
 return {source,request:{recordModule:'records',recordId:'customer',mode:'strict' as const,nativeSource,relation:{schema:'sales',name:'Customer'}}};
}
test('qualified relations remain distinct records and only selected members receive kinds',()=>{
 const {source,request}=sample();const result=classifyPostgresqlRecord(source,request);expect(result.status).toBe('classified');
 const record=result.target!.modules.at(-1)!.elements[0]!;expect(record.name).toBe('Customer');expect(result.target!.modules.at(-1)!.namespace).toBe('sales');expect(record.references).toHaveLength(2);
 const columns=result.target!.modules.find(m=>m.id==='postgresql.columns')!.elements;expect(columns.map(e=>e.kind??null)).toEqual(['field','field',null,null]);
 const support=classifyPostgresqlRecord(source,{...request,relation:{schema:'support',name:'Customer'}});expect(support.target!.modules.at(-1)!.namespace).toBe('support');expect(support.target!.modules.at(-1)!.elements[0]!.references).not.toEqual(record.references);
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverPostgresqlRecordCapture(receipt,receipt.target!)).toBe(request.nativeSource);}
},30000);
test('one member conflict blocks the whole record in both policies',()=>{
 const {source,request}=sample(),column=getPostgresqlColumnMetadata(source).find(c=>c.relation.schema==='sales'&&c.element.scalarType===undefined)!;
 const author=declareCoreElementKind(source,{module:'postgresql.columns',element:column.element.id},'record');
 for(const mode of ['strict','report'] as const){const result=classifyPostgresqlRecord(author.target,{...request,mode,authors:[author]});expect(result.status).toBe('blocked');expect(Object.hasOwn(result,'target')).toBe(false);expect(result.diagnostics.some(d=>d.code==='FIELD_KIND_CONFLICT')).toBe(true);}
});
test('ambiguous relations, unsupported kinds, collisions and stale receipts cannot imply record equivalence',()=>{
 const ambiguous=sample('r',true);expect(()=>classifyPostgresqlRecord(ambiguous.source,ambiguous.request)).toThrow();
 const unsupported=sample('v');for(const mode of ['strict','report'] as const){const result=classifyPostgresqlRecord(unsupported.source,{...unsupported.request,mode});expect(result.status).toBe('blocked');expect(result.diagnostics.some(d=>d.code==='POSTGRESQL_RELATION_UNSUPPORTED')).toBe(true);}
 const {source,request}=sample();expect(classifyPostgresqlRecord(source,{...request,recordModule:'catalog'}).status).toBe('blocked');
 const result=classifyPostgresqlRecord(source,request);result.target!.modules.at(-1)!.elements[0]!.references!.reverse();expect(()=>recoverPostgresqlRecordCapture(result,result.target!)).toThrow();
});

test('duplicate native member names and inconsistent ordinal order block whole-record publication',()=>{
 for(const change of ['name','position']){
  const original=sample(),capture=JSON.parse(original.request.nativeSource),columns=capture.snapshot.relations[0].columns;
  columns[1][change]=columns[0][change];const nativeSource=JSON.stringify(capture),source=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'bad-members'})).target;
  for(const mode of ['strict','report'] as const){const result=classifyPostgresqlRecord(source,{...original.request,nativeSource,mode});expect(result.status).toBe('blocked');expect(Object.hasOwn(result,'target')).toBe(false);expect(result.diagnostics.some(d=>d.code===(change==='name'?'POSTGRESQL_MEMBER_IDENTITY':'POSTGRESQL_MEMBER_ORDER'))).toBe(true);}
 }
});
