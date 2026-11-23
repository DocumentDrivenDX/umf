// SPDX-License-Identifier: MIT OR Apache-2.0
// Chooses which test units one CI run executes so the whole run fits its job-minute budget.
//
//   bun scripts/ci/plan.ts --lane push|nightly --budget-seconds N --ledger PATH --changed PATH
//                          --rust-binaries PATH --py-ignored PATH --out DIR
//
// A unit is one Bun test file, one Python test file or one Rust test binary. The ledger (kept between
// runs in the Actions cache) records when each unit last ran, how long it took and whether it passed.
// Units are taken in this order until the estimated wall time reaches the budget:
//   1. units that failed when they last ran;
//   2. units the change touches (the test file itself, or the area it tests);
//   3. units that have never run;
//   4. the rest, least recently run first.
// So every run tests what changed, and repeated runs cover the whole inventory. Units not run this time are
// listed in the run summary with the age of their last run; nothing is silently dropped.
//
// Lanes: `push` (pushes and pull requests) takes the fast inventory: Bun files not in
// scripts/slow-tests.txt, Python on 3.11 and every Rust test binary. `nightly` takes the Bun files in
// scripts/slow-tests.txt and the commands in scripts/ci/nightly-commands.tsv. Files in
// scripts/known-failures.txt never run here.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';

type Suite='bun'|'py'|'rust'|'cmd';
type Unit={suite:Suite;id:string;area:string};
type Entry={last:string;seconds:number;ok:boolean};
export type Ledger=Record<string,Entry>;

const args=new Map<string,string>();
for(let i=2;i<Bun.argv.length;i+=2)args.set(Bun.argv[i]!.replace(/^--/,''),Bun.argv[i+1]??'');
const need=(k:string)=>{const v=args.get(k);if(!v)throw Error('--'+k+' is required');return v;};
const lane=need('lane');if(lane!=='push'&&lane!=='nightly')throw Error('--lane must be push or nightly');
const budget=Number(need('budget-seconds'));if(!(budget>0))throw Error('--budget-seconds must be positive');
const out=need('out');

const lines=async(path:string)=>existsSync(path)?(await readFile(path,'utf8')).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')):[];
const globs=async(path:string)=>(await lines(path)).map(g=>new Bun.Glob(g));
const ledger:Ledger=existsSync(need('ledger'))?JSON.parse(await readFile(need('ledger'),'utf8')):{};
const changed=await lines(args.get('changed')??'');

// Parallel width of each suite's runner on a 4-vCPU runner, and the cost assumed for a unit never timed.
const WIDTH:Record<Suite,number>={bun:4,py:4,rust:4,cmd:1};
const DEFAULT_SECONDS:Record<Suite,number>={bun:20,py:10,rust:15,cmd:300};
// Fixed start-up cost of running a suite at all (process start, collection).
const SUITE_OVERHEAD:Record<Suite,number>={bun:5,py:15,rust:10,cmd:0};

const scan=async(pattern:string)=>{const found:string[]=[];for await(const f of new Bun.Glob(pattern).scan({cwd:'.',onlyFiles:true}))found.push(f);return found.sort();};
const units:Unit[]=[];
const quarantined=await globs('scripts/known-failures.txt'),slow=await globs('scripts/slow-tests.txt');
for(const file of await scan('tests/**/*.test.ts')){
 if(quarantined.some(g=>g.match(file)))continue;
 if(slow.some(g=>g.match(file))!==(lane==='nightly'))continue;
 const parts=file.split('/');units.push({suite:'bun',id:file,area:parts.length>2?parts[1]!:parts[1]!.replace(/[-.].*$/,'')});
}
// Nightly command units (scripts/ci/nightly-commands.tsv): their estimate stands until the ledger has a timing.
const estimate=new Map<string,number>();
if(lane==='nightly')for(const line of await lines('scripts/ci/nightly-commands.tsv')){
 const [id,seconds]=line.split('\t');units.push({suite:'cmd',id:id!,area:''});estimate.set(id!,Number(seconds));
}
if(lane==='push'){
 // Files a conftest.py collect_ignore excludes (scripts/ci/pytest-ignored.py): pytest honours those lists only
 // when it collects a directory, and it is given explicit files here.
 const pyIgnored=await lines(args.get('py-ignored')??'');
 // Each Python test root and the source it tests.
 for(const [root,source] of [['python/tests','python/src/'],['python/umf_codegen/tests','python/umf_codegen/'],['python/umf_access/tests','python/umf_access/'],['tools/tests','tools/']])
  for(const file of await scan(root+'/**/test_*.py'))
   if(!pyIgnored.some(i=>file===i||file.startsWith(i+'/')))units.push({suite:'py',id:file,area:source!});
 // `cargo nextest list --message-format json` output, reduced to "<binary-id>\t<crate source dir>" lines.
 for(const line of await lines(need('rust-binaries'))){const [id,dir]=line.split('\t');units.push({suite:'rust',id:id!,area:dir!});}
}

// What the change touches. A Bun file is touched when it changed, or when a changed source path shares its
// area name (tests/avro/* <-> src/adapters/avro/*, tests/access-*.test.ts <-> src/access/*). A Python file is
// touched when it or anything under its package changed; a Rust binary when its crate's directory changed.
const touched=(u:Unit)=>changed.some(path=>{
 if(path===u.id)return true;
 if(u.suite==='bun')return path.startsWith('src/')&&path.split('/').slice(1,-1).concat(path.split('/').pop()!.replace(/[-.].*$/,'')).includes(u.area);
 if(u.suite==='py')return path.startsWith(u.area);
 if(u.suite==='cmd')return false;
 return path.startsWith(u.area+'/');
});
const key=(u:Unit)=>u.suite+':'+u.id;
const share=new Map<string,number>();
for(const suite of ['bun','py','rust','cmd'] as Suite[]){const of=units.filter(u=>u.suite===suite);of.forEach((u,i)=>share.set(key(u),i/of.length));}
const tier=(u:Unit)=>{const e=ledger[key(u)];return !e?2:!e.ok?0:touched(u)?1:3;};
// Within a tier: touched-and-failed before failed, then oldest run first, then a stable order.
const ordered=[...units].sort((a,b)=>{
 const ta=tier(a),tb=tier(b);if(ta!==tb)return ta-tb;
 const ca=Number(touched(a)),cb=Number(touched(b));if(ca!==cb)return cb-ca;
 const la=ledger[key(a)]?.last??'',lb=ledger[key(b)]?.last??'';if(la!==lb)return la<lb?-1:1;
 // Equal standing: interleave the suites in proportion to their size, so no suite waits for another.
 const fa=share.get(key(a))!,fb=share.get(key(b))!;if(fa!==fb)return fa-fb;
 return key(a)<key(b)?-1:1;
});
const cost=(u:Unit)=>(ledger[key(u)]?.seconds??estimate.get(u.id)??DEFAULT_SECONDS[u.suite])/WIDTH[u.suite];
const chosen:Unit[]=[],skipped:Unit[]=[];let total=0;const used=new Set<Suite>();
for(const u of ordered){
 const extra=cost(u)+(used.has(u.suite)?0:SUITE_OVERHEAD[u.suite]);
 if(total+extra<=budget){chosen.push(u);total+=extra;used.add(u.suite);}else skipped.push(u);
}
await mkdir(out,{recursive:true});
for(const suite of ['bun','py','rust','cmd'] as Suite[])
 await writeFile(`${out}/${suite}.txt`,chosen.filter(u=>u.suite===suite).map(u=>u.id).join('\n')+'\n');
const age=(u:Unit)=>{const l=ledger[key(u)]?.last;return l?Math.round((Date.now()-Date.parse(l))/3600000)+'h':'never';};
const summary=[`### Test selection (${lane} lane, ${Math.round(budget/60)} min test budget)`,'',
 `Running ${chosen.length} of ${units.length} units (estimated ${Math.round(total/60*10)/10} min).`,
 ...(['bun','py','rust','cmd'] as Suite[]).filter(s=>units.some(u=>u.suite===s)).map(s=>`- ${s}: ${chosen.filter(u=>u.suite===s).length} of ${units.filter(u=>u.suite===s).length}`),
 `- failed last time: ${chosen.filter(u=>tier(u)===0).length}; touched by this change: ${chosen.filter(touched).length} of ${units.filter(touched).length}`,
 '',`<details><summary>${skipped.length} units not run this time (age of their last run)</summary>`,'',
 ...skipped.map(u=>`- ${key(u)} (${age(u)}${cost(u)>budget?', estimated over the whole budget':''})`),'','</details>',''].join('\n');
await writeFile(`${out}/summary.md`,summary);
console.log(summary.split('<details>')[0]);
