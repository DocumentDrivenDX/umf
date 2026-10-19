// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private atomic logical evaluation. Supplied operation completeness and cut trust are premises. */
import {copyJson} from '../../model/json';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {CandidateSecurityOperationBudget} from './operation-budget-candidate';
import {evaluateCandidateCatalogActionWithinOperation,evaluateCandidateCatalogScanWithinOperation,evaluateCandidateCatalogReadRuleScanWithinOperation,type CandidateCatalogRuleScanResult,type CandidateCatalogActionResult,type CandidateCatalogCollectionResult} from './catalog-runtime-candidate';
export interface CandidateCatalogOperationBatchResult {
 status:'completed'|'refused';complete:false;authority:false;
 operations:readonly ({id:string;kind:'scan';outcome:CandidateCatalogCollectionResult}|{id:string;kind:'action';outcome:CandidateCatalogActionResult}|{id:string;kind:'read-rules';outcome:CandidateCatalogRuleScanResult})[];
}
const fail=():never=>{throw Error('SECURITY_OPERATION_BATCH_REFUSED');};
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const ref=(r:any)=>{shape(r,['documentId','moduleId','elementId']);if(Object.values(r).some(v=>typeof v!=='string'||!v))fail();return JSON.stringify([r.documentId,r.moduleId,r.elementId]);};
/** Completed means evaluated, never permitted. A denied/unknown action remains an explicit decision. */
export function evaluateCandidateCatalogOperationBatch(handle:unknown,ownerInput:unknown,cutInput:unknown,operationsInput:unknown):CandidateCatalogOperationBatchResult {
 const refused=()=>freeze<CandidateCatalogOperationBatchResult>({status:'refused',complete:false,authority:false,operations:[]});
 try{
  readCandidateCatalogProgram(handle);
  const packet:any=copyJson({owner:ownerInput,cut:cutInput,operations:operationsInput}),{owner,cut,operations}=packet;
  if(!Array.isArray(operations)||!operations.length||operations.length>256||!Number.isSafeInteger(cut.maxFacts)||cut.maxFacts<1||cut.maxFacts>10000||!Array.isArray(cut.facts)||!Array.isArray(cut.graphs))fail();
  const ledger=new CandidateSecurityOperationBudget(cut.maxSteps),pending=[packet];
  while(pending.length){ledger.step();const x=pending.pop();if(typeof x==='string')ledger.snapshotText(x.length);else if(x&&typeof x==='object')for(const [key,value] of Object.entries(x)){ledger.snapshotText(key.length);pending.push(value);}}
  let population=cut.facts.length+cut.graphs.length;const ids=new Set<string>();
  // Charge the retained inventory once plus every scan visit or explicit action target.
  for(const op of operations){
   if(typeof op.id!=='string'||! /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(op.id)||ids.has(op.id))fail();ids.add(op.id);
   if(op.kind==='scan'||op.kind==='read-rules'){
    shape(op,['id','kind','selection']);shape(op.selection,op.kind==='scan'?['type','fields']:['type']);const type=ref(op.selection.type);
    for(const fact of cut.facts){ledger.step();if(ref(fact.type)===type)population++;}
   }else if(op.kind==='action'){
    shape(op,['id','kind','request']);shape(op.request,['action','resources','targets','fields']);if(!Array.isArray(op.request.resources))fail();population+=op.request.resources.length;
   }else fail();
   if(population>cut.maxFacts)fail();
  }
  const results:CandidateCatalogOperationBatchResult['operations'][number][]=[];
  for(const op of operations){
   if(op.kind==='scan'){
    const outcome=evaluateCandidateCatalogScanWithinOperation(handle,owner,cut,op.selection,ledger);if(outcome.status!=='rendered')fail();results.push({id:op.id,kind:'scan',outcome});
   }else if(op.kind==='read-rules'){
    const outcome=evaluateCandidateCatalogReadRuleScanWithinOperation(handle,owner,cut,op.selection,ledger);if(outcome.status!=='evaluated')fail();results.push({id:op.id,kind:'read-rules',outcome});
   }else{
    const outcome=evaluateCandidateCatalogActionWithinOperation(handle,owner,cut,op.request,ledger);if(outcome.status!=='evaluated')fail();results.push({id:op.id,kind:'action',outcome});
   }
  }
  return freeze({status:'completed',complete:false,authority:false,operations:results});
 }catch{return refused();}
}
