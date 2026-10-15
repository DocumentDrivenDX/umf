import {chromium} from 'playwright';
import {resolve,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dir,'dist');
const server=process.env.UMF_EXPLORER_URL?null:Bun.serve({hostname:'127.0.0.1',port:0,async fetch(r){let path:string;try{path=resolve(root,'.'+decodeURIComponent(new URL(r.url).pathname));}catch{return new Response('Invalid path',{status:400});}if(!path.startsWith(root+sep))return new Response('Not found',{status:404});const file=Bun.file(path);return await file.exists()?new Response(file):new Response('Not found',{status:404});}});
const origin=process.env.UMF_EXPLORER_URL??`http://127.0.0.1:${server!.port}`;
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();const errors:string[]=[],external:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(origin+'/')){external.push(r.url());return route.abort();}if(r.method()!=='GET'){writes.push(r.method()+' '+r.url());return route.abort();}return route.continue();});
 await page.goto(origin+'/action-compiler.html');
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Loading compiler…');
 if(await page.locator('#status').textContent()!=='Portable action plan compiled')throw Error(JSON.stringify({status:await page.locator('#status').textContent(),output:await page.locator('#plan').textContent(),errors,external,writes}));
 const samples=await page.locator('#samples').textContent();
 const plan=JSON.parse((await page.locator('#plan').textContent())!);
 if(plan.protocol!=='umf.actions.plan/1'||plan.inputs.assignments[0].value.string!=='Foo')throw Error('Wrong original portable plan');
 if(plan.model.revision!==plan.model.sha256)throw Error('Demo model revision differs from native accepted content revision');
 for(const sql of ["UPDATE products SET id = 'oops' WHERE id = 'bar'",'UPDATE products SET name = NULL WHERE id = \'bar\'',"UPDATE products SET name = 'Foo'"]){
  await page.locator('#sql').fill(sql);await page.locator('#compile').click();
  if(await page.locator('#status').textContent()!=='Statement refused')throw Error('Unsupported statement accepted');
 }
 await page.locator('#sql').fill("UPDATE products SET name = 'Unicode 😀' WHERE id = 'baz'");await page.locator('#compile').click();
 if(await page.locator('#status').textContent()!=='Portable action plan compiled')throw Error('Unicode failed');
 if(await page.locator('#samples').textContent()!==samples)throw Error('Compilation changed sample rows');
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 if(errors.length||external.length||writes.length)throw Error(JSON.stringify({errors,external,writes}));
 await page.screenshot({path:join(tmpdir(),'umf-browser-action-compiler-20261015.png'),fullPage:true});
 const hashes:Record<string,string>={};
 for(const path of ['action-compiler.html','action-compiler.js','action-compiler/model.json','action-compiler/weft_wasm_bg.wasm','action-compiler/weft_wasm.js']){const response=await page.request.get(origin+'/'+path);if(!response.ok())throw Error('Asset unavailable: '+path);hashes[path]=createHash('sha256').update(await response.body()).digest('hex');}
 for(const path of ['docs/helix/05-deploy/microsite/verify-action-compiler.ts','docs/helix/05-deploy/microsite/build-action-compiler.ts','docs/helix/05-deploy/microsite/action-compiler.ts','tests/security/preparation-program-original/program-configuration.json','tests/security/preparation-program-original/program-request.json'])hashes[path]=createHash('sha256').update(new Uint8Array(await Bun.file(resolve(import.meta.dir,'../../../..',path)).arrayBuffer())).digest('hex');
 const report={hashes,scope:'GitHub Pages-compatible original Weft WASM compilation entirely in browser; unchanged example data; no Truss execution',browser:browser.version(),passed:true,refusals:3,unicode:true,mobile:true,externalRequests:external,writeRequests:writes};
 await Bun.write(new URL('../../04-build/evidence/bulk-update/website-compiler-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();server?.stop(true);}
