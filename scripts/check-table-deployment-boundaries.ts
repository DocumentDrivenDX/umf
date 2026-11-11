// SPDX-License-Identifier: MIT OR Apache-2.0
import ts from 'typescript-api';
import {readdir,readFile} from 'node:fs/promises';
const owners:Record<string,readonly string[]>={
 'types.ts':['../model/types','../extensions/tables/types'],
 'rust-default.ts':['../model/errors','./types'],
 'migration/types.ts':['../model/types','../table-deployment/types','../extensions/tables/types'],
 'migration/inventory-types.ts':['../model/types','../extensions/tables/types','../table-deployment/types','./types'],
 'migration/rust-default.ts':['../model/errors','../table-deployment/types','./types'],
 'migration/inventory-rust-default.ts':['../model/errors','../table-deployment/types','./inventory-types'],
 'authoring/row-scope-types.ts':['../model/types','../extensions/tables/types'],
 'authoring/rust-default.ts':['../model/errors','../model/json','./row-scope-types'],
};
const forbidden=new Set(['Bun','process','require','fetch','eval','Function','Buffer','XMLHttpRequest','WebSocket','Deno','globalThis','window','postMessage']);
export function checkTableDeploymentBoundaries(sources:Record<string,string>):string[]{
 const errors:string[]=[];
 for(const[file,text]of Object.entries(sources)){
  if(!owners[file]){errors.push(file+': module has no declared owner');continue;}
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node):void=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!owners[file]!.includes(node.moduleSpecifier.text))errors.push(file+': unapproved dependency '+node.moduleSpecifier.text);
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)errors.push(file+': dynamic import');
   if(ts.isIdentifier(node)&&forbidden.has(node.text))errors.push(file+': host/executable hook '+node.text);
   ts.forEachChild(node,visit);
  };visit(source);
 }
 return errors;
}
if(import.meta.main){
 const base=new URL('../src/table-deployment/',import.meta.url),files=(await readdir(base)).filter(f=>f.endsWith('.ts'));
 const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,base),'utf8')])));
 const migration=new URL('../src/table-migration/',import.meta.url);
 for(const file of (await readdir(migration)).filter(f=>f.endsWith('.ts')))sources['migration/'+file]=await readFile(new URL(file,migration),'utf8');
 const authoring=new URL('../src/table-authoring/',import.meta.url);
 try{for(const file of (await readdir(authoring)).filter(f=>f.endsWith('.ts')))sources['authoring/'+file]=await readFile(new URL(file,authoring),'utf8');}catch(error){if(!(error instanceof Error)||!('code'in error)||error.code!=='ENOENT')throw error;}
 const errors=checkTableDeploymentBoundaries(sources);
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Table deployment boundaries: '+Object.keys(sources).length+' pure browser modules; inert SQL; no host I/O');
}
