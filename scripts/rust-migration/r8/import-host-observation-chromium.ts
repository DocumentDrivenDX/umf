// SPDX-License-Identifier: MIT OR Apache-2.0
// Build the direct TypeScript source into a browser bundle and observe it in Chromium.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const built=await Bun.build({entrypoints:['scripts/rust-migration/r8/import-host-observation-browser-entry.ts'],target:'browser',format:'iife',naming:'r8-browser.js',outdir:'/private/tmp/r8-import-browser',minify:false});
if(!built.success) throw new Error(built.logs.map(x=>x.message).join('\n'));
const bundle=readFileSync('/private/tmp/r8-import-browser/r8-browser.js');
const server=createServer((req,res)=>{if(req.url==='/r8-browser.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(bundle);}else{res.writeHead(404);res.end();}});
await new Promise<void>(resolveReady=>server.listen(0,'127.0.0.1',resolveReady));
const address=server.address(); if(!address||typeof address==='string')throw new Error('loopback server did not bind');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(); const pageErrors:string[]=[]; const requests:string[]=[]; const externalRequests:string[]=[]; const bundleResponses:number[]=[];
 const origin=`http://127.0.0.1:${address.port}`; const bundleUrl=`${origin}/r8-browser.js`;
 page.on('pageerror',e=>pageErrors.push(String(e)));
 page.on('request',req=>{requests.push(req.url());if(!req.url().startsWith(origin+'/'))externalRequests.push(req.url());});
 page.on('response',res=>{if(res.url()===bundleUrl)bundleResponses.push(res.status());});
 await page.goto(`${origin}/`);
 await page.addScriptTag({url:bundleUrl});
 const results=await page.evaluate(()=>((globalThis as any).R8ImportHostObservation.results));
 const sourceHash=createHash('sha256').update(readFileSync('src/adapters/json-schema/index.ts')).digest('hex');
 const receipt={title:'R8 direct TypeScript import host-observation oracle',status:'observed',scope:'Nine direct calls to the current source entrypoint bundled for browser execution in real Chromium.',source:{path:'src/adapters/json-schema/index.ts',sha256:sourceHash,hashScope:'This hashes only the entry module; imported files and generated inputs are not included.'},runtime:{chromium:browser.version(),playwright:'1.63.0',bun:Bun.version,platform:process.platform,arch:process.arch},bundle:{sha256:createHash('sha256').update(bundle).digest('hex'),bytes:bundle.length,entry:'scripts/rust-migration/r8/import-host-observation-browser-entry.ts'},browser:{pageErrors,requests,externalRequests,bundleResponses},negativeControls:{baseUriThrowPreservesObjectIdentity:results.find((x:any)=>x.id==='base-uri-getter-throws-original-object')?.outcome.sameObject===true,invalidUriLeavesResourcesUntouched:results.find((x:any)=>x.id==='invalid-base-uri-precedes-resources-and-root')?.events.join(',')==='baseUri#1',resourceParseRefusalPrecedesRootCoercion:!results.find((x:any)=>x.id==='resource-parse-failure-precedes-root-coercion')?.events.includes('root-toString'),nonStringRootToStringPrecedesTypeRefusal:(()=>{const c=results.find((x:any)=>x.id==='non-string-root-toString-observed-before-yaml-type-refusal');return c?.events.at(-1)==='root-toString'&&c.outcome.name==='TypeError'&&c.outcome.message==='source is not a string';})(),threeDistinctUriReadsReachSeparatePayloadAndNamespace:(()=>{const c=results.find((x:any)=>x.id==='three-distinct-base-uri-reads-preserved');return c?.events.join(',')==='baseUri#1,resources,baseUri#2,id,baseUri#3'&&c.outcome.kind==='return'&&c.outcome.baseUri==='https://example.test/read-2'&&c.outcome.namespace==='https://example.test/read-3';})(),rootParseFailureStopsBeforeIdAndReadThree:(()=>{const c=results.find((x:any)=>x.id==='root-parse-failure-precedes-id-and-base-uri-read-three');return c?.events.join(',')==='baseUri#1,resources,baseUri#2'&&c.outcome.kind==='throw'&&c.outcome.code==='JSON_SCHEMA_SYNTAX';})(),zeroPageErrors:pageErrors.length===0,noExternalRequests:externalRequests.length===0,browserBundleServedOnce:bundleResponses.length===1&&bundleResponses[0]===200&&requests.filter(x=>x===bundleUrl).length===1},cases:results};
 if(Object.values(receipt.negativeControls).some(x=>x!==true))throw new Error(`Chromium negative control failed: ${JSON.stringify(receipt.negativeControls)}`);
 writeFileSync(resolve(process.argv[2]??'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/import-host-observation-chromium.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({cases:results.length,chromium:browser.version(),controls:receipt.negativeControls,sourceHash},null,2));
} finally {await browser.close();server.close();}
