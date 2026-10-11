import {UmfError,pointer,type Document,type Element,type Diagnostic} from '../../model/types';
import {checkSchemaLiteral,type CoreLiteral} from '../../model/schema-literals';
import type {CoreKeyDefinition} from '../../validation/keys';
import type {Action,ActionReference,ActionKeyReference,ActionObligation,ActionObligationKind,ActionEntityBinding,ActionAssignment,ActionEffect,ActionRule} from './types';
import {validateDocument} from '../../validation/document';
import {compileActionRule} from './expression';
import {compileActionSelector} from './selector';
import {actionReferencePositions} from './references';
export interface ActionAnalysis {obligations:ActionObligation[];diagnostics:Diagnostic[]}
const identity=(r:ActionReference)=>JSON.stringify([r.module,r.element]);
const recordKeys=(e:Element)=>(e.keys??[]) as CoreKeyDefinition[];
/** Metadata-only graph walk. Every accessed model dependency gets a stable pointer. */
export function analyzeAction(document:Document,action:Action,path:string,dddInterpreted=false):ActionAnalysis {
 const obligations:ActionObligation[]=[],diagnostics:Diagnostic[]=[],inventory=new Map<string,ActionObligation>();
 const coreWarnings=validateDocument(document).diagnostics.filter(d=>d.severity==='warning'&&d.code!=='UNKNOWN_EXTENSION');
 const diagnosticIds=new Map<string,{diagnostic:Diagnostic;messages:Set<string>}>();
 const add=(code:string,p:string,message:string,severity:'error'|'warning'='error')=>{const id=JSON.stringify([code,p,severity]),existing=diagnosticIds.get(id);if(existing){if(!existing.messages.has(message)){existing.messages.add(message);existing.diagnostic.message+='; '+message;}return;}const diagnostic={code,path:p,message,severity};diagnosticIds.set(id,{diagnostic,messages:new Set([message])});diagnostics.push(diagnostic);};
 const obligation=(p:string,kind:ActionObligationKind,status:'checked'|'unchecked'='checked')=>{
  const old=inventory.get(p);if(old){if(status==='unchecked')old.status=status;return;}
  const value={id:p,path:p,kind,status};inventory.set(p,value);obligations.push(value);
 };
 const unknown=(value:unknown,keys:string[],p:string)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  for(const key of Object.keys(value))if(!keys.includes(key)){
   const at=p+'/'+pointer(key);obligation(at,'unknown','unchecked');add('ACTION_UNCHECKED',at,'Unknown relevant member','warning');
  }
 };
 for(const reference of actionReferencePositions(action,path))unknown(reference.value,reference.keys,reference.path);
 const visited=new Set<string>();
 const model=(ref:ActionReference,p:string,kind?:'record'|'field',understoodExtensions:string[]=[]):Element|undefined=>{
  unknown(ref,['module','element'],p);
  const mi=document.modules.findIndex(m=>m.id===ref.module),ei=document.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;
  const element=document.modules[mi]?.elements[ei];
  if(!element||kind&&element.kind!==kind){add('ACTION_REFERENCE',p,'Reference must resolve an exact '+(kind??'element'));return;}
  const at=`/modules/${mi}/elements/${ei}`;
  if(!visited.has(at)){
   visited.add(at);obligation(at,'model');
   for(const warning of coreWarnings)if(warning.path===at||warning.path.startsWith(at+'/')){obligation(warning.path,'unknown','unchecked');add('ACTION_UNCHECKED',warning.path,warning.message,'warning');}
   unknown(element,['id','name','description','kind','scalarType','nullability','cardinality','facets','itemType','members','keys','references','extensions','title','aliases','examples','allowedValues','default'],at);
   // Native/extension meaning is not implicitly converted into graph execution meaning.
   for(const key of Object.keys(element.extensions).filter(k=>!understoodExtensions.includes(k))){
    const ext=at+'/extensions/'+pointer(key);obligation(ext,'unknown','unchecked');add('ACTION_UNCHECKED',ext,'Referenced native meaning requires a separately interpreted action profile','warning');
   }
   for(const [i,member] of ((element.members??[]) as ActionReference[]).entries())model(member,at+'/members/'+i,'field');
   for(const [i,k] of recordKeys(element).entries()){
    const kp=at+'/keys/'+i;obligation(kp,'key');unknown(k,['id','name','fields','primary'],kp);
    k.fields.forEach((f,j)=>model(f,kp+'/fields/'+j,'field'));
   }
   for(const [i,r] of (element.references??[]).entries()){
    unknown(r,['role','module','element'],at+'/references/'+i);model({module:r.module,element:r.element},at+'/references/'+i);
   }
   if(element.itemType)model(element.itemType as ActionReference,at+'/itemType','field');
   const facets=element.facets as Record<string,unknown>|undefined;
   if(facets){unknown(facets,['length','precision','scale','integerWidth','range','collectionSize'],at+'/facets');for(const [k,keys] of Object.entries({length:['min','max','unit'],integerWidth:['bits','signed'],range:['min','max','minInclusive','maxInclusive'],collectionSize:['min','max']}))if(facets[k])unknown(facets[k],keys,at+'/facets/'+k);}
  }
  return element;
 };
 const key=(ref:ActionKeyReference,p:string)=>{
  unknown(ref,['module','element','key'],p);
  const e=model({module:ref.module,element:ref.element},p,'record');
  if(e&&!recordKeys(e).some(k=>k.id===ref.key))add('ACTION_REFERENCE',p+'/key','Key does not resolve on the selected Record');
  if(e)for(const component of recordKeys(e).find(k=>k.id===ref.key)?.fields??[])value(component,p+'/components/'+pointer(component.module)+'/'+pointer(component.element));return e;
 };
 const value=(ref:ActionReference,p:string)=>{
  const e=model(ref,p,'field');if(e&&(!['boolean','integer','decimal','string','binary'].includes(e.scalarType??'')||e.cardinality!=='one'||e.references?.some(r=>r.role==='record-type')||e.scalarType==='decimal'&&(!(e.facets as any)?.precision||!Number.isSafeInteger((e.facets as any)?.scale)))){
   obligation(p,'value','unchecked');add('ACTION_UNCHECKED',p,'Field domain is outside the initial evaluated action subset','warning');
  }
  return e;
 };
 const distinct=(items:unknown[],member:string,p:string)=>{const seen=new Set<unknown>();items.forEach((item,i)=>{const id=(item as Record<string,unknown>)[member];if(seen.has(id))add('ACTION_IDENTITY',p+'/'+i+'/'+member,'Duplicate identity');seen.add(id);});};
 unknown(action,['id','name','description','parameters','outputs','preconditions','postconditions','reads','writes','binding','failures','authorization','attribution','atomicity','idempotency','result','dddOperation'],path);
 const parameters=new Map(action.parameters.map(p=>[p.id,p]));
 for(const group of ['parameters','outputs'] as const){
  distinct(action[group],'id',path+'/'+group);
  action[group].forEach((p,i)=>{const at=path+'/'+group+'/'+i;obligation(at,group==='outputs'?'output':p.kind==='value'?'value':'key');unknown(p,p.kind==='value'?['id','kind','field','required']:['id','kind','target','required'],at);p.kind==='value'?value(p.field,at+'/field'):key(p.target,at+'/target');});
 }
 const frames=[...action.reads,...action.writes];
 for(const groups of [['reads','writes'],['preconditions','postconditions']] as const){const seen=new Set<string>();for(const group of groups)action[group].forEach((entry,i)=>{if(seen.has(entry.id))add('ACTION_IDENTITY',path+'/'+group+'/'+i+'/id','Duplicate combined identity');seen.add(entry.id);});}
 if(action.preconditions.length+action.postconditions.length>128)add('LIMIT',path+'/postconditions','At most 128 combined conditions');
 distinct(action.failures,'code',path+'/failures');
 const relationship=(ref:{module:string;relationship:string},p:string)=>{
  unknown(ref,['module','relationship'],p);const mi=document.modules.findIndex(m=>m.id===ref.module);
  const list=(document.modules[mi]?.relationships??[]) as any[],ri=list.findIndex(r=>r.id===ref.relationship),r=list[ri];
  if(!r){add('ACTION_REFERENCE',p,'Relationship does not resolve');return;}
  const at=`/modules/${mi}/relationships/${ri}`;if(!visited.has(at)){
   visited.add(at);obligation(at,'model');
   for(const warning of coreWarnings)if(warning.path===at||warning.path.startsWith(at+'/')){obligation(warning.path,'unknown','unchecked');add('ACTION_UNCHECKED',warning.path,warning.message,'warning');}unknown(r,['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed','inverse','associationRecord'],at);
   for(const group of ['source','target'])r[group].forEach((end:any,i:number)=>group==='target'?key(end,at+'/'+group+'/'+i):model(end,at+'/'+group+'/'+i,'record'));
   for(const group of ['sourceMultiplicity','targetMultiplicity'])unknown(r[group],['min','max'],at+'/'+group);
   if(r.associationRecord)model(r.associationRecord,at+'/associationRecord','record');
   if(r.directed!==true||!['independent','unspecified'].includes(r.targetLifecycle)){obligation(at,'model','unchecked');add('ACTION_UNCHECKED',at,'Undirected or owned-lifecycle execution is outside graph-write/1','warning');}
  }
  return r;
 };
 const rule=(r:ActionRule,p:string,selector=false,phase:'pre'|'post'='pre',frame?:Action['reads'][number])=>{
  obligation(p,selector?'selector':'condition','unchecked');unknown(r,['language','version','expression','references'],p);
  const known=r.version==='1'&&r.language===(selector?'umf.actions.keys':'umf.actions.rules');
  const referenceUnknown=r.references.some(ref=>{const keys=Object.keys(ref);if(keys.length!==1)return true;const child='record'in ref?ref.record:'relationship'in ref?ref.relationship:undefined;return child!==undefined&&Object.keys(child as object).some(k=>!('record'in ref?['module','element']:['module','relationship']).includes(k));});
  const envelopeUnknown=Object.keys(r).some(k=>!['language','version','expression','references'].includes(k))||referenceUnknown;
  const dependencyUnknown=[...inventory.values()].some(o=>o.status==='unchecked'&&(o.kind==='value'||o.kind==='key'||o.kind==='model'||o.kind==='unknown'||!o.path.startsWith(path+'/')));
  if(known&&!envelopeUnknown&&!dependencyUnknown){try{if(selector)compileActionSelector(document,action,frame!);else compileActionRule(document,action,r,phase);inventory.get(p)!.status='checked';}catch(error){add(error instanceof UmfError&&error.code==='LIMIT'?'LIMIT':'ACTION_STRUCTURE',p,String(error));}}
  else add('ACTION_UNCHECKED',p,'Exact '+(selector?'selector':'rule')+' semantics require a separately qualified profile','warning');
  r.references.forEach((reference,i)=>{
   const at=p+'/references/'+i;
   if('parameter'in reference){unknown(reference,['parameter'],at);if(!parameters.has(reference.parameter as string))add('ACTION_REFERENCE',at,'Parameter does not resolve');}
   else if('output'in reference){unknown(reference,['output'],at);if(selector||!action.outputs.some(o=>o.id===reference.output))add('ACTION_REFERENCE',at,'Output is forbidden here or does not resolve');}
   else if('record'in reference){unknown(reference,['record'],at);model(reference.record as ActionReference,at+'/record','record');}
   else {unknown(reference,['relationship'],at);relationship(reference.relationship as {module:string;relationship:string},at+'/relationship');}
  });
 };
 for(const group of ['reads','writes'] as const)action[group].forEach((f,i)=>{
  const at=path+'/'+group+'/'+i;obligation(at,'frame');unknown(f,['id','record','selector','maxEntities','fields','relationships','create','delete'],at);
  const e=model(f.record,at+'/record','record');rule(f.selector,at+'/selector',true,'pre',f);
  if(group==='reads'&&(f.create||f.delete))add('ACTION_EFFECT',at,'Read frames cannot permit creation/deletion');
  const seen=new Set<string>();f.fields.forEach((r,j)=>{value(r,at+'/fields/'+j);if(seen.has(identity(r)))add('ACTION_IDENTITY',at+'/fields/'+j,'Duplicate frame field');seen.add(identity(r));if(e&&!((e.members??[]) as ActionReference[]).some(m=>identity(m)===identity(r)))add('ACTION_REFERENCE',at+'/fields/'+j,'Field is not a member of frame Record');});
  const relations=new Set<string>();f.relationships.forEach((r,j)=>{const rp=at+'/relationships/'+j,rel=relationship(r,rp),id=JSON.stringify([r.module,r.relationship]);if(rel&&![...rel.source,...rel.target].some((end:ActionReference)=>identity(end)===identity(f.record)))add('ACTION_REFERENCE',rp,'Frame Record must be a relationship endpoint');if(relations.has(id))add('ACTION_IDENTITY',rp,'Duplicate frame relationship');relations.add(id);});
 });
 const failureCodes=new Set<string>();
 for(const group of ['preconditions','postconditions'] as const)action[group].forEach((condition,i)=>{
  const at=path+'/'+group+'/'+i;obligation(at,'condition');unknown(condition,['id','rule','failure'],at);unknown(condition.failure,['code','message'],at+'/failure');
  if(failureCodes.has(condition.failure.code))add('ACTION_IDENTITY',at+'/failure/code','Condition failure codes must be distinct');failureCodes.add(condition.failure.code);
  if(!action.failures.some(f=>f.code===condition.failure.code&&f.message===condition.failure.message))add('ACTION_REFERENCE',at+'/failure','Condition failure must match a declared code and message');rule(condition.rule,at+'/rule',false,group==='preconditions'?'pre':'post');
  if(group==='preconditions'&&condition.rule.references.some(r=>'output'in r))add('ACTION_REFERENCE',at+'/rule/references','Preconditions cannot reference outputs');
 });
 action.failures.forEach((f,i)=>{obligation(path+'/failures/'+i,'failure');unknown(f,['code','message','retryable'],path+'/failures/'+i);});
 for(const member of ['authorization','attribution','atomicity','idempotency','result'] as const)obligation(path+'/'+member,member);
 unknown(action.result,['identities','version','receipt'],path+'/result');
 unknown(action.attribution,action.attribution.subject==='person-required'?['subject']:['subject','profile'],path+'/attribution');
 if(action.attribution.subject==='actor-profile'){unknown(action.attribution.profile,['id','version'],path+'/attribution/profile');obligation(path+'/attribution','attribution','unchecked');add('ACTION_UNCHECKED',path+'/attribution','Actor semantics require exact qualification','warning');}
 unknown(action.authorization,action.authorization.kind==='roles'?['kind','profile','roles']:['kind','profile','resources'],path+'/authorization');unknown(action.authorization.profile,['id','version'],path+'/authorization/profile');const knownRoles=action.authorization.kind==='roles'&&action.authorization.profile.id==='umf.actions.roles'&&action.authorization.profile.version==='1';
 if(knownRoles){if((action.authorization.roles as string[]).some(role=>role.length>256))add('LIMIT',path+'/authorization/roles','roles/1 identity bound exceeded');}
 else {obligation(path+'/authorization','authorization','unchecked');add('ACTION_UNCHECKED',path+'/authorization','Authorization profile is an inert declaration requiring exact interpretation','warning');}
 if(action.authorization.kind==='policy')action.authorization.resources.forEach((id,i)=>{if(!frames.some(f=>f.id===id))add('ACTION_REFERENCE',path+'/authorization/resources/'+i,'Policy resource must resolve a frame');});
 obligation(path+'/binding','binding');unknown(action.binding,action.binding.kind==='recipe'?['kind','profile','effects']:['kind','profile','handler'],path+'/binding');unknown(action.binding.profile,['id','version'],path+'/binding/profile');
 if(action.binding.kind==='handler'){
  obligation(path+'/binding/handler','handler','unchecked');unknown(action.binding.handler,['id','version'],path+'/binding/handler');add('ACTION_UNCHECKED',path+'/binding/handler','Handler identity is inert and requires exact qualification','warning');
 }else{
  if(action.outputs.length)add('ACTION_EFFECT',path+'/outputs','graph-write/1 has no business outputs');
  const created=new Map<string,ActionKeyReference>(),deleted=new Set<string>();distinct(action.binding.effects,'id',path+'/binding/effects');
  const entity=(binding:ActionEntityBinding,p:string):ActionKeyReference|undefined=>{
   unknown(binding,'parameter'in binding?['parameter']:['created'],p);
   const signature=JSON.stringify(binding);if(deleted.has(signature))add('ACTION_EFFECT',p,'Deleted entity binding cannot be reused');
   if('parameter'in binding){const parameter=parameters.get(binding.parameter as string);if(parameter?.kind!=='entity'){add('ACTION_REFERENCE',p,'Entity parameter does not resolve');return;}return parameter.target;}
   const target=created.get(binding.created as string);if(!target)add('ACTION_EFFECT',p,'Created binding must identify an earlier create');return target;
  };
  const assignments=(list:ActionAssignment[],record:ActionReference,p:string,set=false)=>{
   const e=model(record,p,'record'),seen=new Set<string>();
   list.forEach((a,i)=>{const at=p+'/values/'+i;unknown(a,['field','value'],at);const f=value(a.field,at+'/field'),id=identity(a.field);
    if(seen.has(id))add('ACTION_IDENTITY',at+'/field','Duplicate assignment');seen.add(id);
    if(e&&!((e.members??[]) as ActionReference[]).some(r=>identity(r)===id))add('ACTION_EFFECT',at+'/field','Assignment Field is not a Record member');
    if(!action.writes.some(frame=>identity(frame.record)===identity(record)&&frame.fields.some(field=>identity(field)===id)))add('ACTION_EFFECT',at+'/field','Assignment has no declared Record/Field write permission');
    if(set&&e&&recordKeys(e).some(k=>k.fields.some(r=>identity(r)===id)))add('ACTION_EFFECT',at+'/field','All Key components are immutable');
    unknown(a.value,'parameter'in a.value?['parameter']:['literal'],at+'/value');
    if('parameter'in a.value){const parameter=parameters.get(a.value.parameter as string);if(parameter?.kind!=='value'||identity(parameter.field)!==id||!parameter.required)add('ACTION_EFFECT',at+'/value','Assignment needs a required value parameter of the exact destination Field');}
    else if(f){
     const mi=document.modules.findIndex(m=>m.id===a.field.module),ei=document.modules[mi]?.elements.findIndex(e=>e.id===a.field.element)??-1,definition=`/modules/${mi}/elements/${ei}`;
     const uninterpreted=[...inventory.values()].some(o=>o.status==='unchecked'&&(o.path===definition||o.path.startsWith(definition+'/')));
     if(uninterpreted){obligation(at+'/value','value','unchecked');add('ACTION_UNCHECKED',at+'/value','Literal refinements depend on uninterpreted Field meaning','warning');}
     else try{checkSchemaLiteral(document,f,a.value.literal as CoreLiteral);}catch(error){if(['boolean','integer','decimal','string','binary'].includes(f.scalarType??'')&&f.cardinality==='one')add('ACTION_EFFECT',at+'/value',String(error));}
    }
   });return {record:e,fields:seen};
  };
  action.binding.effects.forEach((effect:ActionEffect,i)=>{
   const at=path+'/binding/effects/'+i;obligation(at,'effect');
   if(effect.kind==='create'){
    const r=effect.record as ActionReference,keys=key({...r,key:effect.key as string},at+'/record'),assigned=assignments(effect.values as ActionAssignment[],r,at);
    unknown(effect,['id','kind','record','key','values'],at);
    for(const member of ((keys?.members??[]) as ActionReference[])){
     const f=model(member,at+'/record','field');if(f?.nullability==='required'&&!assigned.fields.has(identity(member)))add('ACTION_EFFECT',at+'/values','Create must explicitly assign required Record members');
    }
    for(const k of recordKeys(keys??({} as Element)).filter(k=>k.id===effect.key))for(const f of k.fields)if(!assigned.fields.has(identity(f)))add('ACTION_EFFECT',at+'/values','Create must explicitly assign every Key component');
    if(!action.writes.some(frame=>identity(frame.record)===identity(r)&&frame.create))add('ACTION_EFFECT',at,'Creation has no declared Record create permission');
    created.set(effect.id,{...r,key:effect.key as string});
   }else if(effect.kind==='set'||effect.kind==='delete'){
    unknown(effect,effect.kind==='set'?['id','kind','entity','values']:['id','kind','entity'],at);const binding=effect.entity as ActionEntityBinding,target=entity(binding,at+'/entity');
    if(effect.kind==='set'&&target)assignments(effect.values as ActionAssignment[],{module:target.module,element:target.element},at,true);
    if(effect.kind==='delete'){if(target&&!action.writes.some(frame=>identity(frame.record)===identity(target)&&frame.delete))add('ACTION_EFFECT',at,'Deletion has no declared Record delete permission');if('created'in binding)add('ACTION_EFFECT',at,'Created entities cannot be deleted in the same action');deleted.add(JSON.stringify(binding));}
   }else if(effect.kind==='link'||effect.kind==='unlink'){
    unknown(effect,['id','kind','relationship','source','target','association'],at);const rel=relationship(effect.relationship as {module:string;relationship:string},at+'/relationship'),source=entity(effect.source as ActionEntityBinding,at+'/source'),target=entity(effect.target as ActionEntityBinding,at+'/target');
    if(source&&!action.writes.some(frame=>identity(frame.record)===identity(source)&&frame.relationships.some(r=>r.module===(effect.relationship as any).module&&r.relationship===(effect.relationship as any).relationship)))add('ACTION_EFFECT',at,'Association effect has no source relationship write permission');
    if(target&&![...action.reads,...action.writes].some(frame=>identity(frame.record)===identity(target)))add('ACTION_EFFECT',at+'/target','Association target requires a frozen declared frame');
    if(rel&&source&&!rel.source.some((r:ActionReference)=>identity(r)===identity(source)))add('ACTION_EFFECT',at+'/source','Source binding must match authored orientation');
    if(rel&&target&&!rel.target.some((r:ActionKeyReference)=>identity(r)===identity(target)&&r.key===target.key))add('ACTION_EFFECT',at+'/target','Target binding must match authored orientation and Key');
    if(rel?.associationRecord){if(!effect.association)add('ACTION_EFFECT',at,'Association Record requires an explicit association binding');else{const association=entity(effect.association as ActionEntityBinding,at+'/association');if(association&&identity(association)!==identity(rel.associationRecord))add('ACTION_EFFECT',at+'/association','Association binding must match association Record');}}
    else if(effect.association)add('ACTION_EFFECT',at+'/association','Independent set relationship has no association Record');
   }else {obligation(at,'effect','unchecked');add('ACTION_UNCHECKED',at,'Unknown future effect kind','warning');}
  });
 }
 if(action.dddOperation){
  const at=path+'/dddOperation',r=action.dddOperation;unknown(r,['module','element','operation'],at);const e=model({module:r.module,element:r.element},at,undefined,dddInterpreted?['umf.ddd']:[]),ddd=e?.extensions['umf.ddd'] as any;
  if(!ddd||ddd.kind!=='domain-service'||!ddd.operations?.some((o:any)=>o.name===r.operation))add('ACTION_REFERENCE',at,'Explicit DDD service operation must resolve');
 }
 return {obligations,diagnostics};
}
