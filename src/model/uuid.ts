// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from './types';
import {parseBits128,bits128ToBytes,BIT128_PROFILE,type Bit128Value} from './bit128';
export interface UuidValue extends Bit128Value {readonly canonicalText:string;readonly originalText:string}
export function parseUuid(text:string):UuidValue{
 if(typeof text!=='string')throw new UmfError('BIT128_TYPE','Expected UUID text');
 if(text.length!==36||!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(text))throw new UmfError('UUID_SYNTAX','Expected complete hyphenated UUID text');
 const hex=text.replaceAll('-','').toLowerCase();return Object.freeze({profile:BIT128_PROFILE,hex,canonicalText:text.toLowerCase(),originalText:text});
}
export function uuidFromBits128(value:Bit128Value):UuidValue{
 const hex=Array.from(bits128ToBytes(value),b=>b.toString(16).padStart(2,'0')).join('');
 return parseUuid([hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'));
}
export function uuidToBits128(value:UuidValue):Bit128Value{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).length!==4||Object.getOwnPropertyNames(value).length!==4||Object.getOwnPropertySymbols(value).length)throw new UmfError('BIT128_VALUE','Invalid UUID snapshot');
 const props=Object.getOwnPropertyDescriptors(value);
 for(const key of ['profile','hex','canonicalText','originalText'])if(!props[key]||!('value'in props[key]!))throw new UmfError('BIT128_VALUE','Unknown UUID snapshot members or accessors');
 const original=props.originalText!.value;
 if(typeof original!=='string'||original.length!==36||!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(original))throw new UmfError('BIT128_VALUE','Invalid original UUID text in snapshot');
 const parsed=parseUuid(original);
 if(parsed.profile!==props.profile!.value||parsed.hex!==props.hex!.value||parsed.canonicalText!==props.canonicalText!.value)throw new UmfError('BIT128_VALUE','Inconsistent UUID snapshot');
 return parseBits128(parsed.hex);
}
