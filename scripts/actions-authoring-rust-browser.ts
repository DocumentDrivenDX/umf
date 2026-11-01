// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';

declare global { interface Window {umfResult?:{valid:boolean;compatible:boolean;refusal:string;nodeGlobals:boolean}} }

assert(process.argv[2], 'Pass the built SDK dist directory');
const sdk=resolve(process.argv[2]);
await Promise.all(['umf-browser.js','umf_core_wasm_bg.wasm'].map(file=>readFile(resolve(sdk,file))));
const fixture=JSON.parse(await readFile(new URL('../docs/helix/03-test/fixtures/bulk-update/model.json',import.meta.url),'utf8'));
const entry=`
import * as api from '/sdk/umf-browser.js';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const source=${JSON.stringify(fixture)};
const registry=api.createUmfRegistry();
const inspected=api.inspectActions(source,registry);
check(inspected.validation.valid&&inspected.actions.length===1,'Rust inspection');
const item=inspected.actions[0],identity={module:item.module,action:item.action.id};
const profile={id:'browser-executor',version:'1',actionVersion:'0.1.0',coreVersion:'0.10.0',source,identity,claims:item.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['fixture://declaration-only']}))};
const assessment=api.assessAction(source,identity,profile,registry);
check(assessment.declaredCompatible&&!assessment.executionVerified,'Rust assessment');
const empty=structuredClone(source);delete empty.modules[0].extensions;delete empty.vocabularies['umf.actions'];
const declared=api.declareAction(empty,'sales',item.action,registry);
check(api.inspectActions(declared,registry).actions.length===1,'Rust declaration');
const edited=api.editAction(declared,identity,{...item.action,description:'Reviewed action'},registry);
check(api.inspectActions(edited,registry).actions[0].action.description==='Reviewed action','Rust edit');
let refusal='';try{api.declareAction(source,'sales',item.action,registry);}catch(error){refusal=error.code;}
check(refusal==='ACTION_IDENTITY','Rust duplicate refusal');
window.umfResult={valid:inspected.validation.valid,compatible:assessment.declaredCompatible,refusal,nodeGlobals:typeof process!=='undefined'||typeof Buffer!=='undefined'};
`;
const server=createServer(async(request,response)=>{
 const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
 if(pathname==='/'){response.setHeader('content-type','text/html');return response.end('<!doctype html><script type="module" src="/entry.js"></script>');}
 if(pathname==='/entry.js'){response.setHeader('content-type','text/javascript');return response.end(entry);}
 if(pathname.startsWith('/sdk/')){const file=resolve(sdk,decodeURIComponent(pathname.slice('/sdk/'.length)));if(file.startsWith(sdk+sep)){try{const body=await readFile(file);response.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':'text/javascript');return response.end(body);}catch{}}}
 response.writeHead(404);response.end('not found');
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',()=>done()));
let browser;
try{
 const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();const errors:string[]=[];const external:string[]=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${address.port}/`);
 await page.waitForFunction(()=>window.umfResult,undefined,{timeout:30000});
 const result=await page.evaluate(()=>window.umfResult);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 assert.deepEqual(result,{valid:true,compatible:true,refusal:'ACTION_IDENTITY',nodeGlobals:false});
 console.log(JSON.stringify({browser:browser.version(),...result,passed:true}));
}finally{await browser?.close();await new Promise<void>(done=>server.close(()=>done()));}
