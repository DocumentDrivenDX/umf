// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {generatePythonClient} from '../src/access';

test.skipIf(!process.env.UMF_UNIFIED_POSTGRES_DSN)(
 'real current Praxis fixture runs generated read/list/single action through installed host and Weft046',async()=>{
 const root=resolve(import.meta.dir,'..');
 const source=await Bun.file(join(root,'tests/unified/praxis/catalog.json')).text();
 const generated=generatePythonClient({text:source,package:'praxis_catalog'});
 const directory=await mkdtemp(join(tmpdir(),'umf-praxis-generated-'));
 for(const file of generated.files){const path=join(directory,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
 const argv=[process.env.UMF_UNIFIED_HOST_PYTHON??'python3.11',join(root,'tests/unified/praxis_binding.py'),'--generated',directory,'--dsn',process.env.UMF_UNIFIED_POSTGRES_DSN!];
 if(process.env.UMF_UNIFIED_WEFT_DIR)argv.push('--weft',process.env.UMF_UNIFIED_WEFT_DIR);
 if(process.env.UMF_UNIFIED_PSYCOPG_DIR)argv.push('--psycopg',process.env.UMF_UNIFIED_PSYCOPG_DIR);
 const proc=Bun.spawn(argv,{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdout:'pipe',stderr:'pipe'});
 const [exit,stdout,stderr]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
 if(exit!==0)throw Error(stderr);
 const result=JSON.parse(stdout);
 expect(result.status).toBe('pass');expect(result.sourceDigest).toBe(generated.sourceDigest);
 expect(result.weft).toBe(process.env.UMF_UNIFIED_EXPECTED_WEFT_VERSION??'0.4.47');
 expect(result.host).toBe(process.env.UMF_UNIFIED_EXPECTED_HOST_VERSION??'0.1.0.dev3');
 expect(result.compiledReads).toBe(5);expect(result.actionCalls).toBe(1);
 expect(result.manyRelationship).toBe('explicitly unsupported');
 },30000);
