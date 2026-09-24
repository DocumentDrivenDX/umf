import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {importGraphqlSchema,projectGraphqlInputToJsonSchema,exportGraphqlSchema,importJsonSchema,graphqlInputJsonSchemaProjectionSchema,coreSchema} from '../../src';
const text=await Bun.file('fixtures/graphql/input-projection.graphql').text();
const policy={id:'input-document',schemaId:'https://example.test/graphql-input',inputType:'Filter!',list:'array-only',idEncoding:'string-or-integer',lossPolicy:'allow-reported-loss'} as const;
test('US-010-AC1: input nullability, defaults, recursive lists and OneOf remain explicit',async()=>{
 const source=importGraphqlSchema(text,{id:'input-source'});const result=projectGraphqlInputToJsonSchema(source,policy);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);
 const ajv=new Ajv({strict:false});ajv.addSchema(coreSchema);expect(ajv.compile(graphqlInputJsonSchemaProjectionSchema)(result)).toBe(true);
 const validate=ajv.compile(JSON.parse(result.nativeSchema!));
 for(const value of [{required:'x'},{required:'x',defaulted:3,optional:null,list:[1,2],selector:{id:1},id:7,mode:'FAST',nested:{required:'y'}}])expect(validate(value)).toBe(true);
 for(const value of [null,{}, {required:null},{required:'x',defaulted:null},{required:'x',list:[null]},{required:'x',list:1},{required:'x',mode:'BAD'},{required:'x',selector:{}},{required:'x',selector:{id:null}},{required:'x',selector:{id:'a',name:'b'}},{required:'x',extra:1}])expect(validate(value)).toBe(false);
 expect(result.issues.some(i=>i.code==='INPUT_DEFAULT'&&i.path==='/types/Filter/fields/defaulted/default')).toBe(true);
 expect(result.issues.some(i=>i.code==='LIST_COERCION'&&i.path==='/types/Filter/fields/list')).toBe(true);
 expect(result.issues.some(i=>i.code==='ID_COERCION')).toBe(true);
 expect(exportGraphqlSchema(result.source)).toBe(text);
 expect(importJsonSchema(result.nativeSchema!,{id:'only',baseUri:policy.schemaId}).vocabularies['umf.graphql']).toBeUndefined();
 await Bun.write('fixtures/graphql/input-projection.json',JSON.stringify(result,null,2)+'\n');
});
test('US-010-AC2: fragments, output types, unbound scalars and strict policies block',()=>{
 const source=importGraphqlSchema(text,{id:'input'});
 expect(projectGraphqlInputToJsonSchema(source,{...policy,lossPolicy:'strict'}).status).toBe('blocked');
 expect(projectGraphqlInputToJsonSchema(source,{...policy,inputType:'Query'}).status).toBe('blocked');
 expect(projectGraphqlInputToJsonSchema(source,{...policy,inputType:'Missing'}).status).toBe('blocked');
 expect(projectGraphqlInputToJsonSchema(importGraphqlSchema('input Filter { x:Int }',{id:'fragment',mode:'fragment'}),policy).status).toBe('blocked');
 const custom=importGraphqlSchema('scalar Money input Filter { x:Money } type Query { x(f:Filter):Int }',{id:'custom'});
 expect(projectGraphqlInputToJsonSchema(custom,policy).status).toBe('blocked');
 expect(()=>projectGraphqlInputToJsonSchema(source,{...policy,list:'coerce'} as any)).toThrow();
 const nullable=projectGraphqlInputToJsonSchema(source,{...policy,inputType:'Filter'});
 expect(new Ajv({strict:false}).compile(JSON.parse(nullable.nativeSchema!))(null)).toBe(true);
});
test('US-010-AC5: pinned GitHub mutation input examples project without treating outputs as inputs',async()=>{
 const source=importGraphqlSchema(await Bun.file('fixtures/graphql/upstream/benchmark/github-schema.graphql').text(),{id:'github'});
 const samples=[{type:'AddCommentInput',valid:{subjectId:'id',body:'Comment'}},{type:'CreateIssueInput',valid:{repositoryId:'id',title:'Issue',labelIds:['label']}},{type:'CreateProjectInput',valid:{ownerId:'id',name:'Project'}}];
 const results=[];
 for(const sample of samples){
  const projected=projectGraphqlInputToJsonSchema(source,{...policy,inputType:sample.type+'!'});
  expect(projected.status).toBe('projected');
  const validate=new Ajv({strict:false}).compile(JSON.parse(projected.nativeSchema!));
  expect(validate(sample.valid)).toBe(true);expect(validate({})).toBe(false);expect(validate({...sample.valid,extra:'unknown'})).toBe(false);
  results.push({type:sample.type,valid:sample.valid,nativeSchema:projected.nativeSchema,issues:projected.issues});
 }
 await Bun.write('fixtures/graphql/input-projection-corpus.json',JSON.stringify({scope:'Three named mutation input examples from the 90-input pinned GitHub fixture',results},null,2)+'\n');
},20000);
