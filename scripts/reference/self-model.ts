import {join,resolve} from 'node:path';
import {readDocument,writeDocument,validateDocument,Registry,type Document,type ExtensionPackage} from '../../src/index';
import {canonical,selfModelGraph,type SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {concepts,propertyText} from './reader-content';
import {read,source,text,root,json} from './io';
export const modelPath='spec/metamodel/umf.yaml',packagePath='spec/metamodel/package.json';
const corePath='spec/core/semantic-types-document.schema.json',termPath='spec/core/semantic-type-reference.schema.json';
const vocabulary='umf.metamodel';
// Projections describe language objects, not instance populations or native storage types.
const projections=[
 ['document','Document','',undefined],['module','Module','/$defs/module',undefined],
 ['element','Element','/$defs/element',undefined],['record','Record','/$defs/element','record'],['field','Field','/$defs/element','field'],['group','Group','/$defs/element','group'],
 ['reference','Reference','/$defs/reference',undefined],['itemType','Item type','/$defs/itemType',undefined],
 ['key','Key','/$defs/key',undefined],['keyFieldReference','Field reference','/$defs/keyFieldReference',undefined],
 ['relationship','Relationship','/$defs/relationship',undefined],['relationshipEndpoint','Source endpoint','/$defs/relationshipEndpoint',undefined],
 ['relationshipTarget','Target endpoint','/$defs/relationshipTarget',undefined],['relationshipMultiplicity','Multiplicity','/$defs/relationshipMultiplicity',undefined],
 ['facets','Facets','/$defs/facets',undefined],['literal','Literal','/$defs/literal',undefined],
 ['semanticType','Semantic type reference','',undefined,termPath],['vocabulary','Vocabulary declaration','/properties/vocabularies/additionalProperties',undefined],
 ['default','Default','/$defs/element/properties/default',undefined],['extensions','Extension map','/$defs/extensions',undefined],
] as const;
const at=(data:any,pointer:string)=>pointer.split('/').slice(1).reduce((v,k)=>v[k.replaceAll('~1','/').replaceAll('~0','~')],data);
const meta=(path:string,pointer:string,schema:any,extra:Record<string,unknown>={})=>({[vocabulary]:{source:{path,pointer},schema,...extra}});
export async function expectedSelfModel():Promise<Document>{
 const core=await read(corePath),term=await read(termPath);const elements:any[]=[];
 const ref=(element:string)=>({module:'umf',element});
 const resolveSchema=(s:any):any=>s?.$ref?.startsWith('#/')?resolveSchema(at(core,s.$ref.slice(1))):s;
 const target=(s:any)=>projections.find(p=>(p[4]??corePath)===(s?.$ref===term.$id?termPath:corePath)&&p[2]===(s?.$ref===term.$id?'':s?.$ref?.slice(1)))?.[0];
 const allowed=(s:any,key:string,role?:string)=>(s.allOf??[]).every((r:any)=>{
  const kinds=r.if?.properties?.kind;return !(role&&kinds&&(kinds.const===role||kinds.enum?.includes(role))&&r.then?.properties?.[key]===false)&&!(role&&r.if?.required?.includes(key)&&r.then?.properties?.kind?.const&&r.then.properties.kind.const!==role);
 });
 for(const p of projections){
  const [id,name,pointer,role]=p,path=p[4]??corePath,s=at(path===termPath?term:core,pointer);
  const concept=concepts.find(c=>c.key===id||id==='key'&&c.key==='keys'||id==='relationship'&&c.key==='relationships');
  const description=concept?.description??s.description??`${name} in the UMF language. Exact constraints are retained with its source definition.`;
  const record:any={id,name,kind:'record',description,extensions:meta(path,pointer,s,{...(role?{role,specializes:'element'}:{}),...(concept?{concept:concept.key}:{}),coverage:'Descriptive projection. JSON Schema conditionals and cross-element checks remain authoritative.'}),members:[]};
  elements.push(record);
  for(const [key,value]of Object.entries(s.properties??{}) as [string,any][]){
   if(!allowed(s,key,role))continue;
   const fieldId=id+'.'+key,fp=pointer+'/properties/'+key,resolved=resolveSchema(value);
   const f:any={id:fieldId,name:key,kind:'field',description:propertyText[key]??value.description??`The ${key} property of ${name}; consult the retained schema for exact constraints.`,extensions:meta(path,fp,value,{presence:s.required?.includes(key)?'Required':s.allOf?.some((r:any)=>JSON.stringify(r).includes('"'+key+'"'))?'Conditional — see object rules':'Optional'}),cardinality:'one'};
   const addType=(dest:any,shape:any)=>{const t=target(shape);if(t&&t!=='literal'){dest.references=[{role:'record-type',...ref(t)}];return;}const rt=resolveSchema(shape);if(['string','boolean','integer'].includes(rt?.type))dest.scalarType=rt.type;if(rt?.enum?.every((v:any)=>typeof v==='string')){dest.scalarType='string';dest.allowedValues=rt.enum.map((v:string)=>({string:v}));}if(typeof rt?.const==='string'){dest.scalarType='string';dest.allowedValues=[{string:rt.const}];}};
   if(resolved?.type==='array'){
    f.cardinality='array';const itemId=fieldId+'.$item';f.itemType=ref(itemId);const item:any={id:itemId,name:key+' item',kind:'field',extensions:meta(path,fp,value,{coverage:'Array item type projection; exact container constraints remain on the property.'}),cardinality:'one'};addType(item,resolved.items);elements.push(item);
   }else addType(f,value);
   // Literal is a tagged union, not a Record value type. Never assert one branch is universal.
   record.members.push(ref(fieldId));elements.push(f);
  }
 }
 // Conceptual resolution links are metadata, distinct from instance relationships.
 const connections=[['document','vocabulary','declares vocabularies'],['record','field','members resolve to Fields'],['field','literal','carries examples and allowed values'],['field','default','declares a default'],['group','element','specializes'],['record','element','specializes'],['field','element','specializes'],['reference','element','resolves target'],['itemType','field','resolves item Field'],['keyFieldReference','field','resolves member Field'],['relationshipEndpoint','record','resolves source Record'],['relationshipTarget','record','resolves target Record']];
 for(const [from,to,label]of connections){const owner=elements.find(e=>e.id===from);const payload=owner.extensions[vocabulary];(payload.connections??=[]).push({target:ref(to!),label});}
 const doc={umf:'0.10.0',id:'urn:umf:metamodel',title:'UMF for UMF',vocabularies:{[vocabulary]:{version:'0.1.0'}},extensions:{[vocabulary]:{source:{path:corePath,pointer:''},schema:core,coverage:'Current core language objects, properties and conceptual references. Bootstrap JSON Schema and semantic validators remain authoritative; no native enforcement or complete instance validator is generated from this model.'}},modules:[{id:'umf',namespace:'umf.metamodel',elements}]};
 const registry=new Registry().register(await read(packagePath) as ExtensionPackage),result=validateDocument(doc,registry);if(!result.valid)throw Error('SELF_MODEL_INVALID '+JSON.stringify(result.diagnostics));return doc as unknown as Document;
}
export async function loadSelfModel(){
 const expected=await expectedSelfModel(),actual=readDocument(await text(modelPath),'yaml');await source(modelPath);
 if(canonical(actual)!==canonical(expected))throw Error('SELF_MODEL_DRIFT update and review spec/metamodel/umf.yaml against its canonical source');
 return actual;
}
export async function buildSelfModel(stage:string){
 const document=await loadSelfModel(),sources=await Promise.all([modelPath,packagePath,corePath,termPath].map(p=>source(p)));
 const catalog:SelfModelCatalog={profile:'umf.metamodel/1',document:document as any,sources};selfModelGraph(catalog);
 await Bun.write(join(stage,'metamodel.json'),json(catalog));await Bun.write(join(stage,'umf.yaml'),await text(modelPath));await Bun.write(join(stage,'umf.json'),json(document));
}
if(import.meta.main){if(process.argv[2]==='--write')await Bun.write(resolve(root,modelPath),writeDocument(await expectedSelfModel(),'yaml'));else console.log((await loadSelfModel()).id);}
