/** Internal consistency over copied source, never an operational action designation. */
import {UmfError} from '../../model/types';
export const SECURITY_ACTION_PURPOSES=Object.freeze(['read','field','original-authorized','reverse','vault-write','other'] as const);
export type SecurityActionPurpose=typeof SECURITY_ACTION_PURPOSES[number];
export interface SecurityActionPurposeDeclaration {action:string;purposes:SecurityActionPurpose[]}
const fail=():never=>{throw new UmfError('SECURITY_ACTION_PURPOSES','Complete exact known action-purpose closure required');};
/** Older draft sources may omit the member. A new purpose inspector may not. */
export function checkActionPurposeDeclarations(ontology:any):SecurityActionPurposeDeclaration[]|undefined{
 if(!Object.hasOwn(ontology,'actionPurposes'))return undefined;
 const entries=ontology.actionPurposes,actions=ontology.actions;
 if(!Array.isArray(entries)||entries.length<1||entries.length>256||!Array.isArray(actions)||actions.length<1||actions.length>256)fail();
 const universe=new Set<string>();
 for(const action of actions){if(typeof action!=='string'||!action.length||action.length>4096||universe.has(action))fail();universe.add(action);}
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).length!==2||!Object.hasOwn(entry,'action')||!Object.hasOwn(entry,'purposes')||!universe.delete(entry.action))fail();
  const values=entry.purposes;
  if(!Array.isArray(values)||values.length<1||values.length>6||new Set(values).size!==values.length||values.some((v:any)=>!SECURITY_ACTION_PURPOSES.includes(v)))fail();
  if(values.some((v:any)=>['reverse','vault-write','other'].includes(v))&&values.length!==1)fail();
 }
 if(universe.size)fail();return entries;
}
