import {exportTypeSpecSources} from '../src';
import {compile,NodeHost} from '@typespec/compiler';
import {mkdtemp,mkdir,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const sample=await Bun.file('fixtures/typespec/json-schema-emission.json').json();
const numeric=await Bun.file('fixtures/typespec/emission/numeric-results.json').json();
const cases=[sample,...numeric.flatMap((x:any)=>[x.original,x.edited])];
let comparedFiles=0;
for(const expected of cases){
const temp=await mkdtemp(join(tmpdir(),'umf-typespec-emission-'));
try{
 await mkdir(join(temp,'node_modules/@typespec'),{recursive:true});await symlink(resolve('node_modules/@typespec/json-schema'),join(temp,'node_modules/@typespec/json-schema'),'dir');
 await Bun.write(join(temp,'main.tsp'),exportTypeSpecSources(expected.source).files['main.tsp']!);
 const output=join(temp,'output');const program=await compile(NodeHost,join(temp,'main.tsp'),{emit:['@typespec/json-schema'],outputDir:output,options:{'@typespec/json-schema':expected.policy.options}});
 if(program.hasError())throw new Error('Native emitter failed: '+JSON.stringify(program.diagnostics.map(d=>d.message)));
 const files:Record<string,string>={};
 for(const path of await readdir(output,{recursive:true}))if(path.endsWith('.json'))files[path]=await Bun.file(join(output,path)).text();
 const canonical=(x:Record<string,string>)=>JSON.stringify(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)));
 if(canonical(files)!==canonical(expected.files))throw new Error('Filesystem native output differs from memory output');
 comparedFiles+=Object.keys(files).length;

}finally{await rm(temp,{recursive:true,force:true});}

}
await Bun.write('fixtures/typespec/emission-oracle-results.json',JSON.stringify({emitter:sample.emitter,cases:cases.length,comparedFiles,scope:'Exact output comparison across memory/filesystem hosts for official sample and both numeric policies before/after edit; same emitter implementation, no semantic-equivalence claim'},null,2)+'\n');
console.log('TypeSpec JSON Schema emitter: '+cases.length+' native cases / '+comparedFiles+' files match memory output exactly');
