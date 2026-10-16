/** Declared protection obligations; never a native binding receipt or permission. */
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import {inspectSecurityActionPurposes} from '../action-purposes';
import type {SecurityActionPurposeDeclaration} from '../action-purpose-declarations';
import {validateProtectionParameters,type ProtectionParameterValidation} from './parameters';
export type ProtectionDeclarationObligationKind='hash-algorithm'|'salt-custody'|'dictionary-attack-warning'|'stored-custody'|'propagation'|'reverse-action'|'vault-write-action';
export interface ProtectionDeclarationObligation {
 transform:{id:string;version:string};kind:ProtectionDeclarationObligationKind;status:'unverified';declaration:Json;
}
export interface ProtectionDeclarationInspection extends Omit<ProtectionParameterValidation,'status'|'validated'> {
 status:'declared-obligations'|'refused';ontology:Json;purposes:readonly SecurityActionPurposeDeclaration[];
 obligations:readonly ProtectionDeclarationObligation[];
}
const sameRef=(a:any,b:any)=>['documentId','moduleId','elementId'].every(k=>a?.[k]===b?.[k]);
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
const fail=(message:string):never=>{throw new UmfError('PROTECTION_DECLARATIONS',message);};
/** Source declaration consistency only. Every reported enforcement obligation stays unverified. */
export function inspectProtectionObligations(policy:unknown,catalog:unknown,closure:unknown,ontologyInput:unknown):ProtectionDeclarationInspection{
 const source=validateProtectionParameters(policy,catalog,closure),cl=source.closure as any;
 const action=inspectSecurityActionPurposes(ontologyInput,cl?.documents??null),diagnostics:Diagnostic[]=[...source.diagnostics,...action.diagnostics];
 const obligations:ProtectionDeclarationObligation[]=[];
 const finish=(success:boolean):ProtectionDeclarationInspection=>{if(!success)obligations.length=0;return freeze({status:success?'declared-obligations':'refused',complete:false,authority:false,policy:source.policy,catalog:source.catalog,closure:source.closure,ontology:action.ontology,purposes:action.purposes,obligations,diagnostics});};
 if(source.status==='refused'||action.status==='refused')return finish(false);
 try{
  const p=source.policy as any,c=source.catalog as any,o=action.ontology as any;
  if(p.ontology.documentId!==o.documentId||p.ontology.revision!==o.revision)fail('Exact policy ontology document/revision pin required');
  const purposes=new Map(action.purposes.map(e=>[e.action,e.purposes]));
  for(const rule of p.rules)for(const id of rule.actions)if(!purposes.has(id))fail('Every policy action must belong to the source-owned ontology action universe');
  const role=(id:string,expected:string)=>{const found=purposes.get(id);if(!found||found.length!==1||found[0]!==expected)fail('Exact separately purposed '+expected+' action required');};
  const transforms=new Map<string,any>(c.transforms.map((t:any)=>[JSON.stringify([t.id,t.version]),t]));
  for(const rule of p.rules)for(const entry of rule.disclosure??[]){
   const d=entry.disposition;if(d.kind!=='transformed'||d.vocabulary!=='umf.security.protection')continue;
   const t=transforms.get(JSON.stringify([d.transform,d.version]));
   if(!t||!sameRef(entry.field,t.inputDomain)||!sameRef(d.field,t.outputDomain))fail('Exact selected policy input/output transform domains required');
  }
  for(const t of c.transforms){
   const add=(kind:ProtectionDeclarationObligationKind,declaration:Json)=>obligations.push({transform:{id:t.id,version:t.version},kind,status:'unverified',declaration});
   if(t.kind==='hash'){
    add('hash-algorithm',{algorithm:t.algorithm});add('salt-custody',t.saltCustody);
    if(t.saltCustody.kind==='none'){
     if(!['deterministic','keyed-deterministic'].includes(t.determinism)&&!t.disclosureProfile.includes('equality'))fail('Unsalted hash requires retained effective equality');
     add('dictionary-attack-warning',{code:'UNSALTED_HASH_DICTIONARY_ATTACK',warning:'Unsalted hashes expose equality and need assessment for dictionary attacks; no algorithm or custody enforcement is verified.'});
    }
   }
   if(t.custody){
    add('stored-custody',t.custody);
    for(const channel of ['history','snapshots','exports','feeds','caches'])add('propagation',{channel,declaration:t.custody.propagation[channel]});
    if(t.custody.vaultWriteAction!==undefined){role(t.custody.vaultWriteAction,'vault-write');add('vault-write-action',{action:t.custody.vaultWriteAction});}
   }
   if(['keyed','vault'].includes(t.reversibility)){role(t.reverseAction,'reverse');add('reverse-action',{action:t.reverseAction,reversibility:t.reversibility});}
   else if(t.reverseAction!==undefined)fail('Reverse action contradicts non-reversing declaration');
  }
  diagnostics.push({code:'PROTECTION_OBLIGATIONS_UNVERIFIED',path:'',severity:'warning',message:'Declared and preserved; enforcement unqualified. No operation-owner route compatibility, source authenticity, algorithm execution, current permission or native vault/key custody verified.'});
  return finish(true);
 }catch(error){if(!(error instanceof UmfError))throw error;diagnostics.push({code:error.code,path:error.path,message:error.message,severity:'error'});return finish(false);}
}
