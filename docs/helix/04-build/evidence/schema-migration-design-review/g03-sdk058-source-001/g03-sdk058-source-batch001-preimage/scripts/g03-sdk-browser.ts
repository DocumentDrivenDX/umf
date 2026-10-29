// SPDX-License-Identifier: MIT OR Apache-2.0
/** Installed SDK public-entry G03 parity in Chromium; no native effects. */
/** UMF_G03_SDK_INSTALL is a consumer directory containing node_modules/@umf/core. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';

const corpusPath=resolve(process.argv[2]??'');
const pythonReportPath=resolve(process.argv[3]??'');
const outputPath=resolve(process.argv[4]??'');
if(process.argv.length!==5||!process.env.UMF_G03_SDK_INSTALL||!process.env.UMF_G03_SDK_ARCHIVE||!process.env.UMF_CHROMIUM_PATH){
 throw Error('Usage: bun scripts/g03-sdk-browser.ts <corpus.json> <python-report.json> <output.json> with UMF_G03_SDK_INSTALL, UMF_G03_SDK_ARCHIVE and UMF_CHROMIUM_PATH');
}
const installRoot=resolve(process.env.UMF_G03_SDK_INSTALL);
const packageRoot=join(installRoot,'node_modules','@umf','core');
const archivePath=resolve(process.env.UMF_G03_SDK_ARCHIVE);
const corpusBytes=await readFile(corpusPath),pythonBytes=await readFile(pythonReportPath);
const corpus=JSON.parse(corpusBytes.toString('utf8'));
const pythonReport=JSON.parse(pythonBytes.toString('utf8'));
const packageBytes=await readFile(join(packageRoot,'package.json'));
const packageMetadata=JSON.parse(packageBytes.toString('utf8'));
const distributionManifestBytes=await readFile(join(packageRoot,'manifest.json'));
const entryBytes=await readFile(join(packageRoot,'dist','umf.js'));
const packageManifest=JSON.parse(await Bun.file('package.json').text());
if(packageMetadata.name!=='@umf/core'||packageMetadata.version!=='0.5.8'||packageMetadata.version!==packageManifest.version){
 throw Error('Installed SDK identity differs from the selected source candidate');
}
if(packageMetadata.exports?.['.']?.import!=='./dist/umf.js')throw Error('Installed package public import does not resolve to dist/umf.js');
if(corpus.profile!=='umf.codegen-g03-migration-corpus/0.1'||!Array.isArray(corpus.discovery)||!Array.isArray(corpus.plans)){
 throw Error('Unexpected G03 corpus profile or shape');
}
const rawWireCases=corpus.discovery.filter((item:any)=>'rawWireRequest'in item);
if(rawWireCases.length!==1)throw Error('Expected the single paired embedded raw-wire boundary case');
const discoveryExpected=corpus.discovery.filter((item:any)=>!('rawWireRequest'in item));
const discoveryRefusals=discoveryExpected.filter((item:any)=>'expectedError'in item).length;
const discoveryParity=discoveryExpected.length-discoveryRefusals;
const tamperCases=corpus.plans.reduce((count:number,item:any)=>count+(item.tamper?.length??0),0);
const acceptedPlans=corpus.plans.filter((item:any)=>item.expected?.status==='compiled').length;
const blockedPlans=corpus.plans.length-acceptedPlans;
const pythonExpected={
 profile:corpus.profile,
 discoveryParityCases:discoveryParity,
 compilationParityCases:corpus.plans.length,
 verificationParityCases:acceptedPlans,
 acceptedPlans,
 blockedPlans,
 pythonExplicitNoneOmissionCases:discoveryExpected.filter((item:any)=>item.name==='null-options-omission').length,
 rawWireNullRefusalCases:rawWireCases.length,
 discoveryRefusalCases:discoveryRefusals,
 rehashedTamperRefusalCases:tamperCases,
 nativeLifecycleReleaseQualified:false,
};
for(const [key,value] of Object.entries(pythonExpected))if(pythonReport[key]!==value)throw Error(`Embedded Python report does not bind the same G03 corpus: ${key}`);

const workspace=await mkdtemp(join(tmpdir(),'umf-g03-sdk-browser-'));
let server:ReturnType<typeof Bun.serve>|undefined,browser:any;
const externalRequests:string[]=[];
try{
 const entryPath=join(workspace,'g03-installed-sdk-entry.ts');
 const bundleEntry=`export {discoverTableMigrationChanges,compileTableMigration,verifyTableMigration} from '@umf/core';\n`;
 await symlink(join(installRoot,'node_modules'),join(workspace,'node_modules'),'dir');
 await Bun.write(entryPath,bundleEntry);
 const built=await Bun.build({entrypoints:[entryPath],target:'browser',format:'esm',minify:false});
 if(!built.success)throw Error('Installed SDK browser bundle failed: '+JSON.stringify(built.logs));
 const bundle=await built.outputs[0]!.text();
 const hash=async(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
 const paths=[
  'scripts/g03-migration-corpus.ts','scripts/g03-sdk-browser.ts','scripts/package-sdk.ts',
  'scripts/package-sdk.py','scripts/test-sdk-install.ts','package.json','python/pyproject.toml',
  'tests/binding/fixtures/table-lifecycle-note.json','tests/codegen/g03_migration_probe.py',
  'src/table-migration/index.ts','src/generated/core-model.ts',
 ];
 const sourceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await hash(await readFile(path))])));
 const sdkInputs={sdkArchivePath:archivePath,installedPackagePath:packageRoot,corpusPath,pythonReportPath,
  archiveSha256:await hash(await readFile(archivePath)),packageJsonSha256:await hash(packageBytes),
  packageManifestSha256:await hash(distributionManifestBytes),publicEntrySha256:await hash(entryBytes),
  corpusSha256:await hash(corpusBytes),pythonReportSha256:await hash(pythonBytes),bundleSha256:await hash(bundle),sourceHashes};
 const activeServer=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/sdk.js')return new Response(bundle,{headers:{'content-type':'text/javascript; charset=utf-8'}});
  if(path==='/corpus')return Response.json(corpus);
  if(path==='/')return new Response('<!doctype html><meta charset="utf-8"><title>Installed SDK G03 parity</title>',{headers:{'content-type':'text/html; charset=utf-8'}});
  return new Response('Not found',{status:404});
 }});
 server=activeServer;
 browser=await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH});
 const page=await browser.newPage();
 await page.route('**/*',route=>{
  if(!route.request().url().startsWith(`http://127.0.0.1:${activeServer.port}/`)){externalRequests.push(route.request().url());return route.abort();}
  return route.continue();
 });
 await page.goto(`http://127.0.0.1:${activeServer.port}/`);
 const checks=await page.evaluate(async()=>{
  const sdk=await import('/sdk.js'),corpus=await(await fetch('/corpus')).json();
  const stable=(value:any):string=>{
   if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
   if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
   return JSON.stringify(value)??'undefined';
  };
  const same=(actual:any,expected:any,label:string)=>{if(stable(actual)!==stable(expected))throw Error('Installed SDK parity mismatch: '+label);};
  const errorRecord=(error:any)=>({code:error?.code??'MIGRATION_CHANGES_FAILED',message:error?.message??'Reviewed change discovery refused',...(error?.path===undefined?{}:{path:error.path})});
  let discoveryParityCases=0,discoveryRefusalCases=0,compilationParityCases=0,verificationParityCases=0;
  let acceptedPlans=0,blockedPlans=0,rehashedTamperRefusalCases=0,pythonNoneOmissionCases=0;
  const rawWireNullRefusalCases=corpus.discovery.filter((item:any)=>'rawWireRequest'in item).length;
  for(const item of corpus.discovery){
   if('rawWireRequest'in item)continue;
   let actual:any,thrown:any;
   try{actual=sdk.discoverTableMigrationChanges(item.previous,item.next,item.options);}
   catch(error){thrown=error;}
   if('expectedError'in item){
    if(!thrown)throw Error('Installed SDK accepted discovery refusal: '+item.name);
    same(errorRecord(thrown),item.expectedError,item.name);discoveryRefusalCases++;
   }else{
    if(thrown)throw thrown;
    same(actual,item.expected,item.name);discoveryParityCases++;
    if(item.name==='null-options-omission')pythonNoneOmissionCases++;
   }
  }
  for(const item of corpus.plans){
   const actual=sdk.compileTableMigration(item.request);
   same(actual,item.expected,item.name+':compile');compilationParityCases++;
   if(actual.status==='compiled'){
    acceptedPlans++;
    const verified=sdk.verifyTableMigration(actual.plan);
    same(verified,actual.plan,item.name+':verify');verificationParityCases++;
    for(const tamper of item.tamper??[]){
     let thrown:any;
     try{sdk.verifyTableMigration(tamper.plan);}catch(error){thrown=error;}
     if(!thrown)throw Error('Installed SDK accepted rehashed plan tamper: '+item.name+':'+tamper.mutation);
     same(errorRecord(thrown),tamper.expectedError,item.name+':'+tamper.mutation);
     rehashedTamperRefusalCases++;
    }
   }else blockedPlans++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host runtime global leaked into browser bundle');
  return {discoveryParityCases,discoveryRefusalCases,compilationParityCases,verificationParityCases,acceptedPlans,blockedPlans,
   pythonNoneOmissionCases,rawWireNullRefusalCases,rehashedTamperRefusalCases,nativeLifecycleReleaseQualified:false};
 });
 assert.equal(checks.discoveryParityCases,pythonReport.discoveryParityCases);
 assert.equal(checks.discoveryRefusalCases,pythonReport.discoveryRefusalCases);
 assert.equal(checks.compilationParityCases,pythonReport.compilationParityCases);
 assert.equal(checks.verificationParityCases,pythonReport.verificationParityCases);
 assert.equal(checks.acceptedPlans,pythonReport.acceptedPlans);
 assert.equal(checks.blockedPlans,pythonReport.blockedPlans);
 assert.equal(checks.pythonNoneOmissionCases,pythonReport.pythonExplicitNoneOmissionCases);
 assert.equal(checks.rawWireNullRefusalCases,pythonReport.rawWireNullRefusalCases);
 assert.equal(checks.rehashedTamperRefusalCases,pythonReport.rehashedTamperRefusalCases);
 assert.deepEqual(externalRequests,[]);
 await Bun.write(outputPath,JSON.stringify({profile:'umf.sdk-g03-browser-parity/0.1',sdkVersion:packageMetadata.version,
  browser:browser.version(),checks,rawWireBoundary:'The embedded raw-wire selector check is not an @umf/core public SDK export; its result is independently required from the paired embedded Python report.',
  externalRequests,sdkInputs},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{
 await browser?.close();
 server?.stop(true);
 await rm(workspace,{recursive:true,force:true});
}
