import {type Document,type Json,UmfError} from './types';
import {createValueContext,ValueWork,WorkExceeded,preflightBytes} from './internal/value-context';
import {snapshotSchema} from '../validation/internal-schema';
import {createValidator} from '../validation/schema';
import {reserveSchemaWork} from './internal/schema-work';
import coreSchema from '../../spec/core/schema-properties-document.schema.json';
import datasetSchema from '../../spec/core/dataset-value-operation.schema.json';
import keySchema from '../../spec/core/key-tuple-operation-v3.schema.json';
import policyInput from '../../spec/core/evolution-policy.schema.json';
import receiptInput from '../../spec/core/evolution-operation.schema.json';
const policySchema=snapshotSchema(policyInput),receiptSchema=snapshotSchema(receiptInput);
const validator=createValidator();for(const s of [coreSchema,keySchema,datasetSchema])validator.addSchema(snapshotSchema(s));
const checkPolicy=validator.compile(policySchema),checkReceipt=validator.compile(receiptSchema);
export const coreEvolutionPolicySchema=policyInput,coreEvolutionOperationSchema=receiptInput;
export interface CoreEvolutionPolicy{profile:'core-0.8-absent-string-additions/0.1'}
function canonical(value:any,work:ValueWork):string{work.charge('evolution-canonical',1);if(Array.isArray(value))return '['+value.map(x=>canonical(x,work)).join(',')+']';if(value!==null&&typeof value==='object'){const keys=Object.keys(value);work.charge('evolution-sort',keys.length*Math.ceil(Math.log2(keys.length+1)));return '{'+keys.sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],work)).join(',')+'}';}return JSON.stringify(value);}
function equal(a:any,b:any,w:ValueWork){return canonical(a,w)===canonical(b,w);}
function bounded(value:any,w:ValueWork){const n=w.count(value);if(n>100000)throw new WorkExceeded('Evolution aggregate value limit');preflightBytes(value,w);}
function compose(beforeInput:Document,afterInput:Document,policyInput:CoreEvolutionPolicy,work:ValueWork){
 const policy=work.copy(policyInput);bounded(policy,work);reserveSchemaWork(policySchema,policySchema,policy,work,'evolution-policy');if(!checkPolicy(policy))throw new UmfError('CORE_EVOLUTION_POLICY','Explicit bounded evolution profile required');
 const frozenBefore=work.copy(beforeInput),frozenAfter=work.copy(afterInput);bounded({before:frozenBefore,after:frozenAfter,policy},work);
 const beforeContext=createValueContext(frozenBefore as unknown as Document,{},work),afterContext=createValueContext(frozenAfter as unknown as Document,{},work);
 const before=beforeContext.source,after=afterContext.source;bounded({before,after,policy},work);
 const changes:any[]=[],presenceChecks:any[]=[],residuals:string[]=[];let broken=false;
 const changed=(kind:string,beforePath:string|null,afterPath:string|null)=>{work.charge('evolution-change',1);changes.push({kind,beforePath,afterPath});residuals.push('Existing definition or unsupported structure differs: '+(afterPath??beforePath));if(kind!=='unsupported-change')broken=true;};
 // Private copies stripped only of the exactly admitted append suffixes.
 const stripped=work.copy(after) as any;
 const beforeModules=before.modules as any[],afterModules=stripped.modules as any[];
 if(beforeModules.length>afterModules.length)changed('removed-definition','/modules',null);
 if(before.id!==after.id||before.umf!==after.umf)changed('changed-definition','/id','/id');
 for(let mi=0;mi<beforeModules.length;mi++){
  const bm=beforeModules[mi],am=afterModules[mi];work.charge('evolution-module',1);
  if(!am||am.id!==bm.id){changed('removed-definition','/modules/'+mi,'/modules/'+mi);continue;}
  if(!equal(bm.relationships??[],am.relationships??[],work))changed('changed-definition','/modules/'+mi+'/relationships','/modules/'+mi+'/relationships');
  work.charge('evolution-element-index',2*bm.elements.length);const oldIds=new Set(bm.elements.map((e:any)=>e.id));
  work.charge('evolution-appended-copy',Math.max(0,am.elements.length-bm.elements.length));const appended=am.elements.slice(bm.elements.length);const additions=new Map<string,any>();
  for(const [additionIndex,field] of appended.entries()){work.charge('evolution-added-field',1);work.walk('evolution-field-key-scan',field,8);const known=['id','name','kind','scalarType','cardinality','nullability','extensions'];
   if(field.kind==='field'&&field.scalarType==='string'&&field.cardinality==='one'&&field.nullability==='absent-allowed'&&!oldIds.has(field.id)&&Object.keys(field).every(k=>known.includes(k))&&equal(field.extensions??{}, {},work))additions.set(field.id,field);
   else changed(field.kind==='field'&&field.nullability==='required'?'changed-definition':'unsupported-change',null,'/modules/'+mi+'/elements/'+(bm.elements.length+additionIndex));
  }
  const used=new Set<string>();
  for(let ei=0;ei<bm.elements.length;ei++){
   const old=bm.elements[ei],next=am.elements[ei];work.charge('evolution-existing-field',1);if(!next||next.id!==old.id){changed('removed-definition','/modules/'+mi+'/elements/'+ei,null);continue;}
   if(old.kind==='field'&&['kind','scalarType','cardinality','nullability','facets','default'].some(k=>!equal(old[k]??null,next[k]??null,work)))changed('changed-definition','/modules/'+mi+'/elements/'+ei,'/modules/'+mi+'/elements/'+ei);
   if(old.kind==='record'&&!equal(old.keys??[],next.keys??[],work))changed('changed-definition','/modules/'+mi+'/elements/'+ei+'/keys','/modules/'+mi+'/elements/'+ei+'/keys');
   if(old.kind==='record'&&Array.isArray(old.members)&&Array.isArray(next.members)){
    work.charge('evolution-member-comparison-copy',Math.min(next.members.length,old.members.length));if(!equal(old.members,next.members.slice(0,old.members.length),work))changed('changed-definition','/modules/'+mi+'/elements/'+ei+'/members','/modules/'+mi+'/elements/'+ei+'/members');
    work.charge('evolution-member-suffix-copy',Math.max(0,next.members.length-old.members.length));const suffix=next.members.slice(old.members.length);
    for(const [suffixIndex,ref] of suffix.entries()){work.charge('evolution-member',1);if(ref.module!==bm.id||!additions.has(ref.element)||used.has(old.id+'\0'+ref.element)){changed('unsupported-change',null,'/modules/'+mi+'/elements/'+ei+'/members');continue;}
     used.add(old.id+'\0'+ref.element);const compact=afterContext.record({module:bm.id,element:old.id},[{field:ref,state:'absent'}]);
     const {sourceRef,...body}=compact;const original=work.copy({...body,source:after});presenceChecks.push(original);
     work.charge('evolution-field-result-scan',compact.fields.length);const result=compact.fields.find(f=>f.field.module===ref.module&&f.field.element===ref.element);
     if(!result?.validation.valid||!result.validation.complete)changed('changed-definition',null,'/modules/'+mi+'/elements/'+ei+'/members');
     changes.push({kind:'added-absent-string',beforePath:null,afterPath:'/modules/'+mi+'/elements/'+ei+'/members/'+(old.members.length+suffixIndex)});
    }
    work.charge('evolution-member-prefix-copy',Math.min(next.members.length,old.members.length));next.members=next.members.slice(0,old.members.length);
   }
  }
  for(const id of additions.keys()){work.charge('evolution-unused-scan',2*used.size);if(![...used].some(k=>k.endsWith('\0'+id))){changed('unsupported-change',null,'/modules/'+mi+'/elements');}}
  work.charge('evolution-element-prefix-copy',Math.min(am.elements.length,bm.elements.length));am.elements=am.elements.slice(0,bm.elements.length);
 }
 if(!equal(before,stripped,work))changed('unsupported-change','/','/');
 if(!beforeContext.documentValidation.complete||!afterContext.documentValidation.complete)residuals.push('Unknown retained source meaning is not classified');
 const classification=broken?'breaking':residuals.length?'unsupported':'preserved';
 work.charge('evolution-diagnostic-copy',beforeContext.documentValidation.diagnostics.length+afterContext.documentValidation.diagnostics.length);
 const receipt={operation:'inspect-core-evolution',version:'1.0.0',profile:'core-0.8-absent-string-additions/0.1',before,after,beforeValidation:beforeContext.documentValidation,afterValidation:afterContext.documentValidation,classification,complete:classification==='preserved',changes,presenceChecks,diagnostics:[...beforeContext.documentValidation.diagnostics,...afterContext.documentValidation.diagnostics],residuals};bounded(receipt,work);return receipt;
}
function limit(error:unknown):never{if(error instanceof WorkExceeded)throw new UmfError('LIMIT',error.message);throw error;}
export function inspectCoreEvolution(before:Document,after:Document,policy:CoreEvolutionPolicy){try{const work=new ValueWork(),receipt=compose(before,after,policy,work);reserveSchemaWork(receiptSchema,receiptSchema,receipt,work,'evolution-result');if(!checkReceipt(receipt))throw new UmfError('CORE_EVOLUTION_RESULT',JSON.stringify(checkReceipt.errors));return work.copy(receipt);}catch(error){return limit(error);}}
export function verifyCoreEvolution(receiptInput:unknown,before:Document,after:Document,policy:CoreEvolutionPolicy){try{const work=new ValueWork(),receipt=work.copy(receiptInput);bounded(receipt,work);reserveSchemaWork(receiptSchema,receiptSchema,receipt,work,'evolution-receipt');if(!checkReceipt(receipt))throw new UmfError('CORE_EVOLUTION_RECEIPT','Closed original receipt required');const expected=compose(before,after,policy,work);if(!equal(receipt,expected,work))throw new UmfError('CORE_EVOLUTION_RECEIPT','Original expected inputs or complete result differ');return work.copy(expected);}catch(error){return limit(error);}}
