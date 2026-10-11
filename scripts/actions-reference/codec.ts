import {createHash} from 'node:crypto';
import {copyJson} from '../../src/model/json';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {UmfError,type Json} from '../../src/model/types';
/** JSON text escapes NUL and lone surrogates before PostgreSQL sees UTF-8 text. */
export const encodeReferenceJson=(value:unknown):string=>JSON.stringify(copyJson(value));
/** Only store-owned encoder output crosses this boundary; domain admission still runs after decoding. */
export function decodeReferenceJson(text:string):Json {const value=copyJson(JSON.parse(text));if(text!==encodeReferenceJson(value)&&text!==encodeReferenceIdentity(value))throw new UmfError('REFERENCE_REPRESENTATION','Stored JSON is not exact encoder output');return value;}
/** Canonical object order, retained array/value order and exact UTF-16 string identity. */
export const encodeReferenceIdentity=(value:unknown):string=>canonicalSchemaJson(copyJson(value));
export const referenceIdentityDigest=(identity:string):string=>createHash('sha256').update(identity).digest('hex');
