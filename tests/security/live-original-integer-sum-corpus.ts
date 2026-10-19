// SPDX-License-Identifier: MIT OR Apache-2.0
/** Supplied-cut source semantics only; no SUM compiler, native permission or release. */
import source from './protection/live-original-integer-sum-source.json';
import oldSource from './protection/query-value-modes-source.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-routes-candidate';
import {evaluateCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-route-evaluation-candidate';
import {evaluateCandidateCatalogOperationBatch} from '../../src/extensions/security/catalog-operation-batch-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function runLiveOriginalIntegerSumCorpus(){
 const before=JSON.stringify({source,oldSource}),checks:{id:string;expected:unknown;observed:unknown}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>checks.push({id,expected,observed});
 const compile=(s:any)=>compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology);
 const s:any=structuredClone(source),program=compile(s),use=s.sumProfile.route,resource={type:ref('Resource'),key:[{string:'r1'}]};
 const operations=(resources:any[]=[resource])=>[
  {id:'rules',kind:'read-rules',selection:{type:ref('Resource')}},
  {id:'cells',kind:'scan',selection:{type:ref('Resource'),fields:[ref('salary')]}},
  {id:'sum-action',kind:'action',request:{action:s.sumProfile.action,resources,targets:[ref('Resource')],fields:[]}}
 ];
 const evaluate=(fixture:any,resources:any[]=[resource])=>evaluateCandidateCatalogOperationBatch(compile(fixture),fixture.owner,fixture.logicalCut,operations(resources)) as any;
 const plan:any=inspectCandidateQueryValueRoutes(program,s.owner,use),route:any=evaluateCandidateQueryValueRoutes(program,s.owner,s.logicalCut,use),batch=evaluate(s);
 check('distinct-source-revisions',true,['policy','ontology','catalog','owner'].every(k=>s[k].revision!==(oldSource as any)[k].revision));
 const salary=s.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary');
 check('original-required-signed64-domain',['integer','required',{bits:64,signed:true}],[salary.scalarType,salary.nullability,salary.facets.integerWidth]);
 check('exact-original-action-purpose',['original-authorized'],s.ontology.actionPurposes.find((a:any)=>a.action===s.sumProfile.action).purposes);
 check('necessary-nullity-not-additive-property',['nullity'],plan.use.required);
 check('source-route-inspected','inspected',plan.status);
 check('original-authorized-live-branch',[['requires-original-action','live-field','salary']],plan.branches.map((b:any)=>[b.status,b.queryValue.origin,b.queryValue.field.elementId]));
 check('mask-lacks-nullity-preservation',['nullity'],plan.branches[0].constraints.find((c:any)=>c.source==='read-catalog').properties.missing);
 check('active-route-selects',[['permit','selected',[0]]],route.rows.map((r:any)=>[r.readDecision,r.selection,r.activeBranches]));
 check('active-batch-completed','completed',batch.status);
 check('active-read-permits',['permit'],batch.operations[0].outcome.rows.map((r:any)=>r.decision));
 check('ordinary-mask-remains-string',[[{field:ref('salary'),disposition:'transformed',outputType:ref('salaryMaskLabel'),value:{string:'[private]'}}]],batch.operations[1].outcome.rows);
 check('independent-original-action-permits',['permit'],batch.operations[2].outcome.rows.map((r:any)=>r.decision));
 check('unmodified-live-integer-token',{integerToken:'100'},s.logicalCut.facts.find((f:any)=>f.type.elementId==='Resource').fields.find((f:any)=>f.field.elementId==='salary').value);
 check('no-native-authority',true,[plan,route,batch,...batch.operations.map((o:any)=>o.outcome)].every(v=>v.authority===false&&v.complete===false));
 const inactive:any=structuredClone(s);inactive.logicalCut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='active').value={boolean:false};const denied=evaluate(inactive),deniedRoute:any=evaluateCandidateQueryValueRoutes(compile(inactive),inactive.owner,inactive.logicalCut,use);
 check('inactive-read-and-original-action-deny',[['deny'],['deny'],[]],[denied.operations[0].outcome.rows.map((r:any)=>r.decision),denied.operations[2].outcome.rows.map((r:any)=>r.decision),denied.operations[1].outcome.rows]);
 check('inactive-route-has-no-active-branch',[['deny','read-denied',[]]],deniedRoute.rows.map((r:any)=>[r.readDecision,r.selection,r.activeBranches]));
 const missingGrant:any=structuredClone(s);missingGrant.policy.rules=missingGrant.policy.rules.filter((r:any)=>r.id!==s.sumProfile.action+'-permit');const noGrant=evaluate(missingGrant);
 check('missing-separate-permit-keeps-read-mask',[['permit'],[[{field:ref('salary'),disposition:'transformed',outputType:ref('salaryMaskLabel'),value:{string:'[private]'}}]],['deny']],[noGrant.operations[0].outcome.rows.map((r:any)=>r.decision),noGrant.operations[1].outcome.rows,noGrant.operations[2].outcome.rows.map((r:any)=>r.decision)]);
 const missingCoverage:any=structuredClone(s);missingCoverage.logicalCut.coverage.find((r:any)=>r.type.elementId==='Assignment').fields=[];
 check('empty-action-still-validates-dependency-coverage','refused',evaluate(missingCoverage,[]).status);
 const absent:any=structuredClone(s),fact=absent.logicalCut.facts.find((r:any)=>r.type.elementId==='Resource');fact.fields=fact.fields.filter((f:any)=>f.field.elementId!=='salary');fact.absent.push(ref('salary'));
 check('required-live-absence-refuses','refused',evaluate(absent).status);
 const oldPlan:any=inspectCandidateQueryValueRoutes(compile(oldSource),(oldSource as any).owner,use);
 check('old-source-stays-prohibited',['inspected',['prohibited']],[oldPlan.status,oldPlan.branches.map((b:any)=>b.status)]);
 check('named-original-sources-unchanged',before,JSON.stringify({source,oldSource}));
 return {checks,scope:'Original source and supplied-cut computation only; no compiler SUM capability, native permission or guarded release'};
}
