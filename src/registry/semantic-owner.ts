// SPDX-License-Identifier: MIT OR Apache-2.0
import type {SemanticValidator} from './registry';

export interface SemanticOwnerIdentity {readonly id:string;readonly version:string}
export interface SemanticValidatorComposition {
 readonly owner:SemanticOwnerIdentity;
 readonly native:SemanticValidator;
 readonly callers:readonly SemanticValidator[];
}
const compositions=new WeakMap<SemanticValidator,SemanticValidatorComposition>();

/** Compose retained caller checks around a native semantic owner without coupling Registry to an ecosystem package. */
export function composeOwnedSemanticValidator(owner:SemanticOwnerIdentity,native:SemanticValidator,callers:readonly SemanticValidator[]=[]):SemanticValidator {
 const identity=Object.freeze({id:owner.id,version:owner.version});
 const retained=[...new Set(callers)];
 const combined:SemanticValidator=(payload,context)=>[
  ...retained.flatMap(callback=>callback(payload,context)),
  ...native(payload,context),
 ];
 compositions.set(combined,Object.freeze({owner:identity,native,callers:Object.freeze(retained)}));
 return combined;
}
export function semanticValidatorComposition(value:SemanticValidator|undefined):SemanticValidatorComposition|undefined {
 if(!value)return undefined;
 const composition=compositions.get(value);
 return composition?{owner:composition.owner,native:composition.native,callers:[...composition.callers]}:undefined;
}
export function semanticOwnerMatches(composition:SemanticValidatorComposition|undefined,owner:SemanticOwnerIdentity):boolean {
 return composition?.owner.id===owner.id&&composition.owner.version===owner.version;
}
