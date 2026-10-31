// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import ts from 'typescript-api';

async function exists(path:string):Promise<boolean>{
 try{return (await stat(path)).isFile();}catch(error){if(['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code??''))return false;throw error;}
}
async function declarationFiles(root:string):Promise<string[]>{
 const files:string[]=[];
 for(const entry of await readdir(root,{withFileTypes:true})){
  const path=join(root,entry.name);
  if(entry.isDirectory())files.push(...await declarationFiles(path));
  else if(entry.isFile()&&/\.d\.[cm]?ts$/.test(entry.name))files.push(path);
 }
 return files;
}

/** Emit declaration imports that work in standard Node ESM consumers too.
 * Runtime code is bundled separately; only declaration module paths change. */
export async function normalizeSdkDeclarations(dist:string):Promise<void>{
 for(const file of await declarationFiles(dist)){
  const text=await readFile(file,'utf8');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const literals:ts.StringLiteralLike[]=[];
  const edits:{start:number;end:number;text:string}[]=[];
  const visit=(node:ts.Node):void=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier)){
    literals.push(node.moduleSpecifier);
    const typeOnly=ts.isImportDeclaration(node)?node.importClause?.isTypeOnly:node.isTypeOnly;
    if(node.moduleSpecifier.text.endsWith('.json')&&!node.attributes&&!typeOnly)
     edits.push({start:node.moduleSpecifier.end,end:node.moduleSpecifier.end,text:' with {type: "json"}'});
   }
   else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteralLike(node.argument.literal))literals.push(node.argument.literal);
   else if(ts.isExternalModuleReference(node)&&ts.isStringLiteralLike(node.expression))literals.push(node.expression);
   ts.forEachChild(node,visit);
  };
  visit(source);
  for(const literal of literals){
   const name=literal.text;
   if(!name.startsWith('.')||/\.(?:[cm]?js|json|d\.[cm]?ts)$/.test(name))continue;
   const target=resolve(dirname(file),name);
   let replacement:string|undefined;
   if(await exists(target+'.d.ts'))replacement=name+'.js';
   else if(await exists(target+'.d.mts'))replacement=name+'.mjs';
   else if(await exists(target+'.d.cts'))replacement=name+'.cjs';
   else if(await exists(join(target,'index.d.ts')))replacement=name.replace(/\/$/,'')+'/index.js';
   if(replacement)edits.push({start:literal.getStart(source)+1,end:literal.end-1,text:replacement});
  }
  let output=text;
  for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  if(output!==text)await writeFile(file,output);
 }
}

if(import.meta.main){
 if(!process.argv[2])throw new Error('Usage: bun scripts/sdk-declarations.ts <dist>');
 await normalizeSdkDeclarations(resolve(process.argv[2]));
}
