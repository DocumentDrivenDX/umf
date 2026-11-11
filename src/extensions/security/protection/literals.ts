// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private meter around the Rust-owned literal validation and identity operation. */
import {UmfError,type Document,type Element} from '../../../model/types';
import {candidateLiteralFieldRef,inspectCandidateLiteral} from '../candidate-literal-runtime';
export class ProtectionLiteralBudget {
 private work=0;private text=0;
 step(units=1){this.work+=units;if(this.work>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: literal work exceeds100000 units');}
 reserveText(units:number):void{if(!Number.isSafeInteger(units)||units<0)throw new UmfError('PROTECTION_LITERAL_BOUND','Invalid retained text charge');this.text+=units;if(this.text>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: retained identity text exceeds100000 units');}
 retain(identity:string):string{this.reserveText(identity.length);return identity;}
 check(doc:Document,field:Element,value:unknown){
  const receipt=inspectCandidateLiteral(doc,candidateLiteralFieldRef(doc,field),value as any,{
   includeIdentity:false,workLimit:100_000-this.work,textLimit:100_000-this.text,
  });
  this.work+=receipt.workUnits;this.text+=receipt.textUnits;
 }
 identity(doc:Document,field:Element,value:unknown):string{
  const receipt=inspectCandidateLiteral(doc,candidateLiteralFieldRef(doc,field),value as any,{
   includeIdentity:true,workLimit:100_000-this.work,textLimit:100_000-this.text,
  });
  this.work+=receipt.workUnits;this.text+=receipt.textUnits;
  return receipt.identity!;
 }
}
