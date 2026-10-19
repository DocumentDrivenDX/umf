// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC12
// @covers US-079-AC10
/** Governed S15 replay of an independently authored finite semantic oracle. */
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {runOracle} from './migration-oracle';
const id=Bun.argv[2],runId=Bun.env.UMF_SECURITY_RUN_ID;
if(id!=='S15'||Bun.env.UMF_SECURITY_CASE_ID!==id||!runId)throw Error('Fresh S15 case/run binding required');
const plan=await Bun.file('docs/helix/03-test/security/cases.json').json();
const c=plan.cases.find((row:any)=>row.id===id);
if(!c||c.backend!=='semantic'||JSON.stringify(c.command)!==JSON.stringify(['bun','tests/security/protection/migration-acceptance.ts','S15']))throw Error('S15 governed command differs');
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const paths=[...new Set<string>([c.testSource,c.oracleSource,...c.implementationSources])];
const pins=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(new Uint8Array(await Bun.file(path).arrayBuffer()))])));
const before=await pins(),bunRows=runOracle();
if(!bunRows.length||bunRows.some(row=>!row.passed))throw Error('S15 Bun independent expectations failed: '+JSON.stringify(bunRows.filter(row=>!row.passed)));
const build=await Bun.build({entrypoints:[c.oracleSource],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('S15 browser build failed');
const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('S15 bundle UTF16 bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/oracle.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>S15 migration oracle</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;const pageErrors:string[]=[];
 page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===`http://127.0.0.1:${server.port}`?r.continue():(externalRequests++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const chromiumRows=await page.evaluate(async()=>{const path='/oracle.js';const api=await import(path);return {rows:api.runOracle(),hostGlobalsAbsent:['Bun','process','Buffer','Deno'].every(key=>!(key in globalThis))};});
 const after=await pins();
 const observations=[...bunRows.map(row=>({assertionId:'S15:bun:'+row.id,expected:true,observed:row.passed})),...chromiumRows.rows.map((row:any)=>({assertionId:'S15:chromium:'+row.id,expected:true,observed:row.passed})),{assertionId:'S15:parity',expected:bunRows,observed:chromiumRows.rows},{assertionId:'S15:source-custody',expected:before,observed:after},{assertionId:'S15:host-globals',expected:true,observed:chromiumRows.hostGlobalsAbsent},{assertionId:'S15:external-requests',expected:0,observed:externalRequests},{assertionId:'S15:page-errors',expected:[],observed:pageErrors}];
 const passed=observations.every(row=>JSON.stringify(row.expected)===JSON.stringify(row.observed));
 observations.push({assertionId:'S15',expected:true,observed:passed});
 console.log(JSON.stringify({status:passed?'passed':'failed',id,runId,backend:'semantic',command:c.command,covers:c.covers,versions:{bun:Bun.version,chromium:browser.version()},sourceDigests:after,observations,bundle:{sha256:hash(js),utf16Units:js.length,bytes:new TextEncoder().encode(js).length},scope:'Reviewed finite independent legacy-domain oracle through actual root API in Bun/Chromium: forward constant meaning, guarded rollback and original source retention. Explicit synthetic host cuts; no general0.2/protection functions, native admission or full implementation refinement theorem.'}));
 if(!passed)process.exitCode=1;
}finally{await browser?.close();server.stop(true);}
