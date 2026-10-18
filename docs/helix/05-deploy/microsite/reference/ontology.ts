import {renderRecordMap} from '@documentdrivendx/umf-schema-browser';
import {selfModelGraph,type SelfModelCatalog,type ReaderCatalog} from '../../reference/model';
const el=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const link=(text:string,href:string)=>{const a=el('a',text) as HTMLAnchorElement;a.href=href;return a;};
export function showOntology(root:HTMLElement,catalog:SelfModelCatalog,reader:ReaderCatalog){
 const keyboardNavigation=root.dataset.keyboardNavigation==='true';delete root.dataset.keyboardNavigation;
 root.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')root.dataset.keyboardNavigation='true';};root.onpointerdown=()=>{delete root.dataset.keyboardNavigation;};
 root.replaceChildren();const params=new URLSearchParams(location.hash.slice(1));const id=params.get('node')??'document';
 const elements=catalog.document.modules.flatMap(m=>m.elements),records=elements.filter(e=>e.kind==='record'),selected=records.find(e=>e.id===id);
 if(!selected)throw Error('SELF_MODEL_LINK unknown type '+id);
 const route=(node:string)=>'#'+new URLSearchParams({view:'ontology',node});
 const reference=(record:any,pointer?:string)=>{const meta=record.extensions['umf.metamodel'];return '#'+new URLSearchParams({view:'reference',entry:meta.source.path==='spec/core/semantic-type-reference.schema.json'?JSON.stringify(['schema',meta.source.path,'']):reader.latest.id,pointer:pointer??meta.source.pointer,...(meta.concept?{concept:meta.concept}:{})});};
 const heading=el('h2','UMF ontology');root.append(heading,el('p','Follow the connections between documents, records and fields. Select a type or numbered connection, then open its object reference for valid keys and values. Arrows describe object properties, specialization and reference resolution.','intro'));
 const downloads=el('div',undefined,'chips');downloads.append(link('Download UMF model · YAML','umf.yaml'),link('JSON','umf.json'),link('Annotation vocabulary','../reference/sources/'+catalog.sources.find(s=>s.path==='spec/metamodel/package.json')!.sha256));root.append(downloads);
 const layout=el('div',undefined,'ontology-layout'),aside=el('aside',undefined,'ontology-types');aside.setAttribute('aria-label','UMF language types');const label=el('label','Find a type');const search=el('input') as HTMLInputElement;search.type='search';search.placeholder='Record, Field, Key…';label.append(search);aside.append(label);const list=el('div');aside.append(list);
 const refresh=()=>{list.replaceChildren();const found=records.filter(r=>(r.name+' '+r.description).toLowerCase().includes(search.value.toLowerCase()));for(const record of found){const a=link(record.name,route(record.id));if(record.id===id)a.setAttribute('aria-current','true');list.append(a);}if(!found.length)list.append(el('p','No matching types.'));};search.oninput=refresh;refresh();
 const content=el('div',undefined,'ontology-content'),map=el('div');map.id='ontology-map';content.append(map);layout.append(aside,content);root.append(layout);
 const graph=selfModelGraph(catalog);const focused=params.has('focus')?params.get('focus')!:JSON.stringify(['umf',id]);
 if(focused&&!graph.records.some(r=>r.id===focused))throw Error('SELF_MODEL_LINK unknown graph focus');
 renderRecordMap(map,graph,{focus:focused,onNavigate:(key,kind)=>{if(kind==='relationship'){const edge=graph.edges.find(e=>e.id===key);if(edge)location.hash=route(JSON.parse(edge.source)[1])+'&edge='+encodeURIComponent(key);}else location.hash=route(JSON.parse(key)[1]);},onFocusChange:(focus)=>{const next=new URLSearchParams(location.hash.slice(1));next.set('focus',focus);if(focus){next.delete('edge');next.set('node',JSON.parse(focus)[1]);location.hash=next.toString();}else history.replaceState(null,'','#'+next);}});
 map.append(el('p','Scroll the diagram sideways on narrow screens. The numbered connections below are also selectable.','table-hint'));
 const detail=el('section');detail.id='ontology-detail';detail.tabIndex=-1;content.append(detail);
 const edge=graph.edges.find(e=>e.id===params.get('edge'));if(params.has('edge')&&!edge)throw Error('SELF_MODEL_LINK unknown connection');
 if(edge){const p=el('p','Connection: '+graph.records.find(r=>r.id===edge.source)!.label+' → '+edge.label+' → ');p.append(link(graph.records.find(r=>r.id===edge.target)!.label,route(JSON.parse(edge.target)[1])));detail.append(p);}
 detail.append(el('h3',selected.name),el('p',selected.description),link('Open '+selected.name+' object reference →',reference(selected)));
 const meta=selected.extensions['umf.metamodel'];if(meta.specializes)detail.append(el('p','Role of Element: '+meta.role+'. The conditional rules for this role remain in the object reference.'));
 const table=el('table'),head=el('tr');for(const title of ['Key','Presence','Value shape'])head.append(el('th',title));table.append(head);
 for(const member of selected.members??[]){const f=elements.find(e=>e.id===member.element)!;const m=f.extensions['umf.metamodel'];const row=el('tr'),key=el('td');key.append(link(f.name,reference(selected,m.source.pointer)));const item=f.itemType?elements.find(e=>e.id===f.itemType.element):f;const target=item?.references?.find((r:any)=>r.role==='record-type');const type=target?records.find(r=>r.id===target.element)?.name:item?.scalarType??'See exact schema';row.append(key,el('td',m.presence),el('td',(f.cardinality==='array'?'Array of ':'')+type));table.append(row);}
 const wrap=el('div',undefined,'table-wrap');wrap.append(table);if(selected.members?.length)detail.append(wrap);else detail.append(el('p','This object is a map or tagged union; inspect its exact key and branch rules in the object reference.'));
 detail.append(el('p','This self-model is a descriptive projection. It retains original schema fragments, including conditional and union rules. JSON Schema and core semantic validators remain authoritative. The annotation vocabulary is explicit metadata; it does not certify native type equivalence.','callout'));
 const raw=el('details');raw.append(el('summary','Model element and retained schema'),el('pre',JSON.stringify(selected,null,2)));detail.append(raw);if(keyboardNavigation)detail.focus();
}
