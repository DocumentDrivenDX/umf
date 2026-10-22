/** Local, generic host audit. No public sources, credentials, or production writes. */
import {resolve,join} from 'node:path';
import {cpus,platform,arch} from 'node:os';
import {chromium} from 'playwright';
import {stringify} from 'yaml';

function svgPaint(root:string){
   const luminance=(color:string)=>{const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;};
   return Array.from(document.querySelectorAll<SVGTextElement>(root+' svg text')).map(text=>{const a=text.closest('a')!,background=a.querySelector(text.classList.contains('umf-map-number')||a.querySelector('circle')?'circle':'rect')!;const fg=getComputedStyle(text).fill,bg=getComputedStyle(background).fill,x=luminance(fg),y=luminance(bg);const box=background.getBBox();const obscured=background.tagName==='circle'&&Array.from(text.closest('svg')!.querySelectorAll('rect')).some(rect=>{const r=rect.getBBox();return box.x<r.x+r.width&&box.x+box.width>r.x&&box.y<r.y+r.height&&box.y+box.height>r.y;});return {text:text.textContent,fg,bg,ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05),y:text.getAttribute('y'),obscured};});
}
const packageRoot=resolve(process.argv[2]??'node_modules/@documentdrivendx/umf-schema-browser');
const reportPath=resolve(process.argv[3]??'/private/tmp/umf-browser-followup.json');
const axePath=resolve(process.argv[4]??'/private/tmp/umf-browser-audit/node_modules/axe-core/axe.min.js');
const tiny={umf:'0.1.0',id:'urn:audit',vocabularies:{},modules:[{id:'m',namespace:'urn:audit:',elements:[{id:'r',kind:'record',title:'Audit record',members:[],extensions:{}}]}]};
const commerce=await Bun.file('spec/domain-packs/commerce/ontology.json').text();
const customers=await Bun.file('spec/domain-packs/commerce/umf/customers.json').text();
const table=await Bun.file('spec/domain-packs/medical-carrier/umf/claims.json').text();
const pack=JSON.stringify({...await Bun.file('spec/domain-packs/commerce/pack.json').json(),id:'audit'});
const entries=[
 {id:'tiny',title:'Tiny record',category:'registered',path:'tiny.json',format:'json',schemaFormat:'umf',text:JSON.stringify(tiny)},
 {id:'commerce',title:'Commerce model',category:'registered',path:'commerce.json',format:'json',schemaFormat:'umf',text:commerce},
 {id:'table',title:'Claims table',category:'registered',path:'table.json',format:'json',schemaFormat:'tablespec',text:table,pack:'audit',packVersion:'1.0.0'},
 {id:'yaml',title:'YAML record',category:'registered',path:'tiny.yaml',format:'yaml',schemaFormat:'umf',text:stringify(tiny)},
 {id:'lazy',title:'Lazy record',category:'registered',path:'tiny.json',format:'json',schemaFormat:'umf',url:'/source.json'},
 {id:'sibling-json',title:'Unselected JSON companion',category:'registered',path:'sibling.json',format:'json',schemaFormat:'umf',url:'/sibling.json',pack:'audit',packVersion:'1.0.0'},
 {id:'sibling-yaml',title:'Unselected YAML companion',category:'registered',path:'sibling.yaml',format:'yaml',schemaFormat:'umf',url:'/sibling.yaml',pack:'audit',packVersion:'1.0.0'},
 {id:'unrelated',title:'Unselected unrelated model',category:'registered',path:'unrelated.json',format:'json',schemaFormat:'umf',url:'/unrelated.json'},
 {id:'pack:audit@1.0.0',title:'Lazy pack overview',category:'registered',path:'pack.json',format:'json',url:'/pack.json',pack:'audit',packVersion:'1.0.0'},
 {id:'schema:audit@1.0.0:customers',title:'Customers',category:'registered',path:'umf/customers.json',format:'json',schemaFormat:'tablespec',url:'/customers.json',pack:'audit',packVersion:'1.0.0'},
 {id:'schema:audit@1.0.0:ontology',title:'Lazy Commerce ontology',category:'registered',path:'ontology.json',format:'json',schemaFormat:'umf',url:'/ontology.json',pack:'audit',packVersion:'1.0.0'},
];
const policy="default-src 'none'; base-uri 'none'; script-src 'self'; style-src 'self'; frame-src 'self' about:; connect-src 'self'";
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Generic browser audit host</title><link rel="stylesheet" href="/host.css"><link rel="stylesheet" href="/assets/components.css"></head><body><main><h1>Generic schema host</h1><button id="before">Before browser</button><div id="viewer"></div><button id="after">After browser</button><section id="direct" aria-label="Independent components"></section></main><script type="module" src="/host.js"></script></body></html>';
const hostScript=`import {mount,renderRecordMap,renderPropertyTable,renderDocumentDiff} from '/index.js';
const entries=${JSON.stringify(entries)};
window.start=async(id,theme='light')=>{window.browser?.destroy();document.documentElement.dataset.theme=theme;let complete,fail,timer;const sourceDone=new Promise((resolve,reject)=>{complete=()=>{clearTimeout(timer);resolve();};fail=error=>{clearTimeout(timer);reject(error);};timer=setTimeout(()=>fail(Error('Initial source timed out')),30000);});sourceDone.catch(()=>{});const begin=performance.now();window.browser=mount(document.getElementById('viewer'),{assetsUrl:'/assets/',entries,selection:{schema:id},height:'700px',hideHero:true,theme,readOnlyLocalFiles:true,onError:error=>fail(Error(error.code+': '+error.message)),onSelect:selection=>{if(selection.schema===id)complete();}});await window.browser.ready;const ready=performance.now();await sourceDone;const selected=performance.now();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {readyMs:ready-begin,selectedMs:selected-begin,paintedMs:performance.now()-begin,resources:window.browser.iframe.contentWindow.performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,transfer:r.transferSize,encoded:r.encodedBodySize,decoded:r.decodedBodySize,duration:r.duration}))};};
window.components=()=>{const root=document.getElementById('direct');root.replaceChildren();const tones=['neutral','info','positive','warning','negative'];renderPropertyTable(root,Object.fromEntries(tones.map(t=>[t,'Declared value'])),{annotations:Object.fromEntries(tones.map(t=>[t,[{badge:t,tone:t,tooltip:'Host assertion'}]]))});renderRecordMap(root,{records:[{id:'a',label:'Created record',status:'created',properties:1},{id:'b',label:'Changed record',status:'changed',properties:2},{id:'c',label:'Removed record',status:'removed',properties:3},{id:'d',label:'Second row record',properties:0},{id:'e',label:'Middle second row',properties:0},{id:'f',label:'Last second row',properties:0}],edges:[{id:'ab',source:'a',target:'b',label:'Created link',status:'created',directed:true},{id:'bc',source:'b',target:'c',label:'Changed link',status:'changed',directed:true},{id:'ca',source:'c',target:'a',label:'Removed link',status:'removed',directed:true},{id:'ac',source:'a',target:'c',label:'Parallel reverse link',status:'changed',directed:true},{id:'ca2',source:'c',target:'a',label:'Third parallel link',status:'created',directed:true}]},{focus:'a',onNavigate:(id,kind)=>(window.mapActivations??=[]).push({id,kind}),annotations:{a:[{badge:'info',tone:'info'},{badge:'positive',tone:'positive'}],b:[{badge:'warning',tone:'warning'},{badge:'negative',tone:'negative'}],c:[{badge:'neutral',tone:'neutral'}]}});renderDocumentDiff(root,{changed:'old',removed:'old'},{created:'new',changed:'new'});};`;
const hostCss='body{font:16px system-ui;margin:24px;background:var(--umf-paper);color:var(--umf-ink)}:root{color-scheme:light;--umf-paper:#f4f1e9;--umf-ink:#203c35;--umf-line:#526057;--umf-focus:#203c35}:root[data-theme="dark"]{color-scheme:dark;--umf-paper:#151a20;--umf-ink:#e8edf3;--umf-line:#aeb9c7;--umf-focus:#aaccee}@media(prefers-color-scheme:dark){:root[data-theme="auto"]{color-scheme:dark;--umf-paper:#151a20;--umf-ink:#e8edf3;--umf-line:#aeb9c7;--umf-focus:#aaccee}}#viewer{height:700px}#direct{margin-top:24px}';
const requests:{path:string;bytes:number}[]=[];
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
 const path=new URL(request.url).pathname;const headers:Record<string,string>={'Content-Security-Policy':policy};
 if(path==='/'||path==='/audit')return new Response(html,{headers:{...headers,...(path==='/audit'?{'Content-Security-Policy':policy.replace("style-src 'self'","style-src 'self' 'unsafe-inline'")} : {}),'Content-Type':'text/html'}});
 if(path==='/host.js')return new Response(hostScript,{headers:{...headers,'Content-Type':'text/javascript'}});
 if(path==='/host.css')return new Response(hostCss,{headers:{...headers,'Content-Type':'text/css'}});
 if(['/source.json','/sibling.json','/unrelated.json'].includes(path))return new Response(JSON.stringify(tiny),{headers:{...headers,'Content-Type':'application/json'}});
 if(path==='/sibling.yaml')return new Response(stringify(tiny),{headers:{...headers,'Content-Type':'text/plain'}});
 if(path==='/pack.json')return new Response(pack,{headers:{...headers,'Content-Type':'application/json'}});
 if(path==='/customers.json')return new Response(customers,{headers:{...headers,'Content-Type':'application/json'}});
 if(path==='/ontology.json')return new Response(commerce,{headers:{...headers,'Content-Type':'application/json'}});
 if(path==='/catalog.json')return Response.json({version:1,entries},{headers});
 const file=path==='/axe.js'?Bun.file(axePath):Bun.file(join(packageRoot,path));
 if(!await file.exists())return new Response('Not found',{status:404,headers});
 const bytes=await file.bytes();const encoded=Bun.gzipSync(bytes,{level:9});
 requests.push({path,bytes:encoded.length});
 return new Response(encoded,{headers:{...headers,'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':file.type,'Content-Encoding':'gzip','Cache-Control':'public, max-age=3600'}});
}});
const origin=`http://127.0.0.1:${server.port}`,browser=await chromium.launch({headless:true});
const report:any={date:'2026-10-10',packageRoot,packageVersion:(await Bun.file(join(packageRoot,'package.json')).json()).version,bun:Bun.version,browser:browser.version(),axe:(await Bun.file(join(axePath,'../package.json')).json()).version,fixtures:entries.map(e=>({id:e.id,format:e.format,bytes:e.text?new TextEncoder().encode(e.text).length:undefined,url:e.url})),environment:{platform:platform(),arch:arch(),cpu:cpus()[0]?.model,viewport:{width:1280,height:1000},transport:'gzip level 9 over loopback; no CPU/network throttling'},policy,auditPolicy:'Only the axe measurement page permits inline probe styles; product/CSP and performance checks use the exact strict policy without axe.',performance:[],accessibility:[],manual:[],errors:[],cspViolations:[]};
const observe=(page:any)=>{page.on('pageerror',(e:Error)=>report.errors.push(String(e)));page.on('console',(m:any)=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))report.cspViolations.push(m.text());});page.on('request',(r:any)=>{if(new URL(r.url()).origin!==origin)report.errors.push('External request: '+r.url());});};
try{
 for(const id of ['tiny','commerce','yaml','lazy','table']){
  const context=await browser.newContext({viewport:report.environment.viewport});const page=await context.newPage();observe(page);
  for(let run=0;run<6;run++){
   if(run===0){await page.goto(origin);await page.waitForFunction(()=>typeof (window as any).start==='function');}
   const timing=await page.evaluate(async({id})=>(window as any).start(id),{id});report.performance.push({scenario:id,cache:run===0?'cold':'warm-remount',run,...timing});
   const frame=page.frames().find(f=>f.url().startsWith('about:srcdoc'))!;
   const exact=await frame.locator('details').filter({has:frame.getByText('Original schema source',{exact:true})}).locator('pre').textContent();
   if(exact!==entries.find(e=>e.id===id)?.text&&id!=='lazy')throw Error('Original text changed: '+id);
  }await context.close();
  // Four additional isolated contexts give five independent cold samples.
  for(let run=1;run<5;run++){const cold=await browser.newContext({viewport:report.environment.viewport});const p=await cold.newPage();observe(p);await p.goto(origin);await p.waitForFunction(()=>typeof (window as any).start==='function');const timing=await p.evaluate(async({id})=>(window as any).start(id),{id});report.performance.push({scenario:id,cache:'cold',run,...timing});await cold.close();}
 }
 const context=await browser.newContext({viewport:report.environment.viewport});const page=await context.newPage();observe(page);await page.goto(origin+'/audit');await page.waitForFunction(()=>typeof (window as any).start==='function');
 for(const theme of ['light','dark','auto'])for(const id of ['table','commerce']){
  await page.emulateMedia({colorScheme:theme==='auto'?'dark':theme as 'light'|'dark'});await page.evaluate(async({id,theme})=>(window as any).start(id,theme),{id,theme});
  const frame=page.frames().find(f=>f.url().startsWith('about:srcdoc'))!;await frame.addScriptTag({url:origin+'/axe.js'});
  const definition=await frame.evaluate(()=>document.querySelector<HTMLElement>('[data-definition-id]')?.dataset.definitionId);
  await page.evaluate(({id,definition})=>(window as any).browser.setAnnotations({[definition??id]:['neutral','info','positive','warning','negative'].map(tone=>({badge:tone,tone,tooltip:'Host assertion'}))}),{id,definition});await frame.locator('.umf-annotation').first().waitFor();
  await frame.evaluate(()=>{document.querySelectorAll('details').forEach(d=>{if(d.classList.contains('raw-content'))d.open=true;});});
  const result=await frame.evaluate(async()=>{const a=(window as any).axe;const result=await a.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return {violations:result.violations,incomplete:result.incomplete};});
  report.accessibility.push({view:id,theme,...result});
  await page.evaluate(()=>(window as any).browser.focus());await frame.waitForFunction(()=>document.activeElement?.tagName==='H2');await page.keyboard.press('Tab');report.manual.push({theme,view:id,focusAfterTab:await frame.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,100)}))});
  await page.evaluate(()=>(window as any).components());await page.addScriptTag({url:origin+'/axe.js'});
  const direct=await page.evaluate(async()=>{const a=(window as any).axe;const result=await a.run(document.getElementById('direct'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return {violations:result.violations,incomplete:result.incomplete};});report.accessibility.push({view:'direct-components',theme,...direct});
  report.manual.push({theme,view:'direct-svg',pairs:await page.evaluate(svgPaint,'#direct')});
  report.manual.push({theme,view:'iframe-svg',pairs:await frame.evaluate(svgPaint,'#inspector')});
  await page.getByRole('button',{name:'Show full model',exact:true}).first().click();report.manual.push({theme,view:'direct-full-svg',pairs:await page.evaluate(svgPaint,'#direct')});
  const recordLink=page.locator('#direct svg a').filter({has:page.locator('rect')}).first();await recordLink.focus();await page.keyboard.press('Enter');
  report.manual.push({theme,view:'direct-keyboard',activation:await page.evaluate(()=>(window as any).mapActivations.at(-1))});
  await page.locator('#direct').screenshot({path:reportPath.replace(/\.json$/,`-${theme}-components.png`)});
 }
 await page.screenshot({path:reportPath.replace(/\.json$/,'.png')});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>(window as any).start('table','dark'));
 const mobile=page.frames().find(f=>f.url().startsWith('about:srcdoc'))!;
 await mobile.getByRole('button',{name:'Browse catalog',exact:true}).click();await mobile.getByRole('button',{name:'Close catalog',exact:true}).waitFor();await page.keyboard.press('Escape');
 const escaped=await mobile.evaluate(()=>!document.body.classList.contains('catalog-open')&&document.activeElement?.textContent==='Browse catalog');
 report.manual.push({mobileCatalogEscape:escaped});
 // Tab from the final iframe control returns to the host's next control.
 await mobile.evaluate(()=>{const controls=Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,summary,[tabindex="0"]')).filter(e=>e.getClientRects().length&&!e.closest('[hidden]'));controls.at(-1)!.focus();});await page.keyboard.press('Tab');report.manual.push({keyboardReturnsToHost:await page.locator('#after').evaluate(e=>e===document.activeElement)});
 // Replay the exact same documented baseline for an ordinary standalone iframe.
 await page.goto(origin);await page.waitForFunction(()=>typeof (window as any).start==='function');
 await page.evaluate(async()=>(window as any).start('schema:audit@1.0.0:customers'));
 const linked=page.frames().find(f=>f.url().startsWith('about:srcdoc'))!;
 const initialPaths=await linked.evaluate(()=>performance.getEntriesByType('resource').map((r:any)=>new URL(r.name).pathname));
 await page.evaluate(async()=>(window as any).browser.select({schema:'pack:audit@1.0.0'}));
 await page.evaluate(async()=>(window as any).browser.select({schema:'schema:audit@1.0.0:customers'}));
 const afterPack=await linked.locator('.field-table').count()===1;
 await page.evaluate(async()=>(window as any).browser.select({schema:'schema:audit@1.0.0:ontology',definition:JSON.stringify(['domain','customers'])}));
 const recordToTable=await linked.getByRole('link',{name:'View corresponding table',exact:true}).count()===1;
 await page.evaluate(async()=>(window as any).browser.select({schema:'schema:audit@1.0.0:customers'}));
 const tableToRecord=await linked.getByRole('link',{name:'View ontology record',exact:true}).count()===1;
 report.manual.push({lazyPackNavigation:{initialPaths,afterPack,recordToTable,tableToRecord}});
 await page.evaluate(()=>(window as any).browser.destroy());
 const nativeTiming=await page.evaluate(async()=>{const timing=await (window as any).start('tiny');return timing;});
 const native=page.frames().find(f=>f.url().startsWith('about:srcdoc'))!;
 await native.locator('.export-panel').evaluate((e:HTMLDetailsElement)=>e.open=true);
 const nativeBegin=performance.now();await native.getByRole('button',{name:'Prepare native recovery',exact:true}).click();
 await native.locator('a[download="source-companion.json"]').waitFor();
 const nativeMs=performance.now()-nativeBegin;const downloaded=page.waitForEvent('download');await native.locator('a[download="source-companion.json"]').click();const download=await downloaded;
 const downloadPath=await download.path();const sourceText=await Bun.file(downloadPath!).text();
 report.manual.push({strictPolicyDownload:sourceText===JSON.stringify(tiny),filename:download.suggestedFilename(),optionalRecoveryMs:nativeMs,initialResources:nativeTiming.resources,afterRecovery:await native.evaluate(()=>performance.getEntriesByType('resource').map((r:any)=>({name:new URL(r.name).pathname,encoded:r.encodedBodySize,decoded:r.decodedBodySize})))});
 await page.evaluate(()=>(window as any).browser.destroy());
 await page.evaluate(()=>{const f=document.createElement('iframe');f.title='Standalone schema browser';f.src='/assets/index.html?catalogUrl='+encodeURIComponent(location.origin+'/catalog.json');document.getElementById('viewer')!.append(f);});
 await page.frameLocator('#viewer iframe').locator('#catalog button').first().waitFor({state:'attached'});report.manual.push({standaloneCatalog:true,exactDocumentedPolicy:true});await context.close();
 const assets=[];for await(const name of new Bun.Glob('assets/**/*.js').scan({cwd:packageRoot,onlyFiles:true})){const bytes=await Bun.file(join(packageRoot,name)).bytes();assets.push({name,bytes:bytes.length,gzip9:Bun.gzipSync(bytes,{level:9}).length,sha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')});}report.assets=assets.sort((a,b)=>a.name.localeCompare(b.name));
}finally{await browser.close();server.stop(true);await Bun.write(reportPath,JSON.stringify(report,null,2)+'\n');}
const violations=report.accessibility.reduce((n:number,r:any)=>n+r.violations.length,0);
const manualFailures=report.manual.filter((r:any)=>r.mobileCatalogEscape===false||r.keyboardReturnsToHost===false||r.strictPolicyDownload===false||r.lazyPackNavigation&&(!r.lazyPackNavigation.afterPack||!r.lazyPackNavigation.recordToTable||!r.lazyPackNavigation.tableToRecord||r.lazyPackNavigation.initialPaths.some((path:string)=>['/pack.json','/sibling.json','/sibling.yaml','/ontology.json'].includes(path)))||r.pairs?.some((p:any)=>p.ratio<4.5||p.obscured));
const unintended=report.performance.filter((r:any)=>r.scenario==='table'&&r.resources.some((v:any)=>['/pack.json','/sibling.json','/sibling.yaml','/unrelated.json','/ontology.json'].includes(v.name)));
console.log(JSON.stringify({reportPath,samples:report.performance.length,audits:report.accessibility.length,violations,manualFailures:manualFailures.length,unselectedFetchSamples:unintended.length,errors:report.errors,cspViolations:report.cspViolations}));
if(violations||manualFailures.length||unintended.length||report.errors.length||report.cspViolations.length)process.exitCode=1;
