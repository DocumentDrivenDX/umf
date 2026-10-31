import {describe,expect,test} from 'bun:test';
import {createGraphqlOperations,GRAPHQL_PROFILE} from '../src/graphql.js';
import {encodeWire,fromWire} from '../src/wire.js';

const ast={kind:'Document',definitions:[{kind:'ObjectTypeDefinition',name:{kind:'Name',value:'Query'},fields:[{kind:'FieldDefinition',name:{kind:'Name',value:'old'}}]}]};
const document={umf:'0.10.0',id:'graphql-wasm',modules:[],ast};
const ok=value=>JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:encodeWire(value)});
const refusal=()=>JSON.stringify({profile:'umf.core-wire/1',status:'error',code:'GRAPHQL_EDIT',pathUnits:[],messageUnits:[114,101,102,117,115,101,100]});

describe('WASM GraphQL host callback wrapper',()=>{
 test('returns the Rust edited document after synchronously invoking the callback',()=>{
  const addon={graphqlProfileVersion:()=>GRAPHQL_PROFILE,executeGraphqlWire:()=>ok('type Query { old: String }'),executeGraphqlEditWire(wire,editor){
   const request=fromWire(JSON.parse(wire));expect(request.op).toBe('graphql.editAstHost');
   const edited=fromWire(JSON.parse(editor(encodeWire(ast))));
   return ok({...document,ast:edited});
  }};
  const engine=createGraphqlOperations(addon);
  expect(engine.exportGraphqlSchema(document)).toBe('type Query { old: String }');
  const result=engine.editGraphqlAst(document,source=>({...source,definitions:[{...source.definitions[0],fields:[{kind:'FieldDefinition',name:{kind:'Name',value:'new'}}]}]}));
  expect(result.ast.definitions[0].fields[0].name.value).toBe('new');
 });

 test('refuses before callback and rethrows the exact host exception',()=>{
  const denied={graphqlProfileVersion:()=>GRAPHQL_PROFILE,executeGraphqlWire:()=>ok(null),executeGraphqlEditWire:()=>refusal()};
  const deniedEngine=createGraphqlOperations(denied);
  let called=false;
  expect(()=>deniedEngine.editGraphqlAst(document,()=>{called=true;return ast;})).toThrow();
  expect(called).toBe(false);

  const expected=new Error('original host error');
  const throwing={...denied,executeGraphqlEditWire(_wire,editor){editor(encodeWire(ast));}};
  const engine=createGraphqlOperations(throwing);
  let observed;
  try{engine.editGraphqlAst(document,()=>{throw expected;});}catch(error){observed=error;}
  expect(observed).toBe(expected);
 });
});
