// SPDX-License-Identifier: MIT OR Apache-2.0
import {renderVisual} from './visual-client';
import {recordMapProjection,type ComponentModel} from './visual-model';
import {attachLiniSvg} from './lini-svg';
import {pretty} from './format-runtime';
import type {Annotation} from './types';
export interface RecordMapOptions {
 focus?:string;annotations?:Record<string,Annotation[]>;
 runtimeBaseUrl?:string;
 onNavigate?:(id:string,kind?:'record'|'relationship')=>void;
 onFocusChange?:(id:string)=>void;
}
export function renderRecordMap(root:HTMLElement,initial:ComponentModel,options:RecordMapOptions={}){
 const doc=root.ownerDocument;
 const el=(tag:string,text?:string)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const section=el('section');section.className='umf-record-map-view';section.dataset.renderer='umf.visual/lini';
 const controls=el('div');controls.className='map-controls';
 const label=el('label','Focus: '),select=doc.createElement('select');select.setAttribute('aria-label','Focus record');label.append(select);
 const full=doc.createElement('button');full.type='button';full.textContent='Show full model';controls.append(label,full);
 const canvas=el('div');canvas.className='ontology-map';section.append(controls,canvas);root.append(section);
 let model=initial,generation=0,destroyed=false,drawing:ReturnType<typeof attachLiniSvg>|undefined;
 let lifecycle:MutationObserver|undefined;
 let ready:Promise<void>=Promise.resolve();
 const choices=(focus:string)=>{select.replaceChildren();const option=(text:string,value:string)=>{const o=doc.createElement('option');o.textContent=text;o.value=value;select.append(o);};option('Full model','');for(const record of model.records)option(record.label??record.id,record.id);select.value=focus;};
 const navigate=(element:Element,id:string,kind:'record'|'relationship',text:string)=>{
  element.setAttribute('tabindex','0');element.setAttribute('role','link');element.setAttribute('aria-label',text);element.setAttribute('data-model-id',id);
  element.addEventListener('click',()=>options.onNavigate?.(id,kind));
  element.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key==='Enter'||e.key===' '){e.preventDefault();options.onNavigate?.(id,kind);}});
 };
 const draw=(focus:string)=>{
  const current=++generation,startedConnected=section.isConnected;lifecycle?.disconnect();drawing?.destroy();drawing=undefined;canvas.replaceChildren();section.dataset.state='rendering';
  ready=(async()=>{
   const projection=recordMapProjection(model,focus,options.annotations);
   const summaryText=(drawn:number)=>`${focus?'Neighborhood':'Full model'} · ${projection.records.length} of ${projection.source.records.length} records · ${drawn} of ${projection.source.edges.length} relationships drawn`;
   const summary=el('p',summaryText(0));summary.className='map-summary';canvas.append(summary);
   const pending=el('p','Drawing the relationship map…');pending.setAttribute('role','status');canvas.append(pending);
   const graph=el('div');graph.className='lini-drawing';canvas.append(graph);
   const legend=el('div');legend.className='map-relationships';
   for(const [index,edge] of projection.edges.entries()){const line=el('p'),button=doc.createElement('button');button.type='button';button.textContent=String(index+1)+'. '+(edge.label??edge.id)+(edge.status&&edge.status!=='unchanged'?' · '+edge.status:'');button.onclick=()=>options.onNavigate?.(edge.id,'relationship');line.append(button);
    for(const note of options.annotations&&Object.hasOwn(options.annotations,edge.id)?options.annotations[edge.id]!:[]){const badge=el('span',note.badge);badge.className='umf-annotation';badge.title=note.tooltip??'';badge.dataset.tone=note.tone??'neutral';line.append(badge);}legend.append(line);
   }canvas.append(legend);
   if(projection.unresolved.length)canvas.append(el('p',`${projection.unresolved.length} relationships have endpoints outside this record model; their declarations remain in the legend.`));
   const details=el('details');details.append(el('summary','Drawing source & projection limits'),el('p',projection.visual.omissions[0]));const source=el('pre',pretty({source:projection.source,annotations:projection.annotations,visual:projection.visual}));source.tabIndex=0;details.append(source);canvas.append(details);
   if(!projection.records.length){pending.textContent='No records to draw.';section.dataset.state='ready';return;}
   const {edges,...withoutEdges}=projection.visual;
   const document={umf:'0.10.0' as const,id:'schema-record-map',vocabularies:{'umf.visual':{version:'1.3.0'}},extensions:{'umf.visual':edges.length?projection.visual:withoutEdges},modules:[]};
   const result=await renderVisual(document,options.runtimeBaseUrl);
   if(destroyed||current!==generation||startedConnected&&!section.isConnected)return;
   if(!result.ok)throw Error(result.diagnostics.map(item=>item.code+' '+item.path+': '+item.message).join('\n'));
   drawing=attachLiniSvg(graph,result.svg);const svg=drawing.svg;
   svg.setAttribute('role','group');svg.setAttribute('aria-label',focus?'Record relationship neighborhood':'Full record relationship map');
   svg.dataset.nativeVersion=result.nativeVersion;
   const nativeNodes=new Map(result.elementMap.filter(item=>item.kind==='node').map(item=>[item.logicalId,item.nativeId]));
   const nativeEdges=new Set(result.elementMap.filter(item=>item.kind==='edge').map(item=>item.logicalId));
   if(nativeNodes.size!==projection.recordIds.size||[...projection.recordIds.keys()].some(id=>!nativeNodes.has(id))||nativeEdges.size!==projection.edgeIds.size||[...projection.edgeIds.keys()].some(id=>!nativeEdges.has(id)))throw Error('Lini omitted source identities from its presentation map');
   for(const item of result.elementMap){
    if(item.kind==='node'){
     const id=projection.recordIds.get(item.logicalId);if(id===undefined)continue;
     const element=[...svg.querySelectorAll('g.lini-node[data-id]')].find(node=>node.getAttribute('data-id')===item.nativeId);
     if(!element)throw Error('Lini omitted record identity '+id);
     const record=projection.records.find(record=>record.id===id)!;element.setAttribute('data-status',record.status??'unchanged');navigate(element,id,'record','Inspect record '+(record.label??id)+' · '+(record.status??'unchanged'));
    }else if(item.kind==='edge'){
     const id=projection.edgeIds.get(item.logicalId);if(id===undefined)continue;
     const element=[...svg.querySelectorAll('g.lini-link')].find(node=>node.classList.contains(item.nativeId)||node.classList.contains('lini-style-'+item.nativeId));
     if(!element)throw Error('Lini omitted relationship identity '+id);
     const edge=projection.drawable.find(edge=>edge.id===id)!,visualEdge=projection.visual.edges.find(edge=>edge.id===item.logicalId)!;
     const endpoint=(name:string)=>element.getAttribute(name)?.split('.').at(-1);
     if(endpoint('data-from')!==nativeNodes.get(visualEdge.from)||endpoint('data-to')!==nativeNodes.get(visualEdge.to))throw Error('Lini relationship endpoint mismatch: '+id);
     if(!!element.querySelector('.lini-marker-arrow')!==(edge.directed===true))throw Error('Lini relationship direction mismatch: '+id);
     element.setAttribute('data-source',edge.source);element.setAttribute('data-target',edge.target);element.setAttribute('data-status',edge.status??'unchanged');navigate(element,id,'relationship','Inspect relationship '+(edge.label??id)+' · '+(edge.status??'unchanged'));
    }
   }
   details.append(el('pre',pretty({omissions:result.omissions,approximations:result.approximations})));
   lifecycle=new doc.defaultView!.MutationObserver(()=>{if(!section.isConnected){lifecycle?.disconnect();drawing?.destroy();drawing=undefined;destroyed=true;generation++;}});
   if(section.isConnected)lifecycle.observe(doc,{childList:true,subtree:true});
   pending.remove();summary.textContent=summaryText(projection.drawable.length);section.dataset.state='ready';section.dispatchEvent(new CustomEvent('umf:record-map-ready',{bubbles:true}));
  })().catch(error=>{if(!destroyed&&current===generation){drawing?.destroy();drawing=undefined;section.dataset.state='error';const message=el('p','Diagram unavailable: '+(error instanceof Error?error.message:String(error)));message.setAttribute('role','alert');canvas.prepend(message);canvas.querySelector('[role="status"]')?.remove();}throw error;});
  // Existing synchronous consumers can inspect errors in the DOM. Consumers
  // needing a finished graph await the same promise returned by ready/update.
  void ready.catch(()=>{});return ready;
 };
 choices(options.focus??'');select.onchange=()=>{void draw(select.value);options.onFocusChange?.(select.value);};full.onclick=()=>{select.value='';void draw('');options.onFocusChange?.('');};void draw(options.focus??'');
 return {get ready(){return ready;},update(next:ComponentModel){model=next;const focus=model.records.some(record=>record.id===select.value)?select.value:'';choices(focus);return draw(focus);},destroy(){destroyed=true;generation++;lifecycle?.disconnect();drawing?.destroy();section.remove();}};
}
