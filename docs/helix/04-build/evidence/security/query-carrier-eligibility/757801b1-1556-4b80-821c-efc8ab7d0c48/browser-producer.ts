import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const folder=Bun.argv[2];if(!folder)throw Error('Native evidence directory required');
const receiptPath=folder+'/receipt.json',native=await Bun.file(receiptPath).json();
const source='/private/tmp/truss-security-main-integration/packages/postgresql/src/security-query-use.ts';
const paths=[import.meta.path,receiptPath,...Object.keys(native.sourceDigests)];
const digest=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const pins=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await digest(path)])));
for(const [path,hash] of Object.entries(native.sourceDigests))if(pins[path]!==hash)throw Error('Native evidence source changed');
const build=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!build.success)throw Error('Browser build failed');
const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/consumer.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Native query domain guard</title>');}});
let browser;
try {
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let external=0;const origin=`http://127.0.0.1:${server.port}`;
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external++;return route.abort();}return route.continue();});
 await page.goto(origin);
 const observed=await page.evaluate(async artifacts=>{
 const results=[];
 for(const artifact of artifacts){
  const url='/consumer.js',module=await import(url),b=JSON.parse(artifact.request.bindingJson);
  const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const expectedHandoffSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(artifact.handoff))))),v=>v.toString(16).padStart(2,'0')).join('');
  const program=await module.lowerSecurityOriginalUseProgram({handoff:artifact.handoff,expectedHandoffSha256,bindingJson:artifact.request.bindingJson,ontologyJson:artifact.request.ontologyJson,queryProfileJson:artifact.request.queryProfileJson,expectedProfileSha256:artifact.handoff.profile.sha256,target:b.target,subject:b.subject,types:b.types,home:b.home});
  const checks=module.lowerOriginalUsePreExecutionChecks(program),checkedReturn=module.lowerOriginalUseTextRowsReturn(program);
  let forgedChecks=false,forgedReturn=false;
  try{module.lowerOriginalUsePreExecutionChecks({...program,carrierReady:'TRUE'});}catch{forgedChecks=true;}
  try{module.lowerOriginalUseTextRowsReturn({...program,carrierReady:'TRUE'});}catch{forgedReturn=true;}
  results.push({program:{...program,checks,checkedReturn},forgedChecks,forgedReturn});
 } return results;
 },[native.originalArtifact,native.emptyArtifact]);
 if(observed.length!==2||observed.some((row:any,i:number)=>JSON.stringify(row.program)!==JSON.stringify([native.program,native.emptyProgram][i])||!row.forgedChecks||!row.forgedReturn)||external)throw Error('Browser/native lowering correspondence or custody failed');
 for(const [path,hash] of Object.entries(pins))if(await digest(path)!==hash)throw Error('Browser input changed');
 await Bun.write(folder+'/browser.json',JSON.stringify({status:'passed',sourceDigests:pins,bun:Bun.version,chromium:browser.version(),externalRequests:external,programMatchesNative:true,programCount:2,forgedChecksRefused:true,forgedReturnRefused:true,scope:'Actual Chromium populated/empty lowerer and issued-fragment correspondence with native owner artifacts; no database execution occurs in the browser, no full source or backend admission.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',chromium:browser.version(),programMatchesNative:true,forgedChecksRefused:true,forgedReturnRefused:true}));
} finally {await browser?.close();server.stop(true);}
