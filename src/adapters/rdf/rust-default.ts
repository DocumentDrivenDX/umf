// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage} from '../../model/types';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import rdfManifest from '../../../spec/extensions/rdf/package.json';
import generalizedManifest from '../../../spec/extensions/generalized-rdf/package.json';
import type {
 RdfIriRenameReport,RdfMergeReport,RdfNode,RdfQuad,
 inspectRdfDocument,importRdfNQuads,getRdfQuads,exportRdfNQuads,proposeRdfQuadEdit,proposeRdfIriRename,
 importRdfTurtle,exportRdfTurtle,getRdfNamedGraphs,importRdfTriG,exportRdfTriG,proposeRdfDatasetMerge,
} from './index';
import type {GeneralizedRdfQuad,inspectGeneralizedRdfDocument,importGeneralizedRdfDataset,exportGeneralizedRdfDataset,getGeneralizedRdfQuads,proposeGeneralizedRdfQuadEdit} from '../generalized-rdf/index';

type NativeErrorGuard=(error:unknown)=>boolean;
type Engine=object
const CODES=['RDF_','GENERALIZED_RDF_','NATIVE_TURTLE_'];
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createRdfRustDefault(engine:Engine,isNativeUmfCoreError:NativeErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()) {
 const call=<T>(fn:()=>unknown):T=>{try{return fn() as T;}catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code))throw error;const code=e.code;if(code==='REQUEST'||code==='JSON_SCHEMA_SYNTAX'||CODES.some(prefix=>code.startsWith(prefix)))throw new UmfError(code,String(e.message??''),typeof e.path==='string'?e.path:'');throw error;}};
 const run=<T>(method:string,...args:unknown[])=>call<T>(()=>{const target=Reflect.get(engine,method);if(typeof target!=='function')throw new Error('RDF_NATIVE_OPERATION_MISSING');return target.apply(engine,args);});
 return Object.freeze({
  rdfRegistry():Registry{return createRegistry().register(rdfManifest as unknown as ExtensionPackage,p=>run<Diagnostic[]>('inspectRdfPayload',p,'rdf'));},
  generalizedRdfRegistry():Registry{return createRegistry().register(generalizedManifest as unknown as ExtensionPackage,p=>run<Diagnostic[]>('inspectRdfPayload',p,'generalized-rdf'));},
  inspectRdfDocument(document:Parameters<typeof inspectRdfDocument>[0]):ReturnType<typeof inspectRdfDocument>{return run('inspectRdfDocument',document);},
  importRdfNQuads(source:string,options:Parameters<typeof importRdfNQuads>[1]):ReturnType<typeof importRdfNQuads>{return run('importRdfNQuads',source,options);},
  getRdfQuads(document:Parameters<typeof getRdfQuads>[0]):ReturnType<typeof getRdfQuads>{return run('getRdfQuads',document);},
  exportRdfNQuads(document:Parameters<typeof exportRdfNQuads>[0],options:Parameters<typeof exportRdfNQuads>[1]={}):ReturnType<typeof exportRdfNQuads>{return run('exportRdfNQuads',document,options);},
  proposeRdfQuadEdit(document:Parameters<typeof proposeRdfQuadEdit>[0],index:Parameters<typeof proposeRdfQuadEdit>[1],replacement:Parameters<typeof proposeRdfQuadEdit>[2]):ReturnType<typeof proposeRdfQuadEdit>{return run('proposeRdfQuadEdit',document,index,replacement);},
  proposeRdfIriRename(document:Parameters<typeof proposeRdfIriRename>[0],options:Parameters<typeof proposeRdfIriRename>[1]):RdfIriRenameReport{return run('proposeRdfIriRename',document,options);},
  importRdfTurtle(source:string,options:Parameters<typeof importRdfTurtle>[1]):ReturnType<typeof importRdfTurtle>{return run('importRdfTurtle',source,options);},
  exportRdfTurtle(document:Parameters<typeof exportRdfTurtle>[0]):ReturnType<typeof exportRdfTurtle>{return run('exportRdfTurtle',document);},
  getRdfNamedGraphs(document:Parameters<typeof getRdfNamedGraphs>[0]):RdfNode[]{return run('getRdfNamedGraphs',document);},
  importRdfTriG(source:string,options:Parameters<typeof importRdfTriG>[1]):ReturnType<typeof importRdfTriG>{return run('importRdfTriG',source,options);},
  exportRdfTriG(document:Parameters<typeof exportRdfTriG>[0]):ReturnType<typeof exportRdfTriG>{return run('exportRdfTriG',document);},
  proposeRdfDatasetMerge(documents:Parameters<typeof proposeRdfDatasetMerge>[0],options:Parameters<typeof proposeRdfDatasetMerge>[1]):RdfMergeReport{return run('proposeRdfDatasetMerge',documents,options);},
  inspectGeneralizedRdfDocument(document:Parameters<typeof inspectGeneralizedRdfDocument>[0]):ReturnType<typeof inspectGeneralizedRdfDocument>{return run('inspectGeneralizedRdfDocument',document);},
  importGeneralizedRdfDataset(source:string,options:Parameters<typeof importGeneralizedRdfDataset>[1]):ReturnType<typeof importGeneralizedRdfDataset>{return run('importGeneralizedRdfDataset',source,options);},
  exportGeneralizedRdfDataset(document:Parameters<typeof exportGeneralizedRdfDataset>[0]):ReturnType<typeof exportGeneralizedRdfDataset>{return run('exportGeneralizedRdfDataset',document);},
  getGeneralizedRdfQuads(document:Parameters<typeof getGeneralizedRdfQuads>[0]):GeneralizedRdfQuad[]{return run('getGeneralizedRdfQuads',document);},
  proposeGeneralizedRdfQuadEdit(document:Parameters<typeof proposeGeneralizedRdfQuadEdit>[0],index:Parameters<typeof proposeGeneralizedRdfQuadEdit>[1],replacement:Parameters<typeof proposeGeneralizedRdfQuadEdit>[2]):ReturnType<typeof proposeGeneralizedRdfQuadEdit>{return run('proposeGeneralizedRdfQuadEdit',document,index,replacement);},
 });
}
