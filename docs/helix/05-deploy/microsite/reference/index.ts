import {search,schemaNode,resolveSchema,propertyPresence,shape,type ReaderCatalog,type Entry,type ReferenceIndex,type Summary} from '../../reference/model';
import {mountWorkbench} from './workbench';
import {schemaReader,apiReader,readerRoute} from './reader-view';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const digest=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
let manifest:any,index:ReferenceIndex,reader:ReaderCatalog,exampleYaml='';const loaded=new Map<string,Entry>();
export async function verified(path:string):Promise<ArrayBuffer>{
 if(!/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(path)||path.includes('..'))throw Error('REFERENCE_INPUT invalid asset path');
 const expected=manifest.outputs.find((o:any)=>o.path===path);if(!expected)throw Error('REFERENCE_INTEGRITY unlisted asset '+path);
 const response=await fetch(new URL(path,location.href),{redirect:'error',credentials:'omit'});if(!response.ok)throw Error('REFERENCE_INTEGRITY unavailable '+path);const bytes=await response.arrayBuffer();if(bytes.byteLength!==expected.bytes||await digest(bytes)!==expected.sha256)throw Error('REFERENCE_INTEGRITY changed '+path);return bytes;
}
export const decode=(bytes:ArrayBuffer)=>new TextDecoder().decode(bytes);
export async function getEntry(id:string):Promise<Entry>{
 if(loaded.has(id))return loaded.get(id)!;const row=index.entries.find(e=>e.id===id);if(!row)throw Error('REFERENCE_LINK unknown entry');const bytes=await verified(row.href);if(await digest(bytes)!==row.sha256)throw Error('REFERENCE_INTEGRITY index/detail disagreement');const e=JSON.parse(decode(bytes)) as Entry;if(e.id!==id)throw Error('REFERENCE_INTEGRITY entry identity');loaded.set(id,e);return e;
}
export function element(tag:string,text?:string,className?:string){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
export function link(text:string,href:string,className?:string){const el=element('a',text,className) as HTMLAnchorElement;el.href=href;return el;}
export function pre(value:unknown){return element('pre',typeof value==='string'?value:JSON.stringify(value,null,2));}
export function download(name:string,bytes:BlobPart,media='text/plain'){const url=URL.createObjectURL(new Blob([bytes],{type:media}));const a=link(name,url) as HTMLAnchorElement;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function route(id:string,pointer=''){return '#'+new URLSearchParams({entry:id,...(pointer?{pointer}:{})});}
function section(parent:HTMLElement,title:string){parent.append(element('h3',title));}
function facts(parent:HTMLElement,values:[string,string][]) {const wrap=element('div',undefined,'status-grid');for(const[label,value]of values){const cell=element('div');cell.append(element('span',label),element('strong',value));wrap.append(cell);}parent.append(wrap);}
async function sources(parent:HTMLElement,records:any[]){const wrap=element('div',undefined,'source-links');for(const s of records){const a=link('↓ '+s.path.split('/').at(-1),'#');a.title=s.path+' · SHA-256 '+s.sha256;a.addEventListener('click',async ev=>{ev.preventDefault();try{download(s.path.split('/').at(-1)!,await verified('sources/'+s.sha256));}catch(e){wrap.append(element('p',String(e),'callout warning'));}});wrap.append(a);}parent.append(wrap);}
function prose(parent:HTMLElement,body:string){for(const block of body.split(/\n\s*\n/)){if(!block.trim())continue;const heading=/^(#{1,3})\s+([\s\S]+)$/.exec(block);parent.append(heading?element('h3',heading[2]):element('p',block));}}
export async function show(e:Entry,pointer='',conceptKey=''){
 const parent=element('div');
 if(e.kind==='schema'){
  const concept=conceptKey?reader.concepts.find(c=>c.key===conceptKey):undefined;if(conceptKey&&!concept)throw Error('REFERENCE_LINK unknown concept');
  if(concept&&pointer!==concept.pointer&&!pointer.startsWith(concept.pointer+'/properties/'))throw Error('REFERENCE_LINK concept/pointer mismatch');
  schemaReader(parent,e,pointer,reader,concept,exampleYaml);
 }else if(e.kind==='api'){
  const row=reader.api.find(a=>a.id===e.id);if(!row)throw Error('REFERENCE_LINK missing API documentation');
  const doc=JSON.parse(decode(await verified(row.href)));apiReader(parent,e,doc,reader);
 }else parent.append(element('span',e.kind,'entry-kind'),element('h2',e.title),element('p',e.summary,'intro'));
 if(e.kind==='extension'){
  const m=e.data.manifest;facts(parent,[['Extension version',e.data.version],['Registration',e.data.registration.mode],['Validation declaration',m.capabilities.validation]]);
  parent.append(element('p',m.semantics,'callout'));section(parent,'Participation');parent.append(element('p','Scopes: '+m.scopes.join(', ')),element('p','Declared directions: '+(m.capabilities.directions.join(', ')||'Metadata only; no native interchange direction declared.')));
  if(m.capabilities.native){section(parent,'Native declaration');parent.append(element('p',m.capabilities.native.system+' · '+m.capabilities.native.version),element('p',m.capabilities.native.subset));}
  if(e.data.registration.mode==='unmapped')parent.append(element('p','Runtime registration has not been mapped in this reference. This does not remove the package or establish validation availability.','callout warning'));
  parent.append(element('p','Declarations describe capabilities. Follow an integration record for observed test outcomes.','quiet'));
 }
 if(e.kind==='integration'){
  const op=e.data.operation;facts(parent,[['Declared operation',op.kind],['Recorded observations',e.data.evidence.length?e.data.evidence.map((r:any)=>r.outcome).join(' / '):'Unassessed'],['Source correspondence',e.data.correspondence]]);
  section(parent,'Version and subset');parent.append(element('p',op.sourceSystem+' → '+op.targetSystem),element('p',op.subset,'callout'));
  for(const l of op.limitations)parent.append(element('p',l,'quiet'));
  if(op.runtime.availability==='browser')parent.append(link('Try this operation →','workbench.html#'+new URLSearchParams({operation:op.id}),'button'));
  if(!e.data.evidence.length)parent.append(element('p','No test record is allocated to this declaration. Evidence file existence is not a support claim.','callout warning'));
  for(const r of e.data.evidence){const card=element('section',undefined,'evidence');card.append(element('h3',r.id));facts(card,[['Recorded outcome',r.outcome],['Source correspondence',r.correspondence],['Dependency closure',r.closureComplete?'Complete':'Incomplete / unknown']]);card.append(element('p',r.scope));await sources(card,[r.source]);for(const [k,v]of Object.entries(r.versions))card.append(element('p',k+': '+v,'quiet'));for(const l of r.limitations)card.append(element('p',l,'quiet'));const details=element('details');details.append(element('summary','Original observation and provenance'),pre(r));card.append(details);parent.append(card);}
 }
 if(e.kind==='example'){parent.append(link('Open this example →','workbench.html#'+new URLSearchParams({example:JSON.parse(e.id)[1]}),'button'));section(parent,'Checked original inputs');await sources(parent,e.data.inputs);}
 if(e.kind==='guide')prose(parent,e.data.body);
 if(e.links.length){section(parent,'Related definitions and operations');const chips=element('div',undefined,'chips');for(const id of e.links){const row=index.entries.find(r=>r.id===id);if(row){const destination=({schema:'core',extension:'extensions',api:'api',integration:'integrations',example:'examples',guide:'index'} as Record<string,string>)[row.kind];chips.append(link(row.title,destination+'.html'+route(id),'chip'));}}parent.append(chips);}
 const sourceDetails=element('details');sourceDetails.append(element('summary','Sources and provenance'));await sources(sourceDetails,e.sources);parent.append(sourceDetails);
 const details=element('details');details.append(element('summary','Machine-readable reference record'),pre(e));parent.append(details);return parent;
}
async function start(){
 const expected=JSON.parse($('reference-integrity').textContent!).sha256;const response=await fetch('manifest.json',{redirect:'error',credentials:'omit'});if(!response.ok)throw Error('REFERENCE_INTEGRITY missing manifest');const bytes=await response.arrayBuffer();if(await digest(bytes)!==expected)throw Error('REFERENCE_INTEGRITY manifest');manifest=JSON.parse(decode(bytes));if(manifest.profile!=='umf.reference.manifest/1')throw Error('REFERENCE_PROTOCOL manifest version');index=JSON.parse(decode(await verified('index.json')));if(index.profile!=='umf.reference/1')throw Error('REFERENCE_PROTOCOL index version');const readyMessage='Source-bound reference · '+index.entries.length+' entries · assets verified on use';
 const view=location.pathname.split('/').at(-1)?.replace('.html','')??'index';if(view==='workbench'){await mountWorkbench(index.entries,getEntry,verified);$('load-status').textContent=readyMessage;return;}
 reader=JSON.parse(decode(await verified('reader.json')));if(reader.profile!=='umf.reference.reader/1')throw Error('REFERENCE_PROTOCOL reader version');
 exampleYaml=decode(await verified('example.yaml'));
 const latest=await getEntry(reader.latest.id);
 const kinds:Record<string,string>={core:'schema',extensions:'extension',integrations:'integration',api:'api',examples:'example',index:'guide'};let limit=50,keyboardNavigation=false;
 type Choice={id:string;title:string;summary:string;pointer?:string;concept?:string};
 const allConcepts:Choice[]=reader.concepts.map(c=>({id:reader.latest.id,title:c.title,summary:c.description,pointer:c.pointer,concept:c.key}));
 const propertyChoices:Choice[]=[];
 for(const c of reader.concepts){const node=resolveSchema(latest.data.sourceData,schemaNode(latest.data.sourceData,c.pointer));for(const [key,value]of Object.entries(node.members?.properties?.members??{})){
  if(propertyPresence(node,key,c.role).startsWith('Not allowed'))continue;
  propertyChoices.push({id:reader.latest.id,title:c.title+' → '+key,summary:(reader.propertyText[key]??'')+' '+shape(latest.data.sourceData,value),pointer:c.pointer+'/properties/'+key,concept:c.key});
 }}
 const tasks=['Read and validate','Inspect and select','Author and edit','Serialize','Import and export','Extensions','Other APIs','All exports'];
 const task=$<HTMLSelectElement>('task-filter'),kind=$<HTMLSelectElement>('kind-filter');
 if(view==='api'){for(const name of tasks){const o=element('option',name) as HTMLOptionElement;o.value=name;task.append(o);}for(const name of ['All kinds',...new Set(reader.api.map(a=>a.kind))]){const o=element('option',name) as HTMLOptionElement;o.value=name;kind.append(o);}}
 const matchesWords=(text:string,q:string)=>q.toLowerCase().trim().split(/\s+/).filter(Boolean).every(word=>text.toLowerCase().includes(word));
 const refresh=()=>{
  const selected=new URLSearchParams(location.hash.slice(1)),query=$<HTMLInputElement>('search').value;
  let matches:Choice[];
  if(view==='core')matches=query?[...allConcepts,...propertyChoices].filter(c=>matchesWords(c.title+' '+c.summary,query)):allConcepts;
  else if(view==='api')matches=reader.api.filter(a=>(query||task.value==='All exports'||a.task===task.value)&&(kind.value==='All kinds'||a.kind===kind.value)&&matchesWords(a.title+' '+a.summary+' '+a.kind,query)).sort((a,b)=>Number(b.title==='readDocument')-Number(a.title==='readDocument')||a.title.localeCompare(b.title)).map(a=>({...a,summary:a.kind+' · '+a.task+' · '+a.summary}));
  else matches=search(index.entries,query,kinds[view] as any);
  $('catalog-count').textContent=matches.length+' entries'+(matches.length>limit?' · showing '+limit:'');$('catalog').replaceChildren();
  if(!matches.length)$('catalog').append(element('p','No matches. Try a key, value, concept or exact API name.','empty'));
  for(const choice of matches.slice(0,limit)){const b=element('button',undefined,'entry-button') as HTMLButtonElement;b.append(element('span',choice.title),element('small',choice.summary.slice(0,170)));if(selected.get('entry')===choice.id&&(view!=='core'||selected.get('concept')===choice.concept))b.setAttribute('aria-current','true');b.onclick=(event)=>{keyboardNavigation=event.detail===0;location.hash=readerRoute(choice.id,choice.pointer??'',choice.concept??'');};$('catalog').append(b);}
  $('more').hidden=matches.length<=limit;return matches;
 };
 let navigation=0;
 const changed=async()=>{const current=++navigation;const params=new URLSearchParams(location.hash.slice(1)),id=params.get('entry');if(view==='api'&&id){const selected=reader.api.find(a=>a.id===id);if(selected){task.value=selected.task;kind.value='All kinds';const searchInput=$<HTMLInputElement>('search');if(!matchesWords(selected.title+' '+selected.summary,searchInput.value))searchInput.value='';}}refresh();if(id)try{let selected=await getEntry(id);if(current!==navigation)return;if(view==='core'&&selected.kind==='schema'&&selected.data.profileVersions.length&&selected.id!==reader.latest.id){location.replace(readerRoute(reader.latest.id,params.get('pointer')??'',params.get('concept')??''));return;}const rendered=await show(selected,params.get('pointer')??'',params.get('concept')??'');if(current!==navigation)return;$('inspector').replaceChildren(...Array.from(rendered.childNodes));if(keyboardNavigation){const heading=$('inspector').querySelector('h2');heading?.setAttribute('tabindex','-1');(heading as HTMLElement)?.focus();keyboardNavigation=false;}}catch(error){if(current!==navigation)return;$('inspector').replaceChildren(element('h2','Reference unavailable'),element('p',String(error),'callout warning'),link('Open Document',readerRoute(reader.latest.id)));}};
 $('search').oninput=()=>{limit=50;refresh();};task.onchange=kind.onchange=()=>{limit=50;refresh();};$('more').onclick=()=>{limit+=50;refresh();};window.addEventListener('hashchange',()=>void changed());
 if(!location.hash){const first=view==='core'?allConcepts[0]:refresh()[0];if(first)history.replaceState(null,'',readerRoute(first.id,first.pointer??'',first.concept??''));}await changed();
 $('load-status').textContent=readyMessage;
}
void start().catch(error=>{$('load-status').textContent=String(error);$('load-status').className='callout warning';document.querySelectorAll('button').forEach(b=>b.disabled=true);});
