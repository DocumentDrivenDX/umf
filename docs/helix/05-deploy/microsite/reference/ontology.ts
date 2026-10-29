import {renderRecordMap} from '@documentdrivendx/umf-schema-browser';
import {balancedLayouts} from './ontology-layout';
import {definitionFinder} from './definition-finder';
import {selfModelGraph,type SelfModelCatalog,type ReaderCatalog} from '../../reference/model';
const el=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const link=(text:string,href:string)=>{const a=el('a',text) as HTMLAnchorElement;a.href=href;return a;};
const meta=(value:any)=>value?.extensions?.['umf.metamodel']??{};
const route=(view:string,id:string)=>{const next=new URLSearchParams({view,node:JSON.stringify(['umf',id])}),focus=new URLSearchParams(location.hash.slice(1)).get('focus');if(view==='ontology'&&focus)next.set('focus',focus);return '#'+next;};
function linksIn(shape:any,out:string[]=[]):string[]{if(!shape||typeof shape!=='object'||Array.isArray(shape))return out;if(shape.tag==='link'&&typeof shape.target==='string')out.push(shape.target);for(const [key,value]of Object.entries(shape))if(key!=='target'){if(Array.isArray(value))value.forEach(v=>linksIn(v,out));else linksIn(value,out);}return out;}
function schemaPointer(item:any,all:any[]):string{
 if(item.kind==='record')return item.id==='document'?'':'/$defs/'+item.id;
 const [owner,name]=item.id.includes('.')?item.id.split('.',2):['',item.id];
 if(owner==='document')return '/properties/'+name;
 if(owner&&all.some(e=>e.kind==='record'&&e.id===owner))return '/$defs/'+owner+'/properties/'+name;
 return '/$defs/'+item.id;
}
function shapeView(shape:any,all:any[],seen=new Set<string>()):HTMLElement{
 const box=el('div',undefined,'shape-definition');if(!shape||typeof shape!=='object'){box.append(el('span','No authored shape is stated.'));return box;}
 const target=(name:string)=>all.find(e=>meta(e).definition===name)??all.find(e=>e.id===name);
 const members=(record:any,parent:HTMLElement)=>{for(const ref of record.members??[]){const field=all.find(e=>e.module===ref.module&&e.id===ref.element);if(!field)continue;const row=el('div',undefined,'shape-member'),a=link(field.name??field.id,route('ontology',field.id));row.append(a,el('span',meta(field).presence??'Presence not stated'));const nested=meta(field).shape;if(nested)row.append(shapeView(nested,all,new Set([...seen,record.id])));parent.append(row);}};
 const tag=String(shape.tag??'shape');
 if(tag==='link'&&typeof shape.target==='string'){
  const definition=target(shape.target);box.append(el('strong','Authored link to '));if(!definition){box.append(el('span',shape.target+' (unresolved in this model)'));return box;}
  box.append(link(definition.name??definition.id,route('ontology',definition.id)));
  const key=definition.id;if(seen.has(key)){box.append(el('p','Recursive definition; follow the link to inspect it.'));return box;}
  const next=new Set(seen);next.add(key);const definitionShape=meta(definition).shape;
  if(definitionShape)box.append(shapeView(definitionShape,all,next));
  if(definition.kind==='record'){const contents=el('div',undefined,'shape-object-members');members(definition,contents);if(contents.childElementCount)box.append(contents);}
  return box;
 }
 if(tag==='constant'){box.append(el('span','Exactly '),el('code',JSON.stringify(shape.value)));return box;}
 if(['choice','exclusive-choice','all','any'].includes(tag)){
  const options=Array.isArray(shape.options)?shape.options:[];
  const known=options.find((option:any)=>option?.tag==='link'&&typeof option.target==='string');
  const open=known&&options.find((option:any)=>option?.tag==='all'&&Array.isArray(option.options)&&option.options.some((part:any)=>part?.tag==='text')&&option.options.some((part:any)=>part?.tag==='not'&&part.value?.tag==='link'&&part.value.target===known.target));
  if(tag==='choice'&&open){box.append(el('strong','Known values and open text values:'));box.append(shapeView(known,all,seen));const textShape=open.options.find((part:any)=>part?.tag==='text');box.append(el('p',open.description??((textShape.min!==undefined?'Nonempty ':'')+'text values outside the known set are retained; their meaning is unresolved.')));return box;}
  box.append(el('strong',tag==='choice'?'One authored option:':tag==='exclusive-choice'?'Exactly one authored option:':tag==='all'?'All authored conditions:':'Any authored condition:'));
  const list=el('ul');for(const option of options){const li=el('li');li.append(shapeView(option,all,seen));list.append(li);}box.append(list);return box;
 }
 if(tag==='object'){
  box.append(el('strong','Authored object shape.'));
  const record=all.find(e=>e.kind==='record'&&meta(e).definition===shape.definition);if(record)members(record,box);
  return box;
 }
 if(tag==='not'){box.append(el('strong','Excluded shape:'),shapeView(shape.value,all,seen));return box;}
 const descriptions:Record<string,string>={text:'Text value',integer:'Integer value',boolean:'Boolean value',null:'Null value',sequence:'Ordered sequence',conditional:'Conditional shape'};
 box.append(el('strong',descriptions[tag]??tag+' shape'));
 if(shape.description)box.append(el('p',shape.description));
 if(shape.min!==undefined)box.append(el('p','Minimum: '+shape.min));if(shape.max!==undefined)box.append(el('p','Maximum: '+shape.max));
 for(const [key,value]of Object.entries(shape))if(key!=='tag'&&key!=='description'&&key!=='min'&&key!=='max'&&value&&typeof value==='object')box.append(shapeView(value,all,seen));
 return box;
}
// The host owns viewport sizing; the released renderer owns nodes and relationships.
const graphViews=new WeakMap<HTMLElement,{dispose:()=>void;zoom:number|null;left:number;top:number}>();
function graphViewport(map:HTMLElement,root:HTMLElement,model:ReturnType<typeof selfModelGraph>,focus:string){
 const previous=graphViews.get(root);previous?.dispose();
 const svg=map.querySelector('svg')!,canvas=map.querySelector('.ontology-map')!,controls=map.querySelector('.map-controls')!;
 const viewport=el('div',undefined,'ontology-viewport');viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Ontology graph; scroll to pan when zoomed');svg.before(viewport);viewport.append(svg);
 const relationships=map.querySelector('.map-relationships')!,legend=el('details',undefined,'ontology-connections');legend.append(el('summary','Connections · '+relationships.childElementCount),relationships);canvas.append(legend);
 const zoomControls=el('div',undefined,'graph-zoom'),status=el('output');status.setAttribute('aria-live','polite');
 const state={dispose:()=>{},zoom:previous?.zoom??null,left:previous?.left??0,top:previous?.top??0};
 // Reflow the released renderer's existing SVG elements; keep its navigation,
 // labels, markers and navigation intact; Dagre routes edges between nodes.
 const edges=focus?model.edges.filter(e=>e.source===focus||e.target===focus):model.edges;
 const ids=new Set([focus,...edges.flatMap(e=>[e.source,e.target])]);const records=focus?model.records.filter(r=>ids.has(r.id)):model.records;
 const recordNodes=Array.from(svg.querySelectorAll<SVGAElement>('[aria-label^="Inspect record "]')),edgeNodes=Array.from(svg.querySelectorAll<SVGAElement>('[aria-label^="Inspect relationship "]'));
 const original=recordNodes.map(n=>{const r=n.querySelector('rect')!;return {x:Number(r.getAttribute('x')),y:Number(r.getAttribute('y'))};});
 const sizes=records.map((record,i)=>{const node=recordNodes[i]!,rect=node.querySelector('rect')!,text=node.querySelector('text')!,width=Math.ceil(Math.max(140,text.getComputedTextLength()+24));rect.setAttribute('width',String(width));rect.setAttribute('height','64');node.querySelector('.map-count')!.setAttribute('y',String(original[i]!.y+48));node.dataset.modelId=record.id;return {id:record.id,width};});
 const layouts=balancedLayouts(sizes,edges);
 const note=document.createElementNS('http://www.w3.org/2000/svg','text');note.textContent='Standalone definitions';note.setAttribute('class','graph-standalone');note.setAttribute('text-anchor','middle');svg.append(note);
 let width=880,height=180,fit=1;
 const resize=()=>{
  const chosen=layouts.reduce((best,next)=>Math.min(viewport.clientWidth/next.width,viewport.clientHeight/next.height)>Math.min(viewport.clientWidth/best.width,viewport.clientHeight/best.height)?next:best);
  width=chosen.width;height=chosen.height;
  recordNodes.forEach((node,i)=>{const p=chosen.nodes.get(records[i]!.id)!;node.setAttribute('transform',`translate(${p.x-original[i]!.x} ${p.y-original[i]!.y})`);});
  edgeNodes.forEach((node,i)=>{const geometry=chosen.edges.get(edges[i]!.id)!;node.dataset.source=edges[i]!.source;node.dataset.target=edges[i]!.target;node.querySelector('path')!.setAttribute('d',geometry.path);const circle=node.querySelector('circle')!,text=node.querySelector('text')!;circle.setAttribute('cx',String(geometry.x));circle.setAttribute('cy',String(geometry.y));text.setAttribute('x',String(geometry.x));text.setAttribute('y',String(geometry.y+4));});
  note.style.display=chosen.standalone?'':'none';if(chosen.standalone){note.setAttribute('x',String(chosen.standalone.x));note.setAttribute('y',String(chosen.standalone.y));}
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  fit=Math.min(viewport.clientWidth/width,viewport.clientHeight/height);const scale=state.zoom??fit;svg.style.width=width*scale+'px';svg.style.height=height*scale+'px';status.textContent=Math.round(scale*100)+'%';
 };
 const button=(title:string,action:()=>void)=>{const b=el('button',title) as HTMLButtonElement;b.type='button';b.onclick=action;zoomControls.append(b);};
 button('Fit graph',()=>{state.zoom=null;resize();viewport.scrollTo(0,0);});
 button('−',()=>{state.zoom=Math.max(Math.min(.25,fit/4),(state.zoom??fit)/1.25);resize();});zoomControls.lastElementChild!.setAttribute('aria-label','Zoom out');
 button('+',()=>{state.zoom=Math.min(Math.max(3,fit*4),(state.zoom??fit)*1.25);resize();});zoomControls.lastElementChild!.setAttribute('aria-label','Zoom in');
 button('100%',()=>{state.zoom=1;resize();});zoomControls.append(status);controls.append(zoomControls);
 const observer=new ResizeObserver(resize);observer.observe(viewport);state.dispose=()=>observer.disconnect();graphViews.set(root,state);
 viewport.onscroll=()=>{state.left=viewport.scrollLeft;state.top=viewport.scrollTop;};resize();viewport.scrollTo(state.left,state.top);
}
export function showOntology(root:HTMLElement,catalog:SelfModelCatalog,reader:ReaderCatalog){
 const keyboardNavigation=root.dataset.keyboardNavigation==='true';delete root.dataset.keyboardNavigation;
 root.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')root.dataset.keyboardNavigation='true';};root.onpointerdown=()=>{delete root.dataset.keyboardNavigation;};
 root.replaceChildren();const params=new URLSearchParams(location.hash.slice(1));const elements:any[]=catalog.document.modules.flatMap((m:any)=>m.elements.map((e:any)=>({...e,module:m.id}))),records=elements.filter(e=>e.kind==='record'),fields=elements.filter(e=>e.kind==='field');
 const requested=params.get('node'),decoded=requested?(()=>{try{return JSON.parse(requested);}catch{return null;}})():['umf','document'];
 if(!Array.isArray(decoded)||decoded.length!==2)throw Error('SELF_MODEL_LINK invalid node');const selected=elements.find(e=>e.module===decoded[0]&&e.id===decoded[1]);if(!selected||!['record','field'].includes(selected.kind))throw Error('SELF_MODEL_LINK unknown type');
 const downloads=el('div',undefined,'chips');downloads.append(link('Download authored UMF model · YAML','umf.yaml'),link('JSON','umf.json'));const about=el('details',undefined,'ontology-about');about.append(el('summary','About & downloads'),el('div',undefined,'ontology-about-content'));about.lastElementChild!.append(el('p','Browse the authored current language model. Record members resolve to their single declared Fields; Field shapes show only relationships stated in the model. JSON Schema and validators are generated outputs.'),downloads,el('p','This view reports authored language definitions and source relationships only. It does not infer inheritance, instance counts, native storage meaning or enforcement beyond the separately generated validators.'));root.append(el('h2','UMF ontology','visually-hidden'));
 const layout=el('div',undefined,'ontology-layout'),aside=el('aside',undefined,'ontology-types');aside.setAttribute('aria-label','UMF language definitions');aside.append(definitionFinder([...records,...fields],id=>route('ontology',id),()=>{
  // Fragment navigation can render through both popstate and hashchange. Focus
  // the final detail after those handlers have replaced the old input.
  requestAnimationFrame(()=>root.querySelector<HTMLElement>('#ontology-detail')?.focus());
 }));const list=el('div',undefined,'ontology-groups');aside.append(list,about);
 const content=el('div',undefined,'ontology-content'),map=el('div');map.id='ontology-map';content.append(map);layout.append(aside,content);root.append(layout);
 const graph=selfModelGraph(catalog);const owner=selected.kind==='record'?selected:records.find(r=>(r.members??[]).some((m:any)=>m.module===selected.module&&m.element===selected.id));const focus=params.get('focus')??'';if(focus&&!graph.records.some(r=>r.id===focus))throw Error('SELF_MODEL_LINK unknown focus');
 const edgeId=params.get('edge'),selectedEdge=graph.edges.find(e=>e.id===edgeId);if(edgeId&&!selectedEdge)throw Error('SELF_MODEL_LINK unknown connection');
 const recordList=el('details') as HTMLDetailsElement;recordList.append(el('summary','Records · '+records.length));
 const fieldList=el('details') as HTMLDetailsElement;fieldList.append(el('summary','Fields · '+fields.length));
 const add=(parent:HTMLElement,items:any[])=>{for(const item of items){const a=link(item.name??item.id,route('ontology',item.id));if(item===selected)a.setAttribute('aria-current','true');a.dataset.element=item.id;parent.append(a);}};
 const recordOptions=el('div',undefined,'definition-options'),fieldOptions=el('div',undefined,'definition-options');recordList.append(recordOptions);fieldList.append(fieldOptions);add(recordOptions,records);add(fieldOptions,fields);list.append(recordList,fieldList);
 const graphRoute=(id:string)=>{const next=new URLSearchParams(route('ontology',id).slice(1));if(focus)next.set('focus',focus);return '#'+next;};
 if(graph.records.length){
  renderRecordMap(map,graph,{focus,onNavigate:(id,kind)=>{if(kind==='relationship'){const edge=graph.edges.find(e=>e.id===id);if(edge)location.hash=graphRoute(JSON.parse(edge.source)[1])+'&edge='+encodeURIComponent(id);}else location.hash=graphRoute(JSON.parse(id)[1]);},onFocusChange:(next)=>{const params=new URLSearchParams(location.hash.slice(1));params.set('view','ontology');params.delete('edge');if(next){params.set('focus',next);params.set('node',next);}else params.delete('focus');const hash='#'+params;if(location.hash===hash)showOntology(root,catalog,reader);else location.hash=hash;}});
  const current=owner?graph.records.findIndex(r=>r.id===JSON.stringify([owner.module,owner.id])):-1;
  if(current>=0)map.querySelector(`[aria-label="Inspect record ${graph.records[current]!.label} · unchanged"]`)?.setAttribute('aria-current','true');
  graphViewport(map,root,graph,focus);
 }

 const detail=el('section');detail.id='ontology-detail';detail.tabIndex=-1;content.append(detail);detail.append(el('p',selected.kind==='record'?'Record definition':'Field definition','eyebrow'),el('h3',selected.name??selected.id),el('p',selected.description??''));
 detail.append(link('Open generated object reference →','#'+new URLSearchParams({view:'reference',entry:reader.latest.id,pointer:schemaPointer(selected,elements)})));
 const sourceInfo=meta(selected);const role=sourceInfo.role;
 if(selectedEdge){const sourceParts=JSON.parse(selectedEdge.source) as [string,string],targetParts=JSON.parse(selectedEdge.target) as [string,string],source=elements.find(e=>e.module===sourceParts[0]&&e.id===sourceParts[1]),target=elements.find(e=>e.module===targetParts[0]&&e.id===targetParts[1]);if(!source||!target)throw Error('SELF_MODEL_LINK unresolved connection');detail.replaceChildren(el('p','Authored model connection','eyebrow'),el('h3','Connection: '+(source.name??source.id)),el('p','Field shape: '+selectedEdge.label));detail.append(el('p','Target Record: '),link(target.name??target.id,route('ontology',target.id)));}
 else if(selected.kind==='record'){
  if(role)detail.append(el('p','Role view: '+role+'. This is the same declared Element, rendered with its authored role conditions; its Fields remain owned once by this Record.'));
  const table=el('table'),head=el('tr');for(const title of ['Field','Presence','Authored value shape'])head.append(el('th',title));table.append(head);
  for(const member of selected.members??[]){const field=elements.find(e=>e.module===member.module&&e.id===member.element);if(!field)throw Error('SELF_MODEL_LINK unresolved Field');const fieldMeta=meta(field),shape=fieldMeta.shape;let summary=field.scalarType??'';if(shape){const targets=linksIn(shape);summary=(shape.tag??'shape')+(targets.length?' → '+targets.join(', '):'');}if(field.cardinality&&field.cardinality!=='one')summary=field.cardinality+' · '+summary;const row=el('tr'),key=el('td');key.append(link(field.name??field.id,route('ontology',field.id)));row.append(key,el('td',fieldMeta.presence??'Not stated'),el('td',summary||'See authored Field shape'));table.append(row);}
  const wrap=el('div',undefined,'table-wrap');wrap.append(table);detail.append(wrap);
 }else{
  if(sourceInfo.shape)detail.append(shapeView(sourceInfo.shape,elements));
  const ownerRecord=owner;if(ownerRecord){const ownerLine=el('p');ownerLine.append(link('Owned by Record '+ownerRecord.name,route('ontology',ownerRecord.id)));detail.append(ownerLine);}
  const facts=[selected.scalarType?'Scalar family: '+selected.scalarType:'',selected.cardinality?'Cardinality: '+selected.cardinality:'',selected.itemType?'Item type: '+selected.itemType.module+' / '+selected.itemType.element:''].filter(Boolean);if(facts.length)detail.append(el('p',facts.join(' · ')));
  const details=el('details');details.append(el('summary','Authored Field definition'),el('pre',JSON.stringify(selected,null,2)));detail.append(details);
 }

 if(keyboardNavigation)detail.focus();
}
