// SPDX-License-Identifier: MIT OR Apache-2.0
import type {SemanticValidator} from '../../registry/registry';

interface ActionSemanticParts {native:SemanticValidator;callers:SemanticValidator[]}
const owners=new WeakMap<SemanticValidator,ActionSemanticParts>();
export function composeRustOwnedActionSemanticValidator(native:SemanticValidator,callers:readonly SemanticValidator[]=[]):SemanticValidator {
 const retained=[...new Set(callers)];
 const combined:SemanticValidator=(payload,context)=>[
  ...retained.flatMap(callback=>callback(payload,context)),
  ...native(payload,context),
 ];
 owners.set(combined,{native,callers:retained});
 return combined;
}
export function actionSemanticParts(value:SemanticValidator|undefined):{native?:SemanticValidator;callers:SemanticValidator[]} {
 if(!value)return {callers:[]};
 const parts=owners.get(value);
 return parts?{native:parts.native,callers:[...parts.callers]}:{callers:[value]};
}
export function actionCallerSemanticValidator(value:SemanticValidator|undefined):SemanticValidator|undefined {
 const callers=actionSemanticParts(value).callers;
 if(!callers.length)return undefined;
 return (payload,context)=>callers.flatMap(callback=>callback(payload,context));
}
export function isRustOwnedActionSemanticValidator(value:SemanticValidator|undefined):boolean {return value!==undefined&&owners.has(value);}
