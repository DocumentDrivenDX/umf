// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private meter around the Rust-owned literal validation and identity operation. */
import {UmfError,type Document,type Element} from '../../../model/types';
import {candidateLiteralFieldRef,inspectCandidateLiteral,checkCandidateLiteralReceipt,type CandidateLiteralOperation,type CandidateLiteralLimits} from '../candidate-literal-runtime';
export class ProtectionLiteralBudget {
 private work=0;private text=0;
 private prepared=new Map<Document,CandidateLiteralOperation>();
 /** An issued source owner may install its Rust snapshot without changing counters. */
 usePreparedSource(source:Document,operation:CandidateLiteralOperation){this.prepared.set(source,operation);}
 private inspect(source:Document,field:Element,value:unknown,limits:CandidateLiteralLimits){
  const operation=this.prepared.get(source),reference=candidateLiteralFieldRef(source,field);
  return operation?checkCandidateLiteralReceipt(operation(source,reference,value as any,limits),limits):inspectCandidateLiteral(source,reference,value as any,limits);
 }
 get remainingWork(){return 100_000-this.work;}
 get remainingText(){return 100_000-this.text;}
 step(units=1){this.work+=units;if(this.work>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: literal work exceeds100000 units');}
 reserveText(units:number):void{if(!Number.isSafeInteger(units)||units<0)throw new UmfError('PROTECTION_LITERAL_BOUND','Invalid retained text charge');this.text+=units;if(this.text>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: retained identity text exceeds100000 units');}
 retain(identity:string):string{this.reserveText(identity.length);return identity;}
 check(doc:Document,field:Element,value:unknown){
  const receipt=this.inspect(doc,field,value,{
   includeIdentity:false,workLimit:100_000-this.work,textLimit:100_000-this.text,
  });
  this.work+=receipt.workUnits;this.text+=receipt.textUnits;
 }
 identity(doc:Document,field:Element,value:unknown):string{
  const receipt=this.inspect(doc,field,value,{
   includeIdentity:true,workLimit:100_000-this.work,textLimit:100_000-this.text,
  });
  this.work+=receipt.workUnits;this.text+=receipt.textUnits;
  return receipt.identity!;
 }
}
