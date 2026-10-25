// SPDX-License-Identifier: MIT OR Apache-2.0
/** One-shot reuse of a complete, metered source recompilation inside G10 admission. */
import {canonicalCharged} from '../compilation/bundle/hash';
import {verifyTableDeploymentWithAccounting,type TableDeploymentBundle} from '../table-deployment';
import type {AccountingContext} from '../model/internal/accounting-context';

type VerifiedDeployment=ReturnType<typeof verifyTableDeploymentWithAccounting>;
const completed=new WeakMap<object,{accounting:AccountingContext;result:VerifiedDeployment}>();

/** Store only after the original verifier has completed every source and equality check. */
export function verifyAndRememberG10Deployment(input:TableDeploymentBundle,accounting:AccountingContext):TableDeploymentBundle{
 const result=verifyTableDeploymentWithAccounting(input,accounting);
 completed.set(result.bundle,{accounting,result});
 return result.bundle;
}

/** Consume once, for the exact validated bundle and same meter; changed bytes refuse. */
export function consumeVerifiedG10Deployment(input:TableDeploymentBundle,accounting:AccountingContext,path:string):VerifiedDeployment|undefined{
 const result=completed.get(input);
 if(!result)return undefined;
 if(result.accounting!==accounting)return undefined;
 completed.delete(input);
 if(canonicalCharged(input,accounting,`${path}/verified-input`)!==result.result.inputCanonical)throw new Error(`R2_VERIFIED_BUNDLE_CHANGED:${path}`);
 return result.result;
}
