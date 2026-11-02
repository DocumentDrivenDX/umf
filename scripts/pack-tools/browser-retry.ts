// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {resolve,sep} from 'node:path';
const root=resolve('docs/helix/05-deploy/microsite/dist');
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){const path=resolve(root,'.'+new URL(request.url).pathname);if(!path.startsWith(root+sep))return new Response(null,{status:404});const file=Bun.file(path);return await file.exists()?new Response(file):new Response(null,{status:404});}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/assets/pack-tools/umf_core_wasm.js',route=>route.abort());await page.goto(`http://127.0.0.1:${server.port}/pack-tools.html`);await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#generate-pack-tools')?.disabled);
 await page.getByRole('button',{name:'Generate pack tools',exact:true}).click();await page.getByRole('heading',{name:'No output generated',exact:true}).waitFor();
 await page.unroute('**/assets/pack-tools/umf_core_wasm.js');await page.getByRole('button',{name:'Generate pack tools',exact:true}).click();await page.waitForSelector('.result-badge',{timeout:30000});
 if(!(await page.locator('#output-panel pre').textContent())?.includes('CREATE TABLE')||errors.length)throw Error('Fresh-worker retry failed: '+errors.join('; '));
 console.log(JSON.stringify({profile:'umf.pack-tools.browser-retry/1',browser:browser.version(),failedImportVisible:true,retryWithFreshWorker:true,pageErrors:errors}));
}finally{await browser?.close();server.stop(true);}
