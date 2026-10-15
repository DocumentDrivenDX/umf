/** Actual field-free route evidence + separate supplied action duties, one logical operation. */
import source from './protection/query-value-modes-source.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogReadRuleScan,evaluateCandidateCatalogAction,evaluateCandidateCatalogScan} from '../../src/extensions/security/catalog-runtime-candidate';
import {evaluateCandidateCatalogOperationBatch} from '../../src/extensions/security/catalog-operation-batch-candidate';
import {catalogRuntimeFixture,graphRuntimeFixture} from './catalog-runtime-fixture';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const fixture=()=>{const f:any=structuredClone(source);f.cut=f.logicalCut;return f;};
const program=(f:any)=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
const trace=(id='route-read')=>({id,kind:'read-rules',selection:{type:ref('Resource')}});
const action=(id='original',name='query-original-salary-predicate')=>({id,kind:'action',request:{action:name,resources:[{type:ref('Resource'),key:[{string:'r1'}]}],targets:[ref('Resource')],fields:[]}});
export function runCatalogRuleDutyBatchCorpus(){
 const checks:{id:string;expected:unknown;observed:unknown;passed:boolean}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>checks.push({id,expected,observed,passed:JSON.stringify(expected)===JSON.stringify(observed)});
 const run=(f:any,ops:any=[trace(),action()],p:any=program(f))=>evaluateCandidateCatalogOperationBatch(p,f.owner,f.cut,ops);
 const reject=(id:string,f:any,ops:any=[trace(),action()])=>{const before=JSON.stringify({f,ops}),r=run(f,ops);check(id,{status:'refused',complete:false,authority:false,operations:[]},r);check(id+':unchanged',before,JSON.stringify({f,ops}));};
 {const f=fixture(),r=run(f),t:any=r.operations[0]?.outcome,a:any=r.operations[1]?.outcome;
  check('original-read-and-action',['completed',['read-rules','action'],'permit',[{ruleIndex:0,truth:'T'},{ruleIndex:1,truth:'T'}],'permit'],[r.status,r.operations.map(x=>x.kind),t.rows[0].decision,t.rows[0].rules,a.rows[0].decision]);
  check('not-native-permission',[false,false],[r.complete,r.authority]);check('only-truth-and-resource',['resource','decision','rules'],Object.keys(t.rows[0]));
 }
 {const f=fixture();f.policy.rules[0].disclosure=f.policy.rules[0].disclosure.filter((d:any)=>d.field.elementId!=='salary');const p=program(f);
  check('missing-public-disclosure-still-refuses','refused',evaluateCandidateCatalogScan(p,f.owner,f.cut,{type:ref('Resource'),fields:[ref('salary')]}).status);
  const r=run(f,undefined,p);check('hidden-original-no-public-render',['completed','permit','permit'],[r.status,(r.operations[0]?.outcome as any).rows[0].decision,(r.operations[1]?.outcome as any).rows[0].decision]);
 }
 {const f=fixture();f.policy.rules=f.policy.rules.filter((r:any)=>r.id!=='query-original-salary-predicate-permit');const r=run(f);check('read-permit-is-not-original-permission',['completed','permit','deny'],[r.status,(r.operations[0]?.outcome as any).rows[0].decision,(r.operations[1]?.outcome as any).rows[0].decision]);}
 for(const graph of [false,true]){const f:any=graph?graphRuntimeFixture():catalogRuntimeFixture();f.owner.disclosure={readAction:'read'};const r=run(f,[trace(),action('read-check','read')]);check((graph?'graph':'flat')+':original-membership',['completed','permit','permit'],[r.status,(r.operations[0]?.outcome as any).rows[0].decision,(r.operations[1]?.outcome as any).rows[0].decision]);f.cut.facts.find((r:any)=>r.type.elementId==='Assignment').fields.find((v:any)=>v.field.elementId==='active').value={boolean:false};const d=run(f,[trace(),action('read-check','read')]);check((graph?'graph':'flat')+':revoked-membership',['completed','deny','deny'],[d.status,(d.operations[0]?.outcome as any).rows[0].decision,(d.operations[1]?.outcome as any).rows[0].decision]);}
 for(const [name,ops] of [
 ['trace-extra-fields',[{...trace(),selection:{type:ref('Resource'),fields:[]}}]],['trace-action-override',[{...trace(),selection:{type:ref('Resource'),action:'update'}}]],['trace-caller-truth',[{...trace(),truth:'T'}]],['late-unknown-action',[trace(),action('late','missing')]],['late-unknown-trace',[action(),{...trace(),selection:{type:ref('missing')}}]],['duplicate-id',[trace(),action('route-read')]],['unknown-source-branch',[{...trace(),selection:{type:ref('Resource'),branch:0}}]],
 ] as [string,any][])reject(name,fixture(),ops);
 {const f=fixture();f.cut.expectedGeneration='stale';reject('stale-cut',f);}
 {const f=fixture();f.cut.facts=f.cut.facts.filter((r:any)=>!['Resource','Ownership'].includes(r.type.elementId));const a=action();a.request.resources=[];const r=run(f,[trace(),a]);check('empty-population',['completed',[],[]],[r.status,r.operations[0]?.outcome.rows,r.operations[1]?.outcome.rows]);f.cut.coverage.find((c:any)=>c.type.elementId==='Assignment').fields=[];reject('empty-original-action-needs-dependencies',f,[trace(),a]);}
 {const f=fixture(),p=program(f);f.cut.maxFacts=f.cut.facts.length+f.cut.graphs.length+1;check('independent-fact-ledgers-pass',['evaluated','evaluated'],[evaluateCandidateCatalogReadRuleScan(p,f.owner,f.cut,trace().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('whole-fact-budget',f);}
 {const f=fixture(),p=program(f);f.cut.maxSteps=1780;check('independent-work-ledgers-pass',['evaluated','evaluated'],[evaluateCandidateCatalogReadRuleScan(p,f.owner,f.cut,trace().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('shared-rule-action-work-budget',f);f.cut.maxSteps=1781;check('frozen-original-work-boundary','completed',run(f,undefined,p).status);}
 {const f=fixture();f.cut.maxSteps=1000000;f.cut.maxFacts=10000;const replace=(v:any):void=>{if(v&&typeof v==='object')for(const k of Object.keys(v)){if(v[k]==='alice')v[k]='a'.repeat(512);else replace(v[k]);}};replace(f.cut);const p=program(f);check('independent-literal-ledgers-pass',['evaluated','evaluated'],[evaluateCandidateCatalogReadRuleScan(p,f.owner,f.cut,trace().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('shared-rule-action-literal-budget',f,Array.from({length:64},(_,i)=>i%2?trace('t'+i):action('a'+i)));}
 {const f=fixture();f.owner.revision='r'.repeat(800000);f.cut.owner.revision=f.owner.revision;f.cut.maxSteps=1000000;const p=program(f);check('independent-text-ledgers-pass',['evaluated','evaluated'],[evaluateCandidateCatalogReadRuleScan(p,f.owner,f.cut,trace().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('shared-rule-action-text-budget',f);}
 {const f=fixture(),p=program(f),ops=[trace(),action()],r=run(f,ops,p);check('frozen-traces',[true,true,true],[Object.isFrozen(r),Object.isFrozen(r.operations),(r.operations[0]?.outcome as any).rows.every((v:any)=>Object.isFrozen(v)&&Object.isFrozen(v.rules))]);const before=JSON.stringify(r);f.cut.facts[0].key[0]={string:'changed'};ops[0]!.id='changed';check('detached-output',before,JSON.stringify(r));check('forged-program','refused',run(f,undefined,{}).status);check('copied-program','refused',run(f,undefined,structuredClone(p)).status);}
 {const f=fixture(),ops:any=[trace(),action()];let hits=0;Object.defineProperty(ops[1],'request',{enumerable:true,get(){hits++;return action().request;}});check('accessor-refusal',['refused',0],[run(f,ops).status,hits]);}
 return checks;
}
