// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const runner=resolve('scripts/run-tests.ts');
async function packet(files:Record<string,string>,fileTimeout:number,jobs=1){
 const root=await mkdtemp(join(tmpdir(),'umf-test-runner-'));
 let child:Bun.Subprocess<'ignore','pipe','pipe'>|undefined;
 try{
  await mkdir(join(root,'tests'));
  for(const [name,text] of Object.entries(files))await writeFile(join(root,'tests',name+'.test.ts'),text);
  child=Bun.spawn([process.execPath,runner,'--jobs',String(jobs),'--keep-going'],{cwd:root,env:{...process.env,UMF_FILE_TIMEOUT_MS:String(fileTimeout)},stdin:'ignore',stdout:'pipe',stderr:'pipe'});
  const stop=setTimeout(()=>child?.kill(9),8000);
  try{const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);return {code,text:out+err};}
  finally{clearTimeout(stop);}
 }finally{child?.kill(9);await rm(root,{recursive:true,force:true});}
}
test('completed files clear both watchdogs and let the runner exit promptly',async()=>{
 const result=await packet({pass:"import {test,expect} from 'bun:test';test('pass',()=>expect(1).toBe(1));"},30000);
 expect(result.code).toBe(0);expect(result.text).toContain('1 pass');
},10000);
test('the unchanged file watchdog kills a hung file and continues the packet',async()=>{
 const result=await packet({hang:"import {test} from 'bun:test';test('hang',async()=>await new Promise(()=>{}),100000);",pass:"import {test} from 'bun:test';test('pass',()=>{});"},1000);
 expect(result.code).toBe(1);expect(result.text).toContain('FAIL tests/hang.test.ts');expect(result.text).toContain('ok   tests/pass.test.ts');expect(result.text).toContain('\n 1 fail\n');
},10000);

test('a file owning a subprocess pool runs without competing packet files',async()=>{
 const normal=(name:string)=>`import {test,expect} from 'bun:test';import {existsSync,writeFileSync,unlinkSync} from 'node:fs';test('normal',async()=>{expect(existsSync('exclusive')).toBe(false);writeFileSync('${name}','');await Bun.sleep(100);expect(existsSync('exclusive')).toBe(false);unlinkSync('${name}');});`;
 const wide="// @test-exclusive\nimport {test,expect} from 'bun:test';import {existsSync,writeFileSync,unlinkSync} from 'node:fs';test('exclusive',async()=>{expect(existsSync('a')||existsSync('c')).toBe(false);writeFileSync('exclusive','');await Bun.sleep(100);expect(existsSync('a')||existsSync('c')).toBe(false);unlinkSync('exclusive');});";
 const result=await packet({a:normal('a'),'b-wide':wide,c:normal('c')},30000,2);
 expect(result.code).toBe(0);expect(result.text).toContain('3 pass');
},10000);
