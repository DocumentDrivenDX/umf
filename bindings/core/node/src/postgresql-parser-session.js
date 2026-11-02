// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire,fromWire,resultError} from './wire.js';

export const POSTGRESQL_PARSER_PROFILE='umf.postgresql-parser-wire/1';

/** Client for one Rust-owned ParserSession. Parser results are only responses
 * to retained Rust tokens; no continuation state is accepted from callers. */
export function createPostgresqlParserSessionOperations(executeSessionWire,controlDispatcher,hostWork,nativeError=(failure)=>Object.assign(new Error(failure.message),failure)){
 if(typeof executeSessionWire!=='function')throw new TypeError('A Rust PostgreSQL ParserSession executor is required');
 const run=(op,fields={})=>{
  if(fields===null||typeof fields!=='object'||Array.isArray(fields))throw new TypeError('PostgreSQL parser fields must be an object');
  const request=Object.create(null);
  for(const key of Object.keys(fields)){
   const descriptor=Object.getOwnPropertyDescriptor(fields,key);
   if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new TypeError('PostgreSQL parser fields must be data properties');
   Object.defineProperty(request,key,{value:descriptor.value,enumerable:true,writable:true,configurable:true});
  }
  request.profile=POSTGRESQL_PARSER_PROFILE;
  request.op=`postgresql-parser.${op}`;
  hostWork?.(1);
  const responseText=executeSessionWire(encodeRequestWire(request,hostWork),controlDispatcher);
  hostWork?.(responseText.length);
  const response=JSON.parse(responseText),failure=resultError(response);
  if(failure)throw nativeError(failure);
  hostWork?.(response.wire.length);
  return fromWire(JSON.parse(response.wire),hostWork);
 };
 return Object.freeze({
  prepareImport:({source,id})=>run('prepareImport',{source,id}),
  cancel:({token})=>run('cancel',{token}),
  completeImport:({token,tree})=>run('completeImport',{token,response:{kind:'parsed',tree}}),
  prepareExport:({document})=>run('prepareExport',{document}),
  completeExport:({token,response})=>run('completeExport',{token,response}),
  editNode:({document,pointer,text})=>run('editNode',{document,pointer,text}),
  inspect:({document})=>run('inspect',{document}),
  getSource:({document})=>run('getSource',{document}),
  getNode:({document,pointer})=>run('getNode',{document,pointer}),
  inspectPayload:({payload})=>run('inspectPayload',{payload}),
  validateAst:({ast})=>run('validateAst',{ast}),
 });
}
