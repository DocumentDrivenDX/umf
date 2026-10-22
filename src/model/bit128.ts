// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from './types';

export const BIT128_PROFILE='umf-128/1' as const;
export interface Bit128Value {readonly profile:typeof BIT128_PROFILE;readonly hex:string}
const MOD64=1n<<64n,MOD128=1n<<128n;
function fail(code:string,message:string):never{throw new UmfError('BIT128_'+code,message);}
function signedOption(value:boolean):void{if(typeof value!=='boolean')fail('TYPE','Signedness must be explicit');}
export function parseBits128(hex:string):Bit128Value{
 if(typeof hex!=='string')fail('TYPE','Expected hexadecimal text');
 if(hex.length!==32||!/^[0-9a-fA-F]{32}$(?![\s\S])/.test(hex))fail('SYNTAX','Expected exactly 32 hexadecimal digits');
 return Object.freeze({profile:BIT128_PROFILE,hex:hex.toLowerCase()});
}
function checked(value:Bit128Value):Bit128Value{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).length!==2||Object.getOwnPropertyNames(value).length!==2||Object.getOwnPropertySymbols(value).length||!Object.hasOwn(value,'profile')||!Object.hasOwn(value,'hex'))fail('VALUE','Invalid bit value snapshot');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(!('value'in descriptors.profile!)||!('value'in descriptors.hex!))fail('VALUE','Accessors are not value snapshots');
 if(descriptors.profile!.value!==BIT128_PROFILE)fail('VALUE','Unknown bit profile');
 if(typeof descriptors.hex!.value!=='string'||!(/^[0-9a-f]{32}$(?![\s\S])/).test(descriptors.hex!.value))fail('VALUE','Noncanonical bit snapshot');
 const parsed=parseBits128(descriptors.hex!.value);
 if(parsed.hex!==descriptors.hex!.value)fail('VALUE','Noncanonical snapshot');
 return parsed;
}
export function bits128FromBytes(bytes:Uint8Array):Bit128Value{
 if(!(bytes instanceof Uint8Array)||!ArrayBuffer.isView(bytes))fail('TYPE','Expected a Uint8Array');
 const length=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength')!.get!.call(bytes);
 if(length!==16)fail('SYNTAX','Expected exactly 16 bytes');
 const snapshot=new Uint8Array(bytes);
 return parseBits128(Array.from(snapshot,b=>b.toString(16).padStart(2,'0')).join(''));
}
export function bits128ToBytes(value:Bit128Value):Uint8Array{
 const {hex}=checked(value);return Uint8Array.from({length:16},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16));
}
export function compareBits128(left:Bit128Value,right:Bit128Value):-1|0|1{
 const a=checked(left).hex,b=checked(right).hex;return a===b?0:a<b?-1:1;
}
export function bits128ToWords(value:Bit128Value,signed:boolean):{high:string;low:string}{
 signedOption(signed);const hex=checked(value).hex;
 const word=(s:string)=>{const n=BigInt('0x'+s);return String(signed&&n>=MOD64/2n?n-MOD64:n);};
 return {high:word(hex.slice(0,16)),low:word(hex.slice(16))};
}
export function bits128FromWords(words:{high:string;low:string},signed:boolean):Bit128Value{
 signedOption(signed);
 if(!words||typeof words!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(words))||Object.keys(words).length!==2||Object.getOwnPropertyNames(words).length!==2||Object.getOwnPropertySymbols(words).length||!Object.hasOwn(words,'high')||!Object.hasOwn(words,'low'))fail('TYPE','Expected exactly high and low words');
 const props=Object.getOwnPropertyDescriptors(words);
 const word=(key:'high'|'low')=>{
  if(!('value'in props[key]!))fail('TYPE','Word accessors are forbidden');
  const text=props[key]!.value;
  if(typeof text!=='string')fail('TYPE','Words require exact text');
  if(text.length>20)fail('LIMIT','Word text exceeds 20 characters');
  if(!/^(?:0|-?[1-9][0-9]*)$/.test(text)||/\s/.test(text))fail('SYNTAX','Expected canonical decimal word');
  const n=BigInt(text),min=signed?-MOD64/2n:0n,max=signed?MOD64/2n-1n:MOD64-1n;
  if(n<min||n>max)fail('RANGE','Word outside selected 64-bit domain');return n<0n?n+MOD64:n;
 };
 return parseBits128((word('high')*MOD64+word('low')).toString(16).padStart(32,'0'));
}
export function bits128ToInteger(value:Bit128Value,signed:boolean):{integerToken:string}{
 signedOption(signed);const n=BigInt('0x'+checked(value).hex);return {integerToken:String(signed&&n>=MOD128/2n?n-MOD128:n)};
}
/** Bounded exact integral JSON token parser; deliberately independent of Field validation. */
export function bits128FromInteger(literal:{integerToken:string},signed:boolean):Bit128Value{
 signedOption(signed);
 if(!literal||typeof literal!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(literal))||Object.keys(literal).length!==1||Object.getOwnPropertyNames(literal).length!==1||Object.getOwnPropertySymbols(literal).length||!Object.hasOwn(literal,'integerToken'))fail('TYPE','Expected one integerToken');
 const prop=Object.getOwnPropertyDescriptor(literal,'integerToken')!;
 if(!('value'in prop)||typeof prop.value!=='string')fail('TYPE','Expected integer token text');
 const text=prop.value as string;if(text.length>4_000_000)fail('LIMIT','Integer text exceeds bound');
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(text);
 if(!m||m[0]!==text)fail('SYNTAX','Expected JSON integer token');
 if((m[4]??'').length>32)fail('LIMIT','Exponent exceeds bound');
 let digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');
 if(!digits){if(m[1])fail('RANGE','Negative zero loses sign');return parseBits128('0'.repeat(32));}
 const shift=BigInt(m[4]??'0')-BigInt((m[3]??'').length);
 if(shift<0n){const count=-shift;if(count>BigInt(digits.length))fail('RANGE','Nonintegral value');const at=digits.length-Number(count);if(/[^0]/.test(digits.slice(at)))fail('RANGE','Nonintegral value');digits=digits.slice(0,at);}
 else{if(BigInt(digits.length)+shift>39n)fail('RANGE','Integer outside 128-bit domain');digits+='0'.repeat(Number(shift));}
 if(digits.length>39)fail('RANGE','Integer outside 128-bit domain');
 const n=BigInt((m[1]??'')+digits),min=signed?-MOD128/2n:0n,max=signed?MOD128/2n-1n:MOD128-1n;
 if(n<min||n>max)fail('RANGE','Integer outside selected 128-bit domain');
 return parseBits128((n<0n?n+MOD128:n).toString(16).padStart(32,'0'));
}
