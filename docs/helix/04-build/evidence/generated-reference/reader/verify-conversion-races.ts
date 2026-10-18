import {chromium} from '/Users/erik/.codex/worktrees/d8be/umf/node_modules/playwright/index.mjs';
import {resolve,join} from 'node:path';
const root='/Users/erik/.codex/worktrees/d8be/umf',site=join(root,'docs/helix/05-deploy/microsite/dist');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=resolve(site,new URL(req.url).pathname.slice(1));return path.startsWith(site+'/')?new Response(Bun.file(path)):new Response('',{status:404});}});
const browser=await chromium.launch(),page=await browser.newPage(),checks:string[]=[];const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
try{
 await page.goto(`http://127.0.0.1:${server.port}/reference/workbench.html`);await page.locator('#load-status').filter({hasText:'entries · assets verified'}).waitFor();
 for(const action of ['edit','cancel']){
  const input='id: original\nunknown: true\n';await page.locator('#source').fill(input);let release!:()=>void,seen!:()=>void;const held=new Promise<void>(r=>release=r),arrived=new Promise<void>(r=>seen=r);
  await page.route('**/assets/worker.js',async route=>{seen();await held;await route.continue();});await page.locator('#source-json').click();await arrived;
  if(action==='edit')await page.locator('#source').fill('id: newer-edit\n');else await page.locator('#cancel').click();release();await page.waitForLoadState('networkidle');await page.unroute('**/assets/worker.js');
  assert(await page.locator('#source').inputValue()===(action==='edit'?'id: newer-edit\n':input),'Stale conversion overwrote '+action);assert(await page.locator('#source-yaml').getAttribute('aria-pressed')==='true','Stale format published');checks.push('Delayed conversion discarded after '+action);
 }
 const original='# retained original comment\nid: untouched\n';await page.locator('#source').fill(original);await page.locator('#source-json').click();await page.waitForFunction(()=>document.querySelector('#source')?.getAttribute('data-format')==='json');
 const pending=page.waitForEvent('download');await page.locator('#download-input').click();const download=await pending;assert(await Bun.file((await download.path())!).text()===original,'Original bytes lost on format');checks.push('Original download retains comments and exact source bytes after format conversion');
 console.log(JSON.stringify({browser:browser.version(),checks}));
}finally{await browser.close();server.stop(true);}
