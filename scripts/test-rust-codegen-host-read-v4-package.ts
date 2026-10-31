// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const root=process.cwd();
const staging=await mkdtemp(join(tmpdir(),'umf-host-read-v4-installed-'));
try{
 const packCommand=Bun.spawn(['npm','pack','--pack-destination',staging,'--json'],{cwd:root,stdout:'pipe',stderr:'inherit',env:{...process.env,npm_config_cache:join(staging,'npm-cache')}});
 const packedText=await new Response(packCommand.stdout).text();
 if(await packCommand.exited)throw new Error('V4 npm pack failed');
 const pack=JSON.parse(packedText) as {filename:string}[];
 const install=join(staging,'node_modules/@umf/core');await mkdir(install,{recursive:true});
 const unpack=Bun.spawn(['tar','-xzf',join(staging,pack[0]!.filename),'--strip-components=1','-C',install],{stdout:'inherit',stderr:'inherit'});
 if(await unpack.exited)throw new Error('V4 package extraction failed');
 await writeFile(join(staging,'commerce.json'),await Bun.file('tests/unified/commerce.json').text());
 await writeFile(join(staging,'smoke.mjs'),`import {readFile} from 'node:fs/promises';
import {createPythonClientRustCandidateV4,PYTHON_CLIENT_HOST_READ_V4_PROFILE} from '@umf/core/rust-codegen-candidate/v4';
if(PYTHON_CLIENT_HOST_READ_V4_PROFILE!=='umf.python-client-host-read/4')throw new Error('V4 profile identity mismatch');
const generate=await createPythonClientRustCandidateV4();
const text=await readFile(new URL('./commerce.json',import.meta.url),'utf8');
let touched=0,caught;const records=new Proxy(new Array(10001),{get(target,key,receiver){if(typeof key==='string'&&/^\\d+$/.test(key))touched++;return Reflect.get(target,key,receiver)}});
try{generate({text,package:'shop',records})}catch(error){caught=error}
if(touched!==0||caught?.code!=='RESOURCE_LIMIT'||caught?.path!=='/records'||caught?.message!=='V4 host-read resource limit exceeded')throw new Error('installed V4 refusal mismatch');
const result=generate({text,package:'shop',records:[{module:'commerce',element:'Customer'}]});
if(!result.files.length)throw new Error('installed V4 generation failed');
console.log(JSON.stringify({profile:PYTHON_CLIENT_HOST_READ_V4_PROFILE,files:result.files.length,rawRefusal:caught.code}));
`);
 const smoke=Bun.spawn(['node',join(staging,'smoke.mjs')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
 if(await smoke.exited)throw new Error('installed clean V4 Node smoke failed');
 console.log(`Installed V4 Node subpath passed from ${pack[0]!.filename} without dependency symlinks.`);
}finally{await rm(staging,{recursive:true,force:true});}
