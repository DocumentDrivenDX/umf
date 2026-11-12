// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private canonical action/disposition kernel. Host attestations are not native credentials. */
import {copyJson} from '../../model/json';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../model/key-tuple';
import {canonicalSchemaJson,type CoreLiteral} from '../../model/schema-literals';
import {CandidateSecurityOperationBudget} from './operation-budget-candidate';
import {GREGORIAN_DATE_PROFILE} from '../../adapters/gregorian-date';
import {composeSecurityRules,parseGregorianDate} from '../../index';
import {evaluateCandidateCompactCondition,preflightCandidateCompactCondition,admitCandidateCatalogCut,planCandidateCatalogRequest,admitCandidateCatalogDateProfiles,planCandidateEmptyDisclosures,admitCandidateCatalogInventory,selectCandidateCatalogDisclosures,renderCandidateCatalogCells,checkCandidateDisclosureIdentities,assembleCandidateDisclosureBatch,admitCandidateCatalogScanBatch,composeCandidateCatalogScanBatch} from '#security-candidate-condition';
import type {EvaluatedSecurityRule,SecurityTruth,SecurityDecision} from './logic';
import {evaluateIssuedProtectionDefinition} from './protection/functions';
import {checkProtectionParametersWithinBudget} from './protection/parameters';
import type {SecurityOutput} from './evaluate';
import type {SecurityDisclosureBatchV2} from './protection/disclosure';
import {validateCandidateCatalogStorage} from './catalog-storage-candidate';
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
/** Original compiled scoped rule truth on a supplied complete typed population. No disclosure rendering. */
export interface CandidateCatalogRuleScanResult {status:'evaluated'|'refused';complete:false;authority:false;rows:readonly {resource:unknown;decision:SecurityDecision;rules:readonly {ruleIndex:number;truth:SecurityTruth}[]}[]}
function readRuleScan(handle:unknown,ownerInput:unknown,cut:unknown,selectionInput:unknown,operation?:CandidateSecurityOperationBudget):CandidateCatalogRuleScanResult {
 try{
  const packet:any=copyJson({owner:ownerInput,selection:selectionInput});shape(packet.selection,['type']);
  if(!packet.owner?.disclosure)fail('Original owner read action required');
  return run(handle,packet.owner,cut,{type:packet.selection.type,fields:[]},false,operation,true,true) as CandidateCatalogRuleScanResult;
 }catch{return freeze({status:'refused',complete:false,authority:false,rows:[]});}
}
export function evaluateCandidateCatalogReadRuleScan(handle:unknown,owner:unknown,cut:unknown,selection:unknown):CandidateCatalogRuleScanResult {
 return readRuleScan(handle,owner,cut,selection);
}
/** Private composition leaf. Every trace/condition charge uses the supplied operation ledger. */
export function evaluateCandidateCatalogReadRuleScanWithinOperation(handle:unknown,owner:unknown,cut:unknown,selection:unknown,operation:CandidateSecurityOperationBudget):CandidateCatalogRuleScanResult {
 return readRuleScan(handle,owner,cut,selection,operation);
}
export interface CandidateCatalogDisclosureOccurrence {ruleIndex:number;disclosureIndex:number|null}
export interface CandidateCatalogDisclosureScanResult {
 version:'umf.security.logical-disclosure-selection/0.1-candidate';status:'evaluated'|'refused';complete:false;authority:false;sources:unknown;
 rows:readonly {resource:unknown;decision:SecurityDecision;rules:readonly {ruleIndex:number;truth:SecurityTruth}[];
  dispositions:readonly {field:unknown;disposition:unknown;sourceOccurrences:readonly CandidateCatalogDisclosureOccurrence[];selectedOccurrence:CandidateCatalogDisclosureOccurrence|null}[]}[];
}
function readDisclosureScan(handle:unknown,owner:unknown,cut:unknown,selection:unknown,operation?:CandidateSecurityOperationBudget):CandidateCatalogDisclosureScanResult {
 try{return run(handle,owner,cut,selection,false,operation,true,false,true) as CandidateCatalogDisclosureScanResult;}
 catch{return freeze({version:'umf.security.logical-disclosure-selection/0.1-candidate',status:'refused',complete:false,authority:false,sources:null,rows:[]});}
}
/** Exact canonical fold source positions; no rendered value, native credential or authenticated cut. */
export function evaluateCandidateCatalogReadDisclosureScan(handle:unknown,owner:unknown,cut:unknown,selection:unknown):CandidateCatalogDisclosureScanResult {
 return readDisclosureScan(handle,owner,cut,selection);
}
/** Private composition leaf sharing all input, condition and retained-result work charges. */
export function evaluateCandidateCatalogReadDisclosureScanWithinOperation(handle:unknown,owner:unknown,cut:unknown,selection:unknown,operation:CandidateSecurityOperationBudget):CandidateCatalogDisclosureScanResult {
 return readDisclosureScan(handle,owner,cut,selection,operation);
}
export interface CandidateCatalogDisclosureBatchResult {
 version:'umf.security.logical-disclosure-batch/0.1-candidate';status:'rendered'|'refused';complete:false;authority:false;
 sources:unknown;decisions:CandidateCatalogDisclosureScanResult['rows'];resources:readonly unknown[];batch:SecurityDisclosureBatchV2|null;
}
function readDisclosureBatch(handle:unknown,owner:unknown,cut:unknown,selection:unknown,operation?:CandidateSecurityOperationBudget):CandidateCatalogDisclosureBatchResult {
 try{return run(handle,owner,cut,selection,true,operation,true,false,true,true) as CandidateCatalogDisclosureBatchResult;}
 catch{return freeze({version:'umf.security.logical-disclosure-batch/0.1-candidate',status:'refused',complete:false,authority:false,sources:null,decisions:[],resources:[],batch:null});}
}
/** One original fold and issued pure rendering operation. Supplied-cut computation, not authority. */
export function evaluateCandidateCatalogReadDisclosureBatch(handle:unknown,owner:unknown,cut:unknown,selection:unknown):CandidateCatalogDisclosureBatchResult {
 return readDisclosureBatch(handle,owner,cut,selection);
}
export function evaluateCandidateCatalogReadDisclosureBatchWithinOperation(handle:unknown,owner:unknown,cut:unknown,selection:unknown,operation:CandidateSecurityOperationBudget):CandidateCatalogDisclosureBatchResult {
 return readDisclosureBatch(handle,owner,cut,selection,operation);
}
export interface CandidateCatalogCollectionResult {status:'rendered'|'refused';complete:false;authority:false;rows:readonly (readonly SecurityOutput[])[];valueProfiles:readonly {field:unknown;profile:string}[]}
/** Atomic logical collection: denied rows are filtered; U/conflict/any rendering failure refuses the whole batch. */
export function evaluateCandidateCatalogCollection(handle:unknown,owner:unknown,cut:unknown,request:unknown):CandidateCatalogCollectionResult {
 try{return run(handle,owner,cut,request,true) as CandidateCatalogCollectionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[],valueProfiles:[]});}
}
/** Complete supplied typed population; not a compiler readset or native credential. */
export function evaluateCandidateCatalogScan(handle:unknown,owner:unknown,cut:unknown,selection:unknown):CandidateCatalogCollectionResult {
 try{return run(handle,owner,cut,selection,true,undefined,true) as CandidateCatalogCollectionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[],valueProfiles:[]});}
}
export interface CandidateCatalogScanBatchResult {status:'rendered'|'refused';complete:false;authority:false;scans:readonly {scan:string;rows:CandidateCatalogCollectionResult['rows'];valueProfiles:CandidateCatalogCollectionResult['valueProfiles']}[]}
/** Atomic logical preparation only: supplied occurrence completeness is a host premise. */
export function evaluateCandidateCatalogScanBatch(handle:unknown,ownerInput:unknown,cutInput:unknown,requestsInput:unknown):CandidateCatalogScanBatchResult {
 const refused=()=>freeze({status:'refused',complete:false,authority:false,scans:[]});
 try{
  readCandidateCatalogProgram(handle);
  const packet:any=copyJson({owner:ownerInput,cut:cutInput,requests:requestsInput}),{owner,cut,requests}=packet;
  if(!Array.isArray(requests)||!Number.isSafeInteger(cut.maxFacts))fail('Invalid aggregate scan batch input');
  const ledger=new CandidateSecurityOperationBudget(cut.maxSteps),pending=[packet];
  while(pending.length){ledger.step();const x=pending.pop();if(typeof x==='string')ledger.snapshotText(x.length);else if(x&&typeof x==='object')for(const [key,value] of Object.entries(x)){ledger.snapshotText(key.length);pending.push(value);}}
  list(cut.facts,cut.maxFacts);list(cut.graphs,cut.maxFacts);
  const admission:any=admitCandidateCatalogScanBatch({requests,facts:cut.facts,graphs:cut.graphs,maxFacts:cut.maxFacts});if(admission?.admitted!==true||!Array.isArray(admission.items)||!Number.isSafeInteger(admission.visitWork)||admission.visitWork<0)fail('Native scan batch admission refused');ledger.step(admission.visitWork);
  const scans=[];
  for(const request of admission.items){
   const result=run(handle,owner,cut,{type:request.type,fields:request.fields},true,ledger,true) as CandidateCatalogCollectionResult;
   if(result.status!=='rendered')fail('Whole scan batch refused');
   scans.push({scan:request.scan,rows:result.rows,valueProfiles:result.valueProfiles});
  }
  return freeze(composeCandidateCatalogScanBatch({scans}) as CandidateCatalogScanBatchResult);
 }catch{return refused();}
}
/** owner/cut must originate from a trusted host. This function does not authenticate their provenance. */
export function evaluateCandidateCatalogAction(handle:unknown,ownerInput:unknown,cutInput:unknown,requestInput:unknown):CandidateCatalogActionResult{
 try{return run(handle,ownerInput,cutInput,requestInput,false) as CandidateCatalogActionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[]});}
}
function run(handle:unknown,ownerInput:unknown,cutInput:unknown,requestInput:unknown,render:boolean,operation?:CandidateSecurityOperationBudget,scanPopulation=false,ruleTrace=false,disclosureTrace=false,disclosureBatch=false):CandidateCatalogActionResult|CandidateCatalogCollectionResult|CandidateCatalogRuleScanResult|CandidateCatalogDisclosureScanResult|CandidateCatalogDisclosureBatchResult{
 const program=readCandidateCatalogProgram(handle),packet:any=copyJson({owner:ownerInput,cut:cutInput,request:requestInput}),{owner,cut}=packet;
 if(disclosureBatch&&!program.catalog)fail('Atomic V2 batch requires original protection catalog');
 const policy=program.policy,sourceOntology=program.ontology.ontology;
 const source={
  policy:{id:policy.id,revision:policy.revision},
  ontology:{documentId:sourceOntology.documentId,revision:sourceOntology.revision},
  protection:program.catalog?{id:program.catalog.id,revision:program.catalog.revision}:null,
  domains:program.closure.pins,
 };
 const admitted=admitCandidateCatalogCut({packet,source,scan:scanPopulation,render}) as {
  request:any;maxSteps:number;workUnits:number;textUnits:number;
 };
 const request=admitted.request;
 const ledger=operation??new CandidateSecurityOperationBudget(admitted.maxSteps);
 ledger.constrain(admitted.maxSteps);
 const step=(units=1)=>ledger.step(units);
 step(admitted.workUnits);
 ledger.snapshotText(admitted.textUnits);
 const ontology=program.ontology.ontology,entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e])),documents=new Map<string,any>(program.closure.documents.map((e:any)=>[e.document.id,e.document]));
 const fields=new Map<string,{document:any;field:any}>(),records=new Map<string,any>();
 for(const document of documents.values())for(const module of document.modules)for(const field of module.elements){const key=id({documentId:document.id,moduleId:module.id,elementId:field.id});if(field.kind==='field')fields.set(key,{document,field});else if(field.kind==='record')records.set(key,field);}
 const memberships=new Map<string,Map<string,any>>();for(const e of entities.values()){step();memberships.set(id(e.type),new Map(e.fields.map((f:any)=>[id(f.ref),f])));}
 const member=(type:any,name:string)=>memberships.get(id(type))?.get(name);
 const field=(r:any)=>fields.get(ref(r))??fail('Missing source Field'),entity=(r:any)=>entities.get(ref(r))??fail('Missing source entity');
 const profiles=new Map<string,string>();
 if(cut.valueProfiles.length){
  const declarations=cut.valueProfiles.map((p:any)=>{shape(p,['field','profile']);return {key:ref(p.field),profile:p.profile,field:field(p.field).field};});
  admitCandidateCatalogDateProfiles(declarations);
  for(const declaration of declarations)profiles.set(declaration.key,declaration.profile);
 }
 const budget=ledger.literal;
 if(disclosureBatch&&checkProtectionParametersWithinBudget(program.policy,program.catalog,program.closure,budget).status==='refused')fail('V2 catalog parameter budget refused');
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
  const result=encodeCoreKeyTuple(documents.get(type.documentId),{module:type.moduleId,element:type.elementId,key:e.keyId},values as CoreKeyTupleValue[]);
  return budget.retain(canonicalSchemaJson([id(type),e.keyId,result.bytesHex]));
 };
 const selectors=new WeakMap<object,string>();const selector=(s:any)=>{shape(s,['type','key']);let key=selectors.get(s);if(!key){key=tuple(s.type,s.key);selectors.set(s,key);}return key;};
 const projections=new WeakMap<object,Map<string,any>>(),absences=new WeakMap<object,Set<string>>();
 const factIdentity=new WeakMap<object,string>(),inventory=new Map<string,any>(),byType=new Map<string,any[]>();
 const nativeFacts:any[]=[];
 const factKey=(f:any)=>factIdentity.get(f)??fail('Unvalidated fact');
 const value=(f:any,r:any)=>projections.get(f)?.get(id(r));
 for(const fact of cut.facts){
  step();shape(fact,['type','key','fields','absent']);
  const type=id(entity(fact.type).type),key=tuple(fact.type,fact.key);
  const projection=new Map<string,any>(),absent=new Set<string>(),keyProjections:string[][]=[];
  const projectedNames:string[]=[],absentNames:string[]=[];
  projections.set(fact,projection);absences.set(fact,absent);
  for(const p of list(fact.fields,4096)){
   step();shape(p,['field','value']);
   const name=ref(p.field);
   literal(p.field,p.value);
   projectedNames.push(name);
   projection.set(name,p.value);
  }
  for(const r of list(fact.absent,4096)){
   step();
   const name=ref(r);
   absentNames.push(name);
   absent.add(name);
  }
  for(const [i,k] of keys.get(type).fields.entries()){
   const r={documentId:fact.type.documentId,moduleId:k.module,elementId:k.element},v=value(fact,r);
   if(v!==undefined)keyProjections.push([literal(r,v),literal(r,fact.key[i])]);
  }
  factIdentity.set(fact,key);inventory.set(key,fact);
  const rows=byType.get(type)??[];rows.push(fact);byType.set(type,rows);
  nativeFacts.push({type,identity:key,fields:projectedNames,absent:absentNames,keyProjections});
 }
 const subject=inventory.get(selector(cut.subject))??fail('Missing subject fact');if(id(subject.type)!==id(ontology.subject))fail('Wrong subject type');
 if(scanPopulation){
  const target=entity(request.targets[0]),candidates=byType.get(id(target.type))??[];
  if(cut.facts.length+cut.graphs.length+candidates.length>cut.maxFacts)fail('Aggregate scan facts exhausted');
  step(candidates.length);request.resources=candidates.map((row:any)=>({type:row.type,key:row.key}));
 }
 const resources=request.resources.map((s:any)=>inventory.get(selector(s))??fail('Missing requested fact'));
 const covered=new Map<string,{complete:boolean;fields:Set<string>}>();for(const c of cut.coverage){shape(c,['type','complete','fields']);const key=ref(c.type);list(c.fields,4096);covered.set(key,{complete:c.complete,fields:new Set<string>(c.fields.map(ref))});}
 const complete=(type:any)=>{if(!covered.get(id(type))?.complete)fail('Missing complete Record coverage');};
 const known=(f:any,r:any)=>value(f,r)!==undefined||absences.get(f)!.has(id(r));
 const admitField=(type:any,r:any,rows:any[])=>{step();complete(type);if(!covered.get(id(type))?.fields.has(id(r)))fail('Missing Field coverage');for(const f of rows){step();if(!known(f,r))fail('Missing Field projection');}};
 // Every actual canonical Field has an explicit owner storage designation.
 const storage=validateCandidateCatalogStorage(program,owner,units=>step(units),ledger.remainingWork);
 const associations=program.ontology.associations,graphTables=new Map<string,{checks:any;rows:any[]}>();
 for(const checks of associations)if(checks.kind==='candidate-graph-relationship-checks/0.1')graphTables.set(relationId(checks.plan.relationship),{checks,rows:[]});
 const graphNativeRows=new WeakMap<object,any>();for(const row of cut.graphs){step();shape(row,['relationship','witness','endpoints']);const rk=relationship(row.relationship),table=graphTables.get(rk)??fail('Undeclared graph relationship'),plan=table.checks.plan;list(row.endpoints,2);
  let witnessFact:any,identity:string;
  if(plan.witness.kind==='record-key'){shape(row.witness,['kind','type','key']);if(row.witness.kind!=='record-key'||ref(row.witness.type)!==id(plan.witness.type))fail('Wrong Record witness');witnessFact=inventory.get(tuple(row.witness.type,row.witness.key))??fail('Missing Record witness');identity=factKey(witnessFact);}
  else{shape(row.witness,['kind','id']);if(row.witness.kind!=='opaque-existential'||typeof row.witness.id!=='string'||!row.witness.id)fail('Opaque witness required');identity=row.witness.id;}
  const endpoints=new Map<string,any>();
  for(const endpoint of row.endpoints){shape(endpoint,['role','key']);const declared=plan.endpoints.find((e:any)=>e.role===endpoint.role);if(!declared)fail('Unknown graph role');const target=inventory.get(tuple(declared.target,endpoint.key))??fail('Missing endpoint Record');endpoints.set(endpoint.role,target);}
  const admittedGraph={source:row,witnessFact,endpoints};table.rows.push(admittedGraph);const witnessFields=plan.witness.kind==='record-key'?plan.witness.attributes.filter((a:any)=>witnessFact&&(projections.get(witnessFact)!.has(id(a))||absences.get(witnessFact)!.has(id(a)))).map((a:any)=>id(a)):[];graphNativeRows.set(row,{relationship:rk,identity,witnessFact,endpoints,witnessFields});
 }
 const graphCover=new Map<string,{complete:boolean;roles:Set<string>;fields:Set<string>}>();for(const c of cut.graphCoverage){shape(c,['relationship','complete','roles','fields']);const key=relationship(c.relationship),table=graphTables.get(key)??fail('Undeclared graph coverage');list(c.roles,2);list(c.fields,4096);const roles=new Set<string>();for(const role of c.roles)roles.add(role);const attrs=new Set<string>();for(const r of c.fields)attrs.add(ref(r));graphCover.set(key,{complete:c.complete,roles,fields:attrs});}
 // Native admission validates the original ordered inventory tokens before any condition runs.
 const nativeInventory={
  facts:nativeFacts,
  fieldsByType:[...memberships].map(([type,fs])=>({type,fields:[...fs.keys()],absentAllowed:[...fs.keys()].filter(name=>fields.get(name)?.field.nullability==='absent-allowed')})),
  coverage:cut.coverage.map((c:any)=>({type:id(c.type),complete:c.complete,fields:c.fields.map((r:any)=>id(r))})),
  graphs:cut.graphs.map((row:any)=>{const graph=graphNativeRows.get(row);if(!graph)fail('Unvalidated graph row');return {relationship:graph.relationship,identity:JSON.stringify(graph.identity),roles:row.endpoints.map((e:any)=>e.role),fields:graph.witnessFields};}),
  graphCoverage:cut.graphCoverage.map((c:any)=>({relationship:relationId(c.relationship),complete:c.complete,roles:c.roles,fields:c.fields.map((r:any)=>id(r))})),
  graphPlans:[...graphTables].map(([relationship,table])=>({relationship,roles:table.checks.plan.endpoints.map((e:any)=>e.role),fields:table.checks.plan.witness.kind==='record-key'?table.checks.plan.witness.attributes.map((r:any)=>id(r)):[]})),
 };
 const nativeAdmission:any=admitCandidateCatalogInventory(nativeInventory);
 if(nativeAdmission?.admitted!==true||!Number.isSafeInteger(nativeAdmission.workUnits)||nativeAdmission.workUnits<0)fail('Native fact/graph admission refused');step(nativeAdmission.workUnits);
 const context=new Map<string,any>(),contextTokens:string[]=[];
 for(const c of cut.context){shape(c,['field','value']);const key=ref(c.field);literal(c.field,c.value);contextTokens.push(key);context.set(key,c.value);}
 const targetTokens=request.targets.map((target:any)=>ref(target));
 const scopes=planCandidateCatalogRequest({
  action:request.action,actions:ontology.actions,context:contextTokens,contextFields:ontology.context.map(id),resources:resources.map((resource:any)=>id(resource.type)),
  targets:targetTokens.map((type:string)=>({type,complete:covered.get(type)?.complete===true,fields:[...(memberships.get(type)?.keys()??[])]})),
  fields:request.fields.map(ref),
  conditions:program.conditions.map((condition:any)=>({type:id(condition.target),actions:program.policy.rules[condition.ruleIndex].actions})),
 }) as number[][];
 step(program.conditions.length);
 const scopedByType=new Map<string,any[]>(targetTokens.map((type:string,index:number)=>[type,scopes[index]!.map(position=>program.conditions[position])]));
 const scoped=(type:any)=>scopedByType.get(id(type))??[];
 const sourceRows=(checks:any)=>checks.kind==='candidate-graph-relationship-checks/0.1'?graphTables.get(relationId(checks.plan.relationship))!.rows:(byType.get(id(checks.plan.type))??[]);
 const dependencySources=associations.map((checks:any)=>checks.kind==='candidate-graph-relationship-checks/0.1'
  ?{graph:true,recordWitness:checks.plan.witness.kind==='record-key'}
  :{graph:false,type:checks.plan.type});
 const preflight=(expr:any,target:any)=>preflightCandidateCompactCondition(expr,target,(event:any)=>{
  switch(event.kind){
   case 'step':step();break;
   case 'contextField':if(!context.has(id(event.field)))fail('Missing context dependency');break;
   case 'completeType':complete(event.type);break;
   case 'entityField':admitField(event.type,event.field,event.context==='subject'?[subject]:resources.filter((row:any)=>id(row.type)===id(event.target)));break;
   case 'completeAssociation':{
    const checks=associations[event.association];
    if(checks.kind==='candidate-graph-relationship-checks/0.1'){
     if(!graphCover.get(relationId(checks.plan.relationship))?.complete)fail('Graph inventory is not complete');
    }else complete(checks.plan.type);
    break;
   }
   case 'graphRoleCoverage':{
    const checks=associations[event.association];
    if(!graphCover.get(relationId(checks.plan.relationship))?.roles.has(event.role))fail('Missing graph role coverage');
    break;
   }
   case 'graphRoleProjection':
    for(const row of sourceRows(associations[event.association])){step();if(!row.endpoints.has(event.role))fail('Missing graph endpoint projection');}
    break;
   case 'graphField':{
    const checks=associations[event.association],rows=sourceRows(checks);
    if(!graphCover.get(relationId(checks.plan.relationship))?.fields.has(id(event.field)))fail('Missing graph witness Field coverage');
    step(rows.length);
    admitField(event.type,event.field,rows.map((row:any)=>row.witnessFact));
    break;
   }
   case 'associationField':admitField(event.type,event.field,sourceRows(associations[event.association]));break;
   case 'memberEndpoints':
    for(const row of sourceRows(associations[event.association])){
     const values=event.fields.map((field:any)=>value(row,field));
     if(values.some((value:any)=>value===undefined||value===null)||!inventory.has(tuple(event.type,values)))fail('Missing member endpoint Record');
    }
    break;
   default:return fail('Unknown native preflight callback event');
  }
  return true;
 },dependencySources);
 for(const target of request.targets)for(const condition of scoped(target))preflight(condition.condition.expression,target);
 const readTerm=(t:any,resource:any,vars:Map<number,{checks:any;row:any}>):string|undefined=>{step();const d=t.term;
  if(t.classification==='entity-constant')return literal(d.field,d.value);
  if(t.classification==='entity-context-attribute')return context.has(id(d.field))?literal(d.field,context.get(id(d.field))):undefined;
  if(t.classification==='entity-identity'||t.classification==='entity-record-attribute'){
   const row=d.context==='subject'?subject:resource;if(t.classification==='entity-identity')return factKey(row);const v=value(row,d.field);return v===undefined?undefined:literal(d.field,v);
  }
  const bound=vars.get(t.occurrence)??fail('Unbound occurrence');let row=bound.row;if(bound.checks.kind==='candidate-graph-relationship-checks/0.1'){
   if(t.classification==='witness-entity-identity')return factKey(row.endpoints.get(d.role));row=row.witnessFact??fail('Opaque Record access');
  }
  if(t.classification==='witness-record-identity')return factKey(row);if(t.classification==='witness-entity-identity')return tuple(d.type,d.fields.map((r:any)=>value(row,r)));
  const v=value(row,d.field);return v===undefined?undefined:literal(d.field,v);
 };
 // Dependencies are preflighted above over the complete typed populations,
 // including branches whose truth will not be needed. Only pure truth work may
 // stop early: F absorbs AND, T absorbs OR/exists in strong Kleene logic.
 const evaluate=(expr:any,resourceIndex:number):SecurityTruth=>evaluateCandidateCompactCondition(expr,resourceIndex,(event:any)=>{
  if(event?.kind==='step'){step();return true;}
  if(event?.kind==='rows'){
   const checks=associations[event.association]??fail('Unknown association index');return sourceRows(checks).length;
  }
  if(event?.kind==='terms'){
   const resource=resources[event.resourceIndex]??fail('Unknown resource index'),vars=new Map<number,{checks:any;row:any}>();
   for(const binding of event.bindings){const occurrence=binding.occurrence,checks=associations[binding.association]??fail('Unknown bound association'),row=sourceRows(checks)[binding.rowIndex]??fail('Unknown bound row');vars.set(occurrence,{checks,row});}
   const left=readTerm(event.left,resource,vars),right=readTerm(event.right,resource,vars);if(left!==undefined&&right!==undefined)budget.step(left.length+right.length);return {left:left??null,right:right??null};
  }
  return fail('Unknown native condition callback event');
 });
 const traces:any[]=[];const rows:any[]=[];for(const [resourceIndex,resource] of resources.entries()){const evaluated=scoped(resource.type).map((c:any)=>({ruleIndex:c.ruleIndex,rule:program.policy.rules[c.ruleIndex],truth:evaluate(c.condition.expression,resourceIndex)}));const baseDecision=composeSecurityRules(evaluated.map(({rule,truth}):EvaluatedSecurityRule=>({effect:rule.effect,truth}))).decision;
  let decision=baseDecision as SecurityDecision;
  const dispositions:any[]=[];
  if(decision==='permit'&&request.fields.length){
   const rules=evaluated.map(({ruleIndex,rule,truth}:any)=>({
    ruleIndex,effect:rule.effect,truth,
    disclosures:(rule.disclosure??[]).map((d:any,disclosureIndex:number)=>({
     fieldToken:id(d.field),disclosureIndex,kind:d.disposition.kind,
    })),
   }));
   for(const field of request.fields){
    const fieldToken=id(field);
    const selection=selectCandidateCatalogDisclosures({
     requested:{fieldToken,protected:member(resource.type,fieldToken)?.protection==='protected'},rules,
    }) as {kind:string;occurrences:CandidateCatalogDisclosureOccurrence[];workUnits:number};
    step(selection.workUnits);
    if(selection.kind==='indeterminate'){decision='indeterminate';break;}
    let disposition:any={kind:selection.kind};
    const selectedOccurrence=selection.kind==='transformed'?selection.occurrences[0]:null;
    if(selectedOccurrence){
     const source=(position:CandidateCatalogDisclosureOccurrence)=>program.policy.rules[position.ruleIndex].disclosure[position.disclosureIndex!].disposition;
     const identities=selection.occurrences.map(position=>{
      const d=source(position);
      return d.vocabulary==='umf.security.protection'
       ? canonicalSchemaJson([d.vocabulary,d.transform,d.version,id(d.field)])
       : canonicalSchemaJson([d.transform,d.version,id(d.field),literal(d.field,d.value)]);
     });
     if(!checkCandidateDisclosureIdentities(identities)){decision='conflict';break;}
     disposition=source(selectedOccurrence);
    }
    if(selection.kind==='original')admitField(resource.type,field,[resource]);
    dispositions.push(disclosureTrace
     ?{field,disposition,sourceOccurrences:selection.occurrences,selectedOccurrence}
     :{field,disposition});
   }
  }
  if(ruleTrace||disclosureTrace){
   const trace={resource:{type:resource.type,key:resource.key},decision,rules:evaluated.map((r:any)=>({ruleIndex:r.ruleIndex,truth:r.truth})),...(disclosureTrace?{dispositions:decision==='permit'?dispositions:[]}:{})};
   // Result retention shares the same operation/literal budget as condition evaluation.
   const pending:any[]=[trace];while(pending.length){step();budget.step();const v=pending.pop();if(v&&typeof v==='object')pending.push(...Object.values(v));}
   const encoded=JSON.stringify(trace);step(encoded.length);budget.step(encoded.length);budget.reserveText(encoded.length+1);traces.push(trace);
  }
  rows.push({decision,dispositions:decision==='permit'?dispositions:[]});
 }
 const disclosureSources=()=>({policy:{id:program.policy.id,revision:program.policy.revision},ontology:{documentId:ontology.documentId,revision:ontology.revision},protection:program.catalog?{id:program.catalog.id,revision:program.catalog.revision}:null,domains:program.closure.pins,owner:{id:owner.id,revision:owner.revision},generation:cut.generation,readAction:owner.disclosure.readAction});
 if(disclosureTrace&&!disclosureBatch){
  const sources={policy:{id:program.policy.id,revision:program.policy.revision},ontology:{documentId:ontology.documentId,revision:ontology.revision},protection:program.catalog?{id:program.catalog.id,revision:program.catalog.revision}:null,domains:program.closure.pins,owner:{id:owner.id,revision:owner.revision},generation:cut.generation,readAction:owner.disclosure.readAction};
  const retained=JSON.stringify(sources);step(retained.length);budget.reserveText(retained.length);
  return freeze({version:'umf.security.logical-disclosure-selection/0.1-candidate',status:'evaluated',complete:false,authority:false,sources,rows:traces});
 }
 if(ruleTrace)return freeze({status:'evaluated',complete:false,authority:false,rows:traces});
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
 for(const target of request.targets)if(!resourceTypes.has(id(target))){
  const rules=scoped(target).map(condition=>{
   const rule=program.policy.rules[condition.ruleIndex],expression=condition.condition.expression;
   return {ruleIndex:condition.ruleIndex,effect:rule.effect,always:expression.op==='literal'&&expression.value===true,
    disclosures:(rule.disclosure??[]).map((disclosure:any)=>({fieldToken:id(disclosure.field),kind:disclosure.disposition.kind}))};
  });
  for(const field of request.fields){
   const fieldToken=id(field);
   const plan=planCandidateEmptyDisclosures({fieldToken,protected:member(target,fieldToken).protection==='protected',rules}) as {
    workUnits:number;defaultOriginal:boolean;directives:{mode:string;ruleIndex:number;disclosureIndex:number}[];
   };
   step(plan.workUnits);
   if(plan.defaultOriginal)admitField(target,field,[]);
   for(const {mode,ruleIndex,disclosureIndex} of plan.directives){
    step();
    if(mode==='original'){admitField(target,field,[]);continue;}
    if(mode!=='transformed')continue;
    const disposition=program.policy.rules[ruleIndex].disclosure[disclosureIndex].disposition;
    if(disposition.vocabulary==='umf.security.protection'){recipe(disposition);admitField(target,field,[]);}
    else literal(disposition.field,disposition.value);
   }
  }
 }
 // Preflight every effective input before constructing any Cell. Legacy inline
 // constants remain source-independent. Catalog functions require present input.
 for(const {row,resource} of selected)for(const {field:r,disposition:d} of row.dispositions){step();if(d.kind==='withheld')continue;if(d.kind==='original'){admitField(resource.type,r,[resource]);continue;}
  if(d.vocabulary!=='umf.security.protection'){literal(d.field,d.value);continue;}
  recipe(d);admitField(resource.type,r,[resource]);if(value(resource,r)===undefined)fail('Catalog recipe requires present input, not absence');
 }
 const totalCells=selected.reduce((n,x)=>n+x.row.dispositions.length,0);step(totalCells+selected.length);budget.step(totalCells+selected.length);budget.reserveText(128+2+Math.max(0,selected.length-1));for(const x of selected)budget.reserveText(2+Math.max(0,x.row.dispositions.length-1));
 const outputProfiles=new Map<string,{field:any;profile:string}>();
 const retainOutput=(value:any)=>{const pending:any[]=[value];while(pending.length){step();budget.step();const v=pending.pop();if(typeof v==='string'){budget.step(v.length);budget.reserveText(JSON.stringify(v).length);}else if(v&&typeof v==='object'){const entries=Object.entries(v);budget.reserveText(2+Math.max(0,entries.length-1));for(const [key,child] of entries){budget.step(key.length);budget.reserveText(JSON.stringify(key).length+1);pending.push(child);}}else budget.reserveText(JSON.stringify(v).length);}return value;};
 const retainCell=(cell:SecurityOutput)=>{const r=cell.disposition==='transformed'?cell.outputType:cell.field;if((cell.disposition==='original'||cell.disposition==='transformed')&&field(r).field.scalarType==='date'){if(profiles.get(id(r))!==GREGORIAN_DATE_PROFILE)fail('Rendered date requires exact output profile');outputProfiles.set(id(r),{field:r,profile:GREGORIAN_DATE_PROFILE});}return retainOutput(cell);};
 const renderRows:any[]=[];
 for(const {row,resource} of selected){const cells:any[]=[];for(const {field:r,disposition:d} of row.dispositions){step();
   if(d.kind==='withheld')cells.push({field:r,disposition:'withheld',present:false});
   else if(d.kind==='original'){const v=value(resource,r);cells.push({field:r,disposition:'original',present:v!==undefined,...(v!==undefined?{value:v}:{})});}
   else if(d.vocabulary!=='umf.security.protection'){if(disclosureBatch)fail('Inline transform has no V2 catalog representation');cells.push({field:r,disposition:'transformed',outputType:d.field,present:true,value:d.value});}
   else{const inputValue=value(resource,r),result=evaluateIssuedProtectionDefinition(program.functionDefinitions,recipe(d),inputValue,budget);if(result.status!=='transformed')fail('Pure recipe evaluation refused');cells.push({field:r,disposition:'transformed',outputType:d.field,present:true,value:result.value});}
  }renderRows.push({cells});
 }
 const rendered:any=renderCandidateCatalogCells({rows:renderRows}),output:SecurityOutput[][]=rendered.rows.map((cells:any[])=>cells.map(cell=>retainCell(cell as SecurityOutput)));
 const valueProfiles=[...outputProfiles.values()];retainOutput(valueProfiles);
 if(disclosureBatch){
  // The old fold and renderer above own eligibility and values. This is only
  // the original V2 representation: never a second policy/recipe evaluator.
  if(request.fields.length>256||selected.length>4096||totalCells>16384)fail('V2 batch cardinality bound');
  const wireText=(v:any)=>{step();if(typeof v!=='string'||!v.length||v.length>4096)fail('V2 bounded source string required');};
  const wireRef=(r:any)=>{ref(r);Object.values(r).forEach(wireText);};
  for(const pin of [program.policy,program.catalog]){wireText(pin.id);wireText(pin.revision);}
  for(const pin of program.closure.pins){wireText(pin.documentId);wireText(pin.revision);}
  const columns=request.fields.map((r:any)=>{step();wireRef(r);const own=storage.get(JSON.stringify([id(request.targets[0]),id(r)]))??fail('Missing selected storage declaration');
   if(own.storageTransform){wireText(own.storageTransform.id);wireText(own.storageTransform.version);}
   return {field:r,storageEffect:own.storageEffect,...(own.storageTransform?{storageTransform:own.storageTransform}:{}),...(profiles.has(id(r))?{valueProfile:profiles.get(id(r))}:{})};
  });
  const permitted=traces.filter(t=>t.decision==='permit');if(permitted.length!==output.length)fail('Original row correspondence failed');
  for(const [rowIndex,cells] of output.entries())for(const [columnIndex,cell] of cells.entries()){step();
   if(!('value' in cell))continue;
   const encoded=canonicalSchemaJson(cell.value);step(encoded.length);budget.step(encoded.length);if(encoded.length>4096)fail('V2 canonical literal bound');
   if(cell.disposition==='original')continue;
   const provenance=permitted[rowIndex].dispositions[columnIndex],d=provenance.disposition,occurrence=provenance.selectedOccurrence;
   if(cell.disposition!=='transformed'||d.kind!=='transformed'||d.vocabulary!=='umf.security.protection'||!occurrence||!Number.isSafeInteger(occurrence.ruleIndex)||!Number.isSafeInteger(occurrence.disclosureIndex)||occurrence.ruleIndex<0||occurrence.disclosureIndex<0||id(cell.outputType)!==id(d.field))fail('V2 requires exact original selected catalog transform');
   wireRef(d.field);wireText(d.transform);wireText(d.version);
  }
  const result=assembleCandidateDisclosureBatch({sources:disclosureSources(),decisions:traces,resources:permitted.map(t=>t.resource),policy:{id:program.policy.id,revision:program.policy.revision},catalog:{id:program.catalog.id,revision:program.catalog.revision},domains:program.closure.pins,columns,rendered:output,profiles:cut.valueProfiles});
  retainOutput(result);return freeze(result);
 }
 return freeze({status:'rendered',complete:false,authority:false,rows:output,valueProfiles});
}

/** Internal multi-action composition only. The public entry always creates its own ledger. */
export function evaluateCandidateCatalogActionWithinOperation(handle:unknown,owner:unknown,cut:unknown,request:unknown,operation:CandidateSecurityOperationBudget):CandidateCatalogActionResult {
 try{return run(handle,owner,cut,request,false,operation) as CandidateCatalogActionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[]});}
}

/** Private composition leaf; callers must provide one shared operation ledger. */
export function evaluateCandidateCatalogScanWithinOperation(handle:unknown,owner:unknown,cut:unknown,selection:unknown,operation:CandidateSecurityOperationBudget):CandidateCatalogCollectionResult {
 try{return run(handle,owner,cut,selection,true,operation,true) as CandidateCatalogCollectionResult;}catch{return freeze({status:'refused',complete:false,authority:false,rows:[],valueProfiles:[]});}
}
