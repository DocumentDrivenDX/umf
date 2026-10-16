/** Private operator-free read alternatives. No selected branch, permission or native admission. */
import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {validateCandidateCatalogStorage} from './catalog-storage-candidate';
import {ProtectionLiteralBudget} from './protection/literals';
import {checkProtectionParametersWithinBudget} from './protection/parameters';
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const fail=():never=>{throw Error('SECURITY_READ_PROJECTION_REFUSED');};
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function ref(v:any):void{shape(v,['documentId','moduleId','elementId']);if(Object.values(v).some(x=>typeof x!=='string'||!x.length||x.length>4096))fail();}
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateReadProjectionInspection {status:'inspected'|'refused';complete:false;authority:false;selection:Json;sources:Json;domains:readonly Json[];alternatives:readonly Json[];composition:Json;diagnostics:readonly string[]}
/** The original program owns read meaning. Selection has no scan, path, operator or action. */
export function inspectCandidateReadProjection(handle:unknown,ownerInput:unknown,selectionInput:unknown):CandidateReadProjectionInspection{
 let selection:Json=null;const refused=()=>freeze<CandidateReadProjectionInspection>({status:'refused',complete:false,authority:false,selection:null,sources:null,domains:[],alternatives:[],composition:null,diagnostics:['Original read projection inspection refused; no partial alternatives retained']});
 try{
  const program=readCandidateCatalogProgram(handle),packet:any=copyJson({owner:ownerInput,selection:selectionInput}),{owner}=packet;selection=packet.selection;
  const budget=new ProtectionLiteralBudget(),pending=[packet];let text=0,retained=0;
  while(pending.length){budget.step();const x=pending.pop();if(typeof x==='string')text+=x.length;else if(x&&typeof x==='object')for(const [key,v]of Object.entries(x)){text+=key.length;pending.push(v);}if(text>4_000_000)fail();}
  shape(selection,['type','field']);const s:any=selection;ref(s.type);ref(s.field);
  const storage=validateCandidateCatalogStorage(program,owner,()=>budget.step());if(!owner.disclosure)fail();
  const entity=program.ontology.ontology.entities.find((e:any)=>id(e.type)===id(s.type)),member=entity?.fields.find((f:any)=>id(f.ref)===id(s.field));if(!member)fail();
  const own=storage.get(JSON.stringify([id(s.type),id(s.field)]));if(!own)fail();
  const parameters=program.catalog?checkProtectionParametersWithinBudget(program.policy,program.catalog,program.closure,budget):null;if(parameters?.status==='refused')fail();
  const retain=(v:any)=>{budget.step();retained+=JSON.stringify(v).length+2;if(retained>4_000_000)fail();return v;};
  const domains:Json[]=[],domainKeys=new Set<string>(),fields=new Map<string,any>();
  for(const entry of program.closure.documents)for(const module of entry.document.modules)for(const element of module.elements){budget.step();if(element.kind==='field')fields.set(id({documentId:entry.document.id,moduleId:module.id,elementId:element.id}),{document:entry.document,element});}
  const domain=(field:any)=>{const key=id(field),value=fields.get(key);if(!value)fail();if(!domainKeys.has(key)){domainKeys.add(key);domains.push(retain({field,identity:{documentId:value.document.id,revision:program.closure.pins.find((p:any)=>p.documentId===value.document.id).revision,module:field.moduleId,element:field.elementId},element:value.element}));}return field;};
  domain(s.field);
  const alternatives:Json[]=[],conditions:Json[]=[],bindings=new Map<string,any>();
  for(const binding of program.bindings){budget.step();if(id(binding.target)===id(s.type))bindings.set(binding.ruleId,binding.context);}
  for(const [ruleIndex,rule]of program.policy.rules.entries()){
   budget.step();if(!rule.actions.includes(owner.disclosure.readAction)||!rule.target.some((t:any)=>id(t)===id(s.type)))continue;
   conditions.push(retain({ruleIndex,ruleId:rule.id,effect:rule.effect,condition:rule.condition,...(bindings.has(rule.id)?{contextBindings:bindings.get(rule.id)}:{})}));if(rule.effect!=='permit')continue;
   const selected=rule.disclosure?.findIndex((d:any)=>{budget.step();return id(d.field)===id(s.field);})??-1;
   const disposition=selected<0?null:rule.disclosure[selected].disposition;
   const projection=disposition===null?(member.protection==='unprotected'?{kind:'original',field:s.field}:{kind:'unresolved-missing-disclosure'}):disposition.kind==='transformed'?{kind:'transformed',field:domain(disposition.field)}:disposition.kind==='original'?{kind:'original',field:s.field}:{kind:'withheld'};
   if(alternatives.length>=256)fail();alternatives.push(retain({ruleIndex,ruleId:rule.id,disclosureIndex:selected<0?null:selected,disposition,projection}));
  }
  const result={status:'inspected',complete:false,authority:false,selection,sources:retain({policy:{id:program.policy.id,revision:program.policy.revision},ontology:{documentId:program.ontology.ontology.documentId,revision:program.ontology.ontology.revision},catalog:program.catalog?{id:program.catalog.id,revision:program.catalog.revision}:null,owner:{id:owner.id,revision:owner.revision},readAction:owner.disclosure.readAction,storageEffect:own.storageEffect}),domains,alternatives,composition:retain({selection:'requires-actual-policy-and-disclosure-fold',readConditions:conditions,withholdingDominates:true,distinctActiveTransforms:'conflict',originalIsFallback:true,protectedMissingActiveDisposition:'indeterminate',absenceIsNotScalarNull:true,branchActivationUnverified:true,additionalRequirements:['actual-compiler-projection-and-descriptor-correspondence','row-read-eligibility','actual-disclosure-fold','native-current-authority-and-guarded-release']}),diagnostics:['Conditional read alternatives only; no active rule, uniform scalar domain, resource presence, selected disposition, query use or native authority established']} as CandidateReadProjectionInspection;
  if(JSON.stringify(result).length>4_000_000)fail();return freeze(result);
 }catch{return refused();}
}
