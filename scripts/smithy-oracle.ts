import {ensureSmithyRuntime} from './smithy-runtime';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importSmithyJson,exportSmithyJson,proposeSmithyNodeEdit,writeDocument,readDocument} from '../src';
const jars=await ensureSmithyRuntime();
const temp=await mkdtemp(join(tmpdir(),'umf-smithy-'));
try{
 const manifest=await Bun.file('fixtures/smithy/upstream/manifest.json').json();
 const paths=['fixtures/smithy/domain.json',...manifest.files.filter((x:any)=>x.file.endsWith('.json')).map((x:any)=>'fixtures/smithy/upstream/'+x.file)];
 const args:string[]=[];for(const [i,path]of paths.entries()){
  const doc=importSmithyJson(await Bun.file(path).text(),{id:'oracle'});const restored=readDocument(writeDocument(doc,'yaml'),'yaml');
  const target=join(temp,i+'.json');await Bun.write(target,exportSmithyJson(restored));args.push(path,target);
 }
 const source=importSmithyJson(await Bun.file(paths[0]!).text(),{id:'edit'});
 for(const [name,target]of [['valid','smithy.api#Integer'],['invalid','sales#Missing']]){
  const path=join(temp,name+'.json');await Bun.write(path,exportSmithyJson(proposeSmithyNodeEdit(source,'/shapes/sales#Order/members/id/target',JSON.stringify(target)).document));args.push(path);
 }
 const run=Bun.spawn(['java','-cp','.cache/smithy/*','native/smithy/Oracle.java',...args],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,status]=await Promise.all([new Response(run.stdout).text(),new Response(run.stderr).text(),run.exited]);if(status)throw new Error(stderr);
 const rows=stdout.trim().split('\n').map(line=>JSON.parse(line));if(rows.length!==args.length)throw new Error('Missing native results');
 const results=[];
 for(let i=0;i<paths.length;i++){
  const before=rows[2*i],after=rows[2*i+1];
  if(before.valid!==after.valid||before.modelSha256!==after.modelSha256||JSON.stringify(before.events)!==JSON.stringify(after.events))throw new Error('Smithy native round-trip mismatch: '+paths[i]);
  results.push({file:paths[i],valid:before.valid,events:before.events,modelSha256:before.modelSha256??null});
 }
 if(!results[0]!.valid||rows.at(-2).modelSha256===results[0]!.modelSha256||!rows.at(-2).valid||rows.at(-1).valid||!rows.at(-1).events.some((x:string)=>x.includes('Target')))throw new Error('Smithy native edit validation mismatch');
 await Bun.write('fixtures/smithy/oracle-results.json',JSON.stringify({oracle:'software.amazon.smithy:smithy-model:1.73.0',jars,cases:results,nativeValid:results.filter(r=>r.valid).length,editedValid:{valid:rows.at(-2).valid,events:rows.at(-2).events,modelSha256:rows.at(-2).modelSha256},editedInvalid:{valid:rows.at(-1).valid,events:rows.at(-1).events},scope:'Independent JVM assembly outcomes/events and canonical model hashes before/after UMF YAML; not browser semantic validation or IDL round-trip evidence'},null,2)+'\n');
 console.log(`Smithy JVM: ${results.length} native round-trip comparisons, ${results.filter(r=>r.valid).length} valid; valid edit accepted and unresolved target rejected`);
}finally{await rm(temp,{recursive:true,force:true});}
