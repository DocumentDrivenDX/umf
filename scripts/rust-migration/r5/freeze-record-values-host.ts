// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze raw JavaScript admission/order for the record-values candidate.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {readDocument,validateCoreRecordValues,type CoreRecordFieldValue,type Document} from '../../../src/index';

const root=process.cwd();
const closure=[
  'src/model/record-values.ts','src/model/internal/record-body.ts','src/model/schema-properties.ts',
  'src/model/internal/field-body.ts','src/model/internal/inspection-meanings.ts','src/model/schema-literals.ts',
  'src/model/json.ts','src/model/types.ts','src/model/errors.ts','src/generated/core-model.ts',
  'src/generated/core-validators.ts','src/validation/document.ts','src/validation/current-policy.ts',
  'src/validation/constraint-kernel.ts','src/validation/internal-schema.ts','src/validation/json-equality.ts',
  'src/validation/literal-kernel.ts','src/validation/literal-policy.ts','src/validation/constraint-language.ts',
  'src/validation/schema-properties.ts','src/model/bit128.ts','src/model/uuid.ts',
  'src/registry/registry.ts','spec/core/schema.json','spec/core/semantic-type-reference.schema.json',
  'spec/core/extension-package.schema.json','spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json','fixtures/core/record-values-current.umf.json',
  'tests/core-record-values.test.ts','docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
  'docs/helix/02-design/contracts/CONTRACT-002-json-schema.md','docs/helix/02-design/contracts/CONTRACT-003-protobuf.md',
  'docs/helix/02-design/contracts/CONTRACT-004-json-schema-protobuf-projection.md',
  'docs/helix/02-design/contracts/CONTRACT-005-ddd-profile.md','docs/helix/02-design/contracts/CONTRACT-006-ddd-document-projection.md',
  'docs/helix/02-design/contracts/CONTRACT-007-avro.md','docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md',
  'docs/helix/02-design/contracts/CONTRACT-009-graphql-sdl.md','docs/helix/02-design/contracts/CONTRACT-010-graphql-input-projection.md',
  'docs/helix/02-design/contracts/CONTRACT-011-openapi.md','docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md',
];
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex');
const sourceClosureSha256=Object.fromEntries(await Promise.all(closure.map(async path=>[path,await hash(path)])));
const source=readDocument(await Bun.file(resolve(root,'fixtures/core/record-values-current.umf.json')).text(),'json') as Document;
const identity={module:'fixture',element:'item'};
const values:CoreRecordFieldValue[]=[{field:{module:'fixture',element:'label'},state:'present',value:{string:'x'}}];
const capture=(run:()=>unknown)=>{try{return {ok:true,value:run()}}catch(error){const e=error as {name?:string;code?:string;message?:string;path?:string};return {ok:false,error:{name:e.name??'Error',code:e.code??'',message:e.message??String(error),path:e.path??''}}}};
const prototypeOrder=(value:unknown):unknown=>{
  if(Array.isArray(value))return {kind:'array',items:value.map(prototypeOrder)};
  if(value&&typeof value==='object'){
    const prototype=Object.getPrototypeOf(value);
    return {kind:prototype===null?'null-object':prototype===Object.prototype?'plain-object':'other-object',keys:Object.keys(value),fields:Object.fromEntries(Object.keys(value).map(key=>[key,prototypeOrder((value as Record<string,unknown>)[key])]))};
  }
  return typeof value;
};
const base=capture(()=>validateCoreRecordValues(source,identity,values));
let sourceGetterCalls=0,identityGetterCalls=0,valuesGetterCalls=0;
const sourceAccessor={...source};Object.defineProperty(sourceAccessor,'future',{enumerable:true,get(){sourceGetterCalls++;return true}});
const identityAccessor={get module(){identityGetterCalls++;return 'fixture'},element:'item'};
const valuesAccessor=[{field:{module:'fixture',element:'label'},state:'present',get value(){valuesGetterCalls++;return {string:'x'}}}];
const sourceFirst=capture(()=>validateCoreRecordValues(sourceAccessor as never,identityAccessor as never,valuesAccessor as never));
const sourceFirstCalls={sourceGetterCalls,identityGetterCalls,valuesGetterCalls};
sourceGetterCalls=identityGetterCalls=valuesGetterCalls=0;
const identityFirst=capture(()=>validateCoreRecordValues(source,identityAccessor as never,valuesAccessor as never));
const identityFirstCalls={sourceGetterCalls,identityGetterCalls,valuesGetterCalls};
sourceGetterCalls=identityGetterCalls=valuesGetterCalls=0;
const valuesBeforeSemantic=capture(()=>validateCoreRecordValues({...source,umf:'0.7.0'} as never,identity,valuesAccessor as never));
const valuesBeforeSemanticCalls={sourceGetterCalls,identityGetterCalls,valuesGetterCalls};
const extraSource={...source};Object.defineProperty(extraSource,'hidden',{value:true,enumerable:false});
const symbolSource={...source,[Symbol('future')]:true};
const customSource=Object.assign(Object.create({future:true}),source);
const sparseValues=new Array(1);
const cyclicSource={...source};(cyclicSource as Record<string,unknown>).cycle=cyclicSource;
const invalidNumbers=[NaN,Infinity,-Infinity,-0,Number.MAX_SAFE_INTEGER+1];
const rawCases={
  sourceAccessor:sourceFirst,
  identityAccessor:identityFirst,
  valuesAccessorBeforeSourceVersion:valuesBeforeSemantic,
  hiddenSource:capture(()=>validateCoreRecordValues(extraSource as never,identity,values)),
  symbolSource:capture(()=>validateCoreRecordValues(symbolSource as never,identity,values)),
  customPrototypeSource:capture(()=>validateCoreRecordValues(customSource as never,identity,values)),
  sparseValues:capture(()=>validateCoreRecordValues(source,identity,sparseValues as never)),
  cyclicSource:capture(()=>validateCoreRecordValues(cyclicSource as never,identity,values)),
  invalidNumbers:invalidNumbers.map((value,index)=>({id:['nan','positiveInfinity','negativeInfinity','negativeZero','unsafeInteger'][index],outcome:capture(()=>validateCoreRecordValues(source,identity,[{field:{module:'fixture',element:'label'},state:'present',value:{number:value}} as never]))})),
  nonJsonValues:capture(()=>validateCoreRecordValues(source,identity,[undefined] as never)),
  hiddenIdentity:(()=>{const item={module:'fixture'};Object.defineProperty(item,'element',{value:'item',enumerable:false});return capture(()=>validateCoreRecordValues(source,item as never,values))})(),
  symbolIdentity:capture(()=>validateCoreRecordValues(source,{...identity,[Symbol('future')]:true} as never,values)),
  customPrototypeIdentity:capture(()=>validateCoreRecordValues(source,Object.assign(Object.create({future:true}),identity) as never,values)),
  crossedInvalidSemanticSource:capture(()=>validateCoreRecordValues({...source,umf:'0.7.0'} as never,{module:''} as never,[null] as never)),
  sourceThenIdentityThenValuesGetterCounts:{sourceFirst:sourceFirstCalls,identityFirst:identityFirstCalls,valuesBeforeSemantic:valuesBeforeSemanticCalls},
};
const semanticOrder={
  invalidSourceBeforeIdentityMeaning:capture(()=>validateCoreRecordValues({...source,umf:'0.7.0'} as never,{module:''} as never,values)),
  copiedValuesBeforeIdentityMeaning:capture(()=>validateCoreRecordValues(source,{module:''} as never,[null] as never)),
};
const success=base.ok?(base as {ok:true;value:unknown}).value:null;
const largeSource=structuredClone(source);(largeSource as Record<string,unknown>)['x-future-assertion']={opaque:'x'.repeat(700_000)};
const large=capture(()=>{const result=validateCoreRecordValues(largeSource as never,identity,values);return {length:(result.source as Record<string,any>)['x-future-assertion'].opaque.length,prototypeOrder:prototypeOrder(result)}});
const countLimit=capture(()=>validateCoreRecordValues(source,identity,new Array(100_001).fill(null) as never));
const packet={profile:'core-record-values-host-admission/1',predecessor:'src/model/record-values.ts',runtime:{host:'Bun',bunVersion:Bun.version,nodeCompatibility:process.version},captureScriptSha256:await hash('scripts/rust-migration/r5/freeze-record-values-host.ts'),sourceClosureSha256,fixture:{source,identity,values},outcomes:{base,prototypeOrder:success===null?null:prototypeOrder(success),rawCases,semanticOrder,large:{units:700_000,outcome:large},countLimit:{inputLength:100_001,outcome:countLimit}}};
const out='docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json';
const bytes=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){
  const current=await Bun.file(resolve(root,out)).text();
  if(current!==bytes)throw new Error('record-values host packet or source closure is stale');
}else{
  await mkdir(dirname(resolve(root,out)),{recursive:true});
  await Bun.write(out,bytes);
}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',out,sourceFiles:closure.length,rawCases:Object.keys(rawCases).length,profile:packet.profile}));
