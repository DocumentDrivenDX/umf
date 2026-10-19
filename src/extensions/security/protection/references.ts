// SPDX-License-Identifier: MIT OR Apache-2.0
/** Exact source addresses only; matching labels never qualifies a domain or action. */
import {inspectSecurityPolicyV2Source} from '../policy-representation-v2';
import {inspectProtectionCatalog} from './catalog';
import type {Json,Diagnostic} from '../../../model/types';
export interface SecurityProtectionSourceResolution {
 status:'resolved-source'|'refused';complete:false;authority:false;policy:Json;catalog:Json;
 references:readonly {ruleIndex:number;disclosureIndex:number;transformIndex:number}[];
 diagnostics:readonly Diagnostic[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
export function resolveSecurityProtectionSources(policyInput:unknown,catalogInput:unknown):SecurityProtectionSourceResolution {
 const policy=inspectSecurityPolicyV2Source(policyInput),catalog=inspectProtectionCatalog(catalogInput);
 const diagnostics:Diagnostic[]=[...policy.diagnostics,...catalog.diagnostics];
 const references:SecurityProtectionSourceResolution['references'][number][]=[];
 const finish=(status:'resolved-source'|'refused')=>freeze<SecurityProtectionSourceResolution>({status,complete:false,authority:false,policy:policy.source,catalog:catalog.source,references,diagnostics});
 if(!policy.valid||!catalog.valid)return finish('refused');
 const p=policy.source as any,c=catalog.source as any;
 if(!p.protection||p.protection.id!==c.id||p.protection.revision!==c.revision){diagnostics.push({code:'SECURITY_PROTECTION_PIN',path:'/protection',message:'Exact catalog id/revision required',severity:'error'});return finish('refused');}
 const entries=new Map<string,number>(c.transforms.map((t:any,index:number)=>[JSON.stringify([t.id,t.version]),index]));
 p.rules.forEach((rule:any,i:number)=>(rule.disclosure??[]).forEach((entry:any,j:number)=>{
  const disposition=entry.disposition;
  if(disposition.kind!=='transformed'||disposition.vocabulary!=='umf.security.protection')return;
  const transform=entries.get(JSON.stringify([disposition.transform,disposition.version]));
  if(transform===undefined)diagnostics.push({code:'SECURITY_PROTECTION_REFERENCE',path:`/rules/${i}/disclosure/${j}/disposition`,message:'Exact transform id/version missing',severity:'error'});
  else references.push({ruleIndex:i,disclosureIndex:j,transformIndex:transform});
 }));
 if(diagnostics.some(d=>d.severity==='error')){references.length=0;return finish('refused');}
 return finish('resolved-source');
}
