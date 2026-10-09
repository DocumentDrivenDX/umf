import {type Document,type Diagnostic,type Validation,type Element,pointer,UmfError} from '../types';
import {knownSchemaMembers} from '../schema-literals';
import type {CoreLiteral} from '../schema-literals';
import type {CoreRecordValueIdentity,CoreRecordFieldValue,CoreRecordValueCheck} from '../record-values';
export function evaluateRecordBody(source:Document,identity:CoreRecordValueIdentity,values:CoreRecordFieldValue[],documentValidation:Validation,validateField:(field:CoreRecordValueIdentity,value:CoreLiteral)=>Validation,lookupField:(identity:CoreRecordValueIdentity)=>Element|undefined=identity=>source.modules.find(m=>m.id===identity.module)?.elements.find(e=>e.id===identity.element),hasRelationships=source.modules.some(m=>Array.isArray(m.relationships)&&m.relationships.length)){
 const checkIdentity=(value:CoreRecordValueIdentity)=>{knownSchemaMembers(value,['module','element'],'/identity');if(Object.keys(value).length!==2||typeof value.module!=='string'||!value.module||typeof value.element!=='string'||!value.element)throw new UmfError('CORE_RECORD_VALUE_IDENTITY','Explicit qualified identity required');};
 checkIdentity(identity);if(!Array.isArray(values))throw new UmfError('CORE_RECORD_VALUE_INPUT','Explicit field-state array required');
 const record=lookupField(identity);
 if(!record||record.kind!=='record')throw new UmfError('CORE_RECORD_VALUE_IDENTITY','Record identity required');
 const diagnostics:Diagnostic[]=[],fields:CoreRecordValueCheck['fields']=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
 // Original envelope diagnostics are retained separately. Unresolved source
 // meaning contributes explicit incompleteness, not an invented interpretation.
 for(const diagnostic of documentValidation.diagnostics)if(diagnostic.severity==='warning'&&!diagnostic.code.startsWith('EXPERIMENTAL_'))diagnostics.push({...diagnostic});
 const key=(field:CoreRecordValueIdentity)=>JSON.stringify([field.module,field.element]);
 const supplied=new Map<string,CoreRecordFieldValue>();
 values.forEach((value,index)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new UmfError('CORE_RECORD_VALUE_INPUT','Explicit field-state object required');
  knownSchemaMembers(value,value.state==='present'?['field','state','value']:['field','state'],'/values/'+index);
  if(!['absent','present'].includes(value.state)||value.state==='present'&&!Object.hasOwn(value,'value'))throw new UmfError('CORE_RECORD_VALUE_INPUT','Explicit absent/present value required','/values/'+index);
  checkIdentity(value.field);const id=key(value.field);
  if(supplied.has(id))add('DUPLICATE_RECORD_VALUE','/values/'+index,'Duplicate qualified Field value');else supplied.set(id,value);
 });
 const members=record.members as CoreRecordValueIdentity[]|undefined;
 if(!members)add('RECORD_MEMBERS_UNSPECIFIED','/identity','Record member inventory is not declared','warning');
 const declared=new Set((members??[]).map(key));
 for(const [id] of supplied)if(!declared.has(id))add('UNDECLARED_RECORD_VALUE','/values','Value is not a declared Record member: '+id);
 for(const member of members??[]){
  const field=lookupField(member);
  const value=supplied.get(key(member));const state=value?.state??'absent';const at='/members/'+pointer(member.module)+'/'+pointer(member.element);
  const local:Diagnostic[]=[];const issue=(code:string,message:string,severity:'error'|'warning'='error')=>local.push({code,path:at,message,severity});
  if(!field||field.kind!=='field')issue('RECORD_MEMBER_INTERPRETATION','Member is not a supported Field','warning');
  else{
   if(!(typeof field.nullability==='string'&&['required','absent-allowed'].includes(field.nullability)))issue('RECORD_AVAILABILITY_UNKNOWN','Complete availability requires explicit required or absent-allowed','warning');
   if(!(typeof field.cardinality==='string'&&['one','array','map'].includes(field.cardinality)))issue('RECORD_CARDINALITY_UNKNOWN','Complete shape requires explicit one/array/map','warning');
   if(state==='absent'){if(field.nullability==='required')issue('REQUIRED_RECORD_VALUE','Required Field is absent; defaults are not applied');}
   else{
    const result=validateField(member,(value as Extract<CoreRecordFieldValue,{state:'present'}>).value);
    local.push(...result.diagnostics.map(d=>({...d,path:at+d.path})));
    if(!result.complete&&!result.diagnostics.length)issue('FIELD_CHECK_INCOMPLETE','Original Field checker is incomplete','warning');
   }
  }
  diagnostics.push(...local);fields.push({field:{module:member.module,element:member.element},state,validation:{valid:!local.some(d=>d.severity==='error'),complete:local.length===0,diagnostics:local}});
 }
 if(Array.isArray(record.keys)&&record.keys.length)add('RECORD_KEY_CONTEXT_REQUIRED','/identity','Dataset key equality/uniqueness needs a separately qualified check','warning');
 if(hasRelationships)add('RECORD_RELATIONSHIP_CONTEXT_REQUIRED','/identity','Relationship/endpoint constraints need a separately qualified dataset check','warning');
 return {operation:'validate-core-record-values' as const,version:'1.0.0' as const,identity,values,documentValidation,validation:{valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics},fields};
}
