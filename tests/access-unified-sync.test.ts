// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {generatePythonClient} from '../src/access';

// @covers US-092-AC1 US-092-AC3 US-092-AC4 US-092-AC5 US-092-AC6
 test('sync clients preserve the async wire and outcomes without event-loop adaptation',async()=>{
 const text=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
 const generated=generatePythonClient({text,package:'shop'});
 const directory=await mkdtemp(join(tmpdir(),'umf-unified-sync-'));
 for(const file of generated.files){const path=join(directory,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
 const child=Bun.spawn([process.env.UMF_UNIFIED_PYTHON??'python3.11','-S',resolve('tests/unified/sync_client_probe.py'),directory],{stdout:'pipe',stderr:'pipe',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 const [code,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
 expect(code,stderr).toBe(0);
 const result=JSON.parse(stdout);
 expect(result).toEqual({wireParity:true,runningLoop:true,childOwnedHost:true,exactValues:true,paging:true,guardedFailures:true});
});
