/** Private logical transaction guard. Never a native permit or an effects receipt. */
import {copyJson} from '../../model/json';
import {encodeCoreKeyTupleBody,type CoreKeyTupleValue} from '../../model/key-tuple';
import {canonicalSchemaJson,type CoreLiteral} from '../../model/schema-literals';
import {parseGregorianDate,GREGORIAN_DATE_PROFILE} from '../../adapters/gregorian-date';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {evaluateCandidateCatalogActionWithinOperation} from './catalog-runtime-candidate';
import {CandidateSecurityOperationBudget} from './operation-budget-candidate';
import type {SecurityDecision} from './logic';
const fail=():never=>{throw Error('SECURITY_CATALOG_WRITE_UNRESOLVED');};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const relation=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.relationshipId]);
const sourceId=(s:any)=>JSON.stringify([s.kind,s.kind==='record-members'?id(s.ref):relation(s.ref)]);
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
 if(profile.version!=='umf.security.catalog-write/0.1'||request.version!=='umf.security.catalog-transaction/0.1')fail();text(profile.id);text(profile.revision);shape(profile.owner,['id','revision']);shape(request.profile,['id','revision']);
 if(profile.owner.id!==owner.id||profile.owner.revision!==owner.revision||request.profile.id!==profile.id||request.profile.revision!==profile.revision)fail();
 if(!Number.isSafeInteger(request.maxFacts)||request.maxFacts<1||request.maxFacts>10000)fail();
 const budget=new CandidateSecurityOperationBudget(request.maxSteps),literal=budget.literal,step=(n=1)=>budget.step(n);
 const pending=[packet];while(pending.length){step();const v=pending.pop();if(typeof v==='string')budget.snapshotText(v.length);else if(v&&typeof v==='object')for(const [k,c] of Object.entries(v)){budget.snapshotText(k.length);pending.push(c);}}
 list(profile.types,256);list(profile.associations,256);list(request.mutations,256);if(!request.mutations.length)fail();
 for(const cut of [request.before,request.after]){budget.constrain(cut.maxSteps);list(cut.facts,10000);list(cut.graphs,10000);}
 if(request.before.facts.length+request.after.facts.length+request.before.graphs.length+request.after.graphs.length+request.mutations.length>request.maxFacts)fail();
 const ontology=program.ontology.ontology,entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e]));
 const documents=new Map<string,any>(program.closure.documents.map((e:any)=>[e.document.id,e.document])),fields=new Map<string,any>(),records=new Map<string,any>();
 for(const document of documents.values())for(const module of document.modules)for(const element of module.elements){step();const key=id({documentId:document.id,moduleId:module.id,elementId:element.id});if(element.kind==='field')fields.set(key,{document,field:element});if(element.kind==='record')records.set(key,element);}
 const purposes=new Map<string,string[]>((ontology.actionPurposes??[]).map((p:any)=>[p.action,p.purposes]));if(purposes.size!==ontology.actions.length)fail();
 const ordinary=(action:any,role?:string)=>{text(action);const p=purposes.get(action);if(!p||!p.length||p.some(k=>!['read','field','original-authorized'].includes(k))||role&&!p.includes(role))fail();};
 const profiles=new Map<string,any>();
 for(const p of profile.types){step();shape(p,['type','createAction','updateAction','deleteAction','fieldActions','policyAction','policyFields','ownershipAction','ownershipFields','readProtection']);const type=ref(p.type),entity=entities.get(type);if(!entity||profiles.has(type))fail();
  const objectActions=[p.createAction,p.updateAction,p.deleteAction];if(new Set(objectActions).size!==3||objectActions.includes(p.policyAction)||objectActions.includes(p.ownershipAction)||p.policyAction===p.ownershipAction)fail();
  for(const action of [...objectActions,p.policyAction,p.ownershipAction])ordinary(action);
  const members=new Map<string,any>(entity.fields.map((f:any)=>[id(f.ref),f.ref])),actions=new Map<string,string>();list(p.fieldActions,4096);if(p.fieldActions.length!==members.size)fail();
  for(const binding of p.fieldActions){step();shape(binding,['field','action']);const name=ref(binding.field);ordinary(binding.action,'field');if(!members.has(name)||actions.has(name)||[...objectActions,p.policyAction,p.ownershipAction].includes(binding.action))fail();actions.set(name,binding.action);}
  if(new Set(actions.values()).size>64)fail();
  for(const name of ['policyFields','ownershipFields']){list(p[name],4096);const seen=new Set<string>();for(const r of p[name]){step();const token=ref(r);if(!members.has(token)||seen.has(token))fail();seen.add(token);}}
  shape(p.readProtection,['version','readAction','blindWriteActions']);if(p.readProtection.version!=='umf.security.write-read/0.1.0')fail();ordinary(p.readProtection.readAction,'read');list(p.readProtection.blindWriteActions,4096);
  const blind=new Map<string,string>(),normal=new Set([p.readProtection.readAction,...objectActions,...actions.values(),p.policyAction,p.ownershipAction]);
  for(const b of p.readProtection.blindWriteActions){step();shape(b,['field','action']);const name=ref(b.field),kind=purposes.get(b.action);if(!members.has(name)||blind.has(name)||normal.has(b.action)||!kind||kind.length!==1||kind[0]!=='field')fail();blind.set(name,b.action);}
  profiles.set(type,{source:p,entity,members,actions,blind,policyFields:new Set(p.policyFields.map(id)),ownershipFields:new Set(p.ownershipFields.map(id))});
 }
 const ordinaryIds=new Set<string>();for(const p of profiles.values()){const s=p.source;for(const action of [s.createAction,s.updateAction,s.deleteAction,s.policyAction,s.ownershipAction,s.readProtection.readAction,...p.actions.values()]){step();ordinaryIds.add(action);}}for(const p of profiles.values())for(const action of p.blind.values()){step();if(ordinaryIds.has(action))fail();}
 // Profile dependency closure uses original typed terms and lexical occurrences.
 const dependencyFields=new Map<string,Set<string>>(),dependencyAssociations=new Set<number>();
 const addField=(type:any,r:any)=>{if(!type||!r)return;const key=id(type),set=dependencyFields.get(key)??new Set<string>();set.add(id(r));dependencyFields.set(key,set);};
 const addKey=(type:any,key:any)=>{for(const r of key.fields)addField(type,{documentId:type.documentId,moduleId:r.module,elementId:r.element});};
 function deps(expr:any,vars:Map<number,any>){step();if(expr.op==='eq')for(const t of [expr.left,expr.right]){step();const d=t.term;if(t.kind==='entity-term'){if(d.kind==='record-attribute')addField(d.type,d.field);else if(d.kind==='entity-identity')addKey(d.type,d.key);}
   else if(t.kind==='witness-term'){const check=vars.get(t.occurrence)??fail();if(d.kind==='record-attribute')addField(d.type,d.field);else if(d.kind==='record-identity'||d.kind==='entity-identity'){addKey(d.type,d.key);if(d.kind==='entity-identity'&&check.kind==='candidate-record-association-checks/0.1')for(const r of d.fields)addField(check.plan.type,r);}}}
  else if(expr.op==='and'||expr.op==='or')for(const x of expr.args)deps(x,vars);else if(expr.op==='not')deps(expr.arg,vars);else if(expr.op==='exists'){dependencyAssociations.add(expr.association);const next=new Map(vars);next.set(expr.occurrence,program.ontology.associations[expr.association]);deps(expr.where,next);}}
 for(const c of program.conditions)deps(c.condition.expression,new Map());
 for(const [key,p] of profiles)for(const field of dependencyFields.get(key)??[])if(!p.policyFields.has(field))fail();
 const associations=program.ontology.associations,bindings=new Map<number,any>(),sourceIndexes=new Map<string,number>();
 associations.forEach((check:any,i:number)=>sourceIndexes.set(sourceId(check.kind==='candidate-graph-relationship-checks/0.1'?{kind:'core-relationship',ref:check.plan.relationship}:{kind:'record-members',ref:check.plan.type}),i));
 for(const binding of profile.associations){step();shape(binding,['source','mode'],['ownerType','anchor']);shape(binding.source,['kind','ref']);if(!['record-members','core-relationship'].includes(binding.source.kind))fail();if(binding.source.kind==='record-members')ref(binding.source.ref);else{shape(binding.source.ref,['documentId','moduleId','relationshipId']);Object.values(binding.source.ref).forEach(text);}
  const i=sourceIndexes.get(sourceId(binding.source));if(i===undefined||bindings.has(i))fail();const check=associations[i!],graph=check.kind==='candidate-graph-relationship-checks/0.1';
  if(binding.mode==='immutable'){shape(binding,['source','mode']);}
  else if(binding.mode==='owned'){shape(binding,['source','mode','ownerType','anchor']);if(!profiles.has(ref(binding.ownerType)))fail();if(binding.anchor.kind==='endpoint'){shape(binding.anchor,['kind','role']);const endpoint=check.plan.endpoints.find((e:any)=>e.role===binding.anchor.role);if(!endpoint||id(endpoint.target)!==id(binding.ownerType))fail();}
   else if(binding.anchor.kind==='witness'){shape(binding.anchor,['kind']);const type=graph?(check.plan.witness.kind==='record-key'?check.plan.witness.type:null):check.plan.type;if(!type||id(type)!==id(binding.ownerType))fail();}else fail();}
  else fail();bindings.set(i!,binding);
 }
 if(bindings.size!==associations.length)fail();
 const first=request.mutations[0];shape(first,['operation','type','key']);const firstProfile=profiles.get(ref(first.type))??fail();if(!['create','update','delete'].includes(first.operation))fail();const validationAction=first.operation==='create'?firstProfile.source.createAction:first.operation==='delete'?firstProfile.source.deleteAction:firstProfile.source.updateAction;
 // Empty object-action evaluations validate each entire cut without inventing a
 // read dependency that an independently granted blind action could bypass.
 for(const cut of [request.before,request.after]){const result=evaluateCandidateCatalogActionWithinOperation(handle,owner,cut,{action:validationAction,resources:[],targets:[first.type],fields:[]},budget);if(result.status!=='evaluated')fail();}
 const selectedKeys=new Map<string,any>();for(const e of entities.values()){step();selectedKeys.set(id(e.type),records.get(id(e.type)).keys.find((k:any)=>k.id===e.keyId));}
 const keyOf=(type:any,values:any)=>{step();const e=entities.get(ref(type))??fail(),key=selectedKeys.get(id(type));list(values,64);if(values.length!==key.fields.length)fail();
  for(const [i,k] of key.fields.entries()){const f=fields.get(id({documentId:type.documentId,moduleId:k.module,elementId:k.element}));literal.check(f.document,f.field,values[i]);}
  const result=encodeCoreKeyTupleBody(documents.get(type.documentId),{module:type.moduleId,element:type.elementId,key:e.keyId},values as CoreKeyTupleValue[],{valid:true,complete:true,diagnostics:[]},(d,f,v)=>literal.check(d,f,v));return literal.retain(canonicalSchemaJson([id(type),e.keyId,result.bytesHex]));};
 const scalar=(r:any,value:any,cut:any)=>{step();const f=fields.get(ref(r))??fail();if(f.field.scalarType==='date'){if(!cut.valueProfiles.some((p:any)=>id(p.field)===id(r)&&p.profile===GREGORIAN_DATE_PROFILE))fail();literal.step();if(value===null)return 'null';parseGregorianDate(value.date);return literal.retain('date:'+value.date);}if(value===null){literal.check(f.document,f.field,null);return 'null';}return literal.identity(f.document,f.field,value as CoreLiteral);};
 function state(cut:any){const facts=new Map<string,any>(),types=new Map<string,any[]>(),graphs=new Map<string,any[]>();for(const row of cut.graphs){step();const key=relation(row.relationship),rows=graphs.get(key)??[];rows.push(row);graphs.set(key,rows);}
  for(const c of cut.coverage){const entity=entities.get(id(c.type)),names=new Set(c.fields.map(id));step(c.fields.length);if(!entity||c.complete!==true||names.size!==entity.fields.length||entity.fields.some((f:any)=>!names.has(id(f.ref))))fail();}if(cut.coverage.length!==entities.size)fail();
  for(const fact of cut.facts){step();const key=keyOf(fact.type,fact.key),e=entities.get(id(fact.type)),projection=new Map<string,string>(),values=new Map<string,any>(fact.fields.map((p:any)=>[id(p.field),p.value])),absent=new Set(fact.absent.map(id));step(fact.fields.length+fact.absent.length);for(const f of e.fields){step();const name=id(f.ref);if(values.has(name))projection.set(name,'V'+scalar(f.ref,values.get(name),cut));else if(absent.has(name))projection.set(id(f.ref),'A');else fail();}if(facts.has(key))fail();const row={key,fact,projection,values};facts.set(key,row);const rows=types.get(id(fact.type))??[];rows.push(row);types.set(id(fact.type),rows);}
  for(const check of associations)if(check.kind==='candidate-graph-relationship-checks/0.1'){const c=cut.graphCoverage.find((c:any)=>relation(c.relationship)===relation(check.plan.relationship)),roles=check.plan.endpoints.map((e:any)=>e.role),attributes=check.plan.witness.kind==='record-key'?check.plan.witness.attributes:[];if(!c)fail();const roleSet=new Set(c.roles),fieldSet=new Set(c.fields.map(id));step(c.roles.length+c.fields.length);if(c.complete!==true||roleSet.size!==roles.length||roles.some((r:any)=>!roleSet.has(r))||fieldSet.size!==attributes.length||attributes.some((r:any)=>!fieldSet.has(id(r))))fail();}
  return {cut,facts,types,graphs};}
 const before=state(request.before),after=state(request.after),states=[before,after];
 const equalProjection=(a:Map<string,string>,b:Map<string,string>)=>{if(a.size!==b.size)return false;for(const [key,value] of a){step();const other=b.get(key);literal.step(value.length+(other?.length??0));if(value!==other)return false;}return true;};
 const subjectBefore=before.facts.get(keyOf(request.before.subject.type,request.before.subject.key))??fail(),subjectAfter=after.facts.get(keyOf(request.after.subject.type,request.after.subject.key))??fail();
 if(subjectBefore.key!==subjectAfter.key||!equalProjection(subjectBefore.projection,subjectAfter.projection)||request.before.generation!==request.after.generation||request.before.expectedGeneration!==request.after.expectedGeneration)fail();
 const context=(cut:any)=>new Map<string,string>(cut.context.map((p:any)=>[id(p.field),scalar(p.field,p.value,cut)]));if(!equalProjection(context(request.before),context(request.after)))fail();
 const profilesOf=(cut:any)=>cut.valueProfiles.map((p:any)=>[id(p.field),p.profile]).sort((a:any,b:any)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);if(canonicalSchemaJson(profilesOf(request.before))!==canonicalSchemaJson(profilesOf(request.after)))fail();
 const mutations=new Map<string,any>();
 for(const m of request.mutations){step();shape(m,['operation','type','key']);if(!['create','update','delete'].includes(m.operation))fail();const key=keyOf(m.type,m.key),p=profiles.get(id(m.type))??fail(),old=before.facts.get(key),next=after.facts.get(key);if(mutations.has(key)||(m.operation==='create'?!!old||!next:m.operation==='delete'?!old||!!next:!old||!next))fail();
  const changed=[...p.members.keys()].filter((field:any)=>{step();if(m.operation!=='update')return true;const a=old.projection.get(field),b=next.projection.get(field);literal.step(a.length+b.length);return a!==b;});mutations.set(key,{source:m,key,p,changed,ownership:changed.some((f:any)=>p.ownershipFields.has(f)),policy:changed.some((f:any)=>p.policyFields.has(f))});}
 // Preserve the existing conservative create/delete owner contract even
 // when a relevant declared ownership inventory happens to be empty.
 for(const m of mutations.values())if(m.source.operation!=='update')for(const [i,binding] of bindings){step();if(binding.mode==='owned'&&id(binding.ownerType)===id(m.source.type)){m.ownership=true;if(dependencyAssociations.has(i))m.policy=true;}}
 for(const key of new Set([...before.facts.keys(),...after.facts.keys()])){step();const a=before.facts.get(key),b=after.facts.get(key);if((!a||!b||!equalProjection(a.projection,b.projection))&&!mutations.has(key))fail();}
 type Incidence={signature:string;witness:string|undefined;endpoints:Map<string,string>};
 function incidenceRows(state:any,check:any):Map<string,{count:number;row:Incidence}>{const rows=new Map<string,{count:number;row:Incidence}>(),graph=check.kind==='candidate-graph-relationship-checks/0.1';
  const add=(witness:string|undefined,endpoints:Map<string,string>,projection?:Map<string,string>)=>{step();const signature=literal.retain(canonicalSchemaJson([witness??null,[...endpoints],projection?[...projection]:null])),group=rows.get(signature);if(group)group.count++;else rows.set(signature,{count:1,row:{signature,witness,endpoints}});};
  if(!graph)for(const row of state.types.get(id(check.plan.type))??[]){const endpoints=new Map<string,string>();for(const e of check.plan.endpoints){step();const values=e.fields.map((r:any)=>row.values.get(id(r)));const key=keyOf(e.target,values);if(!state.facts.has(key))fail();endpoints.set(e.role,key);}add(row.key,endpoints,row.projection);}
  else for(const row of state.graphs.get(relation(check.plan.relationship))??[]){step();const endpoints=new Map<string,string>();for(const e of check.plan.endpoints){const values=row.endpoints.find((p:any)=>p.role===e.role)?.key??fail(),key=keyOf(e.target,values);if(!state.facts.has(key))fail();endpoints.set(e.role,key);}if(check.plan.witness.kind==='record-key'){const key=keyOf(row.witness.type,row.witness.key),w=state.facts.get(key)??fail();add(key,endpoints,w.projection);}else add(undefined,endpoints);}
  return rows;}
 for(const [i,check] of associations.entries()){const a=incidenceRows(before,check),b=incidenceRows(after,check),binding=bindings.get(i);for(const signature of new Set([...a.keys(),...b.keys()])){step();const old=a.get(signature),next=b.get(signature),removed=(old?.count??0)-(next?.count??0),added=-removed;if(!removed)continue;if(binding.mode!=='owned')fail();
   for(const [delta,row,state] of [[removed,old?.row,before],[added,next?.row,after]] as const){if(delta<=0)continue;step(delta);const anchor=binding.anchor.kind==='witness'?row!.witness:row!.endpoints.get(binding.anchor.role),m=anchor?mutations.get(anchor):undefined;if(!m||id(m.source.type)!==id(binding.ownerType)||!state.facts.has(anchor!))fail();m.ownership=true;if(dependencyAssociations.has(i))m.policy=true;}
  }}
 const storage=new Map<string,any>();for(const s of owner.storage){step();storage.set(JSON.stringify([id(s.type),id(s.field)]),s);}const transforms=new Map<string,any>();for(const t of program.catalog?.transforms??[]){step();transforms.set(JSON.stringify([t.id,t.version]),t);}
 const decisions:SecurityDecision[]=[];
 const evaluate=(state:any,m:any,action:string,requested:any[]=[])=>{const result=evaluateCandidateCatalogActionWithinOperation(handle,owner,state.cut,{action,resources:[{type:m.source.type,key:m.source.key}],targets:[m.source.type],fields:requested},budget);if(result.status!=='evaluated'||result.rows.length!==1)fail();return result.rows[0]!;};
 for(const m of mutations.values()){const p=m.p.source,required=m.source.operation==='create'?[after]:m.source.operation==='delete'?[before]:states,objectAction=m.source.operation==='create'?p.createAction:m.source.operation==='delete'?p.deleteAction:p.updateAction;
  const actions=new Set<string>([objectAction,...m.changed.map((f:any)=>m.p.actions.get(f)),...(m.ownership?[p.ownershipAction]:[]),...(m.policy?[p.policyAction]:[])]);
  for(const field of m.changed){const binding=storage.get(JSON.stringify([id(m.source.type),field]));if(binding?.storageEffect==='stored-transformed'){const t=transforms.get(JSON.stringify([binding.storageTransform.id,binding.storageTransform.version]));if(!t)fail();if(!t.custody?.vaultWriteAction)fail();const kind=purposes.get(t.custody.vaultWriteAction);if(!kind||kind.length!==1||kind[0]!=='vault-write')fail();actions.add(t.custody.vaultWriteAction);}}
  for(const state of required){for(const action of actions)decisions.push(evaluate(state,m,action).decision);const blind=new Map<string,SecurityDecision>();for(const f of m.changed){const action=m.p.blind.get(f);if(action&&!blind.has(action))blind.set(action,evaluate(state,m,action).decision);}
   const needs=m.changed.filter((f:any)=>blind.get(m.p.blind.get(f))!=='permit');if(needs.length){const read=evaluate(state,m,p.readProtection.readAction,needs.map((f:any)=>m.p.members.get(f)));for(const f of needs){const alternative=blind.get(m.p.blind.get(f));if(read.decision==='permit'&&read.dispositions.some((d:any)=>id(d.field)===f&&d.disposition.kind==='original'))decisions.push('permit');else decisions.push(read.decision==='indeterminate'||read.decision==='conflict'||alternative==='indeterminate'||alternative==='conflict'?'indeterminate':'deny');}}
  }
 }
 return decisions.some(d=>d==='indeterminate'||d==='conflict')?'indeterminate':decisions.every(d=>d==='permit')?'permit':'deny';
}
