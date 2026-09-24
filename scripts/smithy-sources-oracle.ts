import {ensureSmithyRuntime} from './smithy-runtime';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importSmithySources,exportSmithySources,proposeSmithySourceEdit,writeDocument,readDocument} from '../src';
const jars=await ensureSmithyRuntime();const temp=await mkdtemp(join(tmpdir(),'umf-smithy-sources-'));
try{
 const manifest=await Bun.file('fixtures/smithy/idl-upstream/manifest.json').json();const entries=manifest.files.filter((x:any)=>x.file.endsWith('.smithy'));const paths:string[]=[];
 for(const [i,row]of entries.entries()){
  const path='fixtures/smithy/idl-upstream/'+row.file;const text=await Bun.file(path).text();const doc=importSmithySources({files:{[row.file]:text}},{id:'oracle'});
  const restored=exportSmithySources(readDocument(writeDocument(doc,'yaml'),'yaml'));const target=join(temp,i+'.smithy');await Bun.write(target,restored.files[row.file]!);paths.push(path,target);
 }
 const files={'main.smithy':await Bun.file('fixtures/smithy/idl/main.smithy').text(),'common.smithy':await Bun.file('fixtures/smithy/idl/common.smithy').text()};
 const doc=importSmithySources({files},{id:'authored'});
 const variants=[doc,readDocument(writeDocument(doc,'yaml'),'yaml'),proposeSmithySourceEdit(doc,'common.smithy',files['common.smithy'].replace('min: 1','min: 2')).document,proposeSmithySourceEdit(doc,'main.smithy',files['main.smithy'].replace('id: OrderId','id: Missing')).document];
 for(const [i,variant]of variants.entries()){const dir=join(temp,'bundle-'+i);await mkdir(dir);for(const [name,text]of Object.entries(exportSmithySources(variant).files))await Bun.write(join(dir,name),text);paths.push(dir);}
 const run=Bun.spawn(['java','-cp','.cache/smithy/*','native/smithy/Oracle.java',...paths],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,status]=await Promise.all([new Response(run.stdout).text(),new Response(run.stderr).text(),run.exited]);if(status)throw new Error(stderr);
 const rows=stdout.trim().split('\n').map(line=>JSON.parse(line));if(rows.length!==paths.length)throw new Error('Missing source results');const cases=[];
 for(let i=0;i<entries.length;i++){
  const a=rows[2*i],b=rows[2*i+1];if(a.valid!==b.valid||a.modelSha256!==b.modelSha256||JSON.stringify(a.events)!==JSON.stringify(b.events))throw new Error('IDL native mismatch: '+entries[i].file);
  cases.push({file:entries[i].file,valid:a.valid,events:a.events,modelSha256:a.modelSha256??null});
 }
 const [original,restored,edited,invalid]=rows.slice(-4);if(!original.valid||!restored.valid||original.modelSha256!==restored.modelSha256||!edited.valid||edited.modelSha256===original.modelSha256||invalid.valid||!invalid.events.some((x:string)=>x.includes('Target.UnresolvedShape')))throw new Error('IDL candidate checks failed: '+JSON.stringify(rows.slice(-4)));
 await Bun.write('fixtures/smithy/idl/oracle-results.json',JSON.stringify({oracle:'software.amazon.smithy:smithy-model:1.73.0',jars,cases,nativeValid:cases.filter(x=>x.valid).length,authored:rows.slice(-4).map(({path,...row})=>row),scope:'Exact IDL source archives compared by native assembly and canonical hashes; mixed-file source support does not imply browser parsing or semantic validation'},null,2)+'\n');
 console.log(`Smithy IDL: ${cases.length} native round-trip comparisons (${cases.filter(x=>x.valid).length} standalone valid); authored bundle round trip, meaningful edit and unresolved-target rejection verified`);
}finally{await rm(temp,{recursive:true,force:true});}
