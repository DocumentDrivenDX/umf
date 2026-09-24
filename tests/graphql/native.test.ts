import {test,expect} from 'bun:test';
import {parse,print,buildSchema,graphqlSync} from 'graphql';
import {importGraphqlSchema,exportGraphqlSchema,exportGraphqlBundle,inspectGraphql,getGraphqlAst,editGraphqlAst,writeDocument,readDocument} from '../../src';
const text=await Bun.file('fixtures/graphql/shop.graphql').text();
const basic='# Keep this comment\ntype Query { greet(name: String = "world"): String! }';
test('US-009-AC1: complete SDL declarations, extensions and original layout round-trip',async()=>{
 const doc=importGraphqlSchema(text,{id:'shop'});expect(inspectGraphql(doc).valid).toBe(true);
 expect(inspectGraphql(doc).diagnostics.map(d=>d.code)).toContain('GRAPHQL_SCALAR');
 expect(inspectGraphql(doc).diagnostics.map(d=>d.code)).toContain('GRAPHQL_DIRECTIVE');
 for(const format of ['json','yaml'] as const)expect(exportGraphqlSchema(readDocument(writeDocument(doc,format),format))).toBe(text);
 expect(print(getGraphqlAst(doc))).toBe(print(parse(text)));
 expect(getGraphqlAst(doc).definitions.some(d=>d.kind==='InputObjectTypeExtension')).toBe(true);
 await Bun.write('fixtures/graphql/round-trip.graphql',exportGraphqlSchema(doc));
});
test('US-009-AC2: editable AST stays isolated; current source replaces stale defaults with explicit layout loss',async()=>{
 const doc=importGraphqlSchema(basic,{id:'basic'});expect(inspectGraphql(doc).complete).toBe(true);
 const copy=getGraphqlAst(doc) as any;copy.definitions[0].name.value='Changed';expect(exportGraphqlSchema(doc)).toBe(basic);
 const edited=editGraphqlAst(doc,ast=>{(ast as any).definitions[0].fields[0].arguments[0].defaultValue.value='friend';return ast;});
 const bundle=exportGraphqlBundle(edited);expect(bundle.schema).toContain('"friend"');expect(bundle.schema).not.toContain('# Keep');expect(bundle.diagnostics.map(d=>d.code)).toContain('GRAPHQL_SOURCE_LAYOUT');
 expect(exportGraphqlSchema(doc)).toBe(basic);
 const execute=(s:string)=>graphqlSync({schema:buildSchema(s),source:'{ greet }',rootValue:{greet:({name}:any)=>'Hello '+name}});
 expect(execute(basic).data?.greet).toBe('Hello world');expect(execute(bundle.schema).data?.greet).toBe('Hello friend');
 await Bun.write('fixtures/graphql/edited.graphql',bundle.schema);
});
test('US-009-AC3: invalid native schemas and destructive AST edits fail',()=>{
 for(const s of ['type Query { x: Missing }','type Query { x: Int x: String }','input X @oneOf { x: Int! } type Query { q(x:X): Int }','query { x }','type Query { x(a:Int="bad"):String }'])expect(()=>importGraphqlSchema(s,{id:'bad'})).toThrow();
 const doc=importGraphqlSchema(basic,{id:'basic'});
 expect(()=>editGraphqlAst(doc,ast=>{(ast as any).definitions[0].fields[0].type.type.name.value='Unknown';return ast;})).toThrow();
 const future=structuredClone(doc);(future.modules[0]!.elements[0]!.extensions['umf.graphql'] as any).ast.future={retained:true};
 expect(inspectGraphql(future).complete).toBe(false);expect(()=>exportGraphqlSchema(future)).toThrow('discard');
 expect(()=>editGraphqlAst(importGraphqlSchema(text,{id:'opaque'}),ast=>ast)).toThrow();
});

test('US-009-AC4: exact custom-scalar literals remain AST strings and block unsupported edits',()=>{
 const text='scalar BigInt type Query { value(input: BigInt = 9007199254740993): BigInt }';
 const doc=importGraphqlSchema(text,{id:'exact'});
 expect(exportGraphqlSchema(doc)).toBe(text);
 const node=(getGraphqlAst(doc) as any).definitions[1].fields[0].arguments[0].defaultValue;
 expect(node).toEqual({kind:'IntValue',value:'9007199254740993'});
 expect(inspectGraphql(doc).complete).toBe(false);
 expect(()=>editGraphqlAst(doc,ast=>ast)).toThrow();
});
