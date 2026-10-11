import {copyJson} from '../../model/json';
import {canonicalSchemaJson} from '../../model/schema-literals';
import {UmfError,type Document,type Json,type Diagnostic,pointer} from '../../model/types';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {checkSchemaProperties} from '../../validation/schema-properties';
import {admitAction,actionsPackage,checkActionsStructure} from './structure';
import {analyzeAction} from './analysis';
import type {Action,ActionIdentity,ActionInspection,ActionExecutorProfile,ActionAssessment,InspectedAction} from './types';
export * from './types';
export {actionsPackage} from './structure';
const copy=<T>(value:T):T=>copyJson(value) as unknown as T;
const fail=(code:string,message:string,path=''):never=>{throw new UmfError(code,message,path);};
/** Extends the caller's registry without discarding any installed callback. */
export function registerActions(registry:Registry):Registry {
 return registry.register(actionsPackage,(payload,context)=>{
  const diagnostics:Diagnostic[]=[];
  if(context.document.umf!=='0.8.0')return [{code:'ACTION_STRUCTURE',path:context.path,message:'Actions require exact core 0.8.0',severity:'error'}];
  const data=payload as unknown as {actions:Action[]},ids=new Set<string>(),names=new Set<string>();
  for(const key of Object.keys(data))if(key!=='actions')diagnostics.push({code:'ACTION_UNCHECKED',path:context.path+'/'+pointer(key),message:'Unknown action attachment meaning',severity:'warning'});
  data.actions.forEach((action,i)=>{
   const at=context.path+'/actions/'+i;
   for(const [member,seen] of [['id',ids],['name',names]] as const){if(seen.has(action[member]))diagnostics.push({code:'ACTION_IDENTITY',path:at+'/'+member,message:'Duplicate local action '+member,severity:'error'});seen.add(action[member]);}
   diagnostics.push(...analyzeAction(context.document,action,at,context.document.vocabularies['umf.ddd']?.version==='0.1.0'&&!!registry.get('umf.ddd','0.1.0')?.semantics).diagnostics);
  });return diagnostics;
 });
}
function admit(sourceInput:Document,registry:Registry):Document {
 const source=copy(sourceInput);
 if(source.umf!=='0.8.0')fail('ACTION_STRUCTURE','Actions require exact core 0.8.0');
 if(!registry.get('umf.actions','0.1.0')?.semantics)fail('ACTION_STRUCTURE','Explicit action semantic registration is required');
 if(!checkSchemaProperties(source))fail('ACTION_STRUCTURE',JSON.stringify(checkSchemaProperties.errors));
 const declared=source.vocabularies['umf.actions'];
 if(declared&&declared.version!=='0.1.0')fail('ACTION_STRUCTURE','Unsupported action namespace version');
 if(source.extensions&&Object.hasOwn(source.extensions,'umf.actions'))fail('ACTION_STRUCTURE','Action attachment must be module-scoped','/extensions/umf.actions');
 source.modules.forEach((module,mi)=>{
  module.elements.forEach((e,ei)=>{if(Object.hasOwn(e.extensions,'umf.actions'))fail('ACTION_STRUCTURE','Action attachment must be module-scoped',`/modules/${mi}/elements/${ei}/extensions/umf.actions`);});
  const payload=module.extensions?.['umf.actions'];if(payload!==undefined){
   if(!declared)fail('ACTION_STRUCTURE','Action vocabulary must be explicitly declared');
   if(!checkActionsStructure(payload))fail(checkActionsStructure.errors?.some(e=>['maxItems','maxLength','maximum'].includes(e.keyword))?'LIMIT':'ACTION_STRUCTURE',JSON.stringify(checkActionsStructure.errors),`/modules/${mi}/extensions/umf.actions`);
   for(const action of (payload as unknown as {actions:Action[]}).actions)admitAction(action);
  }
 });return source;
}
function valid(source:Document,registry:Registry):void {
 const result=inspectActions(source,registry).validation;if(!result.valid)fail('ACTION_STRUCTURE',JSON.stringify(result.diagnostics));
}
export function inspectActions(sourceInput:Document,registry:Registry):ActionInspection {
 const source=admit(sourceInput,registry),validation=validateDocument(source,registry),actions:InspectedAction[]=[];
 source.modules.forEach((module,mi)=>{
  const payload=module.extensions?.['umf.actions'] as unknown as {actions:Action[]}|undefined;
  payload?.actions.forEach((action,i)=>{const path=`/modules/${mi}/extensions/umf.actions/actions/${i}`,analysis=analyzeAction(source,action,path,source.vocabularies['umf.ddd']?.version==='0.1.0'&&!!registry.get('umf.ddd','0.1.0')?.semantics);
   for(const diagnostic of analysis.diagnostics)if(!validation.diagnostics.some(d=>d.code===diagnostic.code&&d.path===diagnostic.path&&d.severity===diagnostic.severity))validation.diagnostics.push(diagnostic);
   const modelPaths=analysis.obligations.filter(o=>o.kind==='model').map(o=>o.path);
   for(const warning of validation.diagnostics.filter(d=>d.severity==='warning'&&!d.code.startsWith('ACTION_')))if(modelPaths.some(p=>warning.path===p||warning.path.startsWith(p+'/'))){const existing=analysis.obligations.find(o=>o.id===warning.path);if(existing){existing.kind='unknown';existing.status='unchecked';}else analysis.obligations.push({id:warning.path,path:warning.path,kind:'unknown',status:'unchecked'});}
   const vocabularies=new Set(['umf.actions']);
   for(const p of modelPaths){const parts=p.split('/');const element=parts[3]==='elements'?source.modules[Number(parts[2])]?.elements[Number(parts[4])]:undefined;for(const vocabulary of Object.keys(element?.extensions??{}))vocabularies.add(vocabulary);}
   for(const vocabulary of vocabularies)for(const key of Object.keys(source.vocabularies[vocabulary]??{}).filter(k=>k!=='version')){const at='/vocabularies/'+pointer(vocabulary)+'/'+pointer(key);if(!analysis.obligations.some(o=>o.id===at))analysis.obligations.push({id:at,path:at,kind:'unknown',status:'unchecked'});}
   if(Object.keys(payload).some(k=>k!=='actions'))for(const k of Object.keys(payload).filter(k=>k!=='actions')){const at=`/modules/${mi}/extensions/umf.actions/${pointer(k)}`;analysis.obligations.push({id:at,path:at,kind:'unknown',status:'unchecked'});}
   actions.push({module:module.id,path,action,obligations:analysis.obligations});
  });
 });
 for(const module of source.modules){const declared=actions.filter(a=>a.module===module.id);for(const member of ['id','name'] as const){const seen=new Set<string>();for(const entry of declared){if(seen.has(entry.action[member])&&!validation.diagnostics.some(d=>d.code==='ACTION_IDENTITY'&&d.path===entry.path+'/'+member))validation.diagnostics.push({code:'ACTION_IDENTITY',path:entry.path+'/'+member,message:'Duplicate local action '+member,severity:'error'});seen.add(entry.action[member]);}}}
 validation.valid=!validation.diagnostics.some(d=>d.severity==='error');validation.complete=validation.valid&&!validation.diagnostics.some(d=>d.severity==='warning');
 return copy({source,validation,actions});
}
function locate(inspection:ActionInspection,identityInput:ActionIdentity):InspectedAction {
 const identity=copy(identityInput);
 if(!identity||typeof identity.module!=='string'||!identity.module||typeof identity.action!=='string'||!identity.action||Object.keys(identity).some(k=>!['module','action'].includes(k)))fail('ACTION_IDENTITY','Expected exact module/action identity');
 const matches=inspection.actions.filter(a=>a.module===identity.module&&a.action.id===identity.action);
 if(matches.length!==1)fail('ACTION_IDENTITY','Action identity must resolve exactly one declaration');return matches[0]!;
}
export function declareAction(sourceInput:Document,moduleId:string,actionInput:Action,registry:Registry):Document {
 const source=admit(sourceInput,registry);valid(source,registry);const action=admitAction(actionInput);
 const module=source.modules.find(m=>m.id===moduleId)??fail('ACTION_REFERENCE','Module does not resolve');
 if(!source.vocabularies['umf.actions'])source.vocabularies['umf.actions']={version:'0.1.0'};
 module.extensions??={};const payload=module.extensions['umf.actions'] as unknown as {actions:Action[]}|undefined;
 if(payload?.actions.some(a=>a.id===action.id))fail('ACTION_IDENTITY','Fresh action ID is required');
 if(payload)payload.actions.push(action);else module.extensions['umf.actions']=copyJson({actions:[action]});
 valid(source,registry);return copy(source);
}
export function editAction(sourceInput:Document,identity:ActionIdentity,replacementInput:Action,registry:Registry):Document {
 const inspection=inspectActions(sourceInput,registry);valid(inspection.source,registry);const old=locate(inspection,identity),replacement=admitAction(replacementInput);
 if(old.action.id!==replacement.id)fail('ACTION_IDENTITY','Editing cannot replace stable action identity');
 if(old.obligations.some(o=>o.status==='unchecked'))fail('ACTION_UNCHECKED','Relevant uninterpreted meaning blocks safe editing',old.path);
 const source=copy(inspection.source),module=source.modules.find(m=>m.id===identity.module)!,payload=module.extensions!['umf.actions'] as unknown as {actions:Action[]};
 const index=payload.actions.findIndex(a=>a.id===identity.action);payload.actions[index]=replacement;
 valid(source,registry);const next=locate(inspectActions(source,registry),identity);
 if(next.obligations.some(o=>o.status==='unchecked'))fail('ACTION_UNCHECKED','Replacement contains relevant uninterpreted meaning',next.path);return copy(source);
}
export function assessAction(sourceInput:Document,identityInput:ActionIdentity,profileInput:ActionExecutorProfile,registry:Registry):ActionAssessment {
 const inspection=inspectActions(sourceInput,registry);valid(inspection.source,registry);const target=locate(inspection,identityInput),identity=copy(identityInput),profile=copy(profileInput);
 if(!profile||typeof profile.id!=='string'||!profile.id||typeof profile.version!=='string'||!profile.version||profile.actionVersion!=='0.1.0'||profile.coreVersion!=='0.8.0'||!Array.isArray(profile.claims)||Object.keys(profile).some(k=>!['id','version','actionVersion','coreVersion','claims','source','identity'].includes(k)))fail('ACTION_PROFILE','Invalid exact executor profile');
 if(canonicalSchemaJson(profile.source)!==canonicalSchemaJson(inspection.source)||canonicalSchemaJson(profile.identity)!==canonicalSchemaJson(identity))fail('ACTION_PROFILE','Profile must retain the exact declaration document and identity');
 if(profile.claims.length>target.obligations.length)fail('ACTION_PROFILE','Claim count exceeds obligation inventory');
 const claims=new Map<string,ActionExecutorProfile['claims'][number]>();
 for(const claim of profile.claims){
  if(!claim||typeof claim.obligation!=='string'||!['supported','unsupported','unknown'].includes(claim.status)||!Array.isArray(claim.evidence)||claim.evidence.some(e=>typeof e!=='string'||!e)||Object.keys(claim).some(k=>!['obligation','status','evidence'].includes(k)))fail('ACTION_PROFILE','Malformed capability claim');
  if(claims.has(claim.obligation)||!target.obligations.some(o=>o.id===claim.obligation))fail('ACTION_PROFILE','Duplicate or extra obligation claim');
  if(claim.status==='supported'&&!claim.evidence.length)fail('ACTION_PROFILE','Supported claim requires inert evidence locators');claims.set(claim.obligation,claim);
 }
 const diagnostics:Diagnostic[]=[],outcomes=target.obligations.map(o=>{
  const claim=claims.get(o.id);
  // Only exact opaque executable-profile semantics can be supplied by an executor.
  const override=o.kind==='selector'||o.kind==='handler'||o.kind==='authorization'||o.kind==='condition'&&o.path.endsWith('/rule');
  const status=o.status==='unchecked'&&!override?'unknown':claim?.status??'unknown';
  if(status!=='supported')diagnostics.push({code:'ACTION_CAPABILITY',path:o.path,message:'Obligation is '+status,severity:'warning'});
  return {obligation:o.id,path:o.path,status,evidence:claim?.evidence??[]};
 });
 return copy({source:inspection.source,profile,identity,declaredCompatible:outcomes.every(o=>o.status==='supported'),executionVerified:false,outcomes,diagnostics});
}
