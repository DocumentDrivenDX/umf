// @covers US-079-AC15
// @covers US-079-AC10
// @covers US-079-AC16
/** Fresh original S24-S25: independent source purposes, write and stored data. */
import {createHash} from 'node:crypto';
import {writeSync} from 'node:fs';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname,extname} from 'node:path';
import {chromium} from 'playwright';
import {runOracle} from './write-oracle';
const id=Bun.argv[2],runId=Bun.env.UMF_SECURITY_RUN_ID;
if(!id||!['S24','S25'].includes(id)||Bun.env.UMF_SECURITY_CASE_ID!==id||!runId)throw Error('Fresh governed S24-S25 case/run required');
const plan=await Bun.file('docs/helix/03-test/security/cases.json').json(),c=plan.cases.find((row:any)=>row.id===id);
if(!c||c.backend!=='semantic'||c.oracleSource!=='tests/security/protection/write-oracle.py'||JSON.stringify(c.command)!==JSON.stringify(['bun','tests/security/protection/write-acceptance.ts',id]))throw Error('Governed command differs');
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const files=[...new Set<string>([c.testSource,c.oracleSource,...c.implementationSources])];
// Fail before oracle/browser execution when the reviewed per-case inventory
// omits a conservative relative import or adds an unaccounted source.
const closure=new Set<string>();
async function visit(path:string):Promise<void>{
 const absolute=resolve(path),key=relative(process.cwd(),absolute);
 if(key==='..'||key.startsWith('../')||closure.size>=4096)throw Error('Source closure escaped or exceeded its bound');
 if(closure.has(key))return;closure.add(key);const source=await Bun.file(absolute).text();
 if(!['.ts','.js'].includes(extname(absolute)))return;
 for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const base=resolve(dirname(absolute),match[1]!);let found:string|undefined;
  for(const candidate of [base,base+'.ts',base+'.json',resolve(base,'index.ts')])if(await Bun.file(candidate).exists()){found=candidate;break;}
  if(!found)throw Error('Source closure import unresolved');await visit(found);
 }
}
await visit(import.meta.path);
// These existing governing schemas/contracts and executable dependency metadata
// supplement the relative TypeScript/JSON import graph explicitly.
for(const path of [c.oracleSource,'package.json','bun.lock','docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/contracts/CONTRACT-066-gregorian-date-operations.md','spec/extensions/security-protection/schema.json','spec/extensions/security-v0.2/schema.json'])await visit(path);
if(files.length!==closure.size||files.some(path=>!closure.has(path)))throw Error('Exact reviewed S24/S25 source closure required');

const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
async function writeReceipt(value:unknown){const bytes=Buffer.from(JSON.stringify(value)+'\n');if(bytes.length>900_000)throw Error('Receipt output bound');let offset=0;const deadline=Date.now()+5000;while(offset<bytes.length){try{offset+=writeSync(1,bytes,offset,Math.min(4096,bytes.length-offset));}catch(error){if((error as NodeJS.ErrnoException).code!=='EAGAIN'||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,1));}}}
const before=await pins(),work=await mkdtemp(join(tmpdir(),'umf-write-python-'));
let python:any;
try{
 await cp(c.oracleSource,join(work,'oracle.py'));
 const child=Bun.spawn(['python3',join(work,'oracle.py')],{cwd:work,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 if(exit!==0||stderr)throw Error('Fresh Python oracle failed: '+stderr);
 const actual=new Uint8Array(await Bun.file(join(work,'fixtures.json')).arrayBuffer()),expected=new Uint8Array(await Bun.file('tests/security/protection/write-fixtures.json').arrayBuffer());
 if(actual.length>4_000_000||Buffer.compare(Buffer.from(actual),Buffer.from(expected))!==0)throw Error('Fresh independent fixture bytes differ');
 const version=Bun.spawn(['python3','-c','import platform; print(platform.python_version())'],{stdout:'pipe',stderr:'pipe'});
 const versionText=await new Response(version.stdout).text();if(await version.exited!==0)throw Error('Python version check failed');
 python={...JSON.parse(stdout),python:versionText.trim(),fixtureSha256:hash(actual),fixtureBytes:actual.length,exactFixtureBytes:true};
}finally{await rm(work,{recursive:true,force:true});}
const count=({S24:144,S25:58} as Record<string,number>)[id]!;
const bunRows=runOracle(id as 'S24'|'S25'),bun={rows:bunRows};if(bun.rows.length!==count||bun.rows.some(row=>!row.passed))throw Error('Independent Bun outcomes failed');
const build=await Bun.build({entrypoints:['tests/security/protection/write-oracle.ts'],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Private write oracle browser build failed');
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
 await writeReceipt({status:passed?'passed':'failed',id,runId,backend:'semantic',command:c.command,covers:c.covers,versions:{bun:Bun.version,chromium:browser.version(),python:python.python},sourceDigests:after,observations,independentPython:python,bundle:{sha256:hash(js),utf16Units:js.length,bytes:new TextEncoder().encode(js).length},scope:'Fresh Python-authored complete S24/S25 logical changed-Field admission expectations through the actual private catalog-aware multi-target write guard in Bun/Chromium. Covers original-or-explicit-blind plus mandatory ordinary and exact declared vault grants in required states, flat/graph complete comparisons and refusal. Results remain incomplete/non-authoritative. No native statement/effect closure, source authentication, vault execution, TS/SQL refinement or current-authority proof.'});if(!passed)process.exitCode=1;
}finally{await browser?.close();server.stop(true);}
