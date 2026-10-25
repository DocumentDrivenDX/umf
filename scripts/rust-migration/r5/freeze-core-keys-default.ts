// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze raw-host admission, result shape, and bounded-source behavior for the
// current TypeScript default-route predecessor.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {declareCoreKey,declareCoreRecordMembers,inspectCoreKeys,lookupCoreKey,verifyCoreKeyOperation} from '../../../src/model/keys';
import {uuidDocument} from '../../../tests/helpers/uuid-fixtures';

const root=process.cwd();
const closure=['src/model/keys.ts','src/model/key-tuple.ts','src/model/types.ts','src/model/errors.ts','src/model/json.ts','src/model/internal/inspection-meanings.ts','src/generated/core-model.ts','src/generated/core-validators.ts','src/validation/document.ts','src/validation/current-policy.ts','src/validation/constraint-kernel.ts','src/validation/schema.ts','src/validation/internal-schema.ts','src/validation/json-equality.ts','src/validation/literal-kernel.ts','src/validation/literal-policy.ts','src/validation/constraint-language.ts','src/validation/keys.ts','src/registry/registry.ts','spec/core/schema.json','spec/core/key-operation-v2.schema.json','spec/core/key-operation-v4.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','tests/helpers/uuid-fixtures.ts'];
const sourceClosureSha256=Object.fromEntries(await Promise.all(closure.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex')])));
const capture=(run:()=>unknown)=>{try{return {ok:true,value:run()}}catch(error){const e=error as {name?:string;code?:string;message?:string;path?:string};return {ok:false,error:{name:e.name??'Error',code:e.code??'',message:e.message??String(error),path:e.path??''}}}};
const prototypeShape=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(prototypeShape);if(value&&typeof value==='object'){const prototype=Object.getPrototypeOf(value);return {prototype:prototype===null?'null':prototype===Object.prototype?'plain':'other',fields:Object.fromEntries(Object.keys(value).sort().map(key=>[key,prototypeShape((value as Record<string,unknown>)[key])]))}}return typeof value};
const record={module:'m',element:'record'},field={module:'m',element:'value'};
const source=()=>structuredClone(uuidDocument('integer'));
const base=source();delete base.modules[0]!.elements[0]!.keys;delete base.modules[0]!.elements[0]!.members;
const members=declareCoreRecordMembers(base,record,[field]);
const key=declareCoreKey(members.target,record,{id:'pk',name:'ID',fields:[field],primary:true});
const lookupIdentity={...record,key:'id'};
const outcomes={
 inspect: capture(()=>inspectCoreKeys(source(),record)),
 lookup: capture(()=>lookupCoreKey(source(),lookupIdentity)),
 declareMembers: capture(()=>declareCoreRecordMembers(base,record,[field])),
 declareKey: capture(()=>declareCoreKey(members.target,record,{id:'pk',name:'ID',fields:[field],primary:true})),
 verifyKey: capture(()=>verifyCoreKeyOperation(key,key.target)),
 host: {} as Record<string,unknown>,
};
let sourceGetterCalls=0,identityGetterCalls=0,currentGetterCalls=0,requestGetterCalls=0;
const badSource={get future(){sourceGetterCalls++;return true}};
const badIdentity={get module(){identityGetterCalls++;return 'm'},element:'record',key:'id'};
const badCurrent={get future(){currentGetterCalls++;return true}};
const badRequest={get id(){requestGetterCalls++;return 'pk'},name:'ID',fields:[field]};
const duplicateMembers=[field,field];
const invalidKeyIdentity={module:'m',element:'record',key:2};
const malformedReceipt={operation:'declare-core-key',version:'2.0.0'};
const host={
 inspectSourceAccessor:capture(()=>inspectCoreKeys(badSource as never,record)),
 inspectIdentityAccessor:capture(()=>inspectCoreKeys(source(),badIdentity as never)),
 lookupIdentityBeforeSource:capture(()=>lookupCoreKey(badSource as never,invalidKeyIdentity as never)),
 memberRequestBeforeSource:capture(()=>declareCoreRecordMembers(badSource as never,record,duplicateMembers)),
 keyRequestAccessor:capture(()=>declareCoreKey(source(),record,badRequest as never)),
 keyRequestBeforeSource:capture(()=>declareCoreKey(badSource as never,record,{id:'',name:'ID',fields:[field]})),
 malformedReceiptBeforeCurrent:capture(()=>verifyCoreKeyOperation(malformedReceipt as never,badCurrent as never)),
  nullReceiptBeforeCurrent:capture(()=>verifyCoreKeyOperation(null as never,badCurrent as never)),
  primitiveReceiptBeforeCurrent:capture(()=>verifyCoreKeyOperation(7 as never,badCurrent as never)),
 validReceiptBeforeCurrent:capture(()=>verifyCoreKeyOperation(key,badCurrent as never)),
 getterCalls:{source:sourceGetterCalls,identity:identityGetterCalls,current:currentGetterCalls,request:requestGetterCalls},
};
outcomes.host=host;
const shapes={
 inspect:outcomes.inspect.ok?prototypeShape(outcomes.inspect.value):null,
 lookup:outcomes.lookup.ok?prototypeShape(outcomes.lookup.value):null,
 declareMembers:outcomes.declareMembers.ok?prototypeShape(outcomes.declareMembers.value):null,
 declareKey:outcomes.declareKey.ok?prototypeShape(outcomes.declareKey.value):null,
 verifyKey:outcomes.verifyKey.ok?prototypeShape(outcomes.verifyKey.value):null,
};
const resourceUnits=700_000;
const large=source();(large.modules[0]!.elements[0]!.keys![0] as any).futureQualifier={opaque:'x'.repeat(resourceUnits)};
const largeMembers=declareCoreRecordMembers(large,record,[field]);
const largeKey=declareCoreKey(largeMembers.target,record,{id:'id',name:'Renamed',fields:[field],primary:true});
const largeResource={units:resourceUnits,inspect:capture(()=>{const result=inspectCoreKeys(large,record);return {sourceUnits:(result.source.modules[0]!.elements[0]!.keys![0] as any).futureQualifier.opaque.length,meaning:result.meaning.state}}),declare:capture(()=>{const result=declareCoreKey(largeMembers.target,record,{id:'id',name:'Renamed',fields:[field],primary:true});return {sourceUnits:(result.source.modules[0]!.elements[0]!.keys![0] as any).futureQualifier.opaque.length,targetUnits:(result.target.modules[0]!.elements[0]!.keys![0] as any).futureQualifier.opaque.length}}),verify:capture(()=>{const result=verifyCoreKeyOperation(largeKey,largeKey.target) as any;return {operation:result.operation,targetUnits:result.target.modules[0]!.elements[0]!.keys![0].futureQualifier.opaque.length}})};
const path='docs/helix/04-build/evidence/rust-migration/r5-core-keys-default-route/frozen-typescript.json';
await mkdir(dirname(resolve(root,path)),{recursive:true});
await Bun.write(path,JSON.stringify({profile:'core-key-default-route/1',predecessor:'src/model/keys.ts',sourceClosureSha256,fixtures:{source:base,record,field,lookupIdentity,members:members,receipt:key},outcomes,prototypeShapes:shapes,largeResource},null,2)+'\n');
console.log(JSON.stringify({path,sourceFiles:closure.length,resourceUnits,hostCases:Object.keys(host).length-1}));
