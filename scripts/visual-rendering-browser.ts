// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {copyVisualRuntime,visualPackageIdentity} from './visual-runtime-assets';
const directory=await mkdtemp(join(tmpdir(),'umf-visual-consumer-'));
for(const [source,destination]of [['tests/domain-packs/visual-browser-entry.ts','app.js'],['docs/helix/05-deploy/schema-browser/visual-worker.ts','visual-worker.js']]){
 const result=await Bun.build({entrypoints:[source!],target:'browser',format:'esm'});if(!result.success)throw Error(result.logs.join('\n'));await Bun.write(join(directory,destination!),result.outputs[0]!);
}
await copyVisualRuntime(join(directory,'lini'));
await Bun.write(join(directory,'components.css'),await Bun.file('docs/helix/05-deploy/schema-browser/components.css').bytes());
await Bun.write(join(directory,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; img-src 'self'; base-uri 'none'"><title>UMF visual consumer qualification</title><link rel="stylesheet" href="components.css"><script type="module" src="app.js"></script><body></body></html>`);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;return new Response(Bun.file(join(directory,path==='/'?'index.html':path)));}});
const browser=await chromium.launch({headless:true}),origin=`http://127.0.0.1:${server.port}`;
let checks=0;const assert=(condition:unknown,message:string)=>{checks++;if(!condition)throw Error(message);};
try{
 const page=await browser.newPage(),errors:string[]=[],external:string[]=[];
 page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:'))external.push(request.url());});
 await page.goto(origin);await page.waitForFunction(()=>!!(globalThis as any).visualTest);
 const model={records:[{id:'["one","Record"]',label:'Same label'},{id:'["two","Record"]',label:'Same label'},{id:'isolated',label:'<img src=x onerror=alert(1)>'}],edges:[
  {id:'directed',source:'["one","Record"]',target:'["two","Record"]',directed:true,label:'Directed'},
  {id:'headless',source:'["one","Record"]',target:'["two","Record"]',directed:false,label:'Undirected'},
  {id:'self',source:'["one","Record"]',target:'["one","Record"]',directed:true,label:'Self'},
  {id:'outside',source:'["one","Record"]',target:'missing',label:'Retained external declaration'},
 ]};
 await page.evaluate(model=>(globalThis as any).visualTest.create(model),model);
 const map=page.locator('#map-0'),links=map.locator('svg [role="link"]');
 assert(await links.count()===6,'Native identity correspondence lost a node, self or parallel edge');
 assert(await map.locator('svg img,svg script').count()===0,'Untrusted source label became markup');
 assert(await map.locator('[data-model-id="directed"] .lini-marker-arrow').count()>0,'Directed edge lost its arrow');
 assert(await map.locator('[data-model-id="headless"] .lini-marker-arrow').count()===0,'Undirected edge acquired an arrow');
 assert(await map.getByRole('button',{name:/Retained external declaration/}).count()===1,'Unresolved declaration lost its inspection link');
 const first=map.locator('svg [role="link"]').filter({hasText:'Same label'}).first();await first.focus();await page.keyboard.press('Enter');
 assert((await page.evaluate(()=>(globalThis as any).visualTest.navigation)).some((item:any)=>item.id==='["one","Record"]'&&item.kind==='record'),'Keyboard navigation used display text instead of source identity');
 await map.locator('[data-model-id="headless"]').focus();await page.keyboard.press('Enter');
 assert((await page.evaluate(()=>(globalThis as any).visualTest.navigation)).some((item:any)=>item.id==='headless'&&item.kind==='relationship'),'Relationship keyboard activation failed');
 await map.getByRole('combobox',{name:'Focus record'}).selectOption('["two","Record"]');await map.locator('svg [data-model-id="headless"]').waitFor();
 assert(await map.locator('svg g[role="link"][data-model-id="isolated"]').count()===0,'Focus retained an unrelated record');
 await map.getByRole('button',{name:'Show full model'}).click();await map.locator('svg [data-model-id="isolated"]').waitFor();
 const latest={records:[{id:'latest',label:'Latest source'}],edges:[]};
 await page.evaluate(({model,latest})=>(globalThis as any).visualTest.race(0,model,latest),{model,latest});
 assert(await map.locator('svg [data-model-id="latest"]').count()===1&&await map.locator('svg [data-model-id="isolated"]').count()===0,'An older asynchronous drawing replaced the latest model');
 const many={records:Array.from({length:32},(_,i)=>({id:'record-'+i,label:'Record '+i})),edges:Array.from({length:31},(_,i)=>({id:'edge-'+i,source:'record-'+i,target:'record-'+(i+1),directed:i%2===0}))};
 await page.evaluate(model=>(globalThis as any).visualTest.create(model),many);
 assert(await page.locator('#map-1 svg [role="link"]').count()===63,'Schema-sized model was silently truncated');
 await page.setViewportSize({width:390,height:844});
 assert(await page.locator('#map-1 svg').count()===1,'Mobile viewport lost the native graph');
 assert(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),'Mobile map overflowed the document instead of its own scroll panel');
 const svgChecks=await page.evaluate(()=>{
  const test=(globalThis as any).visualTest.checkSvg;
  return {script:test('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
   external:test('<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:url("https://example.com/a")}</style></svg>'),
   event:test('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
   inert:test('<svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="pattern" width="1" height="1"/></defs><style>.x{fill:url("#pattern")}</style><rect class="x" style="stroke: currentColor"/></svg>')};
 });
 assert(!svgChecks.script&&!svgChecks.external&&!svgChecks.event&&svgChecks.inert,'SVG/CSS admission either executed active content or rejected an inert fragment');
 await page.evaluate(model=>(globalThis as any).visualTest.destroyWhileRendering(1,model),model);
 assert(await page.locator('#map-1 svg').count()===0,'Destroyed map was resurrected by an asynchronous result');
 await page.evaluate(()=>(globalThis as any).visualTest.destroy(0));
 assert(await page.evaluate(()=>document.adoptedStyleSheets.length)===0,'Native style sheets leaked after destroy');
 assert(errors.length===0,'Browser errors or CSP violations: '+errors.join('\n'));
 assert(external.length===0,'Rendering fetched external resources: '+external.join('\n'));
 const receipt={profile:'umf.site.visual-browser/1',rendererPackage:await visualPackageIdentity(),browser:browser.version(),bun:Bun.version,checks,csp:'Main document denies JavaScript eval and inline styles; trusted same-origin rendering worker has its own execution context.',scope:'Lini visual projection, source identity, escaping, focus/full model, directed/headless/self/parallel edges, async lifecycle and 32-record browser rendering; no schema/native execution equivalence.'};
 await Bun.write('docs/helix/04-build/evidence/visual-rendering-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(receipt);
}finally{await browser.close();server.stop(true);}
