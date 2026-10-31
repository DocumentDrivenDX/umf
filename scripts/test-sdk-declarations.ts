// SPDX-License-Identifier: MIT OR Apache-2.0
// Check the actual SDK package from an independent Node and browser consumer.
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile,access} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';

if(!process.argv[2])throw new Error('Usage: bun scripts/test-sdk-declarations.ts <extracted-sdk-package>');
const sdk=resolve(process.argv[2]);
const root=process.cwd();
const scratch=await mkdtemp(join(tmpdir(),'umf-sdk-types-'));
try{
 const modules=join(scratch,'node_modules');
 await mkdir(join(modules,'@umf'),{recursive:true});
 await symlink(sdk,join(modules,'@umf/core'),'dir');
 const manifest=JSON.parse(await readFile(join(sdk,'package.json'),'utf8'));
 // Reuse the locked local dependencies, without exposing repository source to
 // the consumer or requiring registry downloads.
 for(const name of new Set([...Object.keys(manifest.dependencies??{}),'@types/node'])){
  if(name==='@umf/core')continue;
  const source=join(root,'node_modules',name);
  await access(source);
  const target=join(modules,name);
  await mkdir(dirname(target),{recursive:true});
  await symlink(source,target,'dir');
 }
 await writeFile(join(scratch,'package.json'),JSON.stringify({type:'module',private:true}));
 const common={target:'ES2022',strict:true,noEmit:true,skipLibCheck:false,preserveSymlinks:true};
 const cases=[
  {name:'node',compilerOptions:{...common,module:'NodeNext',moduleResolution:'NodeNext',types:['node']},source:`
import {createPostgresqlSqlEngine,importPostgresqlSql,importIcebergTable} from '@umf/core';
const engine=createPostgresqlSqlEngine();
const sql:string=engine.exportSql(engine.importSql('SELECT 1','consumer'));
const callbackImport:typeof importPostgresqlSql=importPostgresqlSql;
const tableImport:typeof importIcebergTable=importIcebergTable;
void [sql,callbackImport,tableImport];
`},
  {name:'browser',compilerOptions:{...common,module:'ESNext',moduleResolution:'Bundler',customConditions:['browser'],lib:['ES2022','DOM'],types:[]},source:`
import {importIcebergTable,importAvroSchema} from '@umf/core';
// @ts-expect-error The bundled native C backend belongs to the Node surface.
import {createPostgresqlSqlEngine} from '@umf/core';
const tableImport:typeof importIcebergTable=importIcebergTable;
const avroImport:typeof importAvroSchema=importAvroSchema;
void [tableImport,avroImport];
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
