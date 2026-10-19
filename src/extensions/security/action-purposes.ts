// SPDX-License-Identifier: MIT OR Apache-2.0
/** Draft ontology purpose declarations only; never permission or route completeness. */
import {copyJson} from '../../model/json';
import {UmfError,type Json,type Diagnostic} from '../../model/types';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';
import {checkActionPurposeDeclarations,type SecurityActionPurposeDeclaration} from './action-purpose-declarations';
export interface SecurityActionPurposeInspection {
 status:'resolved-purposes'|'refused';ontology:Json;documents:Json;
 purposes:readonly SecurityActionPurposeDeclaration[];complete:false;authority:false;diagnostics:readonly Diagnostic[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
function bounded(v:Json):void{
 let text=0;const pending=[v];
 while(pending.length){const value=pending.pop()!;if(typeof value==='string')text+=value.length;else if(value!==null&&typeof value==='object'){if(Array.isArray(value)){for(const child of value)pending.push(child);}else for(const [key,child] of Object.entries(value)){text+=key.length;pending.push(child);}}
  if(text>4_000_000)throw new UmfError('SECURITY_ACTION_PURPOSE_BOUND','resource-exhausted: source key/string text exceeds4000000 UTF-16 units');
 }
}
export function inspectSecurityActionPurposes(ontologyInput:unknown,documentsInput:unknown):SecurityActionPurposeInspection{
 let ontology:Json=null,documents:Json=null;const diagnostics:Diagnostic[]=[];const purposes:SecurityActionPurposeDeclaration[]=[];
 const finish=(success:boolean):SecurityActionPurposeInspection=>{if(!success)purposes.length=0;return freeze({status:success?'resolved-purposes':'refused',ontology,documents,purposes,complete:false,authority:false,diagnostics});};
 try{
  const packet=copyJson({ontology:ontologyInput,documents:documentsInput}) as {ontology:Json;documents:Json};ontology=packet.ontology;documents=packet.documents;bounded(packet);
  const resolved=resolveCandidateSecurityOntology(ontology,documents),entries=checkActionPurposeDeclarations(resolved.ontology);
  if(!entries)throw new UmfError('SECURITY_ACTION_PURPOSES','Missing source-owned complete purpose closure');
  purposes.push(...entries);diagnostics.push({code:'SECURITY_ACTION_PURPOSE_DECLARATIONS_ONLY',path:'',severity:'warning',message:'Authored classifications only; actual owner-profile compatibility, route completeness, policy grants and native/current authority remain separate'});return finish(true);
 }catch(error){
  if(!(error instanceof Error))throw error;
  diagnostics.push({code:error instanceof UmfError?error.code:'SECURITY_ACTION_PURPOSES',path:error instanceof UmfError?error.path:'',message:error.message,severity:'error'});return finish(false);
 }
}
