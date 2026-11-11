// SPDX-License-Identifier: MIT OR Apache-2.0
import {currentDomainPolicy as domainPolicy} from '../validation/current-policy';
import {canonicalJson} from '../validation/json-equality';
import {assertLiteral,assertLiteralTracked,assertIdentity,coefficient} from '../validation/literal-kernel';
import {UmfError,type Document,type Element} from './types';
export type {Literal as CoreLiteral} from '../generated/core-model';
export const schemaPropertyNames=Object.freeze([...domainPolicy.schemaPropertyNames]);
export {canonicalSchemaJson} from './canonical-schema-json';
export function schemaError(message:string,path=''):never{throw new UmfError('CORE_SCHEMA_PROPERTIES',message,path);}
export function knownSchemaMembers(value:unknown,keys:readonly string[],path:string):void{if(!value||typeof value!=='object'||Array.isArray(value))schemaError('Expected object',path);for(const key of Object.keys(value))if(!keys.includes(key))throw new UmfError('CORE_SCHEMA_PROPERTY_UNKNOWN','Unknown relevant qualifier: '+key,path+'/'+key);}
export const schemaCoefficient=(token:string,scale:number,precision?:number):bigint=>coefficient(token,scale,precision,domainPolicy.literal);
export const literalIdentity=(field:Element,value:unknown):string=>assertIdentity(field,value,domainPolicy.literal);
export const checkSchemaLiteral=(doc:Document,field:Element,value:unknown,refinements=true,_depth=0):void=>assertLiteral(doc,field,value,refinements,domainPolicy.literal);
export const checkSchemaLiteralTracked=(doc:Document,field:Element,value:unknown,charge:(doc:Document,field:Element,value:any)=>void):void=>assertLiteralTracked(doc,field,value,domainPolicy.literal,charge);
