/** Typed physical SQL browser correspondence, not graph installation evidence. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {lowerSecuritySourceCompleteness} from '/Users/erik/Projects/truss/packages/postgresql/src/security-source-completeness';
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-source-completeness.ts';
const paths=[source,'tools/security/truss-source-completeness-browser.ts'];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
const pins=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const ref={documentId:'domain',moduleId:'m',elementId:'id'};
const packets=['text','int4','int8'].map(carrier=>({root:{type:{documentId:'domain',moduleId:'m',elementId:'Resource'},keyId:'key',keyFields:[{ref,column:'id'}],fields:[{ref,column:'id'}],home:{schema:'physical_witness',table:'root'},discriminator:{column:'kind',carrier,value:carrier==='text'?"Resource'\\":carrier==='int4'?'3':'9007199254740993'}},carrier:{schema:'physical_witness',table:'carrier',fields:[{ref,column:'id'}],discriminator:{column:'kind',carrier,value:carrier==='text'?"Resource'\\":carrier==='int4'?'3':'9007199254740993'}}}));
const expected=packets.map(p=>lowerSecuritySourceCompleteness(p as any));
const variants=Array.from({length:8},()=>structuredClone(packets[2]!));
delete (variants[0]!.carrier as any).discriminator;
variants[1]!.root.discriminator.value='9223372036854775808';
variants[2]!.carrier.discriminator.value='09';
variants[3]!.root.keyFields[0]!.ref.elementId='';
variants[4]!.carrier.fields.push(structuredClone(variants[4]!.carrier.fields[0]!));
variants[5]!.carrier.fields.push({ref:{...ref,elementId:'other'},column:'id'});
variants[6]!.root.home.schema='invalid\0schema';
variants[7]!.carrier.discriminator.carrier='unknown';
const invalidPackets:any[]=[...variants,null,{}, {root:{},carrier:{}},{root:{keyFields:[]},carrier:{fields:[]}}];
for(const malformed of [null,false,0,''])for(const side of ['both','root','carrier']){const p:any=structuredClone(packets[2]);delete p.root.discriminator;delete p.carrier.discriminator;if(side!=='carrier')p.root.discriminator=malformed;if(side!=='root')p.carrier.discriminator=malformed;invalidPackets.push(p);}
const hostRefusals=invalidPackets.map(p=>{try{lowerSecuritySourceCompleteness(p as any);return false;}catch(e){return e instanceof Error&&e.message==='TRUSS_SECURITY_SOURCE_COMPLETENESS_UNSUPPORTED';}});
if(hostRefusals.some(v=>!v))throw Error('Host failed typed refusal');
const build=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!build.success)throw Error('Browser build failed');const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/consumer.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Typed completeness</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async({packets,variants})=>{const url='/consumer.js',m=await import(url);return {sql:packets.map(p=>m.lowerSecuritySourceCompleteness(p)),refusals:variants.map(p=>{try{m.lowerSecuritySourceCompleteness(p);return false;}catch(e){return e instanceof Error&&e.message==='TRUSS_SECURITY_SOURCE_COMPLETENESS_UNSUPPORTED';}}),hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};},{packets,variants:invalidPackets});
 if(JSON.stringify(observed.sql)!==JSON.stringify(expected)||observed.refusals.some(v=>!v)||observed.hostGlobals.length||external)throw Error('Typed browser correspondence differs');
 for(const [p,h] of Object.entries(pins))if(await digest(p)!==h)throw Error('Source changed');
 const receipt={status:'passed',sourceDigests:pins,browser:browser.version(),programs:packets.map((input,i)=>({input,sql:observed.sql[i]})),refusals:observed.refusals,externalRequests:external,hostGlobals:observed.hostGlobals,scope:'Actual portable typed physical completeness builder in Chromium versus host for text escaping, int4 and exact int8 selectors; twenty-four malformed binding refusals. No SQL execution in browser, compiler binding/issuer authentication, actual graph mapping or backend acceptance.'};
 await Bun.write('docs/helix/04-build/evidence/security/truss-source-completeness-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'passed',programs:packets.length,refusals:invalidPackets.length,browser:receipt.browser}));
}finally{await browser?.close();server.stop(true);}
