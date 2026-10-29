// SPDX-License-Identifier: MIT OR Apache-2.0
import ts from 'typescript-api';
import {readdir,readFile} from 'node:fs/promises';
const owners:Record<string,readonly string[]>={
 'migration/index.ts':['./options','./reviewed','./phases','./phases-options','../model/json','../model/document','../model/types','../compilation/bundle/hash','../table-deployment','../table-deployment/sql','./g04-conversion','./g03-defaults','../table-deployment/policies','../table-deployment/types','../extensions/tables','./internal-operations','./g02-field-effects','../table-deployment/grants','./inventory','./inventory-options','./inventory-review'],
 // Migration options close the admitted backfill inputs using the table-owned,
 // pure row-expression reference walker; this does not grant lowering authority.
 'migration/options.ts':['../model/document','../model/types','../compilation/bundle/hash','../table-deployment','../extensions/tables','../extensions/tables/row-expressions','./reviewed','./g03-defaults','./g11-source','./g04-conversion'],
 'migration/reviewed.ts':['../compilation/bundle/hash','../model/document','../table-deployment','../model/types','./g03-defaults'],
 'migration/phases.ts':['../table-deployment','./phases-options'],
 'migration/phases-options.ts':['../extensions/tables'],
 'authoring/row-scope.ts':['../model/json','../model/types','../extensions/tables'],
 'types.ts':['../model/types','../extensions/tables'],
 'configuration.ts':['../model/json','../model/types','./types'],
 'sql.ts':['../model/schema-literals','../extensions/tables','./types','./configuration','./temporal'],
 'temporal.ts':['../extensions/tables/temporal'],
 'policies.ts':['../extensions/tables','./types','./configuration','./sql'],
 'ddl.ts':['../compilation/bundle/hash','../extensions/tables','./types','./configuration','./sql','./policies','./domains','./grants'],
 'domains.ts':['../model/types','../extensions/tables','./configuration','./sql'],
 'index.ts':['../model/json','../model/document','../model/types','../compilation/bundle/hash','../extensions/tables','./configuration','./ddl','./sql','./types'],
 'grants.ts':['../extensions/tables/types','./sql'],
 'migration/internal-operations.ts':['../table-deployment/grants'],
 'migration/inventory-verified-deployment.ts':['../compilation/bundle/hash','./inventory-component-copy','../table-deployment'],
 'migration/inventory-history.ts':['../compilation/bundle/hash','../table-deployment','./index','./inventory-r2-context','./inventory-verified-deployment'],
 'migration/g04-conversion.ts':['../compilation/bundle/hash','../model/document','../model/json','../model/types','../table-deployment','./index','./options','./reviewed'],
 'migration/g02-field-effects.ts':['../extensions/tables','../table-deployment/sql','../table-deployment/grants'],
 'migration/inventory-graph.ts':['../compilation/bundle/hash'],
 'migration/inventory-component-copy.ts':['../model/errors'],
 'migration/inventory.ts':['../compilation/bundle/hash','../model/document','../table-deployment','../model/errors','../model/json','./inventory-component-copy','./inventory-r2-context','./inventory-graph','./inventory-projection','./inventory-options','./inventory-history','./inventory-verified-deployment','./inventory-g02-source','./inventory-g05-selection','./internal','./options','./reviewed','./g02-field-effects','../table-deployment/grants','../extensions/tables/types','../table-deployment/sql','../table-deployment/types','./inventory-review','../model/types'],
 'migration/inventory-source.ts':['./inventory-projection','./inventory'],
 'migration/inventory-effects.ts':['./inventory'],
 'migration/inventory-g05-selection.ts':['../table-deployment','../compilation/bundle/hash','../model/json','./inventory-options'],
 'migration/internal.ts':['./index','./internal-operations','../compilation/bundle/hash','../model/json','./options','../table-deployment','../model/document','./g02-field-effects','./inventory-verified-deployment'],
 'migration/inventory-projection.ts':['../table-deployment','../table-deployment/types','../table-deployment/grants','../compilation/bundle/hash','../model/json','./inventory-g05-selection','./inventory-operation-references','../extensions/tables/types','./inventory-verified-deployment'],
 'migration/inventory-operation-references.ts':['../extensions/tables/types','../compilation/bundle/hash'],
 'migration/inventory-g02-source.ts':['../table-deployment','../extensions/tables/types','../compilation/bundle/hash','./inventory-options','./inventory-operation-references'],
 'migration/inventory-review.ts':['./inventory-options','./inventory'],
 'migration/g03-defaults.ts':['../model/document','../model/json','../model/schema-literals','../model/types','../extensions/tables','../table-deployment','../table-deployment/sql','../extensions/tables/temporal','../compilation/bundle/hash','./reviewed'],
 'migration/g11-source.ts':['../compilation/bundle/hash','../model/json','../model/document','../table-deployment','./reviewed'],
 'migration/inventory-r2-context.ts':['../compilation/bundle/hash','./inventory-component-copy','../table-deployment','./inventory-projection','./inventory-g05-selection','../extensions/tables/row-expressions'],
 'migration/inventory-options.ts':['../compilation/bundle/hash','../table-deployment','./index','./inventory-g05-selection','./inventory-verified-deployment','./inventory-r2-context'],
};
const forbidden=new Set(['Bun','process','require','fetch','eval','Function','Buffer','XMLHttpRequest','WebSocket','Deno','globalThis','window','postMessage']);
const accountingTypeFiles=new Set(['temporal.ts','sql.ts','index.ts','types.ts','domains.ts','grants.ts','migration/internal.ts','migration/inventory-component-copy.ts','migration/inventory-g05-selection.ts','migration/inventory-graph.ts','migration/inventory-history.ts','migration/inventory-options.ts','migration/inventory-projection.ts','migration/inventory-r2-context.ts','migration/inventory-verified-deployment.ts','migration/inventory.ts']);
function exactAccountingTypeRoute(file:string,node:ts.Node):boolean{
 if(!accountingTypeFiles.has(file)||!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||node.moduleSpecifier.text!=='../model/internal/accounting-context')return false;
 const clause=node.importClause,bindings=clause?.namedBindings;
 return Boolean(clause?.isTypeOnly&&!clause.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length===1&&!bindings.elements[0]!.propertyName&&bindings.elements[0]!.name.text==='AccountingContext'&&!bindings.elements[0]!.isTypeOnly);
}
const r2InventoryOptionTypes=new Set(['TableInventoryArchiveSource','TableInventoryDiscoveryConversion','TableInventoryDiscoveryIntent','TableInventoryRetirement','TableInventorySourceHistory']);
function exactR2InventoryOptionTypesRoute(file:string,node:ts.Node):boolean{
 if(file!=='migration/inventory-r2-context.ts'||!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||node.moduleSpecifier.text!=='./inventory-options')return false;
 const clause=node.importClause,bindings=clause?.namedBindings;
 if(!clause||!clause.isTypeOnly||clause.name||!bindings||!ts.isNamedImports(bindings)||bindings.elements.length!==r2InventoryOptionTypes.size||bindings.elements.some(element=>element.propertyName||element.isTypeOnly))return false;
 const names=bindings.elements.map(element=>element.name.text);
 return new Set(names).size===r2InventoryOptionTypes.size&&names.every(name=>r2InventoryOptionTypes.has(name));
}
function exactDocumentAccountingRoute(file:string,node:ts.Node):boolean{
 if(!['index.ts','migration/internal.ts'].includes(file)||!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||node.moduleSpecifier.text!=='../model/document-accounting')return false;
 const clause=node.importClause,bindings=clause?.namedBindings;
 return Boolean(clause&&!clause.isTypeOnly&&!clause.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length===1&&!bindings.elements[0]!.propertyName&&bindings.elements[0]!.name.text==='readJsonDocumentWithAccounting'&&!bindings.elements[0]!.isTypeOnly);
}
export function checkTableDeploymentBoundaries(sources:Record<string,string>):string[]{
 const errors:string[]=[];
 for(const[file,text]of Object.entries(sources)){
  if(!owners[file]){errors.push(file+': module has no declared owner');continue;}
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node):void=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!owners[file]!.includes(node.moduleSpecifier.text)&&!exactAccountingTypeRoute(file,node)&&!exactR2InventoryOptionTypesRoute(file,node)&&!exactDocumentAccountingRoute(file,node))errors.push(file+': unapproved dependency '+node.moduleSpecifier.text);
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
