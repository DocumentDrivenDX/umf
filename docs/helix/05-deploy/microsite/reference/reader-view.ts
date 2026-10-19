import {treeValue,schemaNode,resolveSchema,shape,schemaRules,propertyPresence,unknownKeyPolicy,pointerPart,type Entry,type ReaderCatalog,type ApiReader,type Concept,type ReaderRow} from '../../reference/model';
const el=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const code=(text:string)=>{const n=el('pre',text);n.tabIndex=0;return n;};
export function readerRoute(id:string,pointer='',concept=''){return '#'+new URLSearchParams({entry:id,...(pointer?{pointer}:{}),...(concept?{concept}:{})});}
function anchor(text:string,href:string){const n=el('a',text) as HTMLAnchorElement;n.href=href;return n;}
function heading(parent:HTMLElement,text:string){parent.append(el('h3',text));}
function disclosure(parent:HTMLElement,title:string,body:HTMLElement){const d=el('details') as HTMLDetailsElement;d.append(el('summary',title),body);parent.append(d);return d;}
function table(parent:HTMLElement,headers:string[],rows:HTMLElement[][]){const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),r=el('tr');for(const h of headers)r.append(el('th',h));head.append(r);t.append(head);const body=el('tbody') as HTMLTableSectionElement;for(const cells of rows){const row=el('tr');row.append(...cells);body.append(row);}t.append(body);wrap.append(t);wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', ')+' table');const hint=el('p','Scroll the table horizontally to see all columns.','table-hint');parent.append(hint,wrap);return body;}
const cell=(s:string)=>el('td',s);
function contextualLink(e:Entry,ref:string){if(ref.startsWith('#/'))return readerRoute(e.id,ref.slice(1));const target=e.data.references.find((r:any)=>r.target===ref);return target?.resolvedId?readerRoute(target.resolvedId,ref.includes('#')?ref.slice(ref.indexOf('#')+1):''):undefined;}
function schemaExample(json:string,yaml:string){
 const group=el('div',undefined,'schema-example'),controls=el('div',undefined,'example-formats'),preview=code(yaml);
 controls.setAttribute('role','group');controls.setAttribute('aria-label','Example format');preview.dataset.format='yaml';
 const yamlButton=el('button','YAML','secondary') as HTMLButtonElement,jsonButton=el('button','JSON','secondary') as HTMLButtonElement;
 for(const [button,format]of [[yamlButton,'yaml'],[jsonButton,'json']] as const){button.type='button';button.setAttribute('aria-pressed',String(format==='yaml'));button.onclick=()=>{preview.textContent=format==='yaml'?yaml:json;preview.dataset.format=format;yamlButton.setAttribute('aria-pressed',String(format==='yaml'));jsonButton.setAttribute('aria-pressed',String(format==='json'));};}
 controls.append(yamlButton,jsonButton);group.append(controls,preview);return group;
}
export function schemaReader(parent:HTMLElement,e:Entry,pointer:string,reader:ReaderCatalog,concept:Concept|undefined,exampleYaml:string){
 const core=e.data.profileVersions.length>0;
 const root=e.data.sourceData,original=schemaNode(root,pointer),node=resolveSchema(root,original),s=treeValue(node),name=pointer.split('/').at(-1)??'';
 const breadcrumb=el('nav',undefined,'breadcrumbs');breadcrumb.setAttribute('aria-label','Definition path');breadcrumb.append(anchor('Document',readerRoute(e.id)));
 if(pointer.includes('/properties/')){const owner=pointer.slice(0,pointer.lastIndexOf('/properties/'));breadcrumb.append(el('span',' / '),anchor(concept?.title??owner.split('/').at(-1)??'Object',readerRoute(e.id,owner,concept?.key??'')));}if(pointer)breadcrumb.append(el('span',' / '+(concept&&concept.pointer===pointer?concept.title:name)));parent.append(breadcrumb);
 const title=concept&&concept.pointer===pointer?concept.title:pointer?name:'Document';
 parent.append(el('h2',title));const desc=concept&&concept.pointer===pointer?concept.description:(core?reader.propertyText[name]:undefined)||s?.description||'Inspect the value shape and rules for this definition.';parent.append(el('p',desc,'intro'));
 const copy=el('button','Copy exact link','secondary') as HTMLButtonElement;copy.onclick=async()=>{try{await navigator.clipboard.writeText(location.href);copy.textContent='Link copied';}catch{copy.textContent=location.href;}};parent.append(copy);
 if(concept?.role&&concept.pointer===pointer)parent.append(el('p','Use kind: "'+concept.role+'".'+(concept.role==='record'?' The keys below describe this definition. members lists its data Fields; keys declares identity tuples.':''),'callout'));
 const props=node?.members?.properties?.members;
 if(!props){heading(parent,'Value shape');parent.append(el('p',shape(root,original),'value-shape'));}
 const recognized=core&&root.members?.$defs?.members?.knownScalarType&&(name==='scalarType'||name==='knownScalarType')?schemaNode(root,'/$defs/knownScalarType'):(s?.enum?node:undefined);
 if(recognized){heading(parent,name==='scalarType'?'Recognized values':'Values');table(parent,['Value','Meaning'],(treeValue(recognized).enum??[]).map((value:string)=>[cell(value),cell(reader.scalarMeanings[value]??(value==='unspecified'?'No assertion. Native semantics remain separate.':'Explicit '+title.toLowerCase()+' label.'))]));}
 if(core&&name==='scalarType')parent.append(el('p','Other nonempty strings are structurally accepted and retained with unknown meaning. Missing scalarType asserts no scalar family. scalarType is not allowed on Record/Group or array/map containers.','callout'));
 if(core&&name==='itemType'){
  parent.append(el('p','Value: an object, not a scalar label or inline schema. Both module and element are required. The target must resolve to a Field; it describes array items or map values.','callout'),schemaExample('{ "module": "sales", "element": "tagValue" }','module: sales\nelement: tagValue\n'));
  parent.append(el('p','Allowed when kind = "field" and cardinality is "array" or "map". Omission leaves item meaning unasserted. Target resolution is a semantic check in addition to JSON shape validation.'));
 }
 if(props){
  heading(parent,'Keys');parent.append(el('p',unknownKeyPolicy(node),'quiet'));
  const label=el('label','Filter keys'),filter=el('input') as HTMLInputElement;filter.type='search';filter.id='key-filter';label.setAttribute('for',filter.id);parent.append(label,filter);
  const role=concept?.pointer===pointer?concept.role:undefined;
  const entries=Object.entries(props).sort(([a],[b])=>Number(propertyPresence(node,b,role)==='Required')-Number(propertyPresence(node,a,role)==='Required')||a.localeCompare(b));
  const rows=entries.map(([key,value]:[string,any])=>{
   const description=(core?reader.propertyText[key]:undefined)||treeValue(value)?.description||treeValue(resolveSchema(root,value))?.description||'See value shape and original constraints.';
   const presence=propertyPresence(node,key,concept?.pointer===pointer?concept.role:undefined);
   const keyCell=cell('');keyCell.append(anchor(key,readerRoute(e.id,(node===original?pointer:(original.members?.$ref?.value??'').slice(1))+'/properties/'+pointerPart(key),concept?.key??'')));
   return [keyCell,cell(description),cell(shape(root,value)),cell(presence)];
  });
  const applicable=rows.filter(row=>!row[3]!.textContent!.startsWith('Not allowed'));
  const prohibited=rows.filter(row=>row[3]!.textContent!.startsWith('Not allowed'));
  const body=table(parent,['Key','Meaning','Value','Presence / applicability'],applicable);
  let forbidden:HTMLTableSectionElement|undefined;
  if(prohibited.length){const panel=el('div');forbidden=table(panel,['Key','Meaning','Value','Presence / applicability'],prohibited);disclosure(parent,'Keys not allowed on '+role+' ('+prohibited.length+')',panel);}
  filter.oninput=()=>{for(const row of [...Array.from(body.rows),...Array.from(forbidden?.rows??[])])row.hidden=!row.textContent!.toLowerCase().includes(filter.value.toLowerCase());};
 }
 const role=concept?.pointer===pointer?concept.role:undefined;
 const rules=schemaRules(node,role);const ownerPointer=pointer.includes('/properties/')?pointer.slice(0,pointer.lastIndexOf('/properties/')):undefined;
 const ownerRules=ownerPointer!==undefined?schemaRules(resolveSchema(root,schemaNode(root,ownerPointer)),role).filter(r=>JSON.stringify(r.source).includes('"'+name+'"')):[];
 if(rules.length||ownerRules.length){heading(parent,'Rules and valid combinations');for(const r of [...ownerRules,...rules]){const block=el('div',undefined,'rule');block.append(el('p',r.text));disclosure(block,'Original rule',code(JSON.stringify(r.source,null,2)));parent.append(block);}}
 if(s?.default!==undefined)parent.append(el('p','Schema default annotation: '+JSON.stringify(s.default)+'. This does not insert a value.','callout'));
 if(pointer.includes('/properties/'))parent.append(el('p','Presence and explicit null are different. Omission is governed by the owner’s required/conditional rules; null is accepted only if the value schema explicitly permits it.','quiet'));
 if(e.id===reader.latest.id&&(concept||['scalarType','itemType','members','keys'].includes(name))){heading(parent,'Complete example');parent.append(el('p','A Record, a scalar Field, and an array Field with a separate item Field. All references use module and element IDs.'));
  disclosure(parent,'Show complete valid UMF document',schemaExample(JSON.stringify(reader.examples[0],null,2),exampleYaml));
  if(name==='itemType'||name==='scalarType')parent.append(el('p','Invalid combinations: itemType: "string" has the wrong shape; cardinality: "array" with scalarType: "string" assigns a scalar to the container. Use the separate tagValue Field shown above.','callout'));
 }
 const refs=new Set<string>();const visit=(n:any,depth=0)=>{if(depth>128||!n)return;if(n.kind==='object'){if(n.members.$ref?.value)refs.add(n.members.$ref.value);for(const v of Object.values(n.members))visit(v,depth+1);}else if(n.kind==='array')for(const v of n.items)visit(v,depth+1);};visit(original);
 if(refs.size){heading(parent,'Related types');const links=el('div',undefined,'chips');for(const ref of refs){const href=contextualLink(e,ref),label=ref.split('/').at(-1)??ref;links.append(href?anchor(label,href):el('span',ref+' · unresolved'));}parent.append(links);}
 const used=Object.keys(root.members?.$defs?.members??{}).filter(key=>JSON.stringify(root.members.$defs.members[key]).includes('"#'+pointer+'"'));
 if(pointer&&used.length){heading(parent,'Used by');const links=el('div',undefined,'chips');for(const key of used)links.append(anchor(key,readerRoute(e.id,'/$defs/'+pointerPart(key))));parent.append(links);}
 const defs=node?.members?.$defs?.members??node?.members?.definitions?.members;if(defs){const links=el('div',undefined,'chips');for(const key of Object.keys(defs))links.append(anchor(key,readerRoute(e.id,pointer+'/$defs/'+pointerPart(key))));disclosure(parent,'All schema definitions',links);}
 const graph=el('div',undefined,'graph');graph.setAttribute('aria-label','Selected definition references');for(const ref of refs){const href=contextualLink(e,ref);graph.append(href?anchor('$ref → '+ref,href):el('span',ref+' · unresolved'));}disclosure(parent,'Reference graph · '+refs.size+' selected-definition links',graph);
 disclosure(parent,'Original schema structure · exact number tokens',code(JSON.stringify(treeValue(original),null,2)));
}
export function apiReader(parent:HTMLElement,e:Entry,doc:ApiReader,reader:ReaderCatalog){
 parent.append(el('span',doc.kind,'entry-kind'),el('h2',e.title),el('p',doc.purpose,'intro'),el('p',doc.task,'version-context'));
 if(doc.kind==='Interface')parent.append(el('p','A TypeScript interface describes the members of an object. It is a compile-time type, not a callable operation.','quiet'));
 const packageName=e.data.entrypoint==='.'?'@umf/core':'@umf/core/'+e.data.entrypoint.replace(/^\.\//,'');const typeOnly=['Interface','Type alias'].includes(doc.kind);
 heading(parent,'Import');parent.append(code('import '+(typeOnly?'type ':'')+'{ '+e.title+' } from '+JSON.stringify(packageName)+';'));
 if(doc.value!==undefined){heading(parent,'Value');parent.append(code(doc.value));}
 if(doc.example){heading(parent,'Usage');parent.append(code(doc.example));}
 if(!doc.authored)parent.append(el('p','Generated structural documentation. A reviewed usage guide and behavioral restrictions have not yet been supplied for this export.','quiet'));
 function rows(title:string,items:ReaderRow[]){if(!items.length)return;heading(parent,title);table(parent,['Name','Type','Presence','Description / related types'],items.map(r=>{const detail=cell(r.description);for(const id of r.links){const target=reader.api.find(a=>a.id===id);if(target)detail.append(el('span',' '),anchor(target.title,'api.html'+readerRoute(id)));}return [cell(r.name),cell(r.type),cell(r.optional?'Optional / defaulted':'Required'),detail];}));}
 if(doc.kind==='Function'){rows('Parameters',doc.parameters);if(!doc.parameters.length){heading(parent,'Parameters');parent.append(el('p','No parameters.'));}heading(parent,'Returns');parent.append(code(doc.returns));}
 rows('Members',doc.members);
 if(doc.alternatives.length){heading(parent,'Type alternatives');for(const type of doc.alternatives)parent.append(code(type));}
 if(!doc.members.length&&doc.kind!=='Function'&&doc.value===undefined){if(doc.kind==='Schema')disclosure(parent,'Inferred TypeScript type',code(doc.type));else{heading(parent,'Type');parent.append(code(doc.type));}}
 if(doc.kind==='Function'||doc.kind==='Class'){
  heading(parent,'Runtime and errors');parent.append(el('p',e.data.runtime==='portable'?'Portable runtime classification. See the linked operation for version and subset limits.':'Runtime qualification: '+e.data.runtime+'. See the linked operation evidence for browser and native execution.'));
  parent.append(el('p','Failure behavior and preconditions remain owned by the operation contract and original declaration. This generated type view does not infer exceptions or insert defaults.','quiet'));
 }else if(typeOnly)parent.append(el('p','Compile-time type information; no runtime invocation.','quiet'));
 else disclosure(parent,'Runtime classification',el('p',e.data.runtime+' · The value’s identity does not establish registration or execution support for related operations.'));
 if(doc.related.length){heading(parent,'Related APIs');const links=el('div',undefined,'chips');for(const id of doc.related){const target=reader.api.find(a=>a.id===id);if(target)links.append(anchor(target.title,'api.html'+readerRoute(id)));}parent.append(links);}
 disclosure(parent,'Full original declaration',code(e.data.signatureText.join('\n\n')));
}
