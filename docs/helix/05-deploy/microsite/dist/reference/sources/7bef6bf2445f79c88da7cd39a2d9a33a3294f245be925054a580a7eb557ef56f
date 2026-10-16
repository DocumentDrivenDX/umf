/** Explicit semantic embedding of the legacy body subset; never a native admission. */
import {copyJson} from '../../model/json';
import type {Json,Diagnostic} from '../../model/types';
import {inspectSecurityPolicyV2Source} from './policy-representation-v2';
import {inspectSecurityPolicy} from './policy';
import {evaluateSecurityAccess,type SecurityAccessResult,type SecurityFactCut,type SecurityEvaluationRequest,type SecurityFact} from './evaluate';
import type {SecurityPolicy,SecurityResolution} from './types';

export interface SecurityPolicyV2LegacyAccess {
 source:Json;subset:'legacy-body-0.1';authority:false;
 result:SecurityAccessResult;diagnostics:readonly Diagnostic[];
}
function freeze<T>(value:T):T {
 if(value!==null&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;
}
/** Logical single-resource access evaluation only. Host cuts must name the original0.2 policy revision.
 * No catalog, new relationship grammar, unknown meaning or native authority is admitted.
 */
export function evaluateSecurityPolicyV2LegacyAccess(input:unknown,resolution:SecurityResolution,cut:SecurityFactCut,
 request:Omit<SecurityEvaluationRequest,'resources'>,resource:SecurityFact):SecurityPolicyV2LegacyAccess {
 const inspected=inspectSecurityPolicyV2Source(input);
 const diagnostics=inspected.diagnostics.filter(d=>d.code!=='SECURITY_V2_UNIMPLEMENTED');
 const finish=(result:SecurityAccessResult)=>freeze({source:inspected.source,subset:'legacy-body-0.1' as const,authority:false as const,result,diagnostics});
 const refuse=()=>finish({decision:'indeterminate',output:[]});
 if(!inspected.valid||diagnostics.length)return refuse();
 const source=inspected.source as Record<string,Json>;
 if(Object.hasOwn(source,'protection')){
  diagnostics.push({code:'SECURITY_V2_LEGACY_SUBSET',path:'/protection',severity:'error',message:'Protection pin requires separate domain/function interpretation'});return refuse();
 }
 // Private semantic view only: revision and every body member stay unchanged.
 // This view is never returned, installed, or used to refresh host attestations.
 const view=copyJson({...source,version:'0.1.0'}) as unknown as SecurityPolicy;
 const legacy=inspectSecurityPolicy(view,resolution);
 diagnostics.push(...legacy.diagnostics);
 if(!legacy.valid||!legacy.complete)return refuse();
 return finish(evaluateSecurityAccess(view,resolution,cut,request,resource));
}
