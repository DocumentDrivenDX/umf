import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {getOpenapiNode} from './index';
import {indexOpenapiSchemas,resolveOpenapiSchemaReference} from './scope';
/** Resolve one $dynamicRef against an explicit outermost-to-innermost resource stack. */
export function resolveOpenapiDynamicReference(document:Document,input:{pointer:string;resourceUri?:string;schemaResources?:string[];evaluationScope:string[]}){
 const options=copyJson(input) as unknown as typeof input;
 if(options.schemaResources!==undefined&&(!Array.isArray(options.schemaResources)||options.schemaResources.some(x=>typeof x!=='string'))||typeof options.pointer!=='string'||options.resourceUri!==undefined&&typeof options.resourceUri!=='string'||!Array.isArray(options.evaluationScope)||!options.evaluationScope.length||options.evaluationScope.length>128||options.evaluationScope.some(x=>typeof x!=='string')||Object.keys(options).some(k=>!['pointer','resourceUri','schemaResources','evaluationScope'].includes(k)))throw new UmfError('OPENAPI_DYNAMIC_OPTIONS','A source schema and 1–128 outermost-to-innermost scope resource URIs are required');
 const index=indexOpenapiSchemas(document,options.schemaResources?{schemaResources:options.schemaResources}:{});
 const scope=options.evaluationScope.map(value=>{const uri=new URL(value);if(uri.hash)throw new UmfError('OPENAPI_DYNAMIC_SCOPE','Scope must contain fragment-free resource identities');const id=uri.href.replace(/#$/,'');if(!index.identifiers[id])throw new UmfError('OPENAPI_DYNAMIC_SCOPE','Scope resource is not indexed: '+id);return id;});
 const node=getOpenapiNode(document,options.pointer,options.resourceUri);
 const ref=node.kind==='object'?node.members.$dynamicRef:undefined;if(ref?.kind!=='string')throw new UmfError('OPENAPI_DYNAMIC_SOURCE','Selected schema must contain a string $dynamicRef');
 const initial=resolveOpenapiSchemaReference(document,{pointer:options.pointer,reference:ref.value,...(options.resourceUri?{resourceUri:options.resourceUri}:{}),...(options.schemaResources?{schemaResources:options.schemaResources}:{})});
 const last=index.identifiers[scope.at(-1)!]!;const owning=index.identifiers[initial.source.baseUri];
 if(!owning||last.retrievalUri!==owning.retrievalUri||last.pointer!==owning.pointer)throw new UmfError('OPENAPI_DYNAMIC_SCOPE','Innermost scope resource must own the source schema');
 const fragment=decodeURIComponent(new URL(ref.value,initial.source.baseUri).hash.slice(1));
 const anchor=initial.node.kind==='object'?initial.node.members.$dynamicAnchor:undefined;
 let target=initial.target;let targetNode=initial.node;let resolution:'static'|'dynamic'='static';
 if(fragment&&!fragment.startsWith('/')&&anchor?.kind==='string'&&anchor.value===fragment){
  for(const uri of scope){
   // A scope resource can use a retrieval alias; static lookup already handles aliases.
   const identity=index.identifiers[uri]!;
   let candidate=index.identifiers[uri+'#'+fragment];
   if(!candidate)for(const [alias,position]of Object.entries(index.identifiers))if(!alias.includes('#')&&position.retrievalUri===identity.retrievalUri&&position.pointer===identity.pointer&&index.identifiers[alias+'#'+fragment])candidate=index.identifiers[alias+'#'+fragment];
   if(!candidate)continue;
   const value=getOpenapiNode(document,candidate.pointer,candidate.retrievalUri);
   if(value.kind!=='object'||value.members.$dynamicAnchor?.kind!=='string'||value.members.$dynamicAnchor.value!==fragment)continue;
   target=index.locations.find(p=>p.retrievalUri===candidate.retrievalUri&&p.pointer===candidate.pointer)!;targetNode=value;resolution='dynamic';break;
  }
 }
 return {source:initial.source,initialTarget:initial.target,target,node:targetNode,evaluationScope:scope,resolution,complete:false as const,limitations:['Caller supplies evaluation scope; this operation does not derive or certify an instance evaluation path','One dynamic reference is resolved; assertions and annotation propagation are not evaluated','Static projection still rejects dynamic scope because flattening it would change resource boundaries']};
}
