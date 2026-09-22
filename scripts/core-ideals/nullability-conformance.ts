import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {relative,resolve,isAbsolute} from 'node:path';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {nullabilityTableSpecCases} from './nullability-tablespec-cases';
import {postgresqlAvailabilitySource} from './nullability-postgresql-cases';
import {sqlserverAvailabilitySource} from './nullability-sqlserver-cases';
import {avroAvailabilitySource} from './nullability-avro-cases';
import {parquetAvailabilitySource} from './nullability-parquet-cases';
import type {Document,CoreNullabilityDeclaration,Nullability} from '../../src';
export const nullabilitySystems=['tablespec','postgresql','sqlserver','avro','parquet'] as const;
type System=typeof nullabilitySystems[number];
type Reader=(path:string)=>Promise<Uint8Array>;
const read:Reader=async p=>new Uint8Array(await Bun.file(p).arrayBuffer());
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Check retained evidence consistency; this neither authenticates it nor reruns engines. */
export async function verifyNullabilityEvidence(reader:Reader=read){
 const hashes=new Map<string,string>(),json=new Map<string,any>();let fingerprints=0;
 async function load(path:string){if(!json.has(path))json.set(path,JSON.parse(new TextDecoder().decode(await reader(path))));return json.get(path);}
 async function hash(path:string){if(!hashes.has(path))hashes.set(path,digest(await reader(path)));return hashes.get(path)!;}
 async function verify(record:any,label:string){
  assert.ok(Object.keys(record.sha256??{}).length>0,`${label}: missing fingerprints`);
  for(const [path,expected] of Object.entries(record.sha256)){
   // Earlier native records contain __file__ absolute paths; permit only this repository.
   const local=relative(process.cwd(),resolve(path));
   assert.ok(!isAbsolute(local)&&!local.split('/').includes('..')&&!path.split('/').includes('..'),`${label}: unsafe evidence path`);
   assert.match(String(expected),/^[0-9a-f]{64}$/);
   assert.equal(await hash(path),expected,`${label}: stale ${path}`);fingerprints++;
  }
 }
 const records=[];
 for(const name of ['nullability-core-acceptance-evidence',...nullabilitySystems.map(s=>s+'-nullability-acceptance-evidence')]){
  const path=`fixtures/validation/${name}.json`,record=await load(path);
  assert.equal(record.results.failures,0,`${name}: failures`);assert.equal(record.results.typecheck,'passed');
  if(name!=='nullability-core-acceptance-evidence')assert.equal(record.nativeEquivalence,false);
  for(const required of ['src/index.ts','spec/core/nullability-document.schema.json','src/model/nullability.ts'])assert.ok(Object.hasOwn(record.sha256,required),`${name}: missing required proof ${required}`);
  if(name==='nullability-core-acceptance-evidence')for(const required of ['spec/core/cardinality-document.schema.json','spec/core/cardinality-operation.schema.json','spec/core/cardinality-transition.schema.json','spec/core/cardinality-selection.schema.json','spec/core/kind-operation-v3.schema.json','spec/core/record-type-operation-v3.schema.json','spec/core/nullability-operation-v2.schema.json','src/model/cardinality.ts','src/model/cardinality-transition.ts']){assert.ok(Object.hasOwn(record.sha256,required),`${name}: missing required proof ${required}`);}
  if(name!=='nullability-core-acceptance-evidence'){
   const system=name.replace('-nullability-acceptance-evidence','');
   const suffixes=system==='tablespec'?['classification-native','classification-browser','projection-native','projection-browser','execution-native']:['native','browser','projection-native','projection-browser'];
   for(const suffix of suffixes){const proof=`fixtures/validation/nullability-${system}-${suffix}.json`;assert.ok(Object.hasOwn(record.sha256,proof),`${name}: missing required proof ${proof}`);}
  }
  await verify(record,name);records.push({path,sha256:await hash(path)});
 }
 const refresh=await load('fixtures/validation/field-gate-refresh-evidence.json');
 assert.equal(refresh.regression.failures,0);assert.ok(refresh.regression.tests>=340);
 for(const run of refresh.runs)assert.equal(run.exitCode,0,`Failed command ${run.command}`);
 for(const system of nullabilitySystems){
  const suffixes=system==='tablespec'?['classification-browser','projection-browser']:['oracle','browser','projection-oracle','projection-browser'];
  for(const suffix of suffixes){const file=`scripts/core-ideals/nullability-${system}-${suffix}.ts`;assert.ok(refresh.runs.some((r:any)=>r.command.includes(file)),`Missing command ${file}`);}
  for(const suffix of system==='tablespec'?['classification-browser','projection-browser']:['browser','projection-browser']){
   const file=`fixtures/validation/nullability-${system}-${suffix}.json`;
   assert.ok(Object.hasOwn(refresh.sha256,file),`Missing browser proof ${file}`);
   const browser=await load(file);assert.match(browser.browser,/^148\./);assert.deepEqual(browser.externalRequests,[]);assert.ok(Object.keys(browser.checks).length>0);
  }
 }
 for(const script of ['nullability-tablespec-classification-oracle.py','nullability-tablespec-projection-oracle.py','nullability-tablespec-execution-oracle.py'])assert.ok(refresh.runs.some((r:any)=>r.command.includes('scripts/core-ideals/'+script)),`Missing native command ${script}`);
 await verify(refresh,'refresh');
 return {records,fingerprints,systems:[...nullabilitySystems],refreshSha256:await hash('fixtures/validation/field-gate-refresh-evidence.json')};
}
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
  avroNatives.push({source,label,expected:{schema,dependencies:[]},classify:(input,mode,unknown)=>u.classifyAvroNullability(input,{column,nativeSource:schema,mode,scope:unknown?'unresolved':'underlying-field-value',carrier:'avro-null'}),recover:r=>u.recoverAvroNullabilityBundle(r,r.target)});
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
 for(const [key,value] of Object.entries(before.extensions??{}))assert.deepEqual(after.extensions?.[key],value);
 for(const m of before.modules)for(const e of m.elements){const target=after.modules.find(x=>x.id===m.id)?.elements.find(x=>x.id===e.id);assert.ok(target);for(const [key,value] of Object.entries(e.extensions))assert.deepEqual(target.extensions[key],value);}
}
export async function verifyNullabilityRoundTrips(){
 const all=await bindings(),coverage:Partial<Record<System,Record<string,number>>>={};
 for(const system of nullabilitySystems){
  const binding=all[system],counts={authoredCases:0,strictBlocks:0,reportResiduals:0,idealRecoveries:0,nativeCases:0,nativeBlocks:0,nativeRecoveries:0};coverage[system]=counts;
  for(const label of ['required','absent-allowed','unspecified'] as const)for(const loss of [false,true])for(const mode of ['strict','report'] as const){
   const source:Document={umf:'0.3.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:binding.namespace,elements:[{id:'e',name:'value',kind:'field',scalarType:'integer',extensions:{},...(loss?{future:{uninterpreted:['9007199254740993',null]}}:{})}]}]};
   const author=u.declareCoreNullability(source,{module:'m',element:'e'},label),before=u.copyJson(author),result=await binding.project(author,mode);counts.authoredCases++;
   assert.deepEqual(author,before);assert.equal(result.mapping.origin,'authored');assert.equal(result.mapping.nullability,label);
   if(loss&&mode==='strict'){assert.equal(result.status,'blocked');assert.equal(result.target,undefined);assert.ok(result.residuals.length);counts.strictBlocks++;continue;}
   assert.equal(result.status,'projected');assert.ok(result.target);
   if(loss){assert.ok(result.residuals.some((r:any)=>r.path.endsWith('/future')));counts.reportResiduals++;}else assert.equal(result.residuals.length,0);
   for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format);assert.deepEqual(await binding.recover(receipt),author.target);counts.idealRecoveries++;}
  }
  for(const c of binding.natives)for(const unresolved of [false,true])for(const mode of ['strict','report'] as const){
   const source=u.copyJson(c.source) as unknown as Document;source.vocabularies.future={version:'1.0.0'};source.extensions={...source.extensions,future:{uninterpreted:['9007199254740993',null]}};
   const before=u.copyJson(source),result=c.classify(source,mode,unresolved);counts.nativeCases++;assert.deepEqual(source,before);
   assert.equal(result.mapping.origin,'classified');assert.equal(result.mapping.nullability,unresolved?'unspecified':c.label);
   if(unresolved&&mode==='strict'){assert.equal(result.status,'blocked');assert.equal(result.target,undefined);assert.ok(result.residuals.length);counts.nativeBlocks++;continue;}
   assert.equal(result.status,'classified');assert.ok(result.target);retainPayloads(source,result.target);
   if(unresolved)assert.ok(result.residuals.length);
   for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format);assert.deepEqual(c.recover(receipt),c.expected);counts.nativeRecoveries++;}
  }
  assert.deepEqual(counts,{authoredCases:12,strictBlocks:3,reportResiduals:3,idealRecoveries:18,nativeCases:8,nativeBlocks:2,nativeRecoveries:12});
 }
 return coverage;
}
if(import.meta.main){
 const evidence=await verifyNullabilityEvidence(),roundTrips=await verifyNullabilityRoundTrips();
 const paths=['scripts/core-ideals/nullability-conformance.ts','tests/core-ideals/nullability-conformance.test.ts'];
 const result={scope:'Qualified Nullability ideal admission and five-system delivery; retained evidence consistency checks are not native reruns',idealAdmission:{outcome:'passed',requiredBindings:2,usefulBindings:5,systems:[...nullabilitySystems],meaning:'CONTRACT-040 / Element.nullability',nativeEquivalence:false},delivery:{outcome:'passed',requiredBindings:5,qualifiedBindings:5,systems:[...nullabilitySystems],scope:'Explicit binding profiles only, with retained native meanings and qualified refusals'},evidence,roundTrips,fingerprints:Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest(await read(p))])))};
 await Bun.write('fixtures/validation/nullability-conformance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({systems:5,fingerprints:evidence.fingerprints,idealRecoveries:90,nativeRecoveries:60,nativeEquivalence:false}));
}
