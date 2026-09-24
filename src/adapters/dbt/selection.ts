import {inspectDbtManifestGraph,type DbtManifestGraph} from './graph';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
export interface DbtDependencySelection {
 source:Document;
 selection:{status:'selected'|'blocked';complete:false;roots:string[];includeMacros:boolean;maxDepth:number;maxNodes:number;
 nodes:(DbtManifestGraph['nodes'][number]&{depth:number})[];
 edges:DbtManifestGraph['edges'];
 boundary:{edge:DbtManifestGraph['edges'][number];reason:'macro-excluded'|'depth-limit'|'node-limit'}[];
 diagnostics:Diagnostic[];};
}
/** Upstream context selection. Full source accompanies the bounded view; this is not a runnable manifest subset. */
export function selectDbtManifestDependencies(document:Document,options:{roots:string[];includeMacros?:boolean;maxDepth?:number;maxNodes?:number}):DbtDependencySelection {
 if(!options||typeof options!=='object')throw new UmfError('DBT_SELECTION_OPTIONS','Expected selection options');
 if(!Array.isArray(options.roots)||options.roots.length<1||options.roots.length>64||options.roots.some(id=>typeof id!=='string'||!id.length||id.length>4096))throw new UmfError('DBT_SELECTION_OPTIONS','Provide 1–64 bounded nonempty root IDs');
 const includeMacros=options.includeMacros===undefined?false:options.includeMacros,maxDepth=options.maxDepth===undefined?16:options.maxDepth,maxNodes=options.maxNodes===undefined?256:options.maxNodes;
 if(typeof includeMacros!=='boolean'||!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>128||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>10000)throw new UmfError('DBT_SELECTION_OPTIONS','Expected boolean includeMacros, depth 0–128 and node limit 1–10000');
 const source=copyJson(document) as unknown as Document,graph=inspectDbtManifestGraph(source),roots=[...new Set(options.roots)],diagnostics=[...graph.diagnostics];
 const selection:DbtDependencySelection['selection']={status:'blocked',complete:false,roots,includeMacros,maxDepth,maxNodes,nodes:[],edges:[],boundary:[],diagnostics};
 const result={source,selection};if(graph.status==='blocked')return result;
 const index=new Map(graph.nodes.map(n=>[n.id,n])),outgoing=new Map<string,DbtManifestGraph['edges']>();
 for(const edge of graph.edges){let list=outgoing.get(edge.dependent);if(!list){list=[];outgoing.set(edge.dependent,list);}list.push(edge);}
 for(const id of roots)if(!index.has(id))diagnostics.push({code:'DBT_SELECTION_ROOT',path:'',severity:'error',message:'Root is not an active resource: '+id});
 if(roots.length>maxNodes)diagnostics.push({code:'DBT_SELECTION_ROOT',path:'',severity:'error',message:'Node limit cannot contain every requested root'});
 if(diagnostics.some(d=>d.severity==='error'))return result;
 const depths=new Map<string,number>(),queue:string[]=[];
 for(const id of roots){depths.set(id,0);queue.push(id);}
 for(let i=0;i<queue.length;i++){
  const id=queue[i]!,depth=depths.get(id)!;selection.nodes.push({...index.get(id)!,depth});
  for(const edge of outgoing.get(id)??[]){
   let reason:'macro-excluded'|'depth-limit'|'node-limit'|undefined;
   if(edge.kind==='macro'&&!includeMacros)reason='macro-excluded';
   else if(!depths.has(edge.dependency)){
    if(depth>=maxDepth)reason='depth-limit';
    else if(depths.size>=maxNodes)reason='node-limit';
    else{depths.set(edge.dependency,depth+1);queue.push(edge.dependency);}
   }
   if(reason)selection.boundary.push({edge:{...edge},reason});else selection.edges.push({...edge});
  }
 }
 selection.status='selected';diagnostics.push({code:'DBT_SELECTION_CONTEXT',path:'',severity:'warning',message:'Upstream explicit-reference view only. Full original source is retained; boundary entries record omitted edges. Not a standalone runnable manifest or complete SQL/Jinja context.'});
 return result;
}
