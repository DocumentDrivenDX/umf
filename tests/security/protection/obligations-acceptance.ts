// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC15
// @covers US-079-AC10
// @covers US-079-AC3
/** Fresh original S21-S23: independent source purposes, obligations and stored data. */
import {createHash} from 'node:crypto';
import {writeSync} from 'node:fs';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {runOracle} from './obligations-oracle';
const id=Bun.argv[2],runId=Bun.env.UMF_SECURITY_RUN_ID;
if(!id||!['S21','S22','S23'].includes(id)||Bun.env.UMF_SECURITY_CASE_ID!==id||!runId)throw Error('Fresh governed S21-S23 case/run required');
const plan=await Bun.file('docs/helix/03-test/security/cases.json').json(),c=plan.cases.find((row:any)=>row.id===id);
if(!c||c.backend!=='semantic'||c.oracleSource!=='tests/security/protection/obligations-oracle.py'||JSON.stringify(c.command)!==JSON.stringify(['bun','tests/security/protection/obligations-acceptance.ts',id]))throw Error('Governed command differs');
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const files=[...new Set<string>([c.testSource,c.oracleSource,...c.implementationSources])];
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
async function writeReceipt(value:unknown){const bytes=Buffer.from(JSON.stringify(value)+'\n');if(bytes.length>900_000)throw Error('Receipt output bound');let offset=0;const deadline=Date.now()+5000;while(offset<bytes.length){try{offset+=writeSync(1,bytes,offset,Math.min(4096,bytes.length-offset));}catch(error){if((error as NodeJS.ErrnoException).code!=='EAGAIN'||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,1));}}}
const before=await pins(),work=await mkdtemp(join(tmpdir(),'umf-obligations-python-'));
let python:any;
try{
 await cp(c.oracleSource,join(work,'oracle.py'));
 const child=Bun.spawn(['python3',join(work,'oracle.py')],{cwd:work,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 if(exit!==0||stderr)throw Error('Fresh Python oracle failed: '+stderr);
 const actual=new Uint8Array(await Bun.file(join(work,'fixtures.json')).arrayBuffer()),expected=new Uint8Array(await Bun.file('tests/security/protection/obligations-fixtures.json').arrayBuffer());
 if(actual.length>1_000_000||Buffer.compare(Buffer.from(actual),Buffer.from(expected))!==0)throw Error('Fresh independent fixture bytes differ');
 const version=Bun.spawn(['python3','-c','import platform; print(platform.python_version())'],{stdout:'pipe',stderr:'pipe'});
 const versionText=await new Response(version.stdout).text();if(await version.exited!==0)throw Error('Python version check failed');
 python={...JSON.parse(stdout),python:versionText.trim(),fixtureSha256:hash(actual),fixtureBytes:actual.length,exactFixtureBytes:true};
}finally{await rm(work,{recursive:true,force:true});}
const count=({S21:71,S22:89,S23:72} as Record<string,number>)[id]!;
const bunRows=runOracle(id as 'S21'|'S22'|'S23'),bun={rows:bunRows};if(bun.rows.length!==count||bun.rows.some(row=>!row.passed))throw Error('Independent Bun outcomes failed');
const build=await Bun.build({entrypoints:['tests/security/protection/obligations-oracle.ts'],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Public root browser oracle build failed');
const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('Browser bundle bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/oracle.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Protection declaration oracle</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===`http://127.0.0.1:${server.port}`?r.continue():(externalRequests++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(caseId)=>{const path='/oracle.js',api=await import(path);return {result:{rows:api.runOracle(caseId)},hostGlobalsAbsent:['Bun','process','Buffer','Deno'].every(k=>!(k in globalThis))};},id);
 const after=await pins();
 const observations=[...bun.rows.map(row=>({assertionId:id+':bun:'+row.id,expected:true,observed:row.passed})),...observed.result.rows.map((row:any)=>({assertionId:id+':chromium:'+row.id,expected:true,observed:row.passed})),{assertionId:id+':parity',expected:bun.rows,observed:observed.result.rows},{assertionId:id+':source-custody',expected:before,observed:after},{assertionId:id+':python-fixtures',expected:true,observed:python.exactFixtureBytes},{assertionId:id+':browser-row-count',expected:count,observed:observed.result.rows.length},{assertionId:id+':host-globals',expected:true,observed:observed.hostGlobalsAbsent},{assertionId:id+':external-requests',expected:0,observed:externalRequests},{assertionId:id+':page-errors',expected:[],observed:errors}];
 const passed=observations.every(row=>JSON.stringify(row.expected)===JSON.stringify(row.observed));observations.push({assertionId:id,expected:true,observed:passed});
 await writeReceipt({status:passed?'passed':'failed',id,runId,backend:'semantic',command:c.command,covers:c.covers,versions:{bun:Bun.version,chromium:browser.version(),python:python.python},sourceDigests:after,observations,independentPython:python,bundle:{sha256:hash(js),utf16Units:js.length,bytes:new TextEncoder().encode(js).length},scope:'Fresh independent Python declared-purpose/custody/propagation/warning and atomic refusal expectations through public root APIs in Bun/Chromium, including original stored token/ciphertext and JSON/YAML round trips. Finite source/data correspondence only; no operation-owner compatibility or route completeness, transform execution, permission, native/custody/authentication or general interpreter proof.'});if(!passed)process.exitCode=1;
}finally{await browser?.close();server.stop(true);}
