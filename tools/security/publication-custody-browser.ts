import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {publicationCustodyCorpus} from '../../tests/security/publication-custody-corpus';
const files=['tools/security/publication-custody-browser.ts','tests/security/publication-custody-corpus.ts','tests/security/publication-custody.test.ts','src/extensions/security/publication-custody.ts','src/model/json.ts','src/model/types.ts'];
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const sourceDigests=Object.fromEntries(await Promise.all(files.map(async p=>[p,await hash(p)])));
const expected=await publicationCustodyCorpus();
const build=await Bun.build({entrypoints:['tests/security/publication-custody-corpus.ts'],target:'browser',format:'esm'});if(!build.success)throw Error('Custody browser build failed');
const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/custody.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Publication custody</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async()=>{const url='/custody.js';const m=await import(url);return {observations:await m.publicationCustodyCorpus(),hostGlobals:['Bun','process','require'].filter(key=>key in globalThis)};});
 if(JSON.stringify(expected)!==JSON.stringify(observed.observations)||external||observed.hostGlobals.length||expected.length!==31||new Set(expected.map(o=>o.id)).size!==31)throw Error('Custody browser corpus mismatch');
 for(const [path,digest]of Object.entries(sourceDigests))if(await hash(path)!==digest)throw Error('Custody source changed');
 const receipt={status:'passed',covers:['US-057-AC2','US-057-AC7'],versions:{bun:Bun.version,chromium:browser.version()},sourceDigests,observations:observed.observations,hostGlobals:observed.hostGlobals,externalRequests:external,scope:'Browser and Bun host custody component over owned JSON copies, opaque local handles and callback-defined consumer final release. Not native integration, all arbitrary host copies, issuer authentication, process recovery or backend acceptance.'};
 await Bun.write('docs/helix/04-build/evidence/security/publication-custody-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,observations:expected.length,chromium:browser.version()}));
}finally{await browser?.close();server.stop(true);}
