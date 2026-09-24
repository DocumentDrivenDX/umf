/** Host-only compatibility replay. Historical records supply command inventory,
 * never passing outcomes for the current implementation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
const previous=await Bun.file('fixtures/validation/key-native-refresh.json').json();
const keys=await Bun.file('fixtures/validation/key-gate-refresh-evidence.json').json();
const profile=process.argv[2]??'core';
assert.ok(profile==='core'||profile==='tablespec','Expected core or tablespec refresh profile');
const commands:string[][]=[],seen=new Set<string>();
for(const command of [...previous.runs.map((r:any)=>r.command),...keys.runs.map((r:any)=>r.command),...['core-relationship-browser','core-relationship-transition-browser','core-relationship-operations-browser','core-relationship-public-browser'].map(s=>['bun',`scripts/${s}.ts`])]){
 const identity=JSON.stringify(command);if(!seen.has(identity)){seen.add(identity);commands.push(command);}
}
if(profile==='tablespec')for(const name of ['relationship-tablespec-discovery-oracle','relationship-tablespec-oracle','relationship-tablespec-browser','relationship-tablespec-projection-browser'])commands.push(['bun',`scripts/core-ideals/${name}.ts`]);
const basename=profile==='core'?'relationship-compatibility-refresh':'relationship-tablespec-compatibility-refresh';
const output=`fixtures/validation/${basename}.json`,directory=`.cache/${basename}`;
await mkdir(directory,{recursive:true});
const patterns=['src/**/*.ts','scripts/**/*.ts','scripts/**/*.py','spec/**/*.json',...(profile==='tablespec'?['native/tablespec/relationship-runtime/*','tests/**/*.ts']:[])];
const sourcePaths=(await Promise.all(patterns.map(p=>Array.fromAsync(new Bun.Glob(p).scan())))).flat().sort();
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const sha256=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,digest(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
const runs:{command:string[];exitCode:number;log:string;logSha256:string}[]=[];
const record=(complete:boolean)=>({scope:profile==='core'?'Fresh compatibility command replay for public 0.7.0; separate regression and core-task acceptance required':'Fresh compatibility replay for TableSpec relationship binding; separate regression and binding acceptance required',complete,coreTaskAccepted:false,...(profile==='tablespec'?{bindingAccepted:false}:{}),idealAdmitted:false,nativeEquivalence:false,commands,runs,sha256});
await Bun.write(output,JSON.stringify(record(false),null,2)+'\n');
for(const [index,command] of commands.entries()){
 console.log(JSON.stringify({step:index+1,total:commands.length,command}));
 const child=Bun.spawn(command,{stdout:'pipe',stderr:'pipe',env:process.env});
 const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 const log=`${directory}/${String(index+1).padStart(3,'0')}.log`,text=stdout+'\n'+stderr;await Bun.write(log,text);
 runs.push({command,exitCode,log,logSha256:digest(new TextEncoder().encode(text))});await Bun.write(output,JSON.stringify(record(false),null,2)+'\n');
 assert.equal(exitCode,0,`Compatibility command failed; inspect ${log}`);
}
for(const [p,h] of Object.entries(sha256))assert.equal(digest(new Uint8Array(await Bun.file(p).arrayBuffer())),h,`Source changed during refresh: ${p}`);
await Bun.write(output,JSON.stringify(record(true),null,2)+'\n');console.log(JSON.stringify({complete:true,commands:runs.length,coreTaskAccepted:false}));
