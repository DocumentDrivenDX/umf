import {lstat,realpath} from 'node:fs/promises';
import {relative,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';

// Every file gets a new Bun process. No VM reset, cross-file globals, or parallel
// native ownership. Explicit selections support qualification's disjoint shards;
// no selections means every live test under tests/.
const root=await realpath(resolve('tests')),selections=Bun.argv.slice(2);
const files:string[]=[];
for(const selection of selections.length?selections:['tests']){
 if(selection.startsWith('-'))throw Error('Only test file/directory selections are accepted');
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
let passed=0,failed=0,assertions=0,completed=0;
const started=performance.now();
for(const file of files){
 const command=[process.execPath,'test','--timeout','30000','./'+file];
 console.log(JSON.stringify({testProcess:file,command}));
 const child=Bun.spawn(command,{stdout:'pipe',stderr:'pipe',stdin:'ignore',env:{...process.env}});
 const forward=async(stream:ReadableStream<Uint8Array>,output:typeof Bun.stdout)=>{
  const chunks:Uint8Array[]=[];
  for await(const chunk of stream){chunks.push(chunk);await output.write(chunk);}
  return Buffer.concat(chunks).toString('utf8');
 };
 const [stdout,stderr,exitCode]=await Promise.all([forward(child.stdout,Bun.stdout),forward(child.stderr,Bun.stderr),child.exited]);
 const text=stdout+'\n'+stderr,summary=text.match(/Ran (\d+) tests? across (\d+) files?\./);
 const pass=Number(text.match(/(?:^|\n)\s*(\d+) pass(?:\r?\n|$)/)?.[1]??0);
 const fail=Number(text.match(/(?:^|\n)\s*(\d+) fail(?:\r?\n|$)/)?.[1]??0);
 const checks=Number(text.match(/(?:^|\n)\s*(\d+) expect\(\) calls(?:\r?\n|$)/)?.[1]??0);
 const valid=!!summary&&Number(summary[1])===pass+fail&&Number(summary[2])===1;
 console.log(JSON.stringify({testProcess:file,exitCode,pass,fail,assertions:checks,completeSummary:valid,logSha256:createHash('sha256').update(text).digest('hex')}));
 passed+=pass;failed+=fail;assertions+=checks;completed++;
 if(exitCode!==0||!valid||fail){
  console.error('Complete test file failed or terminated: '+file);
  process.exitCode=exitCode===0?1:Math.abs(exitCode);
  break;
 }
}
console.error(`\n ${passed} pass\n ${failed} fail\n ${assertions} expect() calls\nRan ${passed+failed} tests across ${completed} files. [${((performance.now()-started)/1000).toFixed(2)}s]`);
if(completed!==files.length)process.exitCode=1;
