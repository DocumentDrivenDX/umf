/** Private metering around the original core literal semantics. */
import {checkSchemaLiteralTracked,literalIdentity,type CoreLiteral} from '../../../model/schema-literals';
import {UmfError,type Document,type Element} from '../../../model/types';
export class ProtectionLiteralBudget {
 private work=0;private text=0;
 step(units=1){this.work+=units;if(this.work>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: literal work exceeds100000 units');}
 retain(identity:string):string{this.text+=identity.length;if(this.text>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: retained identity text exceeds100000 units');return identity;}
 private numeric(field:Element,value:CoreLiteral){
  if(value===null||typeof value!=='object')return;
  const token=(value as any)[field.scalarType==='decimal'?'decimalToken':'integerToken'];
  if(typeof token!=='string'){for(const v of Object.values(value))if(typeof v==='string')this.step(v.length);if((value as any).map)for(const key of Object.keys((value as any).map))this.step(key.length);return;}this.step(token.length);
  const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  if(!m||m[0]!==token)return;
  const digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');if(!digits){if(++this.text>100_000)throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: normalized coefficient text exceeds100000 units');return;}
  const exponent=m[4]??'0';if(exponent.length>32)return; // original core refusal, no expansion
  const scale=field.scalarType==='decimal'?(field.facets as any)?.scale:0;
  if(!Number.isSafeInteger(scale))return;
  const shift=BigInt(exponent)-BigInt((m[3]??'').length)+BigInt(scale);
  const size=shift>=0n?BigInt(digits.length)+shift:BigInt(digits.length);
  if(size>BigInt(100_000-this.text))throw new UmfError('PROTECTION_LITERAL_BOUND','resource-exhausted: normalized coefficient text exceeds100000 units');
  this.text+=Number(size);
 }
 check(doc:Document,field:Element,value:CoreLiteral){
  checkSchemaLiteralTracked(doc,field,value,(_doc,f,v)=>{
   this.step();this.numeric(f,v);if((f.facets as any)?.integerWidth)this.numeric(f,v);
   const facets=f.facets as any;
   for(const bound of [facets?.range?.min,facets?.range?.max])if(bound!==undefined){this.step();this.numeric(f,bound);this.numeric(f,v);}
   for(const candidate of (f.allowedValues??[]) as CoreLiteral[]){this.step();this.numeric(f,candidate);this.numeric(f,v);}
  });
 }
 identity(doc:Document,field:Element,value:CoreLiteral):string{
  this.check(doc,field,value);this.numeric(field,value);this.step();
  return this.retain(literalIdentity(field,value));
 }
}
