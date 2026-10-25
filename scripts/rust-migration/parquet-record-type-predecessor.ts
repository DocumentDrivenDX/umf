// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyParquetRecordType,recoverParquetRecordTypeBytes} from '../../src/core-ideals/parquet-record-type';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const packetPath=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-parquet-record-type/typescript-predecessor.json');
const fixtures=['list-tuple','list-array','list-items_tuple','list-three-element','map-canonical'];
const sources=[
 'src/core-ideals/parquet-record-type.ts','src/core-ideals/parquet-record.ts','src/core-ideals/parquet-field.ts',
 'src/adapters/parquet/index.ts','src/adapters/parquet/field-metadata.ts','src/adapters/parquet/containers.ts','src/adapters/parquet/schema.ts',
 'src/model/field-kind.ts','src/model/json.ts','src/model/serialization.ts','src/validation/document.ts','src/validation/schema.ts',
 'spec/core/parquet-record-type-classification.schema.json','spec/core/parquet-record-classification.schema.json','spec/core/schema.json',
 'spec/core/kind-operation-v6.schema.json','spec/extensions/parquet/schema.json','spec/extensions/parquet/package.json',
 'tests/core-ideals/parquet-record-type.test.ts','src/index.ts','crates/umf-core/src/lib.rs','crates/umf-core/src/core_record_type.rs',
 'docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
];
const canon=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,(x as Record<string,unknown>)[k]])):x);
const err=(e:unknown)=>({name:e instanceof Error?e.name:typeof e,message:e instanceof Error?e.message:String(e),code:(e as {code?:string})?.code??null});
const capture=(f:()=>unknown)=>{try{return{ok:true,value:f()}}catch(e){return{ok:false,error:err(e)}}};
async function produce(){
 const pins:Record<string,string>={};
 for(const p of sources)pins[p]=createHash('sha256').update(await readFile(resolve(root,p))).digest('hex');
 for(const id of fixtures)pins[`fixtures/parquet/containers/${id}.parquet`]=createHash('sha256').update(await readFile(resolve(root,`fixtures/parquet/containers/${id}.parquet`))).digest('hex');
 const outcomes:Record<string,unknown>={};let classified=0,blocked=0,recovered=0;
 const load=async(id:string)=>{const bytes=new Uint8Array(await readFile(resolve(root,`fixtures/parquet/containers/${id}.parquet`)));return{bytes,source:importParquetSchema(bytes,{id})}};
 for(const id of ['list-tuple','list-array','list-items_tuple']){
  const{bytes,source}=await load(id);
  for(const mode of ['strict','report'] as const){const result=classifyParquetRecordType(source,{index:2,recordModule:'records',recordId:'type',mode});if(result.status!=='classified')throw new Error(`Expected classified ${id}/${mode}`);classified++;const recovery:Record<string,string>={};
   for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;recovery[format]=Buffer.from(recoverParquetRecordTypeBytes(receipt,receipt.target!)).toString('hex');if(recovery[format]!==Buffer.from(bytes).toString('hex'))throw new Error(`Recovery mismatch ${id}/${mode}/${format}`);recovered++;}
   outcomes[`classified/${id}/${mode}`]={result,recoveryHex:recovery};
  }
 }
 for(const [id,indices] of [['list-three-element',[1,2,3]],['map-canonical',[1,2,3]]] as const){const{source}=await load(id);for(const index of indices)for(const mode of ['strict','report'] as const){const result=classifyParquetRecordType(source,{index,recordModule:'records',recordId:'type',mode});if(result.status!=='blocked'||result.target!==undefined)throw new Error(`Expected blocked ${id}/${index}/${mode}`);blocked++;outcomes[`blocked/${id}/${index}/${mode}`]=result;}}
 const{source}=await load('list-array'),request={index:2,recordModule:'records',recordId:'type',mode:'strict' as const},identity={module:'parquet.fields',element:'schema:2'};
 const wrong=declareCoreElementKind(source,identity,'record'),good=declareCoreElementKind(source,identity,'field');
 const result=classifyParquetRecordType(source,request),tamperedTarget=copyJson(result) as unknown as typeof result;tamperedTarget.target!.future=true;
 const tamperedReceipt=copyJson(result) as unknown as typeof result;tamperedReceipt.mappings.at(-1)!.nativePath='/wrong';
 const currentChanged=copyJson(result.target!) as unknown as typeof result.target;currentChanged!.id+='-changed';
 const tooLarge=copyJson(source) as typeof source;(tooLarge as unknown as Record<string,unknown>).packetBoundary=Array(100_001).fill(null);
 outcomes['controls']={
  rootIndex: capture(()=>classifyParquetRecordType(source,{...request,index:0})),
  wrongFieldAuthor:classifyParquetRecordType(wrong.target,{...request,fieldAuthor:wrong}),
  validFieldAuthor:classifyParquetRecordType(good.target,{...request,fieldAuthor:good}),
  tamperedTargetRecovery:capture(()=>recoverParquetRecordTypeBytes(tamperedTarget,tamperedTarget.target!)),
  tamperedReceiptRecovery:capture(()=>recoverParquetRecordTypeBytes(tamperedReceipt,tamperedReceipt.target!)),
  changedCurrentRecovery:capture(()=>recoverParquetRecordTypeBytes(result,currentChanged!)),
  missingCurrentRecovery:capture(()=>recoverParquetRecordTypeBytes(result,source)),
  wrongId:capture(()=>classifyParquetRecordType(source,{...request,index:9999})),
  resourceBoundary:capture(()=>classifyParquetRecordType(tooLarge,request)),
 };
 return{packet:'umf-r8-parquet-record-type-typescript-predecessor-v1',operations:['classifyParquetRecordType','recoverParquetRecordTypeBytes'],runtime:{bun:process.versions.bun},sourceAndFixturePins:pins,counts:{classified,blocked,recovered},outcomes};
}
const actual=await produce();
if(process.argv.includes('--check')){const expected=JSON.parse(await readFile(packetPath,'utf8'));if(canon(actual)!==canon(expected)){console.error('Parquet Record Type predecessor packet differs; regenerate only after reviewing the TypeScript source/fixture cohort.');process.exitCode=1;}else console.log(`Parquet Record Type predecessor packet matches (${actual.counts.classified} classified, ${actual.counts.blocked} blocked, ${actual.counts.recovered} recovered).`);}
else{await writeFile(packetPath,JSON.stringify(actual,null,2)+'\n');console.log(`Wrote ${packetPath}`);}
