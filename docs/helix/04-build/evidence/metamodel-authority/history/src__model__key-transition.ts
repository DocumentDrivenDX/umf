import {copyJson} from './json';
import {UmfError,type Document,type Module,type Json} from './types';
import {validateDocument} from '../validation/document';
import {validateKeyCandidate} from '../validation/keys';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/facet-document.schema.json';
import candidate from '../../spec/core/key-document.schema.json';
import schema from '../../spec/core/key-transition.schema.json';
export interface KeyCandidateDocument {
 umf:'0.6.0';id:string;vocabularies:Document['vocabularies'];modules:Module[];
 extensions?:Record<string,Json>;[key:string]:unknown;
}
const reason='Legacy key, keys and members are opaque; no ownership or identity inferred' as const;
export interface KeyUpgradeReceipt {operation:'upgrade-key-envelope';version:'1.0.0';source:Document;target:KeyCandidateDocument;residuals:{path:string;value:Json;reason:typeof reason}[]}
export interface KeyRollbackReceipt {operation:'rollback-key-envelope';version:'1.0.0';source:KeyCandidateDocument;target:Document;receipt:KeyUpgradeReceipt;reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(candidate);const check=validator.compile(schema);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
function finish<T>(value:T):T{
 const copied=copyJson(value);if(!check(copied))throw new UmfError('KEY_TRANSITION_RESULT',JSON.stringify(check.errors));return copied as T;
}
/** Explicit opt-in: every element collision is archived, even if it looks like a valid key or membership assertion. */
export function upgradeKeyEnvelope(input:Document):KeyUpgradeReceipt{
 const source=copyJson(input) as unknown as Document;
 if(!validateDocument(source).valid||source.umf!=='0.5.0')throw new UmfError('KEY_TRANSITION_INPUT','Expected valid 0.5.0 envelope');
 const target=copyJson(source) as unknown as KeyCandidateDocument;target.umf='0.6.0';const residuals:KeyUpgradeReceipt['residuals']=[];
 target.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{
  for(const name of ['key','keys','members'])if(Object.hasOwn(e,name)){
   residuals.push({path:`/modules/${mi}/elements/${ei}/${name}`,value:copyJson(e[name]),reason});delete e[name];
  }
 }));
 const validation=validateKeyCandidate(target);if(!validation.valid)throw new UmfError('KEY_TRANSITION_TARGET',JSON.stringify(validation.diagnostics));
 return finish({operation:'upgrade-key-envelope',version:'1.0.0',source,target,residuals});
}
/** Source consistency, not authentication. Later assertions stay in the separately retained current envelope. */
export function rollbackKeyEnvelope(input:KeyUpgradeReceipt,current:KeyCandidateDocument):KeyRollbackReceipt{
 const receipt=copyJson(input) as unknown as KeyUpgradeReceipt;
 if(!check(receipt)||receipt.operation!=='upgrade-key-envelope')throw new UmfError('KEY_TRANSITION_RECEIPT','Malformed Key upgrade receipt');
 const expected=upgradeKeyEnvelope(receipt.source);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('KEY_TRANSITION_RECEIPT','Receipt conflicts with its retained source');
 const source=copyJson(current) as unknown as KeyCandidateDocument;
 if(!validateKeyCandidate(source).valid||source.umf!=='0.6.0')throw new UmfError('KEY_TRANSITION_CURRENT','Expected valid current 0.6.0 candidate');
 if(source.id!==receipt.target.id)throw new UmfError('KEY_TRANSITION_ID','Current document identity differs from upgrade');
 return finish({operation:'rollback-key-envelope',version:'1.0.0',source,target:receipt.source,receipt,reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'});
}
