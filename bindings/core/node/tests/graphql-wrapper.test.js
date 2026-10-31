import {describe,expect,test} from 'bun:test';
import {createGraphqlOperations,GRAPHQL_PROFILE} from '../src/graphql.js';
import {encodeWire,fromWire} from '../src/wire.js';

function ok(value){return JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:encodeWire(value)});}
function failed(code='GRAPHQL_EDIT'){return JSON.stringify({profile:'umf.core-wire/1',status:'error',code,pathUnits:[],messageUnits:[114,101,102,117,115,101,100]});}
const ast={kind:'Document',definitions:[{kind:'ObjectTypeDefinition',name:{kind:'Name',value:'Query'},fields:[{kind:'FieldDefinition',name:{kind:'Name',value:'old'}}]}]};
const document={umf:'0.10.0',id:'graphql-wrapper',modules:[],ast};

describe('GraphQL Rust host callback wrapper',()=>{
 test('preserves the six established operation signatures on the Rust wire',()=>{
  const calls=[];
  const addon={
   graphqlProfileVersion:()=>GRAPHQL_PROFILE,
   executeGraphqlWire(wire){const request=fromWire(JSON.parse(wire));calls.push(request.op);switch(request.op){case'graphql.import':return ok(document);case'graphql.validate':return ok({valid:true,complete:true,diagnostics:[]});case'graphql.export':return ok('type Query { old: String }');case'graphql.getAst':return ok(ast);case'graphql.exportBundle':return ok({schema:'type Query { old: String }',source:document,diagnostics:[]});default:throw Error('unexpected operation');}},
   executeGraphqlEditWire(){throw Error('edit should use host path');},
  };
  const engine=createGraphqlOperations(addon);
  expect(engine.importGraphqlSchema('type Query { old: String }',{id:'graphql-wrapper'})).toEqual(document);
  expect(engine.inspectGraphql(document).valid).toBe(true);
  expect(engine.exportGraphqlSchema(document)).toBe('type Query { old: String }');
  expect(engine.getGraphqlAst(document)).toEqual(ast);
  expect(engine.exportGraphqlBundle(document).schema).toBe('type Query { old: String }');
  expect(calls).toEqual(['graphql.import','graphql.validate','graphql.export','graphql.getAst','graphql.exportBundle']);
 });

 test('routes extension registry inspection through the Rust payload operation',()=>{
  let request;
  const addon={graphqlProfileVersion:()=>GRAPHQL_PROFILE,executeGraphqlWire(wire){
   request=fromWire(JSON.parse(wire));return ok([]);
  },executeGraphqlEditWire(){throw Error('unexpected host edit');}};
  const engine=createGraphqlOperations(addon);
  expect(engine.inspectGraphqlPayload({profile:'graphql-js-17.0.2-sdl'})).toEqual([]);
  expect(request.op).toBe('graphql.inspectPayload');
 });

 test('uses the caller branded native error factory for wire failures',()=>{
  const branded={code:'GRAPHQL_DOCUMENT',path:'/modules/0'};
  const addon={graphqlProfileVersion:()=>GRAPHQL_PROFILE,executeGraphqlWire(){return failed('GRAPHQL_DOCUMENT');},executeGraphqlEditWire(){}};
  const engine=createGraphqlOperations(addon,Error,undefined,undefined,()=>branded);
  let thrown;
  try{engine.exportGraphqlSchema(document);}catch(error){thrown=error;}
  expect(thrown).toBe(branded);
 });

 test('calls editor only when Rust invokes the validated host hook and returns edited document',()=>{
  let editorCalls=0;
  const addon={
   graphqlProfileVersion:()=>GRAPHQL_PROFILE,
   executeGraphqlWire(){throw Error('unexpected ordinary operation');},
   executeGraphqlEditWire(wire,editor){
    const request=fromWire(JSON.parse(wire));expect(request.op).toBe('graphql.editAstHost');
    const edited=fromWire(JSON.parse(editor(encodeWire(ast))));
    const result={...document,ast:edited};
    return ok(result);
   },
  };
  const engine=createGraphqlOperations(addon);
  const result=engine.editGraphqlAst(document,source=>{
   editorCalls++;
   return {...source,definitions:[{...source.definitions[0],fields:[{kind:'FieldDefinition',name:{kind:'Name',value:'new'}}]}]};
  });
  expect(editorCalls).toBe(1);
  expect(result.ast.definitions[0].fields[0].name.value).toBe('new');
 });

 test('preserves thrown callback identity and does not invoke callback on Rust refusal',()=>{
  const thrown=new Error('same callback error');
  let refusalCalls=0;
  const refusingAddon={graphqlProfileVersion:()=>GRAPHQL_PROFILE,executeGraphqlWire(){},executeGraphqlEditWire(){return failed();}};
  const refusing=createGraphqlOperations(refusingAddon);
  expect(()=>refusing.editGraphqlAst(document,()=>{refusalCalls++;return ast;})).toThrow();
  expect(refusalCalls).toBe(0);

  const throwingAddon={graphqlProfileVersion:()=>GRAPHQL_PROFILE,executeGraphqlWire(){},executeGraphqlEditWire(_wire,editor){
   editor(encodeWire(ast));
   return failed();
  }};
  const throwing=createGraphqlOperations(throwingAddon);
  let actual;
  try{throwing.editGraphqlAst(document,()=>{throw thrown;});}catch(error){actual=error;}
  expect(actual).toBe(thrown);
 });
});
