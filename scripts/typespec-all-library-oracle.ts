import {compile,NodeHost} from '@typespec/compiler';
import {mkdtemp,mkdir,rm,symlink} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const report=await Bun.file('fixtures/typespec/all-library-corpus-results.json').json();
const temp=await mkdtemp(join(tmpdir(),'umf-typespec-corpus-'));
const rows=[];
await mkdir(join(temp,'node_modules/@typespec'),{recursive:true});
for(const name of Object.keys(report.libraries))await symlink(resolve('node_modules/'+name),join(temp,'node_modules',name),'dir');
try{
 for(const row of report.programs){
  if(row.status==='syntax-rejected')continue;
  const folder=dirname(row.entry);const root=join(temp,folder);
  for(const name of row.sourceFiles){const target=join(root,name);await mkdir(dirname(target),{recursive:true});await Bun.write(target,await Bun.file('fixtures/typespec/upstream/'+folder+'/'+name).text());}
  const program=await compile(NodeHost,join(root,basename(row.entry)),{noEmit:true});
  const codes=program.diagnostics.map(d=>d.code).sort();
  if(row.status==='syntax-rejected'){
   if(!program.hasError()||!codes.includes('token-expected'))throw new Error('Native parser did not reject the invalid editor fixture');
  }else{
   if(!program.hasError()!==(row.status==='compiled'))throw new Error('Host acceptance differs: '+row.entry);
   if(JSON.stringify(codes)!==JSON.stringify(row.diagnostics.map((d:any)=>d.code).sort()))throw new Error('Host diagnostic codes differ: '+row.entry);
  }
  rows.push({entry:row.entry,valid:!program.hasError(),diagnosticCodes:codes});
 }
 await Bun.write('fixtures/typespec/all-library-corpus-oracle-results.json',JSON.stringify({libraries:report.libraries,compiler:report.compiler,programs:rows,scope:'Filesystem host versus memory host, supplied .tsp files only; selected pinned libraries enabled; other configuration/custom JS context remains archived. Same compiler implementation.'},null,2)+'\n');
 console.log('TypeSpec all-library corpus: all '+rows.length+' filesystem-host outcomes agree; '+rows.filter(x=>x.valid).length+' compile with current libraries');
}finally{await rm(temp,{recursive:true,force:true});}
