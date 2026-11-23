// SPDX-License-Identifier: MIT OR Apache-2.0
import {lstat,readFile,realpath} from 'node:fs/promises';
import {relative,resolve,sep} from 'node:path';
import {availableParallelism} from 'node:os';

// Runs every selected test file in its own Bun process (no cross-file globals, no shared native state).
//
//   bun scripts/run-tests.ts [options] [file-or-dir ...]     (default: tests/)
//
// Options:
//   --jobs N             run N files at once (default: number of CPUs; 1 = serial)
//   --keep-going         run every file and report all failures (default: stop at the first)
//   --exclude-file PATH  skip test files matching any glob listed in PATH (one per line, # comments); repeatable
//   --only-file PATH     run only the test files matching a glob listed in PATH
//   --shard I/N          run only the I-th of N deterministic shards of the selected files
//   --list PATH          run exactly the test files named in PATH, one per line, in that order (CI selection)
//   --deadline EPOCH_MS  start no file after this time; files not started are reported as not run, not failed
//   --results PATH       write one line per finished file: path, seconds, ok|fail (for the CI ledger)
// A test file that runs longer than UMF_FILE_TIMEOUT_MS (default 600000) is killed and reported as failed.
// Per-test default timeout: UMF_TEST_TIMEOUT_MS (default 120000); tests that set their own timeout keep it.
const args=Bun.argv.slice(2),selections:string[]=[];
let jobs=availableParallelism(),keepGoing=false,excludeFiles:string[]=[],onlyFile:string|undefined,shard:[number,number]|undefined,listFile:string|undefined,deadline=Infinity,resultsFile:string|undefined;
for(let i=0;i<args.length;i++){
 const arg=args[i]!;
 if(arg==='--')continue;
 if(arg==='--keep-going')keepGoing=true;
 else if(arg==='--jobs'||arg==='--exclude-file'||arg==='--only-file'||arg==='--shard'||arg==='--list'||arg==='--deadline'||arg==='--results'){
  const value=args[++i];if(!value)throw Error(arg+' needs a value');
  if(arg==='--jobs'){jobs=Number(value);if(!Number.isInteger(jobs)||jobs<1)throw Error('--jobs needs a positive integer');}
  else if(arg==='--exclude-file')excludeFiles.push(value);
  else if(arg==='--only-file')onlyFile=value;
  else if(arg==='--list')listFile=value;
  else if(arg==='--results')resultsFile=value;
  else if(arg==='--deadline'){deadline=Number(value);if(!Number.isFinite(deadline))throw Error('--deadline needs epoch milliseconds');}
  else{const m=value.match(/^(\d+)\/(\d+)$/);if(!m||Number(m[1])<1||Number(m[1])>Number(m[2]))throw Error('--shard needs I/N with 1<=I<=N');shard=[Number(m[1]),Number(m[2])];}
 }
 else if(arg.startsWith('-'))throw Error('Unknown option '+arg);
 else selections.push(arg);
}
const root=await realpath(resolve('tests'));
let files:string[]=[];
if(listFile!==undefined&&selections.length)throw Error('--list cannot be combined with file selections');
for(const selection of listFile!==undefined?[]:selections.length?selections:['tests']){
 const path=await realpath(resolve(selection)),inside=relative(root,path);
 if(inside.startsWith('..'+sep)||inside==='..'||inside.startsWith(sep))throw Error('Test selection escapes tests/');
 const info=await lstat(path);
 if(info.isDirectory()){
  for await(const name of new Bun.Glob('**/*.test.ts').scan({cwd:path,onlyFiles:true,followSymlinks:false}))files.push(relative(process.cwd(),resolve(path,name)).split(sep).join('/'));
 }else if(info.isFile()&&path.endsWith('.test.ts'))files.push(relative(process.cwd(),path).split(sep).join('/'));
 else throw Error('Test selection is not a test file/directory');
}
files.sort();
if(listFile!==undefined){
 for(const name of (await readFile(listFile,'utf8')).split('\n').map(l=>l.trim()).filter(Boolean)){
  const path=await realpath(resolve(name)),inside=relative(root,path);
  if(inside.startsWith('..'+sep)||inside==='..'||inside.startsWith(sep)||!path.endsWith('.test.ts'))throw Error('Listed file is not a test file under tests/: '+name);
  files.push(relative(process.cwd(),path).split(sep).join('/'));
 }
 // An empty list is a valid selection: this run's budget went to other suites.
 if(!files.length){console.log('No test files listed.');process.exit(0);}
}
if(!files.length||new Set(files).size!==files.length)throw Error('Empty or overlapping test inventory');
const globsOf=async(path:string)=>(await readFile(path,'utf8')).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(g=>new Bun.Glob(g));
for(const excludeFile of excludeFiles){
 const globs=await globsOf(excludeFile),before=files.length;
 files=files.filter(f=>!globs.some(g=>g.match(f)));
 console.error(`excluded ${before-files.length} of ${before} files via ${excludeFile}`);
}
if(onlyFile){
 const globs=await globsOf(onlyFile);
 files=files.filter(f=>globs.some(g=>g.match(f)));
 console.error(`selected ${files.length} files via ${onlyFile}`);
}
if(shard)files=files.filter((_,index)=>index%shard![1]===shard![0]-1);
if(!files.length)throw Error('No test files selected');
// A file that owns a bounded subprocess pool reserves the packet while active.
// Its existing file/test deadlines still apply; other files start afterward.
const exclusiveFiles=new Set<string>();
for(const file of files)if(/^\/\/ @test-exclusive\s*$/m.test(await readFile(file,'utf8')))exclusiveFiles.add(file);

let passed=0,failed=0,skipped=0,assertions=0,completed=0,next=0,stop=false,notStarted=0;
const failures:string[]=[],started=performance.now(),results:string[]=[];
async function runOne(file:string){
 const fileStart=performance.now();
 const child=Bun.spawn([process.execPath,'test','--timeout',process.env.UMF_TEST_TIMEOUT_MS??'120000','./'+file],{stdout:'pipe',stderr:'pipe',stdin:'ignore',env:{...process.env}});
 // A file that hangs (a stuck fixture or a child process that keeps the pipes open) is killed after
 // UMF_FILE_TIMEOUT_MS (default 10 minutes) and counted as a failure instead of stalling the whole run.
 const limit=Number(process.env.UMF_FILE_TIMEOUT_MS??'600000');
 const timer=setTimeout(()=>child.kill(9),limit);
 const finished=Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 const gaveUp=Symbol();
 let drainTimer:ReturnType<typeof setTimeout>|undefined;
 const result=await Promise.race([finished,new Promise<typeof gaveUp>(resolve=>{drainTimer=setTimeout(()=>resolve(gaveUp),limit+5000);})])
  .finally(()=>{clearTimeout(timer);if(drainTimer!==undefined)clearTimeout(drainTimer);});
 if(result===gaveUp){child.kill(9);failed++;completed++;failures.push(file);results.push(`${file}\t${limit/1000}\tfail`);console.log(`FAIL ${file} (exit -1, hung: killed after ${limit/1000}s)\n`);if(!keepGoing)stop=true;return;}
 const [stdout,stderr,exitCode]=result;
 const text=stdout+'\n'+stderr,summary=text.match(/Ran (\d+) tests? across (\d+) files?\./);
 const count=(label:string)=>Number(text.match(new RegExp(`(?:^|\\n)\\s*(\\d+) ${label}(?:\\r?\\n|$)`))?.[1]??0);
 const pass=count('pass'),fail=count('fail'),skip=count('skip'),todo=count('todo'),checks=count('expect\\(\\) calls');
 const valid=!!summary&&Number(summary[1])===pass+fail+skip+todo&&Number(summary[2])===1;
 passed+=pass;failed+=fail;skipped+=skip;assertions+=checks;completed++;
 const bad=exitCode!==0||!valid||fail>0;
 // A killed/invalid file may have no Bun assertion summary. Count its
 // synthetic failure just as the drain watchdog does.
 if(bad&&fail===0)failed++;
 results.push(`${file}\t${((performance.now()-fileStart)/1000).toFixed(1)}\t${bad?'fail':'ok'}`);
 if(bad){failures.push(file);console.log(`FAIL ${file} (exit ${exitCode}, ${pass} pass, ${fail} fail)\n${text.trim().split('\n').slice(-60).join('\n')}\n`);if(!keepGoing)stop=true;}
 else console.log(`ok   ${file} (${pass} pass${skip?`, ${skip} skip`:''}) [${((performance.now()-fileStart)/1000).toFixed(1)}s]`);
}
let active=0,exclusiveActive=false;
const waiting:Array<()=>void>=[];
await Promise.all(Array.from({length:Math.min(jobs,files.length)},async()=>{
 while(!stop&&next<files.length){
  if(Date.now()>=deadline){notStarted=files.length-next;next=files.length;break;}
  const file=files[next]!,exclusive=exclusiveFiles.has(file);
  if(exclusiveActive||(exclusive&&active>0)){await new Promise<void>(resolve=>waiting.push(resolve));continue;}
  next++;active++;if(exclusive)exclusiveActive=true;
  try{await runOne(file);}finally{active--;if(exclusive)exclusiveActive=false;for(const resume of waiting.splice(0))resume();}
 }
}));
console.log(`\n ${passed} pass\n ${skipped} skip\n ${failed} fail\n ${assertions} expect() calls\nRan ${passed+skipped+failed} tests across ${completed} of ${files.length} files. [${((performance.now()-started)/1000).toFixed(2)}s]`);
if(resultsFile!==undefined)await Bun.write(resultsFile,results.map(r=>r+'\n').join(''));
if(notStarted)console.log(`\n${notStarted} listed files not started: the deadline passed.`);
if(failures.length){console.log('\nFailed files:\n'+failures.sort().map(f=>'  '+f).join('\n'));process.exitCode=1;}
else if(completed+notStarted!==files.length)process.exitCode=1;
