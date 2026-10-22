// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as u from '../src/index';
import {uuidBinding,uuidDocument,FIELD} from './helpers/uuid-fixtures';
function binding(system:string,version:string,kind:string){const b=uuidBinding(kind);(b.extensions!['umf.binding'] as any).target={system,version,subset:'uuid-carrier1'};return b;}
test('explicit five-target carrier proposals and full retained-source recovery',()=>{
 for(const [system,version,kind] of [['postgresql','17','native-uuid'],['sqlserver','2022','native-uuid'],['avro','1.12.0','native-uuid'],['parquet','2.11.0','native-uuid'],['tablespec','1.0','uuid-text']]){
  const d=uuidDocument(),b=binding(system!,version!,kind!);
  const report=u.projectBit128CarrierSchema(b,d,FIELD,{lossPolicy:'strict',obligations:['bits']});
  expect(report.status).toBe('projected');expect(report.candidate?.text).toBeTruthy();
  expect(u.recoverBit128CarrierProjection(report,report.candidate!.text)).toEqual({logical:d,binding:b});
  expect(()=>u.recoverBit128CarrierProjection(report,report.candidate!.text+' ')).toThrow();
  const order=u.projectBit128CarrierSchema(b,d,FIELD,{lossPolicy:'strict',obligations:['bits','ordering']});expect(order.status).toBe('blocked');expect(order.candidate).toBeUndefined();
  expect(u.projectBit128CarrierSchema(b,d,FIELD,{lossPolicy:'report',obligations:['bits','ordering']}).status).toBe('reported');
 }
});
test('unsupported pairs, text enforcement, external nulls, constraints and names cannot be silently omitted',()=>{
 const d=uuidDocument();expect(u.projectBit128CarrierSchema(binding('tablespec','1.0','words64'),d,FIELD,{lossPolicy:'report',obligations:['bits']}).status).toBe('blocked');
 const pg=binding('postgresql','17','uuid-text');expect(u.projectBit128CarrierSchema(pg,d,FIELD,{lossPolicy:'strict',obligations:['enforcement']}).status).toBe('blocked');
 d.modules[0]!.elements[1]!.allowedValues=[{uuid:'00000000-0000-0000-0000-000000000000'}];expect(u.projectBit128CarrierSchema(binding('postgresql','17','native-uuid'),d,FIELD,{lossPolicy:'strict',obligations:['bits']}).status).toBe('blocked');
 const av=uuidBinding();(av.extensions!['umf.binding'] as any).target={system:'avro',version:'1.12.0',subset:'x'};delete d.modules[0]!.elements[1]!.allowedValues;d.modules[0]!.elements[1]!.nullability='absent-allowed';delete d.modules[0]!.elements[0]!.keys;
 expect(u.projectBit128CarrierSchema(av,d,FIELD,{lossPolicy:'strict',obligations:['availability']}).status).toBe('blocked');
});
test('native classification requires exact identity/annotation and retains unknown refinements',()=>{
 for(const input of [
  {system:'postgresql',version:'17',definition:{schema:'pg_catalog',name:'uuid',kind:'b',future:1}},
  {system:'sqlserver',version:'2022',definition:{schema:'sys',name:'uniqueidentifier',systemTypeId:36,future:1}},
  {system:'avro',version:'1.12.0',definition:{type:'fixed',size:16,logicalType:'uuid',future:1}},
  {system:'parquet',version:'2.11.0',definition:{physicalType:'FIXED_LEN_BYTE_ARRAY',length:16,logicalType:'UUID',future:1}},
 ] as const){const c=u.classifyBit128NativeType(input as any);expect(c.scalarType).toBe('uuid');expect(c.source).toEqual(input);}
 expect(u.classifyBit128NativeType({system:'avro',version:'1.12.0',definition:{type:'fixed',size:15,logicalType:'uuid'}}).scalarType).toBeUndefined();
 expect(u.classifyBit128NativeType({system:'postgresql',version:'17',definition:{schema:'custom',name:'uuid',kind:'b'}}).scalarType).toBeUndefined();
});
test('native identifier bounds and unknown qualifiers refuse before SQL generation',()=>{
 for(const name of ['x'.repeat(64),'nul\u0000name','bad\ud800']){
  const b=binding('postgresql','17','native-uuid');(b.extensions!['umf.binding'] as any).elements[0].table=name;
  expect(()=>u.projectBit128CarrierSchema(b,uuidDocument(),FIELD,{lossPolicy:'report',obligations:['bits']})).toThrow();
 }
 const d=uuidDocument();d.modules[0]!.elements[1]!.facets={future:1};expect(()=>u.projectBit128CarrierSchema(binding('postgresql','17','native-uuid'),d,FIELD,{lossPolicy:'report',obligations:['bits']})).toThrow();
});
test('native name collisions and partition choices are explicit',()=>{
 const av=binding('avro','1.12.0','native-uuid');(av.extensions!['umf.binding'] as any).elements[0].table='Umf128Value';
 const r=u.projectBit128CarrierSchema(av,uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']});expect(JSON.parse(r.candidate!.text).fields[0].type.name).toBe('Umf128ValueField');
 const sql=binding('sqlserver','2022','words64');(sql.extensions!['umf.binding'] as any).fields[0].carrier={kind:'words64',highColumn:'HI',lowColumn:'hi',signed:true};expect(()=>u.projectBit128CarrierSchema(sql,uuidDocument(),FIELD,{lossPolicy:'report',obligations:['bits']})).toThrow();
 const pg=binding('postgresql','17','native-uuid');(pg.extensions!['umf.binding'] as any).elements[0].partition='monthly';expect(u.projectBit128CarrierSchema(pg,uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']}).status).toBe('blocked');
});
test('expanded native output must fit the ordinary text bound before publication',()=>{
 const b=binding('parquet','2.11.0','native-uuid');(b.extensions!['umf.binding'] as any).fields[0].carrier.column='\n'.repeat(2_100_000);
 try{u.projectBit128CarrierSchema(b,uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']});throw Error('Expanded output accepted');}catch(error){expect((error as u.UmfError).code).toBe('LIMIT');}
});
test('known text and model limits remain visible even under a bits-only request',()=>{
 const r=u.projectBit128CarrierSchema(binding('tablespec','1.0','uuid-text'),uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']});
 expect(r.diagnostics.map(d=>d.code)).toContain('BIT128_TEXT_NOT_ENFORCED');expect(r.diagnostics.map(d=>d.code)).toContain('BIT128_TABLESPEC_MODEL_ONLY');
});
test('oversized retained source is refused before allocating its full JSON serialization',()=>{
 const d=uuidDocument();d.archiveA='x'.repeat(3_000_000);d.archiveB=d.archiveA;
 const stringify=JSON.stringify;let fullSerializations=0;
 JSON.stringify=((value:any,...args:any[])=>{if(value?.operation==='project-bit128-carrier-schema'){fullSerializations++;throw Error('Oversized full serialization attempted');}return (stringify as any)(value,...args);}) as typeof JSON.stringify;
 try{
  try{u.projectBit128CarrierSchema(binding('postgresql','17','native-uuid'),d,FIELD,{lossPolicy:'strict',obligations:['bits']});throw Error('Oversized source accepted');}catch(error){expect((error as u.UmfError).code).toBe('LIMIT');}
  expect(fullSerializations).toBe(0);
 }finally{JSON.stringify=stringify;}
});
