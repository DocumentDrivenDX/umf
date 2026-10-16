/** Complete finite Boolean context family, independent of generated guard lists. */
import source from './protection/query-value-route-guards.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogScan} from '../../src/extensions/security/catalog-runtime-candidate';
import {inspectCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-routes-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function runQueryValueRouteGuardCorpus(){
 const f:any=structuredClone(source),program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology),use={scan:'s0',path:'filters/0/left',type:ref('Resource'),field:ref('salary'),operator:'predicate',operation:'equal',required:['equality']};
 const plan=inspectCandidateQueryValueRoutes(program,f.owner,use);if(plan.status!=='inspected')throw Error('Guard source plan refused');
 const observations:any[]=[],checks:{id:string;expected:unknown;observed:unknown;passed:boolean}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>checks.push({id,expected,observed,passed:JSON.stringify(expected)===JSON.stringify(observed)});
 const label=(branch:any)=>branch.projection.kind==='transformed'?(branch.representativeDisposition.transform==='salary-label'?'mask-A':'mask-B'):branch.projection.kind==='unresolved-missing-disclosure'?'missing':branch.projection.kind;
 for(let mask=0;mask<64;mask++){
  const flags=Array.from({length:6},(_,i)=>Boolean(mask&(1<<i))),eligible=flags.some(Boolean),a=flags[0]||flags[1],b=flags[2],w=flags[4];
  const expected= !eligible?'denied':w?'withheld':a&&b?'conflict':a?'mask-A':b?'mask-B':flags[3]?'original':'missing';
  f.logicalCut.context=flags.map((value,i)=>({field:ref('guard'+i),value:{boolean:value}}));
  const actual=evaluateCandidateCatalogScan(program,f.owner,f.logicalCut,{type:ref('Resource'),fields:[ref('salary')]}),rowRead=evaluateCandidateCatalogScan(program,f.owner,f.logicalCut,{type:ref('Resource'),fields:[]});
  const groups=(plan.branches as any[]).map(branch=>branch.sourceOccurrences.some((s:any)=>flags[s.ruleIndex]===true));
  const active=(plan.branches as any[]).filter(branch=>eligible&&groups[branch.guard.anyActiveContributorGroup]&&branch.guard.noActiveGroups.every((index:number)=>!groups[index])).map(label);
  const expectedActive=['denied','conflict'].includes(expected)?[]:[expected];
  const expectedRows=expected==='denied'?[]:expected==='withheld'?[[{field:ref('salary'),disposition:'withheld'}]]:expected==='original'?[[{field:ref('salary'),disposition:'original',value:{integerToken:'100'}}]]:expected==='mask-A'||expected==='mask-B'?[[{field:ref('salary'),disposition:'transformed',outputType:ref('salaryMaskLabel'),value:{string:expected==='mask-A'?'[private]':'[alternate]'}}]]:[];
  const expectedStatus=['conflict','missing'].includes(expected)?'refused':'rendered';
  check('guard-'+mask+':branch-selection',expectedActive,active);check('guard-'+mask+':actual-disclosure-fold',{status:expectedStatus,rows:expectedRows},{status:actual.status,rows:actual.rows});check('guard-'+mask+':read-eligibility',['rendered',eligible?[[]]:[]],[rowRead.status,rowRead.rows]);
  observations.push({mask,flags,expectedFold:expected,expectedActive,observedActive:active,actualRead:actual,rowRead,passed:checks.slice(-3).every(r=>r.passed)});
 }
 return {checks,observations,plan,use,source,scope:'All64 Boolean context assignments for this explicitly authored fixture; no general expression, native-query or authorization refinement claim.'};
}
