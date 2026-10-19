import {readJsonValue,writeJsonValue,readDocument,writeDocument,validateDocument,Registry,createUmfRegistry,dddRegistry,jsonSchemaRegistry,protobufRegistry,selectCoreElements,inspectCoreSchemaProperties,resolveCoreDefault,importJsonSchema,projectJsonSchemaToProtobuf,importProtobufSources,parseNativeJson} from '../../../../../src/index';
import {structuralDiff} from '../model';
import type {Request,Response} from './protocol';
const profiles:Record<string,()=>Registry>={empty:()=>new Registry(),sdk:createUmfRegistry,ddd:dddRegistry,'json-schema':jsonSchemaRegistry,protobuf:protobufRegistry};
export async function execute(request:Request,compiler?:any):Promise<Response>{
 const retainedSources=Object.entries(request.inputs??{}).map(([name,text])=>({name,mediaType:'text/plain',text}));
 const response:Response={protocol:1,requestId:request.requestId,state:'completed',outputs:[],diagnostics:[],retainedSources};
 const output=(name:string,value:unknown)=>response.outputs.push({name,mediaType:'application/json',text:JSON.stringify(value,null,2)});
 try{
  if(request.protocol!==1||typeof request.requestId!=='string'||!request.requestId||!profiles[request.registryProfile]||Object.keys(request).some(k=>!['protocol','requestId','operationId','coreProfile','registryProfile','inputs'].includes(k))||!request.inputs||typeof request.inputs!=='object'||Array.isArray(request.inputs))throw Error('REFERENCE_PROTOCOL unsupported request or registry');
  if(Object.values(request.inputs).some(t=>typeof t!=='string'||t.length>4_000_000)||Object.values(request.inputs).reduce((n,t)=>n+t.length,0)>8_000_000)throw Error('REFERENCE_LIMIT source text');
  const source=request.inputs.source??'';
  if(request.operationId==='format-source'){const format=request.inputs.outputFormat==='json'?'json':'yaml';response.outputs.push({name:'source.'+format,mediaType:'text/plain',text:writeJsonValue(readJsonValue(source,request.inputs.format==='json'?'json':'yaml'),format)});return response;}
  if(request.operationId==='schema-diff'){output('Structural changes · no semantic compatibility claim',structuralDiff(parseNativeJson(request.inputs.format==='yaml'?writeJsonValue(readJsonValue(source),'json'):source),parseNativeJson(request.inputs.after??'')));return response;}
  if(request.operationId==='protobuf-source'){
   if(!compiler)throw Error('REFERENCE_UNAVAILABLE pinned compiler not loaded');const doc=await importProtobufSources({files:{'example.proto':source},roots:['example.proto']},compiler,{id:'workbench:protobuf'});output('UMF source archive and descriptors',doc);return response;
  }
  if(request.operationId==='json-schema-protobuf'){
   if(!compiler)throw Error('REFERENCE_UNAVAILABLE pinned compiler not loaded');const native=importJsonSchema(request.inputs.format==='yaml'?writeJsonValue(readJsonValue(source),'json'):source,{id:'workbench:json-schema',baseUri:'https://umf.invalid/workbench/root.json'});
   const fields=JSON.parse(request.inputs.fields??'{"/properties/name":{"number":1},"/properties/age":{"number":2}}');
   const projected=await projectJsonSchemaToProtobuf(native,{id:'workbench:projection',packageName:'umf.example',messageName:'Example',fields,integerType:'int64',lossPolicy:request.inputs.policy==='strict'?'strict':'allow-reported-loss'},compiler);
   output('Projection result, retained source and losses',projected);if(projected.nativeSource)response.outputs.push({name:'schema.proto',mediaType:'text/plain',text:projected.nativeSource});
   response.diagnostics.push(...projected.issues.map(i=>({code:i.code,path:i.path,message:i.detail,severity:'warning' as const})));if(projected.status!=='projected')response.state='refused';return response;
  }
  const doc=readDocument(source,request.inputs.format==='json'?'json':'yaml');
  if(doc.umf!==request.coreProfile)throw Error('REFERENCE_UNAVAILABLE selected core profile differs from document');
  const registry=profiles[request.registryProfile]!();const checked=validateDocument(doc,registry);response.diagnostics=checked.diagnostics;
  if(!checked.valid){output('Validation',checked);response.state='refused';return response;}
  if(request.operationId==='core-write')response.outputs.push({name:'document.'+(request.inputs.outputFormat==='yaml'?'yaml':'json'),mediaType:'text/plain',text:writeDocument(doc,request.inputs.outputFormat==='yaml'?'yaml':'json')});
  else if(request.operationId==='core-select')output('Copied metadata with full retained source',selectCoreElements(doc,JSON.parse(request.inputs.query??'{"references":"transitive"}'),registry));
  else if(request.operationId==='core-properties')output('Properties and defaults',doc.modules.flatMap(m=>m.elements.filter(e=>e.kind==='field').map(e=>({module:m.id,element:e.id,inspection:inspectCoreSchemaProperties(doc,{scope:'element',module:m.id,element:e.id}),default:e.default?resolveCoreDefault(doc,{module:m.id,element:e.id},{state:'missing'}):null}))));
  else if(['core-validate','extension-check'].includes(request.operationId))output('Validation',{...checked,coreProfile:doc.umf,registryProfile:request.registryProfile,modules:doc.modules.map(m=>({id:m.id,namespace:m.namespace,elements:m.elements.map(e=>({id:e.id,kind:e.kind,scalarType:e.scalarType,references:e.references??[]}))}))});
  else throw Error('REFERENCE_UNAVAILABLE unknown operation');
 }catch(error){response.state='refused';response.outputs=[];response.diagnostics.push({code:(error as any).code??(String(error).match(/REFERENCE_[A-Z]+/)?.[0]??'REFERENCE_INPUT'),path:(error as any).path??'',message:error instanceof Error?error.message:String(error),severity:'error'});}
 return response;
}
