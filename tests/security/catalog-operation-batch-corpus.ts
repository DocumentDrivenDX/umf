/** Mixed logical composition controls; supplied duties are not compiler-issued authority. */
import {catalogRuntimeFixture,graphRuntimeFixture} from './catalog-runtime-fixture';
import source from './protection/query-value-modes-source.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogScan,evaluateCandidateCatalogAction} from '../../src/extensions/security/catalog-runtime-candidate';
import {evaluateCandidateCatalogOperationBatch} from '../../src/extensions/security/catalog-operation-batch-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const program=(f:any)=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
const scan=(id='projection',fields=[ref('salary')])=>({id,kind:'scan',selection:{type:ref('Resource'),fields}});
const action=(id='original',name='query-original-salary-predicate')=>({id,kind:'action',request:{action:name,resources:[{type:ref('Resource'),key:[{string:'r1'}]}],targets:[ref('Resource')],fields:[]}});
const fixture=()=>{const f:any=structuredClone(source);f.cut=f.logicalCut;return f;};
export function runCatalogOperationBatchCorpus(){
 const rows:{id:string;expected:unknown;observed:unknown;passed:boolean}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>rows.push({id,expected,observed,passed:JSON.stringify(expected)===JSON.stringify(observed)});
 const run=(f:any,ops:any=[scan(),action()],p:any=program(f))=>evaluateCandidateCatalogOperationBatch(p,f.owner,f.cut,ops);
 const reject=(id:string,f:any,ops:any=[scan(),action()])=>{const before=JSON.stringify({f,ops}),r=run(f,ops);check(id,{status:'refused',complete:false,authority:false,operations:[]},r);check(id+':unchanged',true,before===JSON.stringify({f,ops}));};
 {const f=fixture(),r=run(f);check('masked-read-and-separate-original', {status:'completed',ids:['projection','original'],rows:[[{field:ref('salary'),disposition:'transformed',outputType:ref('salaryMaskLabel'),value:{string:'[private]'}}]],decision:'permit',dispositions:[],authority:false,complete:false},{status:r.status,ids:r.operations.map(o=>o.id),rows:(r.operations[0]?.outcome as any).rows,decision:(r.operations[1]?.outcome as any).rows[0].decision,dispositions:(r.operations[1]?.outcome as any).rows[0].dispositions,authority:r.authority,complete:r.complete});}
 {const f=fixture();f.policy.rules=f.policy.rules.filter((r:any)=>r.id!=='query-original-salary-predicate-permit');const r=run(f);check('completed-is-not-permitted',['completed','deny','[private]'],[r.status,(r.operations[1]?.outcome as any).rows[0].decision,(r.operations[0]?.outcome as any).rows[0][0].value.string]);}
 for(const graph of [false,true]){const f:any=graph?graphRuntimeFixture():catalogRuntimeFixture();f.owner.disclosure={readAction:'read'};const r=run(f,[scan(),action('check-read','read')]);check((graph?'graph':'flat')+':same-cut-mixed',['completed',{integerToken:'100'},'permit'],[r.status,(r.operations[0]?.outcome as any).rows[0][0].value,(r.operations[1]?.outcome as any).rows[0].decision]);}
 for(const [name,ops] of [
  ['late-unknown-action',[scan(),action('late','missing')]],['late-unknown-scan',[action(),{...scan(),selection:{type:ref('missing'),fields:[]}}]],
  ['duplicate-operation-id',[scan(),action('projection')]],['invalid-id',[scan('s/0')]],['extra-authority',[{...scan(),authority:true}]],
  ['unknown-kind',[{id:'other',kind:'native',request:{}}]],['empty',[]],['over-limit',Array.from({length:257},(_,i)=>scan('s'+i,[]))],
  ['read-action-override',[{...scan(),selection:{type:ref('Resource'),fields:[],action:'read'}}]],
  ['action-request-extra',[scan(),{...action(),request:{...action().request,originalAuthorized:true}}]],
 ] as [string,any][] )reject(name,fixture(),ops);
 {const f=fixture();f.cut.expectedGeneration+='stale';reject('stale-cut',f);}
 {const f=fixture();f.cut.coverage.find((c:any)=>c.type.elementId==='Assignment').fields=[];reject('late-action-dependencies-after-field-free-scan',f,[scan('rows',[]),action()]);}
 {const f=fixture();f.cut.facts=f.cut.facts.filter((x:any)=>!['Resource','Ownership'].includes(x.type.elementId));const a=action();a.request.resources=[];const r=run(f,[scan(),a]);check('empty-complete-targets',['completed',[],[]],[r.status,r.operations[0]?.outcome.rows,r.operations[1]?.outcome.rows]);f.cut.coverage.find((c:any)=>c.type.elementId==='Assignment').fields=[];reject('empty-still-needs-original-action-dependencies',f,[scan(),a]);}
 {const f=fixture(),p=program(f);f.cut.maxFacts=f.cut.facts.length+f.cut.graphs.length+1;check('independent-fact-budgets-pass',['rendered','evaluated'],[evaluateCandidateCatalogScan(p,f.owner,f.cut,scan().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('aggregate-action-and-scan-population',f);}
 {const f=fixture(),p=program(f);// Frozen from the reviewed original fixture, not recalibrated against this implementation.
  f.cut.maxSteps=1609;check('independent-work-ledgers-pass',['rendered','evaluated'],[evaluateCandidateCatalogScan(p,f.owner,f.cut,scan().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('shared-mixed-work-budget',f);}
 {const f=fixture();const replace=(x:any):void=>{if(x&&typeof x==='object')for(const key of Object.keys(x)){if(x[key]==='alice')x[key]='a'.repeat(512);else replace(x[key]);}};replace(f.cut);f.cut.maxSteps=1000000;f.cut.maxFacts=10000;const p=program(f);check('independent-literal-ledgers-pass',['rendered','evaluated'],[evaluateCandidateCatalogScan(p,f.owner,f.cut,scan().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('shared-mixed-literal-budget',f,Array.from({length:64},(_,i)=>i%2? action('a'+i):scan('s'+i)));}
 {const f=fixture();f.owner.revision='r'.repeat(800000);f.cut.owner.revision=f.owner.revision;f.cut.maxSteps=1000000;const p=program(f);check('independent-text-ledgers-pass',['rendered','evaluated'],[evaluateCandidateCatalogScan(p,f.owner,f.cut,scan().selection).status,evaluateCandidateCatalogAction(p,f.owner,f.cut,action().request).status]);reject('shared-mixed-text-budget',f);}
 {const f=fixture(),p=program(f),ops=[scan(),action()],r=run(f,ops,p);check('deep-frozen',true,Object.isFrozen(r)&&Object.isFrozen(r.operations)&&r.operations.every(o=>Object.isFrozen(o)&&Object.isFrozen(o.outcome)&&Object.isFrozen(o.outcome.rows)));f.cut.facts.find((x:any)=>x.type.elementId==='Resource').fields.find((x:any)=>x.field.elementId==='salary').value={integerToken:'999'};ops[0]!.id='changed';check('detached-results',['projection','[private]'],[r.operations[0]?.id,(r.operations[0]?.outcome as any).rows[0][0].value.string]);check('forged-handle','refused',run(f,undefined,{}).status);check('copied-handle','refused',run(f,undefined,structuredClone(p)).status);}
 {const f=fixture(),ops:any=[scan(),action()];let calls=0;Object.defineProperty(ops[1],'request',{enumerable:true,get(){calls++;return action().request;}});check('accessor-refuses','refused',run(f,ops).status);check('no-getter-calls',0,calls);}
 {const f=fixture(),r=run(f,[action('second','query-original-token-order'),scan('first',[ref('token')]),action()]);check('ordered-duties-and-live-opaque-original',['second','first','original','opaque-token'],[...r.operations.map(o=>o.id),(r.operations[1]?.outcome as any).rows[0][0].value.string]);}
 return rows;
}
