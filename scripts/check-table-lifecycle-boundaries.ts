// SPDX-License-Identifier: MIT OR Apache-2.0
import ts from 'typescript-api';
import {readdir,readFile} from 'node:fs/promises';
const model=['../../model/types','../../model/schema-literals'];
const owners:Record<string,readonly string[]>={
 'types.ts':model,
 'temporal.ts':['../../model/types'],
 'context.ts':[...model,'./types','./temporal'],
 'expressions.ts':['../../model/types','./context','./types'],
 // Reuse the exact core coefficient parser so row-expression numeric typing
 // admits precisely the core literal grammar without reinterpreting tokens.
 'row-expressions.ts':['../../model/types','../../model/schema-literals','./context','./types'],
 'columns.ts':[...model,'./context','./expressions','./types'],
 'policies.ts':['./context','./types'],
 'seeds.ts':['./columns','./context','./types'],
 'operations.ts':['../../model/schema-literals','../../../spec/extensions/tables/operation.schema.json','../../../spec/extensions/tables/operation-0.2.schema.json','../../../spec/extensions/tables/schema.json','../../validation/schema','./columns','./context','./row-expressions','./types'],
 'index.ts':['../../../spec/extensions/tables/package.json','../../model/types','../../model/json','../../registry/registry','../../validation/document','./context','./columns','./policies','./seeds','./operations','./types'],
};
const forbidden=new Set(['Bun','process','require','fetch','eval','Function','Buffer','XMLHttpRequest','WebSocket','Deno','globalThis','window','postMessage']);
function exactAccountingTypeRoute(file:string,node:ts.Node):boolean{
 if(!['context.ts','index.ts'].includes(file)||!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||node.moduleSpecifier.text!=='../../model/internal/accounting-context')return false;
 const clause=node.importClause,bindings=clause?.namedBindings;
 return Boolean(clause?.isTypeOnly&&!clause.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length===1&&!bindings.elements[0]!.propertyName&&bindings.elements[0]!.name.text==='AccountingContext'&&!bindings.elements[0]!.isTypeOnly);
}
export function checkTableLifecycleBoundaries(sources:Record<string,string>):string[]{
 const errors:string[]=[];
 for(const[file,text]of Object.entries(sources)){
  if(!owners[file]){errors.push(file+': module has no declared owner');continue;}
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node):void=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!owners[file]!.includes(node.moduleSpecifier.text)&&!exactAccountingTypeRoute(file,node))errors.push(file+': unapproved dependency '+node.moduleSpecifier.text);
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
