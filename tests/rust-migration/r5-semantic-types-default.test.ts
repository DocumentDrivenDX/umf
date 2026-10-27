// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import * as predecessor from '../../src/index';
import * as rustDefault from '../../src/index-node-v4';

const ref=(term:string)=>({vocabulary:'example.contact',version:'1.0.0',term});
const capture=(run:()=>unknown)=>{
 try{return{ok:true,value:run()};}
 catch(error){const e=error as {name?:string;code?:string;message?:string;path?:string};return{ok:false,error:{name:e.name??'Error',code:e.code??'',message:e.message??String(error),path:e.path??''}};}
};

test('V4 Semantic Types class, callback receiver and copied definition match the predecessor',()=>{
 for(const api of [predecessor,rustDefault]){
  const seen:{arity:number;receiver:unknown;definition:unknown}[]=[];
  const validator=function(this:unknown,value:unknown,definition:unknown){
   seen.push({arity:arguments.length,receiver:this,definition:structuredClone(definition)});
   if(seen.length===1)(this as {definition:{nested:{value:string}}}).definition.nested.value='changed';
   return{status:'valid' as const,complete:true,issues:[]};
  };
  const registry=new api.SemanticTypeRegistry();
  expect(registry).toBeInstanceOf(api.SemanticTypeRegistry);
  expect(registry.constructor.name).toBe('SemanticTypeRegistry');
  expect(registry.register(ref('receiver'),{nested:{value:'initial'}},validator)).toBe(registry);
  expect(api.validateSemanticTypeValue(ref('receiver'),null,registry as never).status).toBe('valid');
  expect(registry.check(ref('receiver'),null).status).toBe('valid');
  expect(seen.map(item=>item.arity)).toEqual([2,2]);
  expect(seen[0]?.receiver).toBe(seen[1]?.receiver);
  expect(Object.keys(seen[0]?.receiver as object)).toEqual(['definition','validator']);
  expect(seen.map(item=>(item.definition as {nested:{value:string}}).nested.value)).toEqual(['initial','changed']);
  expect(registry.lookup(ref('receiver'))).toEqual({nested:{value:'changed'}});
 }
});

test('V4 Semantic Types direct results and refusals match the predecessor',()=>{
 const cases=[
  (api:typeof predecessor)=>api.validateSemanticTypeValue(ref('absent'),null,new api.SemanticTypeRegistry()),
  (api:typeof predecessor)=>api.validateSemanticTypeValue({...ref('x'),future:true} as never,null,new api.SemanticTypeRegistry().register(ref('x'),{},()=>({status:'valid',complete:true,issues:[]}))),
  (api:typeof predecessor)=>api.validateSemanticTypeValue(ref('bad'),null,new api.SemanticTypeRegistry().register(ref('bad'),{},()=>({status:'unknown',complete:true,issues:[]} as never))),
  (api:typeof predecessor)=>api.validateSemanticTypeValue(ref('throws'),null,new api.SemanticTypeRegistry().register(ref('throws'),{},()=>{throw new Error('validator failed');})),
  (api:typeof predecessor)=>new api.SemanticTypeRegistry().register({...ref('x'),term:''},{}),
  (api:typeof predecessor)=>new api.SemanticTypeRegistry().register(ref('x'),[] as never),
  (api:typeof predecessor)=>new api.SemanticTypeRegistry().register(ref('x'),{},42 as never),
 ];
 for(const run of cases)expect(capture(()=>run(rustDefault as unknown as typeof predecessor))).toEqual(capture(()=>run(predecessor)));
});

test('V4 Core Semantic Type aggregate preserves refusal order',()=>{
 const document={umf:'0.10.0',id:'semantic-default',vocabularies:{},modules:[{id:'m',namespace:'https://example.test',elements:[{id:'e',kind:'field',scalarType:'string',extensions:{future:{kept:true}},semanticTypes:[ref('a')]}]}]};
 const identity={module:'m',element:'e'};
 const run=(api:typeof predecessor)=>api.validateCoreSemanticTypeValue(document as never,identity,null,new api.SemanticTypeRegistry().register(ref('a'),{},()=>({status:'valid',complete:true,issues:[]})));
 expect(capture(()=>run(rustDefault as unknown as typeof predecessor))).toEqual(capture(()=>run(predecessor)));
});


test('V4 Rust Core Semantic Types refusals use the public UmfError class',()=>{
 const bad={umf:'bad'};
 const calls=[
  ()=>rustDefault.inspectCoreSemanticTypes(bad as never,{module:'',element:'e'}),
  ()=>rustDefault.getCoreSemanticTypes(bad as never,{module:'',element:'e'}),
  ()=>rustDefault.declareCoreSemanticTypes(bad as never,{module:'',element:'e'},null),
  ()=>rustDefault.verifyCoreSemanticTypeDeclaration(bad as never,bad as never),
 ];
 for(const call of calls){
  try{call();throw new Error('expected the native operation to refuse');}
  catch(error){expect(error).toBeInstanceOf(rustDefault.UmfError);}
 }
});
