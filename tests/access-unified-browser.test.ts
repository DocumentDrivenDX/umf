// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {chromium} from 'playwright';
import {generatePythonClient} from '../src/access';

// @covers US-091-AC9 US-092-AC8
 test('current UMF client generation has exact Chromium parity without host globals',async()=>{
 const source=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
 const expected=generatePythonClient({text:source,package:'shop'}).files;
 const built=await Bun.build({entrypoints:[new URL('../src/access/index.ts',import.meta.url).pathname],target:'browser',format:'esm'});
 expect(built.success).toBe(true);
 const script=await built.outputs[0]!.text();
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:request=>new URL(request.url).pathname==='/generator.js'?new Response(script,{headers:{'content-type':'application/javascript'}}):new Response('<!doctype html><title>UMF generation</title>')});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const unexpected:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith(server.url.origin))unexpected.push(request.url());});
  await page.goto(server.url.href);
  const result=await page.evaluate(async({source})=>{
   const moduleUrl='/generator.js';
   const api=await import(moduleUrl);
   const generated=api.generatePythonClient({text:source,package:'shop'});
   return {files:generated.files,hostGlobals:['process','Bun','Buffer','require'].filter(name=>name in globalThis)};
  },{source});
  expect(result.hostGlobals).toEqual([]);expect(unexpected).toEqual([]);expect(result.files).toEqual(expected);
 }finally{await browser.close();server.stop(true);}
 },30000);
