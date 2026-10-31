// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {readDocument,validateCoreDatasetValues,verifyCoreDatasetValues} from '../../../../../../src/index';
import {commerceDataset} from '../../../../../../tests/helpers/commerce-dataset';

const root='tests/rust-core/fixtures/r5-dataset-values';
mkdirSync(root,{recursive:true});
const source=readDocument(readFileSync('spec/domain-packs/commerce/ontology.json','utf8'),'json');
const graph=JSON.parse(readFileSync('spec/domain-packs/commerce/graph/fixture.json','utf8'));
const input=commerceDataset(source,graph);
const clone=<T>(v:T):T=>structuredClone(v);
const outcome=(s:unknown,i:unknown)=>{try{return {ok:true,value:validateCoreDatasetValues(s as any,i as any)};}catch(e){return {ok:false,error:{name:e instanceof Error?e.name:'Error',message:e instanceof Error?e.message:String(e),code:(e as any)?.code??null}};}};
const cases:Record<string,{source:unknown;input:unknown}>={commerce:{source,input},nested_key_control:{source,input}};
for(const [id,mutate] of Object.entries({
  closed_scope:(s:any,i:any)=>{i.scope.closure='global';},
  unknown_input_member:(s:any,i:any)=>{i.future='retained';},
  duplicate_instance:(s:any,i:any)=>{i.records[1].instanceId=i.records[0].instanceId;},
  unknown_source_meaning:(s:any,i:any)=>{s['x-future-policy']={meaning:'preserve🙂'};},
  supplementary_and_surrogate:(s:any,i:any)=>{s['x-utf16']=['astral 🧭','lone \ud800'];},
  unsupported_lifecycle:(s:any,i:any)=>{s.modules[0].relationships[0].targetLifecycle='owned';},
  unknown_relationship_declaration:(s:any,i:any)=>{s.modules[0].relationships[0]['x-future-policy']={meaning:'retain declaration meaning'};},
  surrogate_unknown_path:(s:any,i:any)=>{s['x-\ud800']={meaning:'retain by raw UTF-16 pointer'};},
  duplicate_locator_first_wins:(s:any,i:any)=>{i.records=[i.records[2],i.records[1],i.records[0],...i.records.slice(3)];i.records[1].instanceId=i.records[0].instanceId;},
  duplicate_key_path:(s:any,i:any)=>{i.records=[i.records[0],{...clone(i.records[0]),instanceId:'distinct-duplicate-key'}];i.relationships=[];},
  unknown_key_residual:(s:any,i:any)=>{s.modules[0].elements[0].keys[0]['future-equality']={meaning:'retained key meaning'};i.records=[i.records[0]];i.relationships=[];},
  unsupported_relationship_order:(s:any,i:any)=>{s.modules[0].relationships[0].targetLifecycle='owned';s.modules[0].relationships[1].targetLifecycle='owned';i.records=[];i.relationships=[];},
})) {const s=clone(source),i=clone(input);mutate(s,i);if(id==='unknown_source_meaning'||id==='supplementary_and_surrogate'||id==='unsupported_lifecycle'||id==='surrogate_unknown_path'||id==='unsupported_relationship_order'){i.records=[];i.relationships=[];}if(id==='duplicate_instance'){i.records=i.records.slice(0,2);i.relationships=[];}cases[id]={source:s,input:i};}
const oversized=clone(input);oversized.records=Array(1000).fill(input.records[0]);cases.oversized={source,input:oversized};
const valueCountSource=clone(source);valueCountSource['x-r5-large-payload']=Array.from({length:50000},(_,i)=>i);const valueCountInput=clone(input);valueCountInput.records=[];valueCountInput.relationships=[];cases.unknown_source_value_count={source:valueCountSource,input:valueCountInput};
const targetKeyInput=clone(input);targetKeyInput.relationships[0].target.values=[{boolean:true}];cases.invalid_target_key_updates_key_obligation={source,input:targetKeyInput};
const unknownTargetSource=clone(source);const supplier=unknownTargetSource.modules[0].elements.find(e=>e.id==='suppliers');supplier.keys[0]['future-equality']={meaning:'target equality remains unknown'};const unknownTargetInput=clone(input);unknownTargetInput.records=unknownTargetInput.records.filter(r=>r.identity.element==='products');unknownTargetInput.relationships=[unknownTargetInput.relationships[0]];cases.unknown_target_key_updates_key_obligation={source:unknownTargetSource,input:unknownTargetInput};
const wrongVersionSource=clone(source);wrongVersionSource.umf='0.11.0';const wrongVersionInput=clone(input);wrongVersionInput.records=[];wrongVersionInput.relationships=[];cases.wrong_version_document_validation_order={source:wrongVersionSource,input:wrongVersionInput};
const index:Record<string,{file:string;outcome:unknown}>={};
for(const [id,v] of Object.entries(cases)){
 const result=outcome(v.source,v.input),file=`frozen-${id}.json`;
 writeFileSync(`${root}/${file}`,JSON.stringify({schema:'umf-r5-dataset-values-freeze/1',id,...v,outcome:result},null,2)+'\n');
 index[id]={file,outcome:result.ok?{ok:true}:result};
}
writeFileSync(`${root}/frozen-typescript.json`,JSON.stringify({schema:'umf-r5-dataset-values-freeze-index/1',cases:index},null,2)+'\n');
const verifyCases:Record<string,{receipt:unknown;current:unknown;expectedInput:unknown}>={};
const commerceReceipt=validateCoreDatasetValues(source,input);
verifyCases.valid_commerce={receipt:commerceReceipt,current:clone(source),expectedInput:clone(input)};
const staleSource=clone(source);staleSource.title+=' (stale)';verifyCases.stale_source={receipt:commerceReceipt,current:staleSource,expectedInput:clone(input)};
const staleInput=clone(input);staleInput.scope.id+='-stale';verifyCases.stale_input={receipt:commerceReceipt,current:clone(source),expectedInput:staleInput};
const forged=clone(commerceReceipt);forged.datasetValidation.valid=!forged.datasetValidation.valid;verifyCases.forged_result={receipt:forged,current:clone(source),expectedInput:clone(input)};
const verifyIndex:Record<string,{file:string;outcome:unknown}>={};
for(const [id,v] of Object.entries(verifyCases)){const result=(()=>{try{return {ok:true,value:verifyCoreDatasetValues(v.receipt as any,v.current as any,v.expectedInput as any)};}catch(e){return {ok:false,error:{name:e instanceof Error?e.name:'Error',message:e instanceof Error?e.message:String(e),code:(e as any)?.code??null}};}})();const file=`frozen-verify-${id}.json`;writeFileSync(`${root}/${file}`,JSON.stringify({schema:'umf-r5-dataset-values-verify-freeze/1',id,...v,outcome:result},null,2)+'\n');verifyIndex[id]={file,outcome:result.ok?{ok:true}:result};}
writeFileSync(`${root}/frozen-verify-typescript.json`,JSON.stringify({schema:'umf-r5-dataset-values-verify-index/1',cases:verifyIndex},null,2)+'\n');
