// SPDX-License-Identifier: MIT OR Apache-2.0
/** Catalog transport data checks only; pins and dispositions never confer authority. */
import {copyJson} from '../../../model/json';
import {canonicalSchemaJson,type CoreLiteral} from '../../../model/schema-literals';
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import {GREGORIAN_DATE_PROFILE,parseGregorianDate} from '../../../adapters/gregorian-date';
import type {SecurityRef} from '../types';
import {checkProtectionParametersWithinBudget,protectionFieldIndex} from './parameters';
import {ProtectionLiteralBudget} from './literals';
import type {ProtectionFieldLocation} from './core-fields';
import {readProtectionSource,writeProtectionSource} from './source';

export interface SecurityDisclosureColumnV2 {
 field:SecurityRef;storageEffect:'canonical'|'stored-transformed';
 storageTransform?:{id:string;version:string};valueProfile?:typeof GREGORIAN_DATE_PROFILE;
}
export type SecurityDisclosureCellV2=
 |{disposition:'original';value:CoreLiteral}
 |{disposition:'absent'|'withheld'}
 |{disposition:'transformed';selection:{ruleIndex:number;disclosureIndex:number};outputDomain:SecurityRef;
 transform:{id:string;version:string};value:CoreLiteral;valueProfile?:typeof GREGORIAN_DATE_PROFILE};
export interface SecurityDisclosureBatchV2 {
 version:'umf.security.disclosure/0.2.0';policy:{id:string;revision:string};protection:{id:string;revision:string};
 domains:{documentId:string;revision:string}[];columns:SecurityDisclosureColumnV2[];rows:SecurityDisclosureCellV2[][];
}
export interface SecurityDisclosureInspectionV2 {
 status:'validated-disclosure'|'refused';source:Json;batch:SecurityDisclosureBatchV2|null;
 policy:Json;catalog:Json;closure:Json;complete:false;authority:false;diagnostics:readonly Diagnostic[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
function fail(message:string,path=''):never{throw new UmfError('SECURITY_DISCLOSURE_V2',message,path);}
function members(v:any,required:string[],optional:string[]=[],path=''):void{
 if(v===null||typeof v!=='object'||Array.isArray(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail('Closed transport object required',path);
}
function text(v:any):void{if(typeof v!=='string'||!v.length||v.length>4096)fail('Exact nonempty bounded string required');}
function ref(v:any):void{members(v,['documentId','moduleId','elementId']);for(const x of Object.values(v))text(x);}
const sameRef=(a:any,b:any)=>['documentId','moduleId','elementId'].every(k=>a?.[k]===b?.[k]);
function transformRef(v:any):void{members(v,['id','version']);text(v.id);text(v.version);}
function bounded(source:Json,limit:number,budget?:ProtectionLiteralBudget):void{
 let units=0;const pending=[source];
 while(pending.length){const value=pending.pop()!;budget?.step();
  if(typeof value==='string')units+=value.length;
  else if(value!==null&&typeof value==='object')for(const [key,child] of Object.entries(value)){units+=key.length;pending.push(child);}
  if(units>limit)throw new UmfError('SECURITY_DISCLOSURE_V2_BOUND',`resource-exhausted: key/string text exceeds${limit} UTF-16 units`);
 }
}
function profile(location:ProtectionFieldLocation,selected:unknown):void{
 if(selected===undefined)return;
 const f=location.field;
 if(selected!==GREGORIAN_DATE_PROFILE||f.scalarType!=='date'||f.cardinality!=='one'
  ||!['required','absent-allowed'].includes(f.nullability as string)||f.itemType!==undefined||f.references?.length
  ||Object.keys(f.facets??{}).length||Object.hasOwn(f,'allowedValues')||Object.hasOwn(f,'default'))fail('Explicit unrefined Gregorian date profile Field required');
}
function value(location:ProtectionFieldLocation,input:Json,selected:unknown,budget:ProtectionLiteralBudget):void{
 bounded(input,4096,budget);
 if(canonicalSchemaJson(input).length>4096)throw new UmfError('SECURITY_DISCLOSURE_V2_BOUND','resource-exhausted: canonical literal exceeds4096 UTF-16 units');
 if(selected===undefined){budget.check(location.doc,location.field,input as CoreLiteral);return;}
 profile(location,selected);
 if(input===null){if(location.field.nullability!=='absent-allowed')fail('Null outside required date Field');return;}
 members(input,['date']);if(typeof (input as any).date!=='string')fail('Exact date literal required');parseGregorianDate((input as any).date);
}
/** Every check is against detached supplied sources; successful data validation is not admission. */
export function inspectSecurityDisclosureV2(input:unknown,policy:unknown,catalog:unknown,closure:unknown):SecurityDisclosureInspectionV2 {
 const budget=new ProtectionLiteralBudget(),resolved=checkProtectionParametersWithinBudget(policy,catalog,closure,budget);
 const diagnostics:Diagnostic[]=[...resolved.diagnostics];let source:Json=null;
 const finish=(success:boolean):SecurityDisclosureInspectionV2=>freeze({status:success?'validated-disclosure':'refused',source,
  batch:success?source as unknown as SecurityDisclosureBatchV2:null,policy:resolved.policy,catalog:resolved.catalog,closure:resolved.closure,
  complete:false,authority:false,diagnostics});
 try{
  source=copyJson(input);bounded(source,4_000_000);
  if(resolved.status==='refused')return finish(false);
  const b=source as any,p=resolved.policy as any,c=resolved.catalog as any,cl=resolved.closure as any;
  members(b,['version','policy','protection','domains','columns','rows']);
  if(b.version!=='umf.security.disclosure/0.2.0')fail('Exact disclosure version required');
  for(const [pin,expected] of [[b.policy,p],[b.protection,c]]){members(pin,['id','revision']);text(pin.id);text(pin.revision);if(pin.id!==expected.id||pin.revision!==expected.revision)fail('Exact policy/catalog pin mismatch');}
  if(!Array.isArray(b.domains)||b.domains.length!==cl.pins.length)fail('Exact core pin bijection required');
  const pins=new Map<string,string>(cl.pins.map((pin:any)=>[pin.documentId,pin.revision]));
  for(const pin of b.domains){members(pin,['documentId','revision']);text(pin.documentId);text(pin.revision);if(pins.get(pin.documentId)!==pin.revision)fail('Stale/duplicate/extra core pin');pins.delete(pin.documentId);}
  if(pins.size)fail('Missing core pin');
  if(!Array.isArray(b.columns)||b.columns.length>256||!Array.isArray(b.rows)||b.rows.length>4096||b.columns.length*b.rows.length>16384)throw new UmfError('SECURITY_DISCLOSURE_V2_BOUND','resource-exhausted: column/row/cell count');
  const fields=protectionFieldIndex(resolved.closure),locate=(r:any)=>{ref(r);const found=fields.get(r);if(!found)fail('Exact qualified Field missing');return found;};
  const transforms=new Map<string,any>(c.transforms.map((t:any)=>[JSON.stringify([t.id,t.version]),t]));
  const select=(r:any)=>{transformRef(r);const found=transforms.get(JSON.stringify([r.id,r.version]));if(!found)fail('Exact transform id/version missing');return found;};
  const originals:ProtectionFieldLocation[]=[],identities=new Set<string>();
  for(const column of b.columns){
   members(column,['field','storageEffect'],['storageTransform','valueProfile']);
   const field=locate(column.field),identity=JSON.stringify([column.field.documentId,column.field.moduleId,column.field.elementId]);
   if(identities.has(identity))fail('Duplicate canonical Field column');identities.add(identity);originals.push(field);profile(field,column.valueProfile);
   if(column.storageEffect==='stored-transformed'){
    const t=select(column.storageTransform);
    if(!['tokenize','encrypt'].includes(t.kind)||t.custody?.storageEffect!=='stored-transformed'||!sameRef(column.field,t.outputDomain))fail('Stored carrier must name exact storage-transform output Field');
   }else if(column.storageEffect==='canonical'){
    if(Object.hasOwn(column,'storageTransform')||c.transforms.some((t:any)=>t.custody?.storageEffect==='stored-transformed'&&sameRef(column.field,t.outputDomain)))fail('Canonical storage tag conflicts with declared stored carrier');
   }else fail('Unknown storage effect');
  }
  for(const [rowIndex,row] of b.rows.entries()){
   if(!Array.isArray(row)||row.length!==b.columns.length)fail('Rectangular ordered row required','/rows/'+rowIndex);
   for(const [i,cell] of row.entries()){
    const column=b.columns[i],from=originals[i]!;
    if(cell===null||typeof cell!=='object'||Array.isArray(cell))fail('Tagged cell object required');
    if(cell.disposition==='withheld'){members(cell,['disposition']);continue;}
    if(cell.disposition==='absent'){members(cell,['disposition']);if(from.field.nullability!=='absent-allowed')fail('Absent requires explicit absent-allowed Field');continue;}
    if(cell.disposition==='original'){members(cell,['disposition','value']);value(from,cell.value,column.valueProfile,budget);continue;}
    if(cell.disposition!=='transformed')fail('Unknown or unsupported disposition');
    members(cell,['disposition','selection','outputDomain','transform','value'],['valueProfile']);
    members(cell.selection,['ruleIndex','disclosureIndex']);
    if(![cell.selection.ruleIndex,cell.selection.disclosureIndex].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))fail('Exact nonnegative safe selection indices required');
    const selected=p.rules[cell.selection.ruleIndex]?.disclosure?.[cell.selection.disclosureIndex],d=selected?.disposition,t=select(cell.transform),to=locate(cell.outputDomain);
    if(d?.kind!=='transformed'||d.vocabulary!=='umf.security.protection'||d.transform!==t.id||d.version!==t.version
     ||!sameRef(column.field,selected.field)||!sameRef(column.field,t.inputDomain)||!sameRef(cell.outputDomain,d.field)||!sameRef(cell.outputDomain,t.outputDomain))fail('Exact selected policy/transform input/output correspondence required');
    profile(to,cell.valueProfile);value(to,cell.value,cell.valueProfile,budget);
   }
  }
  diagnostics.push({code:'SECURITY_DISCLOSURE_DATA_ONLY',path:'',severity:'warning',message:'Transport shape/domain/source correspondence only; no row authorization, actual transform execution, current custody or native admission'});
  return finish(true);
 }catch(error){
  if(!(error instanceof UmfError)&&!(error instanceof TypeError)&&!(error instanceof RangeError))throw error;
  diagnostics.push({code:error instanceof UmfError?error.code:'SECURITY_DISCLOSURE_V2',path:error instanceof UmfError?error.path:'',message:error.message,severity:'error'});return finish(false);
 }
}
export function encodeSecurityDisclosureV2(input:unknown,policy:unknown,catalog:unknown,closure:unknown,format:'json'|'yaml'='json'):string{
 if(!['json','yaml'].includes(format))fail('Exact JSON/YAML format required');
 const result=inspectSecurityDisclosureV2(input,policy,catalog,closure);if(result.status==='refused')fail('Invalid or unsupported disclosure transport');
 try{return writeProtectionSource(result.batch,format);}catch(error){if(!(error instanceof UmfError))throw error;return fail('Invalid or unsupported disclosure transport: '+error.message);}
}
export function decodeSecurityDisclosureV2(text:string,policy:unknown,catalog:unknown,closure:unknown,format:'json'|'yaml'='json'):SecurityDisclosureBatchV2{
 if(typeof text!=='string'||!['json','yaml'].includes(format))fail('Exact text and JSON/YAML format required');
 try{const result=inspectSecurityDisclosureV2(readProtectionSource(text,format),policy,catalog,closure);if(result.batch)return result.batch;}catch(error){if(!(error instanceof UmfError))throw error;}return fail('Invalid or unsupported disclosure transport');
}
