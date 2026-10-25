// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyFile,mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const root=process.cwd();
const staging=await mkdtemp(join(tmpdir(),'umf-rust-codegen-v2-package-'));
try{
 const pack=Bun.spawn(['npm','pack','--pack-destination',staging,'--json'],{cwd:root,stdout:'pipe',stderr:'inherit'});
 const packedText=await new Response(pack.stdout).text();
 if(await pack.exited)throw new Error('npm pack failed');
 const packed=JSON.parse(packedText) as {filename:string}[];
 const installRoot=join(staging,'node_modules/@umf/core');
 await mkdir(installRoot,{recursive:true});
 const unpack=Bun.spawn(['tar','-xzf',join(staging,packed[0]!.filename),'--strip-components=1','-C',installRoot],{stdout:'inherit',stderr:'inherit'});
 if(await unpack.exited)throw new Error('package extraction failed');
 for(const dependency of ['ajv','yaml'])await symlink(join(root,'node_modules',dependency),join(staging,'node_modules',dependency),'dir');
 await copyFile('tests/unified/commerce.json',join(staging,'commerce.json'));
 await copyFile('docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json',join(staging,'operations.json'));
 await writeFile(join(staging,'smoke.mjs'),`import {readFile} from 'node:fs/promises';
import * as root from '@umf/core';
import {createPythonClientRustCandidateV2} from '@umf/core/rust-codegen-candidate/v2';
if(typeof root.generatePythonClient!=='function'||'generatePythonClientRustCandidate'in root)throw new Error('root export changed');
const source=await readFile(new URL('./commerce.json',import.meta.url),'utf8');
const corpus=JSON.parse(await readFile(new URL('./operations.json',import.meta.url),'utf8'));
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const cases=corpus.cases.filter(item=>item.operation==='generatePythonClient');
const generate=await createPythonClientRustCandidateV2();
for(const item of cases){let actual;try{actual={ok:true,result:generate(item.request)}}catch(error){actual={ok:false,error:{code:error.code,message:error.message,path:error.path}}}if(canonical(actual)!==canonical(item.expected))throw new Error('installed Node parity mismatch: '+item.id)}
let cancelled=false;const controlled=await createPythonClientRustCandidateV2({controls:{isCancelled:()=>cancelled}});cancelled=true;let code='';try{controlled({text:source,package:'shop'})}catch(error){code=error.code??''}if(code!=='CANCELLED')throw new Error('installed Node cancellation mismatch');cancelled=false;if(canonical(controlled({text:source,package:'shop'}))!==canonical(generate({text:source,package:'shop'})))throw new Error('installed Node recovery mismatch');
console.log(JSON.stringify({cases:cases.length,files:generate({text:source,package:'shop'}).files.length,cancelled:code,recovered:true}));
`);
 await writeFile(join(staging,'types.mts'),`import {createPythonClientRustCandidateV2,type PythonClientRustGenerator,type PythonClientRustOptions} from '@umf/core/rust-codegen-candidate/v2';
const options:PythonClientRustOptions={controls:{maxWork:50_000_000,isCancelled:()=>false}};
const generator:Promise<PythonClientRustGenerator>=createPythonClientRustCandidateV2(options);
void generator;
`);
 await writeFile(join(staging,'loader-contract-smoke.ts'),`import {createValidator,generateDomainPackLoaderSchema,generateLoaderInventorySchema,inspectDomainPackLoader} from '@umf/core/loader-contract';
if(typeof createValidator!=='function'||typeof generateDomainPackLoaderSchema!=='function'||typeof generateLoaderInventorySchema!=='function'||typeof inspectDomainPackLoader!=='function')throw new Error('installed loader-contract export is incomplete');
console.log('Installed loader-contract source export passed.');
`);
 await writeFile(join(staging,'loader-contract-types.ts'),`import type {createValidator} from '@umf/core/loader-contract';
const factory:typeof createValidator=null as unknown as typeof createValidator;
void factory;
`);
 const smoke=Bun.spawn(['node',join(staging,'smoke.mjs')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
 if(await smoke.exited)throw new Error('installed Node import/runtime smoke failed');
 const loaderSmoke=Bun.spawn(['bun',join(staging,'loader-contract-smoke.ts')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
 if(await loaderSmoke.exited)throw new Error('installed loader-contract export failed');
 const tsc=Bun.spawn([process.execPath,join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--strict','--skipLibCheck',join(staging,'types.mts')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
 if(await tsc.exited)throw new Error('installed package types failed to resolve');
 const loaderTypes=Bun.spawn([process.execPath,join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--target','ES2022','--module','ESNext','--moduleResolution','Bundler','--strict','--skipLibCheck','--resolveJsonModule','--allowSyntheticDefaultImports',join(staging,'loader-contract-types.ts')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
 if(await loaderTypes.exited)throw new Error('installed loader-contract types failed to resolve');
 console.log(`Installed package Node runtime, loader-contract source export, and TypeScript entrypoints passed (${packed[0]!.filename}).`);
}finally{await rm(staging,{recursive:true,force:true});}
