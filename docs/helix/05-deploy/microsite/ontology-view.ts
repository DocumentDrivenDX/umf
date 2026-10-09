import {stringify} from 'yaml';
import {key,type Parsed,type Definition,type Entry} from './explorer-model';
export interface Edge {key:string;module:string;value:any}
export function ontologyModel(parsed:Parsed){
 const records=parsed.definitions.filter(d=>d.value.kind==='record'),fields=parsed.definitions.filter(d=>d.value.kind==='field');
 const edges:Edge[]=(parsed.document?.modules??[]).flatMap(m=>(Array.isArray(m.relationships)?m.relationships:[]).map((r:any)=>({key:JSON.stringify(['relationship',m.id,r.id]),module:m.id,value:r})));
 return {records,fields,edges};
}
const el=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const pretty=(s:string)=>s.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const span=(v:any)=>v?`${v.min}..${v.max}`:'Not declared';
const endpointKey=(e:any)=>key(e.module,e.element);
export function renderOntology(root:HTMLElement,parsed:Parsed,entry:Entry,entries:Entry[],params:URLSearchParams){
 const model=ontologyModel(parsed),selected=params.get('definition'),edge=model.edges.find(e=>e.key===params.get('relationship'));
 const definition=parsed.definitions.find(d=>d.key===selected);
 const href=(values:Record<string,string>)=>'#'+new URLSearchParams({schema:entry.id,...values});
 const link=(text:string,values:Record<string,string>,cls='ref-link')=>{const a=el('a',text,cls) as HTMLAnchorElement;a.href=href(values);return a;};
 const ref=(value:any)=>{const d=parsed.definitions.find(d=>d.key===endpointKey(value));return d?link(pretty(d.title),{definition:d.key}):el('span',`${value.module} / ${value.element} · unresolved`,'unresolved');};
 const section=(title:string)=>{const s=el('section',undefined,'detail-block');s.append(el('h3',title));root.append(s);return s;};
 const raw=(parent:HTMLElement,title:string,value:unknown)=>{const d=el('details',undefined,'raw-content');d.append(el('summary',title),el('pre',stringify(value,{aliasDuplicateObjects:false,lineWidth:0})));parent.append(d);};
 const relations=(record:Definition,side:'source'|'target')=>model.edges.filter(e=>(e.value[side]??[]).some((p:any)=>endpointKey(p)===record.key));
 const nav=el('nav',undefined,'definition-list');nav.setAttribute('aria-label','Ontology views');
 nav.append(link('Model overview',{}));for(const d of model.records)nav.append(link(pretty(d.title),{definition:d.key}));root.append(nav);
 const summary=el('div',undefined,'stats');for(const text of [`${model.records.length} records`,`${model.fields.length} properties`,`${model.edges.length} relationships`])summary.append(el('span',text,'tag'));root.append(summary);
 root.append(el('p','UMF record and relationship model · arrows represent declared schema relationships.','ontology-caption'));
 const target=definition?.value.kind==='record'?definition:undefined;
 if(edge){
  const b=section('Relationship: '+pretty(String(edge.value.name??edge.value.id)));
  b.dataset.relationship=edge.key;
  for(const side of ['source','target'] as const){const p=el('p',side==='source'?'Source: ':'Target: ');for(const value of edge.value[side]??[])p.append(ref(value),document.createTextNode(value.key?` · key ${value.key} `:' '));b.append(p);}
  b.append(el('p',`Source participation ${span(edge.value.sourceMultiplicity)} · Target participation ${span(edge.value.targetMultiplicity)} · ${edge.value.directed===true?'Directed':edge.value.directed===false?'Undirected':'Direction not declared'}`));
  if(edge.value.targetLifecycle)b.append(el('p','Target lifecycle: '+edge.value.targetLifecycle));
  raw(b,'Original relationship',edge.value);
 }else if(definition){
  const b=section(pretty(definition.title));b.dataset.record=definition.key;
  b.append(el('p',`${definition.module} / ${definition.id}`,'schema-id'));
  if(definition.value.description)b.append(el('p',String(definition.value.description)));
  if(target){
   const profile=entries.find(e=>e.id===`pack:${entry.pack}@${entry.packVersion}`);
   const targets=profile?JSON.parse(profile.text).execution_profile?.targets:undefined;
   // CONTRACT-053 maps each graph Record to its exact table schema ID.
   const table=targets?.graph?.includes('ontology')&&entries.find(e=>e.id===`schema:${entry.pack}@${entry.packVersion}:${target.id}`&&targets.tabular?.includes(target.id));
   if(table){const a=el('a','View corresponding table','ref-link') as HTMLAnchorElement;a.href='#'+new URLSearchParams({schema:table.id});b.append(a);}
   const wrap=el('div',undefined,'table-wrap'),tableEl=el('table',undefined,'details-table');const head=el('tr');for(const text of ['Property','Type / shape','Availability','Identity'])head.append(el('th',text));tableEl.append(head);
   const identity=new Set((target.value.keys as any[]??[]).flatMap(k=>(k.fields??[]).map(endpointKey)));
   for(const member of target.value.members as any[]??[]){const value=member.field??member,d=parsed.definitions.find(d=>d.key===endpointKey(value)),row=el('tr'),cell=el('td');cell.append(ref(value));row.append(cell,el('td',d?`${d.value.scalarType??d.value.kind??'Not declared'} / ${d.value.cardinality??'Not declared'}`:'Unresolved'),el('td',String(d?.value.nullability??'Not declared')),el('td',identity.has(endpointKey(value))?'Key member':'—'));tableEl.append(row);}
   wrap.append(tableEl);b.append(wrap);
   if(target.value.keys)raw(b,'Identity and keys',target.value.keys);
   for(const [side,title] of [['source','Outgoing relationships'],['target','Incoming relationships']] as const){const s=section(title),edges=relations(target,side);if(!edges.length)s.append(el('p','None declared.'));for(const e of edges){const p=el('p');p.append(link(pretty(String(e.value.name??e.value.id)),{relationship:e.key}));const opposite=side==='source'?'target':'source';p.append(document.createTextNode(' · '));for(const r of e.value[opposite]??[])p.append(ref(r),document.createTextNode(' '));p.append(document.createTextNode(` · ${span(e.value.sourceMultiplicity)} → ${span(e.value.targetMultiplicity)}`));s.append(p);}}
  }else{
   b.append(el('p',`Type: ${definition.value.scalarType??definition.value.kind??'Not declared'} · Shape: ${definition.value.cardinality??'Not declared'} · Availability: ${definition.value.nullability??'Not declared'}`));
   if(definition.value.facets)raw(b,'Declared constraints',definition.value.facets);
   const owners=model.records.filter(r=>(r.value.members as any[]??[]).some(m=>endpointKey(m.field??m)===definition.key));
   const p=el('p','Record: ');for(const owner of owners)p.append(link(pretty(owner.title),{definition:owner.key}));b.append(p);
  }
  raw(b,'Constraints and retained metadata',definition.value);
 }
 const map=section(target?'Relationship neighborhood':'Relationship map');
 const controls=el('div',undefined,'definition-list'),select=el('select') as HTMLSelectElement;select.setAttribute('aria-label','Focus record');
 const all=el('option','Full model') as HTMLOptionElement;all.value='';select.append(all);
 for(const r of model.records){const option=el('option',pretty(r.title)) as HTMLOptionElement;option.value=r.key;select.append(option);}
 const initial=params.get('focus')??target?.key??(edge?.value.source?.[0]?endpointKey(edge.value.source[0]):undefined)??model.records[0]?.key??'';select.value=initial;
 controls.append(el('label','Focus: '),select);const full=el('button','Show full model') as HTMLButtonElement;full.type='button';controls.append(full);map.append(controls);
 const canvas=el('div',undefined,'ontology-map');map.append(canvas);
 const draw=(focus:string)=>{
  canvas.replaceChildren();const focusEdges=model.edges.filter(e=>[...(e.value.source??[]),...(e.value.target??[])].some(p=>endpointKey(p)===focus));
  const keys=new Set([focus,...focusEdges.flatMap(e=>[...(e.value.source??[]),...(e.value.target??[])].map(endpointKey))]);
  const records=focus?model.records.filter(r=>keys.has(r.key)):model.records;
  const positions=new Map(records.map((r,i)=>[r.key,{x:35+(i%3)*250,y:35+Math.floor(i/3)*120}]));
  const ns='http://www.w3.org/2000/svg';const svg=(tag:string,attrs:Record<string,string>={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const g=svg('svg',{viewBox:`0 0 780 ${Math.max(180,Math.ceil(records.length/3)*120+30)}`,role:'img','aria-label':focus?'Record relationship neighborhood':'Full record relationship map'});
  const defs=svg('defs'),marker=svg('marker',{id:'ontology-arrow',viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'6',markerHeight:'6',orient:'auto'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#526b45'}));defs.append(marker);g.append(defs);
  const edges=focus?focusEdges:model.edges,visibleEdges:Edge[]=[];
  for(const e of edges){if(e.value.source?.length!==1||e.value.target?.length!==1)continue;let visible=false;for(const s of e.value.source??[])for(const t of e.value.target??[]){const a=positions.get(endpointKey(s)),b=positions.get(endpointKey(t));if(!a||!b)continue;visible=true;
   const anchor=svg('a',{href:href({relationship:e.key,focus}),tabindex:'0','aria-label':'Inspect relationship '+String(e.value.name??e.value.id)}),title=svg('title');title.textContent=`${e.value.name??e.value.id}: ${span(e.value.sourceMultiplicity)} → ${span(e.value.targetMultiplicity)}`;
   const dx=b.x-a.x,dy=b.y-a.y,ratio=dx===0&&dy===0?0:Math.min(dx===0?Infinity:108/Math.abs(dx),dy===0?Infinity:35/Math.abs(dy));
   const bow=dy===0&&Math.abs(dx)>250?88:0,mx=(a.x+b.x)/2+102.5,my=(a.y+b.y)/2+31+bow/2;
   const path=svg('path',{d:endpointKey(s)===endpointKey(t)?`M ${a.x+160} ${a.y} C ${a.x+270} ${a.y-35} ${a.x+270} ${a.y+95} ${a.x+160} ${a.y+60}`:`M ${a.x+102.5+dx*ratio} ${a.y+31+dy*ratio} Q ${mx} ${(a.y+b.y)/2+31+bow} ${b.x+102.5-dx*ratio} ${b.y+31-dy*ratio}`,fill:'none',stroke:'#526b45','stroke-width':'3',...(e.value.directed===true?{'marker-end':'url(#ontology-arrow)'}:{})});anchor.append(title,path,svg('circle',{cx:String(mx),cy:String(my),r:'11',fill:'#526b45'}));const badge=svg('text',{x:String(mx),y:String(my+4),'text-anchor':'middle',fill:'white','font-size':'11'});badge.textContent=String(edges.indexOf(e)+1);anchor.append(badge);g.append(anchor);
  }if(visible)visibleEdges.push(e);}
  for(const r of records){const p=positions.get(r.key)!,a=svg('a',{href:href({definition:r.key}),tabindex:'0','aria-label':'Inspect record '+pretty(r.title)});a.append(svg('rect',{x:String(p.x),y:String(p.y),width:'205',height:'62',rx:'8',fill:r.key===focus?'#dce6cc':'#fffdf7',stroke:'#526b45','stroke-width':'2'}));const text=svg('text',{x:String(p.x+10),y:String(p.y+25)});text.textContent=pretty(r.title);const count=svg('text',{x:String(p.x+10),y:String(p.y+47),class:'map-count'});count.textContent=`${(r.value.members as any[]??[]).length} properties`;a.append(text,count);g.append(a);}
  canvas.append(g);
  const complex=edges.filter(e=>e.value.source?.length!==1||e.value.target?.length!==1);if(complex.length)canvas.append(el('p',`${complex.length} relationships have multiple or unspecified endpoints; inspect their full declarations in Relationships. They are not drawn as binary arrows.`));
  const labels=el('div',undefined,'map-relationships');for(const e of visibleEdges){const p=el('p');p.append(link(`${edges.indexOf(e)+1}. ${e.value.name??e.value.id}`,{relationship:e.key,focus}),document.createTextNode(` · ${span(e.value.sourceMultiplicity)} → ${span(e.value.targetMultiplicity)}`));labels.append(p);}canvas.append(labels);
  const unresolved=edges.filter(e=>[...(e.value.source??[]),...(e.value.target??[])].some(p=>!model.records.some(r=>r.key===endpointKey(p))));if(unresolved.length)canvas.append(el('p',`${unresolved.length} relationships have endpoints outside the displayed record model; retained in the relationship list.`,'unresolved'));
 };
 const change=(focus:string)=>{const next=new URLSearchParams(location.hash.slice(1));next.set('focus',focus);history.replaceState(null,'','#'+next);select.value=focus;draw(focus);};select.onchange=()=>change(select.value);full.onclick=()=>change('');draw(initial);
 const list=section('Relationships');for(const e of model.edges){const p=el('p');p.append(link(String(e.value.name??e.value.id),{relationship:e.key}));list.append(p);}if(!model.edges.length)list.append(el('p','None declared.'));
 const hierarchy=section('Records and properties');for(const r of model.records){const d=el('details');d.append(el('summary',pretty(r.title)),link('Open record',{definition:r.key}));for(const m of r.value.members as any[]??[]){const p=el('p');p.append(ref(m.field??m));d.append(p);}hierarchy.append(d);}
 const other=parsed.definitions.filter(d=>d.value.kind!=='record'&&d.value.kind!=='field');if(other.length){const b=section('Other definitions');for(const d of other)b.append(link(d.title,{definition:d.key}));}
 const unowned=model.fields.filter(d=>!model.records.some(r=>(r.value.members as any[]??[]).some(m=>endpointKey(m.field??m)===d.key)));if(unowned.length){const b=section('Properties without declared record membership');for(const d of unowned)b.append(link(d.title,{definition:d.key}));}
 raw(section('Retained source metadata'),'Original document',parsed.document);
}
