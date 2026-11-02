// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {OpenapiJsonSchemaPolicy,OpenapiJsonSchemaProjection} from './openapi-json-schema-types';
type Guard=(error:unknown)=>boolean;
interface Engine{['openapi-json-schema-projection']:{projectOpenapiToJsonSchema(fields:{source:Document;policy:OpenapiJsonSchemaPolicy}):unknown}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createOpenapiJsonSchemaRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){return Object.freeze({projectOpenapiToJsonSchema(source:Document,policy:OpenapiJsonSchemaPolicy):OpenapiJsonSchemaProjection{try{return engine['openapi-json-schema-projection'].projectOpenapiToJsonSchema({source,policy}) as OpenapiJsonSchemaProjection}catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||(!e.code.startsWith('OPENAPI_')&&e.code!=='REQUEST'&&e.code!=='JSON_SCHEMA_SYNTAX'&&e.code!=='JSON_SCHEMA_POINTER'))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'')}}})}
