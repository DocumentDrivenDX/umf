import jsonld from 'jsonld';
import {importGeneralizedRdfDataset,getGeneralizedRdfQuads} from '../generalized-rdf';
import {wellFormedIri,wellFormedLanguage} from './rdf-terms';
import {importRdfNQuads,inspectRdfDocument,getRdfQuads,getRdfNamedGraphs,exportRdfNQuads,RDF_EXTENSION} from '../rdf';
import {flatten as flattenExpanded} from 'jsonld/lib/flatten';
import manifest from '../../../spec/extensions/jsonld/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const JSONLD_EXTENSION='umf.jsonld';
export const jsonldPackage=manifest as unknown as ExtensionPackage;
interface Context {url:string;documentUrl:string;root:NativeJson;originalSource:string}
interface Payload {profile:'jsonld-source';processingMode:'json-ld-1.0'|'json-ld-1.1';baseIRI:string;root:NativeJson;originalSource:string;contexts:Context[];expandContext?:NativeJson}
function absolute(value:string){try{new URL(value);}catch{throw new UmfError('JSONLD_IRI','Expected absolute document/base URL');}}
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'JSONLD_CONTEXT',path:'',severity:'warning',message:'Source representation only; semantic expansion is a separate asynchronous proposal. Original source, unknown native values and exact numeric tokens remain archived. No RDF conversion, ontology validation or retrieval is asserted.'}];
 const unknown=(o:object,keys:string[],path:string)=>{if(Object.keys(o).some(k=>!keys.includes(k)))ds.push({code:'JSONLD_REPRESENTATION',path,severity:'warning',message:'Unknown representation fields are retained and block native export/expansion'});};
 const tree=(n:NativeJson,path:string)=>{unknown(n,n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value'],path);if(n.kind==='array')n.items.forEach((v,i)=>tree(v,path+'/'+i));if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tree(v,path+'/'+pointer(k));};
 unknown(p,['profile','processingMode','baseIRI','root','originalSource','contexts','expandContext'],'');tree(p.root,'/root');if(p.expandContext)tree(p.expandContext,'/expandContext');
 try{absolute(p.baseIRI);parseNativeJson(p.originalSource);const urls=new Set<string>();p.contexts.forEach((c,i)=>{unknown(c,['url','documentUrl','root','originalSource'],'/contexts/'+i);tree(c.root,'/contexts/'+i+'/root');absolute(c.url);absolute(c.documentUrl);if(urls.has(c.url))throw new Error('Duplicate supplied context URL: '+c.url);urls.add(c.url);parseNativeJson(c.originalSource);});}catch(e){ds.push({code:'JSONLD_SOURCE',path:'',severity:'error',message:String(e)});}return ds;
}
export function jsonldRegistry(){return new Registry().register(jsonldPackage,inspect);}
export function inspectJsonLdDocument(document:Document){return validateDocument(document,jsonldRegistry());}
function payload(document:Document):Payload{const c=inspectJsonLdDocument(document);if(!c.valid)throw new UmfError('JSONLD_DOCUMENT',JSON.stringify(c.diagnostics));const p=document.modules.find(m=>m.id==='jsonld')?.elements.find(e=>e.id==='document')?.extensions[JSONLD_EXTENSION];if(!p||document.vocabularies[JSONLD_EXTENSION]?.version!=='0.1.0')throw new UmfError('JSONLD_PAYLOAD','Expected pinned JSON-LD payload');return copyJson(p) as unknown as Payload;}
export function importJsonLdDocument(text:string,options:{id:string;baseIRI:string;processingMode?:'json-ld-1.0'|'json-ld-1.1';contexts?:{url:string;documentUrl?:string;text:string}[];expandContext?:string}):Document{
 const p:Payload={profile:'jsonld-source',processingMode:options.processingMode??'json-ld-1.1',baseIRI:options.baseIRI,root:parseNativeJson(text),originalSource:text,contexts:(options.contexts??[]).map(c=>({url:c.url,documentUrl:c.documentUrl??c.url,root:parseNativeJson(c.text),originalSource:c.text})),...(options.expandContext===undefined?{}:{expandContext:parseNativeJson(options.expandContext)})};
 const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[JSONLD_EXTENSION]:{version:'0.1.0'}},modules:[{id:'jsonld',namespace:'',elements:[{id:'document',extensions:{[JSONLD_EXTENSION]:p as unknown as Json}}]}]};payload(d);return d;
}
export function exportJsonLdDocument(document:Document):string{const p=payload(document);if(inspectJsonLdDocument(document).diagnostics.some(d=>d.code==='JSONLD_REPRESENTATION'))throw new UmfError('JSONLD_EXPORT','Unknown representation fields cannot be discarded');return renderTree(parseNativeJson(p.originalSource))===renderTree(p.root)?p.originalSource:renderTree(p.root)+'\n';}
export function getJsonLdNode(document:Document,path:string):NativeJson{let n=payload(document).root;for(const k of nativePointer(path))n=treeChild(n,k);return copyJson(n) as unknown as NativeJson;}
export function proposeJsonLdNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('JSONLD_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='jsonld')!.elements.find(e=>e.id==='document')!.extensions[JSONLD_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectJsonLdDocument(next)};}
// Compare decimal values without expanding a potentially huge exponent.
function decimal(s:string){const [m,e='0']=s.toLowerCase().split('e'),negative=m!.startsWith('-'),parts=m!.replace('-','').split('.');let digits=(parts[0]!+(parts[1]??'')).replace(/^0+/,'');let exponent=BigInt(e)-BigInt((parts[1]??'').length);while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}return digits?[negative,digits,exponent.toString()]:[negative,'0','0'];}
const exactNumbers=new WeakMap<object,string>();
class ExactExpansionNumber extends Number {
 constructor(token:string){super(0);Object.defineProperty(this,Symbol.for('umf.jsonld.exact-number'),{value:true});exactNumbers.set(this,token);Object.freeze(this);}
 override valueOf():number{throw new UmfError('JSONLD_NUMBER_OPERATION','Exact expansion number cannot be coerced for arithmetic');}
 override toString():string{return exactNumbers.get(this)!;}
 [Symbol.for('umf.jsonld.number-equals')](other:unknown):boolean {const token=typeof other==='number'&&Number.isFinite(other)?(Object.is(other,-0)?'-0':JSON.stringify(other)):other&&typeof other==='object'?exactNumbers.get(other):undefined;return token!==undefined&&JSON.stringify(decimal(this.toString()))===JSON.stringify(decimal(token));}
 toJSON(){return {$umfExactNumber:exactNumbers.get(this)!};}
}
function interoperable(n:NativeJson):unknown {
 if(n.kind==='object'){
  const m=n.members;if(m['@context']?.kind==='object'&&Object.hasOwn(m['@context'].members,'@context'))throw new UmfError('JSONLD_PROCESSOR_GAP','Nested @context keyword redefinition is not reliably rejected by jsonld.js 9.0.0; source is retained');
  return Object.fromEntries(Object.entries(m).map(([k,v])=>[k,interoperable(v)]));
 }
 if(n.kind==='array')return n.items.map(interoperable);
 if(n.kind==='number'){const v=Number(n.value);return !Number.isFinite(v)||Object.is(v,-0)||JSON.stringify(decimal(n.value))!==JSON.stringify(decimal(JSON.stringify(v)))?new ExactExpansionNumber(n.value):v;}
 return n.kind==='null'?null:n.value;
}
function expandedTree(value:unknown):NativeJson {
 if(value&&typeof value==='object'&&exactNumbers.has(value))return {kind:'number',value:exactNumbers.get(value)!};
 if(value===null)return {kind:'null'};
 if(typeof value==='string')return {kind:'string',value};if(typeof value==='boolean')return {kind:'boolean',value};
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw new UmfError('JSONLD_NUMBER_OPERATION','Processor generated an unsupported numeric value');return {kind:'number',value:JSON.stringify(value)};}
 if(Array.isArray(value))return {kind:'array',items:value.map(expandedTree)};
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return {kind:'object',members:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expandedTree(v)]))};
 throw new UmfError('JSONLD_EXPANDED_VALUE','Processor generated a non-JSON value');
}
export interface JsonLdExpansionReport {source:Document;lossPolicy:'report'|'reject';status:'candidate'|'blocked';complete:false;candidate?:Document;resourcesUsed:string[];diagnostics:Diagnostic[]}
export interface JsonLdFlattenReport extends JsonLdExpansionReport {context:NativeJson|null;compactArrays:boolean}
export async function proposeJsonLdExpansion(document:Document,options:{lossPolicy:'report'|'reject'}):Promise<JsonLdExpansionReport>{return processJsonLd(document,options);}
export async function proposeJsonLdFlatten(document:Document,options:{lossPolicy:'report'|'reject';context?:string;compactArrays?:boolean}):Promise<JsonLdFlattenReport>{
 if(!options||(options.compactArrays!==undefined&&typeof options.compactArrays!=='boolean')||(options.context!==undefined&&typeof options.context!=='string'))throw new UmfError('JSONLD_OPTIONS','Expected JSON context text and boolean compactArrays');
 const context=options.context===undefined?null:parseNativeJson(options.context);
 return processJsonLd(document,options,{context,compactArrays:options.compactArrays??true}) as Promise<JsonLdFlattenReport>;
}
export interface JsonLdCompactionReport extends JsonLdExpansionReport {context:NativeJson;compactArrays:boolean;compactToRelative:boolean}
export async function proposeJsonLdCompaction(document:Document,options:{lossPolicy:'report'|'reject';context:string;compactArrays?:boolean;compactToRelative?:boolean}):Promise<JsonLdCompactionReport>{
 if(!options||typeof options.context!=='string'||[options.compactArrays,options.compactToRelative].some(v=>v!==undefined&&typeof v!=='boolean'))throw new UmfError('JSONLD_OPTIONS','Expected target context JSON text and boolean compaction options');
 return processJsonLd(document,options,undefined,{context:parseNativeJson(options.context),compactArrays:options.compactArrays??true,compactToRelative:options.compactToRelative??true}) as Promise<JsonLdCompactionReport>;
}
export interface JsonLdFramingOptions {embed?:'@once'|'@always'|'@never'|'@first'|'@last';explicit?:boolean;requireAll?:boolean;omitDefault?:boolean;omitGraph?:boolean;pruneBlankNodeIdentifiers?:boolean;frameDefault?:boolean;ordered?:boolean;compactArrays?:boolean;compactToRelative?:boolean}
export interface JsonLdFramingReport extends JsonLdExpansionReport {frame:NativeJson;framingOptions:JsonLdFramingOptions}
export async function proposeJsonLdFraming(document:Document,options:Omit<JsonLdFramingOptions,'embed'>&{embed?:JsonLdFramingOptions['embed']|boolean;frame:string;lossPolicy:'report'|'reject'}):Promise<JsonLdFramingReport>{
 if(!options||typeof options.frame!=='string'||options.embed===null||Object.entries(options).some(([k,v])=>!['frame','lossPolicy','embed'].includes(k)&&v!==undefined&&typeof v!=='boolean'))throw new UmfError('JSONLD_OPTIONS','Expected frame JSON text');
 const framingOptions:JsonLdFramingOptions={embed:options.embed===true?'@once':options.embed===false?'@never':options.embed??'@once',explicit:options.explicit??false,requireAll:options.requireAll??false,omitDefault:options.omitDefault??false,frameDefault:options.frameDefault??false,ordered:options.ordered??false,compactArrays:options.compactArrays??true,compactToRelative:options.compactToRelative??true,...(options.omitGraph===undefined?{}:{omitGraph:options.omitGraph}),...(options.pruneBlankNodeIdentifiers===undefined?{}:{pruneBlankNodeIdentifiers:options.pruneBlankNodeIdentifiers})};
 if(!['@once','@always','@never','@first','@last'].includes(framingOptions.embed!)||Object.entries(framingOptions).some(([k,v])=>k!=='embed'&&typeof v!=='boolean'))throw new UmfError('JSONLD_OPTIONS','Invalid framing option');
 return processJsonLd(document,options,undefined,undefined,{frame:parseNativeJson(options.frame),framingOptions}) as Promise<JsonLdFramingReport>;
}
async function processJsonLd(document:Document,options:{lossPolicy:'report'|'reject'},flatten?:{context:NativeJson|null;compactArrays:boolean},compact?:{context:NativeJson;compactArrays:boolean;compactToRelative:boolean},framing?:{frame:NativeJson;framingOptions:JsonLdFramingOptions}):Promise<JsonLdExpansionReport>{
 if(!options||!['report','reject'].includes(options.lossPolicy))throw new UmfError('JSONLD_OPTIONS','Explicit report or reject loss policy required');
 const source=copyJson(document) as unknown as Document,r:JsonLdExpansionReport={source,lossPolicy:options.lossPolicy,status:'blocked',complete:false,resourcesUsed:[],diagnostics:[],...flatten,...compact,...framing};
 try{
  exportJsonLdDocument(source);const p=payload(source),contexts=new Map(p.contexts.map(c=>[c.url,c])),processor=jsonld();
  const processing={base:p.baseIRI,processingMode:p.processingMode,documentLoader:async(url:string)=>{
   const c=contexts.get(url);if(!c){r.diagnostics.push({code:'JSONLD_CONTEXT_MISSING',path:'',severity:'error',message:'No supplied context for '+url});throw new UmfError('JSONLD_CONTEXT_MISSING','No supplied context for '+url);}
   if(!r.resourcesUsed.includes(url))r.resourcesUsed.push(url);return {contextUrl:null,documentUrl:c.documentUrl,document:interoperable(c.root)};
  },eventHandler:({event}:any)=>{if(!framing||!r.diagnostics.some(d=>d.code==='JSONLD_EVENT'&&d.message===event.code+': '+event.message))r.diagnostics.push({code:'JSONLD_EVENT',path:'',severity:'warning',message:event.code+': '+event.message});if(options.lossPolicy==='reject')throw new UmfError('JSONLD_LOSS',event.code);}};
  const expanded=await processor.expand(interoperable(p.root),{...processing,...(p.expandContext===undefined?{}:{expandContext:interoperable(p.expandContext)})});
  const validateExpanded=(v:any):void=>{if(Array.isArray(v)){v.forEach(validateExpanded);return;}if(v&&typeof v==='object'){if(p.processingMode==='json-ld-1.0'&&Array.isArray(v['@list'])&&v['@list'].some((x:any)=>x&&typeof x==='object'&&'@list' in x))throw new UmfError('JSONLD_PROCESSOR_GAP','JSON-LD 1.0 list of lists is unsupported');if('@value' in v&&Array.isArray(v['@type']))throw new UmfError('JSONLD_PROCESSOR_GAP','Expanded value object has multiple types');for(const [k,x] of Object.entries(v))if(!(k==='@value'&&v['@type']==='@json'))validateExpanded(x);}};
  validateExpanded(expanded);
  let output=expanded;
  if(flatten){output=flattenExpanded(expanded);if(flatten.context!==null&&flatten.context.kind!=='null')output=await processor.compact(output,interoperable(flatten.context),{...processing,compactArrays:flatten.compactArrays,graph:true,skipExpansion:true});}
  if(compact)output=await processor.compact(expanded,interoperable(compact.context),{...processing,compactArrays:compact.compactArrays,compactToRelative:compact.compactToRelative,skipExpansion:true});
  if(framing)output=await processor.frame(interoperable(p.root),interoperable(framing.frame),{...processing,...framing.framingOptions,...(p.expandContext===undefined?{}:{expandContext:interoperable(p.expandContext)})});
  const edit=proposeJsonLdNodeEdit(source,'',renderTree(expandedTree(output)));r.candidate=edit.document;r.status='candidate';
  r.diagnostics.push(framing?{code:'JSONLD_FRAMING',path:'',severity:'warning',message:'Framed candidate is a selected view with full source/context archives retained. Framing may merge named graphs, omit properties, introduce defaults and change embedding. This is not a lossless replacement or RDF equivalence proof.'}:compact?{code:'JSONLD_COMPACTION',path:'',severity:'warning',message:'Compacted candidate retains source/context archives. Target aliases, relative IRI spellings and array shapes can change. Warning events are recorded; compaction does not prove RDF or ontology equivalence.'}:flatten?{code:'JSONLD_FLATTEN',path:'',severity:'warning',message:'Flattened candidate retains source/context archives. Node descriptions merge by identifier, blank labels are assigned locally and duplicate unordered values are removed; target context may compact aliases. This is not an RDF equivalence or global blank-node identity proof.'}:{code:'JSONLD_EXPANSION',path:'',severity:'warning',message:'Expanded JSON-LD candidate retains full source/context archives. Term aliases, context layout, JSON numeric spelling and other surface forms can change. Processor warning events are recorded; expansion does not prove RDF equivalence, preserve every syntactic distinction or execute ontology constraints.'});
 }catch(e){r.diagnostics.push({code:framing?'JSONLD_FRAMING_BLOCKED':compact?'JSONLD_COMPACTION_BLOCKED':flatten?'JSONLD_FLATTEN_BLOCKED':'JSONLD_EXPANSION_BLOCKED',path:'',severity:'error',message:String(e)});}return r;
}

export interface RdfToJsonLdReport {source:Document;id:string;baseIRI:string;processingMode:'json-ld-1.0'|'json-ld-1.1';lossPolicy:'report'|'reject';useNativeTypes:boolean;useRdfType:boolean;rdfDirection:null|'i18n-datatype'|'compound-literal';status:'candidate'|'blocked';complete:false;candidate?:Document;diagnostics:Diagnostic[]}
export async function proposeRdfToJsonLd(document:Document,options:{id:string;baseIRI:string;processingMode?:'json-ld-1.0'|'json-ld-1.1';lossPolicy:'report'|'reject';useNativeTypes?:boolean;useRdfType?:boolean;rdfDirection?:null|'i18n-datatype'|'compound-literal'}):Promise<RdfToJsonLdReport>{
 if(!options||(options.processingMode!==undefined&&!['json-ld-1.0','json-ld-1.1'].includes(options.processingMode))||typeof options.id!=='string'||!options.id||typeof options.baseIRI!=='string'||!['report','reject'].includes(options.lossPolicy)||[options.useNativeTypes,options.useRdfType].some(v=>v!==undefined&&typeof v!=='boolean')||(options.rdfDirection!==undefined&&![null,'i18n-datatype','compound-literal'].includes(options.rdfDirection)))throw new UmfError('JSONLD_OPTIONS','Expected explicit projection identity, base IRI, loss policy and valid RDF options');absolute(options.baseIRI);if(options.processingMode==='json-ld-1.0'&&options.rdfDirection)throw new UmfError('JSONLD_OPTIONS','rdfDirection conversion requires JSON-LD 1.1');
 const source=copyJson(document) as unknown as Document,r:RdfToJsonLdReport={source,id:options.id,baseIRI:options.baseIRI,processingMode:options.processingMode??'json-ld-1.1',lossPolicy:options.lossPolicy,useNativeTypes:options.useNativeTypes??false,useRdfType:options.useRdfType??false,rdfDirection:options.rdfDirection??null,status:'blocked',complete:false,diagnostics:[]};
 try{
  const checked=inspectRdfDocument(source);if(!checked.valid||checked.diagnostics.some(d=>d.code==='RDF_REPRESENTATION'))throw new UmfError('JSONLD_RDF_SOURCE','RDF source is invalid or contains unknown encoding fields');
  const quads=getRdfQuads(source),graphs=getRdfNamedGraphs(source),empty=graphs.filter(g=>!quads.some(q=>q.graph.kind===g.kind&&'value' in q.graph&&q.graph.value===g.value));
  const warn=(code:string,message:string)=>{r.diagnostics.push({code,path:'',severity:'warning',message});if(r.lossPolicy==='reject')throw new UmfError('JSONLD_RDF_LOSS',message);};
  const xsd='http://www.w3.org/2001/XMLSchema#';
  if(r.useNativeTypes&&quads.some(q=>q.object.kind==='literal'&&['integer','double','boolean'].some(t=>q.object.kind==='literal'&&q.object.datatype===xsd+t)))warn('JSONLD_RDF_NATIVE_TYPES','Native scalar conversion may change RDF datatype and lexical representation; the full RDF source is retained in this report.');
  const input=copyJson(source) as unknown as Document;if(empty.length){const p=input.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[RDF_EXTENSION] as any;p.namedGraphs=graphs.filter(g=>!empty.some(e=>e.kind===g.kind&&e.value===g.value));}
  const literal=(o:any,useNativeTypes:boolean):unknown=>{
   const type=o.datatype.value,value=o.value;
   if(r.rdfDirection==='i18n-datatype'&&type.startsWith('https://www.w3.org/ns/i18n#')&&!/^[^_#]*_(?:ltr|rtl)$/.test(type.slice('https://www.w3.org/ns/i18n#'.length)))throw new UmfError('JSONLD_RDF_DIRECTION','Direction datatype must encode one language and ltr or rtl; RDF source retained without a candidate');
   if(type==='http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON')return r.processingMode==='json-ld-1.0'?{'@type':type,'@value':value}:{'@type':'@json','@value':interoperable(parseNativeJson(value))};
   if(!useNativeTypes)return undefined;
   if(type===xsd+'string')return {'@value':value};
   if(type===xsd+'boolean')return ['true','false','1','0'].includes(value)?{'@value':value==='true'||value==='1'}:{'@type':type,'@value':value};
   if(type===xsd+'integer')return /^[+-]?[0-9]+$/.test(value)?{'@value':interoperable({kind:'number',value:BigInt(value).toString()})}:{'@type':type,'@value':value};
   if(type===xsd+'double'){
    if(!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value)||!Number.isFinite(Number(value)))return {'@type':type,'@value':value};
    let token=value.replace(/^\+/,'').replace(/^(-?)\./,'$10.').replace(/\.(?=[eE]|$)/,'.0').replace(/^(-?)0+(?=[0-9])/,'$1');
    return {'@value':interoperable(parseNativeJson(token))};
   }
   return undefined;
  };
  const output=await jsonld().fromRDF(exportRdfNQuads(input,{preserveSource:false}),{processingMode:r.processingMode,useNativeTypes:r.useNativeTypes,useRdfType:r.useRdfType,rdfDirection:r.rdfDirection,umfRdfLiteral:literal,eventHandler:({event}:any)=>warn('JSONLD_RDF_EVENT',event.code+': '+event.message)});
  if(!Array.isArray(output))throw new UmfError('JSONLD_RDF_OUTPUT','Expected expanded node array');
  for(const g of empty){const id=g.kind==='blank'?'_:'+g.value:g.value;let node=output.find(n=>n['@id']===id);if(!node){node={'@id':id};output.push(node);}node['@graph']=[];}
  r.candidate=importJsonLdDocument(renderTree(expandedTree(output)),{id:r.id,baseIRI:r.baseIRI,processingMode:r.processingMode});r.status='candidate';r.diagnostics.push({code:'JSONLD_FROM_RDF',path:'',severity:'warning',message:'JSON-LD projection retains the complete RDF source in this report. Lists, rdf:type, datatype representation and blank labels follow selected conversion options. Empty named graphs remain explicit; no ontology or cross-document identity equivalence is asserted.'});
 }catch(e){r.diagnostics.push({code:'JSONLD_FROM_RDF_BLOCKED',path:'',severity:'error',message:String(e)});}return r;
}

export interface JsonLdToRdfReport extends JsonLdExpansionReport {id:string;produceGeneralizedRdf:boolean;numericPolicy:'strict'|'binary64';rdfDirection:null|'i18n-datatype'|'compound-literal'}
export async function proposeJsonLdToRdf(document:Document,options:{id:string;produceGeneralizedRdf?:boolean;numericPolicy?:'strict'|'binary64';lossPolicy:'report'|'reject';rdfDirection?:null|'i18n-datatype'|'compound-literal'}):Promise<JsonLdToRdfReport>{
 if(!options||(options.produceGeneralizedRdf!==undefined&&typeof options.produceGeneralizedRdf!=='boolean')||(options.numericPolicy!==undefined&&!['strict','binary64'].includes(options.numericPolicy))||typeof options.id!=='string'||!options.id||!['report','reject'].includes(options.lossPolicy)||(options.rdfDirection!==undefined&&![null,'i18n-datatype','compound-literal'].includes(options.rdfDirection)))throw new UmfError('JSONLD_OPTIONS','Expected RDF candidate identity, explicit loss policy and valid direction option');
 const r:JsonLdToRdfReport={source:copyJson(document) as unknown as Document,id:options.id,produceGeneralizedRdf:options.produceGeneralizedRdf??false,numericPolicy:options.numericPolicy??'strict',lossPolicy:options.lossPolicy,rdfDirection:options.rdfDirection??null,status:'blocked',complete:false,resourcesUsed:[],diagnostics:[]};
 try{
  const p=payload(r.source);if(p.processingMode==='json-ld-1.0'&&r.rdfDirection)throw new UmfError('JSONLD_OPTIONS','Direction conversion requires JSON-LD 1.1');
  const expanded=await proposeJsonLdExpansion(r.source,{lossPolicy:r.lossPolicy});r.resourcesUsed=expanded.resourcesUsed;r.diagnostics=expanded.diagnostics.filter(d=>d.code!=='JSONLD_EXPANSION');if(!expanded.candidate)return r;
  const warn=(code:string,message:string,path='')=>{r.diagnostics.push({code,path,severity:'warning',message});if(r.lossPolicy==='reject')throw new UmfError('JSONLD_RDF_LOSS',message);};
  const root=payload(expanded.candidate).root;
  const inspect=(n:NativeJson,opaque=false,forceDouble=false,path=''):void=>{
   if(n.kind==='number'){
    let value=Number(n.value);if(!Number.isFinite(value))throw new UmfError('JSONLD_RDF_NUMBER','Numeric overflow cannot be represented as a finite JSON number; source retained');
    if(typeof interoperable(n)!=='number'){
     if(r.numericPolicy==='strict')throw new UmfError('JSONLD_RDF_NUMBER','Exact number cannot yet be converted safely to RDF; source retained');
     const converted=JSON.stringify(value);warn('JSONLD_RDF_NUMBER_LOSS','Expanded numeric token '+n.value+' converts to binary64 JSON '+converted+'; exact source retained',path);n.value=converted;value=Number(converted);
    }
    const asDouble=forceDouble||!Number.isInteger(value)||Math.abs(value)>=1e21,lexical=asDouble?value.toExponential(15):value.toFixed(0);
    if(!opaque&&JSON.stringify(decimal(n.value))!==JSON.stringify(decimal(lexical))){
     if(r.numericPolicy==='strict')throw new UmfError('JSONLD_RDF_NUMBER','Native RDF '+(asDouble?'double':'integer')+' conversion would round the value; source retained');
     warn('JSONLD_RDF_NUMBER_LOSS','Expanded numeric token '+n.value+' rounds during RDF '+(asDouble?'double':'integer')+' serialization to '+lexical+'; exact source retained',path);
    }
   }
   if(n.kind==='array')n.items.forEach((v,i)=>inspect(v,opaque,forceDouble,path+'/'+i));
   if(n.kind==='object'){
    const m=n.members;
    if(!opaque&&m['@index'])warn('JSONLD_RDF_INDEX','RDF conversion omits JSON-LD @index annotations; complete source retained in report');
    if(!opaque&&m['@graph']?.kind==='array'&&m['@graph'].items.length===0)warn('JSONLD_RDF_EMPTY_GRAPH','N-Quads conversion omits empty named graph inventory; complete source retained in report');
    for(const [k,v] of Object.entries(m))inspect(v,opaque||(k==='@value'&&m['@type']?.kind==='string'&&m['@type'].value==='@json'),!opaque&&k==='@value'&&m['@type']?.kind==='string'&&m['@type'].value==='http://www.w3.org/2001/XMLSchema#double',path+'/'+pointer(k));
   }
  };inspect(root);
  const output=await jsonld().toRDF(interoperable(root),{skipExpansion:true,processingMode:p.processingMode,format:r.produceGeneralizedRdf?undefined:'application/n-quads',produceGeneralizedRdf:r.produceGeneralizedRdf,rdfDirection:r.rdfDirection,umfRdfTerm:(term:any)=>{if(term.termType==='NamedNode'&&!wellFormedIri(term.value)){warn('JSONLD_RDF_TERM','Omitting malformed RDF IRI: '+term.value);return false;}return true;},umfRdfLanguage:(language:string)=>{if(!wellFormedLanguage(language)){warn('JSONLD_RDF_TERM','Omitting malformed RDF language tag: '+language);return false;}return true;},eventHandler:({event}:any)=>warn('JSONLD_RDF_EVENT',event.code+': '+event.message)});
  if(r.produceGeneralizedRdf){if(!Array.isArray(output))throw new UmfError('JSONLD_RDF_OUTPUT','Expected generalized dataset quad array');r.candidate=importGeneralizedRdfDataset(JSON.stringify(output),{id:r.id});}
  else{if(typeof output!=='string')throw new UmfError('JSONLD_RDF_OUTPUT','Expected N-Quads text');r.candidate=importRdfNQuads(output,{id:r.id});}
  r.status='candidate';r.diagnostics.push({code:'JSONLD_TO_RDF',path:'',severity:'warning',message:'RDF projection is a derived dataset. Source syntax, contexts, lexical forms and annotations remain authoritative in this report; blank labels are local. No ontology equivalence or lossless replacement is asserted.'});
 }catch(e){r.diagnostics.push({code:'JSONLD_TO_RDF_BLOCKED',path:'',severity:'error',message:String(e)});}return r;
}

export interface GeneralizedRdfToJsonLdReport extends JsonLdExpansionReport {id:string;baseIRI:string;processingMode:'json-ld-1.0'|'json-ld-1.1'}
export async function proposeGeneralizedRdfToJsonLd(document:Document,options:{id:string;baseIRI:string;processingMode:'json-ld-1.0'|'json-ld-1.1';lossPolicy:'report'|'reject'}):Promise<GeneralizedRdfToJsonLdReport>{
 if(!options||typeof options.id!=='string'||!options.id||typeof options.baseIRI!=='string'||!['json-ld-1.0','json-ld-1.1'].includes(options.processingMode)||!['report','reject'].includes(options.lossPolicy))throw new UmfError('JSONLD_OPTIONS','Expected candidate identity, mode and loss policy');absolute(options.baseIRI);
 const r:GeneralizedRdfToJsonLdReport={source:copyJson(document) as unknown as Document,id:options.id,baseIRI:options.baseIRI,processingMode:options.processingMode,lossPolicy:options.lossPolicy,status:'blocked',complete:false,resourcesUsed:[],diagnostics:[]};
 try{const output=await jsonld().fromRDF(getGeneralizedRdfQuads(r.source),{processingMode:r.processingMode,useNativeTypes:false,rdfDirection:null,umfRdfLiteral:(o:any)=>o.datatype.value==='http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON'?(r.processingMode==='json-ld-1.0'?{'@value':o.value,'@type':o.datatype.value}:{'@value':interoperable(parseNativeJson(o.value)),'@type':'@json'}):undefined,eventHandler:({event}:any)=>{r.diagnostics.push({code:'JSONLD_RDF_EVENT',path:'',severity:'warning',message:event.code+': '+event.message});if(r.lossPolicy==='reject')throw new UmfError('JSONLD_RDF_LOSS',event.code);}});
 r.candidate=importJsonLdDocument(renderTree(expandedTree(output)),{id:r.id,baseIRI:r.baseIRI,processingMode:r.processingMode});r.status='candidate';r.diagnostics.push({code:'JSONLD_FROM_GENERALIZED',path:'',severity:'warning',message:'Derived JSON-LD view retains the full generalized dataset source in this report; blank identities remain local, lexical forms stay typed and no RDF 1.1 or entailment equivalence is asserted.'});
 }catch(e){r.diagnostics.push({code:'JSONLD_FROM_GENERALIZED_BLOCKED',path:'',severity:'error',message:String(e)});}return r;
}
