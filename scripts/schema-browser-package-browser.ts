import {chromium} from 'playwright';
import {mkdtemp,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'umf-browser-consumer-')),pkg=join(directory,'package');
async function run(cmd:string[],cwd?:string){const child=Bun.spawn(cmd,{...(cwd?{cwd}:{}),stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error(cmd.join(' '));}
await run(['bun','docs/helix/05-deploy/schema-browser/build.ts',pkg]);
await run(['npm','pack','--cache',join(directory,'cache'),'--pack-destination',directory,'--silent'],pkg);
const archive=join(directory,'documentdrivendx-umf-schema-browser-1.0.0.tgz');
await run(['npm','install','--prefix',directory,'--cache',join(directory,'cache'),'--offline','--ignore-scripts','--no-audit','--no-fund',archive]);
const installed=join(directory,'node_modules/@documentdrivendx/umf-schema-browser');
await cp(installed,join(directory,'browser'),{recursive:true});
const catalog=await Bun.file('docs/helix/05-deploy/microsite/dist/schema-catalog.json').json();
const ids=['schema:medical-carrier@1.2.0:claims','schema:archaeology@1.0.0:ontology','pack:public-company-intelligence@1.1.0','artifact:public-company-intelligence@1.1.0:sec-snapshots'];
const entries=catalog.entries.filter((e:{id:string})=>ids.includes(e.id));if(entries.length!==4)throw Error('Package fixtures missing');
await Bun.write(join(directory,'catalog.json'),JSON.stringify({version:1,entries}));
await Bun.write(join(directory,'index.html'),`<!doctype html><html><body><h1>Consumer</h1><input id="host" value="unchanged"><div id="one"></div><div id="two"></div><button id="destroy">Unmount</button><script type="module">import{mountSchemaBrowser}from'./browser/index.js';const entries=(await(await fetch('./catalog.json')).json()).entries;const one=mountSchemaBrowser(document.getElementById('one'),{assetsUrl:'./browser/assets/',entries,initialRoute:'schema='+encodeURIComponent('${ids[0]}')});const two=mountSchemaBrowser(document.getElementById('two'),{assetsUrl:'./browser/assets/',catalogUrl:'./catalog.json',initialRoute:'schema='+encodeURIComponent('${ids[1]}')});await Promise.all([one.ready,two.ready]);document.getElementById('destroy').onclick=()=>one.destroy();document.body.dataset.ready='true';</script></body></html>`);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const pathname=new URL(request.url).pathname;return new Response(Bun.file(join(directory,pathname==='/'?'index.html':pathname)));}}),origin=`http://127.0.0.1:${server.port}`,browser=await chromium.launch({headless:true});
let checks=0;const assert=(ok:boolean,message:string)=>{checks++;if(!ok)throw Error(message);};
try{
 const page=await browser.newPage(),requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin);await page.waitForSelector('body[data-ready="true"]');
 const one=page.frameLocator('#one iframe'),two=page.frameLocator('#two iframe');
 assert(await one.locator('#inspector h2').innerText()==='Claims','table not loaded');
 assert(await one.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(244, 241, 233)','offline base stylesheet lost');
 assert((await two.locator('.map-summary').innerText()).includes('22 of 22 records · 28 of 28 relationships'),'ontology subset wrong');
 await one.getByRole('searchbox',{name:'Filter fields',exact:true}).fill('patient_reference');await one.getByRole('link',{name:'patient_reference',exact:true}).click();await one.getByRole('heading',{name:'patient_reference',exact:true}).waitFor();await one.getByRole('link',{name:'Table overview',exact:true}).click();
 assert(await one.getByRole('searchbox',{name:'Filter fields',exact:true}).inputValue()==='patient_reference','filter lost');
 assert(new URL(page.url()).hash===''&&await page.locator('#host').inputValue()==='unchanged','host changed');
 assert((await two.locator('.map-summary').innerText()).startsWith('Full model'),'second instance changed');
 await one.getByText('Public company intelligence · 1.1.0',{exact:true}).click();await one.getByRole('button',{name:'SEC scoped projections and response references Artifact collection',exact:true}).click();await one.getByRole('searchbox',{name:'Find an artifact',exact:true}).fill('submissions-0000320193');
 assert(await one.locator('.artifact-source:not([hidden])').count()===2,'artifact filter wrong');assert((await one.locator('#inspector').innerText()).includes('No published original download'),'reference qualification lost');
 assert(requests.every(url=>url.startsWith(origin)),'undeclared external request');
 await page.getByRole('button',{name:'Unmount',exact:true}).click();assert(await page.locator('iframe').count()===1,'teardown removed wrong instance');assert((await two.locator('.map-summary').innerText()).startsWith('Full model'),'remaining instance broken');
 await page.goto(origin+'/browser/assets/index.html');await page.locator('#file').setInputFiles({name:'source.json',mimeType:'application/json',buffer:Buffer.from(entries.find((e:{id:string})=>e.id===ids[0]).text)});await page.locator('#inspector h2').waitFor();assert(await page.locator('.details-table tr').count()===15,'standalone local fields lost');assert(await page.locator('#inspector pre').last().textContent()===entries.find((e:{id:string})=>e.id===ids[0]).text,'original local schema text changed');
 assert(errors.length===0,'browser errors: '+errors.join('; '));console.log(`Reusable installed package: ${checks} Chromium checks passed; independent frames, local-only requests and standalone source inspection.`);
}finally{await browser.close();server.stop(true);}
