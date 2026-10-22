// SPDX-License-Identifier: MIT OR Apache-2.0
import {currentDomainPolicy as domainPolicy} from '../validation/current-policy';
import {canonicalJson} from '../validation/json-equality';
import {assertLiteral,assertLiteralTracked,assertIdentity,coefficient} from '../validation/literal-kernel';
import {UmfError,type Document,type Element} from './types';
export type {Literal as CoreLiteral} from '../generated/core-model';
export const schemaPropertyNames=Object.freeze([...domainPolicy.schemaPropertyNames]);
/** Public exact-JSON spelling remains distinct from internal equality keys. */
export const canonicalSchemaJson=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonicalSchemaJson).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalSchemaJson((value as Record<string,unknown>)[k])).join(',')+'}':JSON.stringify(value);
export function schemaError(message:string,path=''):never{throw new UmfError('CORE_SCHEMA_PROPERTIES',message,path);}
export function knownSchemaMembers(value:unknown,keys:readonly string[],path:string):void{if(!value||typeof value!=='object'||Array.isArray(value))schemaError('Expected object',path);for(const key of Object.keys(value))if(!keys.includes(key))throw new UmfError('CORE_SCHEMA_PROPERTY_UNKNOWN','Unknown relevant qualifier: '+key,path+'/'+key);}
export const schemaCoefficient=(token:string,scale:number,precision?:number):bigint=>coefficient(token,scale,precision,domainPolicy.literal);
export const literalIdentity=(field:Element,value:unknown):string=>assertIdentity(field,value,domainPolicy.literal);
export const checkSchemaLiteral=(doc:Document,field:Element,value:unknown,refinements=true,_depth=0):void=>assertLiteral(doc,field,value,refinements,domainPolicy.literal);
export const checkSchemaLiteralTracked=(doc:Document,field:Element,value:unknown,charge:(doc:Document,field:Element,value:any)=>void):void=>assertLiteralTracked(doc,field,value,domainPolicy.literal,charge);
