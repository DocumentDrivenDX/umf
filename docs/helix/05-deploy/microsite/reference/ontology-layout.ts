import {graphlib,layout} from '@dagrejs/dagre';

/** Compatibility for the still-pinned published schema browser 2.0 only.
 * The 2.1 candidate owns Lini geometry and never enters this path. Remove this
 * shim with the public browser pin upgrade; don't patch the installed package. */
export function legacyGraphLayout(svg:SVGSVGElement,model:{records:{id:string}[];edges:{id:string;source:string;target:string}[]},focus:string){
 const edges=focus?model.edges.filter(edge=>edge.source===focus||edge.target===focus):model.edges;
 const ids=new Set([focus,...edges.flatMap(edge=>[edge.source,edge.target])]);
 const records=focus?model.records.filter(record=>ids.has(record.id)):model.records;
 const nodes=[...svg.querySelectorAll<SVGAElement>('[aria-label^="Inspect record "]')],links=[...svg.querySelectorAll<SVGAElement>('[aria-label^="Inspect relationship "]')];
 const original=nodes.map(node=>{const rect=node.querySelector('rect')!;return {x:Number(rect.getAttribute('x')),y:Number(rect.getAttribute('y'))};});
 const sizes=records.map((record,index)=>{const node=nodes[index]!,rect=node.querySelector('rect')!,text=node.querySelector('text')!,width=Math.ceil(Math.max(140,text.getComputedTextLength()+24));rect.setAttribute('width',String(width));rect.setAttribute('height','64');node.querySelector('.map-count')!.setAttribute('y',String(original[index]!.y+48));node.dataset.modelId=record.id;return {id:record.id,width};});
 const layouts=balancedLayouts(sizes,edges);
 return (width:number,height:number)=>{
  const chosen=layouts.reduce((best,next)=>Math.min(width/next.width,height/next.height)>Math.min(width/best.width,height/best.height)?next:best);
  nodes.forEach((node,index)=>{const position=chosen.nodes.get(records[index]!.id)!;node.setAttribute('transform',`translate(${position.x-original[index]!.x} ${position.y-original[index]!.y})`);});
  links.forEach((node,index)=>{const edge=edges[index]!,geometry=chosen.edges.get(edge.id)!;node.dataset.source=edge.source;node.dataset.target=edge.target;node.querySelector('path')!.setAttribute('d',geometry.path);const circle=node.querySelector('circle')!,text=node.querySelector('text')!;circle.setAttribute('cx',String(geometry.x));circle.setAttribute('cy',String(geometry.y));text.setAttribute('x',String(geometry.x));text.setAttribute('y',String(geometry.y+4));});
  svg.setAttribute('viewBox',`0 0 ${chosen.width} ${chosen.height}`);return chosen;
 };
}

interface LayoutRecord {id:string;width:number}
interface LayoutEdge {id:string;source:string;target:string}
export interface BalancedLayout {
 width:number;height:number;
 nodes:Map<string,{x:number;y:number}>;
 edges:Map<string,{path:string;x:number;y:number}>;
 standalone:{x:number;y:number}|undefined;
}
/** Layout only: authored nodes, edge identities and direction remain unchanged. */
export function balancedLayouts(records:LayoutRecord[],edges:LayoutEdge[]):BalancedLayout[]{
 const connected=new Set(edges.flatMap(edge=>[edge.source,edge.target]));
 const standalone=records.filter(record=>!connected.has(record.id));
 const main=records;
 return (['LR','TB'] as const).map(rankdir=>{
  const graph=new graphlib.Graph({multigraph:true});
  graph.setGraph({rankdir,ranker:'network-simplex',nodesep:28,ranksep:72,edgesep:22,marginx:24,marginy:24});
  for(const record of main)graph.setNode(record.id,{width:record.width,height:64});
  for(const edge of edges)graph.setEdge(edge.source,edge.target,{width:22,height:22,labelpos:'c'},edge.id);
  layout(graph);
  const width=graph.graph().width??0,height=graph.graph().height??0;
  const nodes=new Map(main.map(record=>{const node=graph.node(record.id);return [record.id,{x:node.x-record.width/2,y:node.y-32}];}));
  const routed=new Map(edges.map(edge=>{
   const geometry=graph.edge({v:edge.source,w:edge.target,name:edge.id}),from=graph.node(edge.source),to=graph.node(edge.target),siblings=edges.filter(other=>other.source===edge.source&&other.target===edge.target),lane=siblings.findIndex(other=>other.id===edge.id)-(siblings.length-1)/2;
   const outgoing=edges.filter(other=>other.source===edge.source),incoming=edges.filter(other=>other.target===edge.target),sourceLane=outgoing.findIndex(other=>other.id===edge.id)-(outgoing.length-1)/2,targetLane=incoming.findIndex(other=>other.id===edge.id)-(incoming.length-1)/2,channel=lane*28+sourceLane*6;
   const horizontal=rankdir==='LR',direction=Math.sign(horizontal?to.x-from.x:to.y-from.y)||1;
   const start=horizontal?{x:from.x+direction*from.width/2,y:from.y+sourceLane*4+lane*6}:{x:from.x+sourceLane*4+lane*6,y:from.y+direction*32};
   const end=horizontal?{x:to.x-direction*to.width/2,y:to.y+targetLane*4}:{x:to.x+targetLane*4,y:to.y-direction*32};
   const bends=geometry.points.slice(1,-1).map((p:{x:number;y:number})=>({x:p.x+(horizontal?channel:0),y:p.y+(horizontal?0:channel)}));
   const points=[start];
   for(const p of bends){const previous=points.at(-1)!;points.push(horizontal?{x:p.x,y:previous.y}:{x:previous.x,y:p.y},p);}
   const last=points.at(-1)!;points.push(horizontal?{x:last.x,y:end.y}:{x:end.x,y:last.y},end);
   if(edge.source===edge.target)points.splice(0,points.length,...geometry.points);
   // Keep the numbered badge on its routed line after moving parallel lanes.
   let badge={x:geometry.x,y:geometry.y},distance=Infinity;
   for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,length=(b.x-a.x)**2+(b.y-a.y)**2;if(!length)continue;const t=Math.max(0,Math.min(1,((geometry.x-a.x)*(b.x-a.x)+(geometry.y-a.y)*(b.y-a.y))/length)),p={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)},d=(p.x-geometry.x)**2+(p.y-geometry.y)**2;if(d<distance){badge=p;distance=d;}}
   return [edge.id,{path:points.map((p,i)=>(i?'L':'M')+' '+p.x+' '+p.y).join(' '),...badge}];
  }));
  let note:BalancedLayout['standalone'];
  if(edges.length&&standalone.length){
   const left=Math.min(...standalone.map(record=>nodes.get(record.id)!.x)),right=Math.max(...standalone.map(record=>nodes.get(record.id)!.x+record.width));
   note={x:(left+right)/2,y:Math.min(...standalone.map(record=>nodes.get(record.id)!.y))-10};
  }
  return {width,height,nodes,edges:routed,standalone:note};
 });
}
