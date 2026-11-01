// SPDX-License-Identifier: MIT OR Apache-2.0
import type {SemanticValidator} from '../../registry/registry';
import {composeOwnedSemanticValidator,semanticOwnerMatches,semanticValidatorComposition,type SemanticOwnerIdentity} from '../../registry/semantic-owner';

export function composeRustOwnedActionSemanticValidator(owner:SemanticOwnerIdentity,native:SemanticValidator,callers:readonly SemanticValidator[]=[]):SemanticValidator {
 return composeOwnedSemanticValidator(owner,native,callers);
}
export function actionSemanticParts(value:SemanticValidator|undefined,owner:SemanticOwnerIdentity):{native?:SemanticValidator;callers:SemanticValidator[]} {
 if(!value)return {callers:[]};
 const parts=semanticValidatorComposition(value);
 return parts&&semanticOwnerMatches(parts,owner)?{native:parts.native,callers:[...parts.callers]}:{callers:[value]};
}
export function actionCallerSemanticValidator(value:SemanticValidator|undefined,owner:SemanticOwnerIdentity):SemanticValidator|undefined {
 // Only the Action package's own callback is replaced by the native Action owner.
 // Other native-owner callbacks remain explicit capabilities in reduced registries.
 const isActionOwner=owner.id==='umf.actions'&&owner.version==='0.1.0';
 const callers=isActionOwner?actionSemanticParts(value,owner).callers:value?[value]:[];
 if(!callers.length)return undefined;
 return (payload,context)=>callers.flatMap(callback=>callback(payload,context));
}
export function isRustOwnedActionSemanticValidator(value:SemanticValidator|undefined,owner:SemanticOwnerIdentity):boolean {
 return semanticOwnerMatches(semanticValidatorComposition(value),owner);
}
