/** Verify live runtime/HTML/claim byte parity after CI signature verification. */
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const root=resolve(import.meta.dir,'../../../..')+'/';
const base=(process.argv[2]??'https://documentdrivendx.github.io/umf/').replace(/\/?$/,'/');
const version=process.argv[3]??(await Bun.file(root+'package.json').json()).devDependencies['@documentdrivendx/umf-schema-browser'];
const hash=(bytes:Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const get=async(path:string)=>{const r=await fetch(base+path);if(!r.ok)throw Error(path+' HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());};
const manifest=JSON.parse(new TextDecoder().decode(await get('schema-browser-release.json')));
if(manifest.version!==version)throw Error('Live site pin '+manifest.version);
const installed=await Bun.file(root+'node_modules/@documentdrivendx/umf-schema-browser/asset-manifest.json').json();
for(const [name,digest]of Object.entries(manifest.assets)){
 const live=await get(name==='style.css'?'browser-style.css':name);
 if(hash(live)!==digest||installed.assets[name]!==digest)throw Error('Runtime asset differs: '+name);
}
const site=root+'docs/helix/05-deploy/microsite/dist/';
const pages=[];
for(const pattern of ['*.html','actions/*.html'])for await(const file of new Bun.Glob(pattern).scan({cwd:site,onlyFiles:true})){
 const bytes=await get(file);if(hash(bytes)!==hash(await Bun.file(site+file).bytes()))throw Error('HTML differs: '+file);pages.push(file);
}
const claims=[];
for await(const file of new Bun.Glob('*.attestation.json').scan({cwd:root+'.innsigle/public/claims',onlyFiles:true})){
 const live=await get('.well-known/innsigle/claims/'+file);
 if(hash(live)!==hash(await Bun.file(root+'.innsigle/public/claims/'+file).bytes()))throw Error('Claim differs: '+file);claims.push(file);
}
if(pages.length!==16||claims.length!==16)throw Error('Expected the current 16 signed HTML pages and claims');
const browser=await chromium.launch({headless:true});const errors:string[]=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'schema-browser.html');await page.getByRole('heading',{name:'Schema browser '+version,exact:true}).waitFor();
 const catalog=JSON.parse(new TextDecoder().decode(await get('schema-catalog.json')));
 const entry=catalog.entries.find((e:any)=>e.pack==='commerce'&&e.schemaFormat==='umf'&&e.id.endsWith(':ontology'));
 if(!entry)throw Error('Commerce ontology missing');
 await page.goto(base+'explorer.html#'+new URLSearchParams({schema:entry.id}));await page.locator('.ontology-map').waitFor();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Browse catalog',exact:true}).click();await page.keyboard.press('Escape');
 if(await page.evaluate(()=>document.body.classList.contains('catalog-open')))throw Error('Mobile Escape failed');
 if(errors.length)throw Error(errors.join('\n'));
 const report={checkedAt:new Date().toISOString(),version:manifest.version,runtimeAssets:Object.keys(manifest.assets).length,htmlPages:pages,publicClaims:claims.length,chromium:browser.version(),commerceOntology:entry.id,mobileEscape:true,pageErrors:errors};
 await Bun.write(process.argv[4]??'/private/tmp/umf-schema-browser-live-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
