// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/types';
import type {PublicCompanyRow} from './public-company';

export type SecProjectionWireError={name:string;code:string|null;path:string|null;message:string};
export type SecProjectionWire={ok:true;value:unknown}|{ok:false;error:SecProjectionWireError};
export type SecProjectionProvider={submissions(input:Uint16Array,sourceId:Uint16Array):string;companyFacts(input:Uint16Array,sourceId:Uint16Array):string};
const INPUT_MAX=4_000_000,SOURCE_MAX=1_024;
function predecessorTextLength(text:string):number {return text.length;}
function toUnits(value:string):Uint16Array {const out=new Uint16Array(value.length);for(let i=0;i<value.length;i++)out[i]=value.charCodeAt(i);return out;}
function invoke(provider:(input:Uint16Array,sourceId:Uint16Array)=>string,input:unknown,sourceId:unknown):unknown {
  if(typeof input!=='string'){
    // Preserve the predecessor's JavaScript admission order for calls outside
    // the declared string signature. The semantic JSON path remains in Rust.
    if(input===null||input===undefined){predecessorTextLength(input as unknown as string);}
    if(typeof input==='number'||typeof input==='boolean')throw new TypeError('source is not a string');
    throw new UmfError('JSON_SCHEMA_SYNTAX','Invalid native JSON','');
  }
  if(input.length>INPUT_MAX)throw new UmfError('LIMIT','Native JSON exceeds text limit','');
  const source=typeof sourceId==='string'&&sourceId.length>0&&sourceId.length<=SOURCE_MAX?toUnits(sourceId):new Uint16Array(0);
  // Do not catch provider failures: native binding exceptions retain their identity.
  const wire=provider(toUnits(input),source);
  let raw:unknown;try{raw=JSON.parse(wire);}catch{throw new Error('Malformed SEC projection wire response');}
  if(!raw||typeof raw!=='object')throw new Error('Malformed SEC projection wire response');
  const envelope=raw as Partial<SecProjectionWire>;
  if(envelope.ok===true&&Object.hasOwn(envelope,'value'))return envelope.value;
  if(envelope.ok!==false||!envelope.error||typeof envelope.error.message!=='string')throw new Error('Malformed SEC projection wire response');
  const e=envelope.error;
  if(e.name==='UmfError'&&typeof e.code==='string')throw new UmfError(e.code,e.message,typeof e.path==='string'?e.path:'');
  const error=new Error(e.message);error.name=e.name;throw error;
}
export function createSecProjectionRustOperations(provider:SecProjectionProvider){
  if(typeof provider?.submissions!=='function'||typeof provider?.companyFacts!=='function')throw new Error('A Rust SEC projection provider is required');
  function projectSecSubmissions(input:string,sourceId:string):{companies:PublicCompanyRow[];identifiers:PublicCompanyRow[];filings:PublicCompanyRow[]}{return invoke(provider.submissions,input,sourceId) as ReturnType<typeof projectSecSubmissions>;}
  function projectSecCompanyFacts(input:string,sourceId:string):PublicCompanyRow[]{return invoke(provider.companyFacts,input,sourceId) as PublicCompanyRow[];}
  Object.defineProperty(projectSecSubmissions,'name',{value:'projectSecSubmissions'});Object.defineProperty(projectSecCompanyFacts,'name',{value:'projectSecCompanyFacts'});
  return {projectSecSubmissions,projectSecCompanyFacts};
}
/** Node-only helper kept in this otherwise browser-safe adapter module. */
export function utf16LittleEndianBytes(units:Uint16Array):Uint8Array {const bytes=new Uint8Array(units.length*2);for(let i=0;i<units.length;i++){const u=units[i]!;bytes[i*2]=u&255;bytes[i*2+1]=u>>>8;}return bytes;}
