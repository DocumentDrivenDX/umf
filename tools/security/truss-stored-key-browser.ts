import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const evidence='docs/helix/04-build/evidence/security/truss-key-transport.json';
const native=await Bun.file(evidence).json(),report=native.transportReport;
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-stored-key.ts';
const graphSource='/Users/erik/Projects/truss/packages/postgresql/src/security-graph-locator.ts';
const ownerPath=report.producer.directory+'/producer.js';
const paths=[evidence,source,graphSource, '/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts', '/Users/erik/Projects/truss/packages/postgresql/src/security-key-transport.ts',ownerPath,'tools/security/truss-stored-key-browser.ts'];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,hash] of Object.entries(native.sourceDigests))if(await digest(p)!==hash)throw Error('Stale original transport source');
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Transport browser build failed');
const transportJs=await built.outputs[0]!.text(),ownerJs=await Bun.file(ownerPath).text();
const graphBuild=await Bun.build({entrypoints:[graphSource],target:'browser',format:'esm'});if(!graphBuild.success)throw Error('Graph lookup browser build failed');const graphJs=await graphBuild.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;return path==='/transport.js'||path==='/owner.js'||path==='/graph.js'?new Response(path==='/transport.js'?transportJs:path==='/graph.js'?graphJs:ownerJs,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Truss original key transport</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async ({report,stored})=>{
  const ownerUrl='/owner.js',transportUrl='/transport.js',owner=await import(ownerUrl),module=await import(transportUrl);
  const vector=JSON.parse(new TextDecoder().decode(Uint8Array.from(report.expected.namespaceHex.match(/../g), (h: string)=>parseInt(h,16))));
  const namespace={profile:vector[0],sourceEpoch:vector[1],installationId:vector[2],typeId:vector[3],keyNumber:vector[4],encoding:{identity:vector[5],version:vector[6],sha256:vector[7]}};
  const producer={...owner,bundleSha256:vector[7]};
  const canonical=(values:readonly string[])=>{if(JSON.stringify(values)!==JSON.stringify(vector))throw Error('Unobserved canonical vector');return report.expected.namespaceHex;};
  const verifier=await module.createSecurityStoredKeyVerifier(producer,{source:report.model,identity:report.identity,namespace,namespaceHex:report.expected.namespaceHex},canonical);
  const repairedStored={...stored[0],keyHex:'00'},repair=verifier.matches(report.values,repairedStored);
  repairedStored.keyHex=stored[0].keyHex;
  const pendingInvalidStoredRefused=!await repair;
  const changedStored={...stored[0]},change=verifier.matches(report.values,changedStored);changedStored.keyHex='00';
  const pendingOriginalStoredCaptured=await change;
  const repairedValues=structuredClone(report.values);repairedValues[1].string='foreign';
  const changedValues=verifier.matches(repairedValues,stored[0]);repairedValues[1].string=report.values[1].string;
  const pendingInvalidValuesRefused=!await changedValues;
  const graphUrl='/graph.js',graph=await import(graphUrl),encoded=verifier.encode(report.values);
  // Constructed typed locator rows isolate composition from installed owner
  // authentication. Only stored namespace/key bytes are retained native outputs.
  const graphInput={objects:[{id:'9007199254740993',typeId:vector[3]},{id:'9007199254740994',typeId:vector[3]}],buckets:stored.map((bytes:any,i:number)=>({storageRowId:String(i+1),typeId:vector[3],keyNumber:vector[4],objectId:i===0?'9007199254740993':'9007199254740994',...bytes})),expected:{typeId:vector[3],keyNumber:vector[4],...encoded}};
  const graphTypedOwner=graph.resolveSecurityGraphKeyLocator(graphInput);
  const missing=structuredClone(graphInput);missing.buckets[0].keyHex='00';let graphChangedBytesRefused=false;try{graph.resolveSecurityGraphKeyLocator(missing);}catch(e){graphChangedBytesRefused=e instanceof Error&&e.message==='TRUSS_SECURITY_GRAPH_LOCATOR_UNSUPPORTED';}
  return {graphTypedOwner,graphChangedBytesRefused,pendingInvalidStoredRefused,pendingOriginalStoredCaptured,pendingInvalidValuesRefused,encoded,nativeOriginal:await verifier.matches(report.values,stored[0]),foreignNamespaceRefused:!await verifier.matches(report.values,stored[1]),changedPayloadRefused:!await verifier.matches(report.values,{...stored[0],keyHex:stored[0].keyHex.slice(0,-2)+'00'}),hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};
 },{report,stored:native.nativeStored});
 const expectedType=JSON.parse(Buffer.from(report.expected.namespaceHex,'hex').toString('utf8'))[3];
 if(JSON.stringify(observed.graphTypedOwner)!==JSON.stringify({id:'9007199254740993',typeId:expectedType})||!observed.graphChangedBytesRefused||JSON.stringify(observed.encoded)!==JSON.stringify(report.expected)||!observed.nativeOriginal||!observed.foreignNamespaceRefused||!observed.changedPayloadRefused||!observed.pendingInvalidStoredRefused||!observed.pendingOriginalStoredCaptured||!observed.pendingInvalidValuesRefused||observed.hostGlobals.length||external)throw Error('Browser/native original transport mismatch');
 for(const p of paths)if(await digest(p)!==before[p])throw Error('Transport source changed during browser replay');
 await Bun.write('docs/helix/04-build/evidence/security/truss-stored-key-browser.json',JSON.stringify({status:'passed-retained-native-oracle-replay',freshNativeExecution:false,sourceDigests:before,browser:await browser.version(),observed,externalRequests:external,scope:'Retained native oracle replay only; no fresh database execution. Actual registered UMF owner v3 tuple and portable Truss exact transport in real Chromium, compared with native 0.15 bytea bucket roundtrip. Candidate typed graph lookup composes those original bytes with explicitly constructed locator/owner rows; these rows are not retained native owner observations. Exact decimal/Unicode/large-integer tokens retained; foreign namespace and changed payload refuse. Native installation/catalog namespace authority, complete graph/source/guard/role/custody profile remain unqualified.'},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:9,browser:await browser.version()}));
}finally{if(browser)await browser.close();server.stop(true);}
