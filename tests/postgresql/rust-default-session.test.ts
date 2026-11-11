import {Registry} from '../../src/registry/registry';
import {describe,expect,it} from 'bun:test';
import {createPostgresqlRustDefault as bindPostgresqlRustDefault} from '../../src/adapters/postgresql/rust-default';
import {UmfError} from '../../src/model/errors';
import type {Document} from '../../src/model/types';

const ast={version:170004,stmts:[]};
const document:Document={umf:'0.10.0',id:'pg',vocabularies:{},modules:[]};
const editedDocument:Document={...document,id:'pg-edited'};
type ParserEngine=Parameters<typeof bindPostgresqlRustDefault>[0];
type ParserRequest=ReturnType<ParserEngine['prepareImport']>;
const createPostgresqlRustDefault=(engine:Partial<ParserEngine>,isNative:Parameters<typeof bindPostgresqlRustDefault>[1]=undefined,createRegistry=()=>new Registry())=>bindPostgresqlRustDefault({
 prepareImport(){throw new Error('unexpected prepareImport');},cancel(){return false;},completeImport(){throw new Error('unexpected completeImport');},
 prepareExport(){throw new Error('unexpected prepareExport');},completeExport(){throw new Error('unexpected completeExport');},editNode(){throw new Error('unexpected editNode');},
 inspect(){throw new Error('unexpected inspect');},getSource(){throw new Error('unexpected getSource');},getNode(){throw new Error('unexpected getNode');},
 inspectPayload(){return [];},validateAst(){throw new Error('unexpected validateAst');},...engine,
},isNative,createRegistry);

describe('PostgreSQL Rust parser-session facade',()=>{
 it('uses the caller-supplied backend for import and the complete export sequence',async()=>{
  const calls:string[]=[];
  let exportStage=0;
  const engine={
   prepareImport({source,id}:{source:string;id:string}){expect(source).toBe('SELECT 1');expect(id).toBe('pg');return {token:'import-1',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'parse' as const,sql:source};},
   completeImport({token,tree}:{token:string;tree:unknown}){expect(token).toBe('import-1');expect(tree).toBe(ast);return {done:true as const,document};},
   prepareExport({document:input}:{document:unknown}){expect(input).toBe(editedDocument);return {token:'export-1',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'codecRoundTrip' as const,tree:ast};},
   completeExport({token,response}:{token:string;response:any}){
    expect(token).toBe(['export-1','export-2','export-3'][exportStage]!);
    if(exportStage++===0){expect(response.kind).toBe('codecRoundTripped');return {done:false as const,request:{token:'export-2',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'deparse' as const,tree:ast}};}
    if(exportStage===2){expect(response.kind).toBe('deparsed');return {done:false as const,request:{token:'export-3',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'parse' as const,sql:'SELECT 1'}};}
    expect(response.kind).toBe('parsed');return {done:true as const,sql:'SELECT 1'};
   },
   editNode({document:input}:{document:unknown}){expect(input).toBe(document);return {document:editedDocument,validation:{valid:true,complete:false,diagnostics:[]}} as never;},
  };
  const backend={identity:'@libpg-query/parser@17.6.10' as const,async parse(sql:string){calls.push(`parse:${sql}`);return ast;},async deparse(tree:unknown){calls.push('deparse');expect(tree).toBe(ast);return 'SELECT 1';},codecRoundTrip(tree:unknown){calls.push('codecRoundTrip');expect(tree).toBe(ast);return ast;}};
  const api=createPostgresqlRustDefault(engine);
  expect(await api.importPostgresqlSql('SELECT 1',backend,{id:'pg'})).toBe(document);
  const edit=api.proposePostgresqlNodeEdit(document,'/stmts/0/stmt','{}');
  expect(edit.document).toBe(editedDocument);
  expect(await api.exportPostgresqlSql(edit.document,backend)).toBe('SELECT 1');
  expect(calls).toEqual(['parse:SELECT 1','codecRoundTrip','deparse','parse:SELECT 1']);
 });

 it('preserves the exact caller callback exception object',async()=>{
  const thrown={code:'POSTGRESQL_PARSE',message:'host-specific failure'};
  const cancelled:string[]=[];
  const engine={
   prepareImport(){return {token:'import-1',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'parse' as const,sql:'SELECT 1'};},
   cancel({token}:{token:string}){cancelled.push(token);return true;},
   completeImport(){throw new Error('must not complete');},
   prepareExport(){throw new Error('unused');},
   completeExport(){throw new Error('unused');},
  };
  const backend={identity:'@libpg-query/parser@17.6.10' as const,async parse(){throw thrown;},async deparse(){return '';},codecRoundTrip(){return ast;}};
  const api=createPostgresqlRustDefault(engine);
  await expect(api.importPostgresqlSql('SELECT 1',backend,{id:'pg'})).rejects.toBe(thrown);
  expect(cancelled).toEqual(['import-1']);
 });

 it('cancels a failed callback token so the same session can continue',async()=>{
  let next=0;const pending=new Set<string>();
  const engine={
   prepareImport(){const token=`token-${++next}`;pending.add(token);return {token,backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'parse' as const,sql:'SELECT 1'};},
   cancel({token}:{token:string}){return pending.delete(token);},
   completeImport({token}:{token:string}){expect(pending.delete(token)).toBe(true);return {done:true as const,document};},
   prepareExport(){throw new Error('unused');},completeExport(){throw new Error('unused');},
  };
  const thrown={reason:'parser failed once'};let fail=true;
  const backend={identity:'@libpg-query/parser@17.6.10' as const,async parse(){if(fail){fail=false;throw thrown;}return ast;},async deparse(){return '';},codecRoundTrip(){return ast;}};
  const api=createPostgresqlRustDefault(engine);
  await expect(api.importPostgresqlSql('SELECT 1',backend,{id:'pg'})).rejects.toBe(thrown);
  expect(pending.size).toBe(0);
  await expect(api.importPostgresqlSql('SELECT 1',backend,{id:'pg'})).resolves.toBe(document);
  expect(pending.size).toBe(0);
 });


 it('forwards lossy codec output to the Rust completion for refusal',async()=>{
  const lossy={...ast,unrecognizedField:'would be lost'};
  const engine={
   prepareImport(){throw new Error('unused');},completeImport(){throw new Error('unused');},
   prepareExport(){return {token:'export-codec',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'codecRoundTrip' as const,tree:ast};},
   completeExport({response}:{response:any}){
    expect(response.tree).toBe(lossy);
    throw Object.assign(new Error('codec output differs'),{code:'POSTGRESQL_CODEC_LOSS'});
   },editNode(){throw new Error('unused');},
  };
  const backend={identity:'@libpg-query/parser@17.6.10' as const,async parse(){return ast;},async deparse(){return 'SELECT 1';},codecRoundTrip(){return lossy;}};
  const api=createPostgresqlRustDefault(engine);
  await expect(api.exportPostgresqlSql(document,backend)).rejects.toMatchObject({code:'POSTGRESQL_CODEC_LOSS'});
 });


 it('sends a wrong-version parser response to Rust for refusal',async()=>{
  const wrongTree={version:170005,stmts:[]};
  const engine={
   prepareImport(){return {token:'import-bad-tree',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'parse' as const,sql:'SELECT 1'};},
   completeImport({tree}:{tree:unknown}){expect(tree).toBe(wrongTree);throw Object.assign(new Error('AST version mismatch'),{code:'POSTGRESQL_VERSION'});},
   prepareExport(){throw new Error('unused');},completeExport(){throw new Error('unused');},editNode(){throw new Error('unused');},
  };
  const backend={identity:'@libpg-query/parser@17.6.10' as const,parse(){return Promise.resolve(wrongTree);},deparse(){return Promise.resolve('');},codecRoundTrip(){return ast;}};
  const api=createPostgresqlRustDefault(engine);
  await expect(api.importPostgresqlSql('SELECT 1',backend,{id:'pg'})).rejects.toMatchObject({code:'POSTGRESQL_VERSION'});
 });

 it('refuses a parser request from the wrong AST version before invoking the callback',async()=>{
  let called=false;
  const engine={prepareImport(){return {token:'wrong-version',backend:'@libpg-query/parser@17.6.10' as const,astVersion:170005 as const,work:'parse' as const,sql:'SELECT 1'} as unknown as ParserRequest;},completeImport(){throw new Error('must not complete');},prepareExport(){throw new Error('unused');},completeExport(){throw new Error('unused');},editNode(){throw new Error('unused');}};
  const backend={identity:'@libpg-query/parser@17.6.10' as const,async parse(){called=true;return ast;},async deparse(){return '';},codecRoundTrip(){return ast;}};
  const api=createPostgresqlRustDefault(engine);
  await expect(api.importPostgresqlSql('SELECT 1',backend,{id:'pg'})).rejects.toMatchObject({code:'POSTGRESQL_BACKEND'});
  expect(called).toBe(false);
 });

 it('uses Rust payload inspection for the public registry callback',()=>{
  const expected=[{code:'POSTGRESQL_CATALOG_UNRESOLVED',path:'',severity:'warning',message:'not catalog resolution'}];
  let registeredPackage:unknown;
  const inspectors:((payload:unknown)=>unknown[])[]=[];
  const registry={register(pkg:unknown,callback:(payload:unknown)=>unknown[]){registeredPackage=pkg;inspectors.push(callback);return this;}};
  const engine={
   inspectPayload({payload}:{payload:unknown}){expect(payload).toEqual({profile:'postgresql-raw-parse-tree'});return expected;},
  };
  const api=createPostgresqlRustDefault(engine,()=>false,()=>registry as never);
  const result=api.postgresqlRegistry();
  expect(registeredPackage).toBeTruthy();
  expect(inspectors[0]?.({profile:'postgresql-raw-parse-tree'})).toBe(expected);
  expect(result as unknown).toBe(registry);
 });

 it('maps branded Rust pointer and syntax failures to the public UmfError class',()=>{
  const engine={
   editNode(){throw Object.assign(new Error('bad pointer'),{code:'JSON_SCHEMA_POINTER',path:'/bad'});},
   getNode(){throw Object.assign(new Error('bad syntax'),{code:'JSON_SCHEMA_SYNTAX',path:'/source'});},
  };
  const api=createPostgresqlRustDefault(engine,(value)=>!!value&&typeof value==='object'&&'code'in value);
  try{api.proposePostgresqlNodeEdit(document,'/bad','{}');throw new Error('expected failure');}
  catch(error){expect(error).toBeInstanceOf(UmfError);expect(error).toMatchObject({code:'JSON_SCHEMA_POINTER',path:'/bad'});}
  try{api.getPostgresqlNode(document,'/source');throw new Error('expected failure');}
  catch(error){expect(error).toBeInstanceOf(UmfError);expect(error).toMatchObject({code:'JSON_SCHEMA_SYNTAX'});}
 });

 it('keeps overlapping imports isolated by their Rust continuation tokens',async()=>{
  let next=0;
  const pending=new Map<string,string>();
  const engine={
   prepareImport({source}:{source:string}){const token=`parallel-${++next}`;pending.set(token,source);return {token,backend:'@libpg-query/parser@17.6.10' as const,astVersion:170004 as const,work:'parse' as const,sql:source};},
   completeImport({token,tree}:{token:string;tree:unknown}){expect(tree).toEqual({version:170004,stmts:[],source:pending.get(token)});return {done:true as const,document:{...document,id:pending.get(token)} as never};},
   prepareExport(){throw new Error('unused');},completeExport(){throw new Error('unused');},
  };
  const backend={identity:'@libpg-query/parser@17.6.10' as const,async parse(sql:string){await Promise.resolve();return {version:170004,stmts:[],source:sql};},async deparse(){return '';},codecRoundTrip(){return ast;}};
  const api=createPostgresqlRustDefault(engine);
  const results=await Promise.all(['SELECT 1','SELECT 2'].map((sql)=>api.importPostgresqlSql(sql,backend,{id:'pg'})));
  expect(results.map((entry)=>entry.id)).toEqual(['SELECT 1','SELECT 2']);
 });
});
