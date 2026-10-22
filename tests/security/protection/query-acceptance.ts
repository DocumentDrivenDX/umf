// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC13
// @covers US-079-AC8
// @covers US-079-AC11
// @covers US-079-AC10
// @covers US-079-AC3
/** Fresh S16/S17/S18 replay; finite oracle is independently authored. */
import {createHash} from 'node:crypto';
import {writeSync} from 'node:fs';
async function writeReceipt(value:unknown){const bytes=Buffer.from(JSON.stringify(value)+'\n');if(bytes.length>900_000)throw Error('Receipt output bound');let offset=0;const deadline=Date.now()+5000;while(offset<bytes.length){try{offset+=writeSync(1,bytes,offset,Math.min(4096,bytes.length-offset));}catch(error){if((error as NodeJS.ErrnoException).code!=='EAGAIN'||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,1));}}}
import {chromium} from 'playwright';
import {runOracle} from './query-oracle';
import {randomTokenMutant} from './query-mutant';
const id=Bun.argv[2],runId=Bun.env.UMF_SECURITY_RUN_ID;
if((id!=='S16'&&id!=='S17'&&id!=='S18')||Bun.env.UMF_SECURITY_CASE_ID!==id||!runId)throw Error('Fresh case/run binding required');
const plan=await Bun.file('docs/helix/03-test/security/cases.json').json(),c=plan.cases.find((row:any)=>row.id===id);
if(!c||c.backend!=='semantic'||JSON.stringify(c.command)!==JSON.stringify(['bun','tests/security/protection/query-acceptance.ts',id]))throw Error('Governed command differs');
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const files=[...new Set<string>([c.testSource,c.oracleSource,...c.implementationSources])];
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
const before=await pins(),bunRows=runOracle(id);
const mutant=id==='S17'?await randomTokenMutant():null;
if(!bunRows.length||bunRows.some(row=>!row.passed))throw Error('Independent Bun expectations failed: '+JSON.stringify(bunRows.filter(row=>!row.passed)));
const build=await Bun.build({entrypoints:[c.oracleSource],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Public root browser oracle build failed');
const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('Bundle UTF16 bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/oracle.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Protection conditional property oracle</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===`http://127.0.0.1:${server.port}`?r.continue():(externalRequests++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(caseId)=>{const path='/oracle.js',api=await import(path);return {rows:api.runOracle(caseId),hostGlobalsAbsent:['Bun','process','Buffer','Deno'].every(key=>!(key in globalThis))};},id);
 const mutantBrowser=mutant?await page.evaluate(async(js)=>{const path=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));try{return (await import(path)).runOracle('S17');}finally{URL.revokeObjectURL(path);}},mutant.js):null;
 const after=await pins();
 const observations=[...bunRows.map(row=>({assertionId:id+':bun:'+row.id,expected:true,observed:row.passed})),...observed.rows.map((row:any)=>({assertionId:id+':chromium:'+row.id,expected:true,observed:row.passed})),{assertionId:id+':parity',expected:bunRows,observed:observed.rows},{assertionId:id+':source-custody',expected:before,observed:after},{assertionId:id+':host-globals',expected:true,observed:observed.hostGlobalsAbsent},{assertionId:id+':external-requests',expected:0,observed:externalRequests},{assertionId:id+':page-errors',expected:[],observed:pageErrors}];
 if(mutant){observations.push({assertionId:id+':actual-mutant-source',expected:before['src/extensions/security/protection/queries.ts'],observed:mutant.sourceSha256});const failures=(rows:any[])=>rows.filter(row=>!row.passed).map(row=>row.id);observations.push({assertionId:id+':actual-mutant-bun',expected:mutant.expectedFailures,observed:failures(mutant.rows)},{assertionId:id+':actual-mutant-chromium',expected:mutant.expectedFailures,observed:failures(mutantBrowser)},{assertionId:id+':actual-mutant-parity',expected:mutant.rows,observed:mutantBrowser});}
 const passed=observations.every(row=>JSON.stringify(row.expected)===JSON.stringify(row.observed));observations.push({assertionId:id,expected:true,observed:passed});
 await writeReceipt({status:passed?'passed':'failed',id,runId,backend:'semantic',command:c.command,covers:c.covers,versions:{bun:Bun.version,chromium:browser.version()},sourceDigests:after,observations,bundle:{sha256:hash(js),utf16Units:js.length,bytes:new TextEncoder().encode(js).length},mutation:mutant?{sourceSha256:mutant.sourceSha256,mutantSha256:mutant.mutantSha256,bundleSha256:mutant.bundleSha256,scope:mutant.scope}:null,scope:'Independent finite typed-declaration and conditional property oracles via actual public root API in Bun/Chromium. Supplied dependency assumptions are retained, not compiler attestation. No function applicability, original-action grant, native authority or executable refinement theorem.'});if(!passed)process.exitCode=1;
}finally{await browser?.close();server.stop(true);}
