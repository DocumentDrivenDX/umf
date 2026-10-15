/** Private canonical action/disposition kernel. Host attestations are not native credentials. */
import {copyJson} from '../../model/json';
import {encodeCoreKeyTupleBody,type CoreKeyTupleValue} from '../../model/key-tuple';
import {canonicalSchemaJson,type CoreLiteral} from '../../model/schema-literals';
import {ProtectionLiteralBudget} from './protection/literals';
import {GREGORIAN_DATE_PROFILE,parseGregorianDate} from '../../adapters/gregorian-date';
import {securityAnd,securityOr,securityNot,type SecurityTruth,type SecurityDecision} from './logic';
import {evaluateIssuedProtectionDefinition} from './protection/functions';
import type {SecurityOutput} from './evaluate';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
const fail=(message:string):never=>{throw Error('SECURITY_CATALOG_RUNTIME: '+message);};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const relationId=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.relationshipId]);
function shape(v:any,required:string[],optional:string[]=[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail('Closed fact shape required');}
function list(v:any,max:number):any[]{if(!Array.isArray(v)||v.length>max)fail('Fact list bound');return v;}
function ref(r:any):string{shape(r,['documentId','moduleId','elementId']);if(Object.values(r).some(v=>typeof v!=='string'||!v))fail('Exact Field/Record reference');return id(r);}
function relationship(r:any):string{shape(r,['documentId','moduleId','relationshipId']);if(Object.values(r).some(v=>typeof v!=='string'||!v))fail('Exact relationship reference');return relationId(r);}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateCatalogActionResult {status:'evaluated'|'refused';complete:false;authority:false;rows:readonly {decision:SecurityDecision;dispositions:readonly unknown[]}[]}
export interface CandidateCatalogCollectionResult {status:'rendered'|'refused';complete:false;authority:false;rows:readonly (readonly SecurityOutput[])[];valueProfiles:readonly {field:unknown;profile:string}[]}
/** Atomic logical collection: denied rows are filtered; U/conflict/any rendering failure refuses the whole batch. */
export function evaluateCandidateCatalogCollection(handle:unknown,owner:unknown,cut:unknown,request:unknown):CandidateCatalogCollectionResult {
 try{return run(handle,owner,cut,request,true) as CandidateCatalogCollectionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[],valueProfiles:[]});}
}
/** owner/cut must originate from a trusted host. This function does not authenticate their provenance. */
export function evaluateCandidateCatalogAction(handle:unknown,ownerInput:unknown,cutInput:unknown,requestInput:unknown):CandidateCatalogActionResult{
 try{return run(handle,ownerInput,cutInput,requestInput,false) as CandidateCatalogActionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[]});}
}
function run(handle:unknown,ownerInput:unknown,cutInput:unknown,requestInput:unknown,render:boolean):CandidateCatalogActionResult|CandidateCatalogCollectionResult{
 const program=readCandidateCatalogProgram(handle),packet:any=copyJson({owner:ownerInput,cut:cutInput,request:requestInput}),{owner,cut,request}=packet;
 shape(owner,['version','id','revision','storage'],['disclosure']);shape(cut,['version','trusted','generation','expectedGeneration','policy','ontology','protection','domains','owner','subject','facts','graphs','coverage','graphCoverage','context','valueProfiles','maxFacts','maxSteps']);shape(request,['action','resources','targets','fields']);
 if(owner.version!=='umf.security.logical-owner/0.1'||cut.version!=='umf.security.logical-facts/0.1'||cut.trusted!==true||typeof cut.generation!=='string'||!cut.generation||cut.generation!==cut.expectedGeneration||typeof owner.id!=='string'||!owner.id||typeof owner.revision!=='string'||!owner.revision)fail('Unadmitted logical cut');
 const pin=(actual:any,expected:any,keys:string[])=>{shape(actual,keys);if(keys.some(k=>actual[k]!==expected[k]))fail('Stale source/owner pin');};
 pin(cut.owner,owner,['id','revision']);pin(cut.policy,program.policy,['id','revision']);pin(cut.ontology,program.ontology.ontology,['documentId','revision']);
 if(program.catalog)pin(cut.protection,program.catalog,['id','revision']);else if(cut.protection!==null)fail('Unpinned protection');
 const domains=new Map(program.closure.pins.map((p:any)=>[p.documentId,p.revision]));for(const p of list(cut.domains,256)){shape(p,['documentId','revision']);if(domains.get(p.documentId)!==p.revision)fail('Core pin mismatch');domains.delete(p.documentId);}if(domains.size)fail('Missing core pin');
 if(!Number.isSafeInteger(cut.maxFacts)||cut.maxFacts<1||cut.maxFacts>10000||!Number.isSafeInteger(cut.maxSteps)||cut.maxSteps<1||cut.maxSteps>1000000)fail('Invalid operation limits');
 let steps=0,text=0;const step=(units=1)=>{steps+=units;if(steps>cut.maxSteps)fail('Operation steps exhausted');};
 const scan=[packet];while(scan.length){step();const x=scan.pop();if(typeof x==='string')text+=x.length;else if(x&&typeof x==='object')for(const [key,value] of Object.entries(x)){text+=key.length;scan.push(value);}if(text>4_000_000)fail('Operation text exhausted');}
 list(cut.facts,cut.maxFacts);list(cut.graphs,cut.maxFacts);list(request.resources,cut.maxFacts);if(cut.facts.length+cut.graphs.length+request.resources.length>cut.maxFacts)fail('Aggregate facts exhausted');
 list(cut.coverage,256);list(cut.graphCoverage,256);list(cut.context,256);list(cut.valueProfiles,4096);list(owner.storage,4096);list(request.targets,256);list(request.fields,4096);
 const ontology=program.ontology.ontology,entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e])),documents=new Map<string,any>(program.closure.documents.map((e:any)=>[e.document.id,e.document]));
 const fields=new Map<string,{document:any;field:any}>(),records=new Map<string,any>();
 for(const document of documents.values())for(const module of document.modules)for(const field of module.elements){const key=id({documentId:document.id,moduleId:module.id,elementId:field.id});if(field.kind==='field')fields.set(key,{document,field});else if(field.kind==='record')records.set(key,field);}
 if(Object.hasOwn(owner,'disclosure')){shape(owner.disclosure,['readAction']);const action=owner.disclosure.readAction;if(typeof action!=='string'||!action||!ontology.actionPurposes?.some((p:any)=>p.action===action&&p.purposes.includes('read')))fail('Exact owner read action and source read purpose required');}
 if(render&&(!owner.disclosure||request.action!==owner.disclosure.readAction))fail('Collection requires exact owner read action');
 const memberships=new Map<string,Map<string,any>>();for(const e of entities.values()){step();memberships.set(id(e.type),new Map(e.fields.map((f:any)=>[id(f.ref),f])));}
 const member=(type:any,name:string)=>memberships.get(id(type))?.get(name);
 const field=(r:any)=>fields.get(ref(r))??fail('Missing source Field'),entity=(r:any)=>entities.get(ref(r))??fail('Missing source entity');
 const profiles=new Map<string,string>();for(const p of cut.valueProfiles){shape(p,['field','profile']);const key=ref(p.field),f=field(p.field).field;if(profiles.has(key)||p.profile!==GREGORIAN_DATE_PROFILE||f.scalarType!=='date'||f.cardinality!=='one'||!['required','absent-allowed'].includes(f.nullability)||f.itemType!==undefined||f.references?.length||Object.keys(f.facets??{}).length||Object.hasOwn(f,'allowedValues')||Object.hasOwn(f,'default'))fail('Unsupported value profile');profiles.set(key,p.profile);}
 const budget=new ProtectionLiteralBudget();
 const literal=(r:any,v:any):string=>{step();const selected=field(r),f=selected.field;if(f.cardinality!=='one'||f.itemType!==undefined||f.references?.some((r:any)=>r.role==='record-type'))fail('Unsupported logical literal');
  if(f.scalarType==='date'){
   if(profiles.get(id(r))!==GREGORIAN_DATE_PROFILE)fail('Explicit Gregorian profile required');budget.step();if(v===null){if(f.nullability!=='absent-allowed')fail('Required date null');return 'null';}shape(v,['date']);if(typeof v.date!=='string')fail('Date literal');parseGregorianDate(v.date);return budget.retain('date:'+v.date);
  }
  if(!['boolean','string','integer','decimal','binary'].includes(f.scalarType))fail('Unsupported logical scalar');
  if(v===null){budget.check(selected.document,f,v);return 'null';}return budget.identity(selected.document,f,v as CoreLiteral);
 };
 const keys=new Map<string,any>();for(const e of entities.values()){const record=records.get(id(e.type)),key=record.keys.find((k:any)=>k.id===e.keyId);keys.set(id(e.type),key);}
 const tuple=(type:any,values:any):string=>{step();const e=entity(type),key=keys.get(id(type));list(values,64);if(values.length!==key.fields.length)fail('Key arity');
  for(const [i,k] of key.fields.entries()){const r={documentId:type.documentId,moduleId:k.module,elementId:k.element},f=field(r);budget.check(f.document,f.field,values[i]);}
  const result=encodeCoreKeyTupleBody(documents.get(type.documentId),{module:type.moduleId,element:type.elementId,key:e.keyId},values as CoreKeyTupleValue[],{valid:true,complete:true,diagnostics:[]},(d,f,v)=>budget.check(d,f,v));
  return budget.retain(canonicalSchemaJson([id(type),e.keyId,result.bytesHex]));
 };
 const selectors=new WeakMap<object,string>();const selector=(s:any)=>{shape(s,['type','key']);let key=selectors.get(s);if(!key){key=tuple(s.type,s.key);selectors.set(s,key);}return key;};
 const projections=new WeakMap<object,Map<string,any>>(),absences=new WeakMap<object,Set<string>>();
 const factIdentity=new WeakMap<object,string>(),inventory=new Map<string,any>(),byType=new Map<string,any[]>();
 const factKey=(f:any)=>factIdentity.get(f)??fail('Unvalidated fact');
 const value=(f:any,r:any)=>projections.get(f)?.get(id(r));
 for(const fact of cut.facts){step();shape(fact,['type','key','fields','absent']);const e=entity(fact.type),key=tuple(fact.type,fact.key);if(inventory.has(key))fail('Duplicate normalized Record identity');list(fact.fields,4096);list(fact.absent,4096);const names=new Set<string>(),projection=new Map<string,any>(),absent=new Set<string>();projections.set(fact,projection);absences.set(fact,absent);
  for(const p of fact.fields){step();shape(p,['field','value']);const name=ref(p.field);if(names.has(name)||!member(e.type,name))fail('Invalid projection');names.add(name);literal(p.field,p.value);projection.set(name,p.value);}
  for(const r of fact.absent){step();const name=ref(r);if(names.has(name)||!member(e.type,name)||field(r).field.nullability!=='absent-allowed')fail('Invalid absence');names.add(name);absent.add(name);}
  for(const [i,k] of keys.get(id(fact.type)).fields.entries()){const r={documentId:fact.type.documentId,moduleId:k.module,elementId:k.element},v=value(fact,r);if(v!==undefined&&literal(r,v)!==literal(r,fact.key[i]))fail('Key projection mismatch');}
  factIdentity.set(fact,key);inventory.set(key,fact);const rows=byType.get(id(fact.type))??[];rows.push(fact);byType.set(id(fact.type),rows);
 }
 const subject=inventory.get(selector(cut.subject))??fail('Missing subject fact');if(id(subject.type)!==id(ontology.subject))fail('Wrong subject type');
 const resources=request.resources.map((s:any)=>inventory.get(selector(s))??fail('Missing requested fact'));
 const covered=new Map<string,{complete:boolean;fields:Set<string>}>();for(const c of cut.coverage){shape(c,['type','complete','fields']);const e=entity(c.type),key=id(c.type);list(c.fields,4096);if(covered.has(key)||typeof c.complete!=='boolean')fail('Invalid Record coverage');const set=new Set<string>();for(const r of c.fields){const name=ref(r);if(set.has(name)||!member(e.type,name))fail('Invalid covered Field');set.add(name);}covered.set(key,{complete:c.complete,fields:set});}
 for(const [type,c] of covered)for(const row of byType.get(type)??[])for(const name of c.fields){step();if(!projections.get(row)!.has(name)&&!absences.get(row)!.has(name))fail('Declared projection is missing');}
 const complete=(type:any)=>{if(!covered.get(id(type))?.complete)fail('Missing complete Record coverage');};
 const known=(f:any,r:any)=>value(f,r)!==undefined||absences.get(f)!.has(id(r));
 const admitField=(type:any,r:any,rows:any[])=>{step();complete(type);if(!covered.get(id(type))?.fields.has(id(r)))fail('Missing Field coverage');for(const f of rows){step();if(!known(f,r))fail('Missing Field projection');}};
 // Every actual canonical Field has an explicit owner storage designation.
 const storage=new Map<string,any>();for(const c of owner.storage){shape(c,['type','field','storageEffect'],['storageTransform']);const e=entity(c.type),name=ref(c.field),key=JSON.stringify([id(c.type),name]);if(storage.has(key)||!member(e.type,name))fail('Invalid storage designation');
  const stored=(program.catalog?.transforms??[]).filter((t:any)=>t.custody?.storageEffect==='stored-transformed'&&id(t.outputDomain)===name);
  if(c.storageEffect==='canonical'){if(Object.hasOwn(c,'storageTransform')||stored.length)fail('Canonical downgrade');}
  else if(c.storageEffect==='stored-transformed'){shape(c.storageTransform,['id','version']);const t=stored.find((t:any)=>t.id===c.storageTransform.id&&t.version===c.storageTransform.version);if(!t||!['tokenize','encrypt'].includes(t.kind))fail('Exact stored output transform required');}
  else fail('Unsupported storage effect');storage.set(key,c);
 }
 for(const e of entities.values())for(const f of e.fields)if(!storage.has(JSON.stringify([id(e.type),id(f.ref)])))fail('Incomplete owner storage map');
 const associations=program.ontology.associations,graphTables=new Map<string,{checks:any;rows:any[]}>();
 for(const checks of associations)if(checks.kind==='candidate-graph-relationship-checks/0.1')graphTables.set(relationId(checks.plan.relationship),{checks,rows:[]});
 const graphIdentities=new Set<string>();for(const row of cut.graphs){step();shape(row,['relationship','witness','endpoints']);const rk=relationship(row.relationship),table=graphTables.get(rk)??fail('Undeclared graph relationship'),plan=table.checks.plan;list(row.endpoints,2);
  let witnessFact:any,identity:string;
  if(plan.witness.kind==='record-key'){shape(row.witness,['kind','type','key']);if(row.witness.kind!=='record-key'||ref(row.witness.type)!==id(plan.witness.type))fail('Wrong Record witness');witnessFact=inventory.get(tuple(row.witness.type,row.witness.key))??fail('Missing Record witness');identity=factKey(witnessFact);}
  else{shape(row.witness,['kind','id']);if(row.witness.kind!=='opaque-existential'||typeof row.witness.id!=='string'||!row.witness.id)fail('Opaque witness required');identity=row.witness.id;}
  const unique=JSON.stringify([rk,identity]);if(graphIdentities.has(unique))fail('Duplicate graph witness identity');graphIdentities.add(unique);const endpoints=new Map<string,any>();
  for(const endpoint of row.endpoints){shape(endpoint,['role','key']);const declared=plan.endpoints.find((e:any)=>e.role===endpoint.role);if(!declared||endpoints.has(endpoint.role))fail('Unknown/duplicate graph role');const target=inventory.get(tuple(declared.target,endpoint.key))??fail('Missing endpoint Record');endpoints.set(endpoint.role,target);}
  table.rows.push({source:row,witnessFact,endpoints});
 }
 const graphCover=new Map<string,{complete:boolean;roles:Set<string>;fields:Set<string>}>();for(const c of cut.graphCoverage){shape(c,['relationship','complete','roles','fields']);const key=relationship(c.relationship),table=graphTables.get(key)??fail('Undeclared graph coverage');list(c.roles,2);list(c.fields,4096);if(graphCover.has(key)||typeof c.complete!=='boolean')fail('Invalid graph coverage');const roles=new Set<string>(),attrs=new Set<string>();for(const role of c.roles){if(roles.has(role)||!table.checks.plan.endpoints.some((e:any)=>e.role===role))fail('Invalid covered role');roles.add(role);}for(const r of c.fields){const name=ref(r),w=table.checks.plan.witness;if(attrs.has(name)||w.kind!=='record-key'||!w.attributes.some((a:any)=>id(a)===name))fail('Invalid covered witness Field');attrs.add(name);}graphCover.set(key,{complete:c.complete,roles,fields:attrs});}
 for(const [key,c] of graphCover)for(const row of graphTables.get(key)!.rows){for(const role of c.roles){step();if(!row.endpoints.has(role))fail('Declared graph role projection is missing');}for(const name of c.fields){step();if(!row.witnessFact||(!projections.get(row.witnessFact)!.has(name)&&!absences.get(row.witnessFact)!.has(name)))fail('Declared graph attribute projection is missing');}}
 const context=new Map<string,any>();for(const c of cut.context){shape(c,['field','value']);const key=ref(c.field);if(context.has(key)||!ontology.context.some((r:any)=>id(r)===key))fail('Invalid context');literal(c.field,c.value);context.set(key,c.value);}
 if(typeof request.action!=='string'||!ontology.actions.includes(request.action)||!request.targets.length)fail('Undeclared action/target');const targets=new Set<string>();for(const r of request.targets){const key=ref(r);entity(r);if(targets.has(key))fail('Duplicate target');complete(r);targets.add(key);}if(resources.some((r:any)=>!targets.has(id(r.type))))fail('Resource outside target set');
 const selectedFields=new Set<string>();for(const r of request.fields){const key=ref(r);if(selectedFields.has(key))fail('Duplicate requested Field');selectedFields.add(key);for(const type of request.targets)if(!member(type,key))fail('Field outside selected target');}
 const scopedByType=new Map<string,any[]>();for(const key of targets)scopedByType.set(key,[]);for(const c of program.conditions){step();if(targets.has(id(c.target))&&program.policy.rules[c.ruleIndex].actions.includes(request.action))scopedByType.get(id(c.target))!.push(c);}
 const scoped=(type:any)=>scopedByType.get(id(type))??[];
 const sourceRows=(checks:any)=>checks.kind==='candidate-graph-relationship-checks/0.1'?graphTables.get(relationId(checks.plan.relationship))!.rows:(byType.get(id(checks.plan.type))??[]);
 const termPreflight=(t:any,target:any,vars:Map<number,any>)=>{step();const d=t.term;
  if(t.kind==='entity-term'){
   if(d.kind==='constant')return;if(d.kind==='context-attribute'){if(!context.has(id(d.field)))fail('Missing context dependency');return;}
   const rows=d.context==='subject'?[subject]:resources.filter((r:any)=>id(r.type)===id(target));complete(d.type);if(d.kind==='record-attribute')admitField(d.type,d.field,rows);return;
  }
  if(t.kind!=='witness-term')fail('Unsupported compiled term');const checks=vars.get(t.occurrence)??fail('Lexical occurrence missing'),rows=sourceRows(checks);
  if(checks.kind==='candidate-graph-relationship-checks/0.1'){
   const gc=graphCover.get(relationId(checks.plan.relationship));if(!gc?.complete)fail('Missing complete graph coverage');
   if(d.kind==='entity-identity'){if(!gc!.roles.has(d.role))fail('Missing graph role coverage');complete(d.type);for(const row of rows){step();if(!row.endpoints.has(d.role))fail('Missing graph endpoint projection');}}
   else{if(checks.plan.witness.kind!=='record-key')fail('Opaque witness is not a Record');complete(d.type);if(d.kind==='record-attribute'){if(!gc!.fields.has(id(d.field)))fail('Missing graph witness Field coverage');step(rows.length);admitField(d.type,d.field,rows.map((r:any)=>r.witnessFact));}}
  }else{
   complete(checks.plan.type);if(d.kind==='record-attribute')admitField(d.type,d.field,rows);
   if(d.kind==='entity-identity'){complete(d.type);for(const r of d.fields)admitField(checks.plan.type,r,rows);for(const row of rows){const values=d.fields.map((r:any)=>value(row,r));if(values.some((v:any)=>v===undefined||v===null)||!inventory.has(tuple(d.type,values)))fail('Missing member endpoint Record');}}
  }
 };
 const preflight=(expr:any,target:any,vars:Map<number,any>)=>{step();if(expr.op==='eq'){termPreflight(expr.left,target,vars);termPreflight(expr.right,target,vars);}else if(expr.op==='and'||expr.op==='or')for(const x of expr.args)preflight(x,target,vars);else if(expr.op==='not')preflight(expr.arg,target,vars);else if(expr.op==='exists'){const checks=associations[expr.association];if(checks.kind==='candidate-graph-relationship-checks/0.1'){if(!graphCover.get(relationId(checks.plan.relationship))?.complete)fail('Graph inventory is not complete');}else complete(checks.plan.type);const nested=new Map(vars);nested.set(expr.occurrence,checks);preflight(expr.where,target,nested);}};
 for(const target of request.targets)for(const condition of scoped(target))preflight(condition.condition.expression,target,new Map());
 const readTerm=(t:any,resource:any,vars:Map<number,{checks:any;row:any}>):string|undefined=>{step();const d=t.term;
  if(t.kind==='entity-term'){
   if(d.kind==='constant')return literal(d.field,d.value);if(d.kind==='context-attribute')return context.has(id(d.field))?literal(d.field,context.get(id(d.field))):undefined;
   const row=d.context==='subject'?subject:resource;if(d.kind==='entity-identity')return factKey(row);const v=value(row,d.field);return v===undefined?undefined:literal(d.field,v);
  }
  const bound=vars.get(t.occurrence)??fail('Unbound occurrence');let row=bound.row;if(bound.checks.kind==='candidate-graph-relationship-checks/0.1'){
   if(d.kind==='entity-identity')return factKey(row.endpoints.get(d.role));row=row.witnessFact??fail('Opaque Record access');
  }
  if(d.kind==='record-identity')return factKey(row);if(d.kind==='entity-identity')return tuple(d.type,d.fields.map((r:any)=>value(row,r)));
  const v=value(row,d.field);return v===undefined?undefined:literal(d.field,v);
 };
 const evaluate=(expr:any,resource:any,vars:Map<number,{checks:any;row:any}>):SecurityTruth=>{step();switch(expr.op){case'literal':return expr.value?'T':'F';case'eq':{const a=readTerm(expr.left,resource,vars),b=readTerm(expr.right,resource,vars);if(a===undefined||b===undefined)return 'U';budget.step(a.length+b.length);return a===b?'T':'F';}case'not':return securityNot(evaluate(expr.arg,resource,vars));case'and':return securityAnd(expr.args.map((x:any)=>evaluate(x,resource,vars)));case'or':return securityOr(expr.args.map((x:any)=>evaluate(x,resource,vars)));case'exists':{const checks=associations[expr.association];let found=false,unknown=false;for(const row of sourceRows(checks)){step();const nested=new Map(vars);nested.set(expr.occurrence,{checks,row});const t=evaluate(expr.where,resource,nested);found ||= t==='T';unknown ||= t==='U';}return found?'T':unknown?'U':'F';}default:return fail('Unknown compiled operation');}};
 const rows:any[]=[];for(const resource of resources){const evaluated=scoped(resource.type).map((c:any)=>({rule:program.policy.rules[c.ruleIndex],truth:evaluate(c.condition.expression,resource,new Map())}));let decision:SecurityDecision=evaluated.some((r:any)=>r.truth==='U')?'indeterminate':!evaluated.some((r:any)=>r.rule.effect==='permit'&&r.truth==='T')||evaluated.some((r:any)=>r.rule.effect==='require'&&r.truth!=='T')||evaluated.some((r:any)=>r.rule.effect==='forbid'&&r.truth==='T')?'deny':'permit';const dispositions:any[]=[];
  if(decision==='permit')for(const r of request.fields){step();const ds:any[]=[];for(const x of evaluated){step();if(x.rule.effect==='permit'&&x.truth==='T')for(const d of x.rule.disclosure??[]){step();if(id(d.field)===id(r))ds.push(d.disposition);}}
   if(!ds.length&&member(resource.type,id(r)).protection==='protected'){decision='indeterminate';break;}
   if(ds.some((d:any)=>d.kind==='withheld')){dispositions.push({field:r,disposition:{kind:'withheld'}});continue;}
   const transforms=ds.filter((d:any)=>d.kind==='transformed'),identities=new Set(transforms.map((d:any)=>d.vocabulary==='umf.security.protection'?canonicalSchemaJson([d.vocabulary,d.transform,d.version,id(d.field)]):canonicalSchemaJson([d.transform,d.version,id(d.field),literal(d.field,d.value)])));
   if(identities.size>1){decision='conflict';break;}const d=transforms[0]??{kind:'original'};if(d.kind==='original')admitField(resource.type,r,[resource]);dispositions.push({field:r,disposition:d});
  }
  rows.push({decision,dispositions:decision==='permit'?dispositions:[]});
 }
 if(!render)return freeze({status:'evaluated',complete:false,authority:false,rows});
 if(rows.some(r=>r.decision==='indeterminate'||r.decision==='conflict'))fail('Collection decision is unresolved');
 const selected=rows.map((r,i)=>({row:r,resource:resources[i]})).filter(r=>r.row.decision==='permit');
 const recipeCache=new WeakMap<object,number>();
 const recipe=(d:any)=>{step();const cached=recipeCache.get(d);if(cached!==undefined)return cached;const index=program.catalog?.transforms.findIndex((t:any)=>{step();return t.id===d.transform&&t.version===d.version;})??-1,definition=program.definitions.find((x:any)=>{step();return x.transformIndex===index;});if(index<0||!definition||!program.functionDefinitions)fail('No issued pure definition for selected directive');
  if(definition.valueProfile&&(profiles.get(id(definition.inputDomain))!==definition.valueProfile||profiles.get(id(definition.outputDomain))!==definition.valueProfile))fail('Exact input/output value profiles required');recipeCache.set(d,index);return index;};
 // Empty target populations still require the source-scoped output plan. A
 // literal-true withholding permit suppresses every competing disposition on
 // that Field; conditional withholding cannot prove the same for unknown rows.
 const resourceTypes=new Set<string>();for(const resource of resources){step();resourceTypes.add(id(resource.type));}
 for(const target of request.targets)if(!resourceTypes.has(id(target)))for(const r of request.fields){step();const directives:any[]=[];let alwaysWithheld=false,alwaysTransformed=false,defaultOriginal=false;
  for(const condition of scoped(target)){step();const rule=program.policy.rules[condition.ruleIndex];if(rule.effect!=='permit')continue;let found=false;
   for(const disclosure of rule.disclosure??[]){step();if(id(disclosure.field)!==id(r))continue;found=true;const d=disclosure.disposition;directives.push(d);if(condition.condition.expression.op==='literal'&&condition.condition.expression.value===true){if(d.kind==='withheld')alwaysWithheld=true;if(d.kind==='transformed')alwaysTransformed=true;}}
   if(!found&&member(target,id(r)).protection==='unprotected')defaultOriginal=true;
  }
  if(alwaysWithheld)continue;if(defaultOriginal&&!alwaysTransformed)admitField(target,r,[]);
  for(const d of directives){step();if(d.kind==='original'&&!alwaysTransformed)admitField(target,r,[]);else if(d.kind==='transformed'){if(d.vocabulary==='umf.security.protection'){recipe(d);admitField(target,r,[]);}else literal(d.field,d.value);}}
 }
 // Preflight every effective input before constructing any Cell. Legacy inline
 // constants remain source-independent. Catalog functions require present input.
 for(const {row,resource} of selected)for(const {field:r,disposition:d} of row.dispositions){step();if(d.kind==='withheld')continue;if(d.kind==='original'){admitField(resource.type,r,[resource]);continue;}
  if(d.vocabulary!=='umf.security.protection'){literal(d.field,d.value);continue;}
  recipe(d);admitField(resource.type,r,[resource]);if(value(resource,r)===undefined)fail('Catalog recipe requires present input, not absence');
 }
 const totalCells=selected.reduce((n,x)=>n+x.row.dispositions.length,0);step(totalCells+selected.length);budget.step(totalCells+selected.length);budget.reserveText(128+2+Math.max(0,selected.length-1));for(const x of selected)budget.reserveText(2+Math.max(0,x.row.dispositions.length-1));
 const output:SecurityOutput[][]=[],outputProfiles=new Map<string,{field:any;profile:string}>();
 const retainOutput=(value:any)=>{const pending:any[]=[value];while(pending.length){step();budget.step();const v=pending.pop();if(typeof v==='string'){budget.step(v.length);budget.reserveText(JSON.stringify(v).length);}else if(v&&typeof v==='object'){const entries=Object.entries(v);budget.reserveText(2+Math.max(0,entries.length-1));for(const [key,child] of entries){budget.step(key.length);budget.reserveText(JSON.stringify(key).length+1);pending.push(child);}}else budget.reserveText(JSON.stringify(v).length);}return value;};
 const retainCell=(cell:SecurityOutput)=>{const r=cell.disposition==='transformed'?cell.outputType:cell.field;if((cell.disposition==='original'||cell.disposition==='transformed')&&field(r).field.scalarType==='date'){if(profiles.get(id(r))!==GREGORIAN_DATE_PROFILE)fail('Rendered date requires exact output profile');outputProfiles.set(id(r),{field:r,profile:GREGORIAN_DATE_PROFILE});}return retainOutput(cell);};
 for(const {row,resource} of selected){const cells:SecurityOutput[]=[];for(const {field:r,disposition:d} of row.dispositions){step();let cell:SecurityOutput;
   if(d.kind==='withheld')cell={field:r,disposition:'withheld'};
   else if(d.kind==='original'){const v=value(resource,r);cell=v===undefined?{field:r,disposition:'absent'}:{field:r,disposition:'original',value:v};}
   else if(d.vocabulary!=='umf.security.protection')cell={field:r,disposition:'transformed',outputType:d.field,value:d.value};
   else{const result=evaluateIssuedProtectionDefinition(program.functionDefinitions,recipe(d),value(resource,r),budget);if(result.status!=='transformed')fail('Pure recipe evaluation refused');cell={field:r,disposition:'transformed',outputType:d.field,value:result.value as CoreLiteral};}
   cells.push(retainCell(cell));
  }output.push(cells);
 }
 const valueProfiles=[...outputProfiles.values()];retainOutput(valueProfiles);return freeze({status:'rendered',complete:false,authority:false,rows:output,valueProfiles});
}
