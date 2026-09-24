import {getOdcsDocumentNode,inspectOdcsDocument} from './index';
import {resolveOdcsReference} from './references';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export interface OdcsRelationshipReport {
 source:Document;status:'checked'|'blocked';complete:false;
 relationships:{path:string;scope:'schema'|'property';status:'resolved'|'blocked';pairs:{fromPath:string;toPath:string}[];diagnostics:Diagnostic[]}[];
 diagnostics:Diagnostic[];
}
/** Local endpoint pairing, not execution of referential-integrity constraints. */
export function inspectOdcsRelationships(document:Document,options:{maxRelationships?:number}={}):OdcsRelationshipReport {
 if(!options||typeof options!=='object')throw new UmfError('ODCS_RELATIONSHIP_OPTIONS','Expected relationship options');
 const max=options.maxRelationships===undefined?256:options.maxRelationships;
 if(!Number.isInteger(max)||max<1||max>2048)throw new UmfError('ODCS_RELATIONSHIP_OPTIONS','Expected relationship limit 1–2048');
 const source=copyJson(document) as unknown as Document,root=getOdcsDocumentNode(source,''),diagnostics=[...inspectOdcsDocument(source).diagnostics];
 const report:OdcsRelationshipReport={source,status:'checked',complete:false,relationships:[],diagnostics};
 const error=(list:Diagnostic[],code:string,path:string,message:string)=>{list.push({code,path,message,severity:'error'});report.status='blocked';};
 if(root.kind!=='object'||root.members.apiVersion?.kind!=='string'||root.members.apiVersion.value!=='v3.2.0'){error(diagnostics,'ODCS_RELATIONSHIP_VERSION','/apiVersion','Relationship interpretation is pinned to v3.2.0');return report;}
 const cache=new Map<string,{path:string|undefined;errors:Diagnostic[]}>();
 function lookup(reference:string,at:string,list:Diagnostic[]){
  if(!reference.length||reference.length>4096){error(list,'ODCS_RELATIONSHIP_REFERENCE',at,'Expected nonempty reference of at most 4096 characters');return undefined;}
  let result=cache.get(reference);if(!result){const r=resolveOdcsReference(source,{reference,usage:'foreignKey'});result={path:r.target?.path,errors:r.diagnostics.filter(d=>d.severity==='error')};cache.set(reference,result);}
  if(!result.path)for(const d of result.errors)error(list,d.code,at,d.message);
  return result.path;
 }
 let limited=false;
 function walk(node:NativeJson,path:string,scope:'schema'|'property'){
  if(limited)return;
  if(node.kind!=='object'){error(diagnostics,'ODCS_RELATIONSHIP_STRUCTURE',path,'Expected schema/property object');return;}
  const rels=node.members.relationships;
  if(rels){
   if(rels.kind!=='array')error(diagnostics,'ODCS_RELATIONSHIP_STRUCTURE',path+'/relationships','Expected relationship array');
   else{
    const ids=new Map<string,number>();for(const r of rels.items){const id=r.kind==='object'?r.members.id:undefined;if(id?.kind==='string')ids.set(id.value,(ids.get(id.value)??0)+1);}
    for(const [i,r] of rels.items.entries()){
     if(report.relationships.length>=max){error(diagnostics,'ODCS_RELATIONSHIP_LIMIT',path+'/relationships/'+i,'Relationship limit reached; remaining source retained');limited=true;return;}
     const p=path+'/relationships/'+i,row:OdcsRelationshipReport['relationships'][number]={path:p,scope,status:'blocked',pairs:[],diagnostics:[]};report.relationships.push(row);const ds=row.diagnostics;
     if(r.kind!=='object'){error(ds,'ODCS_RELATIONSHIP_STRUCTURE',p,'Expected relationship object');continue;}
     const {id,type,from,to}=r.members;
     if(id&&(id.kind!=='string'||!id.value||/[\s.#/\\@!%&^]/u.test(id.value)))error(ds,'ODCS_RELATIONSHIP_ID',p+'/id','Invalid stable relationship ID');
     if(id?.kind==='string'&&(ids.get(id.value)??0)>1)error(ds,'ODCS_RELATIONSHIP_ID',p+'/id','Duplicate ID in containing relationship array');
     if(type&&(type.kind!=='string'||type.value!=='foreignKey'))error(ds,'ODCS_RELATIONSHIP_TYPE',p+'/type','Unknown relationship type retained without interpretation');
     if(scope==='property'&&from)error(ds,'ODCS_RELATIONSHIP_FROM',p+'/from','Property-level from must remain implicit');
     if(scope==='schema'&&!from)error(ds,'ODCS_RELATIONSHIP_FROM',p,'Schema-level relationship requires from');
     if(!to)error(ds,'ODCS_RELATIONSHIP_TO',p,'Relationship requires to');
     if(ds.length)continue;
     let left:string[],right:string[];
     if(scope==='property'){
      if(to!.kind!=='string'){error(ds,'ODCS_RELATIONSHIP_PROPERTY_ARRAY',p+'/to','Only scalar targets interpreted for implicit single-property source; other native shapes retained');continue;}
      left=[];right=[to!.value];
     }else if(from!.kind==='string'&&to!.kind==='string'){left=[from!.value];right=[to!.value];}
     else if(from!.kind==='array'&&to!.kind==='array'){
      if(!from!.items.length||from!.items.length!==to!.items.length){error(ds,'ODCS_RELATIONSHIP_ARITY',p,'Composite from/to must be nonempty and have equal lengths');continue;}
      if(from!.items.length>128){error(ds,'ODCS_RELATIONSHIP_LIMIT',p,'Composite exceeds 128-column interpretation limit; source retained');continue;}
      if([...from!.items,...to!.items].some(n=>n.kind!=='string')){error(ds,'ODCS_RELATIONSHIP_REFERENCE',p,'Composite endpoints must be strings');continue;}
      left=from!.items.map(n=>(n as Extract<NativeJson,{kind:'string'}>).value);right=to!.items.map(n=>(n as Extract<NativeJson,{kind:'string'}>).value);
     }else{error(ds,'ODCS_RELATIONSHIP_SHAPE',p,'Schema-level endpoints must both be strings or both arrays');continue;}
     const pairs:typeof row.pairs=[];
     for(let j=0;j<right.length;j++){const fromPath=scope==='property'?path:lookup(left[j]!,p+'/from'+(from!.kind==='array'?'/'+j:''),ds),toPath=lookup(right[j]!,p+'/to'+(to!.kind==='array'?'/'+j:''),ds);if(fromPath&&toPath)pairs.push({fromPath,toPath});}
     if(!ds.length){row.status='resolved';row.pairs=pairs;}
    }
   }
  }
  const properties=node.members.properties;
  if(properties){if(properties.kind!=='array')error(diagnostics,'ODCS_RELATIONSHIP_STRUCTURE',path+'/properties','Expected properties array');else for(const [i,n] of properties.items.entries())walk(n,path+'/properties/'+i,'property');}
 }
 const schemas=root.members.schema;
 if(schemas?.kind!=='array')error(diagnostics,'ODCS_RELATIONSHIP_STRUCTURE','/schema','Expected schema array');else for(const [i,n] of schemas.items.entries())walk(n,'/schema/'+i,'schema');
 diagnostics.push({code:'ODCS_RELATIONSHIP_CONTEXT',path:'',severity:'warning',message:'Local relationship structure and ordered endpoint pairing only; no type/key compatibility, uniqueness, row checks, enforcement or external resource resolution'});
 return report;
}
