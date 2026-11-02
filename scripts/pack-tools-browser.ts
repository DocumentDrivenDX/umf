// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {resolve,sep} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {packEntries,packToolsRequest,slug} from '../docs/helix/05-deploy/microsite/pack-tools-model';
const root=resolve('docs/helix/05-deploy/microsite/dist');
const evidence=resolve(process.env.UMF_PACK_TOOLS_EVIDENCE??'/private/tmp/umf-pack-tools-browser');
await mkdir(evidence,{recursive:true});
const catalog=await Bun.file(resolve(root,'schema-catalog.json')).json();
const requests=packEntries(catalog.entries).map(pack=>packToolsRequest(pack,catalog.entries,{schema:'public',package:slug(pack.pack!),targets:['ddl','orm','crud']}));
let external=0;const errors:string[]=[];
const csp="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; frame-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'";
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const url=new URL(req.url);if(url.pathname==='/test-requests.json')return Response.json(requests);const file=resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+sep))return new Response(null,{status:404});const data=Bun.file(file===root?resolve(root,'index.html'):file);return await data.exists()?new Response(data,{headers:{'Content-Security-Policy':csp}}):new Response(null,{status:404});}});
const origin=`http://127.0.0.1:${server.port}`;let browser;
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage({acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(!r.request().url().startsWith(origin)){external++;return r.abort();}return r.continue();});
 await page.goto(`${origin}/pack-tools.html?pack=pack:commerce@1.0.0`);check((await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'))?.includes("worker-src 'self'"),'Published page must declare its worker CSP');await page.waitForFunction(()=>document.querySelector('#generation-status')?.textContent?.includes('28 domain packs'));
 await page.getByRole('button',{name:'Generate pack tools',exact:true}).click();await page.waitForSelector('#generation-results:not([hidden]) .result-badge',{timeout:60000});
 check((await page.locator('#output-panel pre').textContent())?.includes('CREATE TABLE'),'DDL preview missing');
 await page.getByRole('tab',{name:'SQLAlchemy models',exact:true}).click();check((await page.locator('#output-panel pre').textContent())?.includes('DeclarativeBase'),'ORM preview missing');
 await page.getByRole('tab',{name:'Python CRUD',exact:true}).click();check((await page.locator('#output-panel pre').textContent())?.includes('session.flush()'),'CRUD preview missing');
 const preview=await page.locator('#output-panel pre').textContent();const singleWait=page.waitForEvent('download');await page.locator('#output-panel').getByRole('button',{name:'Download',exact:true}).click();const single=await singleWait;await single.saveAs(resolve(evidence,'single.py'));check(await Bun.file(resolve(evidence,'single.py')).text()===preview,'Downloaded single file differs from its preview');
 const downloadHashes=await page.locator('.artifact-row').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.querySelector('strong')!.textContent!,row.querySelector('small')!.textContent!.match(/SHA-256 ([a-f0-9]{64})/)![1]])));await Bun.write(resolve(evidence,'download-hashes.json'),JSON.stringify(downloadHashes));const zipWait=page.waitForEvent('download');await page.getByRole('button',{name:/Download all .*files/}).click();const archive=await zipWait;await archive.saveAs(resolve(evidence,'commerce.zip'));const zipCheck=Bun.spawnSync(['python3','scripts/pack-tools/validate_downloads.py',evidence]);check(zipCheck.exitCode===0,zipCheck.stderr.toString()||'Downloaded ZIP verification failed');console.log(zipCheck.stdout.toString().trim());
 await page.locator('#pg-schema').fill('changed_schema');check(await page.locator('#generation-results').isHidden(),'Editing options must invalidate results');
 await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#generate-pack-tools')!.click();document.querySelector<HTMLButtonElement>('#cancel-generation')!.click();});check((await page.locator('#generation-status').textContent())?.includes('cancelled'),'Cancel did not settle status');
 // One browser/WASM pass over the complete catalog, using the same requests as native validation.
 const all=await page.evaluate(async()=>{
  const requests=await (await fetch('/test-requests.json')).json();const worker=new Worker('/assets/pack-tools-worker.js',{type:'module'});const results=[];let id=0;
  try{for(const request of requests){const current=++id;const result=await new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('WASM pack timed out')),30000);worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};worker.onmessage=e=>{if(e.data.id!==current)return;clearTimeout(timeout);e.data.ok?resolve(e.data.result):reject(Error(JSON.stringify(e.data.error)));};worker.postMessage({protocol:'umf.pack-tools-worker/1',id:current,wasmUrl:location.origin+'/assets/pack-tools/umf_core_wasm.js',request});});results.push(result);}}finally{worker.terminate();}return results;
 });
 check(all.length===28,'Not every pack was generated');for(const result of all){const request=requests.find(r=>r.pack.id===result.pack.id)!;if(request.sources.some(s=>s.schemaFormat==='tablespec')){for(const kind of ['ddl','orm','crud'])check(result.files.some((f:any)=>f.kind===kind),`${kind} absent: ${result.pack.id}`);}else{check(result.status==='blocked',`Loader-only pack should be blocked: ${result.pack.id}`);check(result.files.some((f:any)=>f.kind==='source'),'Blocked source companion missing');}}
 await Bun.write(resolve(evidence,'wasm-results.ndjson'),all.map(x=>JSON.stringify(x)).join('\n')+'\n');
 await page.setViewportSize({width:390,height:844});await page.locator('#pack-search').fill('medical');await page.getByRole('option').filter({hasText:/^medical ·/}).click();await page.getByRole('button',{name:'Generate pack tools',exact:true}).click();await page.waitForSelector('.result-badge',{timeout:30000});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile layout overflows');await page.screenshot({path:resolve(evidence,'mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:resolve(evidence,'desktop.png'),fullPage:true});
 // Real blocked-WASM failure must be visible; it must leave inspection available.
 const failure=await browser.newPage();failure.on('pageerror',e=>errors.push(e.message));await failure.route('**/assets/pack-tools/umf_core_wasm.js',r=>r.abort());await failure.goto(origin+'/pack-tools.html');await failure.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#generate-pack-tools')?.disabled);await failure.getByRole('button',{name:'Generate pack tools',exact:true}).click();await failure.getByRole('heading',{name:'No output generated',exact:true}).waitFor({timeout:30000});await failure.goto(origin+'/reference/core.html#view=catalog');await failure.locator('#load-status').filter({hasNotText:'Verifying'}).waitFor({timeout:30000});await failure.frameLocator('iframe.umf-schema-browser-frame').locator('#catalog').waitFor({timeout:30000});await failure.close();
 check(!external,'Generation attempted an external request');check(!errors.length,'Browser errors: '+errors.join('; '));
 const receipt={packs:all.length,files:all.reduce((n,x)=>n+x.files.length,0),browser:browser.version(),externalRequests:external,checks:['actual Rust/WASM all packs','DDL/ORM/CRUD previews','single-file download','ZIP download','option invalidation','cancel','mobile layout','runtime failure','inspector remains available'],scope:'Current browser generation; generated code execution is validated separately.'};await Bun.write(resolve(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(receipt);
}finally{await browser?.close();server.stop(true);}
