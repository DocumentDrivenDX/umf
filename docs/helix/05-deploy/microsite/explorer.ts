import {displayLabel,numericLexeme} from './presentation';
import {parseDocument,stringify} from 'yaml';
import {clearDownloads,renderDownloads} from './download-view';
import {ontologyModel,renderOntology} from './ontology-view';
import {parseEntry,key,matches,type Entry,type Parsed,type Definition} from './explorer-model';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const catalog=$('catalog'), inspector=$('inspector'), status=$('status');
let downloadUrl:string|undefined;
const tableObservers:ResizeObserver[]=[];
let entries:Entry[]=[], selected:Entry|undefined, parsed:Parsed|undefined, definition:Definition|undefined;
const search=$<HTMLInputElement>('search'),category=$<HTMLSelectElement>('category');
function node(tag:string,text?:string,className?:string):HTMLElement {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function json(value:unknown){return stringify(value,{aliasDuplicateObjects:false,lineWidth:0}).trimEnd();}
function raw(parent:HTMLElement,title:string,value:unknown,open=false){const d=node('details',undefined,'raw-content') as HTMLDetailsElement;d.open=open;d.append(node('summary',title),node('pre',typeof value==='string'?value:json(value)));parent.append(d);}
function schemaSource(){const source=selected!;raw(inspector,'Schema · YAML',parseDocument(source.text,{intAsBigInt:true}).toString({collectionStyle:'block',lineWidth:0}));raw(inspector,'Original schema source',source.text);}
function block(title:string){const b=node('section',undefined,'detail-block');b.append(node('h3',title));inspector.append(b);return b;}
function route(entry:Entry,d?:Definition){document.body.classList.remove('catalog-open');location.hash=new URLSearchParams({schema:entry.id,...(d?{definition:d.key}:{})}).toString();}
function reference(ref:unknown):HTMLElement {
 if(!ref||typeof ref!=='object')return node('span',json(ref));
 const r=ref as Record<string,unknown>,target=parsed?.definitions.find(d=>d.key===key(String(r.module),String(r.element)));
 if(!target)return node('span',`${String(r.module)} / ${String(r.element)} · unresolved`,'unresolved');
 const a=node('a',target.title,'ref-link') as HTMLAnchorElement;a.href='#'+new URLSearchParams({schema:selected!.id,definition:target.key});return a;
}
function properties(parent:HTMLElement,value:Record<string,unknown>,omit:string[]){
 const list=node('dl',undefined,'schema-properties'),structured:HTMLElement[]=[];
 for(const [k,v] of Object.entries(value)){if(omit.includes(k))continue;const token=numericLexeme(v);
  if(v!==null&&typeof v==='object'&&token===undefined){const d=node('details',undefined,'raw-content structured-metadata');const size=Array.isArray(v)?`${v.length} items`:`${Object.keys(v).length} properties`;d.append(node('summary',displayLabel(k)+' · '+size),node('pre',json(v)));structured.push(d);continue;}
  const group=node('div'),label=node('dt',displayLabel(k));label.title=k;group.append(label,node('dd',token??(typeof v==='string'?v:json(v))));list.append(group);
 }if(list.children.length)parent.append(list);parent.append(...structured);
}
function references(parent:HTMLElement,value:Record<string,unknown>){for(const k of ['itemType','valueType'])if(value[k]){const p=node('p',k+': ');p.append(reference(value[k]));parent.append(p);}for(const ref of (Array.isArray(value.references)?value.references:[])){const p=node('p',`${String(ref.role)}: `);p.append(reference(ref));parent.append(p);}}
const packViews=new Map<string,Parsed>();
const expandedGroups=new Map<string,boolean>();
function packFor(entry:Entry){return entries.find(e=>e.id.startsWith('pack:')&&e.pack===entry.pack&&e.packVersion===entry.packVersion);}
function packView(entry:Entry){let view=packViews.get(entry.id);if(!view){view=parseEntry(entry);packViews.set(entry.id,view);}return view;}
const titleCase=displayLabel;
function definitionLink(entry:Entry,def:Definition,label=def.title){const a=node('a',label,'ref-link') as HTMLAnchorElement;a.href='#'+new URLSearchParams({schema:entry.id,definition:def.key});return a;}
function catalogButton(entry:Entry,def?:Definition){const button=node('button',def?displayLabel(def.title):(entry.id.startsWith('pack:')?'Overview':displayLabel(entry.title)),'catalog-item');button.setAttribute('type','button');if(entry===selected&&(!def?!definition:def.key===definition?.key))button.setAttribute('aria-current','true');button.title=def?def.id:entry.title;button.append(node('small',def?def.id:entry.id.startsWith('pack:')?'Pack overview':entry.schemaFormat==='artifact-collection'?'Artifact collection':entry.schemaFormat==='umf'?'Ontology':entry.title));button.onclick=()=>route(entry,def);return button;}
function group(parent:HTMLElement,label:string,id:string,forceOpen=false){const d=node('details',undefined,'catalog-group') as HTMLDetailsElement;d.open=forceOpen||(expandedGroups.get(id)??(!id.endsWith(':types')&&!entries.some(e=>e.id===id&&e.id.startsWith('pack:'))));d.append(node('summary',label));d.addEventListener('toggle',()=>expandedGroups.set(id,d.open));parent.append(d);return d;}
function renderCatalog(){
 catalog.replaceChildren();const query=search.value.trim(),visible=(entry:Entry)=>(category.value==='all'||entry.category===category.value)&&matches(entry,query);let count=0;
 const packs=entries.filter(e=>e.id.startsWith('pack:'));
 if(category.value==='all'||category.value==='domain'){
  const domains=node('section',undefined,'catalog-section');domains.append(node('h3','Domain packs'));
  for(const pack of packs){const children=entries.filter(e=>!e.id.startsWith('pack:')&&packFor(e)===pack);const packMatch=matches(pack,query);const schemas=children.filter(e=>packMatch||matches(e,query));const types=packView(pack).definitions.filter(d=>!query||`${d.title} ${displayLabel(d.title)} ${json(d.value)}`.toLowerCase().includes(query.toLowerCase()));if(!packMatch&&!schemas.length&&!types.length)continue;
   const current=selected&&packFor(selected)===pack;const parent=group(domains,`${titleCase(pack.title)} · ${pack.packVersion??'version not declared'}`,pack.id,!!current||!!query);parent.dataset.pack=pack.id;parent.append(catalogButton(pack));count++;
   for(const [label,items] of [['Tables',schemas.filter(e=>e.schemaFormat==='tablespec')],['Ontology',schemas.filter(e=>e.schemaFormat==='umf')],['Documents',schemas.filter(e=>e.schemaFormat==='artifact-collection'&&JSON.parse(e.text).view==='documents')],['Imaging',schemas.filter(e=>e.schemaFormat==='artifact-collection'&&JSON.parse(e.text).view==='imaging')],['Other artifacts',schemas.filter(e=>e.schemaFormat==='artifact-collection'&&JSON.parse(e.text).view==='other')],['Other schemas',schemas.filter(e=>!['umf','tablespec','artifact-collection'].includes(e.schemaFormat??''))]] as const){if(items.length){const container=['Documents','Imaging','Other artifacts'].includes(label)?(Array.from(parent.children).find(e=>e.getAttribute('data-artifacts')==='true') as HTMLElement??(()=>{const a=group(parent,'Artifacts',pack.id+':artifacts',!!current||!!query);a.setAttribute('data-artifacts','true');return a;})()):parent;const section=group(container,label,pack.id+':'+label,!!current||!!query);for(const entry of items){section.append(catalogButton(entry));count++;}}}
   if(types.length){const section=group(parent,'Domain types',pack.id+':types',selected===pack&&!!definition||!!query);for(const def of types){section.append(catalogButton(pack,def));count++;}}
  }if(domains.querySelector('details'))catalog.append(domains);
 }
 for(const [label,filter] of [['Examples',(e:Entry)=>e.category==='example'],['Local files',(e:Entry)=>e.category==='local'],['Other schemas',(e:Entry)=>e.category==='domain'&&!packFor(e)]] as const){const shown=entries.filter(e=>filter(e)&&visible(e));if(!shown.length)continue;const section=node('section',undefined,'catalog-section');section.append(node('h3',label));for(const entry of shown){section.append(catalogButton(entry));count++;}catalog.append(section);}
 $('count').textContent=String(count);if(!count)catalog.append(node('p',category.value==='domain'&&!packs.length?'Domain packs have not been added to this catalog yet. Open a local schema to inspect it.':'No matching schemas. Try another search.','catalog-empty'));
 const active=catalog.querySelector<HTMLElement>('[aria-current="true"]'),host=matchMedia('(max-width:1050px)').matches?catalog:catalog.closest('aside');
 if(active&&host){const item=active.getBoundingClientRect(),bounds=host.getBoundingClientRect();if(item.top<bounds.top||item.bottom>bounds.bottom)host.scrollTop+=item.top-bounds.top-40;}
}
function breadcrumbs(){
 if(!selected)return;const nav=node('nav',undefined,'breadcrumbs');nav.setAttribute('aria-label','Breadcrumb');const pack=packFor(selected);
 function crumb(el:HTMLElement){if(nav.children.length)nav.append(node('span','›'));nav.append(el);}
 if(pack){crumb(schemaLink(pack.id,`${titleCase(pack.title)} · ${pack.packVersion}`));if(selected===pack){crumb(node('span',definition?'Domain types':'Overview'));if(definition)crumb(node('span',titleCase(definition.title)));}else{crumb(node('span',selected.schemaFormat==='umf'?'Ontology':selected.schemaFormat==='artifact-collection'?'Artifacts':'Tables'));crumb(schemaLink(selected.id,titleCase(selected.title)));if(definition)crumb(node('span',titleCase(definition.title)));}}
 else{crumb(node('span',selected.category==='example'?'Examples':selected.category==='local'?'Local files':'Schemas'));crumb(schemaLink(selected.id,titleCase(selected.title)));if(definition)crumb(node('span',titleCase(definition.title)));}
 const last=nav.lastElementChild;if(last)last.setAttribute('aria-current','page');inspector.append(nav);
}
function domainTypeLink(type:string){const pack=selected&&packFor(selected);const def=pack&&packView(pack).definitions.find(d=>d.id===type);return pack&&def?definitionLink(pack,def):node('span',`${type} · not declared in this pack`,'unresolved');}

function render(){
 for(const observer of tableObservers.splice(0))observer.disconnect();clearDownloads();if(downloadUrl)URL.revokeObjectURL(downloadUrl);
 inspector.replaceChildren();if(!selected||!parsed)return;breadcrumbs();workspaceActions();const header=node('div',undefined,'inspector-toolbar');header.append(...Array.from(inspector.children));inspector.append(header);renderDownloads(inspector,selected,parsed);
 if(parsed.native){renderNative();enhanceTables();return;}
 const doc=parsed.document!,top=node('div',undefined,'detail-top'),title=node('div');title.append(node('span',selected.category==='domain'?'Domain pack':'Example','tag'),node('h2',displayLabel(selected.title)),node('p',doc.id,'schema-id'));top.append(title);
 const download=node('a','Download source','button secondary') as HTMLAnchorElement;download.href=downloadUrl=URL.createObjectURL(new Blob([selected.text],{type:'text/plain'}));download.download=selected.path.split('/').pop()??'schema.json';download.onclick=()=>setTimeout(()=>URL.revokeObjectURL(download.href),1000);top.append(download);inspector.append(top);renderFamily();
 const stats=node('div',undefined,'stats');for(const text of [`UMF ${doc.umf}`,`${doc.modules.length} modules`,`${parsed.definitions.length} definitions`])stats.append(node('span',text,'tag'));inspector.append(stats);
 inspector.append(node('p',`Source: ${selected.path}`,'schema-id'));
 if(selected.description)inspector.append(node('p',selected.description));
 const notice=node('div',`${parsed.valid?'Core structure valid':'Core structure invalid'} · ${parsed.complete?'All supplied content checked':'Some semantics are not interpreted'}. Inspection does not establish storage or runtime enforcement.`,'callout');inspector.append(notice);
 if(parsed.diagnostics)raw(inspector,'Validation and interpretation messages',parsed.diagnostics);
 if((selected.schemaFormat==='umf'||String(doc.title??'').includes('ontology'))&&ontologyModel(parsed).records.length){renderOntology(inspector,parsed,selected,entries,new URLSearchParams(location.hash.slice(1)));schemaSource();enhanceTables();return;}
 const nav=node('div',undefined,'definition-list');const overview=node('a','Overview') as HTMLAnchorElement;overview.href='#'+new URLSearchParams({schema:selected.id});if(!definition)overview.setAttribute('aria-current','true');nav.append(overview);
 for(const def of parsed.definitions){const a=node('a',def.title) as HTMLAnchorElement;a.href='#'+new URLSearchParams({schema:selected.id,definition:def.key});a.title=`${def.module} / ${def.id}`;if(def===definition)a.setAttribute('aria-current','true');nav.append(a);}inspector.append(nav);
 if(definition){const value=definition.value;inspector.append(node('h3',displayLabel(definition.title),'definition-heading'),node('p',`${definition.module} / ${definition.id} · ${definition.pointer}`,'schema-id'));if(value.description)inspector.append(node('p',String(value.description)));properties(inspector,value,['id','name','title','description','extensions','references','members','keys','itemType','valueType']);references(inspector,value);
 if(Array.isArray(value.members)){const b=block('Fields and members'),wrap=node('div',undefined,'table-wrap'),table=node('table',undefined,'details-table');const head=node('tr');for(const t of ['Definition','Type / shape','Availability'])head.append(node('th',t));table.append(head);
 for(const member of value.members){const ref=member.field??member;const target=parsed.definitions.find(d=>d.key===key(String(ref.module),String(ref.element)));const row=node('tr'),cell=node('td');cell.append(reference(ref));if(target?.value.description)cell.append(node('p',String(target.value.description),'field-description'));row.append(cell,node('td',target?`${target.value.scalarType??target.value.kind??'Not declared'} · ${target.value.cardinality??'shape unspecified'}`:'Unresolved'),node('td',String(target?.value.nullability??'Not declared')));table.append(row);}wrap.append(table);b.append(wrap);raw(b,'Original member declarations',value.members);}
 if(value.keys)raw(block('Keys'), 'Declared keys',value.keys,true);
 const related=doc.modules.flatMap(m=>Array.isArray(m.relationships)?m.relationships:[]).filter((r:any)=>[...(r.source??[]),...(r.target??[])].some((endpoint:any)=>key(endpoint.module,endpoint.element)===definition!.key));if(related.length)renderRelationships(related);
 if(value.extensions)raw(block('Extensions · retained payloads'),'Inspect extension content',value.extensions,true);raw(inspector,'Original definition',value);
 }else{
 for(const module of doc.modules){const b=block(String(module.title??module.namespace??module.id));b.append(node('p',`${module.id} · ${module.elements.length} definitions`,'schema-id'));if(module.extensions)raw(b,'Module extensions',module.extensions);if(Array.isArray(module.relationships)&&module.relationships.length)renderRelationships(module.relationships);}
 raw(block('Declared vocabularies'),'Versions and declarations',doc.vocabularies,true);if(doc.extensions)raw(inspector,'Document extensions',doc.extensions);
 }
 schemaSource();
}
function renderRelationships(relationships:any[]){const b=block('Relationships');for(const r of relationships){const d=node('details');d.append(node('summary',String(r.name??r.id)));for(const side of ['source','target']){const p=node('p',side+': ');for(const endpoint of r[side]??[]){p.append(reference(endpoint),document.createTextNode(' '));}d.append(p);}properties(d,r,['source','target']);b.append(d);}}
function schemaLink(id:string,title:string){const a=node('a',title.includes('.')?title:displayLabel(title),'ref-link') as HTMLAnchorElement;a.title=title;a.href='#'+new URLSearchParams({schema:id});return a;}
function renderFamily(){
 const owner=selected&&packFor(selected);if(!owner)return;
 const metadata=JSON.parse(owner.text),family=metadata.family;if(!family)return;
 const root=entries.find(e=>e.id===`pack:${family.id}@${family.version}`);
 const b=node('details',undefined,'family-context');b.append(node('summary','Medical family · '+family.label));inspector.append(b);
 if(root&&root!==owner){b.append(schemaLink(root.id,'Medical overview'));}
 const rootMetadata=root?JSON.parse(root.text):undefined;
 const members=[...(root?[{id:root.pack,version:root.packVersion,label:'Clinical'}]:[]),...(rootMetadata?.composition?.components??[])];
 for(const member of members){const target=entries.find(e=>e.id===`pack:${member.id}@${member.version}`),p=node('p');p.append(target?schemaLink(target.id,member.label):node('span',member.label+' · unavailable','unresolved'));p.append(node('span',` · ${member.id} ${member.version}`,'quiet'));if(target===owner)p.append(node('span',' · current','tag'));b.append(p);}
 b.append(node('p','Separate source namespaces and versions; no automatic patient matching or population joins.','quiet'));
}
function renderSources(){
 const owner=selected&&packFor(selected);if(!owner?.assets?.length)return;
 const metadata=JSON.parse(owner.text),b=block(selected===owner?'Sample data and originals':'Sample data');
 const rowIds=new Set((metadata.source_bindings??[]).filter((v:any)=>v.schema_id===selected!.title&&v.role==='rows').map((v:any)=>v.source_id));
 const assets=selected===owner?owner.assets:owner.assets.filter(a=>rowIds.has(a.id));
 for(const asset of assets){const p=node('p'),a=node('a',`Download ${asset.reference.split('/').pop()}`,'ref-link') as HTMLAnchorElement;a.href=asset.url;a.download=asset.reference.split('/').pop()!;p.append(a,node('span',` · ${asset.format} · ${asset.dataKind}`,'quiet'));b.append(p);}
 if(!assets.length)b.append(node('p','No row source is bound to this schema.'));
 if(selected!==owner)b.append(schemaLink(owner.id,'All sample data and originals'));
 b.append(node('p','Downloads contain the pinned sample bytes. Source notices and scope are retained in the pack overview.','quiet'));
}
function renderNative(){
 const source=parsed!.native!,heading=node('div',undefined,'detail-top');heading.append(node('h2',displayLabel(selected!.title)));inspector.append(heading,node('p',`${parsed!.label} · ${selected!.path}`,'schema-id'));
 renderFamily();
 if(source.description)inspector.append(node('p',String(source.description)));
 inspector.append(node('p',parsed!.diagnostics||'Source metadata inspection; native execution semantics are not certified.','callout'));
 const nav=node('div',undefined,'definition-list');const overview=schemaLink(selected!.id,source.table_name?'Table overview':'Overview');nav.append(overview);for(const def of (source.table_name?[]:parsed!.definitions)){const a=node('a',displayLabel(def.title)) as HTMLAnchorElement;a.href='#'+new URLSearchParams({schema:selected!.id,definition:def.key});if(def===definition)a.setAttribute('aria-current','true');nav.append(a);}inspector.append(nav);
 if(definition){const b=block(definition.title);b.append(node('p',definition.pointer,'schema-id'));if(definition.value.description)b.append(node('p',String(definition.value.description)));properties(b,definition.value,['description','domain_type']);if(typeof definition.value.domain_type==='string'){const p=node('p','Domain type: ');p.append(domainTypeLink(definition.value.domain_type));b.append(p);}raw(b,'Original definition metadata',definition.value,true);schemaSource();return;}
 if(selected!.schemaFormat==='artifact-collection'){renderArtifactCollection(source);raw(inspector,'Original collection metadata',selected!.text);return;}
 if(source.domain_types){
   properties(inspector,source,['domain_types','schemas','artifact_collections','description','scale_presets','source_bindings','sources',...(source.family?['family','composition','execution_profile','csv_conventions','fixture_counts','qualification']:[])]);
  if(source.family){const scope=block('Sample scope');for(const field of ['subset','limits'])if(typeof source.qualification?.[field]==='string')scope.append(node('p',source.qualification[field]));if(source.qualification)raw(scope,'Detailed source qualification',source.qualification);raw(scope,'Pack composition and execution metadata',{family:source.family,...(source.composition?{composition:source.composition}:{}),execution_profile:source.execution_profile,csv_conventions:source.csv_conventions,fixture_counts:source.fixture_counts});}
  for(const [field,label] of ([['scale_presets','Scale presets'],['source_bindings','Source bindings'],['sources','Source declarations']] as const))if(source[field])raw(inspector,label,source[field]);
  const b=block('Schemas in this pack');for(const declaration of source.schemas??[]){const target=entries.find(e=>e.pack===source.id&&e.packVersion===selected!.packVersion&&e.path===declaration.reference);const p=node('p');p.append(target?schemaLink(target.id,String(declaration.id)):node('span',`${declaration.id} · ${declaration.reference} · not bundled`,'unresolved'));p.append(node('span',` · ${declaration.format}`,'quiet'));b.append(p);}if(!source.schemas?.length)b.append(node('p','No schema references declared.'));
  if(source.artifact_collections?.length){const a=block('Artifact collections');for(const c of source.artifact_collections)a.append(schemaLink(`artifact:${source.id}@${selected!.packVersion}:${c.id}`,c.title));}
  b.classList.add('schema-directory');
  const types=block('Domain types');for(const [id,value] of Object.entries(source.domain_types)){const d=node('details');d.append(node('summary',id),node('pre',json(value)));types.append(d);}
 }else if(Array.isArray(source.columns)){
   const owner=packFor(selected!),targets=owner?JSON.parse(owner.text).execution_profile?.targets:undefined;
  const ontology=targets?.graph?.includes('ontology')&&entries.find(e=>e.id===`schema:${selected!.pack}@${selected!.packVersion}:ontology`);
  if(ontology&&targets.tabular?.includes(source.table_name)){const record=parseEntry(ontology).definitions.find(d=>d.id===source.table_name&&d.value.kind==='record');if(record){const a=node('a','View ontology record','ref-link') as HTMLAnchorElement;a.href='#'+new URLSearchParams({schema:ontology.id,definition:record.key});inspector.append(a);}}
  const b=block('Fields'),wrap=node('div',undefined,'table-wrap'),table=node('table',undefined,'details-table field-table'),head=node('tr');
  const hasDomain=source.columns.some((c:any)=>c.domain_type);if(!hasDomain)table.classList.add('without-domain');for(const label of ['Field','Type','Nullability','Description',...(hasDomain?['Domain type']:[])])head.append(node('th',label));table.append(head);
  const primary=new Set(source.primary_key??[]);
  for(const col of source.columns){const row=node('tr'),cell=node('td'),def=parsed!.definitions.find(d=>d.id===col.name);cell.append(def?definitionLink(selected!,def,col.name):node('code',col.name));if(primary.has(col.name))cell.append(node('span','Key','field-key'));row.append(cell,node('td',col.data_type),node('td',col.nullable===undefined?'Not declared':col.nullable?'Nullable':'Non-null'),node('td',col.description??'—'));if(hasDomain){const domain=node('td');domain.append(col.domain_type?domainTypeLink(col.domain_type):node('span','—'));row.append(domain);}table.append(row);}
  wrap.append(table);b.append(wrap);raw(b,'Original column metadata',source.columns);
  if(source.primary_key)raw(block('Primary key'),'Declared columns',source.primary_key,true);
  if(source.relationships){const r=block('Native relationships');for(const fk of source.relationships.foreign_keys??[]){const target=entries.find(e=>e.pack===selected!.pack&&e.packVersion===selected!.packVersion&&e.title===fk.references_table);const p=node('p',`${fk.column} → `);p.append(target?schemaLink(target.id,`${fk.references_table}.${fk.references_column}`):node('span',`${fk.references_table}.${fk.references_column} · not bundled`,'unresolved'));r.append(p);}raw(r,'Original relationship metadata',source.relationships);}
  properties(inspector,source,['columns','relationships','primary_key','description','table_name']);
 }else{const defs=source.$defs??source.definitions??{};const b=block('Definitions');for(const [id,value] of Object.entries(defs)){const d=node('details');d.append(node('summary',id),node('pre',json(value)));b.append(d);}raw(inspector,'Schema keywords',source,true);}
 renderSources();
 schemaSource();
 const a=node('a','Download source','button secondary') as HTMLAnchorElement;a.href=downloadUrl=URL.createObjectURL(new Blob([selected!.text],{type:'text/plain'}));a.download=selected!.path.split('/').pop()??'schema.json';a.onclick=()=>setTimeout(()=>URL.revokeObjectURL(a.href),1000);inspector.append(a);
}
function restore(){const params=new URLSearchParams(location.hash.slice(1)),id=params.get('schema');const entry=entries.find(e=>e.id===id)??entries.find(e=>e.aliases?.includes(id??''))??(!id?entries[0]:undefined);if(entry&&id&&entry.id!==id){params.set('schema',entry.id);history.replaceState(null,'','#'+params);}if(!entry){selected=undefined;parsed=undefined;inspector.replaceChildren(node('p','This schema is not in the catalog. Choose a schema from the catalog.','empty'));renderCatalog();return;}try{selected=entry;parsed=parseEntry(entry);definition=parsed.definitions.find(d=>d.key===params.get('definition'));render();renderCatalog();status.textContent=params.get('definition')&&!definition?'Definition not found; showing the schema overview.':[`${entries.filter(e=>e.id.startsWith('pack:')).length} domain pack${entries.filter(e=>e.id.startsWith('pack:')).length===1?'':'s'}`,`${entries.filter(e=>e.category==='domain'&&!e.id.startsWith('pack:')&&e.schemaFormat!=='artifact-collection').length} domain schemas`,`${entries.filter(e=>e.category==='example').length} example${entries.filter(e=>e.category==='example').length===1?'':'s'}`].join(' · ');}catch(error){parsed=undefined;inspector.replaceChildren(node('p','This schema could not be opened.','empty'),node('pre',String(error)));renderCatalog();status.textContent='Schema inspection refused; original source remains available.';raw(inspector,'Original schema source',entry.text);}}
search.oninput=()=>{document.body.classList.remove('inspector-focus');document.body.classList.add('catalog-open');const focus=document.querySelector<HTMLButtonElement>('.focus-toggle');if(focus){focus.textContent='Focus schema';focus.setAttribute('aria-pressed','false');}document.querySelector('.catalog-toggle')?.setAttribute('aria-expanded','true');renderCatalog();};category.onchange=renderCatalog;window.addEventListener('hashchange',()=>{restore();inspector.scrollIntoView({block:'start',behavior:'instant'});});
$<HTMLInputElement>('file').onchange=async event=>{const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>4_000_000)throw new Error('Schema exceeds the 4 MB local-file limit.');const entry:Entry={id:`local:${file.name}:${Date.now()}`,title:file.name,category:'local',path:file.name,text:await file.text(),format:/\.ya?ml$/i.test(file.name)?'yaml':'json'};parseEntry(entry);entries.push(entry);category.value='all';search.value='';route(entry);}catch(error){status.textContent=`Could not open local schema: ${String(error)}`;}finally{input.value='';}};
try{const response=await fetch('schema-catalog.json');if(!response.ok)throw new Error(`Catalog unavailable (${response.status})`);const data=await response.json();entries=data.entries;restore();}catch(error){status.textContent=String(error);catalog.append(node('p','Open a local schema to start exploring.','empty'));}

function renderArtifactCollection(collection:Record<string,any>){
 const owner=packFor(selected!);if(!owner)throw Error('Collection owner missing');const pack=JSON.parse(owner.text);
 const scope=block('Artifact semantics');properties(scope,collection,['source_ids','metadata_schema_ids','derived_schema_ids','ontology_schema_ids','description']);
 const originals=block('Declared artifacts');for(const id of collection.source_ids){const source=pack.sources?.[id];if(!source)throw Error('Unresolved collection source');const b=node('section');b.classList.add('artifact-source');b.append(node('h4',id));const badges=node('div',undefined,'stats');for(const text of [source.format??'Format undeclared','Redistribution: '+(source.license?.redistribution??'unknown'),source.data_kind??'Origin undeclared'])badges.append(node('span',text,'tag'));b.append(badges);properties(b,source,['format','data_kind']);const asset=owner.assets?.find(a=>a.id===id&&a.sha256===source.checksum?.value);if(asset&&source.license?.redistribution==='allowed'){const a=node('a','Download verified artifact','ref-link') as HTMLAnchorElement;a.href=asset.url;a.download=asset.reference.split('/').pop()!;b.append(a);}else b.append(node('p','No published original download. Source rights and availability remain as declared.','quiet'));originals.append(b);}
 if(!collection.source_ids.length)originals.append(node('p','No acquired artifacts declared; the inventory configures future acquisition.'));
 for(const [field,label] of ([['metadata_schema_ids','Metadata tables'],['derived_schema_ids','Derived representations'],['ontology_schema_ids','Ontology']] as const)){const b=block(label);for(const id of collection[field]??[]){const target=entries.find(e=>e.id===`schema:${selected!.pack}@${selected!.packVersion}:${id}`);b.append(target?schemaLink(target.id,id):node('p',id+' · unresolved'));}}
 if(collection.loader_inventory_source_id)raw(inspector,'Acquisition inventory declaration',pack.sources[collection.loader_inventory_source_id]);
}

function workspaceActions(){
 const actions=node('div',undefined,'workspace-actions');const browse=node('button','Browse catalog','secondary catalog-toggle');browse.setAttribute('type','button');browse.setAttribute('aria-controls','catalog');browse.setAttribute('aria-expanded',String(document.body.classList.contains('catalog-open')));browse.onclick=()=>{document.body.classList.toggle('catalog-open');const open=document.body.classList.contains('catalog-open');browse.setAttribute('aria-expanded',String(open));if(open)document.querySelector<HTMLButtonElement>('.catalog-close')?.focus();};
 const focus=node('button',document.body.classList.contains('inspector-focus')?'Show catalog':'Focus schema','secondary focus-toggle');focus.setAttribute('type','button');focus.setAttribute('aria-pressed',String(document.body.classList.contains('inspector-focus')));focus.onclick=()=>{document.body.classList.toggle('inspector-focus');focus.textContent=document.body.classList.contains('inspector-focus')?'Show catalog':'Focus schema';focus.setAttribute('aria-pressed',String(document.body.classList.contains('inspector-focus')));};actions.append(browse,focus);inspector.append(actions);
}
function enhanceTables(){
 for(const wrap of inspector.querySelectorAll<HTMLElement>('.table-wrap')){const table=wrap.querySelector('table');if(!table)continue;const hint=node('p','Scroll horizontally for more columns →','table-scroll-hint');wrap.after(hint);const update=()=>{hint.hidden=wrap.scrollWidth<=wrap.clientWidth+1;};const observer=new ResizeObserver(update);observer.observe(wrap);tableObservers.push(observer);requestAnimationFrame(update);wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Schema fields; scroll horizontally for all columns');
  const rows=Array.from(table.querySelectorAll('tr')).slice(1);if(rows.length<6)continue;const bar=node('div',undefined,'field-toolbar'),label=node('label','Filter fields'),input=document.createElement('input');input.type='search';input.placeholder='Field name, type or description…';input.setAttribute('aria-label','Filter fields');const count=node('span',`${rows.length} fields`,'quiet');input.oninput=()=>{let shown=0;for(const row of rows){row.hidden=!(row.textContent??'').toLowerCase().includes(input.value.trim().toLowerCase());if(!row.hidden)shown++;}count.textContent=`${shown} of ${rows.length} fields`;};label.append(input);bar.append(label,count);wrap.before(bar);
 }
}

document.querySelector('.page-top h1 br')?.replaceWith(document.createTextNode(' '));
const catalogClose=node('button','Close','secondary catalog-close');catalogClose.setAttribute('aria-label','Close catalog');catalogClose.onclick=()=>closeCatalog();document.querySelector('.catalog-heading')?.append(catalogClose);function closeCatalog(){document.body.classList.remove('catalog-open');const toggle=inspector.querySelector<HTMLButtonElement>('.catalog-toggle');toggle?.setAttribute('aria-expanded','false');toggle?.focus();}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const panel=document.querySelector<HTMLDetailsElement>('.export-panel[open]');if(panel){panel.open=false;panel.querySelector<HTMLElement>('summary')?.focus();}}if(!document.body.classList.contains('catalog-open')||!matchMedia('(max-width:1050px)').matches)return;if(e.key==='Escape'){closeCatalog();return;}if(e.key==='Tab'){const items=Array.from(document.querySelectorAll<HTMLElement>('.explorer-layout>aside button,.explorer-layout>aside summary,.explorer-layout>aside a')).filter(el=>el.getClientRects().length),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
