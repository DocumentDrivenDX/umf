// SPDX-License-Identifier: MIT OR Apache-2.0
import ts from 'typescript-api';
import {readdir,readFile} from 'node:fs/promises';
const owners:Record<string,readonly string[]>={
 'migration/index.ts':['../model/json','../model/document','../model/types','../compilation/bundle/hash','../table-deployment'],
 'types.ts':['../model/types','../extensions/tables'],
 'configuration.ts':['../model/json','../model/types','./types'],
 'sql.ts':['../model/schema-literals','../extensions/tables','./types','./configuration','./temporal'],
 'temporal.ts':['../extensions/tables/temporal'],
 'policies.ts':['../extensions/tables','./types','./configuration','./sql'],
 'ddl.ts':['../compilation/bundle/hash','../extensions/tables','./types','./configuration','./sql','./policies','./domains'],
 'domains.ts':['../model/types','../extensions/tables','./configuration','./sql'],
 'index.ts':['../model/json','../model/document','../model/types','../compilation/bundle/hash','../extensions/tables','./configuration','./ddl','./sql','./types'],
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
 const errors=checkTableDeploymentBoundaries(sources);
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Table deployment boundaries: '+Object.keys(sources).length+' pure browser modules; inert SQL; no host I/O');
}
