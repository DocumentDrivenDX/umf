// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the unchanged TypeScript core Key authoring/inspection predecessor.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {declareCoreKey,declareCoreRecordMembers,inspectCoreKeys,lookupCoreKey,verifyCoreKeyOperation} from '../../../src/model/keys';
import {readJsonValue,writeJsonValue} from '../../../src/model/serialization';
import {uuidDocument} from '../../../tests/helpers/uuid-fixtures';

const root=process.cwd();
const closure=['src/model/keys.ts','src/model/types.ts','src/model/errors.ts','src/model/json.ts','src/model/serialization.ts','src/model/internal/inspection-meanings.ts','src/generated/core-model.ts','src/generated/core-validators.ts','src/validation/document.ts','src/validation/current-policy.ts','src/validation/constraint-kernel.ts','src/validation/schema.ts','src/validation/internal-schema.ts','src/validation/json-equality.ts','src/validation/literal-kernel.ts','src/validation/literal-policy.ts','src/validation/constraint-language.ts','src/validation/keys.ts','src/registry/registry.ts','spec/core/schema.json','spec/core/key-operation-v2.schema.json','spec/core/key-operation-v4.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','tests/helpers/uuid-fixtures.ts'];
const hashes=Object.fromEntries(await Promise.all(closure.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex')])));
const record={module:'m',element:'record'},field={module:'m',element:'value'};
const source=()=>structuredClone(uuidDocument('integer'));
const base=source();delete base.modules[0]!.elements[0]!.keys;delete base.modules[0]!.elements[0]!.members;
const existing=source();(existing.modules[0]!.elements[0]!.keys![0] as any).futureQualifier={opaque:true};(existing.modules[0]!.elements[0]!.keys![0]!.fields[0] as any).future='keep';(existing.modules[0]!.elements[0]!.members![0] as any).future='keep';
const badTuple=structuredClone(source());badTuple.modules[0]!.elements[0]!.members=[field];
const cases:Record<string,()=>unknown>={
  inspect_known:()=>inspectCoreKeys(source(),record),
  inspect_absent:()=>{const d=source();delete d.modules[0]!.elements[0]!.keys;return inspectCoreKeys(d,record)},
  inspect_inapplicable:()=>inspectCoreKeys(source(),field),
  lookup_by_stable_id:()=>lookupCoreKey(source(),{...record,key:'id'}),
  lookup_name_does_not_resolve:()=>lookupCoreKey(source(),{...record,key:'ID'}),
  declare_members_ordered:()=>declareCoreRecordMembers(base,record,[field]),
  declare_key_explicit_primary:()=>declareCoreKey(declareCoreRecordMembers(base,record,[field]).target,record,{id:'pk',name:'ID',fields:[field],primary:true}),
  preserve_unknown_qualifiers:()=>declareCoreKey(existing,record,{id:'id',name:'Renamed',fields:[field]}),
  remove_unknown_member_refused:()=>declareCoreRecordMembers(existing,record,[]),
  tuple_change_refused:()=>declareCoreKey(badTuple,record,{id:'id',name:'ID',fields:[field]}),
  old_profile_refused:()=>declareCoreKey({...base,umf:'0.8.0'} as never,record,{id:'pk',name:'ID',fields:[field]}),
  extra_identity_refused:()=>inspectCoreKeys(base,{...record,extra:true} as never),
  duplicate_member_request_before_source:()=>declareCoreRecordMembers({umf:'bad'} as never,record,[field,field]),
  duplicate_key_request_before_source:()=>declareCoreKey({umf:'bad'} as never,record,{id:'pk',name:'ID',fields:[field,field]}),
  lookup_identity_before_source:()=>lookupCoreKey({umf:'bad'} as never,{...record,key:42} as never),
  receipt_shape_before_recompute:()=>verifyCoreKeyOperation({operation:'declare-core-key',version:'2.0.0'} as never,{umf:'bad'} as never),
};
const caseInputs:Record<string,unknown>={
  inspect_known:{source:source(),identity:record},
  inspect_absent:{source:(()=>{const d=source();delete d.modules[0]!.elements[0]!.keys;return d})(),identity:record},
  inspect_inapplicable:{source:source(),identity:field},
  lookup_by_stable_id:{source:source(),identity:{...record,key:'id'}},
  lookup_name_does_not_resolve:{source:source(),identity:{...record,key:'ID'}},
  declare_members_ordered:{source:base,identity:record,request:[field]},
  declare_key_explicit_primary:{source:declareCoreRecordMembers(base,record,[field]).target,identity:record,request:{id:'pk',name:'ID',fields:[field],primary:true}},
  preserve_unknown_qualifiers:{source:existing,identity:record,request:{id:'id',name:'Renamed',fields:[field]}},
  remove_unknown_member_refused:{source:existing,identity:record,request:[]},
  tuple_change_refused:{source:badTuple,identity:record,request:{id:'id',name:'ID',fields:[field]}},
  old_profile_refused:{source:{...base,umf:'0.8.0'},identity:record,request:{id:'pk',name:'ID',fields:[field]}},
  extra_identity_refused:{source:base,identity:{...record,extra:true}},
  duplicate_member_request_before_source:{source:{umf:'bad'},identity:record,request:[field,field]},
  duplicate_key_request_before_source:{source:{umf:'bad'},identity:record,request:{id:'pk',name:'ID',fields:[field,field]}},
  lookup_identity_before_source:{source:{umf:'bad'},identity:{...record,key:42}},
  receipt_shape_before_recompute:{receipt:{operation:'declare-core-key',version:'2.0.0'},current:{umf:'bad'}},
};
const outcomes=Object.fromEntries(Object.entries(cases).map(([n,run])=>{try{return[n,{ok:true,value:run()}]}catch(error){const e=error as {code?:string;message?:string;path?:string};return[n,{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}]}}));
const receipt=declareCoreKey(declareCoreRecordMembers(base,record,[field]).target,record,{id:'pk',name:'ID',fields:[field],primary:true});
try{verifyCoreKeyOperation(receipt,{...receipt.target,id:'stale'});outcomes.verify_stale_document={ok:true,value:'unexpected acceptance'}}catch(error){const e=error as {code?:string;message?:string;path?:string};outcomes.verify_stale_document={ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}}
for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(receipt,format),format) as never;outcomes[`roundtrip_${format}`]={ok:true,value:verifyCoreKeyOperation(saved,receipt.target)}}
const path='docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json';await mkdir(dirname(resolve(root,path)),{recursive:true});await Bun.write(path,JSON.stringify({profile:'core-key-authoring-inspection/2.0.0+4.0.0',predecessor:'src/model/keys.ts',sourceClosureSha256:hashes,cases:caseInputs,outcomes},null,2)+'\n');console.log(path);
