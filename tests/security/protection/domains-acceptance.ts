// @covers US-079-AC11
// @covers US-079-AC12
// @covers US-079-AC10
// @covers US-079-AC3
// @covers US-079-AC9
/** Fresh S13/S14 replay; finite oracle is independently authored. */
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {runOracle} from './domains-oracle';
const id=Bun.argv[2],runId=Bun.env.UMF_SECURITY_RUN_ID;
if((id!=='S13'&&id!=='S14')||Bun.env.UMF_SECURITY_CASE_ID!==id||!runId)throw Error('Fresh case/run binding required');
const plan=await Bun.file('docs/helix/03-test/security/cases.json').json(),c=plan.cases.find((row:any)=>row.id===id);
if(!c||c.backend!=='semantic'||JSON.stringify(c.command)!==JSON.stringify(['bun','tests/security/protection/domains-acceptance.ts',id]))throw Error('Governed command differs');
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const files=[...new Set<string>([c.testSource,c.oracleSource,...c.implementationSources])];
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
const before=await pins(),bunRows=runOracle(id);
if(!bunRows.length||bunRows.some(row=>!row.passed))throw Error('Independent Bun expectations failed: '+JSON.stringify(bunRows.filter(row=>!row.passed)));
const build=await Bun.build({entrypoints:[c.oracleSource],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Public root browser oracle build failed');
const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('Bundle UTF16 bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/oracle.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Protection domain oracle</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===`http://127.0.0.1:${server.port}`?r.continue():(externalRequests++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(caseId)=>{const path='/oracle.js',api=await import(path);return {rows:api.runOracle(caseId),hostGlobalsAbsent:['Bun','process','Buffer','Deno'].every(key=>!(key in globalThis))};},id);
 const after=await pins();
 const observations=[...bunRows.map(row=>({assertionId:id+':bun:'+row.id,expected:true,observed:row.passed})),...observed.rows.map((row:any)=>({assertionId:id+':chromium:'+row.id,expected:true,observed:row.passed})),{assertionId:id+':parity',expected:bunRows,observed:observed.rows},{assertionId:id+':source-custody',expected:before,observed:after},{assertionId:id+':host-globals',expected:true,observed:observed.hostGlobalsAbsent},{assertionId:id+':external-requests',expected:0,observed:externalRequests},{assertionId:id+':page-errors',expected:[],observed:pageErrors}];
 const passed=observations.every(row=>JSON.stringify(row.expected)===JSON.stringify(row.observed));observations.push({assertionId:id,expected:true,observed:passed});
 console.log(JSON.stringify({status:passed?'passed':'failed',id,runId,backend:'semantic',command:c.command,covers:c.covers,versions:{bun:Bun.version,chromium:browser.version()},sourceDigests:after,observations,bundle:{sha256:hash(js),utf16Units:js.length,bytes:new TextEncoder().encode(js).length},scope:'Independent finite core-definition and unknown-source oracles via actual public root API in Bun/Chromium. Revision-label comparisons, not source authentication. No domain equivalence, literal/function/native/ontology admission or executable refinement theorem.'}));if(!passed)process.exitCode=1;
}finally{await browser?.close();server.stop(true);}
