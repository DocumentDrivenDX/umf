import Ajv2020 from 'ajv/dist/2020';
import manifest from '../../../spec/extensions/generalized-rdf/package.json';
import datasetSchema from '../../../spec/extensions/generalized-rdf/dataset-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
import {wellFormedIri,wellFormedLanguage} from '../jsonld/rdf-terms';
export const GENERALIZED_RDF_EXTENSION='umf.generalized-rdf';
export const generalizedRdfPackage=manifest as unknown as ExtensionPackage;
export type GeneralizedRdfNode={termType:'NamedNode'|'BlankNode';value:string};
export type GeneralizedRdfLiteral={termType:'Literal';value:string;datatype:{termType:'NamedNode';value:string};language?:string};
export interface GeneralizedRdfQuad {subject:GeneralizedRdfNode;predicate:GeneralizedRdfNode;object:GeneralizedRdfNode|GeneralizedRdfLiteral;graph:GeneralizedRdfNode|{termType:'DefaultGraph';value:''}}
interface Payload {profile:'jsonld-generalized-dataset';blankNodeScope:string;root:NativeJson;originalSource:string}
const check=new Ajv2020({strict:false,validateFormats:false}).compile(datasetSchema);
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'GENERALIZED_RDF_SCOPE',path:'',severity:'warning',message:'JSON-LD generalized dataset subset; blank identities are local to blankNodeScope. This is not RDF 1.1 N-Quads or an entailment claim.'}];
 const warn=(code:string,message:string)=>ds.push({code,path:'',severity:'warning',message});
 if(Object.keys(p).some(k=>!['profile','blankNodeScope','root','originalSource'].includes(k)))warn('GENERALIZED_RDF_ENCODING','Unknown encoding fields retained; native export and interpretation blocked');
 const tree=(n:NativeJson):void=>{if(Object.keys(n).some(k=>!(n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value']).includes(k)))warn('GENERALIZED_RDF_ENCODING','Unknown NativeJson encoding field retained');if(n.kind==='object')Object.values(n.members).forEach(tree);if(n.kind==='array')n.items.forEach(tree);};tree(p.root);
 try{parseNativeJson(p.originalSource);}catch(e){ds.push({code:'GENERALIZED_RDF_SOURCE',path:'',severity:'error',message:String(e)});}
 const dataset=JSON.parse(renderTree(p.root));if(!check(dataset)){warn('GENERALIZED_RDF_UNSUPPORTED','Native dataset structure is outside the declared subset; exact source retained');return ds;}
 const unknown=(o:object,keys:string[])=>{if(Object.keys(o).some(k=>!keys.includes(k)))warn('GENERALIZED_RDF_UNSUPPORTED','Unknown native fields retained; interpretation and edits blocked');};
 for(const q of dataset as any[]){unknown(q,['subject','predicate','object','graph']);for(const t of [q.subject,q.predicate,q.object,q.graph]){unknown(t,t.termType==='Literal'?['termType','value','datatype','language']:['termType','value']);if(t.termType==='NamedNode'&&!wellFormedIri(t.value))warn('GENERALIZED_RDF_UNSUPPORTED','Malformed IRI retained');if(t.termType==='Literal'){unknown(t.datatype,['termType','value']);if(!wellFormedIri(t.datatype.value)||((t.language??'')?(!wellFormedLanguage(t.language)||t.datatype.value!=='http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'):t.datatype.value==='http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'))warn('GENERALIZED_RDF_UNSUPPORTED','Malformed literal datatype/language retained');}}}
 return ds;
}
export function generalizedRdfRegistry(){return new Registry().register(generalizedRdfPackage,inspect);}
export function inspectGeneralizedRdfDocument(document:Document){return validateDocument(document,generalizedRdfRegistry());}
function payload(document:Document):Payload {const result=inspectGeneralizedRdfDocument(document);if(!result.valid)throw new UmfError('GENERALIZED_RDF_DOCUMENT',JSON.stringify(result.diagnostics));const p=document.modules.find(m=>m.id==='dataset')?.elements.find(e=>e.id==='dataset')?.extensions[GENERALIZED_RDF_EXTENSION];if(!p||document.vocabularies[GENERALIZED_RDF_EXTENSION]?.version!=='0.1.0')throw new UmfError('GENERALIZED_RDF_PAYLOAD','Expected pinned generalized dataset');return copyJson(p) as unknown as Payload;}
export function importGeneralizedRdfDataset(text:string,options:{id:string;blankNodeScope?:string}):Document {
 if(text.length>4000000)throw new UmfError('GENERALIZED_RDF_LIMIT','Dataset source exceeds 4,000,000 characters');const p:Payload={profile:'jsonld-generalized-dataset',blankNodeScope:options.blankNodeScope??options.id,root:parseNativeJson(text),originalSource:text};const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[GENERALIZED_RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[GENERALIZED_RDF_EXTENSION]:p as unknown as Json}}]}]};payload(d);return d;
}
export function exportGeneralizedRdfDataset(document:Document):string {const p=payload(document);if(inspectGeneralizedRdfDocument(document).diagnostics.some(d=>d.code==='GENERALIZED_RDF_ENCODING'))throw new UmfError('GENERALIZED_RDF_EXPORT','Unknown encoding fields cannot be discarded');return renderTree(p.root)===renderTree(parseNativeJson(p.originalSource))?p.originalSource:renderTree(p.root)+'\n';}
export function getGeneralizedRdfQuads(document:Document):GeneralizedRdfQuad[]{const p=payload(document);if(inspectGeneralizedRdfDocument(document).diagnostics.some(d=>['GENERALIZED_RDF_ENCODING','GENERALIZED_RDF_UNSUPPORTED'].includes(d.code)))throw new UmfError('GENERALIZED_RDF_INTERPRET','Unknown or unsupported dataset semantics; source retained');return JSON.parse(renderTree(p.root));}
export function proposeGeneralizedRdfQuadEdit(document:Document,index:number,replacement:GeneralizedRdfQuad){const quads=getGeneralizedRdfQuads(document);if(!Number.isSafeInteger(index)||index<0||index>=quads.length)throw new UmfError('GENERALIZED_RDF_EDIT','Expected existing quad index');quads[index]=replacement;const next=copyJson(document) as unknown as Document,p=payload(next);p.root=parseNativeJson(JSON.stringify(quads));next.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[GENERALIZED_RDF_EXTENSION]=p as unknown as Json;getGeneralizedRdfQuads(next);return {document:next,validation:inspectGeneralizedRdfDocument(next)};}
