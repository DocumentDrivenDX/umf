// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private actual logical branch activation. No compiler designation, operands or native permission. */
import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';
import {evaluateCandidateCatalogReadRuleScan} from './catalog-runtime-candidate';
import {inspectCandidateQueryValueRoutes,type CandidateQueryValueRouteInspection} from './query-value-routes-candidate';
export interface CandidateQueryValueRouteEvaluation {
 status:'evaluated'|'refused';complete:false;authority:false;
 plan:CandidateQueryValueRouteInspection|null;
 rows:readonly {resource:Json;readDecision:string;rules:readonly Json[];activeBranches:readonly number[];selection:'read-denied'|'read-indeterminate'|'disclosure-conflict'|'selected'|'unresolved'}[];
}
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
/** Reconstruct original source plan; never accepts caller-provided guards or truth. */
export function evaluateCandidateQueryValueRoutes(handle:unknown,ownerInput:unknown,cutInput:unknown,useInput:unknown):CandidateQueryValueRouteEvaluation {
 const refused=()=>freeze<CandidateQueryValueRouteEvaluation>({status:'refused',complete:false,authority:false,plan:null,rows:[]});
 try{
  const packet:any=copyJson({owner:ownerInput,cut:cutInput,use:useInput});
  const plan=inspectCandidateQueryValueRoutes(handle,packet.owner,packet.use);if(plan.status!=='inspected')return refused();
  let retained=JSON.stringify({status:'evaluated',complete:false,authority:false,plan,rows:[]}).length;
  if(retained>4000000)throw Error('Retained route result bound');
  const actual=evaluateCandidateCatalogReadRuleScan(handle,packet.owner,packet.cut,{type:packet.use.type});if(actual.status!=='evaluated')return refused();
  const branches=plan.branches as any[],rows:CandidateQueryValueRouteEvaluation['rows'][number][]=[];
  for(const row of actual.rows){
   const truth=new Map(row.rules.map(r=>[r.ruleIndex,r.truth]));
   // Every retained scoped source condition must have actual original-kernel evidence.
   for(const condition of (plan.composition as any).readConditions)if(!truth.has(condition.ruleIndex))throw Error('Missing original scoped rule');
   const groups=branches.map(branch=>branch.sourceOccurrences.some((s:any)=>truth.get(s.ruleIndex)==='T'));
   const active=row.decision==='permit'?branches.filter(b=>groups[b.guard.anyActiveContributorGroup]&&b.guard.noActiveGroups.every((i:number)=>!groups[i])).map(b=>b.index):[];
   if(active.length>1)throw Error('Ambiguous generated routes');
   const activeTransforms=branches.filter((b,i)=>groups[i]&&b.representativeDisposition?.kind==='transformed').length;
   const withheld=branches.some((b,i)=>groups[i]&&b.representativeDisposition?.kind==='withheld');
   const selection=row.decision==='deny'?'read-denied':row.decision!=='permit'?'read-indeterminate':active.length===1?'selected':!withheld&&activeTransforms>1?'disclosure-conflict':'unresolved';
   const result:CandidateQueryValueRouteEvaluation['rows'][number]={resource:row.resource as Json,readDecision:row.decision,rules:row.rules as unknown as Json[],activeBranches:active,selection};
   retained+=JSON.stringify(result).length+(rows.length?1:0);if(retained>4000000)throw Error('Retained route result bound');rows.push(result);
  }
  return freeze({status:'evaluated',complete:false,authority:false,plan,rows});
 }catch{return refused();}
}
