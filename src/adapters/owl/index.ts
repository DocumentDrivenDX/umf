import manifest from '../../../spec/extensions/owl/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic,type Json,type ExtensionPackage} from '../../model/types';
import {RDF_EXTENSION,importRdfTurtle,exportRdfTurtle,getRdfQuads,inspectRdfDocument,proposeRdfQuadEdit,type RdfNode,type RdfLiteral,type RdfQuad} from '../rdf';
export const OWL_EXTENSION='umf.owl';
export const owlPackage=manifest as unknown as ExtensionPackage;
type Value=RdfNode|RdfLiteral;
function rdfEnvelope(p:Json):Document {
 const payload=copyJson(p) as Record<string,Json>;delete payload.owlVersion;
 return {umf:'0.1.0',id:'owl:graph',vocabularies:{[RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[RDF_EXTENSION]:payload}}]}]};
}
function inspect(p:Json):Diagnostic[]{return [...inspectRdfDocument(rdfEnvelope(p)).diagnostics,{code:'OWL_SCOPE',path:'',severity:'warning',message:'OWL 2 RDF graph preservation only. Axiom validation, profiles, import resolution, consistency and entailment are not implemented.'}];}
export function owlRegistry(){return new Registry().register(owlPackage,inspect);}
export function inspectOwlDocument(document:Document){return validateDocument(document,owlRegistry());}
function graph(document:Document):Document {
 const checked=inspectOwlDocument(document);if(!checked.valid)throw new UmfError('OWL_DOCUMENT',JSON.stringify(checked.diagnostics));
 const p=document.modules.find(m=>m.id==='dataset')?.elements.find(e=>e.id==='dataset')?.extensions[OWL_EXTENSION];
 if(!p||document.vocabularies[OWL_EXTENSION]?.version!=='0.1.0')throw new UmfError('OWL_PAYLOAD','Expected pinned ontology graph');
 const rdf=rdfEnvelope(p);exportRdfTurtle(rdf);return rdf;
}
export function importOwlTurtle(text:string,options:{id:string;baseIRI:string;blankNodeScope?:string}):Document {
 const d=importRdfTurtle(text,options),element=d.modules[0]!.elements[0]!;
 element.extensions[OWL_EXTENSION]={...(element.extensions[RDF_EXTENSION] as Record<string,Json>),owlVersion:'2'};delete element.extensions[RDF_EXTENSION];
 d.vocabularies={[OWL_EXTENSION]:{version:'0.1.0'}};graph(d);return d;
}
export function exportOwlTurtle(document:Document):string{return exportRdfTurtle(graph(document));}
export function getOwlQuads(document:Document):RdfQuad[]{return getRdfQuads(graph(document));}
export function proposeOwlQuadEdit(document:Document,index:number,replacement:RdfQuad){
 const edited=proposeRdfQuadEdit(graph(document),index,replacement).document;exportRdfTurtle(edited);
 const next=copyJson(document) as unknown as Document;
 next.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[OWL_EXTENSION]={...(edited.modules[0]!.elements[0]!.extensions[RDF_EXTENSION] as Record<string,Json>),owlVersion:'2'};
 graph(next);return {document:next,validation:inspectOwlDocument(next)};
}

export interface OwlOntologyHeader {node:RdfNode;versionIRIs:(RdfNode|RdfLiteral)[];imports:(RdfNode|RdfLiteral)[]}
export function getOwlOntologyHeaders(document:Document):OwlOntologyHeader[]{
 const qs=getOwlQuads(document),OWL='http://www.w3.org/2002/07/owl#';
 const key=(v:Value)=>JSON.stringify(v.kind==='literal'?[v.kind,v.value,v.datatype,v.language??'']:[v.kind,v.value]);
 const distinct=<T extends Value>(values:T[])=>[...new Map(values.map(v=>[key(v),v])).values()];
 return distinct(qs.filter(q=>q.predicate.value==='http://www.w3.org/1999/02/22-rdf-syntax-ns#type'&&q.object.kind==='iri'&&q.object.value===OWL+'Ontology').map(q=>q.subject)).map(node=>({node,versionIRIs:distinct(qs.filter(q=>key(q.subject)===key(node)&&q.predicate.value===OWL+'versionIRI').map(q=>q.object)),imports:distinct(qs.filter(q=>key(q.subject)===key(node)&&q.predicate.value===OWL+'imports').map(q=>q.object))}));
}
