// SPDX-License-Identifier: MIT OR Apache-2.0
import ts from 'typescript-api';
import {readdir,readFile} from 'node:fs/promises';
const model=['../../model/types','../../model/schema-literals'];
const owners:Record<string,readonly string[]>={
 'types.ts':model,
 'temporal.ts':['../../model/types'],
 'context.ts':[...model,'./types','./temporal'],
 'expressions.ts':['../../model/types','./context','./types'],
 'columns.ts':[...model,'./context','./expressions','./types'],
 'policies.ts':['./context','./types'],
 'seeds.ts':['./columns','./context','./types'],
 'operations.ts':['../../model/schema-literals','../../../spec/extensions/tables/operation.schema.json','../../../spec/extensions/tables/schema.json','../../validation/schema','./columns','./context','./types'],
 'index.ts':['../../../spec/extensions/tables/package.json','../../model/types','../../model/json','../../registry/registry','../../validation/document','./context','./columns','./policies','./seeds','./operations','./types'],
};
const forbidden=new Set(['Bun','process','require','fetch','eval','Function','Buffer','XMLHttpRequest','WebSocket','Deno','globalThis','window','postMessage']);
export function checkTableLifecycleBoundaries(sources:Record<string,string>):string[]{
 const errors:string[]=[];
 for(const[file,text]of Object.entries(sources)){
  if(!owners[file]){errors.push(file+': module has no declared owner');continue;}
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node):void=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!owners[file]!.includes(node.moduleSpecifier.text))errors.push(file+': unapproved dependency '+node.moduleSpecifier.text);
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)errors.push(file+': dynamic import');
   if(ts.isIdentifier(node)&&forbidden.has(node.text))errors.push(file+': host/executable hook '+node.text);
   ts.forEachChild(node,visit);
  };
  visit(source);
 }
 return errors;
}
if(import.meta.main){
 const base=new URL('../src/extensions/tables/',import.meta.url),files=(await readdir(base)).filter(f=>f.endsWith('.ts'));
 const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,base),'utf8')]))),errors=checkTableLifecycleBoundaries(sources);
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Table lifecycle boundaries: '+files.length+' pure browser modules; explicit owners; no host I/O or executable schema');
}
