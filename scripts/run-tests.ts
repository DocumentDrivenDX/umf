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
//   --exclude-file PATH  skip test files matching any glob listed in PATH (one per line, # comments)
//   --shard I/N          run only the I-th of N deterministic shards of the selected files
const args=Bun.argv.slice(2),selections:string[]=[];
let jobs=availableParallelism(),keepGoing=false,excludeFile:string|undefined,shard:[number,number]|undefined;
for(let i=0;i<args.length;i++){
 const arg=args[i]!;
 if(arg==='--')continue;
 if(arg==='--keep-going')keepGoing=true;
 else if(arg==='--jobs'||arg==='--exclude-file'||arg==='--shard'){
  const value=args[++i];if(!value)throw Error(arg+' needs a value');
  if(arg==='--jobs'){jobs=Number(value);if(!Number.isInteger(jobs)||jobs<1)throw Error('--jobs needs a positive integer');}
  else if(arg==='--exclude-file')excludeFile=value;
  else{const m=value.match(/^(\d+)\/(\d+)$/);if(!m||Number(m[1])<1||Number(m[1])>Number(m[2]))throw Error('--shard needs I/N with 1<=I<=N');shard=[Number(m[1]),Number(m[2])];}
 }
 else if(arg.startsWith('-'))throw Error('Unknown option '+arg);
 else selections.push(arg);
}
const root=await realpath(resolve('tests'));
let files:string[]=[];
for(const selection of selections.length?selections:['tests']){
 const path=await realpath(resolve(selection)),inside=relative(root,path);
 if(inside.startsWith('..'+sep)||inside==='..'||inside.startsWith(sep))throw Error('Test selection escapes tests/');
 const info=await lstat(path);
 if(info.isDirectory()){
  for await(const name of new Bun.Glob('**/*.test.ts').scan({cwd:path,onlyFiles:true,followSymlinks:false}))files.push(relative(process.cwd(),resolve(path,name)).split(sep).join('/'));
 }else if(info.isFile()&&path.endsWith('.test.ts'))files.push(relative(process.cwd(),path).split(sep).join('/'));
 else throw Error('Test selection is not a test file/directory');
}
files.sort();
if(!files.length||new Set(files).size!==files.length)throw Error('Empty or overlapping test inventory');
if(excludeFile){
 const globs=(await readFile(excludeFile,'utf8')).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(g=>new Bun.Glob(g));
 const before=files.length;
 files=files.filter(f=>!globs.some(g=>g.match(f)));
 console.error(`excluded ${before-files.length} of ${before} files via ${excludeFile}`);
}
if(shard)files=files.filter((_,index)=>index%shard![1]===shard![0]-1);
if(!files.length)throw Error('No test files selected');

let passed=0,failed=0,skipped=0,assertions=0,completed=0,next=0,stop=false;
const failures:string[]=[],started=performance.now();
async function runOne(file:string){
 const child=Bun.spawn([process.execPath,'test','--timeout','30000','./'+file],{stdout:'pipe',stderr:'pipe',stdin:'ignore',env:{...process.env}});
 const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 const text=stdout+'\n'+stderr,summary=text.match(/Ran (\d+) tests? across (\d+) files?\./);
 const count=(label:string)=>Number(text.match(new RegExp(`(?:^|\\n)\\s*(\\d+) ${label}(?:\\r?\\n|$)`))?.[1]??0);
 const pass=count('pass'),fail=count('fail'),skip=count('skip'),todo=count('todo'),checks=count('expect\\(\\) calls');
 const valid=!!summary&&Number(summary[1])===pass+fail+skip+todo&&Number(summary[2])===1;
 passed+=pass;failed+=fail;skipped+=skip;assertions+=checks;completed++;
 const bad=exitCode!==0||!valid||fail>0;
 if(bad){failures.push(file);console.log(`FAIL ${file} (exit ${exitCode}, ${pass} pass, ${fail} fail)\n${text.trim().split('\n').slice(-60).join('\n')}\n`);if(!keepGoing)stop=true;}
 else console.log(`ok   ${file} (${pass} pass${skip?`, ${skip} skip`:''})`);
}
await Promise.all(Array.from({length:Math.min(jobs,files.length)},async()=>{
 while(!stop&&next<files.length)await runOne(files[next++]!);
}));
console.log(`\n ${passed} pass\n ${skipped} skip\n ${failed} fail\n ${assertions} expect() calls\nRan ${passed+skipped+failed} tests across ${completed} of ${files.length} files. [${((performance.now()-started)/1000).toFixed(2)}s]`);
if(failures.length){console.log('\nFailed files:\n'+failures.sort().map(f=>'  '+f).join('\n'));process.exitCode=1;}
else if(completed!==files.length)process.exitCode=1;
