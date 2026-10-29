// SPDX-License-Identifier: MIT OR Apache-2.0
/** Checks the portable generator and the shipped Python template, without importing it. */
import ts from 'typescript-api';
import {readFile,readdir} from 'node:fs/promises';
import {pythonRuntime} from '../src/access/python-runtime';
// Portable-generator dependencies are restricted to the audited predecessor
// files below. Every Rust facade/resource file has its own exact imports; a
// new file requires an explicit entry and cannot inherit another file's grants.
const allowedImports:Record<string,readonly string[]>={
 'codegen-resources.ts':['../../spec/core/schema.json','../../spec/core/semantic-type-reference.schema.json','../../spec/core/extension-package.schema.json','../../spec/metamodel/generated/core-constraints.json','../../spec/metamodel/generated/domain-policy.json','../../spec/extensions/tables/package.json','../../spec/extensions/actions/package.json','../../spec/extensions/binding/package.json','../../spec/extensions/binding-stable/package.json'],
 'constants.ts':[],
 'core-model-resources.ts':['../../spec/core/schema.json','../../spec/core/semantic-type-reference.schema.json','../../spec/core/extension-package.schema.json','../../spec/metamodel/generated/core-constraints.json','../../spec/metamodel/generated/domain-policy.json'],
 'index.ts':['../model/document','../model/types','../extensions/actions/structure','../extensions/actions/analysis','../extensions/actions/types','../compilation/bundle/index','./python-runtime','./table-runtime','./table-client','./constants','./types'],
 'python-runtime.ts':['./constants'],
 'read-json-value-ordinary.ts':['../model/errors','../model/types'],
 'rust-bit128-default.ts':['../model/bit128','../model/uuid','../model/errors'],
 'rust-candidate.ts':[],
 'rust-cardinality-default.ts':['../model/cardinality','../model/types','../model/errors'],
 'rust-kind-nullability-default.ts':['../model/field-kind','../model/nullability','../model/types','../model/errors'],
 'rust-core-inspectors-default.ts':['../model/scalar-type','../model/record-members','../model/reference-links','../model/types','../model/errors'],
 'rust-core-bit128-field-default.ts':['../model/errors'],
 'rust-core-semantic-types-default.ts':['../model/errors','../model/semantic-types','../model/types'],
 'rust-core-evolution-candidate.ts':['../model/types','../model/evolution','../model/errors'],
 'rust-csv-boolean-default.ts':['../model/csv-boolean-lexical','../model/types','../model/errors'],
 'rust-dataset-values-compact-default.ts':['../model/dataset-values','../model/dataset-values-compact','../model/types','../model/errors'],
 'rust-default-v4.ts':['./rust-candidate'],
 'rust-facets-default.ts':['../model/facets','../model/types','../model/json','../model/errors'],
 'rust-host-reads-v3.ts':['./rust-candidate'],
 'rust-host-reads-v4.ts':['./rust-candidate','./rust-host-reads-v3'],
 'rust-keys-default.ts':['../model/keys','../model/key-tuple','../model/types','../model/json','../model/errors'],
 'rust-key-tuple-default.ts':['../model/key-tuple','../model/types','../model/errors'],
 'rust-javascript-numeric-default.ts':['../adapters/javascript-numeric','../model/json','../model/errors'],
 'rust-relationships-default.ts':['../model/relationships','../model/types','../model/json','../model/errors'],
 'rust-record-type-default.ts':['../model/field-kind','../model/record-type','../model/types','../model/json','../model/errors'],
 'rust-record-values-default.ts':['../model/record-values'],
 'rust-schema-properties-default.ts':['../model/schema-properties','../model/schema-literals','../model/types'],
 'rust-scalar-types-for-version-default.ts':[],
 'rust-semantic-types-default.ts':['../model/errors','../model/semantic-types','../model/types','../extensions/semantic-types'],
 'rust-selection-default.ts':['../model/selection','../model/types','../registry/registry'],
 'rust-runtime.ts':['../model/errors','./rust-candidate','./rust-host-reads-v3','./rust-host-reads-v4'],
 'table-client.ts':['../model/types','../extensions/tables','./types'],
 'table-runtime.ts':[],
 'types.ts':[],
};
// These predecessor modules supply declarations only. A value import would
// restore executable TypeScript behavior behind the Rust-selected facade.
const typeOnlyImports:Record<string,readonly string[]>={
 'read-json-value-ordinary.ts':['../model/types'],
 'rust-core-evolution-candidate.ts':['../model/types','../model/evolution'],
 'rust-core-semantic-types-default.ts':['../model/semantic-types','../model/types'],
 'rust-record-type-default.ts':['../model/field-kind','../model/record-type','../model/types'],
 'rust-kind-nullability-default.ts':['../model/field-kind','../model/nullability','../model/types'],
 'rust-record-values-default.ts':['../model/record-values'],
 'rust-selection-default.ts':['../model/selection','../model/types','../registry/registry'],
 'rust-semantic-types-default.ts':['../model/semantic-types','../model/types','../extensions/semantic-types'],
 'rust-javascript-numeric-default.ts':['../adapters/javascript-numeric'],
 'rust-key-tuple-default.ts':['../model/key-tuple','../model/types'],
};
// Block host roots as well as the commonly used hooks themselves. Checking
// only `fetch`/`process` identifiers leaves equivalent access through
// `window.fetch`, `self.fetch`, or `global.process` undetected.
const forbidden=new Set(['Bun','process','require','fetch','eval','Function','Buffer','XMLHttpRequest','WebSocket','Deno','globalThis','global','window','self','document','navigator','location','importScripts','Worker','SharedWorker']);
export function checkAccessSource(file:string,text:string):string[]{
 const errors:string[]=[];
 const allowedForFile=allowedImports[file];
 if(allowedForFile===undefined)errors.push(file+': missing per-file import allowlist');
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const parseDiagnostics=(source as ts.SourceFile&{parseDiagnostics?:readonly ts.Diagnostic[]}).parseDiagnostics??[];
 for(const diagnostic of parseDiagnostics)errors.push(file+': TypeScript parse error '+diagnostic.code);
 function visit(node:ts.Node){
  // TypeScript represents `import x = require('module')` without a `require`
  // identifier, so the host-hook check below cannot catch this import form.
  if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)){
   const module=node.moduleReference.expression;
   errors.push(file+': external import equals '+(module&&ts.isStringLiteral(module)?module.text:'<nonliteral>'));
  }
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
   const module=node.moduleSpecifier.text;
   if(!allowedForFile?.includes(module))errors.push(file+': unapproved import '+module);
   else if(typeOnlyImports[file]?.includes(module)&&!node.importClause?.isTypeOnly)errors.push(file+': value import from type-only module '+module);
  }
  if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal)&&!allowedForFile?.includes(node.argument.literal.text))errors.push(file+': unapproved import type '+node.argument.literal.text);
  if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
   const module=node.moduleSpecifier.text;
   if(!allowedForFile?.includes(module))errors.push(file+': unapproved import '+module);
   else if(typeOnlyImports[file]?.includes(module)&&!node.isTypeOnly)errors.push(file+': value re-export from type-only module '+module);
  }
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)errors.push(file+': dynamic import');
  if(ts.isIdentifier(node)&&forbidden.has(node.text))errors.push(file+': host or executable hook '+node.text);
  ts.forEachChild(node,visit);
 }
 visit(source);
 return errors;
}
if(import.meta.main){
 const errors:string[]=[];
 for(const entry of await readdir(new URL('../src/access',import.meta.url),{withFileTypes:true})){
  const file=entry.name;
  if(!entry.isFile()||!file.endsWith('.ts')){
   errors.push('src/access: unreviewed file or directory '+file);
   continue;
  }
  errors.push(...checkAccessSource(file,await readFile(new URL('../src/access/'+file,import.meta.url),'utf8')));
 }
 const imports=[...pythonRuntime.matchAll(/^[ \t]*(?:from|import) ([\w.]+)/gm)].map(m=>m[1]!.split('.')[0]);
 const stdlib=new Set(['__future__','asyncio','collections','dataclasses','datetime','decimal','enum','typing','uuid','base64','re','inspect','math']);
 for(const module of imports)if(!stdlib.has(module!))errors.push('Python template: unapproved import '+module);
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Unified client boundaries: portable generator; stdlib-only request builders; no SQL compiler or host I/O');
}
