// Navigation-only provenance capture for the declared homepage font request.
// All external requests are blocked; this script never generates or downloads.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const repo=resolve(process.argv[2]??'/Users/erik/.codex/worktrees/rust-binding-spike/umf');
const base=new URL(process.argv[3]??'https://documentdrivendx.github.io/umf/');
const output=resolve(process.argv[4]??'/private/tmp/umf-0109-release/receipts/site-font-origin-diagnostic-0109.json');
assert.equal(base.protocol,'https:','diagnostic expects the public HTTPS site');
assert(!await import('node:fs/promises').then(({access})=>access(output).then(()=>true,()=>false)),'refusing to overwrite diagnostic receipt');
const {chromium}=createRequire(resolve(repo,'package.json'))('playwright');
const declaredFont='https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap';
const blocked=[],fontRequests=[],pageErrors=[],phaseHistory=[];
let phase='homepage',browser;
const phaseAt=(name)=>{phase=name;phaseHistory.push({phase:name,at:Date.now(),documentURL:page?.url()??null});};
let page;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 page=await browser.newPage();
 page.on('pageerror',error=>pageErrors.push(String(error)));
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Network.enable');
 cdp.on('Network.requestWillBeSent',event=>{
  if(event.request.url===declaredFont){
   fontRequests.push({source:'cdp',url:event.request.url,documentURL:event.documentURL,
    initiator:event.initiator,timestamp:event.timestamp,wallTime:event.wallTime??null,
    resourceType:event.type,phaseAtCapture:phase});
  }
 });
 await page.route('**/*',async route=>{
  const request=route.request(),url=request.url();
  if(new URL(url).origin===base.origin)return route.continue();
  let headers={};try{headers=await request.allHeaders();}catch{}
  let frameUrl=null;try{frameUrl=request.frame().url();}catch{}
  const record={url,phaseAtCapture:phase,documentURL:page.url(),
   referer:headers.referer??null,frameURL:frameUrl,resourceType:request.resourceType(),
   capturedAt:Date.now()};
  blocked.push(record);
  if(url===declaredFont)fontRequests.push({source:'route',...record});
  await route.abort();
 });
 await page.goto(base.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('a[href="pack-tools.html"]').first().waitFor({state:'visible',timeout:60000});
 phaseAt('workbench-load');
 await page.goto(new URL('pack-tools.html?pack=pack:legal-appellate@1.1.0',base).href,
  {waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.querySelector('#generation-status')?.textContent?.includes('domain packs loaded'),
  undefined,{timeout:60000});
 await page.waitForTimeout(1200);
 const report={profile:'umf.microsite-font-origin-diagnostic/1',status:'captured',
  baseUrl:base.href,workbenchUrl:page.url(),declaredFont,blockedExternalRequestCount:blocked.length,
  fontRequestCount:fontRequests.length,fontRequests,blockedExternalRequests:blocked,
  phaseHistory,pageErrors,browser:browser.version(),generationRun:false,downloadsRun:false,
  interpretation:'Use CDP initiator.documentURL as origin proof; request referer and frame/top-document URLs are accompanying evidence. Every external request was aborted.'};
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:report.status,fontRequestCount:fontRequests.length,
  blockedExternalRequestCount:blocked.length,receipt:output}));
}finally{await browser?.close();}
