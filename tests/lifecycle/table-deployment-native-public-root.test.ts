// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,verifyTableDeployment,UmfError} from '../../src/index-node-v4';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'rust_deployment',ownerRole:'rust_owner',personRole:'rust_person',batchRole:'rust_batch',groupRoles:{readers:'rust_readers'}};
const text=JSON.stringify(fixture);
function compiled(){
 const result=compileTableDeployment({text,configuration});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result.diagnostics));
 return result.bundle;
}

test('public Rust deployment compiler emits SQL and verifies its source-backed bundle',()=>{
 const bundle=compiled();
 expect(bundle.source.utf8).toBe(text);
 expect(bundle.steps.some(step=>step.sql.includes('CREATE TABLE'))).toBe(true);
 expect(verifyTableDeployment(bundle)).toEqual(bundle);
},60_000);

test('public Rust deployment rejects invalid configuration and modified SQL',()=>{
 expect(compileTableDeployment({text,configuration:{...configuration,schema:'public'}}).status).toBe('blocked');
 const bundle=structuredClone(compiled());
 bundle.steps[0]!.sql='DROP SCHEMA public CASCADE';
 expect(()=>verifyTableDeployment(bundle)).toThrow(UmfError);
},60_000);
