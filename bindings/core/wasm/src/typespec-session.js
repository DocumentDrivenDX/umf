import {encodeRequestWire,fromWire,resultError} from './wire.js';

export const TYPESPEC_SESSION_PROFILE='umf.typespec-source-wire/1';

/** Client for one Rust-owned TypeSpec session. Compiler/parser callbacks receive
 * only requests already admitted by Rust; continuation state stays in Rust. */
export function createTypeSpecSessionOperations(executeSessionWire,executeCompilerRequest,executeParserRequest,controlDispatcher,hostWork,nativeError=f=>Object.assign(new Error(f.message),f)){
 if(typeof executeSessionWire!=='function'||typeof executeCompilerRequest!=='function'||typeof executeParserRequest!=='function')throw new TypeError('A Rust TypeSpec session and pinned host capabilities are required');
 const run=(op,fields={})=>{
  if(fields===null||typeof fields!=='object'||Array.isArray(fields))throw new TypeError('TypeSpec session fields must be an object');
  const request=Object.create(null);
  for(const key of Object.keys(fields)){
   const descriptor=Object.getOwnPropertyDescriptor(fields,key);
   if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new TypeError('TypeSpec session fields must be data properties');
   Object.defineProperty(request,key,{value:descriptor.value,enumerable:true,writable:true,configurable:true});
  }
  request.profile=TYPESPEC_SESSION_PROFILE;request.op=`typespec.${op}`;hostWork?.(1);
  const text=executeSessionWire(encodeRequestWire(request,hostWork),controlDispatcher);hostWork?.(text.length);
  const envelope=JSON.parse(text),failure=resultError(envelope);if(failure)throw nativeError(failure);
  hostWork?.(envelope.wire.length);return fromWire(JSON.parse(envelope.wire),hostWork);
 };
 const stage=(prepare,complete,fields,host)=>{
  const prepared=run(prepare,fields),token=prepared.token;
  try { const response=host(prepared.request,hostWork); if(response&&typeof response.then==='function')throw new TypeError('Synchronous TypeSpec parser capability returned a Promise'); return run(complete,{token,response}); }
  catch(error){try{run('cancel',{token});}catch{}throw error;}
 };
 const asyncStage=async(prepare,complete,fields)=>{
  const prepared=run(prepare,fields),token=prepared.token;
  try { const response=await executeCompilerRequest(prepared.request,hostWork); return run(complete,{token,response}); }
  catch(error){try{run('cancel',{token});}catch{}throw error;}
 };
 const inspectPayload=payload=>{
  const initial=run('inspectPayload',{payload,parserDiagnostics:[]});
  if(!initial.valid)return initial;
  const diagnostics=executeParserRequest({profile:'umf.typespec-parser-host/1',operation:'inspect',files:payload.files},hostWork);
  return run('inspectPayload',{payload,parserDiagnostics:diagnostics});
 };
 return Object.freeze({
  inspectTypeSpec:document=>stage('prepareInspect','completeInspect',{document},executeParserRequest),
  importTypeSpecSources:(input,options)=>{
   if(!options||typeof options!=='object'||Object.keys(options).some(k=>k!=='id')||!Object.hasOwn(options,'id'))throw new TypeError('TypeSpec import options must contain only id');
   return stage('prepareImport','completeImport',{input,id:options.id},executeParserRequest);
  },
  exportTypeSpecSources:document=>run('export',{document}),
  proposeTypeSpecSourceEdit:(document,path,text)=>stage('prepareEdit','completeEdit',{document,path,text},executeParserRequest),
  getTypeSpecSyntax:(document,path)=>stage('prepareSyntax','completeSyntax',{document,path},executeParserRequest),
  inspectTypeSpecPayload:inspectPayload,
  compileTypeSpecDocument:document=>asyncStage('prepareCompile','completeCompile',{document}),
  getTypeSpecSemanticGraph:(document,input)=>asyncStage('prepareGraph','completeGraph',{document,roots:input.roots}),
  emitTypeSpecJsonSchema:(document,input)=>asyncStage('prepareEmit','completeEmit',{document,options:input.options}),
 });
}
