import {encodeWire,fromWire,resultError} from './wire.js';

export const GRAPHQL_PROFILE='umf.graphql-wire/1';

/** Bind the current public GraphQL API to the Rust wire engine and host callback bridge. */
export function createGraphqlOperations(addon,ErrorType=Error,controlDispatcher,hostWork,nativeError=(failure)=>new ErrorType(failure.code,failure.message,failure.path)){
 if(typeof addon?.executeGraphqlWire!=='function'||typeof addon?.executeGraphqlEditWire!=='function')throw new TypeError('A Rust GraphQL wire engine is required');
 const run=(op,fields)=>{
  const request={profile:GRAPHQL_PROFILE,op:`graphql.${op}`,...fields};
  const wire=encodeWire(request,{work:hostWork});
  const response=JSON.parse(addon.executeGraphqlWire(wire,controlDispatcher));
  hostWork?.(response.wire?.length??1);
  const error=resultError(response);
  if(error)throw nativeError(error);
  return fromWire(JSON.parse(response.wire),hostWork);
 };
 const editGraphqlAst=(document,edit)=>{
  if(typeof edit!=='function')throw new TypeError('GraphQL AST editor must be callable');
  let callbackThrew=false,callbackError;
  const dispatcher=astWire=>{
   try{
    hostWork?.(astWire.length);
    const ast=fromWire(JSON.parse(astWire),hostWork);
    const edited=edit(ast);
    return encodeWire(edited,{work:hostWork});
   }catch(error){callbackThrew=true;callbackError=error;throw error;}
  };
  const request={profile:GRAPHQL_PROFILE,op:'graphql.editAstHost',document};
  let rawResponse;
  try{rawResponse=addon.executeGraphqlEditWire(encodeWire(request,{work:hostWork}),dispatcher,controlDispatcher);}
  catch(error){if(callbackThrew)throw callbackError;throw error;}
  if(callbackThrew)throw callbackError;
  const response=JSON.parse(rawResponse);
  hostWork?.(response.wire?.length??1);
  const error=resultError(response);
  if(error)throw nativeError(error);
  return fromWire(JSON.parse(response.wire),hostWork);
 };
 return Object.freeze({
  profile:GRAPHQL_PROFILE,
  capabilities:Object.freeze({profile:GRAPHQL_PROFILE,sdl:true,ast:true,callbackEdits:true,complete:false}),
  importGraphqlSchema(source,options){const {id,mode}=options;return run('import',{source,id,...(mode===undefined?{}:{mode})});},
  inspectGraphql(document){return run('validate',{document});},
  exportGraphqlSchema(document){return run('export',{document});},
  getGraphqlAst(document){return run('getAst',{document});},
  editGraphqlAst,
  exportGraphqlBundle(document){return run('exportBundle',{document});},
  inspectGraphqlPayload(payload){return run('inspectPayload',{payload});},
 });
}
