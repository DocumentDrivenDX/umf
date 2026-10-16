import manifest from '../../../spec/extensions/binding-128/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError,pointer,type Document,type ExtensionPackage,type Validation,type Diagnostic} from '../../model/types';
import {validateCoreFieldValue} from '../../model/schema-properties';
import {parseBits128,bits128FromWords,bits128ToWords,type Bit128Value} from '../../model/bit128';
import {parseUuid,uuidToBits128,uuidFromBits128} from '../../model/uuid';
import type {CoreLiteral} from '../../model/schema-literals';
export const bit128BindingPackage=manifest as unknown as ExtensionPackage;
const carrierRegistry=new Registry().register(bit128BindingPackage);
export type Bit128Carrier={kind:'native-uuid'|'bytes16'|'uuid-text'|'hex128-text';column:string}|{kind:'words64';highColumn:string;lowColumn:string;signed:boolean};
export interface Bit128FieldBinding {module:string;element:string;storage:'scalar-carrier';carrier:Bit128Carrier}
export interface Bit128BindingPayload {
 profile:'umf-binding-3';logical:{documentId:string;coreVersion:'0.9.0'};target:{system:string;version:string;subset:string};
 elements:{module:string;element:string;table?:string;partition?:string|null}[];
 fields:(Bit128FieldBinding|{module:string;element:string;field?:string;storage:'column'|'embedded';column?:string;documentColumn?:string;path?:string[]})[];
 relationships:unknown[];indexes:unknown[];
}
export function inspectBit128Binding(bindingInput:Document,logicalInput:Document):Validation{
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
 try{
  const binding=copyJson(bindingInput) as unknown as Document,logical=copyJson(logicalInput) as unknown as Document;
  const validation=validateDocument(binding,carrierRegistry);diagnostics.push(...validation.diagnostics.filter(d=>d.code!=='SEMANTICS_UNCHECKED'));
  if(!validation.valid)return {valid:false,complete:false,diagnostics};
  const payload=binding.extensions?.['umf.binding'] as unknown as Bit128BindingPayload;
  if(binding.modules.length||binding.vocabularies['umf.binding']?.version!=='0.3.0'||payload?.profile!=='umf-binding-3')throw new UmfError('BINDING_PROFILE','Expected separate binding3 document');
  const logicalValidation=validateDocument(logical);
  if(logical.umf!=='0.9.0'||!logicalValidation.valid||payload.logical.documentId!==logical.id||payload.logical.coreVersion!==logical.umf)throw new UmfError('BINDING_MODEL','Exact valid core0.9 source required');
  const unknown=(o:object,known:string[],path:string)=>{for(const k of Object.keys(o))if(!known.includes(k))add('BINDING_UNKNOWN',path+'/'+pointer(k),'Unknown carrier meaning retained','warning');};
  unknown(payload,['profile','logical','target','elements','fields','relationships','indexes'],'/extensions/umf.binding');
  unknown(payload.logical,['documentId','coreVersion'],'/logical');unknown(payload.target,['system','version','subset'],'/target');
  const key=(r:{module:string;element:string})=>JSON.stringify([r.module,r.element]);
  const elements=new Map(logical.modules.flatMap(m=>m.elements.map(e=>[key({module:m.id,element:e.id}),e] as const)));
  const tables=new Map<string,string>();
  for(const [i,e] of payload.elements.entries()){
   if(!elements.has(key(e))||tables.has(key(e)))add('BINDING_REFERENCE','/elements/'+i,'Missing or duplicate exact logical element');
   if(e.table)tables.set(key(e),e.table);
   unknown(e,['module','element','table','partition'],'/elements/'+i);
  }
  const fields=new Set<string>(),slots=new Set<string>();
  for(const [i,row] of payload.fields.entries()){
   const path='/fields/'+i,field=elements.get(key(row));
   const mi=logical.modules.findIndex(m=>m.id===row.module),ei=logical.modules[mi]?.elements.findIndex(e=>e.id===row.element)??-1,logicalPath=`/modules/${mi}/elements/${ei}`;
   diagnostics.push(...logicalValidation.diagnostics.filter(d=>d.severity==='warning'&&d.path.startsWith(logicalPath+'/')&&!d.path.startsWith(logicalPath+'/extensions/')));
   if(fields.has(key(row)))add('BINDING_DUPLICATE',path,'Duplicate field binding');fields.add(key(row));
   if(!field||field.kind!=='field')add('BINDING_REFERENCE',path,'Explicit logical Field required');
   const owners=logical.modules.flatMap(m=>m.elements.filter(e=>e.kind==='record'&&((e.members??[]) as {module:string;element:string}[]).some(r=>key(r)===key(row))).map(e=>key({module:m.id,element:e.id})));
   const table=tables.get(key(row))??(owners.length===1?tables.get(owners[0]!):undefined);
   if(!table)add('BINDING_TABLE',path,'Explicit target table/record binding required');
   let columns:string[]=[];
   if(row.storage==='scalar-carrier'){
    unknown(row,['module','element','storage','carrier'],path);
    if(field?.cardinality!=='one'||!['required','absent-allowed'].includes(field?.nullability as string)||!['uuid','bits128'].includes(field?.scalarType??''))add('BINDING_DOMAIN',path,'Known singular available128-bit Field required');
    const c=row.carrier,known=c.kind==='words64'?['kind','highColumn','lowColumn','signed']:['kind','column'];unknown(c,known,path+'/carrier');
    if(!['native-uuid','bytes16','uuid-text','hex128-text','words64'].includes(c.kind))add('BINDING_UNKNOWN',path+'/carrier/kind','Unknown carrier retained','warning');
    if(['native-uuid','uuid-text'].includes(c.kind)&&field?.scalarType!=='uuid'||c.kind==='hex128-text'&&field?.scalarType!=='bits128')add('BINDING_DOMAIN',path,'Carrier does not match logical domain');
    columns=c.kind==='words64'?[c.highColumn,c.lowColumn]:'column'in c?[c.column]:[];
   }else{
    unknown(row,['module','element','field','storage','column','documentColumn','path'],path);
    columns=row.storage==='column'?[row.column!]:[row.documentColumn!];
    if(row.storage==='column'&&(!row.column||row.path!==undefined||row.documentColumn!==undefined)||row.storage==='embedded'&&(!row.documentColumn||!row.path?.length||row.column!==undefined))add('BINDING_PATH',path,'Malformed native storage declaration');
   }
   for(const col of columns){const slot=JSON.stringify([table,col]);if(slots.has(slot))add('BINDING_SLOT_COLLISION',path,'Physical slot reused');slots.add(slot);}
  }
  // Initial scalar-only profile must not silently certify unenforced index/relationship layouts.
  if(payload.indexes.length||payload.relationships.length)add('BINDING_UNQUALIFIED_LAYOUT','/indexes','Index and relationship carrier execution is not admitted; declarations remain retained','warning');
 }catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message);}
 return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
function locate(bindingInput:Document,logicalInput:Document,identity:{module:string;element:string}){
 const binding=copyJson(bindingInput) as unknown as Document,logical=copyJson(logicalInput) as unknown as Document;
 const validation=inspectBit128Binding(binding,logical);if(!validation.valid||!validation.complete)throw new UmfError('BINDING_DOCUMENT',JSON.stringify(validation.diagnostics));
 const id=copyJson(identity) as unknown as {module:string;element:string};
 if(!id||Object.keys(id).sort().join(',')!=='element,module')throw new UmfError('BINDING_IDENTITY','Exact Field identity required');
 const payload=copyJson(binding.extensions!['umf.binding']) as unknown as Bit128BindingPayload;
 const row=payload.fields.find(r=>r.module===id.module&&r.element===id.element);
 if(row?.storage!=='scalar-carrier')throw new UmfError('BINDING_CARRIER','Explicit scalar carrier required');
 return {row,logical,field:logical.modules.find(m=>m.id===id.module)!.elements.find(e=>e.id===id.element)!,id};
}
/** Pure carrier values only; does not execute a database or establish constraints. */
export function encodeBit128CarrierValue(binding:Document,logical:Document,identity:{module:string;element:string},literal:CoreLiteral):Record<string,string|null>{
 const {row,id,logical:source}=locate(binding,logical,identity),c=row.carrier,value=copyJson(literal) as unknown as CoreLiteral;
 if(!validateCoreFieldValue(source,id,value).valid)throw new UmfError('BINDING_VALUE','Invalid logical value');
 if(value===null)return c.kind==='words64'?{[c.highColumn]:null,[c.lowColumn]:null}:{[c.column]:null};
 const bits='uuid'in value?uuidToBits128(parseUuid(value.uuid)):'bits128Hex'in value?parseBits128(value.bits128Hex):undefined;
 if(!bits)throw new UmfError('BINDING_VALUE','Expected128-bit literal');
 if(c.kind==='words64'){const w=bits128ToWords(bits,c.signed);return {[c.highColumn]:w.high,[c.lowColumn]:w.low};}
 return {[c.column]:c.kind==='native-uuid'||c.kind==='uuid-text'?uuidFromBits128(bits).canonicalText:bits.hex};
}
export function decodeBit128CarrierValue(binding:Document,logical:Document,identity:{module:string;element:string},input:Record<string,string|null>):CoreLiteral{
 const {row,field,id,logical:source}=locate(binding,logical,identity),c=row.carrier,slots=copyJson(input) as Record<string,string|null>;
 const names=c.kind==='words64'?[c.highColumn,c.lowColumn]:[c.column];
 if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.keys(slots).length!==names.length||names.some(n=>!Object.hasOwn(slots,n)))throw new UmfError('BINDING_VALUE','Exact complete carrier slots required');
 const nulls=names.filter(n=>slots[n]===null).length;let literal:CoreLiteral;
 if(nulls){if(nulls!==names.length)throw new UmfError('BINDING_VALUE','Partial absent pair');literal=null;}
 else{
  let bits:Bit128Value;
  if(c.kind==='words64')bits=bits128FromWords({high:slots[c.highColumn]!,low:slots[c.lowColumn]!},c.signed);
  else if(c.kind==='native-uuid'||c.kind==='uuid-text')bits=uuidToBits128(parseUuid(slots[c.column]!));
  else bits=parseBits128(slots[c.column]!);
  literal=field.scalarType==='uuid'?{uuid:uuidFromBits128(bits).canonicalText}:{bits128Hex:bits.hex};
 }
 if(!validateCoreFieldValue(source,id,literal).valid)throw new UmfError('BINDING_VALUE','Decoded value violates Field');return literal;
}
