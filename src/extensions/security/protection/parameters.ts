// SPDX-License-Identifier: MIT OR Apache-2.0
import {ProtectionFieldIndex} from './core-fields';
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import {resolveSecurityProtectionDomains,type SecurityProtectionDomainResolution,type ProtectionCoreClosure} from './domains';
import {ProtectionLiteralBudget} from './literals';
export interface ProtectionParameterValidation extends Omit<SecurityProtectionDomainResolution,'status'|'domains'> {
 status:'validated-parameters'|'refused';validated:readonly {path:string;transformIndex:number}[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
export function protectionFieldIndex(closure:Json):ProtectionFieldIndex{return new ProtectionFieldIndex(closure as unknown as ProtectionCoreClosure);}
export function validateProtectionParameters(policy:unknown,catalog:unknown,closure:unknown):ProtectionParameterValidation {
 return checkProtectionParametersWithinBudget(policy,catalog,closure,new ProtectionLiteralBudget());
}
/** Internal composition only; the public entry always creates a private budget. */
export function checkProtectionParametersWithinBudget(policy:unknown,catalog:unknown,closure:unknown,budget:ProtectionLiteralBudget):ProtectionParameterValidation {
 const domains=resolveSecurityProtectionDomains(policy,catalog,closure),diagnostics:Diagnostic[]=[...domains.diagnostics];
 const validated:{path:string;transformIndex:number}[]=[];
 const finish=(status:ProtectionParameterValidation['status'])=>{if(status==='refused')validated.length=0;return freeze<ProtectionParameterValidation>({status,complete:false,authority:false,policy:domains.policy,catalog:domains.catalog,closure:domains.closure,validated,diagnostics});};
 if(domains.status==='refused')return finish('refused');
 const index=protectionFieldIndex(domains.closure);let exhausted=false;
 const check=(constant:any,path:string,transformIndex:number)=>{
  if(exhausted)return;
  const resolved=index.get(constant.field);
  if(!resolved)throw new UmfError('PROTECTION_PARAMETER_FIELD','Qualified parameter Field missing',path);
  try{budget.check(resolved.doc,resolved.field,constant.value);validated.push({path,transformIndex});}
  catch(error){if(!(error instanceof UmfError))throw error;if(error.code==='PROTECTION_LITERAL_BOUND')exhausted=true;diagnostics.push({code:error.code,path:path+(error.path??''),message:error.message,severity:'error'});}
 };
 (domains.catalog as any).transforms.forEach((t:any,i:number)=>{
  t.parameters.forEach((p:any,j:number)=>check(p,`/transforms/${i}/parameters/${j}`,i));
  t.disclosureProfile.forEach((p:any,j:number)=>{if(p!==null&&typeof p==='object'&&p.kind==='range')check(p.bucket,`/transforms/${i}/disclosureProfile/${j}/bucket`,i);});
 });
 diagnostics.push({code:'PROTECTION_PARAMETERS_ONLY',path:'',severity:'warning',message:'Typed declaration values only; function arity/names, domain compatibility, output behavior and authority remain separate'});
 return finish(diagnostics.some(d=>d.severity==='error')?'refused':'validated-parameters');
}
