// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {captureSelection} from './select-core-elements-cases';

const out='docs/helix/04-build/evidence/rust-migration/r5-select-core-elements-predecessor-20261027';
const tmp='/private/tmp/umf-r5-selection-capture';
await Bun.$`mkdir -p ${out} ${tmp}`;
const sourceFiles=['src/model/selection.ts','src/model/json.ts','src/model/types.ts','src/registry/registry.ts','src/validation/document.ts','src/validation/constraint-kernel.ts','src/validation/current-policy.ts','src/generated/core-validators.ts','tests/core/selection.test.ts','scripts/rust-migration/r5/select-core-elements-cases.ts'];
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,createHash('sha256').update(Buffer.from(await Bun.file(path).arrayBuffer())).digest('hex')])));
const captureScriptHash=createHash('sha256').update(Buffer.from(await Bun.file('scripts/rust-migration/r5/select-core-elements-capture.ts').arrayBuffer())).digest('hex');
const nodeBuild=await Bun.build({entrypoints:['scripts/rust-migration/r5/select-core-elements-cases.ts'],outdir:tmp+'/node',target:'node',format:'esm',packages:'bundle'});
const browserBuild=await Bun.build({entrypoints:['scripts/rust-migration/r5/select-core-elements-cases.ts'],outdir:tmp+'/browser',target:'browser',format:'esm',packages:'bundle'});
if(!nodeBuild.success||!browserBuild.success)throw new Error('Capture bundles failed to build');
const nodeBundle=tmp+'/node/select-core-elements-cases.js',browserBundle=tmp+'/browser/select-core-elements-cases.js';
const nodeProc=Bun.spawn([process.env.NODE??'node','-e',`import(${JSON.stringify('file://'+nodeBundle)}).then(m=>console.log(JSON.stringify(m.captureSelection()))).catch(e=>{console.error(e);process.exit(1)})`],{stdout:'pipe',stderr:'pipe'});
const [nodeStdout,nodeStderr]=await Promise.all([new Response(nodeProc.stdout).text(),new Response(nodeProc.stderr).text()]);
if(await nodeProc.exited!==0)throw new Error('Node capture failed: '+nodeStderr);
const nodeResult=JSON.parse(nodeStdout.trim());
const bunResult=captureSelection();
const server=createServer(async(req,res)=>{const path=new URL(req.url??'/',`http://127.0.0.1`).pathname;if(path==='/cases.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await Bun.file(browserBundle).arrayBuffer());return;}res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>UMF R5 selection capture</title>');});
const port=43862;await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));
const chromiumPath=process.env.UMF_CHROMIUM_PATH??'/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser=await chromium.launch({headless:true,executablePath:chromiumPath});
try{
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(`http://127.0.0.1:${port}/`)){externalRequests.push(url);return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${port}/`);
 const browserResult=await page.evaluate(async(modulePath:string)=>{const c=await import(modulePath);return c.captureSelection();},'/cases.js');
 const summarize=(v:any)=>JSON.stringify(v);
 const exact={node:summarize(nodeResult)===summarize(bunResult),chromium:summarize(browserResult)===summarize(bunResult)};
 if(!exact.node||!exact.chromium||externalRequests.length)throw new Error(`Cross-runtime mismatch or external request: ${JSON.stringify({exact,externalRequests})}`);
 const semantic=bunResult as any;
 if(JSON.stringify(semantic.successful.selection.map((x:any)=>[x.module,x.includedBy]))!==JSON.stringify([['sales','match'],['support','match']])||semantic.transitive.selection.length!==2||semantic.callbacks.order.length!==3||semantic.accessor.getterCalls!==0||semantic.thrownValueIdentity.sameObject!==true||semantic.cycle.error.code!=='CYCLE'||semantic.unknownAnnotations.edge!=='annotation'||semantic.controls.extraQuery!=='CORE_SELECTION_QUERY')throw new Error('Frozen selection contract assertions failed');
 const report={format:'umf.r5.select-core-elements.predecessor/1',status:'pass',source:{gitHead:await Bun.$`git rev-parse HEAD`.text().then(x=>x.trim()),captureScriptSha256:captureScriptHash,files:sourceHashes},build:{bunVersion:Bun.version,nodeBundleSha256:createHash('sha256').update(Buffer.from(await Bun.file(nodeBundle).arrayBuffer())).digest('hex'),browserBundleSha256:createHash('sha256').update(Buffer.from(await Bun.file(browserBundle).arrayBuffer())).digest('hex')},runtimes:{bun:Bun.version,node:process.version,nodePlatform:process.platform,nodeArch:process.arch,chromium:browser.version(),chromiumExecutable:chromiumPath},network:{externalRequests:externalRequests.length},equivalence:exact,results:{bun:bunResult,node:nodeResult,chromium:browserResult}};
 await Bun.write(out+'/results.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,runtimes:report.runtimes,equivalence:exact,externalRequests:externalRequests.length,output:out+'/results.json'},null,2));
}finally{await browser.close();server.close();}
