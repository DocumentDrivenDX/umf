#!/usr/bin/env bun
// SPDX-License-Identifier: MIT OR Apache-2.0
/** Build, install, and qualify one portable schema-browser release candidate. */
import {createHash} from 'node:crypto';
import {copyFile,mkdir,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {ConsoleMessage,Request} from 'playwright';

type Hashes=Record<string,string>;
const PACKAGE='@documentdrivendx/umf-schema-browser';
const TAG=/^schema-browser-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SHA=/^[0-9a-f]{64}$/;
const COMMIT=/^[0-9a-f]{40}$/;
const bunVersion='1.4.2';
const fail=(message:string):never=>{throw Error(message);};
const assert:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)fail(message);};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';

function options(argv:string[]):Record<string,string>{
 const result:Record<string,string>={};
 for(let i=0;i<argv.length;i++){
  const key=argv[i];assert(typeof key==='string'&&key.startsWith('--'),'Expected --name value arguments');
  const value=argv[++i];assert(typeof value==='string'&&!value.startsWith('--'),`Missing value for ${key}`);
  assert(!(key.slice(2) in result),`Duplicate argument ${key}`);result[key.slice(2)]=value;
 }
 return result;
}

async function run(args:string[],label:string,cwd:string,logRoot:string):Promise<string>{
 const env={...process.env,PATH:dirname(process.execPath)+':'+(process.env.PATH??'')};
 const child=Bun.spawn(args,{cwd,env,stdout:'pipe',stderr:'pipe'});
 const [code,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
 await writeFile(join(logRoot,label+'.log'),stdout+stderr);
 if(code!==0){
  if(/^(build-|npm-|types-)/.test(label)){
   let diagnostic=(stdout+'\n'+stderr).replaceAll(cwd,'<workdir>');
   for(const [key,value] of Object.entries(process.env))
    if(value&&/(TOKEN|PASSWORD|SECRET|CREDENTIAL)/i.test(key))diagnostic=diagnostic.replaceAll(value,'<redacted>');
   diagnostic=diagnostic.replace(/[\u001b\u007f-\u009f]/g,'').split('\n').slice(-24).join('\n').slice(-2400);
   if(diagnostic.trim())console.error(`Bounded ${label} diagnostic:\n${diagnostic}`);
  }
  fail(`${label} failed with exit ${code}`);
 }
 return stdout;
}

async function hashFile(path:string):Promise<string>{return digest(await Bun.file(path).bytes());}

async function requireCleanSource(root:string,sourceSha:string,logRoot:string,label:string):Promise<void>{
 const head=(await run(['git','rev-parse','HEAD'],`${label}-head`,root,logRoot)).trim();
 assert(head===sourceSha,'source checkout is not the selected immutable revision');
 const status=await run(['git','status','--porcelain=v1','-z','--untracked-files=all'],`${label}-status`,root,logRoot);
 assert(status.length===0,`source checkout is not clean at ${label}`);
}

async function validateSourceClosure(root:string,sourceSha:string,provenance:any,logRoot:string){
 assert(provenance.revision===sourceSha&&provenance.bun===bunVersion,'built provenance differs from selected source/runtime');
 assert(typeof provenance.lockfileSha256==='string'&&SHA.test(provenance.lockfileSha256),'built lockfile digest is invalid');
 let repositoryInputs=0,lockedDependencyInputs=0;
 for(const [path,expected] of Object.entries(provenance.inputs) as [string,string][]){
  assert(!path.startsWith('generated/'),'release input closure contains unresolved generated files');
  assert(path.length>0&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').includes('..'),'release input path is unsafe');
  assert(SHA.test(expected),`release input digest is invalid: ${path}`);
  assert(await hashFile(join(root,path))===expected,`working input differs from build provenance: ${path}`);
  if(path.startsWith('node_modules/')){lockedDependencyInputs++;continue;}
  const committed=Bun.spawnSync(['git','show',`${sourceSha}:${path}`],{cwd:root});
  assert(committed.exitCode===0&&digest(committed.stdout)===expected,`repository input is not the selected commit bytes: ${path}`);
  repositoryInputs++;
 }
 for(const path of ['package.json','bun.lock']){
  const bytes=await Bun.file(join(root,path)).bytes();
  const committed=Bun.spawnSync(['git','show',`${sourceSha}:${path}`],{cwd:root});
  assert(committed.exitCode===0&&digest(committed.stdout)===digest(bytes),`source ${path} differs from selected commit`);
  if(path==='bun.lock')assert(digest(bytes)===provenance.lockfileSha256,'build provenance lock digest differs from selected lockfile');
 }
 return {repositoryInputsGitAByteVerified:repositoryInputs,lockedDependencyInputsWorkingByteVerified:lockedDependencyInputs,
  packageAndLockGitAByteVerified:true,
  dependencyQualification:'Ignored dependency files are hashed working bytes tied to committed bun.lock/runtime; not claimed as Git committed files'};
}

async function qualify(args:Record<string,string>):Promise<void>{
 const root=resolve(args.repo??''),sourceSha=args['source-sha']??'',tag=args.tag??'',output=resolve(args.output??'');
 assert(root!==resolve('/')&&await Bun.file(join(root,'package.json')).exists(),'--repo must name the selected source checkout');
 assert(COMMIT.test(sourceSha),'--source-sha must be an exact 40-character commit');
 const match=TAG.exec(tag);assert(match&&match[1]!==undefined&&match[2]!==undefined&&match[3]!==undefined,'--tag must be schema-browser-vX.Y.Z');
 const version=match.slice(1).join('.');
 assert(Bun.version===bunVersion,`qualification requires Bun ${bunVersion}`);
 assert(output!==root&&!output.startsWith(root+'/'),'release output must be outside the source checkout');
 await mkdir(output,{recursive:true});
 assert((await readdir(output)).length===0,'release output directory must be empty');
 const logs=join(output,'../schema-browser-qualification-logs');await mkdir(logs,{recursive:true});
 await requireCleanSource(root,sourceSha,logs,'before');

 const packageJson=await Bun.file(join(root,'docs/helix/05-deploy/schema-browser/package.json')).json() as any;
 assert(packageJson.name===PACKAGE&&packageJson.version===version&&packageJson.private!==true,
  'schema-browser package identity/private state does not match release tag');
 assert(packageJson.publishConfig?.access==='public'&&packageJson.publishConfig?.registry==='https://registry.npmjs.org',
  'schema-browser package publish target differs from the reviewed public npm registry');

 const buildA=join(output,'build-a'),buildB=join(output,'build-b');
 await run([process.execPath,'docs/helix/05-deploy/schema-browser/build.ts',buildA],'build-a',root,logs);
 await run([process.execPath,'docs/helix/05-deploy/schema-browser/build.ts',buildB],'build-b',root,logs);
 const integrity=await import(pathToFileURL(join(root,'scripts/schema-browser-integrity.ts')).href);
 const authority=await import(pathToFileURL(join(root,'scripts/check-core-authority.ts')).href);
 const first=await integrity.verifyPackage(buildA),second=await integrity.verifyPackage(buildB);
 integrity.verifyCleanBuilds(first,second);
 integrity.releaseParity(first,second,{revision:sourceSha,clean:true},true);
 assert(first.provenance.packageVersion===version,'built package version differs from release tag');
 const sourceClosure=await validateSourceClosure(root,sourceSha,first.provenance,logs);

 const npmVersion=await run(['npm','--version'],'npm-version',root,logs);
 assert(/^\d+\.\d+\.\d+/.test(npmVersion.trim()),'Node/npm runtime is unavailable');
 const packs=join(output,'packs'),install=join(output,'consumer');
 await mkdir(packs);await mkdir(install);
 await writeFile(join(install,'package.json'),JSON.stringify({name:'umf-schema-browser-release-consumer',version:'0.0.0',private:true})+'\n');
 const packOutput=await run(['npm','pack',buildA,'--json','--ignore-scripts','--pack-destination',packs,
  '--cache',join(output,'npm-cache'),'--registry','https://registry.npmjs.org/'],'npm-pack',root,logs);
 const packed=JSON.parse(packOutput);
 assert(Array.isArray(packed)&&packed.length===1&&packed[0]?.filename===`documentdrivendx-umf-schema-browser-${version}.tgz`,
  'npm pack produced an unexpected archive filename');
 const archive=join(packs,packed[0].filename);
 await run(['npm','install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',join(output,'npm-cache'),archive],
  'npm-offline-install',install,logs);
 const packageRoot=join(install,'node_modules',...PACKAGE.split('/'));
 const installed=await integrity.verifyPackage(packageRoot);
 integrity.verifyCleanBuilds(first,installed);
 const distribution=await authority.checkCoreDistribution(packageRoot);

 const typeConsumer=join(install,'types-consumer');await mkdir(typeConsumer);
 await writeFile(join(typeConsumer,'package.json'),'{"name":"schema-browser-types-consumer","private":true,"type":"module"}\n');
 await writeFile(join(typeConsumer,'consumer.mts'),
  "import {mount,renderRecordMap,type Catalog} from '@documentdrivendx/umf-schema-browser';\n"+
  "const catalog:Catalog={version:1,entries:[]};\n"+
  "const handle=mount(document.body,{assetsUrl:'/assets/',catalog});handle.focus();\n"+
  "renderRecordMap(document.body,{records:[],edges:[]});\n");
 const tsc=join(root,'node_modules/typescript/bin/tsc');
 const typeConfigurations:ReadonlyArray<readonly [string,string,string]>=[
  ['types-bundler','ESNext','Bundler'],['types-nodenext','NodeNext','NodeNext'],
 ];
 for(const [label,module,moduleResolution] of typeConfigurations){
  await run([process.execPath,tsc,'--ignoreConfig','--noEmit','--strict','--target','ES2022','--module',module,
   '--moduleResolution',moduleResolution,join(typeConsumer,'consumer.mts')],label,typeConsumer,logs);
 }

 const {chromium}=await import(pathToFileURL(join(root,'node_modules/playwright/index.mjs')).href);
 const errors:string[]=[],external:string[]=[];
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  const url=new URL(request.url);if(url.pathname==='/favicon.ico')return new Response(null,{status:204});
  let target:string;try{target=resolve(packageRoot,'.'+decodeURIComponent(url.pathname));}catch{return new Response('Not found',{status:404});}
  if(!target.startsWith(packageRoot+'/'))return new Response('Not found',{status:404});
  const file=Bun.file(target);return await file.exists()?new Response(file):new Response('Not found',{status:404});
 }});
 const origin=`http://127.0.0.1:${server.port}`;
 const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 let browserProof:any;
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}});
  page.on('pageerror',(error:Error)=>errors.push(String(error)));
  page.on('console',(message:ConsoleMessage)=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',(request:Request)=>{const url=request.url();if(/^https?:/i.test(url)&&!url.startsWith(origin+'/'))external.push(url);});
  await page.goto(origin+'/examples/index.html');
  await page.locator('#status').filter({hasText:'Selected customer-model'}).waitFor({timeout:30000});
  await page.locator('#select').click();
  await page.frameLocator('iframe').locator('#inspector h2').filter({hasText:'Customer'}).waitFor({timeout:30000});
  const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert(csp&&!csp.includes('unsafe-eval'),'installed example does not use the reviewed strict CSP');
  assert(external.length===0&&errors.length===0,'installed strict-CSP Chromium run made external requests or emitted errors');
  browserProof={browser:browser.version(),csp,externalRequests:external,errors,selectedRecord:'Customer'};
 }finally{await browser.close();server.stop(true);}
 await requireCleanSource(root,sourceSha,logs,'after');

 const archiveName=`documentdrivendx-umf-schema-browser-${version}.tgz`,archiveBytes=await Bun.file(archive).bytes();
 const receipt={profile:'umf.clean-producer-renderer/1',revision:sourceSha,bun:Bun.version,packageVersion:version,
  sourceInputs:Object.keys(first.provenance.inputs).length,cleanBuildPayloadFiles:Object.keys(first.payload).length,
  sourceClosure,preservedUnrelatedUntrackedPrefixes:[],byteIdentical:true,archive:archiveName,
  archiveSha256:digest(archiveBytes),installedPayloadExact:true,distribution,browser:browserProof,published:false};
 const assets=join(output,'release-assets');await mkdir(assets);
 await copyFile(archive,join(assets,archiveName));
 await copyFile(join(buildA,'SHA256SUMS'),join(assets,'SHA256SUMS'));
 await copyFile(join(buildA,'release-manifest.json'),join(assets,'release-manifest.json'));
 const receiptBytes=json(receipt);await writeFile(join(assets,'receipt.json'),receiptBytes);
 const result={tag,version,sourceSha,archiveSha256:receipt.archiveSha256,
  sumsSha256:await hashFile(join(assets,'SHA256SUMS')),
  releaseManifestSha256:await hashFile(join(assets,'release-manifest.json')),
  receiptSha256:digest(new TextEncoder().encode(receiptBytes)),
  packageFiles:distribution.files,browser:browserProof,releaseAssets:archiveName};
 await writeFile(join(output,'identity.json'),json(result));
 console.log(JSON.stringify(result,null,2));
}

async function verifyAssets(args:Record<string,string>):Promise<void>{
 const directory=resolve(args.assets??''),tag=args.tag??'',sourceSha=args['source-sha']??'';
 const match=TAG.exec(tag);assert(match&&match[1]!==undefined&&match[2]!==undefined&&match[3]!==undefined,'--tag must be schema-browser-vX.Y.Z');
 assert(COMMIT.test(sourceSha),'--source-sha must be an exact 40-character commit');
 const version=match.slice(1).join('.'),archiveName=`documentdrivendx-umf-schema-browser-${version}.tgz`;
 const entries=await readdir(directory,{withFileTypes:true});
 const expected=new Set(['SHA256SUMS','release-manifest.json','receipt.json',archiveName]);
 assert(entries.every(entry=>entry.isFile()&&!entry.isSymbolicLink())&&entries.length===expected.size&&entries.every(entry=>expected.has(entry.name)),
  'release artifact must contain exactly the four reviewed regular files');
 const receipt=await Bun.file(join(directory,'receipt.json')).json() as any;
 assert(receipt.profile==='umf.clean-producer-renderer/1'&&receipt.revision===sourceSha&&receipt.packageVersion===version&&receipt.bun===bunVersion,
  'producer receipt identity differs from the selected release');
 assert(receipt.byteIdentical===true&&receipt.installedPayloadExact===true&&receipt.published===false,
  'producer receipt does not prove two identical builds and exact offline installation');
 assert(receipt.archive===archiveName&&SHA.test(receipt.archiveSha256),'producer receipt archive identity is invalid');
 assert(Array.isArray(receipt.browser?.errors)&&receipt.browser.errors.length===0&&
  Array.isArray(receipt.browser?.externalRequests)&&receipt.browser.externalRequests.length===0&&
  receipt.browser.selectedRecord==='Customer'&&typeof receipt.browser.csp==='string'&&
  !receipt.browser.csp.includes('unsafe-eval'),'producer receipt browser proof is incomplete');
 const archiveSha=await hashFile(join(directory,archiveName));
 assert(archiveSha===receipt.archiveSha256,'release archive differs from producer receipt');
 const sums=await Bun.file(join(directory,'SHA256SUMS')).bytes();
 const manifest=await Bun.file(join(directory,'release-manifest.json')).bytes();
 assert(sums.length>0&&manifest.length>0,'release package integrity files are empty');
 const identity={tag,version,sourceSha,archiveSha256:archiveSha,sumsSha256:digest(sums),
  releaseManifestSha256:digest(manifest),receiptSha256:await hashFile(join(directory,'receipt.json'))};
 console.log(JSON.stringify(identity));
}

const [mode,...argv]=process.argv.slice(2),args=options(argv);
try{
 if(mode==='qualify')await qualify(args);
 else if(mode==='verify-assets')await verifyAssets(args);
 else fail('Usage: qualify-schema-browser-release.ts qualify --repo PATH --source-sha SHA --tag TAG --output PATH | verify-assets --assets PATH --source-sha SHA --tag TAG');
}catch(error){console.error(`schema-browser release qualification refused: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}
