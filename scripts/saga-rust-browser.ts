// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the distributed browser entry point against the Rust-owned saga operations.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
type SagaBrowserResult={declared:boolean;inspected:number;edited:boolean;executionVerified:boolean;refusal:string;nodeGlobals:boolean};
declare global { interface Window { umfSagaResult?: SagaBrowserResult } }
assert(process.argv[2],'Pass the built SDK dist directory');
const sdk=resolve(process.argv[2]);
await Promise.all(['umf-browser.js','umf_core_wasm_bg.wasm'].map(file=>readFile(resolve(sdk,file))));
const fixture=JSON.parse(await readFile(new URL('../docs/helix/03-test/fixtures/saga/supported-action.json',import.meta.url),'utf8'));
const entry=`
import * as api from '/sdk/umf-browser.js';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const source=structuredClone(${JSON.stringify(fixture)});
const definition=structuredClone(source.modules[0].extensions['umf.actions.saga'].sagas[0]);definition.id='set-active-saga-copy';
const declared=api.declareSaga(source,'sales',definition),inspected=api.inspectSagas(declared);
check(inspected.entries.some(entry=>entry.definition.id===definition.id),'declaration missing from inspection');
const identity={module:'sales',saga:definition.id},replacement={...inspected.entries.find(entry=>entry.definition.id===definition.id).definition,description:'Reviewed supported Action declaration'};
const edited=api.editSaga(declared,identity,replacement),after=api.inspectSagas(edited);
check(after.entries.find(entry=>entry.definition.id===definition.id).definition.description===replacement.description,'edit was not retained');
const assessment=api.assessSaga(edited,identity,{id:'browser-fixture',version:'1',coreVersion:'0.10.0',sagaVersion:'0.1.0',coordination:'unknown',claims:[],source:edited,identity});
let refusal='';try{api.declareSaga(source,'sales',{});}catch(error){refusal=error.code||error.message;}
window.umfSagaResult={declared:true,inspected:inspected.entries.length,edited:true,executionVerified:assessment.executionVerified,refusal,nodeGlobals:typeof process!=='undefined'||typeof Buffer!=='undefined'};
`;
const server=createServer(async(request,response)=>{const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;if(pathname==='/'){response.setHeader('content-type','text/html');return response.end('<!doctype html><script type="module" src="/entry.js"></script>');}if(pathname==='/entry.js'){response.setHeader('content-type','text/javascript');return response.end(entry);}if(pathname.startsWith('/sdk/')){const file=resolve(sdk,decodeURIComponent(pathname.slice('/sdk/'.length)));if(file.startsWith(sdk+sep)){try{const body=await readFile(file);response.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':'text/javascript');return response.end(body);}catch{}}}response.writeHead(404);response.end('not found');});
await new Promise<void>(done=>server.listen({port:0,host:'127.0.0.1'},done));let browser;
try{const address=server.address();assert(address&&typeof address!=='string');browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const errors:string[]=[],external:string[]=[];page.on('pageerror',error=>errors.push(String(error)));await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${address.port}/`);await Promise.race([page.waitForFunction(()=>window.umfSagaResult,undefined,{timeout:30000}),new Promise<never>((_,reject)=>page.once('pageerror',reject))]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);const result=await page.evaluate(()=>window.umfSagaResult!);assert.deepEqual(result,{declared:true,inspected:2,edited:true,executionVerified:false,refusal:'SAGA_STRUCTURE',nodeGlobals:false});console.log(JSON.stringify({browser:browser.version(),...result,passed:true}));}finally{await browser?.close();await new Promise<void>(done=>server.close(()=>done()));}
