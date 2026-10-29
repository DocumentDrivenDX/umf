// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {resolve,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {canonical,selfModelGraph,type SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {readDocument} from '../../src/index';
import {parse as parseYaml} from 'yaml';
const site=resolve('docs/helix/05-deploy/microsite/dist'),live=process.env.UMF_SITE_URL;
const evidence=resolve(process.env.UMF_ONTOLOGY_EVIDENCE_DIR??('docs/helix/04-build/evidence/generated-reference/ontology/'+(live?'live':'local')));await mkdir(evidence,{recursive:true});
const server=live?undefined:Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const path=resolve(site,new URL(req.url).pathname.replace(/^\/umf\//,''));if(!path.startsWith(site+'/'))return new Response('Not found',{status:404});const file=Bun.file(path);return await file.exists()?new Response(file):new Response('Not found',{status:404});}});
const origin=live??`http://127.0.0.1:${server!.port}/umf/`,browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1280,height:960}}),errors:string[]=[],external:string[]=[],checks:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(new URL(origin).origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:')&&!/^https:\/\/(fonts.googleapis.com|fonts.gstatic.com)\//.test(r.url()))external.push(r.url());});
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const ontology=async(hash='')=>{await page.goto(origin+'reference/core.html'+hash);await page.locator('#load-status').filter({hasText:'assets verified'}).waitFor();await page.locator('#ontology-detail h3').waitFor();};
const sameStrings=(actual:string[],expected:string[])=>JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());
let expectedRecordIds:string[]=[],expectedEdges:ReturnType<typeof selfModelGraph>['edges']=[];
async function assertFullGraph(label:string){
 const actualRecords=await page.locator('#ontology-map svg [aria-label^="Inspect record "]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-model-id')??''));
 const actualEdges=await page.locator('#ontology-map svg [aria-label^="Inspect relationship "]').evaluateAll(nodes=>nodes.map(node=>node.querySelector('title')?.textContent??''));
 assert(sameStrings(actualRecords,expectedRecordIds),label+' record identities differ from authored source');
 assert(sameStrings(actualEdges,expectedEdges.map(edge=>edge.label)),label+' relationship labels differ from source projection');
}
async function assertRelationshipRoutes(){
 await ontology();
 for(const [index,edge] of expectedEdges.entries()){
  await page.locator('.ontology-connections').evaluate(node=>{(node as HTMLDetailsElement).open=true;});
  assert(await page.locator('.ontology-connections button').count()===expectedEdges.length,'Relationship identity list has the wrong count');
  await page.locator('.ontology-connections button').nth(index).click();
  await page.waitForFunction(expected=>new URLSearchParams(location.hash.slice(1)).get('edge')===expected,edge.id);
  await page.getByRole('button',{name:'Show full model',exact:true}).click();
  await page.waitForFunction(()=>!new URLSearchParams(location.hash.slice(1)).has('edge'));
 }
}
function expectedNeighborhood(focus:string){
 const edges=expectedEdges.filter(edge=>edge.source===focus||edge.target===focus),ids=new Set([focus,...edges.flatMap(edge=>[edge.source,edge.target])]);
 return {records:expectedRecordIds.filter(id=>ids.has(id)),edges};
}
async function assertNeighborhood(focus:string,label:string){
 const expected=expectedNeighborhood(focus),actualRecords=await page.locator('#ontology-map svg [aria-label^="Inspect record "]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-model-id')??'')),actualEdges=await page.locator('#ontology-map svg [aria-label^="Inspect relationship "]').evaluateAll(nodes=>nodes.map(node=>node.querySelector('title')?.textContent??''));
 assert(expected.records.length<expectedRecordIds.length&&expected.records.includes(focus),label+' source neighborhood is not a proper focus subset');
 assert(sameStrings(actualRecords,expected.records),label+' record neighborhood differs from authored source');
 assert(sameStrings(actualEdges,expected.edges.map(edge=>edge.label)),label+' relationship neighborhood differs from source projection');
}
try{
 const authoredDocument=readDocument(await Bun.file(resolve('spec/metamodel/umf.yaml')).text(),'yaml'),assetResponse=await page.request.get(origin+'reference/metamodel.json');
 assert(assetResponse.ok(),'Generated metamodel asset unavailable');
 const selfModelCatalog=await assetResponse.json() as SelfModelCatalog;
 assert(canonical(selfModelCatalog.document)===canonical(authoredDocument),'Generated metamodel document differs from authored source');
 expectedRecordIds=authoredDocument.modules.flatMap(module=>module.elements.filter(element=>element.kind==='record').map(element=>JSON.stringify([module.id,element.id])));
 const projected=selfModelGraph(selfModelCatalog);expectedEdges=projected.edges;
 assert(sameStrings(projected.records.map(record=>record.id),expectedRecordIds),'Self-model projection omitted or added authored Record identities');
 assert(expectedRecordIds.length===24,'Expected the complete authored 24-Record source model');
 assert(expectedRecordIds.filter(id=>JSON.parse(id)[1].startsWith('extensionKind')).length===9,'Expected all nine authored extension-kind Record identities');
 // Definition search must expose suggestions without opening browse disclosures.
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});await ontology();
  const finder=page.getByRole('combobox',{name:'Find a definition'}),suggestions=page.getByRole('listbox',{name:'Matching definitions'});
  assert(await finder.getAttribute('aria-expanded')==='false','Finder initially expanded');
  await finder.fill('  mOdUlE  ');
  await suggestions.waitFor();
  assert(await suggestions.getByRole('option').count()>0,'Typing did not show suggestions');
  assert(await suggestions.getByRole('option').first().locator('span').innerText()==='Module','Exact name not ranked first');
  assert(await page.locator('.ontology-groups details[open]').count()===0,'Search requires browse disclosure');
  assert(await finder.evaluate(input=>input===document.activeElement),'Typing lost input focus');
  await page.screenshot({path:join(evidence,'definition-autocomplete-'+width+'.png')});
  await finder.press('ArrowDown');
  const first=await finder.getAttribute('aria-activedescendant');
  assert(!!first&&await page.locator('#'+first).getAttribute('aria-selected')==='true','ArrowDown did not select an option');
  await finder.press('ArrowDown');assert(await finder.getAttribute('aria-activedescendant')!==first,'ArrowDown did not move');
  await finder.press('ArrowUp');assert(await finder.getAttribute('aria-activedescendant')===first,'ArrowUp did not return');
  assert(await suggestions.evaluate(node=>{const b=node.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;}),'Suggestions overflow viewport');
  await finder.press('Enter');await page.locator('#ontology-detail h3').filter({hasText:/^Module$/}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.id==='ontology-detail');
  assert(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('node')===JSON.stringify(['umf','module']),'Autocomplete selected wrong identity');
  const nextFinder=page.getByRole('combobox',{name:'Find a definition'});
  await nextFinder.fill('scalarType');await page.getByRole('option').first().click();
  await page.locator('#ontology-detail h3').filter({hasText:/^scalarType$/}).waitFor();
  await page.goBack();await page.locator('#ontology-detail h3').filter({hasText:/^Module$/}).waitFor();
  const currentFinder=page.getByRole('combobox',{name:'Find a definition'});
  await currentFinder.fill('module');await currentFinder.press('Escape');assert(await currentFinder.getAttribute('aria-expanded')==='false','Escape did not dismiss');
  assert(await currentFinder.inputValue()==='module','Escape discarded query');
  await currentFinder.press('ArrowUp');assert(await currentFinder.getAttribute('aria-expanded')==='true','ArrowUp did not reopen');
  await currentFinder.press('Tab');assert(await currentFinder.getAttribute('aria-expanded')==='false','Tab did not dismiss');
  await currentFinder.fill('module');await page.locator('header').click({position:{x:2,y:2}});assert(await currentFinder.getAttribute('aria-expanded')==='false','Blur did not dismiss');
  await currentFinder.fill('no-such-definition-xyz');assert(await page.getByRole('status').filter({hasText:'No matching definitions.'}).isVisible(),'No-result message hidden');
  await currentFinder.press('Enter');assert(await page.locator('#ontology-detail h3').innerText()==='Module','No-result Enter navigated');
  await currentFinder.fill('');assert(await currentFinder.getAttribute('aria-expanded')==='false','Clearing did not close');
  await currentFinder.fill('   ');assert(await currentFinder.getAttribute('aria-expanded')==='false','Whitespace opened suggestions');
  checks.push(`Definition autocomplete at ${width}px: immediate ranked results, keyboard/pointer navigation, focus, Back, dismissal and empty states`);
 }
 // The default is the whole model, fitted into a substantial graph viewport.
 for(const [width,height] of [[1440,900],[1280,800],[798,900],[390,844]] as const){
  await page.setViewportSize({width,height});await ontology();
  const viewport=page.getByRole('region',{name:'Ontology graph; scroll to pan when zoomed'});
  await page.waitForFunction(()=>document.querySelector('#ontology-map svg')?.getAttribute('style')?.includes('height'));
  const layout=await page.evaluate(()=>{const graph=document.querySelector('.ontology-viewport')!.getBoundingClientRect(),svg=document.querySelector('#ontology-map svg')!.getBoundingClientRect(),detail=document.querySelector('#ontology-detail')!.getBoundingClientRect();return {graph:{top:graph.top,left:graph.left,width:graph.width,height:graph.height,bottom:graph.bottom},svg:{width:svg.width,height:svg.height},detail:{top:detail.top,left:detail.left},overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(!layout.overflow,'Cold ontology document overflow '+width);
  assert(layout.graph.top<height/2&&layout.graph.height>=height*.48,'Graph does not use the available screen '+width+': '+JSON.stringify(layout));
  assert(layout.svg.height<=layout.graph.height&&layout.svg.width<=layout.graph.width,'Default graph is not fitted '+width);
  assert(layout.svg.width>=layout.graph.width*.8||layout.svg.height>=layout.graph.height*.8,'Graph wastes the available viewport '+width);
  assert(await page.locator('#ontology-map svg').evaluate((node:SVGSVGElement)=>{const b=node.getBBox(),v=node.viewBox.baseVal;return b.x>=v.x&&b.y>=v.y&&b.x+b.width<=v.x+v.width&&b.y+b.height<=v.y+v.height;}),'Graph geometry clipped '+width);
  await assertFullGraph('Default graph '+width);
  const geometry=await page.locator('#ontology-map svg').evaluate((svg:SVGSVGElement)=>{
   const nodes=Array.from(svg.querySelectorAll<SVGAElement>('[data-model-id]')).map(node=>({id:node.dataset.modelId,box:node.querySelector('rect')!.getBoundingClientRect(),label:node.querySelector('text')!.getBoundingClientRect()}));
   const overlaps=nodes.flatMap((a,i)=>nodes.slice(i+1).filter(b=>Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left)>1&&Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top)>1));
   const labels=nodes.filter(node=>node.label.left<node.box.left||node.label.right>node.box.right);
   const endpointErrors=Array.from(svg.querySelectorAll<SVGAElement>('[data-source]')).filter(edge=>{
    const path=edge.querySelector('path')!,matrix=svg.getScreenCTM()!;
    return [[edge.dataset.source,0],[edge.dataset.target,path.getTotalLength()]].some(([id,distance])=>{const point=path.getPointAtLength(Number(distance)).matrixTransform(matrix),box=nodes.find(node=>node.id===id)!.box;return Math.min(Math.abs(point.x-box.left),Math.abs(point.x-box.right),Math.abs(point.y-box.top),Math.abs(point.y-box.bottom))>2||point.x<box.left-2||point.x>box.right+2||point.y<box.top-2||point.y>box.bottom+2;});
   });
   const edgeCollisions=Array.from(svg.querySelectorAll<SVGAElement>('[data-source]')).filter(edge=>{const path=edge.querySelector('path')!,matrix=svg.getScreenCTM()!;for(let distance=0;distance<=path.getTotalLength();distance+=4){const point=path.getPointAtLength(distance).matrixTransform(matrix);if(nodes.some(node=>node.id!==edge.dataset.source&&node.id!==edge.dataset.target&&point.x>node.box.left+1&&point.x<node.box.right-1&&point.y>node.box.top+1&&point.y<node.box.bottom-1))return true;}return false;});
   return {overlaps:overlaps.length,labels:labels.length,endpointErrors:endpointErrors.length,edgeCollisions:edgeCollisions.length};
  });assert(geometry.overlaps===0&&geometry.labels===0&&geometry.endpointErrors===0&&geometry.edgeCollisions===0,'Balanced graph geometry invalid '+width+': '+JSON.stringify(geometry));
  if(width>=1001){assert(layout.detail.top<height/2,'Desktop details buried '+width);assert(layout.detail.left>layout.graph.left,'Desktop graph and details must be side by side');}
  await page.getByRole('button',{name:'Show full model',exact:true}).click();await viewport.waitFor();
  await assertFullGraph('Repeated full-model action '+width);
  await page.screenshot({path:join(evidence,'first-screen-'+width+'.png')});
  await page.getByRole('button',{name:'100%',exact:true}).click();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  assert(await viewport.evaluate(n=>n.scrollHeight>n.clientHeight),'100% graph cannot pan vertically '+width);
  await viewport.evaluate(n=>n.scrollTo(100,200));assert(await viewport.evaluate(n=>n.scrollTop)>0,'Graph pan failed '+width);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await page.getByRole('button',{name:'Fit graph',exact:true}).click();assert(await viewport.evaluate(n=>n.scrollTop)===0,'Fit did not reset pan '+width);
  await ontology('#'+new URLSearchParams({view:'ontology',node:JSON.stringify(['umf','element.scalarType'])}));
  await assertFullGraph('Field route '+width);
  await page.locator('#ontology-detail').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'field-first-screen-'+width+'.png')});
 }
 checks.push('Balanced nodes do not overlap; labels fit their cards and routed edges avoid other cards and meet their authored source and target at all four sizes');
 checks.push('All '+expectedRecordIds.length+' authored records and '+expectedEdges.length+' projected relationships fit at 1440/1280/798/390px; zoom and local panning work; desktop details remain adjacent');
 await page.setViewportSize({width:1280,height:960});
 // @covers US-089-AC17 @covers US-089-AC18
 await ontology();assert(await page.locator('#ontology-detail h3').innerText()==='Document','Cold landing not Document ontology');assert(await page.locator('.workspace').isHidden(),'Competing browser remains visible');assert(await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Schemas',exact:true}).getAttribute('href')==='core.html#view=ontology','Primary entry differs');
 assert(await page.locator('#ontology details[open]').count()===0,'Self-model starts expanded: '+await page.locator('#ontology details[open]').evaluateAll(nodes=>nodes.map(n=>n.outerHTML).join('\n')));await page.screenshot({path:join(evidence,'ontology-desktop.png'),fullPage:true});checks.push('Cold Schemas landing opens the full model with collapsed definition groups');
 const moduleRoute='#'+new URLSearchParams({view:'ontology',node:JSON.stringify(['umf','module'])});const moduleNode=page.getByRole('link',{name:'Inspect record Module · unchanged',exact:true});await moduleNode.focus();await moduleNode.press('Enter');await page.locator('#ontology-detail h3').filter({hasText:/^Module$/}).waitFor();assert(new URL(page.url()).hash===moduleRoute,'Keyboard node missing route');await assertFullGraph('Selecting a node');await page.reload();await page.locator('#ontology-detail h3').filter({hasText:/^Module$/}).waitFor();await page.goBack();await page.locator('#ontology-detail h3').filter({hasText:/^Document$/}).waitFor();checks.push('Graph node keyboard activation, exact refresh and Back retain context');
 await page.locator('.ontology-connections summary').click();await page.getByRole('button',{name:'1. modules',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^Connection: Document$/}).waitFor();assert(await page.locator('#ontology-detail').getByRole('link',{name:'Module',exact:true}).getAttribute('href')===moduleRoute,'Connection target link wrong');await page.getByRole('combobox',{name:'Focus record'}).selectOption(JSON.stringify(['umf','element']));await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();assert(!new URL(page.url()).hash.includes('edge='),'Old connection retained after selecting a different type');await page.getByRole('complementary',{name:'UMF language definitions'}).getByText(/^Records ·/).click();await page.getByRole('complementary',{name:'UMF language definitions'}).getByRole('link',{name:'Module',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^Module$/}).waitFor();checks.push('Labeled graph connections expose their source and navigable target');
 await page.getByRole('button',{name:'Show full model',exact:true}).click();await assertFullGraph('Full graph');await page.reload();await page.locator('#ontology-detail h3').filter({hasText:/^Module$/}).waitFor();await assertFullGraph('Full graph after refresh');
 const elementFocus=JSON.stringify(['umf','element']);await page.getByRole('combobox',{name:'Focus record'}).selectOption(elementFocus);await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();await assertNeighborhood(elementFocus,'Explicit neighborhood');await page.reload();await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();await assertNeighborhood(elementFocus,'Explicit neighborhood after refresh');
 await page.getByRole('button',{name:'Show full model',exact:true}).click();await page.waitForFunction(()=>!location.hash.includes('focus='));await page.reload();await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();await assertFullGraph('Full model retained after refresh');checks.push('Selection keeps the full model; exact explicit neighborhood and full-model routes survive refresh');
 await page.getByRole('combobox',{name:'Focus record'}).selectOption(elementFocus);await page.waitForFunction(()=>location.hash.includes('focus='));
 await page.locator('#ontology-detail').getByRole('link',{name:'scalarType',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^scalarType$/}).waitFor();assert(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('focus')===elementFocus,'Field link dropped explicit focus');await assertNeighborhood(elementFocus,'Field link');
 await page.locator('#ontology-detail').getByRole('link',{name:'Owned by Record Element',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();await assertNeighborhood(elementFocus,'Owner link');
 await page.setViewportSize({width:1440,height:900});await page.getByRole('combobox',{name:'Focus record'}).selectOption(JSON.stringify(['umf','semanticType']));await page.locator('#ontology-detail h3').filter({hasText:/^Semantic type reference$/}).waitFor();await page.getByRole('button',{name:'Fit graph',exact:true}).click();const zoom=()=>page.locator('.graph-zoom output').innerText().then(Number.parseFloat);const fitted=await zoom();await page.getByRole('button',{name:'Zoom in',exact:true}).click();const bigger=await zoom();assert(bigger>fitted,'Zoom in shrinks an isolated fitted node');await page.getByRole('button',{name:'Zoom out',exact:true}).click();assert(await zoom()<bigger,'Zoom out enlarges an isolated node');
 await page.getByRole('combobox',{name:'Focus record'}).selectOption(JSON.stringify(['umf','element']));await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();await page.getByRole('button',{name:'Fit graph',exact:true}).click();await page.getByRole('button',{name:'Show full model',exact:true}).click();await page.waitForFunction(()=>!location.hash.includes('focus='));checks.push('Explicit focus survives field and owner links; isolated-node zoom remains monotonic above 300%');
 await page.locator('#ontology-detail').getByRole('link',{name:'itemType',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^itemType$/}).waitFor();await page.locator('#ontology-detail').getByRole('link',{name:/Open generated object reference/}).click();await page.locator('#inspector h2').filter({hasText:/^itemType$/}).waitFor();assert(await page.locator('#inspector details[open]').count()===0,'Object disclosures start open');const text=await page.locator('#inspector').innerText();for(const word of ['array','map','module','element'])assert(text.includes(word),'itemType missing '+word);await page.goBack();await page.locator('#ontology-detail h3').filter({hasText:/^itemType$/}).waitFor();await page.goBack();await page.locator('#ontology-detail h3').filter({hasText:/^Element$/}).waitFor();await page.locator('#ontology-detail').getByRole('link',{name:'scalarType',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^scalarType$/}).waitFor();await page.locator('#ontology-detail').getByRole('link',{name:/Open generated object reference/}).click();await page.locator('#inspector h2').filter({hasText:/^scalarType$/}).waitFor();const scalarText=await page.locator('#inspector').innerText();assert(scalarText.includes('Any of: boolean'),'Known scalar values are unavailable');assert(scalarText.includes('Other nonempty strings are structurally accepted'),'Open string behavior is not summarized');checks.push('Field reference shows known scalar values and open-string behavior once');
 const elementEntry=JSON.stringify(['schema','spec/core/schema.json','']);await page.goto(origin+'reference/core.html#'+new URLSearchParams({view:'reference',entry:elementEntry,pointer:'/$defs/element',concept:'record'}));await page.locator('#inspector h2').filter({hasText:/^Record$/}).waitFor();const recordRules=await page.locator('#inspector').innerText();assert(!recordRules.includes('facets.length')&&!recordRules.includes('facets.precision'),'Record reference shows Field-only facet rules');await page.goto(origin+'reference/core.html#'+new URLSearchParams({view:'reference',entry:elementEntry,pointer:'/$defs/element/properties/scalarType',concept:'field'}));await page.locator('#inspector h2').filter({hasText:/^scalarType$/}).waitFor();const fieldRules=await page.locator('#inspector').innerText();assert(fieldRules.includes('facets.length.unit')&&fieldRules.includes('unicode-scalar')&&fieldRules.includes('byte'),'Field reference loses nested facet applicability paths');checks.push('Record and Field rules retain role-specific, fully qualified nested facet paths');
 await page.getByRole('navigation',{name:'Schema views'}).getByRole('link',{name:'Ontology',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^Document$/}).waitFor();await page.getByRole('complementary',{name:'UMF language definitions'}).getByText(/^Records ·/).click();await page.getByRole('complementary',{name:'UMF language definitions'}).getByRole('link',{name:'Semantic type reference',exact:true}).click();await page.locator('#ontology-detail h3').filter({hasText:/^Semantic type reference$/}).waitFor();await page.locator('#ontology-detail').getByRole('link',{name:/Open generated object reference/}).click();await page.locator('#inspector').getByRole('link',{name:'vocabulary',exact:true}).waitFor();checks.push('External semantic-term definition opens its own schema rather than Document');
 const yamlResponse=await page.request.get(origin+'reference/umf.yaml'),jsonResponse=await page.request.get(origin+'reference/umf.json');assert(yamlResponse.ok()&&jsonResponse.ok(),'Self-model download unavailable');const yaml=await yamlResponse.text(),json=await jsonResponse.text();assert(canonical(readDocument(yaml,'yaml'))===canonical(readDocument(json,'json')),'Download formats differ');checks.push('Downloaded YAML and JSON have identical valid UMF meaning');
 await page.goto(origin+'reference/core.html#view=ontology&node=unknown');
 await page.locator('#ontology h2').filter({hasText:'Ontology unavailable'}).waitFor();await page.getByRole('link',{name:'Open object reference',exact:true}).click();await page.locator('#inspector h2').filter({hasText:/^Document$/}).waitFor();checks.push('Unknown graph route fails visibly with working object-reference recovery');
 await page.getByRole('navigation',{name:'Schema views'}).getByRole('link',{name:'Model catalog',exact:true}).click();await page.getByRole('navigation',{name:'Schema views'}).getByRole('link',{name:'Model catalog',exact:true}).waitFor();const catalog=page.frameLocator('#model-catalog iframe');await catalog.locator('details').first().waitFor();assert(await catalog.locator('details[open]').count()===0,'Catalog groups start open');assert(await page.getByRole('navigation',{name:'Schema views'}).getByRole('link',{name:'Model catalog',exact:true}).getAttribute('aria-current')==='page','Catalog mode not current');await catalog.getByRole('searchbox',{name:/Find a schema or definition/}).fill('UMF for UMF');await catalog.getByRole('button').filter({hasText:'UMF for UMF'}).first().click();await catalog.getByRole('heading',{name:'UMF for UMF',exact:true}).waitFor();await page.screenshot({path:join(evidence,'catalog-to-ontology.png'),fullPage:true});checks.push('Model catalog starts with groups closed and finds the authored self-model example');
 await page.getByRole('navigation',{name:'Schema views'}).getByRole('link',{name:'Object reference',exact:true}).click();await page.locator('#inspector h2').filter({hasText:/^Document$/}).waitFor();await page.getByRole('navigation',{name:'Schema views'}).getByRole('link',{name:'Ontology',exact:true}).click();await page.locator('#ontology-detail h3').waitFor();checks.push('All three Schema views navigate through the same visible controls');
 for(const width of [390,798,1280]){await page.setViewportSize({width,height:960});await ontology('#'+new URLSearchParams({view:'ontology',node:JSON.stringify(['umf','element.scalarType'])}));assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Ontology document overflow '+width);await page.screenshot({path:join(evidence,'field-'+width+'.png'),fullPage:true});if(width===390){await page.locator('#ontology-map').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'mobile-graph-viewport.png')});}}checks.push('390/798/1280px screenshots and containment; graph/table scrolling stays local');
 await page.goto(origin+'reference/workbench.html');await page.locator('#load-status').filter({hasText:'assets verified'}).waitFor();await page.locator('#source').waitFor();await page.waitForFunction(()=>!document.getElementById('run')?.hasAttribute('disabled'));
 await page.locator('#open-file').setInputFiles({name:'umf.yaml',mimeType:'application/yaml',buffer:Buffer.from(yaml)});await page.waitForFunction((length:number)=>(document.getElementById('source') as HTMLTextAreaElement)?.value.length===length,yaml.length);await page.locator('#run').click();await page.locator('#run-status').filter({hasText:'Completed'}).waitFor();assert(parseYaml(await page.locator('#output pre').first().innerText()).valid===true,'Self-model fails browser validation');await page.locator('#source-json').click();await page.waitForFunction(()=>document.getElementById('source-json')?.getAttribute('aria-pressed')==='true');assert(canonical(readDocument(await page.locator('#source').inputValue(),'json'))===canonical(readDocument(yaml,'yaml')),'Workbench toggle changes self-model');checks.push('Actual self-model validates in browser workbench and survives YAML/JSON conversion');
 await page.route('**/metamodel.json',route=>route.fulfill({body:'{}',contentType:'application/json'}));await page.goto(origin+'reference/core.html');await page.locator('#ontology').getByText(/REFERENCE_INTEGRITY changed metamodel.json/).waitFor();await page.getByRole('link',{name:'Open object reference',exact:true}).click();await page.locator('#inspector h2').filter({hasText:/^Document$/}).waitFor();await page.unroute('**/metamodel.json');checks.push('Tampered self-model asset is refused with usable object-reference recovery');
 await assertRelationshipRoutes();checks.push('Every projected relationship identity navigates to its exact authored edge');
 assert(errors.length===0,'Page errors '+errors.join(';'));assert(external.length===0,'Unexpected external requests '+external.join(';'));
 const receipt={target:origin,browserVersion:browser.version(),checks,passed:checks.length,pageErrors:errors,unexpectedExternalRequests:external};await Bun.write(join(evidence,'verification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}catch(error){await page.screenshot({path:join(evidence,'failure.png'),fullPage:true});throw error;}finally{await browser.close();server?.stop(true);}
