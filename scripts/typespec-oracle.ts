import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'umf-typespec-'));
const rows=[];
try{
 for(const [name,path,expected]of [['roundtrip','fixtures/typespec/roundtrip-sources.json',true],['edited','fixtures/typespec/invalid-edited-sources.json',false]] as const){
  const bundle=await Bun.file(path).json();
  for(const [file,text]of Object.entries(bundle.files)){const target=join(temp,name,file);await mkdir(dirname(target),{recursive:true});await Bun.write(target,text as string);}
  const child=Bun.spawn(['bun',resolve('node_modules/@typespec/compiler/cmd/tsp.js'),'compile',join(temp,name,bundle.entrypoint),'--no-emit'],{stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr,status]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  if((status===0)!==expected)throw new Error(name+' unexpected CLI result: '+stdout+stderr);
  if(!expected&&!/unassignable/.test(stdout+stderr))throw new Error('CLI failed without the expected semantic diagnostic: '+stdout+stderr);
  rows.push({name,expectedValid:expected,exitCode:status,...(!expected?{expectedDiagnostic:'unassignable'}:{})});
 }
 await Bun.write('fixtures/typespec/compiler-oracle-results.json',JSON.stringify({compiler:'@typespec/compiler@1.16.0',runtime:Bun.version,cases:rows,scope:'Native CLI with filesystem host checks round-tripped source and semantic edit; same compiler implementation as browser host, not independent compiler evidence'},null,2)+'\n');
 console.log('TypeSpec native CLI: round-tripped bundle accepted and invalid semantic edit rejected');
}finally{await rm(temp,{recursive:true,force:true});}
