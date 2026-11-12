// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private logical transaction guard. Never a native permit or an effects receipt. */
import {copyJson} from '../../model/json';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../model/key-tuple';
import {canonicalSchemaJson,type CoreLiteral} from '../../model/schema-literals';
import {GREGORIAN_DATE_PROFILE} from '../../adapters/gregorian-date';
import {parseGregorianDate} from '../../index';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {evaluateCandidateCatalogActionWithinOperation} from './catalog-runtime-candidate';
import {CandidateSecurityOperationBudget} from './operation-budget-candidate';
import {compareCatalogWrite,foldCatalogWriteDecisions,planCatalogWriteIncidence,admitCatalogWriteProfiles,catalogWriteReadNeeds,resolveCatalogWriteRead,planCatalogWriteActions,validateCatalogWriteDependencies,admitCatalogWriteAssociations,validateCatalogWriteCoverage} from '#security-candidate-condition';
import type {SecurityDecision} from './logic';
const fail=():never=>{throw Error('SECURITY_CATALOG_WRITE_UNRESOLVED');};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const relation=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.relationshipId]);
function shape(v:any,required:string[],optional:string[]=[]){if(!v||typeof v!=='object'||Array.isArray(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail();}
function list(v:any,max:number){if(!Array.isArray(v)||v.length>max)fail();return v;}
function text(v:any){if(typeof v!=='string'||!v||v.length>4096)fail();}
function ref(v:any){shape(v,['documentId','moduleId','elementId']);Object.values(v).forEach(text);return id(v);}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateCatalogWriteResult {decision:SecurityDecision;complete:false;authority:false}
export function evaluateCandidateCatalogWrite(handle:unknown,owner:unknown,profile:unknown,request:unknown):CandidateCatalogWriteResult {
 try{return freeze({decision:run(handle,owner,profile,request),complete:false,authority:false});}catch{return freeze({decision:'indeterminate',complete:false,authority:false});}
}
function run(handle:unknown,ownerInput:unknown,profileInput:unknown,requestInput:unknown):SecurityDecision {
 const program=readCandidateCatalogProgram(handle),packet:any=copyJson({owner:ownerInput,profile:profileInput,request:requestInput}),{owner,profile,request}=packet;
 shape(profile,['version','id','revision','owner','types','associations']);shape(request,['version','profile','before','after','mutations','maxSteps','maxFacts']);
 shape(profile.owner,['id','revision']);shape(request.profile,['id','revision']);
 const envelope={owner:{id:owner.id,revision:owner.revision},profile:{version:profile.version,id:profile.id,revision:profile.revision,owner:profile.owner},request:{version:request.version,profile:request.profile,maxFacts:request.maxFacts,typesCount:profile.types.length,associationsCount:profile.associations.length,mutationsCount:request.mutations.length,beforeFactsCount:request.before.facts.length,afterFactsCount:request.after.facts.length,beforeGraphsCount:request.before.graphs.length,afterGraphsCount:request.after.graphs.length}};
 admitCatalogWriteProfiles({envelope,envelopeOnly:true,actionPurposes:[],profiles:[]});
 const budget=new CandidateSecurityOperationBudget(request.maxSteps),literal=budget.literal,step=(n=1)=>budget.step(n);
 const pending=[packet];while(pending.length){step();const v=pending.pop();if(typeof v==='string')budget.snapshotText(v.length);else if(v&&typeof v==='object')for(const [k,c] of Object.entries(v)){budget.snapshotText(k.length);pending.push(c);}}
 if(!Array.isArray(profile.types)||!Array.isArray(profile.associations)||!Array.isArray(request.mutations))fail();
 for(const cut of [request.before,request.after]){budget.constrain(cut.maxSteps);list(cut.facts,10000);list(cut.graphs,10000);}
 const ontology=program.ontology.ontology,entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e]));
 const documents=new Map<string,any>(program.closure.documents.map((e:any)=>[e.document.id,e.document])),fields=new Map<string,any>(),records=new Map<string,any>();
 for(const document of documents.values())for(const module of document.modules)for(const element of module.elements){step();const key=id({documentId:document.id,moduleId:module.id,elementId:element.id});if(element.kind==='field')fields.set(key,{document,field:element});if(element.kind==='record')records.set(key,element);}
 const purposes=new Map<string,string[]>((ontology.actionPurposes??[]).map((p:any)=>[p.action,p.purposes]));if(purposes.size!==ontology.actions.length)fail();
 const profiles=new Map<string,any>();
 for(const p of profile.types){step();shape(p,['type','createAction','updateAction','deleteAction','fieldActions','policyAction','policyFields','ownershipAction','ownershipFields','readProtection']);const type=ref(p.type),entity=entities.get(type);if(!entity||profiles.has(type))fail();
  const objectActions=[p.createAction,p.updateAction,p.deleteAction];
  for(const action of [...objectActions,p.policyAction,p.ownershipAction])text(action);
  const members=new Map<string,any>(entity.fields.map((f:any)=>[id(f.ref),f.ref])),actions=new Map<string,string>();list(p.fieldActions,4096);if(p.fieldActions.length!==members.size)fail();
  for(const binding of p.fieldActions){step();shape(binding,['field','action']);const name=ref(binding.field);text(binding.action);if(!members.has(name)||actions.has(name))fail();actions.set(name,binding.action);}
  for(const name of ['policyFields','ownershipFields']){list(p[name],4096);const seen=new Set<string>();for(const r of p[name]){step();const token=ref(r);if(!members.has(token)||seen.has(token))fail();seen.add(token);}}
  shape(p.readProtection,['version','readAction','blindWriteActions']);if(p.readProtection.version!=='umf.security.write-read/0.1.0')fail();text(p.readProtection.readAction);list(p.readProtection.blindWriteActions,4096);
  const blind=new Map<string,string>();
  for(const b of p.readProtection.blindWriteActions){step();shape(b,['field','action']);const name=ref(b.field);text(b.action);if(!members.has(name)||blind.has(name))fail();blind.set(name,b.action);}
  profiles.set(type,{source:p,entity,members,actions,blind,policyFields:new Set(p.policyFields.map(id)),ownershipFields:new Set(p.ownershipFields.map(id))});
 }
 const admissionInput={actionPurposes:[...purposes].map(([action,values])=>({action,purposes:values})),profiles:[...profiles].map(([type,p])=>({type,members:[...p.members.keys()],objectActions:[p.source.createAction,p.source.updateAction,p.source.deleteAction],policyAction:p.source.policyAction,ownershipAction:p.source.ownershipAction,readAction:p.source.readProtection.readAction,fieldActions:[...p.actions],blindActions:[...p.blind],policyFields:[...p.policyFields],ownershipFields:[...p.ownershipFields]}))};
 admitCatalogWriteProfiles(admissionInput);
 for(const p of profiles.values()){const s=p.source;for(const action of [s.createAction,s.updateAction,s.deleteAction,s.policyAction,s.ownershipAction,s.readProtection.readAction,...p.actions.values()])step();}for(const p of profiles.values())for(const action of p.blind.values())step();
 // Traverse the original typed terms natively with lexical occurrence scope.
 const dependencyResult=validateCatalogWriteDependencies({conditions:program.conditions,associations:program.ontology.associations,profiles:[...profiles].map(([type,p])=>({type:p.source.type,policyFields:p.source.policyFields}))}) as {dependencyAssociations:readonly number[];workUnits:number};step(dependencyResult.workUnits);const dependencyAssociations=new Set(dependencyResult.dependencyAssociations);
 const associations=program.ontology.associations,bindings=new Map<number,any>();
 for(const binding of profile.associations){step();shape(binding,['source','mode'],['ownerType','anchor']);shape(binding.source,['kind','ref']);if(!['record-members','core-relationship'].includes(binding.source.kind))fail();if(binding.source.kind==='record-members')ref(binding.source.ref);else{shape(binding.source.ref,['documentId','moduleId','relationshipId']);Object.values(binding.source.ref).forEach(text);}
  if(binding.mode==='immutable')shape(binding,['source','mode']);else if(binding.mode==='owned'){shape(binding,['source','mode','ownerType','anchor']);ref(binding.ownerType);if(binding.anchor?.kind==='endpoint')shape(binding.anchor,['kind','role']);else if(binding.anchor?.kind==='witness')shape(binding.anchor,['kind']);else fail();}
 }
 const associationIndexes=admitCatalogWriteAssociations({associations,bindings:profile.associations,profileTypes:[...profiles.values()].map((p:any)=>({type:p.source.type}))}) as number[];associationIndexes.forEach((index,bindingIndex)=>bindings.set(index,profile.associations[bindingIndex]));if(bindings.size!==associations.length)fail();
 const first=request.mutations[0];shape(first,['operation','type','key']);const firstProfile=profiles.get(ref(first.type))??fail();if(!['create','update','delete'].includes(first.operation))fail();const validationAction=first.operation==='create'?firstProfile.source.createAction:first.operation==='delete'?firstProfile.source.deleteAction:firstProfile.source.updateAction;
 // Empty object-action evaluations validate each entire cut without inventing a
 // read dependency that an independently granted blind action could bypass.
 for(const cut of [request.before,request.after]){const result=evaluateCandidateCatalogActionWithinOperation(handle,owner,cut,{action:validationAction,resources:[],targets:[first.type],fields:[]},budget);if(result.status!=='evaluated')fail();}
 const selectedKeys=new Map<string,any>();for(const e of entities.values()){step();selectedKeys.set(id(e.type),records.get(id(e.type)).keys.find((k:any)=>k.id===e.keyId));}
 const keyOf=(type:any,values:any)=>{step();const e=entities.get(ref(type))??fail(),key=selectedKeys.get(id(type));list(values,64);if(values.length!==key.fields.length)fail();
  for(const [i,k] of key.fields.entries()){const f=fields.get(id({documentId:type.documentId,moduleId:k.module,elementId:k.element}));literal.check(f.document,f.field,values[i]);}
  const result=encodeCoreKeyTuple(documents.get(type.documentId),{module:type.moduleId,element:type.elementId,key:e.keyId},values as CoreKeyTupleValue[]);return literal.retain(canonicalSchemaJson([id(type),e.keyId,result.bytesHex]));};
 const scalar=(r:any,value:any,cut:any)=>{step();const f=fields.get(ref(r))??fail();if(f.field.scalarType==='date'){if(!cut.valueProfiles.some((p:any)=>id(p.field)===id(r)&&p.profile===GREGORIAN_DATE_PROFILE))fail();literal.step();if(value===null)return 'null';parseGregorianDate(value.date);return literal.retain('date:'+value.date);}if(value===null){literal.check(f.document,f.field,null);return 'null';}return literal.identity(f.document,f.field,value as CoreLiteral);};
 function state(cut:any){const facts=new Map<string,any>(),types=new Map<string,any[]>(),graphs=new Map<string,any[]>();for(const row of cut.graphs){step();const key=relation(row.relationship),rows=graphs.get(key)??[];rows.push(row);graphs.set(key,rows);}
  const coverageWork=validateCatalogWriteCoverage({entities:[...entities.values()].map((e:any)=>({type:e.type,fields:e.fields.map((f:any)=>f.ref)})),associations,cut:{coverage:cut.coverage,graphCoverage:cut.graphCoverage}}) as number;step(coverageWork);
  for(const fact of cut.facts){step();const key=keyOf(fact.type,fact.key),e=entities.get(id(fact.type)),projection=new Map<string,string>(),values=new Map<string,any>(fact.fields.map((p:any)=>[id(p.field),p.value])),absent=new Set(fact.absent.map(id));step(fact.fields.length+fact.absent.length);for(const f of e.fields){step();const name=id(f.ref);if(values.has(name))projection.set(name,'V'+scalar(f.ref,values.get(name),cut));else if(absent.has(name))projection.set(id(f.ref),'A');else fail();}if(facts.has(key))fail();const row={key,fact,projection,values};facts.set(key,row);const rows=types.get(id(fact.type))??[];rows.push(row);types.set(id(fact.type),rows);}
  return {cut,facts,types,graphs};}
 const before=state(request.before),after=state(request.after),states=[before,after];
 const subjectBefore=before.facts.get(keyOf(request.before.subject.type,request.before.subject.key))??fail(),subjectAfter=after.facts.get(keyOf(request.after.subject.type,request.after.subject.key))??fail();
 const context=(cut:any)=>new Map<string,string>(cut.context.map((p:any)=>[id(p.field),scalar(p.field,p.value,cut)]));
 const mutationInputs=request.mutations.map((m:any)=>{shape(m,['operation','type','key']);const key=keyOf(m.type,m.key),p=profiles.get(id(m.type))??fail();return {key,operation:m.operation,fields:[...p.members.keys()],ownershipFields:[...p.ownershipFields],policyFields:[...p.policyFields]};});
 const diff=compareCatalogWrite({
  subjectBefore:{key:subjectBefore.key,projection:[...subjectBefore.projection],generation:request.before.generation,expectedGeneration:request.before.expectedGeneration},
  subjectAfter:{key:subjectAfter.key,projection:[...subjectAfter.projection],generation:request.after.generation,expectedGeneration:request.after.expectedGeneration},
  contextBefore:[...context(request.before)],contextAfter:[...context(request.after)],
  profilesBefore:request.before.valueProfiles.map((p:any)=>[id(p.field),p.profile]),profilesAfter:request.after.valueProfiles.map((p:any)=>[id(p.field),p.profile]),
  beforeFacts:[...before.facts.values()].map((row:any)=>({key:row.key,projection:[...row.projection]})),
  afterFacts:[...after.facts.values()].map((row:any)=>({key:row.key,projection:[...row.projection]})),
  mutations:mutationInputs,workLimit:budget.remainingWork,literalLimit:literal.remainingWork,
 }) as {mutations:readonly {key:string;operation:'create'|'update'|'delete';changed:readonly string[];ownership:boolean;policy:boolean}[];workUnits:number;literalUnits:number};
 step(diff.workUnits);literal.step(diff.literalUnits);
 const mutations=new Map<string,any>();
 for(const [index,m] of request.mutations.entries()){
  const p=profiles.get(id(m.type))??fail();const result=diff.mutations[index]??fail();if(result.key!==mutationInputs[index]!.key||result.operation!==m.operation)fail();
  mutations.set(result.key,{source:m,key:result.key,p,changed:[...result.changed],ownership:result.ownership,policy:result.policy});
 }
 step([...mutations.values()].filter((m:any)=>m.source.operation!=='update').length*bindings.size);
 type Incidence={signature:string;witness:string|undefined;endpoints:Map<string,string>};
 function incidenceRows(state:any,check:any):Map<string,{count:number;row:Incidence}>{const rows=new Map<string,{count:number;row:Incidence}>(),graph=check.kind==='candidate-graph-relationship-checks/0.1';
  const add=(witness:string|undefined,endpoints:Map<string,string>,projection?:Map<string,string>)=>{step();const signature=literal.retain(canonicalSchemaJson([witness??null,[...endpoints],projection?[...projection]:null])),group=rows.get(signature);if(group)group.count++;else rows.set(signature,{count:1,row:{signature,witness,endpoints}});};
  if(!graph)for(const row of state.types.get(id(check.plan.type))??[]){const endpoints=new Map<string,string>();for(const e of check.plan.endpoints){step();const values=e.fields.map((r:any)=>row.values.get(id(r)));const key=keyOf(e.target,values);if(!state.facts.has(key))fail();endpoints.set(e.role,key);}add(row.key,endpoints,row.projection);}
  else for(const row of state.graphs.get(relation(check.plan.relationship))??[]){step();const endpoints=new Map<string,string>();for(const e of check.plan.endpoints){const values=row.endpoints.find((p:any)=>p.role===e.role)?.key??fail(),key=keyOf(e.target,values);if(!state.facts.has(key))fail();endpoints.set(e.role,key);}if(check.plan.witness.kind==='record-key'){const key=keyOf(row.witness.type,row.witness.key),w=state.facts.get(key)??fail();add(key,endpoints,w.projection);}else add(undefined,endpoints);}
  return rows;}
 const incidenceInput={mutations:[...mutations.values()].map((m:any)=>({key:m.key,type:id(m.source.type),operation:m.source.operation})),beforeFacts:[...before.facts.keys()],afterFacts:[...after.facts.keys()],associations:associations.map((check:any,i:number)=>{const binding=bindings.get(i),rows=(state:any)=>[...incidenceRows(state,check).values()].flatMap((g:any)=>Array.from({length:g.count},()=>{const row=g.row,anchor=binding.mode!=='owned'?undefined:binding.anchor.kind==='witness'?row.witness:row.endpoints.get(binding.anchor.role);return {signature:row.signature,anchor:anchor??null};}));return {before:rows(before),after:rows(after),dependency:dependencyAssociations.has(i),binding:{mode:binding.mode,ownerType:binding.mode==='owned'?id(binding.ownerType):''}};})};
 const obligationPlan=planCatalogWriteIncidence(incidenceInput) as {mutations:readonly {key:string;ownership:boolean;policy:boolean}[];workUnits:number};step(obligationPlan.workUnits);
 for(const obligation of obligationPlan.mutations){const m=mutations.get(obligation.key);if(!m)fail();m.ownership=m.ownership||obligation.ownership;m.policy=m.policy||obligation.policy;}
 const storage=new Map<string,any>();for(const s of owner.storage){step();storage.set(JSON.stringify([id(s.type),id(s.field)]),s);}const transforms=new Map<string,any>();for(const t of program.catalog?.transforms??[]){step();transforms.set(JSON.stringify([t.id,t.version]),t);}
 const decisions:SecurityDecision[]=[];
 const evaluate=(state:any,m:any,action:string,requested:any[]=[])=>{const result=evaluateCandidateCatalogActionWithinOperation(handle,owner,state.cut,{action,resources:[{type:m.source.type,key:m.source.key}],targets:[m.source.type],fields:requested},budget);if(result.status!=='evaluated'||result.rows.length!==1)fail();return result.rows[0]!;};
 const storageActions:any[]=[];for(const m of mutations.values())for(const field of m.changed){const binding=storage.get(JSON.stringify([id(m.source.type),field]));if(binding?.storageEffect==='stored-transformed'){const t=transforms.get(JSON.stringify([binding.storageTransform.id,binding.storageTransform.version]));if(!t)fail();if(!t.custody?.vaultWriteAction)fail();storageActions.push({type:id(m.source.type),field,action:t.custody.vaultWriteAction,purposes:purposes.get(t.custody.vaultWriteAction)??[]});}}
 const actionPlan=planCatalogWriteActions({profiles:[...profiles].map(([type,p])=>({type,createAction:p.source.createAction,updateAction:p.source.updateAction,deleteAction:p.source.deleteAction,ownershipAction:p.source.ownershipAction,policyAction:p.source.policyAction,fieldActions:[...p.actions]})),mutations:[...mutations.values()].map((m:any)=>({key:m.key,type:id(m.source.type),operation:m.source.operation,changed:m.changed,ownership:m.ownership,policy:m.policy})),storageActions}) as readonly {key:string;state:'before'|'after';action:string}[];
 for(const m of mutations.values()){const p=m.p.source,required=m.source.operation==='create'?[after]:m.source.operation==='delete'?[before]:states;
  for(const state of required){for(const request of actionPlan)if(request.key===m.key&&request.state===(state===before?'before':'after'))decisions.push(evaluate(state,m,request.action).decision);const blind=new Map<string,SecurityDecision>();for(const f of m.changed){const action=m.p.blind.get(f);if(action&&!blind.has(action))blind.set(action,evaluate(state,m,action).decision);}
   const blindByField=m.changed.map((f:any)=>m.p.blind.has(f)?blind.get(m.p.blind.get(f))??'indeterminate':'deny'),needs=catalogWriteReadNeeds(blindByField) as number[];if(needs.length){const requested=needs.map((i:number)=>m.p.members.get(m.changed[i]!)),read=evaluate(state,m,p.readProtection.readAction,requested);const resolved=resolveCatalogWriteRead(needs.map((i:number)=>{const f=m.changed[i]!,alternative=blindByField[i];return {blind:alternative,read:read.decision,original:read.dispositions.some((d:any)=>id(d.field)===f&&d.disposition.kind==='original')};})) as SecurityDecision[];decisions.push(...resolved);}
  }
 }
 return foldCatalogWriteDecisions(decisions) as SecurityDecision;
}
