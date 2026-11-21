// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import * as u from '../../src/index-node-v4';
function source():u.Document{return {umf:'0.10.0',id:'json-set',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',kind:'field',extensions:{}}]}]};}
const reference={module:'m',element:'value'};
test('JSON fields use Parquet JSON or explicit text encoding with recoverable limits',()=>{
 const d=source();d.modules[0]!.elements[0]!.scalarType='json';const a=u.declareCoreElementKind(d,reference,'field');
 const parquet=u.projectFieldToParquet(a,{id:'p',recordName:'Example',fieldName:'value',nativeType:'json',repetition:'required',mode:'report'});
 expect(parquet.status).toBe('projected');expect(parquet.residuals.some(r=>r.outcome==='not-expressible')).toBe(false);
 const avro=u.projectFieldToAvro(a,{id:'a',recordName:'Example',namespace:'',fieldName:'value',nativeType:'string',jsonEncoding:true,mode:'report'});
 expect(avro.status).toBe('projected');expect(avro.residuals.some(r=>r.outcome==='approximated'&&r.reason.includes('JSON'))).toBe(true);
 expect(u.recoverFieldFromAvro(avro,u.exportAvroSchema(avro.target!))).toEqual(a.target);
 const sql=u.projectFieldToSqlServer(a,{id:'s',namespace:'dbo',tableName:'Example',columnName:'value',nativeType:'nvarchar(max)',jsonEncoding:true,mode:'report'});
 expect(sql.status).toBe('projected');expect(sql.nativeSql).toContain('ISJSON([value],VALUE)=1');
 expect(u.recoverFieldFromSqlServer(sql,sql.nativeSql!)).toEqual(a.target);
 const tablespec=u.projectFieldToTableSpec(a,{id:'t',tableName:'Example',columnName:'value',nativeType:'TEXT',jsonEncoding:true,mode:'report'});
 expect(tablespec.status).toBe('projected');expect(tablespec.residuals.some(r=>r.outcome==='approximated')).toBe(true);
 expect(u.recoverFieldFromTableSpec(tablespec,u.exportTableSpec(tablespec.target!))).toEqual(a.target);
 expect(u.projectFieldToAvro(a,{...avro.request,jsonEncoding:false}).mapping.outcome).toBe('not-expressible');
 expect(u.projectFieldToAvro(a,{...avro.request,mode:'strict'}).status).toBe('blocked');
});

test('sets map to native lists or explicit JSON text with uniqueness obligations',()=>{
 const d=source();d.modules[0]!.elements.push({id:'item',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 const a=u.declareCoreCardinality(d,reference,{cardinality:'set',itemType:{module:'m',element:'item'}});
 const requests:any[]=[
  [u.projectCardinalityToParquet,{id:'p',recordName:'Example',fieldName:'value',nativeType:{kind:'array',nullable:false,item:{kind:'scalar',nativeType:'string',nullable:false}},availability:'definition-level',requireExactValues:false,mode:'report'}],
  [u.projectCardinalityToAvro,{id:'a',recordName:'Example',namespace:'',fieldName:'value',nativeType:'{"type":"array","items":"string"}',dependencies:[],availability:'avro-null-value',requireExactValues:false,mode:'report'}],
  [u.projectCardinalityToSqlServer,{id:'s',namespace:'dbo',tableName:'Example',columnName:'value',nativeType:'nvarchar(max)',storage:'json-array',requireExactValues:false,mode:'report'}],
  [u.projectCardinalityToTableSpec,{id:'t',tableName:'Example',columnName:'value',nativeType:'TEXT',dimension:null,profile:'generated-json',requireExactValues:false,jsonEncoding:true,mode:'report'}],
 ];
 for(const [project,request] of requests){
  const r=project(a,request);expect(r.status).toBe('projected');expect(r.mapping.outcome).not.toBe('not-expressible');
  expect(r.residuals.some((x:any)=>x.reason.includes('uniqueness'))).toBe(true);
  expect(project(a,{...request,mode:'strict'}).status).toBe('blocked');
 }
});


test('Parquet JSON retains its scalar family through availability and collection classification',()=>{
 const d=source();d.modules[0]!.elements[0]!.scalarType='json';
 const a=u.declareCoreNullability(d,reference,'required');
 const r=u.projectNullabilityToParquet(a,{id:'json-availability',recordName:'Example',fieldName:'value',nativeType:'json',mode:'strict',scope:'row-leaf-value',carrier:'definition-level'});
 expect(r.status).toBe('projected');expect(r.residuals).toEqual([]);
 const c=u.declareCoreCardinality(d,reference,{cardinality:'one'});
 const p=u.projectCardinalityToParquet(c,{id:'json-shape',recordName:'Example',fieldName:'value',nativeType:{kind:'scalar',nativeType:'json',nullable:false},availability:'definition-level',requireExactValues:false,mode:'report'});
 expect(p.status).toBe('projected');expect(p.residuals.some(x=>x.reason.includes('scalar family'))).toBe(false);
});
