import {renderRecordMap} from '@documentdrivendx/umf-schema-browser';
import {selfModelGraph,type SelfModelCatalog,type ReaderCatalog} from '../../reference/model';
const el=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const link=(text:string,href:string)=>{const a=el('a',text) as HTMLAnchorElement;a.href=href;return a;};
const meta=(value:any)=>value?.extensions?.['umf.metamodel']??{};
const route=(view:string,id:string)=>'#'+new URLSearchParams({view,node:JSON.stringify(['umf',id])});
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
export function showOntology(root:HTMLElement,catalog:SelfModelCatalog,reader:ReaderCatalog){
 const keyboardNavigation=root.dataset.keyboardNavigation==='true';delete root.dataset.keyboardNavigation;
 root.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')root.dataset.keyboardNavigation='true';};root.onpointerdown=()=>{delete root.dataset.keyboardNavigation;};
 root.replaceChildren();const params=new URLSearchParams(location.hash.slice(1));const elements:any[]=catalog.document.modules.flatMap((m:any)=>m.elements.map((e:any)=>({...e,module:m.id}))),records=elements.filter(e=>e.kind==='record'),fields=elements.filter(e=>e.kind==='field');
 const requested=params.get('node'),decoded=requested?(()=>{try{return JSON.parse(requested);}catch{return null;}})():['umf','document'];
 if(!Array.isArray(decoded)||decoded.length!==2)throw Error('SELF_MODEL_LINK invalid node');const selected=elements.find(e=>e.module===decoded[0]&&e.id===decoded[1]);if(!selected||!['record','field'].includes(selected.kind))throw Error('SELF_MODEL_LINK unknown type');
 const downloads=el('div',undefined,'chips');downloads.append(link('Download authored UMF model · YAML','umf.yaml'),link('JSON','umf.json'));const about=el('details',undefined,'ontology-about');about.append(el('summary','About & downloads'),el('div',undefined,'ontology-about-content'));about.lastElementChild!.append(el('p','Browse the authored current language model. Record members resolve to their single declared Fields; Field shapes show only relationships stated in the model. JSON Schema and validators are generated outputs.'),downloads,el('p','This view reports authored language definitions and source relationships only. It does not infer inheritance, instance counts, native storage meaning or enforcement beyond the separately generated validators.'));root.append(el('h2','UMF ontology','visually-hidden'));
 const layout=el('div',undefined,'ontology-layout'),aside=el('aside',undefined,'ontology-types');aside.setAttribute('aria-label','UMF language definitions');const label=el('label','Find a definition');const search=el('input') as HTMLInputElement;search.type='search';search.placeholder='Record, Field, Key…';label.append(search);aside.append(label);const list=el('div',undefined,'ontology-groups');aside.append(list,about);
 const content=el('div',undefined,'ontology-content'),map=el('div');map.id='ontology-map';content.append(map);layout.append(aside,content);root.append(layout);
 const graph=selfModelGraph(catalog);const owner=selected.kind==='record'?selected:records.find(r=>(r.members??[]).some((m:any)=>m.module===selected.module&&m.element===selected.id));const focus=owner?JSON.stringify([owner.module,owner.id]):'';
 const edgeId=params.get('edge'),selectedEdge=graph.edges.find(e=>e.id===edgeId);if(edgeId&&!selectedEdge)throw Error('SELF_MODEL_LINK unknown connection');
 const recordList=el('details') as HTMLDetailsElement;recordList.append(el('summary','Records · '+records.length));
 const fieldList=el('details') as HTMLDetailsElement;fieldList.append(el('summary','Fields · '+fields.length));
 const add=(parent:HTMLElement,items:any[])=>{for(const item of items){const a=link(item.name??item.id,route('ontology',item.id));if(item===selected)a.setAttribute('aria-current','true');a.dataset.element=item.id;parent.append(a);}};
 const refresh=()=>{recordList.replaceChildren(el('summary','Records · '+records.length));fieldList.replaceChildren(el('summary','Fields · '+fields.length));const recordOptions=el('div',undefined,'definition-options'),fieldOptions=el('div',undefined,'definition-options');recordList.append(recordOptions);fieldList.append(fieldOptions);const query=search.value.toLocaleLowerCase();add(recordOptions,records.filter(e=>(e.name+' '+e.id+' '+(e.description??'')).toLocaleLowerCase().includes(query)));add(fieldOptions,fields.filter(e=>(e.name+' '+e.id+' '+(e.description??'')).toLocaleLowerCase().includes(query)));if(!recordList.querySelector('a')&&!fieldList.querySelector('a'))list.replaceChildren(el('p','No matching definitions.'));else list.replaceChildren(recordList,fieldList);};search.oninput=refresh;refresh();
 if(graph.records.length)renderRecordMap(map,graph,{focus:focus||graph.records[0]!.id,onNavigate:(id,kind)=>{if(kind==='relationship'){const edge=graph.edges.find(e=>e.id===id);if(edge)location.hash=route('ontology',JSON.parse(edge.source)[1])+'&edge='+encodeURIComponent(id);}else location.hash=route('ontology',JSON.parse(id)[1]);},onFocusChange:(next)=>{const params=new URLSearchParams(location.hash.slice(1));if(next){params.set('node',next);params.delete('edge');location.hash=params.toString();}}});
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
