// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private atomic logical evaluation. Supplied operation completeness and cut trust are premises. */
import {copyJson} from '../../model/json';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {CandidateSecurityOperationBudget} from './operation-budget-candidate';
import {admitCandidateCatalogOperationBatch,composeCandidateCatalogOperationBatch} from '#security-candidate-condition';
import {evaluateCandidateCatalogActionWithinOperation,evaluateCandidateCatalogScanWithinOperation,evaluateCandidateCatalogReadRuleScanWithinOperation,type CandidateCatalogRuleScanResult,type CandidateCatalogActionResult,type CandidateCatalogCollectionResult} from './catalog-runtime-candidate';
export interface CandidateCatalogOperationBatchResult {
 status:'completed'|'refused';complete:false;authority:false;
 operations:readonly ({id:string;kind:'scan';outcome:CandidateCatalogCollectionResult}|{id:string;kind:'action';outcome:CandidateCatalogActionResult}|{id:string;kind:'read-rules';outcome:CandidateCatalogRuleScanResult})[];
}
const fail=():never=>{throw Error('SECURITY_OPERATION_BATCH_REFUSED');};
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
/** Completed means evaluated, never permitted. A denied/unknown action remains an explicit decision. */
export function evaluateCandidateCatalogOperationBatch(handle:unknown,ownerInput:unknown,cutInput:unknown,operationsInput:unknown):CandidateCatalogOperationBatchResult {
 const refused=()=>freeze<CandidateCatalogOperationBatchResult>({status:'refused',complete:false,authority:false,operations:[]});
 try{
  readCandidateCatalogProgram(handle);
  const packet:any=copyJson({owner:ownerInput,cut:cutInput,operations:operationsInput}),{owner,cut,operations}=packet;
  if(!Array.isArray(operations)||!Number.isSafeInteger(cut.maxFacts)||!Array.isArray(cut.facts)||!Array.isArray(cut.graphs))fail();
  const ledger=new CandidateSecurityOperationBudget(cut.maxSteps),pending=[packet];
  while(pending.length){ledger.step();const x=pending.pop();if(typeof x==='string')ledger.snapshotText(x.length);else if(x&&typeof x==='object')for(const [key,value] of Object.entries(x)){ledger.snapshotText(key.length);pending.push(value);}}
  const admission:any=admitCandidateCatalogOperationBatch({operations,facts:cut.facts,graphs:cut.graphs,maxFacts:cut.maxFacts});if(admission?.admitted!==true||!Array.isArray(admission.items)||!Number.isSafeInteger(admission.visitWork)||admission.visitWork<0)fail();ledger.step(admission.visitWork);
  const results:CandidateCatalogOperationBatchResult['operations'][number][]=[];
  for(const op of admission.items){
   if(op.kind==='scan'){
    const outcome=evaluateCandidateCatalogScanWithinOperation(handle,owner,cut,op.selection,ledger);if(outcome.status!=='rendered')fail();results.push({id:op.id,kind:'scan',outcome});
   }else if(op.kind==='read-rules'){
    const outcome=evaluateCandidateCatalogReadRuleScanWithinOperation(handle,owner,cut,op.selection,ledger);if(outcome.status!=='evaluated')fail();results.push({id:op.id,kind:'read-rules',outcome});
   }else{
    const outcome=evaluateCandidateCatalogActionWithinOperation(handle,owner,cut,op.request,ledger);if(outcome.status!=='evaluated')fail();results.push({id:op.id,kind:'action',outcome});
   }
  }
  return freeze(composeCandidateCatalogOperationBatch({items:results}) as CandidateCatalogOperationBatchResult);
 }catch{return refused();}
}
