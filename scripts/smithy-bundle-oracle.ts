import {ensureSmithyRuntime} from './smithy-runtime';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importSmithyJson,exportSmithyBundle,proposeSmithyNodeEdit,writeDocument,readDocument} from '../src';
const jars=await ensureSmithyRuntime();const temp=await mkdtemp(join(tmpdir(),'umf-smithy-bundle-'));
try{
 const dependency=await Bun.file('fixtures/smithy/bundles/widget.json').text();
 const args:string[]=[];const names:string[]=[];
 async function files(name:string,root:string,deps:string[]){const dir=join(temp,name);await mkdir(dir);await Bun.write(join(dir,'root.json'),root);for(const [i,text]of deps.entries())await Bun.write(join(dir,'dependency-'+i+'.json'),text);args.push(dir);names.push(name);}
 for(const [index,file]of ['service-with-rename.json','use/use-shapes.json'].entries()){
  const root=await Bun.file('fixtures/smithy/upstream/'+file).text();const doc=importSmithyJson(root,{id:'bundle',dependencies:[{id:'widget',schema:dependency}]});
  await files(index+'-original',root,[dependency]);
  const out=exportSmithyBundle(readDocument(writeDocument(doc,'yaml'),'yaml'));await files(index+'-restored',out.schema,out.dependencies.map(d=>d.schema));
  const path='/shapes/foo.example#Widget/members/id/target';
  for(const [label,target]of [['edited','smithy.api#Integer'],['invalid','foo.example#Missing']]){
   const edited=exportSmithyBundle(proposeSmithyNodeEdit(doc,path,JSON.stringify(target),'widget').document);await files(index+'-'+label,edited.schema,edited.dependencies.map(d=>d.schema));
  }
  // Preserve conflicting definitions for the assembler to reject; never silently merge.
  await files(index+'-conflict',root,[dependency,'{"smithy":"2.0","shapes":{"foo.example#Widget":{"type":"string"}}}']);
 }
 const run=Bun.spawn(['java','-cp','.cache/smithy/*','native/smithy/Oracle.java',...args],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,status]=await Promise.all([new Response(run.stdout).text(),new Response(run.stderr).text(),run.exited]);if(status)throw new Error(stderr);
 const rows=stdout.trim().split('\n').map((line,i)=>{const {path,...row}=JSON.parse(line);return {name:names[i],...row};});if(rows.length!==10)throw new Error('Missing bundle results');
 for(let i=0;i<rows.length;i+=5){
  const [original,restored,edited,invalid,conflict]=rows.slice(i,i+5);
  if(!original.valid||!restored.valid||original.modelSha256!==restored.modelSha256||JSON.stringify(original.events)!==JSON.stringify(restored.events)||!edited.valid||edited.modelSha256===original.modelSha256||invalid.valid||!invalid.events.some((x:string)=>x.includes('Target.UnresolvedShape'))||conflict.valid)throw new Error('Native bundle checks failed: '+JSON.stringify(rows.slice(i,i+5)));
 }
 await Bun.write('fixtures/smithy/bundles/oracle-results.json',JSON.stringify({oracle:'software.amazon.smithy:smithy-model:1.73.0',jars,cases:rows,scope:'Two upstream ASTs with an explicitly authored Widget dependency. Native original/restored assembly agrees; dependency edits change models; unresolved references and conflicting definitions fail. Standalone corpus baseline remains unchanged.'},null,2)+'\n');
 console.log('Smithy bundles: ten native assembly cases verify restored context, dependency edits, unresolved targets and conflicting definitions');
}finally{await rm(temp,{recursive:true,force:true});}
