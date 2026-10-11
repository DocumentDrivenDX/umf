import {LIMITS, copyJson} from '../model/json';
import {schemaCoefficient} from '../model/schema-literals';
import {validateCoreFieldValue} from '../model/schema-properties';
import {UmfError, type Document} from '../model/types';

export type JavascriptNumericLiteral = {integerToken:string} | {decimalToken:string};
export interface JavascriptNumericContext {
  document: Document;
  field: {module:string; element:string};
}
function fail(message:string):never { throw new UmfError('JAVASCRIPT_NUMERIC', message); }

/** Normalize decimal value, without converting its coefficient to a host number. */
function decimalIdentity(token:string):string {
  if(typeof token!=='string')fail('Expected numeric token text');
  if(token.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Numeric token exceeds text limit');
  const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  if(!m || m[0]!==token)fail('Expected exact JSON numeric token');
  if((m[4]??'').length>32)throw new UmfError('LIMIT','Numeric exponent exceeds bounded domain');
  const digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');
  if(!digits)return m[1]+'0';
  const trimmed=digits.replace(/0+$/,'');
  const exponent=BigInt(m[4]??'0')-BigInt((m[3]??'').length)+BigInt(digits.length-trimmed.length);
  return m[1]+trimmed+'e'+exponent;
}

/** Exact decimal value of the supplied binary64 bits (including subnormals). */
function binaryIdentity(value:number):string {
  if(value===0)return Object.is(value,-0)?'-0':'0';
  const view=new DataView(new ArrayBuffer(8));
  view.setFloat64(0,value,false);
  const bits=view.getBigUint64(0,false), exponent=Number((bits>>52n)&2047n);
  let coefficient=bits&((1n<<52n)-1n);
  if(exponent)coefficient|=1n<<52n;
  const shift=exponent?exponent-1023-52:-1074;
  let scale=0;
  if(shift>=0)coefficient<<=BigInt(shift);
  else {scale=-shift;coefficient*=5n**BigInt(scale);}
  return decimalIdentity((value<0?'-':'')+coefficient+'e-'+scale);
}
function checked<T extends JavascriptNumericLiteral>(literal:T, context?:JavascriptNumericContext):T {
  if(context!==undefined){
    const request=copyJson(context) as unknown as JavascriptNumericContext;
    const validation=validateCoreFieldValue(request.document,request.field,literal);
    if(!validation.valid || !validation.complete)fail(JSON.stringify(validation.diagnostics));
  }
  return literal;
}
function readLiteral(input:JavascriptNumericLiteral):JavascriptNumericLiteral {
  const literal=copyJson(input) as unknown as JavascriptNumericLiteral;
  if(!literal || typeof literal!=='object' || Array.isArray(literal) || Object.keys(literal).length!==1)fail('Expected one numeric carrier');
  if('integerToken' in literal){decimalIdentity(literal.integerToken);schemaCoefficient(literal.integerToken,0);}
  else if('decimalToken' in literal)decimalIdentity(literal.decimalToken);
  else fail('Expected integerToken or decimalToken');
  return literal;
}

/** Exact text constructor. Spelling is retained; optional Field constraints are checked. */
export function exactDecimal(token:string, context?:JavascriptNumericContext):{decimalToken:string} {
  decimalIdentity(token);
  return checked({decimalToken:token},context);
}
export function integerFromBigInt(value:bigint, context?:JavascriptNumericContext):{integerToken:string} {
  if(typeof value!=='bigint')fail('Expected bigint');
  const token=value.toString();decimalIdentity(token);
  return checked({integerToken:token},context);
}
export function integerToBigInt(input:{integerToken:string}, context?:JavascriptNumericContext):bigint {
  const literal=readLiteral(input);
  if(!('integerToken' in literal))fail('Expected integerToken');
  if(decimalIdentity(literal.integerToken)==='-0')fail('bigint cannot preserve negative zero');
  checked(literal,context);
  return schemaCoefficient(literal.integerToken,0);
}
export function admitJavascriptNumber(value:number, scalarType:'integer'|'decimal', context?:JavascriptNumericContext):JavascriptNumericLiteral {
  if(typeof value!=='number' || !Number.isFinite(value) || Object.is(value,-0))fail('Expected finite number without negative zero');
  if(scalarType==='integer'){
    if(!Number.isSafeInteger(value))fail('Integer number must be safe');
    return checked({integerToken:String(value)},context);
  }
  if(scalarType!=='decimal')fail('Expected integer or decimal family');
  const token=String(value);
  if(decimalIdentity(token)!==binaryIdentity(value))fail('Number spelling changes its exact decimal value; supply an exact decimal token');
  return checked({decimalToken:token},context);
}
/** Lossless value conversion, not lexical recovery. The original carrier is untouched. */
export function numericToNumberLossless(input:JavascriptNumericLiteral, context?:JavascriptNumericContext):number {
  const literal=readLiteral(input);checked(literal,context);
  const token='integerToken' in literal?literal.integerToken:literal.decimalToken;
  const value=Number(token);
  if(!Number.isFinite(value) || Object.is(value,-0))fail('Number cannot preserve this value in the admitted profile');
  if('integerToken' in literal && !Number.isSafeInteger(value))fail('Integer number must be safe');
  if(decimalIdentity(token)!==binaryIdentity(value))fail('Number conversion would change the exact value');
  return value;
}
