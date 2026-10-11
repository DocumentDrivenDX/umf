import {getDbtManifestNode,inspectDbtManifest} from './index';
import {renderTree} from '../../model/native-json';
import {pointer,type Document,type Diagnostic} from '../../model/types';
export interface DbtManifestGraph {
 status:'checked'|'blocked';complete:false;
 nodes:{id:string;collection:string;path:string}[];
 edges:{dependent:string;dependency:string;kind:'resource'|'macro';path:string;resolved:boolean}[];
 diagnostics:Diagnostic[];
}
/** Explicit manifest references only; edges point from dependent to dependency. */
export function inspectDbtManifestGraph(document:Document):DbtManifestGraph {
 const root=JSON.parse(renderTree(getDbtManifestNode(document,''))),diagnostics=[...inspectDbtManifest(document).diagnostics],nodes:DbtManifestGraph['nodes']=[],edges:DbtManifestGraph['edges']=[];
 const finish=():DbtManifestGraph=>({status:diagnostics.some(d=>d.severity==='error')?'blocked':'checked',complete:false,nodes,edges,diagnostics});
 const error=(path:string,message:string)=>diagnostics.push({code:'DBT_MANIFEST_GRAPH',path,message,severity:'error'});
 if(root.metadata.dbt_schema_version!=='https://schemas.getdbt.com/dbt/manifest/v12.json'){error('/metadata/dbt_schema_version','Unknown version: dependency interpretation unavailable');return finish();}
 const resourceCollections=['nodes','sources','exposures','metrics','semantic_models','saved_queries','unit_tests'];
 const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const index=new Map<string,{collection:string;value:any;path:string}|null>();
 for(const collection of [...resourceCollections,'macros','docs','groups']){
  if(!object(root[collection])){error('/'+collection,'Expected resource dictionary');continue;}
  for(const [id,value] of Object.entries(root[collection])){
   const path='/'+collection+'/'+pointer(id);nodes.push({id,collection,path});
   if(!object(value)||(value as any).unique_id!==id){error(path+'/unique_id','Resource key must equal its declared unique_id');index.set(id,null);continue;}
   if(index.has(id)){error(path,'Duplicate active resource identity');index.set(id,null);}else index.set(id,{collection,value,path});
  }
 }
 for(const [id,entry] of index){if(!entry||![...resourceCollections,'macros'].includes(entry.collection))continue;const deps=entry.value.depends_on;if(deps===undefined)continue;if(!object(deps)){error(entry.path+'/depends_on','Expected dependency object');continue;}
  for(const [key,kind] of [['nodes','resource'],['macros','macro']] as const){
   const values=deps[key];if(values===undefined)continue;const path=entry.path+'/depends_on/'+key;
   if(!Array.isArray(values)){error(path,'Expected dependency list');continue;}
   values.forEach((dependency:any,i:number)=>{
    if(typeof dependency!=='string'){error(path+'/'+i,'Expected dependency ID string');return;}
    const target=index.get(dependency),resolved=!!target&&(kind==='macro'?target.collection==='macros':resourceCollections.includes(target.collection));
    edges.push({dependent:id,dependency,kind,path:path+'/'+i,resolved});
    if(!resolved)error(path+'/'+i,'Dependency has no unique active target of the expected kind: '+dependency);
   });
  }
 }
 const resources=nodes.filter(n=>resourceCollections.includes(n.collection)),parents=new Map<string,Set<string>>(),children=new Map<string,Set<string>>();
 for(const n of resources){parents.set(n.id,new Set());children.set(n.id,new Set());}
 for(const e of edges)if(e.kind==='resource'&&e.resolved&&parents.has(e.dependent)){parents.get(e.dependent)!.add(e.dependency);children.get(e.dependency)?.add(e.dependent);}
 for(const [key,expected] of [['parent_map',parents],['child_map',children]] as const){
  const map=root[key];if(!object(map)){error('/'+key,'Expected redundant dependency map');continue;}
  for(const [id,values] of Object.entries(map)){
   const path='/'+key+'/'+pointer(id),wanted=expected.get(id);
   if(!wanted){error(path,'Map entry is not an active graph resource');continue;}
   if(!Array.isArray(values)||values.some(v=>typeof v!=='string')){error(path,'Expected ID list');continue;}
   const actual=new Set(values);if(actual.size!==wanted.size||[...wanted].some(v=>!actual.has(v)))error(path,'Redundant map disagrees with explicit resource dependencies');
  }
  for(const id of expected.keys())if(!Object.hasOwn(map,id))error('/'+key+'/'+pointer(id),'Missing active resource map entry');
 }
 diagnostics.push({code:'DBT_MANIFEST_GRAPH_INCOMPLETE',path:'',severity:'warning',message:'Explicit active references and redundant maps only; disabled alternatives, inferred SQL/Jinja references, group semantics, cycle legality and execution are not validated. Duplicate edge occurrences are retained.'});
 return finish();
}
