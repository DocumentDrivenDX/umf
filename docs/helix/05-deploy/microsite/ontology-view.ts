import {renderRecordMap} from '../schema-browser/components';
import {relationshipGeometry} from './ontology-layout';
import {displayLabel} from './presentation';
import {pretty as prettyValue} from '../schema-browser/format-runtime';
import {key,type Parsed,type Definition,type Entry} from './explorer-model';
export interface Edge {key:string;module:string;value:any}
export function ontologyModel(parsed:Parsed){
 const records=parsed.definitions.filter(d=>d.value.kind==='record'),fields=parsed.definitions.filter(d=>d.value.kind==='field');
 const edges:Edge[]=(parsed.document?.modules??[]).flatMap(m=>(Array.isArray(m.relationships)?m.relationships:[]).map((r:any)=>({key:JSON.stringify(['relationship',m.id,r.id]),module:m.id,value:r})));
 return {records,fields,edges};
}
const el=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const pretty=displayLabel;
const span=(v:any)=>v?`${v.min}..${v.max}`:'Not declared';
const endpointKey=(e:any)=>key(e.module,e.element);
export function renderOntology(root:HTMLElement,parsed:Parsed,entry:Entry,entries:Entry[],params:URLSearchParams,annotations:Record<string,import('../schema-browser/types').Annotation[]>={}){
 const model=ontologyModel(parsed),selected=params.get('definition'),edge=model.edges.find(e=>e.key===params.get('relationship'));
 const definition=parsed.definitions.find(d=>d.key===selected);
 const href=(values:Record<string,string>)=>'#'+new URLSearchParams({schema:entry.id,...(params.get('revision')?{revision:params.get('revision')!}:{}),...values});
 const link=(text:string,values:Record<string,string>,cls='ref-link')=>{const a=el('a',text,cls) as HTMLAnchorElement;a.href=href(values);return a;};
 const ref=(value:any)=>{const d=parsed.definitions.find(d=>d.key===endpointKey(value));return d?link(d.value.kind==='field'?d.title:pretty(d.title),{definition:d.key}):el('span',`${value.module} / ${value.element} · unresolved`,'unresolved');};
 const section=(title:string)=>{const s=el('section',undefined,'detail-block');s.append(el('h3',title));root.append(s);return s;};
 const raw=(parent:HTMLElement,title:string,value:unknown)=>{const d=el('details',undefined,'raw-content');d.append(el('summary',title),el('pre',prettyValue(value)));parent.append(d);};
 const relations=(record:Definition,side:'source'|'target')=>model.edges.filter(e=>(e.value[side]??[]).some((p:any)=>endpointKey(p)===record.key));
 const nav=el('nav',undefined,'definition-list');nav.setAttribute('aria-label','Ontology views');
 nav.append(link('Model overview',{}));const recordLabel=el('label','Jump to record'),recordSelect=el('select') as HTMLSelectElement;recordSelect.setAttribute('aria-label','Jump to record');const empty=el('option','Choose a record') as HTMLOptionElement;empty.value='';recordSelect.append(empty);for(const d of model.records){const option=el('option',pretty(d.title)) as HTMLOptionElement;option.value=d.key;recordSelect.append(option);}recordSelect.value=definition?.value.kind==='record'?definition.key:'';recordSelect.onchange=()=>{location.hash=href(recordSelect.value?{definition:recordSelect.value}:{});};recordLabel.append(recordSelect);nav.append(recordLabel);root.append(nav);
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
   const targets=profile?JSON.parse(profile.text!).execution_profile?.targets:undefined;
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
 const initial=params.get('focus')??target?.key??(edge?.value.source?.[0]?endpointKey(edge.value.source[0]):undefined)??'';
 const binary=model.edges.filter(e=>e.value.source?.length===1&&e.value.target?.length===1);
 renderRecordMap(map,{records:model.records.map(r=>({id:r.key,label:pretty(r.title),properties:(r.value.members as any[]??[]).length})),edges:binary.map(e=>({id:e.key,source:endpointKey(e.value.source[0]),target:endpointKey(e.value.target[0]),label:String(e.value.name??e.value.id)+' · '+span(e.value.sourceMultiplicity)+' → '+span(e.value.targetMultiplicity),directed:e.value.directed===true}))},{focus:initial,annotations,onFocusChange:(focus)=>{const next=new URLSearchParams(location.hash.slice(1));next.set('focus',focus);history.replaceState(null,'',location.href.split('#')[0]+'#'+next);},onNavigate:(id,kind)=>{location.hash=href(kind==='relationship'?{relationship:id}:{definition:id});}});
 if(binary.length!==model.edges.length)map.append(el('p',`${model.edges.length-binary.length} relationships have multiple or unspecified endpoints; inspect their full declarations in Relationships. They are not drawn as binary arrows.`));
 const list=section('Relationships');for(const e of model.edges){const p=el('p');p.append(link(String(e.value.name??e.value.id),{relationship:e.key}));list.append(p);}if(!model.edges.length)list.append(el('p','None declared.'));
 const hierarchy=section('Records and properties');for(const r of model.records){const d=el('details');d.append(el('summary',pretty(r.title)),link('Open record',{definition:r.key}));for(const m of r.value.members as any[]??[]){const p=el('p');p.append(ref(m.field??m));d.append(p);}hierarchy.append(d);}
 const other=parsed.definitions.filter(d=>d.value.kind!=='record'&&d.value.kind!=='field');if(other.length){const b=section('Other definitions');for(const d of other)b.append(link(d.title,{definition:d.key}));}
 const unowned=model.fields.filter(d=>!model.records.some(r=>(r.value.members as any[]??[]).some(m=>endpointKey(m.field??m)===d.key)));if(unowned.length){const b=section('Properties without declared record membership');for(const d of unowned)b.append(link(d.title,{definition:d.key}));}
 raw(section('Retained source metadata'),'Original document',parsed.document);
}
