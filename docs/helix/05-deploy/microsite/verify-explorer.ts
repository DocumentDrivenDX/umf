import {chromium} from 'playwright';
import {join} from 'node:path';
import {parseEntry} from './explorer-model';
const origin=process.env.UMF_EXPLORER_URL??'http://127.0.0.1:4178',checks:string[]=[];
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
async function check(name:string,fn:()=>Promise<void>){for(const pack of await page.locator('details[data-pack]').all()){if(!await pack.evaluate(el=>(el as HTMLDetailsElement).open))await pack.locator(':scope > summary').click();}await fn();checks.push(name);}
try{
 await page.goto(origin+'/demo.html');await page.waitForFunction(()=>document.querySelector('#result')?.textContent?.includes('Content retained'));
 if(!await page.locator('#source').inputValue().then(t=>t.startsWith('umf:')))throw Error('Playground input is not YAML');
 await page.locator('#format').selectOption('json');await page.locator('#run').click();JSON.parse(await page.locator('#output').innerText());
 await page.locator('#source').fill(await page.locator('#output').innerText());await page.locator('#format').selectOption('yaml');await page.locator('#run').click();if(!(await page.locator('#result').innerText()).includes('Content retained'))throw Error('JSON input to YAML failed');checks.push('Playground YAML defaults and JSON interchange');
 await page.goto(origin+'/explorer.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('domain pack'));
 if(await page.locator('details[data-pack][open]').count()>1)throw Error('Unselected domain packs start expanded');
 checks.push('Domain packs start collapsed except the selected pack');
 await check('Download target preview, review gate and SQL download',async()=>{
  await page.goto(origin+'/explorer.html#schema='+encodeURIComponent('schema:ecology@1.0.0:sampling_events'));
  const panel=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Download as…'})});
  await panel.locator('summary').click();await panel.getByLabel('Download target').waitFor();
  for(const target of ['postgresql','sqlserver','delta','json-schema','avro','graphql','protobuf','openapi','spark']){await panel.getByLabel('Download target').selectOption(target);await panel.locator('pre').waitFor();if(!await panel.locator('pre').textContent().then(t=>t?.includes('site_id')))throw Error('Missing generated field');}
  await panel.getByLabel('Download target').selectOption('json-schema');if(await panel.getByLabel('Schema serialization').inputValue()!=='yaml'||!(await panel.locator('pre').innerText()).startsWith('$schema:'))throw Error('Missing YAML default');await panel.getByLabel('Schema serialization').selectOption('json');JSON.parse(await panel.locator('pre').innerText());
  await panel.getByLabel('Download target').selectOption('postgresql');
  if(await panel.getByRole('link',{name:'Download schema.sql',exact:true}).isVisible())throw Error('Review gate bypassed');
  await panel.getByRole('checkbox').check();const pending=page.waitForEvent('download');await panel.getByRole('link',{name:'Download schema.sql',exact:true}).click();const download=await pending;if(download.suggestedFilename()!=='schema.sql')throw Error('Wrong filename');
 });
 await page.goto(origin+'/explorer.html');
 // @covers US-055-AC6
 await check('Medical subpacks expose all eighteen source-qualified schemas',async()=>{
  for(const id of ['medical-carrier','medical-epidemiology','medical-imaging','medical-terminology']){
   const metadata=await Bun.file(join(import.meta.dir,'../../../../spec/domain-packs',id,'pack.json')).json();
   const pack=page.locator(`[data-pack="pack:${id}@1.0.0"]`);
   await pack.getByRole('button',{name:/^Overview /}).click();await page.getByRole('heading',{name:id,exact:true}).waitFor();
   for(const schema of metadata.schemas){
    await pack.getByRole('button',{name:new RegExp('^'+schema.id+' ')}).click();
    await page.getByRole('heading',{name:schema.id,exact:true}).waitFor();await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();
    if(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('schema')!==`schema:${id}@1.0.0:${schema.id}`)throw Error('Subpack selection escaped identity');
   }
  }
 });
 await check('Pack catalog and linked schemas',async()=>{await page.locator('[data-pack="pack:legal@1.1.0"]').getByRole('button',{name:/^Overview /}).click();await page.locator('#inspector').getByRole('link',{name:'clients',exact:true}).click();await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();if(!await page.locator('#inspector').textContent().then(t=>t?.includes('client_name')))throw new Error('Missing client field');});
 await check('Public dataset packs, source downloads and all sixteen schemas',async()=>{
  for(const id of ['nyc-tlc','movielens','noaa-ghcn-daily','gtfs-schedule']){
   const manifest=await Bun.file(join(import.meta.dir,`../../../../spec/domain-packs/${id}/pack.json`)).json();
   const pack=page.locator(`[data-pack="pack:${id}@1.0.0"]`);
   await pack.getByRole('button',{name:/^Overview /}).click();
   await page.getByRole('heading',{name:'Schemas in this pack',exact:true}).waitFor();
   const href=await page.getByRole('link',{name:'Download source'}).getAttribute('href');
   const source=await page.evaluate(async href=>await(await fetch(href!)).text(),href);
   if(source!==await Bun.file(join(import.meta.dir,`../../../../spec/domain-packs/${id}/pack.json`)).text())throw Error('Public manifest source changed');
   for(const schema of manifest.schemas){
    await pack.getByRole('button',{name:new RegExp('^'+schema.id+' ')}).click();
    await page.getByRole('heading',{name:schema.id,exact:true}).waitFor();
    await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();
   }
  }
 });
 await check('Ontology context, record pages, relationship map and legacy URLs',async()=>{
  await page.goto(origin+'/explorer.html#schema=spec%2Fdomain-packs%2Fecology%2Fontology.json');
  await page.getByRole('heading',{name:'ecology ontology',exact:true}).waitFor();
  if(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('schema')!=='schema:ecology@1.0.0:ontology')throw Error('Legacy ontology URL lost pack context');
  await page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Ecology · 1.0.0'}).waitFor();
  await page.getByRole('img',{name:'Record relationship neighborhood'}).waitFor();
  await page.getByRole('button',{name:'Show full model',exact:true}).click();
  if(await page.locator('.ontology-map svg rect').count()!==19)throw Error('Ecology map lost records');
  await page.locator('.ontology-map svg a[aria-label="Inspect record Sampling events"]').click();
  await page.getByRole('heading',{name:'Outgoing relationships',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Incoming relationships',exact:true}).waitFor();
  await page.getByRole('link',{name:'View corresponding table',exact:true}).click();
  await page.getByRole('heading',{name:'sampling_events',exact:true}).waitFor();
  await page.getByRole('link',{name:'View ontology record',exact:true}).click();
  await page.getByRole('heading',{name:'Relationship neighborhood',exact:true}).waitFor();
  await page.locator('.ontology-map svg a[aria-label="Inspect relationship sampling_events.site_id"] circle').click();
  await page.locator('[data-relationship]').waitFor();
  if(!(await page.locator('[data-relationship]').innerText()).includes('Target participation 1..1'))throw Error('Relationship multiplicity lost');
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Ontology page overflows mobile viewport');
  await page.screenshot({path:'/private/tmp/umf-ontology-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.ontology-map').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/umf-ontology-desktop.png',fullPage:false});
 });
 await check('Native foreign-key navigation',async()=>{await page.getByRole('button',{name:/^time_entries /}).click();await page.locator('#inspector').getByRole('link',{name:'matters.matter_id',exact:true}).click();await page.getByRole('heading',{name:'matters',exact:true}).waitFor();});
 await check('Pack hierarchy, breadcrumbs and domain-type ownership',async()=>{
  const pack=page.locator('[data-pack="pack:legal@1.1.0"]');if(await pack.getByRole('button',{name:/^invoices /}).count()!==1)throw new Error('Invoice schema is outside its pack');
  await pack.getByRole('button',{name:/^invoices /}).click();await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();
  const crumbs=page.getByRole('navigation',{name:'Breadcrumb'});if(!(await crumbs.innerText()).includes('Legal · 1.1.0')||!(await crumbs.innerText()).includes('Tables'))throw new Error('Missing pack breadcrumb');
  await page.locator('.details-table').getByRole('link',{name:'invoice_number',exact:true}).click();await page.getByRole('heading',{name:'invoice_number',exact:true}).waitFor();
  if(!(await crumbs.innerText()).includes('Domain types'))throw new Error('Missing type breadcrumb');
  if(await pack.locator('button[aria-current="true"]').innerText().then(t=>!t.startsWith('invoice_number')))throw new Error('Wrong current domain type');
  await crumbs.getByRole('link',{name:'Legal · 1.1.0',exact:true}).click();await page.getByRole('heading',{name:'Schemas in this pack',exact:true}).waitFor();
 });
 await check('Medical fixed-source pack and all eight schemas',async()=>{
  const pack=page.locator('[data-pack="pack:medical@1.0.0"]');
  await pack.getByRole('button',{name:/^Overview /}).click();await page.getByRole('heading',{name:'medical',exact:true}).waitFor();await page.getByRole('heading',{name:'Schemas in this pack',exact:true}).waitFor();
  const href=await page.getByRole('link',{name:'Download source'}).getAttribute('href');const source=await page.evaluate(async href=>await(await fetch(href!)).text(),href);
  if(source!==await Bun.file(join(import.meta.dir,'../../../../spec/domain-packs/medical/pack.json')).text())throw new Error('Medical manifest download changed');
  const manifest=JSON.parse(source);if(manifest.generator||!manifest.fixture_counts||!manifest.source_bindings)throw new Error('Fixed-source declarations lost');
  for(const name of ['resources','organizations','patients','practitioners','encounters','observations','medications','resource_references']){
   await pack.getByRole('button',{name:new RegExp('^'+name+' ')}).click();await page.getByRole('heading',{name,exact:true}).waitFor();await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();
   if(await pack.locator('button[aria-current="true"]').innerText().then(t=>!t.startsWith(name)))throw new Error('Wrong medical schema selected');
  }
 });
 await check('Medical domain types, foreign keys and deep links',async()=>{
  const pack=page.locator('[data-pack="pack:medical@1.0.0"]');
  await pack.locator('summary').filter({hasText:/^Domain types$/}).click();
  for(const name of ['fhir_resource_key','fhir_temporal_literal','exact_decimal_text']){await pack.getByRole('button',{name:new RegExp('^'+name+' ')}).click();await page.getByRole('heading',{name,exact:true}).waitFor();}
  await page.goto(origin+'/explorer.html#'+new URLSearchParams({schema:'schema:medical@1.0.0:observations'}));await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();
  await page.locator('#inspector').getByRole('link',{name:'patients.resource_key',exact:true}).first().click();await page.getByRole('heading',{name:'patients',exact:true}).waitFor();
  if(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('schema')!=='schema:medical@1.0.0:patients')throw new Error('Medical reference escaped its pack');
  await page.screenshot({path:'/private/tmp/umf-medical-explorer-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error('Medical mobile overflow');
  await page.screenshot({path:'/private/tmp/umf-medical-explorer-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 });
 await check('Field detail and history navigation',async()=>{await page.getByRole('button',{name:/^time_entries /}).click();await page.locator('.definition-list').getByRole('link',{name:'billing_rate',exact:true}).click();await page.getByRole('heading',{name:'billing_rate',exact:true}).waitFor();if(!(await page.locator('#inspector').innerText()).includes('numberToken'))throw new Error('Lost numeric token carrier');await page.goBack();await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();});
 await check('Search and empty state',async()=>{await page.getByRole('searchbox').fill('does-not-exist');await page.getByText('No matching schemas. Try another search.').waitFor();await page.getByRole('searchbox').fill('billing_rate');if(await page.locator('.catalog-item').count()<1)throw new Error('Content search failed');await page.getByRole('searchbox').fill('');});
 await check('Core definition and exact decimal inspection',async()=>{await page.getByRole('button',{name:/Orders · core/}).click();await page.locator('.definition-list').getByRole('link',{name:'price',exact:true}).click();await page.getByRole('heading',{name:'price',exact:true}).waitFor();if(!(await page.locator('#inspector').innerText()).includes('999999999999999999.99'))throw new Error('Decimal changed');});
 const local={umf:'0.8.0',id:'browser-unknown',vocabularies:{'example.unknown':{version:'1.0.0'}},modules:[{id:'m',namespace:'n',elements:[{id:'r',kind:'record',members:[{module:'m',element:'f'}],extensions:{}},{id:'f',kind:'field',scalarType:'string',description:'<img src=x onerror=alert(1)>',extensions:{'example.unknown':{keep:'opaque',future:true}}}]}]};
 const text=JSON.stringify(local);
 await check('Local upload, unknown retention, and inert text',async()=>{await page.locator('#file').setInputFiles({name:'unknown.json',mimeType:'application/json',buffer:Buffer.from(text)});await page.getByRole('heading',{name:'unknown.json',exact:true}).waitFor();await page.locator('.definition-list').getByRole('link',{name:'f',exact:true}).click();await page.getByRole('heading',{name:'f',exact:true}).waitFor();if(!(await page.locator('#inspector').innerText()).includes('opaque'))throw new Error('Unknown content lost');if(await page.locator('#inspector img').count())throw new Error('Source interpreted as HTML');await page.locator('.definition-list').getByRole('link',{name:'Overview',exact:true}).click();await page.locator('.definition-list').getByRole('link',{name:'r',exact:true}).click();await page.getByRole('heading',{name:'r',exact:true}).waitFor();await page.locator('table .ref-link').click();await page.getByRole('heading',{name:'f',exact:true}).waitFor();});
 await check('Original source download',async()=>{await page.locator('.definition-list').getByRole('link',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'unknown.json',exact:true}).waitFor();const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download source'}).click();const download=await downloadPromise;const downloadedPath=await download.path();if(!downloadedPath)throw Error('No source download');const result=await Bun.file(downloadedPath).text();if(result!==text)throw new Error('Source download changed');});
 await check('Invalid and unresolved sources refuse visibly',async()=>{for(const [name,value] of [['invalid.json',{...local,umf:'99.0.0'}],['unresolved.json',{...local,modules:[{id:'m',namespace:'n',elements:[{id:'x',extensions:{},references:[{role:'test',module:'missing',element:'x'}]}]}]}]] as const){await page.locator('#file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.startsWith('Could not open local schema'));}});
 await check('Deep links and missing selection',async()=>{await page.goto(origin+'/explorer.html#'+new URLSearchParams({schema:'schema:legal@1.1.0:clients',definition:JSON.stringify(['native','client_name'])}));await page.getByRole('heading',{name:'client_name',exact:true}).waitFor();await page.goto(origin+'/explorer.html#schema=missing');await page.getByText('This schema is not in the catalog. Choose a schema from the catalog.').waitFor();});
 await check('Same-named domain types stay within their pack version',async()=>{
  const data=await Bun.file(join(import.meta.dir,'dist/schema-catalog.json')).json();const legal=data.entries.find((e:any)=>e.id==='pack:legal@1.1.0');const other={...legal,id:'pack:legal@2.0.0',packVersion:'2.0.0',text:JSON.stringify({...JSON.parse(legal.text),version:'2.0.0',domain_types:{invoice_number:{description:'Other revision marker'}}})};
  await page.route('**/schema-catalog.json',route=>route.fulfill({json:{...data,entries:[other,...data.entries]}}));
  await page.goto(origin+'/explorer.html#'+new URLSearchParams({schema:'schema:legal@1.1.0:invoices'}));await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();await page.locator('.details-table').getByRole('link',{name:'invoice_number',exact:true}).click();await page.getByRole('heading',{name:'invoice_number',exact:true}).waitFor();
  if(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('schema')!=='pack:legal@1.1.0'||(await page.locator('#inspector').innerText()).includes('Other revision marker'))throw new Error('Domain type escaped its pack version');
  await page.unroute('**/schema-catalog.json');
 });
 await check('Malformed and duplicate-key JSON refuse',async()=>{for(const text of ['{bad','{"umf":"0.8.0","umf":"0.1.0"}']){let refused=false;try{parseEntry({id:'bad',title:'bad',category:'local',path:'bad.json',format:'json',text});}catch{refused=true;}if(!refused)throw new Error('Malformed input accepted');}});
 await page.goto(origin+'/explorer.html#'+new URLSearchParams({schema:'pack:legal@1.1.0'}));await page.getByRole('heading',{name:'legal',exact:true}).waitFor();await page.screenshot({path:'/private/tmp/umf-explorer-desktop.png',fullPage:true});
 await check('Mobile layout and navigation',async()=>{await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/^clients /}).click();await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error('Mobile overflow');await page.screenshot({path:'/private/tmp/umf-explorer-mobile.png',fullPage:true});});
 await check('Existing routes expose the explorer',async()=>{for(const route of ['index.html','docs.html','demo.html','ecosystem.html']){await page.goto(origin+'/'+route);if(await page.locator('nav a[href="explorer.html"]').count()!==1)throw new Error('Missing nav: '+route);}});
 await check('All twenty-four packs, every declared schema and ontology target navigate',async()=>{
  const catalog=await Bun.file(join(import.meta.dir,'dist/schema-catalog.json')).json();
  const packs=catalog.entries.filter((e:any)=>e.id.startsWith('pack:'));
  if(packs.length!==24)throw new Error('Expected twenty-four packs');
  await page.goto(origin+'/explorer.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('domain pack'));
  for(const entry of catalog.entries.filter((e:any)=>e.pack)){
   await page.evaluate(id=>{location.hash=new URLSearchParams({schema:id}).toString();},entry.id);
   await page.locator('#inspector h2').filter({hasText:entry.title}).waitFor();
   if((await page.locator('#status').innerText()).includes('refused'))throw new Error('Navigation refused: '+entry.id);
   if(entry.schemaFormat==='umf'){
    const defs=await page.locator('.definition-list a').count();if(defs<2)throw new Error('Ontology definitions missing');
    if(!await page.locator('#inspector').innerText().then(t=>t.includes('Relationships')))throw new Error('Ontology relationship details missing');
   }
  }
 });
 if(errors.length)throw new Error(errors.join('\n'));
 const catalog=await Bun.file(join(import.meta.dir,'dist/schema-catalog.json')).json();
 const evidence={date:'2026-10-08',scope:'Microsite schema explorer; no new core/native support or data generation claims',runtime:{bun:Bun.version,chromium:browser.version()},catalog:{packs:catalog.entries.filter((e:any)=>e.id.startsWith('pack:')).length,entries:catalog.entries.length},checks,status:'passed'};
 await Bun.write(join(import.meta.dir,'../schema-explorer-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
