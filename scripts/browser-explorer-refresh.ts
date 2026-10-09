/** Bounded real-browser check of the rebuilt UMF renderer in an explicit consumer shell. */
import {chromium,type Browser} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [consumerArg,outputArg]=process.argv.slice(2);if(!consumerArg||!outputArg)throw Error('Explicit consumer shell and fresh output required');
const consumer=resolve(consumerArg),output=resolve(outputArg);await mkdir(output);
const dist=resolve(import.meta.dir,'../docs/helix/05-deploy/microsite/dist');
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const files:Record<string,Uint8Array<ArrayBuffer>>=Object.fromEntries(await Promise.all(['index.html','host.css','schema-catalog.json'].map(async name=>[name,await Bun.file(join(consumer,name)).bytes()])));
for(const name of ['explorer.js','explorer.css'])files[name]=await Bun.file(join(dist,name)).bytes();
const catalog=JSON.parse(new TextDecoder().decode(files['schema-catalog.json']));if(catalog.entries.length!==9)throw Error('Exact nine-source consumer fixture required');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname.slice(1)||'index.html';const body=files[path];return body?new Response(body,{headers:{'content-type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.json')?'application/json':'text/html'}}):new Response('Unknown',{status:404});}});
let browser:Browser|undefined;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(server.url.origin))external.push(request.url());});
 await page.goto(server.url.href);const checks=[];
 for(const entry of catalog.entries){await page.evaluate((id:string)=>{location.hash=new URLSearchParams({schema:id}).toString();},entry.id);await page.waitForFunction((id:string)=>document.querySelector('#inspector')?.textContent?.includes(id),JSON.parse(entry.text).id);
  const notice=(await page.locator('#inspector .callout').allInnerTexts()).find(text=>text.startsWith('Core structure'));if(!notice?.includes('Core structure valid'))throw Error('Original consumer source rejected: '+entry.id);checks.push({id:entry.id,sourceSha256:sha(new TextEncoder().encode(entry.text)),notice});
 }
 const logical=catalog.entries.find((entry:any)=>entry.id==='ashlar-runtime-logical');if(!logical)throw Error('Original logical model required');
 const model=JSON.parse(logical.text),module=model.modules.find((m:any)=>m.elements.some((e:any)=>e.id==='object_current')),record=module.elements.find((e:any)=>e.id==='object_current');if(!record?.members?.length)throw Error('Original object_current/member required');
 const show=async(element:string)=>{await page.evaluate(([schema,module,element]:[string,string,string])=>{location.hash=new URLSearchParams({schema,definition:JSON.stringify([module,element])}).toString();},[logical.id,module.id,element] as [string,string,string]);await page.waitForFunction(([module,element]:[string,string])=>[...document.querySelectorAll('#inspector p.schema-id')].some(p=>p.textContent?.includes(module+' / '+element)),[module.id,element] as [string,string]);};
 await show(record.id);const member=record.members[0];
 // Exact route preservation is checked independently of presentation labels.
 const routeBefore=await page.evaluate(()=>location.hash);await show(member.element);const routeAfter=await page.evaluate(()=>location.hash);if(routeBefore===routeAfter)throw Error('Definition route did not change');
 await page.screenshot({path:join(output,'consumer-field.png'),fullPage:true});if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
 const report={format:'umf-schema-browser-refresh/0.1',sourceBase:'a95c3ec18a8f904decde884a4fa252988d2a5b0f',bun:Bun.version,browserVersion:browser.version(),assets:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{sha256:sha(bytes),bytes:bytes.length}])),checks,record:record.id,member:member.element,routeBefore,routeAfter,errors,externalRequests:external,qualification:'Rebuilt public UMF renderer on nine exact supplied Ashlar source models, including original record/field routes. Read-only browser metadata inspection; no native validation or enforcement claim.'};
 await Bun.write(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();server.stop(true);}
