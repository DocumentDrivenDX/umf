// SPDX-License-Identifier: MIT OR Apache-2.0
/** Checks the portable generator and the shipped Python template, without importing it. */
import ts from 'typescript-api';
import {readFile,readdir} from 'node:fs/promises';
import {pythonRuntime} from '../src/access/python-runtime';
const allowed=new Set(['../model/document','../model/types','../extensions/actions/structure','../extensions/actions/analysis','../extensions/actions/types','../compilation/bundle/index','./python-runtime']);
const nativeImports:Record<string,readonly string[]>={
 'index.ts':['./table-runtime','./table-client','./types'],
 'table-client.ts':['../extensions/tables','./types'],
};
const forbidden=new Set(['Bun','process','require','fetch','eval','Function','Buffer','XMLHttpRequest','WebSocket']);
const errors:string[]=[];
for(const file of await readdir(new URL('../src/access',import.meta.url))){
 if(!file.endsWith('.ts'))continue;
 const source=ts.createSourceFile(file,await readFile(new URL('../src/access/'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 function visit(node:ts.Node){
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&!allowed.has(node.moduleSpecifier.text)&&!nativeImports[file]?.includes(node.moduleSpecifier.text))errors.push(file+': unapproved import '+node.moduleSpecifier.text);
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)errors.push(file+': dynamic import');
  if(ts.isIdentifier(node)&&forbidden.has(node.text))errors.push(file+': host or executable hook '+node.text);
  ts.forEachChild(node,visit);
 }
 visit(source);
}
const imports=[...pythonRuntime.matchAll(/^[ \t]*(?:from|import) ([\w.]+)/gm)].map(m=>m[1]!.split('.')[0]);
const stdlib=new Set(['__future__','asyncio','collections','dataclasses','datetime','decimal','enum','typing','uuid','base64','re','inspect','math']);
for(const module of imports)if(!stdlib.has(module!))errors.push('Python template: unapproved import '+module);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Unified client boundaries: portable generator; stdlib-only request builders; no SQL compiler or host I/O');
