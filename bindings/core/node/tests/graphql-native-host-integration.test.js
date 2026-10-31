import {expect,test} from 'bun:test';
import {createGraphqlEngine} from '../index.js';

test('native GraphQL host edit exports the Rust-validated AST and refuses before callback for fragments',()=>{
 const engine=createGraphqlEngine();
 const source=engine.importGraphqlSchema('type Query { old: String }',{id:'native-graphql-host-integration'});
 let calls=0;
 const candidate=engine.editGraphqlAst(source,ast=>{
  calls++;
  const query=ast.definitions.find(definition=>definition.kind==='ObjectTypeDefinition'&&definition.name.value==='Query');
  query.fields.find(field=>field.name.value==='old').name.value='renamed';
  return ast;
 });
 expect(calls).toBe(1);
 expect(engine.exportGraphqlSchema(candidate)).toContain('renamed: String');

 const fragment=engine.importGraphqlSchema('type Query { partial: String }',{id:'native-graphql-incomplete-fragment',mode:'fragment'});
 let refusedCalls=0;
 expect(()=>engine.editGraphqlAst(fragment,ast=>{refusedCalls++;return ast;})).toThrow();
 expect(refusedCalls).toBe(0);
}, 30_000);
