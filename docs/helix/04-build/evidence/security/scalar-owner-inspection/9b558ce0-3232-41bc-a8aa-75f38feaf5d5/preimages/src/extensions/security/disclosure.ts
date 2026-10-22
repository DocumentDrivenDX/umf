import {copyJson} from '../../model/json';
import {checkSchemaLiteral} from '../../model/schema-literals';
import {UmfError} from '../../model/types';
import {requireSecurityInterpretation,readSecuritySource,writeSecuritySource} from './policy';
import {securityRefIdentity as id,type SecurityRef,type SecurityPolicy,type SecurityResolution} from './types';
import type {SecurityOutput} from './evaluate';

export interface SecurityDisclosureBatch {
  version:'umf.security.disclosure/0.1.0';
  target:SecurityRef;fields:SecurityRef[];rows:SecurityOutput[][];
}
const fail=():never=>{throw new UmfError('SECURITY_DISCLOSURE','Invalid or unsupported disclosure transport');};
const members=(value:unknown,keys:string[])=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();
};
const ref=(value:SecurityRef)=>{
  members(value,['documentId','moduleId','elementId']);
  if(Object.values(value).some(v=>typeof v!=='string'||!v.length||v.length>4096))fail();
  return id(value);
};
/** Shape/domain validation only. Transport, pins and dispositions do not authenticate or authorize a result. */
export function validateSecurityDisclosure(input:unknown,policyInput:SecurityPolicy,resolutionInput:SecurityResolution):SecurityDisclosureBatch {
  try{
    const inspected=requireSecurityInterpretation(policyInput,resolutionInput);
    const resolution=inspected.resolution as unknown as SecurityResolution;
    const batch=copyJson(input) as unknown as SecurityDisclosureBatch;
    members(batch,['version','target','fields','rows']);
    if(batch.version!=='umf.security.disclosure/0.1.0')fail();
    const target=[...resolution.ontology.entities,...resolution.ontology.associations].find(t=>id(t.type)===ref(batch.target))??fail();
    if(!Array.isArray(batch.fields)||batch.fields.length>256||!Array.isArray(batch.rows)||batch.rows.length>4096||batch.rows.length*batch.fields.length>16384)fail();
    const selected=batch.fields.map(ref);
    if(new Set(selected).size!==selected.length||selected.some(r=>!target.fields.some(f=>id(f.ref)===r)))fail();
    const field=(r:SecurityRef)=>{
      ref(r);
      const doc=resolution.documents.find(d=>d.document.id===r.documentId)?.document??fail();
      const definition=doc.modules.find(m=>m.id===r.moduleId)?.elements.find(e=>e.id===r.elementId)??fail();
      if(definition.kind!=='field')fail();
      return {doc,definition};
    };
    for(const row of batch.rows){
      if(!Array.isArray(row)||row.length!==selected.length)fail();
      row.forEach((cell,i)=>{
        if(!cell||typeof cell!=='object'||ref(cell.field)!==selected[i])fail();
        if(cell.disposition==='withheld'){members(cell,['field','disposition']);return;}
        if(cell.disposition==='absent'){
          members(cell,['field','disposition']);if(field(cell.field).definition.nullability!=='absent-allowed')fail();return;
        }
        if(cell.disposition!=='original'&&cell.disposition!=='transformed')fail();
        members(cell,cell.disposition==='original'?['field','disposition','value']:['field','disposition','outputType','value']);
        const {doc,definition}=field(cell.disposition==='transformed'?cell.outputType:cell.field);
        if('value' in cell)checkSchemaLiteral(doc,definition,cell.value);else fail();
      });
    }
    return batch;
  }catch{ return fail(); }
}
export const encodeSecurityDisclosure=(input:SecurityDisclosureBatch,policy:SecurityPolicy,resolution:SecurityResolution):string=>
  writeSecuritySource(validateSecurityDisclosure(input,policy,resolution));
export function decodeSecurityDisclosure(text:string,policy:SecurityPolicy,resolution:SecurityResolution):SecurityDisclosureBatch {
  try{return validateSecurityDisclosure(readSecuritySource(text),policy,resolution);}catch{return fail();}
}
