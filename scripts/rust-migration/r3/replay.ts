// SPDX-License-Identifier: MIT OR Apache-2.0
/** Generic R3 fixture replay. Input: JSON {cases:[{id,operation,request}]}. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import '../../codegen/entry';
import {generateAccessPackage} from '../../../src/compilation/index';
import {diffAccessPackages} from '../../../src/compilation/admission/index';

type Input={cases:Array<{id:string;operation:string;request:any}>};
const args=process.argv.slice(2);if(args.length!==2)throw Error('usage: bun scripts/rust-migration/r3/replay.ts INPUT.json OUTPUT.json');
const input=JSON.parse(await readFile(resolve(args[0]!), 'utf8')) as Input;
if(!input||!Array.isArray(input.cases))throw Error('input must contain a cases array');const ids=new Set<string>();for(const c of input.cases){if(typeof c.id!=='string'||!c.id||ids.has(c.id))throw Error(`missing or duplicate case id: ${String(c.id)}`);ids.add(c.id);if(typeof c.operation!=='string'||!Object.hasOwn(c,'request'))throw Error(`invalid case envelope: ${c.id}`);}
const globals=globalThis as any;
const api:Record<string,(value:any)=>string>={
 generatePythonClient:globals.__umf_codegen,
 compileTableDeployment:globals.__umf_table_deploy,
 verifyTableDeployment:globals.__umf_table_verify,
 compileTableMigration:globals.__umf_table_migrate,
 verifyTableMigration:globals.__umf_table_migration_verify,
 discoverTableMigrationChanges:globals.__umf_table_migration_changes,
 normalizeRowScope:globals.__umf_row_scope,
};
const results=input.cases.map(c=>{
 if(c.operation==='generateAccessPackage'){
  try{return {id:c.id,actual:{ok:true,result:generateAccessPackage(c.request.request,c.request.profile)}};}
  catch(e){const x=e as any;return {id:c.id,actual:{ok:false,error:{code:x.code??'GENERATION_FAILED',message:x.message??String(e),...(x.pointer===undefined?{}:{pointer:x.pointer})}}};}
 }
 if(c.operation==='diffAccessPackages')return {id:c.id,actual:{ok:true,result:diffAccessPackages(c.request.before,c.request.after)}};
 const fn=api[c.operation];if(!fn)throw Error(`unsupported operation ${c.operation}`);
 const actual=JSON.parse(fn(JSON.stringify(c.request)));return {id:c.id,actual};
});
await writeFile(resolve(args[1]!),JSON.stringify({format:'umf-r3-replay-results/1',results},null,2)+'\n');
console.log(JSON.stringify({cases:results.length,operations:[...new Set(input.cases.map(c=>c.operation))].sort()}));
