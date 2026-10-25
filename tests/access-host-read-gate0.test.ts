import {expect,test} from 'bun:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {generatePythonClient} from '../src/access';
import {tableOperationSource} from './unified/table-operation-fixture';

const probePath=new URL('../scripts/rust-migration/r7/codegen-host-read-gate0-probe.mjs',import.meta.url);
const {runLegacyReadProbe}=await import(probePath.href) as {runLegacyReadProbe:(generate:typeof generatePythonClient,commerce:string,nativeTable:string)=>unknown};

test('legacy generatePythonClient read/coercion protocol is stable in Bun, Node and Chromium',async()=>{
 const commerce=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
 const nativeTable=JSON.stringify(tableOperationSource());
 const bunResult=runLegacyReadProbe(generatePythonClient,commerce,nativeTable);
 const values=bunResult as any;

 expect(values.stable.gets).toEqual(['text','package','package','package','package','text','format','text','records','actions','package','package','package','package','text','package','package','package']);
 expect(values.stable.paths).toEqual(['shop/__init__.py','shop/models.py','shop/_runtime.py','shop/source.json','shop/description.json','shop/py.typed','shop/_umf/manifest.json']);
 expect(values.invalidPackage.gets).toEqual(['text','package','package']);
 expect(values.invalidPackage.result.error).toMatchObject({code:'ACCESS_UNSUPPORTED',path:'/package'});
 expect(values.invalidPackageBeforeRecords).toEqual({gets:[],result:{ok:false,code:'ACCESS_UNSUPPORTED',path:'/package'}});
 expect(values.formatGetterFailure).toEqual({gets:['format'],result:{ok:false,name:'Error',message:'format getter sentinel',sameObject:true}});
 expect(values.changingText.reads).toEqual(['text','text','text','text']);
 expect(values.changingText.sourceDigest).toBe('3fe6890d8e7a55f5f9155ff71b484a2118df8c218b30a15f243ecbf5d52ff807');
 expect(values.changingText.returnedTitle).toBe('returned-source');
 expect(values.changingPackage).toEqual({gets:11,paths:['package_5/__init__.py','package_6/models.py','package_7/_runtime.py','package_8/source.json','package_9/description.json','package_10/py.typed','package_11/_umf/manifest.json']});
 expect(values.invalidPackageAndThrowingText.gets).toEqual(['text']);
 expect(values.invalidPackageAndThrowingText.result.error.sameObject).toBe(true);
 expect(values.sourceParseBeforeRecords.gets).toEqual([]);
 expect(values.sourceParseBeforeRecords.result.ok).toBe(false);
 expect(values.recordsSelection.gets).toEqual(['records','records']);
 expect(values.recordsSelection.map).toEqual(['map']);
 expect(values.recordsSelection.selectedCustomer).toBe(true);
 expect(values.recordsSelection.selectedOrder).toBe(false);
 expect(values.throwingRecordsGetter).toEqual({gets:2,result:{ok:false,name:'Error',message:'second records getter sentinel',sameObject:true}});
 expect(values.recordCoercionFailure.gets).toEqual(['module','toPrimitive']);
 expect(values.recordCoercionFailure.result).toMatchObject({message:'record module coercion sentinel',sameObject:true});
 expect(values.recordsIteratorFailure).toEqual({gets:['records','records','map','iterator'],result:{ok:false,name:'Error',message:'records iterator sentinel',sameObject:true}});
 expect(values.actionsSelection.gets).toEqual(['actions','actions']);
 expect(values.actionsSelection.map).toEqual(['map']);
 expect(values.actionsSelection.containsSelectedAction).toBe(true);
 expect(values.throwingActionsGetter).toEqual({gets:2,result:{ok:false,name:'Error',message:'second actions getter sentinel',sameObject:true}});
 expect(values.actionsMapFailure).toEqual({gets:['actions','actions','map'],result:{ok:false,name:'Error',message:'actions map sentinel',sameObject:true}});
 expect(values.nativeStable.gets).toEqual(['text','package','package','package','package','text','format','text','records','format','actions','package','package','package','package','package','text','package','package','package']);
 expect(values.nativeStable.paths).toEqual(['shop/__init__.py','shop/models.py','shop/_runtime.py','shop/_table_runtime.py','shop/source.json','shop/description.json','shop/py.typed','shop/_umf/manifest.json']);
 expect(values.changingNativePackage).toEqual({gets:12,paths:['native_package_5/__init__.py','native_package_6/models.py','native_package_7/_runtime.py','native_package_8/_table_runtime.py','native_package_9/source.json','native_package_10/description.json','native_package_11/py.typed','native_package_12/_umf/manifest.json']});
 expect(values.nativeConditionalFormat.gets).toEqual(['format','format']);
 expect(values.nativeConditionalFormat.result).toMatchObject({code:'ACCESS_UNSUPPORTED',path:'/format'});
 expect(values.packageCoercion.gets).toEqual(['package','package','toPrimitive']);
 expect(values.packageCoercion.result.sameObject).toBe(true);

 const directory=await mkdtemp(join(tmpdir(),'umf-codegen-read-gate0-'));
 let server:ReturnType<typeof Bun.serve>|undefined;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  const build=await Bun.build({entrypoints:[new URL('../src/access/index.ts',import.meta.url).pathname],target:'browser',format:'esm',metafile:true});
  expect(build.success).toBe(true);
  const inputPins=[];const closureRows=[];
  for(const path of Object.keys(build.metafile!.inputs).sort()){
   const sha256=createHash('sha256').update(await readFile(path)).digest('hex');
   inputPins.push({path,sha256});closureRows.push(`${path}\0${sha256}\n`);
  }
  const closureSha256=createHash('sha256').update(closureRows.join('')).digest('hex');
  const closureReceipt=JSON.parse(await Bun.file(new URL('../docs/helix/04-build/evidence/rust-migration/r7-codegen-host-read-gate0/source-closure.json',import.meta.url)).text());
  expect(inputPins).toEqual(closureReceipt.inputs);
  expect(closureSha256).toBe(closureReceipt.inputsSha256);
  const harnessPaths=['tests/unified/commerce.json','tests/unified/table-operation-fixture.ts','scripts/rust-migration/r7/codegen-host-read-gate0-probe.mjs','tests/access-host-read-gate0.test.ts','package.json','bun.lock','node_modules/playwright/package.json'];
  const harnessInputs=[];
  for(const path of harnessPaths)harnessInputs.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
  expect(harnessInputs).toEqual(closureReceipt.harnessInputs);
  expect(createHash('sha256').update(nativeTable).digest('hex')).toBe(closureReceipt.generatedFixtures.nativeTableSha256);
  expect(Bun.version).toBe(closureReceipt.runtimeVersions.bun);
  const bundlePath=join(directory,'legacy-generator.mjs');
  const fixturePath=join(directory,'fixtures.json');
  await writeFile(bundlePath,await build.outputs[0]!.text());
  await writeFile(fixturePath,JSON.stringify({commerce,nativeTable}));

  const nodeProgram=`import {pathToFileURL} from 'node:url';import {readFile} from 'node:fs/promises';const [bundle,probe,fixture]=process.argv.slice(1);const api=await import(pathToFileURL(bundle).href);const helper=await import(pathToFileURL(probe).href);const values=JSON.parse(await readFile(fixture,'utf8'));console.log(JSON.stringify({result:helper.runLegacyReadProbe(api.generatePythonClient,values.commerce,values.nativeTable),node:process.version}));`;
  const node=Bun.spawnSync(['node','--input-type=module','-e',nodeProgram,bundlePath,probePath.pathname,fixturePath],{stdout:'pipe',stderr:'pipe'});
  expect(node.exitCode).toBe(0);
  const nodeEvidence=JSON.parse(node.stdout.toString());
  expect(nodeEvidence.result).toEqual(bunResult);
  expect(nodeEvidence.node).toBe(closureReceipt.runtimeVersions.node);

  const probe=await readFile(probePath,'utf8');
  server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
   const path=new URL(request.url).pathname;
   if(path==='/api.mjs')return new Response(await readFile(bundlePath,'utf8'),{headers:{'content-type':'text/javascript'}});
   if(path==='/probe.mjs')return new Response(probe,{headers:{'content-type':'text/javascript'}});
   if(path==='/fixtures.json')return Response.json({commerce,nativeTable});
   return new Response('<!doctype html><title>Gate 0</title>');
  }});
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();
  let externalRequests=0;
  page.on('request',request=>{if(!request.url().startsWith(server!.url.origin))externalRequests++;});
  await page.goto(server.url.href);
  const chromiumResult=await page.evaluate(async()=>{
   const apiPath:string='/api.mjs';const probePath:string='/probe.mjs';
   const [api,helper,fixture]=await Promise.all([import(apiPath),import(probePath),fetch('/fixtures.json').then(response=>response.json())]);
   return helper.runLegacyReadProbe(api.generatePythonClient,fixture.commerce,fixture.nativeTable);
  });
  expect(chromiumResult).toEqual(bunResult);
  expect(browser.version()).toBe(closureReceipt.runtimeVersions.chromium);
  expect(externalRequests).toBe(0);
  console.log(JSON.stringify({bun:Bun.version,node:nodeEvidence.node,chromium:browser.version(),bundleInputs:Object.keys(build.metafile!.inputs).length,closureSha256,externalRequests}));
 }finally{
  await browser?.close();
  server?.stop(true);
  await rm(directory,{recursive:true,force:true});
 }
},{timeout:60_000});
