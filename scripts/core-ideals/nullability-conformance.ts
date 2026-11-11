// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {assertJsonDataEqual,assertNativeRepresentationEqual} from './json-data-assert';
import {createHash} from 'node:crypto';
import {relative,resolve,isAbsolute,sep} from 'node:path';
import {recordedRepositoryPath} from '../../tests/helpers/recorded-repository-path';
import * as u from '../../src/index-node-v4';
import {classifyAvroNullability,recoverAvroNullabilityBundle,verifyAvroNullabilityClassification} from '../../src/index-node-v4';
import {backend} from '../../native/postgresql/runtime';
import {nullabilityTableSpecCases} from './nullability-tablespec-cases';
import {postgresqlAvailabilitySource} from './nullability-postgresql-cases';
import {sqlserverAvailabilitySource} from './nullability-sqlserver-cases';
import {avroAvailabilitySource} from './nullability-avro-cases';
import {parquetAvailabilitySource} from './nullability-parquet-cases';
import type {Document, CoreNullabilityDeclaration, Nullability} from '../../src/index-node-v4';
export const nullabilitySystems=['tablespec','postgresql','sqlserver','avro','parquet'] as const;
type System=typeof nullabilitySystems[number];
type Reader=(path:string)=>Promise<Uint8Array>;
const read:Reader=async p=>new Uint8Array(await Bun.file(p).arrayBuffer());
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
// Test orchestration uses the adapters' individually schema-checked receipt types.
interface NativeCase {source:Document;classify:(source:Document,mode:'strict'|'report',unresolved:boolean)=>any;recover:(receipt:any)=>unknown;expected:unknown;label:Nullability}
interface Binding {namespace:string;project:(author:CoreNullabilityDeclaration,mode:'strict'|'report')=>any;recover:(receipt:any)=>any;natives:NativeCase[]}
async function bindings():Promise<Record<System,Binding>>{
 const tableCases=nullabilityTableSpecCases();
 const pg=await Bun.file('fixtures/validation/nullability-postgresql-native.json').json(),sql=await Bun.file('fixtures/validation/nullability-sqlserver-native.json').json(),avro=await Bun.file('fixtures/avro/nullability-cases.json').json();
 const tsNatives:NativeCase[]=[],pgNatives:NativeCase[]=[],sqlNatives:NativeCase[]=[],avroNatives:NativeCase[]=[],parquetNatives:NativeCase[]=[];
 for(const label of ['required','absent-allowed'] as const){
  const ts=tableCases.find(c=>c.expected===label&&c.request.profile==='runtime-model'&&c.request.context===null&&c.request.mode==='strict')!;assert.ok(ts);
  tsNatives.push({source:ts.source,label,expected:ts.text,classify:(source,mode,unknown)=>u.classifyTableSpecNullability(source,{...ts.request,mode,profile:unknown?'unresolved':'runtime-model'}),recover:r=>u.recoverTableSpecNullabilitySource(r,r.target)});
  const relation=label==='required'?'required':'plain';
  for(const [native,makeSource,classify,recover,rows] of [
   [pg,postgresqlAvailabilitySource,u.classifyPostgresqlNullability,u.recoverPostgresqlNullabilitySource,pgNatives],
   [sql,sqlserverAvailabilitySource,u.classifySqlServerNullability,u.recoverSqlServerNullabilitySource,sqlNatives],
  ] as const){
   const {source,column}=makeSource(native.nativeSource,relation);
   rows.push({source,label,expected:native.nativeSource,classify:(input,mode,unknown)=>classify(input,{column,nativeSource:native.nativeSource,mode,scope:unknown?'unresolved':'stored-relation',carrier:'sql-null'}),recover:r=>recover(r,r.target)});
  }
  const schema=avro.cases.find((c:any)=>c.id===(label==='required'?'integer':'null-first')).schema,{source,column}=avroAvailabilitySource(schema);
  avroNatives.push({source,label,expected:{schema,dependencies:[]},classify:(input,mode,unknown)=>classifyAvroNullability(input,{column,nativeSource:schema,mode,scope:unknown?'unresolved':'underlying-field-value',carrier:'avro-null'}),recover:r=>recoverAvroNullabilityBundle(r,r.target)});
  const bytes=new Uint8Array(await Bun.file(`fixtures/parquet/nullability/scalar-${label==='required'?'0-0-present-0':'1-0-present-1'}.parquet`).arrayBuffer());
  parquetNatives.push({source:parquetAvailabilitySource(bytes,1),label,expected:bytes,classify:(input,mode,unknown)=>u.classifyParquetNullability(input,{index:1,mode,scope:unknown?'unresolved':'row-leaf-value',carrier:'definition-level'}),recover:r=>u.recoverParquetNullabilityBytes(r,r.target)});
 }
 return {
  tablespec:{namespace:'',natives:tsNatives,project:(a,mode)=>u.projectNullabilityToTableSpec(a,{id:'native',tableName:'Example',columnName:'value',nativeType:'INTEGER',mode,profile:'runtime-model',context:null,carrier:'null-value'}),recover:r=>u.recoverNullabilityFromTableSpec(r,u.exportTableSpec(r.target))},
  postgresql:{namespace:'availability',natives:pgNatives,project:(a,mode)=>u.projectNullabilityToPostgresql(a,{id:'native',namespace:'availability',tableName:'example',columnName:'value',nativeType:'integer',mode,scope:'stored-relation',carrier:'sql-null'},backend),recover:r=>u.recoverNullabilityFromPostgresql(r,r.nativeSql,backend)},
  sqlserver:{namespace:'availability',natives:sqlNatives,project:(a,mode)=>u.projectNullabilityToSqlServer(a,{id:'native',namespace:'availability',tableName:'example',columnName:'value',nativeType:'int',mode,scope:'stored-relation',carrier:'sql-null'}),recover:r=>u.recoverNullabilityFromSqlServer(r,r.nativeSql)},
  avro:{namespace:'',natives:avroNatives,project:(a,mode)=>u.projectNullabilityToAvro(a,{id:'native',namespace:'',recordName:'Example',fieldName:'value',nativeType:'int',mode,scope:'underlying-field-value',carrier:'avro-null'}),recover:r=>u.recoverNullabilityFromAvro(r,u.exportAvroSchema(r.target))},
  parquet:{namespace:'',natives:parquetNatives,project:(a,mode)=>u.projectNullabilityToParquet(a,{id:'native',recordName:'Example',fieldName:'value',nativeType:'int32',mode,scope:'row-leaf-value',carrier:'definition-level'}),recover:r=>u.recoverNullabilityFromParquet(r,u.exportParquetCapture(r.target))},
 };
}
function retainPayloads(before:Document,after:Document){
 for(const [key,value] of Object.entries(before.extensions??{}))assertJsonDataEqual(after.extensions?.[key],value);
 for(const m of before.modules)for(const e of m.elements){const target=after.modules.find(x=>x.id===m.id)?.elements.find(x=>x.id===e.id);assert.ok(target);for(const [key,value] of Object.entries(e.extensions))assertJsonDataEqual(target.extensions[key],value);}
}
export async function verifyNullabilityRoundTrips(){
 const all=await bindings(),coverage:Partial<Record<System,Record<string,number>>>={};
 for(const system of nullabilitySystems){
  const binding=all[system],counts={authoredCases:0,strictBlocks:0,reportResiduals:0,idealRecoveries:0,nativeCases:0,nativeBlocks:0,nativeRecoveries:0};coverage[system]=counts;
  for(const label of ['required','absent-allowed','unspecified'] as const)for(const loss of [false,true])for(const mode of ['strict','report'] as const){
   const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:binding.namespace,elements:[{id:'e',name:'value',kind:'field',scalarType:'integer',extensions:{},...(loss?{future:{uninterpreted:['9007199254740993',null]}}:{})}]}]};
   const author=u.declareCoreNullability(source,{module:'m',element:'e'},label),before=u.copyJson(author),result=await binding.project(author,mode);counts.authoredCases++;
   assertJsonDataEqual(author,before);assert.equal(result.mapping.origin,'authored');assert.equal(result.mapping.nullability,label);
   if(loss&&mode==='strict'){assert.equal(result.status,'blocked');assert.equal(result.target,undefined);assert.ok(result.residuals.length);counts.strictBlocks++;continue;}
   assert.equal(result.status,'projected');assert.ok(result.target);
   if(loss){assert.ok(result.residuals.some((r:any)=>r.path.endsWith('/future')));counts.reportResiduals++;}else assert.equal(result.residuals.length,0);
   for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format);assertJsonDataEqual(await binding.recover(receipt),author.target);counts.idealRecoveries++;}
  }
  for(const c of binding.natives)for(const unresolved of [false,true])for(const mode of ['strict','report'] as const){
   const source=u.copyJson(c.source) as unknown as Document;source.vocabularies.future={version:'1.0.0'};source.extensions={...source.extensions,future:{uninterpreted:['9007199254740993',null]}};
   const before=u.copyJson(source),result=c.classify(source,mode,unresolved);counts.nativeCases++;assertJsonDataEqual(source,before);
   assert.equal(result.mapping.origin,'classified');assert.equal(result.mapping.nullability,unresolved?'unspecified':c.label);
   if(unresolved&&mode==='strict'){assert.equal(result.status,'blocked');assert.equal(result.target,undefined);assert.ok(result.residuals.length);counts.nativeBlocks++;continue;}
   assert.equal(result.status,'classified');assert.ok(result.target);retainPayloads(source,result.target);
   if(unresolved)assert.ok(result.residuals.length);
   for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format);assertNativeRepresentationEqual(c.recover(receipt),c.expected);counts.nativeRecoveries++;}
  }
  assertJsonDataEqual(counts,{authoredCases:12,strictBlocks:3,reportResiduals:3,idealRecoveries:18,nativeCases:8,nativeBlocks:2,nativeRecoveries:12});
 }
 return coverage;
}