// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage} from '../../model/types';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import rdfManifest from '../../../spec/extensions/rdf/package.json';
import generalizedManifest from '../../../spec/extensions/generalized-rdf/package.json';
import type {RdfIriRenameReport,RdfMergeReport,RdfNode,RdfQuad} from './index';
import type {GeneralizedRdfQuad} from '../generalized-rdf/index';
import type {Validation} from "../../model/types";

type InspectRdfDocument = (document: Document) => Validation;
type ImportRdfNQuads = (text: string, options: { id: string; blankNodeScope?: string; }) => Document;
type GetRdfQuads = (document: Document) => RdfQuad[];
type ExportRdfNQuads = (document: Document, options?: { preserveSource?: boolean; }) => string;
type ProposeRdfQuadEdit = (document: Document, index: number, replacement: RdfQuad) => { document: Document; validation: Validation; };
type ProposeRdfIriRename = (document: Document, options: { from: string; to: string; }) => RdfIriRenameReport;
type ImportRdfTurtle = (text: string, options: { id: string; baseIRI: string; blankNodeScope?: string; }) => Document;
type ExportRdfTurtle = (document: Document) => string;
type GetRdfNamedGraphs = (document: Document) => RdfNode[];
type ImportRdfTriG = (text: string, options: { id: string; baseIRI: string; blankNodeScope?: string; }) => Document;
type ExportRdfTriG = (document: Document) => string;
type ProposeRdfDatasetMerge = (documents: Document[], options: { id: string; graphPolicy: "union-by-name"; blankNodePolicy: "disjoint-inputs"; }) => RdfMergeReport;
type InspectGeneralizedRdfDocument = (document: Document) => Validation;
type ImportGeneralizedRdfDataset = (text: string, options: { id: string; blankNodeScope?: string; }) => Document;
type ExportGeneralizedRdfDataset = (document: Document) => string;
type GetGeneralizedRdfQuads = (document: Document) => GeneralizedRdfQuad[];
type ProposeGeneralizedRdfQuadEdit = (document: Document, index: number, replacement: GeneralizedRdfQuad) => { document: Document; validation: Validation; };

type NativeErrorGuard=(error:unknown)=>boolean;
type Engine=object
const CODES=['RDF_','GENERALIZED_RDF_','NATIVE_TURTLE_'];
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createRdfRustDefault(engine:Engine,isNativeUmfCoreError:NativeErrorGuard=()=>false,createRegistry:()=>Registry) {
 const call=<T>(fn:()=>unknown):T=>{try{return fn() as T;}catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code))throw error;const code=e.code;if(code==='REQUEST'||code==='JSON_SCHEMA_SYNTAX'||CODES.some(prefix=>code.startsWith(prefix)))throw new UmfError(code,String(e.message??''),typeof e.path==='string'?e.path:'');throw error;}};
 const run=<T>(method:string,...args:unknown[])=>call<T>(()=>{const target=Reflect.get(engine,method);if(typeof target!=='function')throw new Error('RDF_NATIVE_OPERATION_MISSING');return target.apply(engine,args);});
 return Object.freeze({
  rdfRegistry():Registry{return createRegistry().register(rdfManifest as unknown as ExtensionPackage,p=>run<Diagnostic[]>('inspectRdfPayload',p,'rdf'));},
  generalizedRdfRegistry():Registry{return createRegistry().register(generalizedManifest as unknown as ExtensionPackage,p=>run<Diagnostic[]>('inspectRdfPayload',p,'generalized-rdf'));},
  inspectRdfDocument(document:Parameters<InspectRdfDocument>[0]):ReturnType<InspectRdfDocument>{return run('inspectRdfDocument',document);},
  importRdfNQuads(source:string,options:Parameters<ImportRdfNQuads>[1]):ReturnType<ImportRdfNQuads>{return run('importRdfNQuads',source,options);},
  getRdfQuads(document:Parameters<GetRdfQuads>[0]):ReturnType<GetRdfQuads>{return run('getRdfQuads',document);},
  exportRdfNQuads(document:Parameters<ExportRdfNQuads>[0],options:Parameters<ExportRdfNQuads>[1]={}):ReturnType<ExportRdfNQuads>{return run('exportRdfNQuads',document,options);},
  proposeRdfQuadEdit(document:Parameters<ProposeRdfQuadEdit>[0],index:Parameters<ProposeRdfQuadEdit>[1],replacement:Parameters<ProposeRdfQuadEdit>[2]):ReturnType<ProposeRdfQuadEdit>{return run('proposeRdfQuadEdit',document,index,replacement);},
  proposeRdfIriRename(document:Parameters<ProposeRdfIriRename>[0],options:Parameters<ProposeRdfIriRename>[1]):RdfIriRenameReport{return run('proposeRdfIriRename',document,options);},
  importRdfTurtle(source:string,options:Parameters<ImportRdfTurtle>[1]):ReturnType<ImportRdfTurtle>{return run('importRdfTurtle',source,options);},
  exportRdfTurtle(document:Parameters<ExportRdfTurtle>[0]):ReturnType<ExportRdfTurtle>{return run('exportRdfTurtle',document);},
  getRdfNamedGraphs(document:Parameters<GetRdfNamedGraphs>[0]):RdfNode[]{return run('getRdfNamedGraphs',document);},
  importRdfTriG(source:string,options:Parameters<ImportRdfTriG>[1]):ReturnType<ImportRdfTriG>{return run('importRdfTriG',source,options);},
  exportRdfTriG(document:Parameters<ExportRdfTriG>[0]):ReturnType<ExportRdfTriG>{return run('exportRdfTriG',document);},
  proposeRdfDatasetMerge(documents:Parameters<ProposeRdfDatasetMerge>[0],options:Parameters<ProposeRdfDatasetMerge>[1]):RdfMergeReport{return run('proposeRdfDatasetMerge',documents,options);},
  inspectGeneralizedRdfDocument(document:Parameters<InspectGeneralizedRdfDocument>[0]):ReturnType<InspectGeneralizedRdfDocument>{return run('inspectGeneralizedRdfDocument',document);},
  importGeneralizedRdfDataset(source:string,options:Parameters<ImportGeneralizedRdfDataset>[1]):ReturnType<ImportGeneralizedRdfDataset>{return run('importGeneralizedRdfDataset',source,options);},
  exportGeneralizedRdfDataset(document:Parameters<ExportGeneralizedRdfDataset>[0]):ReturnType<ExportGeneralizedRdfDataset>{return run('exportGeneralizedRdfDataset',document);},
  getGeneralizedRdfQuads(document:Parameters<GetGeneralizedRdfQuads>[0]):GeneralizedRdfQuad[]{return run('getGeneralizedRdfQuads',document);},
  proposeGeneralizedRdfQuadEdit(document:Parameters<ProposeGeneralizedRdfQuadEdit>[0],index:Parameters<ProposeGeneralizedRdfQuadEdit>[1],replacement:Parameters<ProposeGeneralizedRdfQuadEdit>[2]):ReturnType<ProposeGeneralizedRdfQuadEdit>{return run('proposeGeneralizedRdfQuadEdit',document,index,replacement);},
 });
}
