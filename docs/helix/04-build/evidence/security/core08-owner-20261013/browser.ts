import {writeFile} from 'node:fs/promises';
const root='/Users/erik/.codex/worktrees/security-main-integration/umf';
const built=await Bun.build({entrypoints:[root+'/tools/security/core08-owner-cases.ts'],target:'browser',format:'esm'});if(!built.success)throw Error('Browser build failed');
const bundle=await built.outputs[0].text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/cases.js'?new Response(bundle,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Original core0.8 source owners</title>')}});
const {chromium}=await import(root+'/node_modules/playwright/index.mjs');let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:'+server.port);
 const observations=await page.evaluate(async()=>{const owner=await import('/cases.js');return owner.runCore08OwnerCases()});
 if(observations.some((r:any)=>r.passed!==true))throw Error('Owner browser control failed');
 if(requests.some(url=>!url.startsWith('http://127.0.0.1:'+server.port)))throw Error('External request');
 const receipt={browser:browser.version(),bundleSha256:new Bun.CryptoHasher('sha256').update(bundle).digest('hex'),observations,requests,scope:'Actual original versioned UMF owner API cases in Chromium; no native ingress, source issuer or backend security acceptance.'};
 await writeFile('/private/tmp/umf-core08-owner-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({browser:receipt.browser,controls:observations.length}));
}finally{await browser?.close();server.stop(true)}
