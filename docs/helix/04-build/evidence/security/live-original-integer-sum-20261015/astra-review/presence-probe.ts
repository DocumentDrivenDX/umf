import source from '/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/protection/live-original-integer-sum-source.json';
import {compileCandidateCatalogProgram} from '/Users/erik/.codex/worktrees/security-main-integration/umf/src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogOperationBatch} from '/Users/erik/.codex/worktrees/security-main-integration/umf/src/extensions/security/catalog-operation-batch-candidate';
import {evaluateCandidateQueryValueRoutes} from '/Users/erik/.codex/worktrees/security-main-integration/umf/src/extensions/security/query-value-route-evaluation-candidate';
const s:any=structuredClone(source),ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const fact=s.logicalCut.facts.find((r:any)=>r.type.elementId==='Resource');fact.fields=fact.fields.filter((f:any)=>f.field.elementId!=='salary');fact.absent.push(ref('salary'));
const p=compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology),ops=[{id:'rules',kind:'read-rules',selection:{type:ref('Resource')}},{id:'sum-action',kind:'action',request:{action:s.sumProfile.action,resources:[{type:ref('Resource'),key:[{string:'r1'}]}],targets:[ref('Resource')],fields:[]}}];
const batch:any=evaluateCandidateCatalogOperationBatch(p,s.owner,s.logicalCut,ops),route:any=evaluateCandidateQueryValueRoutes(p,s.owner,s.logicalCut,s.sumProfile.route);console.log(JSON.stringify({batch,route},null,2));
