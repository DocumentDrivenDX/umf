import {expect,test} from 'bun:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {generatePythonClient} from '../src/access';
import {tableOperationSource} from './unified/table-operation-fixture';

const probePath=new URL('./helpers/generator-read-probe.mjs',import.meta.url);
const {runGeneratorReadProbe}=await import(probePath.href) as {runGeneratorReadProbe:(generate:typeof generatePythonClient,commerce:string,nativeTable:string)=>unknown};

test('generatePythonClient read/coercion behavior matches in Bun, Node and Chromium',async()=>{
 const commerce=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
 const nativeTable=JSON.stringify(tableOperationSource());
 const bunResult=runGeneratorReadProbe(generatePythonClient,commerce,nativeTable);
 const values=bunResult as any;

 expect(values.stable.gets).toEqual(['text','package','package','package','package','text','format','text','records','actions','package','package','package','package','text','package','package','package']);
 expect(values.stable.paths).toEqual(['shop/__init__.py','shop/models.py','shop/_runtime.py','shop/source.json','shop/description.json','shop/py.typed','shop/_umf/manifest.json']);
 expect(values.invalidPackage.gets).toEqual(['text','package','package']);
 expect(values.invalidPackage.result.error).toMatchObject({code:'ACCESS_UNSUPPORTED',path:'/package'});
 expect(values.invalidPackageBeforeRecords).toEqual({gets:[],result:{ok:false,code:'ACCESS_UNSUPPORTED',path:'/package'}});
 expect(values.formatGetterFailure).toEqual({gets:['format'],result:{ok:false,name:'Error',message:'format getter sentinel',sameObject:true}});
 expect(values.changingText.reads).toEqual(['text','text','text','text']);
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

 const directory=await mkdtemp(join(tmpdir(),'umf-generator-host-reads-'));
 let server:ReturnType<typeof Bun.serve>|undefined;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  const build=await Bun.build({entrypoints:[new URL('../src/access/index.ts',import.meta.url).pathname],target:'browser',format:'esm'});
  expect(build.success).toBe(true);
  const bundlePath=join(directory,'generator.mjs');
  const fixturePath=join(directory,'fixtures.json');
  await writeFile(bundlePath,await build.outputs[0]!.text());
  await writeFile(fixturePath,JSON.stringify({commerce,nativeTable}));

  const nodeProgram=`import {pathToFileURL} from 'node:url';import {readFile} from 'node:fs/promises';const [bundle,probe,fixture]=process.argv.slice(1);const api=await import(pathToFileURL(bundle).href);const helper=await import(pathToFileURL(probe).href);const values=JSON.parse(await readFile(fixture,'utf8'));console.log(JSON.stringify({result:helper.runGeneratorReadProbe(api.generatePythonClient,values.commerce,values.nativeTable),node:process.version}));`;
  const node=Bun.spawnSync(['node','--input-type=module','-e',nodeProgram,bundlePath,probePath.pathname,fixturePath],{stdout:'pipe',stderr:'pipe'});
  expect(node.exitCode).toBe(0);
  const nodeEvidence=JSON.parse(node.stdout.toString());
  expect(nodeEvidence.result).toEqual(bunResult);

  const probe=await readFile(probePath,'utf8');
  server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
   const path=new URL(request.url).pathname;
   if(path==='/api.mjs')return new Response(await readFile(bundlePath,'utf8'),{headers:{'content-type':'text/javascript'}});
   if(path==='/probe.mjs')return new Response(probe,{headers:{'content-type':'text/javascript'}});
   if(path==='/fixtures.json')return Response.json({commerce,nativeTable});
   return new Response('<!doctype html><title>Generator host reads</title>');
  }});
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();
  let externalRequests=0;
  page.on('request',request=>{if(!request.url().startsWith(server!.url.origin))externalRequests++;});
  await page.goto(server.url.href);
  const chromiumResult=await page.evaluate(async()=>{
   const apiPath:string='/api.mjs';const probePath:string='/probe.mjs';
   const [api,helper,fixture]=await Promise.all([import(apiPath),import(probePath),fetch('/fixtures.json').then(response=>response.json())]);
   return helper.runGeneratorReadProbe(api.generatePythonClient,fixture.commerce,fixture.nativeTable);
  });
  expect(chromiumResult).toEqual(bunResult);
  expect(externalRequests).toBe(0);
  console.log(JSON.stringify({bun:Bun.version,node:nodeEvidence.node,chromium:browser.version(),externalRequests}));
 }finally{
  await browser?.close();
  server?.stop(true);
  await rm(directory,{recursive:true,force:true});
 }
},{timeout:60_000});
