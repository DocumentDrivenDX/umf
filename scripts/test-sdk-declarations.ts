// SPDX-License-Identifier: MIT OR Apache-2.0
// Check the actual SDK package from an independent Node and browser consumer.
import {mkdtemp,mkdir,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

if(!process.argv[2])throw new Error('Usage: bun scripts/test-sdk-declarations.ts <extracted-sdk-package>');
const sdk=resolve(process.argv[2]);
const root=process.cwd();
const scratch=await mkdtemp(join(tmpdir(),'umf-sdk-types-'));
try{
 const modules=join(scratch,'node_modules');
 await mkdir(join(modules,'@umf'),{recursive:true});
 await symlink(sdk,join(modules,'@umf/core'),'dir');
 // Reuse the complete locked dependency tree, including transitive type
 // dependencies, without registry downloads or links to project source.
 for(const name of await readdir(join(root,'node_modules'))){
  if(name==='@umf'){
   for(const child of await readdir(join(root,'node_modules',name))){
    if(child!=='core')await symlink(join(root,'node_modules',name,child),join(modules,name,child));
   }
  }else await symlink(join(root,'node_modules',name),join(modules,name));
 }
 await writeFile(join(scratch,'package.json'),JSON.stringify({type:'module',private:true}));
 const common={target:'ES2022',strict:true,noEmit:true,skipLibCheck:false,preserveSymlinks:true};
 const cases=[
  {name:'node',compilerOptions:{...common,module:'NodeNext',moduleResolution:'NodeNext',types:['node']},source:`
import {createPostgresqlSqlEngine,generatePackTools,importPostgresqlSql,importIcebergTable} from '@umf/core';
import {readJsonValue, createValidator} from '@umf/core/loader-contract';
import {createPostgresqlSqlEngine as sourceEntryFactory} from './node_modules/@umf/core/dist/src/index.js';
import type {PackToolsRequest,PackToolsResult} from '@umf/core';
const generate: (request:PackToolsRequest)=>PackToolsResult=generatePackTools;
void generate;
const engine=createPostgresqlSqlEngine();
const sql:string=engine.exportSql(engine.importSql('SELECT 1','consumer'));
const callbackImport:typeof importPostgresqlSql=importPostgresqlSql;
const tableImport:typeof importIcebergTable=importIcebergTable;
void [sql,callbackImport,tableImport,readJsonValue,createValidator,sourceEntryFactory];
`},
  {name:'browser',compilerOptions:{...common,module:'ESNext',moduleResolution:'Bundler',customConditions:['browser'],lib:['ES2022','DOM'],types:[]},source:`
import {generatePackTools,importIcebergTable,importAvroSchema} from '@umf/core';
import {readJsonValue, createValidator} from '@umf/core/loader-contract';
import {generatePackTools as sourceEntryGenerate} from './node_modules/@umf/core/dist/src/index.js';
// @ts-expect-error The internal declaration alias also selects the browser surface.
import {createPostgresqlSqlEngine as sourceEntryFactory} from './node_modules/@umf/core/dist/src/index.js';
import type {PackToolsRequest,PackToolsResult} from '@umf/core';
const generate: (request:PackToolsRequest)=>PackToolsResult=generatePackTools;
void generate;
// @ts-expect-error The bundled native C backend belongs to the Node surface.
import {createPostgresqlSqlEngine} from '@umf/core';
const tableImport:typeof importIcebergTable=importIcebergTable;
const avroImport:typeof importAvroSchema=importAvroSchema;
void [tableImport,avroImport,readJsonValue,createValidator,sourceEntryGenerate];
`},
 ];
 for(const item of cases){
  await writeFile(join(scratch,item.name+'.mts'),item.source);
  const config=join(scratch,'tsconfig.'+item.name+'.json');
  await writeFile(config,JSON.stringify({compilerOptions:item.compilerOptions,files:[item.name+'.mts']}));
  const child=Bun.spawn([process.execPath,join(root,'node_modules/typescript/bin/tsc'),'--project',config],{cwd:scratch,stdout:'inherit',stderr:'inherit'});
  if(await child.exited!==0)throw new Error(`Published SDK ${item.name} declarations do not typecheck`);
  console.log(`Published SDK ${item.name} declarations pass with skipLibCheck:false`);
 }
}finally{
 await rm(scratch,{recursive:true,force:true});
}
