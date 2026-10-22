/** Retained host/browser scalar inspection evidence; no backend admission. */
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve('docs/helix/04-build/evidence/security/scalar-owner-inspection',randomUUID());await mkdir(out,{recursive:true});
const paths=['src/model/scalar-type.ts','tools/security/scalar-owner-cases.ts','tools/security/check-scalar-owner.ts','tests/security-scalar-owner.test.ts','package.json','bun.lock','tsconfig.json','bunfig.toml'];
for(const pattern of ['src/**/*.ts','spec/core/**/*.json'])for await(const p of new Bun.Glob(pattern).scan(root))paths.push(p);
const unique=[...new Set(paths)].sort(),preimages=new Map<string,Buffer>();
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
for(const path of unique)preimages.set(path,await readFile(resolve(path)));
const hostCommand=['bun','test','tests/security-scalar-owner.test.ts'];
const host=Bun.spawn(hostCommand,{stdout:'pipe',stderr:'pipe'}),hostLog=await new Response(host.stdout).text()+await new Response(host.stderr).text();const hostExit=await host.exited;await writeFile(out+'/host.txt',hostLog);
const typeCommand=['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun,node','src/model/scalar-type.ts','tools/security/scalar-owner-cases.ts','tests/security-scalar-owner.test.ts'];
const typed=Bun.spawn(typeCommand,{stdout:'pipe',stderr:'pipe'}),typeLog=await new Response(typed.stdout).text()+await new Response(typed.stderr).text();const typeExit=await typed.exited;await writeFile(out+'/typecheck.txt',typeLog);
if(hostExit||typeExit)throw Error('Host/type verification failed; retained logs');
const build=await Bun.build({entrypoints:['tools/security/scalar-owner-cases.ts'],target:'browser',format:'esm',minify:false});if(!build.success)throw Error(JSON.stringify(build.logs));
const bundle=await build.outputs[0]!.text();await writeFile(out+'/browser.js',bundle);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/cases.js'?new Response(bundle,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Scalar owner verification</title>')}});
let browser;let rows:unknown;let browserVersion='';
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});browserVersion=browser.version();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 rows=await page.evaluate(async()=>{const path='/cases.js';const m=await import(path);return m.runScalarOwnerCases()});await writeFile(out+'/browser.json',JSON.stringify({browserVersion,rows},null,2)+'\n');
}finally{await browser?.close();server.stop(true)}
for(const [path,bytes] of preimages)if(!bytes.equals(await readFile(resolve(path))))throw Error('Source changed during verification: '+path);
const sourcePreimages=[];
for(const [path,bytes] of preimages){const archived=out+'/preimages/'+path;await mkdir(resolve(archived,'..'),{recursive:true});await writeFile(archived,bytes);sourcePreimages.push({path,archive:'preimages/'+path,sha256:sha(bytes)})}
await writeFile(out+'/receipt.json',JSON.stringify({status:'passed',hostCommand,typeCommand,exitCodes:[hostExit,typeExit],hostLogSha256:sha(hostLog),typeLogSha256:sha(typeLog),browserVersion,browserCases:(rows as unknown[]).length,bundleSha256:sha(bundle),sourcePreimages,scope:'Internal original0.7 scalar-family label owner inspection; host and real Chromium cases, no author/issuer/native enforcement or complete report admission',runtimePremises:'Local Bun/TypeScript/Playwright/dependency installation and Chromium; not hermetic',acceptancePromoted:false,nativeExecution:false},null,2)+'\n');
console.log(JSON.stringify({status:'passed',browserCases:(rows as unknown[]).length,sourcePins:sourcePreimages.length,receipt:out+'/receipt.json'}));
