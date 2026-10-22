// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC14
// @covers US-079-AC10
/** Fresh original S19: independently generated Python outcomes and actual APIs. */
import {createHash} from 'node:crypto';
import {writeSync} from 'node:fs';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {runOracle} from './functions-oracle';
const id=Bun.argv[2],runId=Bun.env.UMF_SECURITY_RUN_ID;
if(id!=='S19'||Bun.env.UMF_SECURITY_CASE_ID!==id||!runId)throw Error('Fresh governed S19 case/run required');
const plan=await Bun.file('docs/helix/03-test/security/cases.json').json(),c=plan.cases.find((row:any)=>row.id===id);
if(!c||c.backend!=='semantic'||c.oracleSource!=='tests/security/protection/functions-oracle.py'||JSON.stringify(c.command)!==JSON.stringify(['bun','tests/security/protection/functions-acceptance.ts',id]))throw Error('Governed command differs');
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const files=[...new Set<string>([c.testSource,c.oracleSource,...c.implementationSources])];
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
async function writeReceipt(value:unknown){const bytes=Buffer.from(JSON.stringify(value)+'\n');if(bytes.length>900_000)throw Error('Receipt output bound');let offset=0;const deadline=Date.now()+5000;while(offset<bytes.length){try{offset+=writeSync(1,bytes,offset,Math.min(4096,bytes.length-offset));}catch(error){if((error as NodeJS.ErrnoException).code!=='EAGAIN'||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,1));}}}
const before=await pins(),work=await mkdtemp(join(tmpdir(),'umf-functions-python-'));
let python:any;
try{
 await cp(c.oracleSource,join(work,'oracle.py'));
 const child=Bun.spawn(['python3',join(work,'oracle.py')],{cwd:work,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 if(exit!==0||stderr)throw Error('Fresh Python oracle failed: '+stderr);
 const actual=new Uint8Array(await Bun.file(join(work,'fixtures.json')).arrayBuffer()),expected=new Uint8Array(await Bun.file('tests/security/protection/functions-fixtures.json').arrayBuffer());
 if(actual.length>1_000_000||Buffer.compare(Buffer.from(actual),Buffer.from(expected))!==0)throw Error('Fresh independent fixture bytes differ');
 python={...JSON.parse(stdout),fixtureSha256:hash(actual),fixtureBytes:actual.length,exactFixtureBytes:true};
}finally{await rm(work,{recursive:true,force:true});}
const bun=await runOracle();if(bun.rows.length!==460||bun.rows.some(row=>!row.pass))throw Error('Independent Bun outcomes failed');
const build=await Bun.build({entrypoints:['tests/security/protection/functions-oracle.ts'],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Public root browser oracle build failed');
const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('Browser bundle bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/oracle.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Pure function oracle</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===`http://127.0.0.1:${server.port}`?r.continue():(externalRequests++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async()=>{const path='/oracle.js',api=await import(path);return {result:await api.runOracle(),hostGlobalsAbsent:['Bun','process','Buffer','Deno'].every(k=>!(k in globalThis))};});
 const after=await pins();
 const observations=[...bun.rows.map(row=>({assertionId:id+':bun:'+row.id,expected:true,observed:row.pass})),...observed.result.rows.map((row:any)=>({assertionId:id+':chromium:'+row.id,expected:true,observed:row.pass})),{assertionId:id+':parity',expected:bun.rows,observed:observed.result.rows},{assertionId:id+':source-custody',expected:before,observed:after},{assertionId:id+':python-fixtures',expected:true,observed:python.exactFixtureBytes},{assertionId:id+':browser-row-count',expected:460,observed:observed.result.rows.length},{assertionId:id+':host-globals',expected:true,observed:observed.hostGlobalsAbsent},{assertionId:id+':external-requests',expected:0,observed:externalRequests},{assertionId:id+':page-errors',expected:[],observed:errors}];
 const passed=observations.every(row=>JSON.stringify(row.expected)===JSON.stringify(row.observed));observations.push({assertionId:id,expected:true,observed:passed});
 await writeReceipt({status:passed?'passed':'failed',id,runId,backend:'semantic',command:c.command,covers:c.covers,versions:{bun:Bun.version,chromium:browser.version(),python:python.python},sourceDigests:after,observations,independentPython:python,bundle:{sha256:hash(js),utf16Units:js.length,bytes:new TextEncoder().encode(js).length},scope:'Fresh independent Python literal/refusal fixtures and Gregorian400-year digest; all six original S19 functions replay through public root API in Bun/Chromium. Finite reference-value evidence, not authored-property/compiler/native/authorization or general interpreter proof.'});if(!passed)process.exitCode=1;
}finally{await browser?.close();server.stop(true);}
