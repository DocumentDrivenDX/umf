import {describe,expect,test} from 'bun:test';
import {UmfError} from '../../src/model/errors';
import type {GraphqlRustEngine} from '../../src/adapters/graphql/rust-default';
import {createGraphqlRustDefault} from '../../src/adapters/graphql/rust-default';

describe('GraphQL Rust default errors',()=>{
 test('maps branded native failures to public UmfError with code and path',()=>{
  const native=Object.assign(new Error('bad document'),{code:'GRAPHQL_DOCUMENT',path:'/modules/0'});
  const engine={importGraphqlSchema(){throw native;}} as unknown as GraphqlRustEngine;
  const api=createGraphqlRustDefault(engine,error=>error===native);
  try{api.importGraphqlSchema('type Query { x: String }',{id:'bad'});throw new Error('expected failure');}
  catch(error){expect(error).toBeInstanceOf(UmfError);expect((error as UmfError).code).toBe('GRAPHQL_DOCUMENT');expect((error as UmfError).path).toBe('/modules/0');}
 });

 test('does not translate callback-thrown values that look like native errors',()=>{
  const native=Object.assign(new Error('user callback'),{code:'GRAPHQL_EDIT',path:'/ast'});
  const engine={editGraphqlAst(_document:unknown,edit:(ast:any)=>any){edit({kind:'Document'});return {};}} as unknown as GraphqlRustEngine;
  const api=createGraphqlRustDefault(engine,error=>error===native);
  let thrown:unknown;
  try{api.editGraphqlAst({} as never,()=>{throw native;});}catch(error){thrown=error;}
  expect(thrown).toBe(native);
 });

 test('preserves branded resource-control errors for callers',()=>{
  const native=Object.assign(new Error('stopped'),{code:'CANCELLED',path:'/request'});
  const engine={inspectGraphql(){throw native;}} as unknown as GraphqlRustEngine;
  const api=createGraphqlRustDefault(engine,error=>error===native);
  let thrown:unknown;
  try{api.inspectGraphql({} as never);}catch(error){thrown=error;}
  expect(thrown).toBe(native);
 });
});
