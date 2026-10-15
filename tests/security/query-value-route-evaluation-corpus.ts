import source from './protection/query-value-route-guards.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-routes-candidate';
import {evaluateCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-route-evaluation-candidate';
import {evaluateCandidateCatalogReadRuleScan} from '../../src/extensions/security/catalog-runtime-candidate';
import {catalogRuntimeFixture,graphRuntimeFixture,compileRuntimeFixture} from './catalog-runtime-fixture';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function runQueryValueRouteEvaluationCorpus(){
 const checks:{id:string;expected:unknown;observed:unknown;passed:boolean}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>checks.push({id,expected,observed,passed:JSON.stringify(expected)===JSON.stringify(observed)});
 const use={scan:'s0',path:'filters/0/left',type:ref('Resource'),field:ref('salary'),operator:'predicate',operation:'equal',required:['equality']};
 const f:any=structuredClone(source),program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
 const label=(branch:any)=>branch.projection.kind==='transformed'?(branch.representativeDisposition.transform==='salary-label'?'mask-A':'mask-B'):branch.projection.kind==='unresolved-missing-disclosure'?'missing':branch.projection.kind;
 const observations:any[]=[];
 for(let mask=0;mask<64;mask++){
  const flags=Array.from({length:6},(_,i)=>Boolean(mask&(1<<i))),a=flags[0]||flags[1],b=flags[2],w=flags[4],eligible=flags.some(Boolean);
  f.logicalCut.context=flags.map((value,i)=>({field:ref('guard'+i),value:{boolean:value}}));
  const before=JSON.stringify(f.logicalCut),actual=evaluateCandidateQueryValueRoutes(program,f.owner,f.logicalCut,use),row=actual.rows[0];
  const expected=!eligible?'denied':w?'withheld':a&&b?'conflict':a?'mask-A':b?'mask-B':flags[3]?'original':'missing';
  check('state-'+mask+':evaluated','evaluated',actual.status);
  check('state-'+mask+':read-decision',eligible?'permit':'deny',row?.readDecision);
  check('state-'+mask+':truth',flags.map(x=>x?'T':'F').concat('T'),row?.rules.map((r:any)=>r.truth));
  check('state-'+mask+':selection',expected==='denied'?'read-denied':expected==='conflict'?'disclosure-conflict':'selected',row?.selection);
  const selected=row?.activeBranches.map(i=>label((actual.plan!.branches as any[])[i]));
  check('state-'+mask+':actual-branch',['denied','conflict'].includes(expected)?[]:[expected],selected);
  check('state-'+mask+':stable-input',before,JSON.stringify(f.logicalCut));
  check('state-'+mask+':no-authority',[false,false],[actual.authority,actual.complete]);
  observations.push({mask,expected,actual});
 }
 // Original membership conditions must evaluate through both Record associations and graph witnesses.
 for(const [name,m]of [['flat',catalogRuntimeFixture()],['graph-record',graphRuntimeFixture()],['graph-opaque',graphRuntimeFixture(true)]] as const){
  m.owner.disclosure={readAction:'read'};
  const p=compileRuntimeFixture(m),allowed=evaluateCandidateCatalogReadRuleScan(p,m.owner,m.cut,{type:ref('Resource')});
  check(name+':membership-permit',['evaluated','permit'],[allowed.status,allowed.rows[0]?.decision]);
  const denied=structuredClone(m.cut);denied.facts.find((r:any)=>r.type.elementId==='Assignment').fields.find((v:any)=>v.field.elementId==='active').value={boolean:false};
  if(name==='graph-opaque')denied.graphs[1].endpoints[0].key=[{string:'nobody'}];
  const outcome=evaluateCandidateCatalogReadRuleScan(p,m.owner,denied,{type:ref('Resource')});
  check(name+':membership-denied',name==='graph-opaque'?'refused':'deny',name==='graph-opaque'?outcome.status:outcome.rows[0]?.decision);
 }
 // Known absence makes the actual membership equality unknown; NULL is not forged into absence.
 const unknown=catalogRuntimeFixture();unknown.owner.disclosure={readAction:'read'};
 unknown.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='active').nullability='absent-allowed';
 const assignment=unknown.cut.facts.find((r:any)=>r.type.elementId==='Assignment');assignment.fields=assignment.fields.filter((v:any)=>v.field.elementId!=='active');assignment.absent=[ref('active')];
 const u=evaluateCandidateCatalogReadRuleScan(compileRuntimeFixture(unknown),unknown.owner,unknown.cut,{type:ref('Resource')});
 check('known-absence-three-valued',['evaluated','indeterminate',['T','U']],[u.status,u.rows[0]?.decision,u.rows[0]?.rules.map(r=>r.truth)]);
 const up=evaluateCandidateQueryValueRoutes(compileRuntimeFixture(unknown),unknown.owner,unknown.cut,use);
 check('unknown-does-not-activate',['evaluated','read-indeterminate',[]],[up.status,up.rows[0]?.selection,up.rows[0]?.activeBranches]);
 const opaque=graphRuntimeFixture(true);opaque.owner.disclosure={readAction:'read'};opaque.cut.graphs.pop();
 const od=evaluateCandidateCatalogReadRuleScan(compileRuntimeFixture(opaque),opaque.owner,opaque.cut,{type:ref('Resource')});
 check('complete-opaque-no-membership',['evaluated','deny'],[od.status,od.rows[0]?.decision]);
 const empty=structuredClone(f.logicalCut);empty.facts=empty.facts.filter((r:any)=>!['Resource','Ownership'].includes(r.type.elementId));empty.context=Array.from({length:6},(_,i)=>({field:ref('guard'+i),value:{boolean:false}}));
 const er=evaluateCandidateQueryValueRoutes(program,f.owner,empty,use);check('empty-typed-population',['evaluated',[]],[er.status,er.rows]);
 empty.context.pop();const ec=evaluateCandidateQueryValueRoutes(program,f.owner,empty,use);check('empty-still-needs-context',['refused',null,[]],[ec.status,ec.plan,ec.rows]);
 const forbidden=structuredClone(source) as any;forbidden.policy.rules.push({id:'forbidden',effect:'forbid',actions:['read'],target:[ref('Resource')],condition:{op:'literal',value:true}});forbidden.logicalCut.context=Array.from({length:6},(_,i)=>({field:ref('guard'+i),value:{boolean:i===0}}));
 const fp=compileCandidateCatalogProgram(forbidden.policy,forbidden.catalog,forbidden.closure,forbidden.ontology),fr=evaluateCandidateQueryValueRoutes(fp,forbidden.owner,forbidden.logicalCut,use);
 check('forbid-blocks-route',['evaluated','read-denied',[]],[fr.status,fr.rows[0]?.selection,fr.rows[0]?.activeBranches]);
 f.logicalCut.context=Array.from({length:6},(_,i)=>({field:ref('guard'+i),value:{boolean:i===0}}));
 const refuse=(name:string,change:(x:any)=>void)=>{const x={owner:structuredClone(f.owner),cut:structuredClone(f.logicalCut),use:structuredClone(use)};change(x);const r=evaluateCandidateQueryValueRoutes(program,x.owner,x.cut,x.use);check(name,{status:'refused',plan:null,rows:[]},{status:r.status,plan:r.plan,rows:r.rows});};
 refuse('stale-generation',x=>x.cut.generation='stale');refuse('stale-policy',x=>x.cut.policy.revision='stale');refuse('incomplete-context',x=>x.cut.context.pop());refuse('incomplete-population',x=>x.cut.coverage.find((v:any)=>v.type.elementId==='Resource').complete=false);refuse('caller-truth',x=>x.use.truth='T');refuse('caller-mode',x=>x.use.mode='disclosed');refuse('caller-action',x=>x.use.originalAction='read');refuse('caller-guard',x=>x.use.guard={readDecision:'permit'});refuse('work-bound',x=>x.cut.maxSteps=1);refuse('owner-map-missing',x=>x.owner.storage.pop());
 const invalid={...f.logicalCut,facts:[...f.logicalCut.facts,{bad:true}]};const late=evaluateCandidateQueryValueRoutes(program,f.owner,invalid,use);check('invalid-late-row-atomic',['refused',null,[]],[late.status,late.plan,late.rows]);
 const fake=evaluateCandidateQueryValueRoutes({},f.owner,f.logicalCut,use);check('forged-program','refused',fake.status);
 let hits=0;const accessor={get scan(){hits++;return 's0';}};const bad=evaluateCandidateQueryValueRoutes(program,f.owner,f.logicalCut,accessor);check('accessor-not-invoked',['refused',0],[bad.status,hits]);
 const result=evaluateCandidateQueryValueRoutes(program,f.owner,f.logicalCut,use);check('deep-frozen',[true,true,true,true],[Object.isFrozen(result),Object.isFrozen(result.plan),Object.isFrozen(result.rows),Object.isFrozen(result.rows[0]!.rules)]);
 const saved=JSON.stringify(result);f.logicalCut.facts[0].key[0]={string:'changed'};check('detached-result',saved,JSON.stringify(result));
 // Independently form the specified empty-result frame, fixing the4m oracle, not calibrating refusal against this evaluator.
 const size=catalogRuntimeFixture();size.owner.disclosure={readAction:'read'};size.policy.rules=size.policy.rules.slice(0,1);size.cut.facts=size.cut.facts.filter((r:any)=>!['Resource','Ownership'].includes(r.type.elementId));
 const descriptor=size.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary');descriptor.description='';const longUse={...use,path:'x'.repeat(4096)};
 const basePlan=inspectCandidateQueryValueRoutes(compileRuntimeFixture(size),size.owner,longUse),frame=JSON.stringify({status:'evaluated',complete:false,authority:false,plan:basePlan,rows:[]}).length;
 for(const delta of [-1,0,1]){descriptor.description='x'.repeat(4000000-frame+delta);const h=compileRuntimeFixture(size),p=inspectCandidateQueryValueRoutes(h,size.owner,longUse),r=evaluateCandidateQueryValueRoutes(h,size.owner,size.cut,longUse);
  check('empty-frame-bound-'+delta+':admitted-source','inspected',p.status);
  check('empty-frame-bound-'+delta+':exact-limit',delta>0?['refused',77]:['evaluated',4000000+delta],[r.status,JSON.stringify(r).length]);
 }
 return {checks,observations,scope:'Actual original compiled read-rule population and source-derived branch activation for supplied complete logical cuts; no occurrence issuer, scalar operand, original-action permission or native authority.'};
}
