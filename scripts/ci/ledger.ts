// SPDX-License-Identifier: MIT OR Apache-2.0
// Records this run's test results in the CI ledger that scripts/ci/plan.ts reads.
//
//   bun scripts/ci/ledger.ts --ledger PATH [--bun TSV] [--py JUNIT --py-list PATH] [--rust JUNIT]
//
// --bun is the --results file of scripts/run-tests.ts. --py is pytest's JUnit XML written with
// `-o junit_family=xunit1` (each testcase carries its file), and --py-list the planned files. --rust is nextest's JUnit XML (one testsuite per
// test binary). A unit's seconds are the summed durations of its tests; a unit that did not run keeps its
// previous entry.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Ledger} from './plan';

const args=new Map<string,string>();
for(let i=2;i<Bun.argv.length;i+=2)args.set(Bun.argv[i]!.replace(/^--/,''),Bun.argv[i+1]??'');
const path=args.get('ledger');if(!path)throw Error('--ledger is required');
const ledger:Ledger=existsSync(path)?JSON.parse(await readFile(path,'utf8')):{};
const now=new Date().toISOString();
const results=new Map<string,{seconds:number;ok:boolean}>();
const add=(key:string,seconds:number,ok:boolean)=>{const r=results.get(key)??{seconds:0,ok:true};r.seconds+=seconds;r.ok&&=ok;results.set(key,r);};
const read=async(name:string)=>{const p=args.get(name);return p&&existsSync(p)?readFile(p,'utf8'):undefined;};
const attr=(tag:string,name:string)=>tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

const bun=await read('bun');
for(const line of bun?.split('\n').filter(Boolean)??[]){const [file,s,status]=line.split('\t');add('bun:'+file,Number(s),status==='ok');}

// Each <testcase ...>...</testcase> or <testcase .../>; a failure or error child marks it failed.
const cases=(xml:string)=>[...xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].map(m=>({tag:m[1]!,body:m[3]??''}));
const failedCase=(body:string)=>/<(failure|error)\b/.test(body);
// pytest writes `file` relative to its rootdir; map it back to the planned repository path.
const py=await read('py'),planned=(await read('py-list'))?.split('\n').filter(Boolean)??[];
if(py)for(const {tag,body} of cases(py)){
 const file=attr(tag,'file');if(!file)continue;
 const id=planned.find(p=>p===file||p.endsWith('/'+file))??file;
 add('py:'+id,Number(attr(tag,'time')??0),!failedCase(body));
}
const rust=await read('rust');
if(rust)for(const suite of rust.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)){
 const name=attr(suite[1]!,'name');if(!name)continue;
 for(const {tag,body} of cases(suite[2]!))add('rust:'+name,Number(attr(tag,'time')??0),!failedCase(body));
}
for(const [key,r] of results)ledger[key]={last:now,seconds:Math.round(r.seconds*10)/10,ok:r.ok};
await mkdir(dirname(path),{recursive:true});
await writeFile(path,'{\n'+Object.keys(ledger).sort().map(k=>JSON.stringify(k)+':'+JSON.stringify(ledger[k])).join(',\n')+'\n}\n');
const failed=[...results].filter(([,r])=>!r.ok).map(([k])=>k);
console.log(`Recorded ${results.size} units (${failed.length} failed).`+(failed.length?'\n'+failed.map(k=>'  '+k).join('\n'):''));
