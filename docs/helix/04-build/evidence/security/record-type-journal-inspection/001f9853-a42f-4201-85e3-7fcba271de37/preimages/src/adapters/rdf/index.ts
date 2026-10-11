import {Parser,Writer,DataFactory} from 'n3/browser/n3.esm.min.js';
import type {Term,Quad as NativeQuad} from '@rdfjs/types';
import manifest from '../../../spec/extensions/rdf/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic,type Json,type ExtensionPackage} from '../../model/types';
export const RDF_EXTENSION='umf.rdf';
export const rdfPackage=manifest as unknown as ExtensionPackage;
export type RdfNode={kind:'iri'|'blank';value:string};
export type RdfLiteral={kind:'literal';value:string;datatype:string;language?:string};
export interface RdfQuad {subject:RdfNode;predicate:{kind:'iri';value:string};object:RdfNode|RdfLiteral;graph:RdfNode|{kind:'default'}}
interface Payload {profile:'rdf11-nquads'|'rdf11-turtle'|'rdf11-trig';namedGraphs?:RdfNode[];baseIRI?:string;blankNodeScope:string;quads:RdfQuad[];originalSource:string}
const langString='http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
function term(t:Term):RdfNode|RdfLiteral|{kind:'default'} {
 if(t.termType==='NamedNode')return {kind:'iri',value:t.value};if(t.termType==='BlankNode')return {kind:'blank',value:t.value};if(t.termType==='DefaultGraph')return {kind:'default'};
 if(t.termType==='Literal'&&!(t as any).direction)return {kind:'literal',value:t.value,datatype:t.datatype.value,...(t.language?{language:t.language.toLowerCase()}:{})};
 throw new UmfError('RDF_PROFILE','Term is outside the RDF 1.1 profile');
}
function parse(text:string,format:'N-Quads'|'Turtle'|'TriG'='N-Quads',baseIRI?:string,declared?:RdfNode[]):RdfQuad[]{
 if(typeof text!=='string'||text.length>4000000)throw new UmfError('RDF_LIMIT','Expected at most 4,000,000 source characters');
 if(/[\uD800-\uDFFF]/u.test(text))throw new UmfError('RDF_UNICODE','Unpaired UTF-16 surrogates cannot represent Unicode scalar values');
 let generated=0;const factory=format!=='N-Quads'?{...DataFactory,blankNode:(value?:string)=>DataFactory.blankNode(value===undefined?'g_'+generated++:'e_'+Array.from(value).map(c=>c.codePointAt(0)!.toString(16).padStart(6,'0')).join(''))}:DataFactory;
 let result:NativeQuad[];try{const parser:any=new Parser({format,blankNodePrefix:'',factory,baseIRI});
 if(format==='TriG'){const read=parser._readGraph;if(typeof read!=='function')throw new UmfError('RDF_PARSER','Pinned graph-reader hook is unavailable');const seen=new Set<string>();parser._readGraph=function(token:any){const next=read.call(this,token);if(token.type==='{'&&this._graph&&typeof this._graph==='object'){const graph=term(this._graph);if(graph.kind!=='iri'&&graph.kind!=='blank')throw new UmfError('RDF_GRAPH','Expected graph name');const key=JSON.stringify(graph);if(!seen.has(key)){seen.add(key);declared?.push(graph);if(seen.size>10000)throw new UmfError('RDF_LIMIT','At most 10,000 named graphs');}}return next;};}
 result=parser.parse(text,undefined,undefined,()=>{throw new UmfError('RDF_PROFILE','RDF version directives are outside the RDF 1.1 syntax profile');});}catch(e){throw new UmfError('RDF_SYNTAX',String(e));}
 if(result.length>10000)throw new UmfError('RDF_LIMIT','At most 10,000 quad occurrences');return result.map(q=>({subject:term(q.subject),predicate:term(q.predicate),object:term(q.object),graph:term(q.graph)} as RdfQuad));
}
function native(t:RdfNode|RdfLiteral|{kind:'default'}):Term {
 switch(t.kind){case 'iri':return DataFactory.namedNode(t.value);case 'blank':return DataFactory.blankNode(t.value);case 'default':return DataFactory.defaultGraph();case 'literal':if(t.language&&t.datatype!==langString)throw new UmfError('RDF_LITERAL','Language literal requires rdf:langString');return DataFactory.literal(t.value,t.language??DataFactory.namedNode(t.datatype));}
}
function render(quads:RdfQuad[]):string {return new Writer({format:'N-Quads'}).quadsToString(quads.map(q=>DataFactory.quad(native(q.subject) as any,native(q.predicate) as any,native(q.object) as any,native(q.graph) as any)));}
const canonical=(qs:RdfQuad[])=>JSON.stringify(qs.map(q=>[q.subject,q.predicate,q.object,q.graph].map(t=>t.kind==='default'?[t.kind]:t.kind==='literal'?[t.kind,t.value,t.datatype,t.language??'']:[t.kind,t.value])));
function inspect(input:Json):Diagnostic[]{const p=input as unknown as Payload,ds:Diagnostic[]=[{code:'RDF_CONTEXT',path:'',severity:'warning',message:'RDF 1.1 N-Quads/Turtle/TriG only. Turtle/TriG expands prefixes/base and allocates deterministic local anonymous labels. Blank labels have document-local scope; dataset meaning ignores duplicate occurrences and order. No entailment, datatype value normalization, isomorphism/canonicalization or RDF 1.2 support is asserted. Original bytes remain archived; edited export regenerates syntax.'}];
 const unknown=(o:object,keys:string[],path:string)=>{if(Object.keys(o).some(k=>!keys.includes(k)))ds.push({code:'RDF_REPRESENTATION',path,severity:'warning',message:'Unknown encoding fields are retained and block native export'});};unknown(p,['profile','blankNodeScope','quads','originalSource','namedGraphs',...(p.profile!=='rdf11-nquads'?['baseIRI']:[])],'');
 p.namedGraphs?.forEach((g,i)=>unknown(g,['kind','value'],'/namedGraphs/'+i));
 p.quads.forEach((q,i)=>{unknown(q,['subject','predicate','object','graph'],'/quads/'+i);for(const [key,t] of Object.entries(q)){if(!['subject','predicate','object','graph'].includes(key))continue;unknown(t,t.kind==='default'?['kind']:t.kind==='literal'?['kind','value','datatype','language']:['kind','value'],'/quads/'+i+'/'+key);}});
 try{if(p.profile!=='rdf11-nquads')checkBase(p.baseIRI!);if(p.profile==='rdf11-turtle'){if(graphs(p).length)throw new Error('Turtle cannot represent named graphs');}parse(p.originalSource,p.profile==='rdf11-trig'?'TriG':p.profile==='rdf11-turtle'?'Turtle':'N-Quads',p.baseIRI);for(const g of p.namedGraphs??[]){const probe:RdfQuad={subject:g,predicate:{kind:'iri',value:'urn:umf:graph-probe'},object:g,graph:{kind:'default'}};if(canonical(parse(render([probe])))!==canonical([probe]))throw new Error('Graph name changes when encoded');}const encoded=render(p.quads),again=parse(encoded);if(canonical(again)!==canonical(p.quads)&&!ds.some(d=>d.code==='RDF_REPRESENTATION'))throw new Error('Terms change when encoded as N-Quads');}catch(e){ds.push({code:'RDF_TERMS',path:'',severity:'error',message:String(e)});}return ds;
}
export function rdfRegistry(){return new Registry().register(rdfPackage,inspect);}
export function inspectRdfDocument(document:Document){return validateDocument(document,rdfRegistry());}
function payload(document:Document):Payload {const checked=inspectRdfDocument(document);if(!checked.valid)throw new UmfError('RDF_DOCUMENT',JSON.stringify(checked.diagnostics));const p=document.modules.find(m=>m.id==='dataset')?.elements.find(e=>e.id==='dataset')?.extensions[RDF_EXTENSION];if(!p||document.vocabularies[RDF_EXTENSION]?.version!=='0.1.0')throw new UmfError('RDF_PAYLOAD','Expected pinned RDF dataset payload');return copyJson(p) as unknown as Payload;}
export function importRdfNQuads(text:string,options:{id:string;blankNodeScope?:string}):Document {const p:Payload={profile:'rdf11-nquads',blankNodeScope:options.blankNodeScope??options.id,quads:parse(text),originalSource:text};const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[RDF_EXTENSION]:p as unknown as Json}}]}]};payload(d);return d;}
export function getRdfQuads(document:Document):RdfQuad[]{return payload(document).quads;}
export function exportRdfNQuads(document:Document,options:{preserveSource?:boolean}={}):string {if(options.preserveSource!==undefined&&typeof options.preserveSource!=='boolean')throw new UmfError('RDF_OPTIONS','Expected boolean preserveSource');const p=payload(document);if(inspectRdfDocument(document).diagnostics.some(d=>d.code==='RDF_REPRESENTATION'))throw new UmfError('RDF_EXPORT','Unknown encoding fields cannot be discarded');if(graphs(p).some(g=>!p.quads.some(q=>q.graph.kind===g.kind&&'value' in q.graph&&q.graph.value===g.value)))throw new UmfError('RDF_GRAPH_LOSS','N-Quads cannot represent empty named graphs');return options.preserveSource!==false&&p.profile==='rdf11-nquads'&&canonical(parse(p.originalSource))===canonical(p.quads)?p.originalSource:render(p.quads);}
export function proposeRdfQuadEdit(document:Document,index:number,replacement:RdfQuad){const p=payload(document);if(!Number.isSafeInteger(index)||index<0||index>=p.quads.length)throw new UmfError('RDF_EDIT','Expected existing quad index');p.quads[index]=copyJson(replacement) as unknown as RdfQuad;const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[RDF_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectRdfDocument(next)};}
export interface RdfIriRenameReport {
 source:Document;from:string;to:string;status:'candidate'|'blocked';complete:false;
 changes:{path:string;before:string;after:string}[];candidate?:Document;diagnostics:Diagnostic[];
}
/** Explicit identity change, never a claim that the renamed IRI denotes the same resource. */
export function proposeRdfIriRename(document:Document,options:{from:string;to:string}):RdfIriRenameReport {
 if(!options||[options.from,options.to].some(v=>typeof v!=='string'||!v.length||v.length>4096))throw new UmfError('RDF_RENAME_OPTIONS','Expected two nonempty IRI strings of at most 4096 characters');
 const source=copyJson(document) as unknown as Document,r:RdfIriRenameReport={source,from:options.from,to:options.to,status:'blocked',complete:false,changes:[],diagnostics:[]};
 const fail=(code:string,message:string)=>{r.diagnostics.push({code,path:'',message,severity:'error'});return r;};
 if(options.from===options.to)return fail('RDF_RENAME_NOOP','Source and target IRIs must differ');
 let p:Payload;try{exportRdfTriG(source);p=payload(source);const probe:RdfQuad={subject:{kind:'iri',value:options.from},predicate:{kind:'iri',value:'urn:umf:rdf:rename-probe'},object:{kind:'iri',value:options.to},graph:{kind:'default'}};if(canonical(parse(render([probe])))!==canonical([probe]))throw new Error('IRI spelling changes on serialization');}
 catch(e){return fail('RDF_RENAME_INPUT',String(e));}
 const occurrences:{index:number;role:'subject'|'predicate'|'object'|'graph';datatype:boolean;inventory?:boolean;value:string;path:string}[]=[];
 p.quads.forEach((q,index)=>{for(const role of ['subject','predicate','object','graph'] as const){const t=q[role];if(t.kind==='iri')occurrences.push({index,role,datatype:false,value:t.value,path:'/quads/'+index+'/'+role+'/value'});else if(t.kind==='literal')occurrences.push({index,role,datatype:true,value:t.datatype,path:'/quads/'+index+'/'+role+'/datatype'});}});
 p.namedGraphs?.forEach((g,index)=>{if(g.kind==='iri')occurrences.push({index,role:'graph',datatype:false,inventory:true,value:g.value,path:'/namedGraphs/'+index+'/value'});});
 if(occurrences.some(o=>o.value===options.to))return fail('RDF_RENAME_COLLISION','Target IRI already occurs in the dataset; implicit identity coalescing is forbidden');
 const selected=occurrences.filter(o=>o.value===options.from);if(!selected.length)return fail('RDF_RENAME_ABSENT','Source IRI does not occur as an RDF term or datatype');
 for(const o of selected){if(o.inventory){p.namedGraphs![o.index]!.value=options.to;continue;}const t=p.quads[o.index]![o.role];if(o.datatype)(t as RdfLiteral).datatype=options.to;else(t as RdfNode).value=options.to;}
 const candidate=copyJson(source) as unknown as Document;candidate.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[RDF_EXTENSION]=p as unknown as Json;
 try{exportRdfTriG(candidate);}catch(e){return fail('RDF_RENAME_INVALID',String(e));}
 r.candidate=candidate;r.status='candidate';r.changes=selected.map(o=>({path:o.path,before:options.from,after:options.to}));
 r.diagnostics.push({code:'RDF_RENAME_CONTEXT',path:'',severity:'warning',message:'Explicit IRI identity change across all term positions and literal datatype IRIs. Literal text, language tags, blank-node scope and duplicate occurrences remain unchanged. Datatype replacement may change value interpretation; vocabulary references, external documents, OWL/SHACL meaning and entailment are not rewritten or proven equivalent. Original source remains archived.'});return r;
}

function checkBase(baseIRI:string):void {
 if(typeof baseIRI!=='string'||!baseIRI.length||baseIRI.length>4096)throw new UmfError('RDF_BASE','Explicit absolute base IRI required');
 const probe:RdfQuad={subject:{kind:'iri',value:baseIRI},predicate:{kind:'iri',value:'urn:umf:base-probe'},object:{kind:'iri',value:baseIRI},graph:{kind:'default'}};if(canonical(parse(render([probe])))!==canonical([probe]))throw new UmfError('RDF_BASE','Base IRI spelling changes on serialization');
}
export function importRdfTurtle(text:string,options:{id:string;baseIRI:string;blankNodeScope?:string}):Document {
 checkBase(options.baseIRI);const p:Payload={profile:'rdf11-turtle',baseIRI:options.baseIRI,blankNodeScope:options.blankNodeScope??options.id,quads:parse(text,'Turtle',options.baseIRI),originalSource:text};
 const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[RDF_EXTENSION]:p as unknown as Json}}]}]};payload(d);return d;
}
export function exportRdfTurtle(document:Document):string {
 const p=payload(document);if(inspectRdfDocument(document).diagnostics.some(d=>d.code==='RDF_REPRESENTATION'))throw new UmfError('RDF_EXPORT','Unknown encoding fields cannot be discarded');if(graphs(p).length)throw new UmfError('RDF_GRAPH_LOSS','Turtle export cannot silently discard named graphs');
 return p.profile==='rdf11-turtle'&&canonical(parse(p.originalSource,'Turtle',p.baseIRI))===canonical(p.quads)?p.originalSource:render(p.quads);
}

function graphs(p:Payload):RdfNode[]{const found=new Map<string,RdfNode>();for(const graph of [...(p.namedGraphs??[]),...p.quads.map(q=>q.graph)])if(graph.kind!=='default')found.set(JSON.stringify([graph.kind,graph.value]),graph);return [...found.values()];}
export function getRdfNamedGraphs(document:Document):RdfNode[]{return graphs(payload(document));}
function trig(p:Payload):string {
 const graphToken=(g:RdfNode)=>render([{subject:g,predicate:{kind:'iri',value:'urn:umf:graph'},object:g,graph:{kind:'default'}}]).split(' ')[0]!;
 let text='';for(const q of p.quads)text+=q.graph.kind==='default'?render([q]):graphToken(q.graph)+' { '+render([{...q,graph:{kind:'default'}}]).trimEnd()+' }\n';
 for(const g of graphs(p))if(!p.quads.some(q=>q.graph.kind===g.kind&&'value' in q.graph&&q.graph.value===g.value))text+=graphToken(g)+' {}\n';return text;
}
export function importRdfTriG(text:string,options:{id:string;baseIRI:string;blankNodeScope?:string}):Document {
 checkBase(options.baseIRI);const namedGraphs:RdfNode[]=[],p:Payload={profile:'rdf11-trig',baseIRI:options.baseIRI,blankNodeScope:options.blankNodeScope??options.id,namedGraphs,quads:parse(text,'TriG',options.baseIRI,namedGraphs),originalSource:text};
 const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[RDF_EXTENSION]:p as unknown as Json}}]}]};payload(d);return d;
}
export function exportRdfTriG(document:Document):string {
 const p=payload(document);if(inspectRdfDocument(document).diagnostics.some(d=>d.code==='RDF_REPRESENTATION'))throw new UmfError('RDF_EXPORT','Unknown encoding fields cannot be discarded');
 if(p.profile==='rdf11-trig'){const namedGraphs:RdfNode[]=[],quads=parse(p.originalSource,'TriG',p.baseIRI,namedGraphs),original={...p,quads,namedGraphs};if(canonical(quads)===canonical(p.quads)&&JSON.stringify(graphs(original))===JSON.stringify(graphs(p)))return p.originalSource;}return trig(p);
}

export interface RdfMergeReport {
 sources:Document[];id:string;graphPolicy:'union-by-name';blankNodePolicy:'disjoint-inputs';
 status:'candidate'|'blocked';complete:false;candidate?:Document;
 blankNodes:{input:number;before:string;after:string}[];
 quadOrigins:{input:number;sourceIndex:number;targetIndex:number}[];
 diagnostics:Diagnostic[];
}
/** Explicit dataset composition policy; equal blankNodeScope strings never establish shared identity. */
export function proposeRdfDatasetMerge(documents:Document[],options:{id:string;graphPolicy:'union-by-name';blankNodePolicy:'disjoint-inputs'}):RdfMergeReport {
 if(!Array.isArray(documents)||documents.length<1||documents.length>100||!options||typeof options.id!=='string'||!options.id.length||options.id.length>4096||options.graphPolicy!=='union-by-name'||options.blankNodePolicy!=='disjoint-inputs')throw new UmfError('RDF_MERGE_OPTIONS','Expected 1–100 inputs, a 1–4096 character id, explicit union-by-name and disjoint-inputs policies');
 const sources=copyJson(documents) as unknown as Document[],r:RdfMergeReport={sources,id:options.id,graphPolicy:options.graphPolicy,blankNodePolicy:options.blankNodePolicy,status:'blocked',complete:false,blankNodes:[],quadOrigins:[],diagnostics:[]};
 const blankNodes:RdfMergeReport['blankNodes']=[],quadOrigins:RdfMergeReport['quadOrigins']=[],quads:RdfQuad[]=[],namedGraphs:RdfNode[]=[];
 try{
  sources.forEach((source,input)=>{
   // Refuse unknown RDF encodings before interpreting their identities. Other metadata stays in sources.
   exportRdfTriG(source);const p=payload(source),labels=new Map<string,string>();
   const rename=<T extends RdfNode|RdfLiteral|{kind:'default'}>(t:T):T=>{
    if(t.kind!=='blank')return t;let value=labels.get(t.value);if(value===undefined){value='m_'+input+'_'+labels.size;labels.set(t.value,value);blankNodes.push({input,before:t.value,after:value});}return {...t,value};
   };
   for(const [sourceIndex,q] of p.quads.entries()){quadOrigins.push({input,sourceIndex,targetIndex:quads.length});quads.push({subject:rename(q.subject),predicate:q.predicate,object:rename(q.object),graph:rename(q.graph)});}
   namedGraphs.push(...graphs(p).map(rename));
   if(quads.length>10000)throw new UmfError('RDF_LIMIT','Merged dataset exceeds 10,000 quad occurrences');
  });
  const p:Payload={profile:'rdf11-trig',baseIRI:'urn:umf:merge:',blankNodeScope:options.id,quads,namedGraphs:[],originalSource:''};p.namedGraphs=graphs({...p,namedGraphs});if(p.namedGraphs.length>10000)throw new UmfError('RDF_LIMIT','Merged dataset exceeds 10,000 named graphs');p.originalSource=trig(p);
  const candidate:Document={umf:'0.1.0',id:options.id,vocabularies:{[RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[RDF_EXTENSION]:p as unknown as Json}}]}]};
  exportRdfTriG(candidate);r.candidate=candidate;r.blankNodes=blankNodes;r.quadOrigins=quadOrigins;r.status='candidate';
  r.diagnostics.push({code:'RDF_MERGE_CONTEXT',path:'',severity:'warning',message:'RDF dataset projection only. Default graphs and identical IRI graph names are unioned; every input occurrence has a disjoint blank-node space, even for identical document ids or scope strings. Quad occurrences and empty graphs are retained. Complete source documents, unknown metadata and original archives remain in sources, not in the candidate RDF payload. No shared-blank inference, ontology consistency, entailment or canonicalization is asserted.'});
 }catch(e){r.diagnostics.push({code:'RDF_MERGE_INPUT',path:'',severity:'error',message:String(e)});}
 return r;
}
