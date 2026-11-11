// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json,Validation} from '../model/types';
import type {NativeJson} from '../model/native-json';
import {UmfError} from '../model/errors';
import type {Registry} from '../registry/registry';
import linkmlManifest from '../../spec/extensions/linkml/package.json';
import odcsManifest from '../../spec/extensions/odcs/package.json';

import type {LinkmlImportContext,LinkmlImportReport} from './linkml/imports';
import type {LinkmlImportMergeReport} from './linkml/merge';
import type {LinkmlClassSlotsReport} from './linkml/class-slots';
import type {LinkmlSlotValuesReport} from './linkml/slot-values';

import type {OdcsReferenceResult} from './odcs/references';
import type {OdcsRelationshipReport} from './odcs/relationships';
import type {OdcsRenameResult} from './odcs/rename';

type ImportLinkmlDocument = (text: string, options: { id: string; format: "json" | "yaml"; metamodelVersion?: string; }) => Document;
type InspectLinkmlDocument = (document: Document) => Validation;
type ExportLinkmlDocument = (document: Document, format?: "json" | "yaml" | undefined) => string;
type GetLinkmlDocumentNode = (document: Document, path: string) => NativeJson;
type ProposeLinkmlDocumentNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type InspectLinkmlClassSlots = (document: Document, className: string) => LinkmlClassSlotsReport;
type InspectLinkmlSlotValues = (document: Document, className: string, slotName: string) => LinkmlSlotValuesReport;
type ImportOdcsDocument = (text: string, options: { id: string; format: "json" | "yaml"; }) => Document;
type InspectOdcsDocument = (document: Document) => Validation;
type ExportOdcsDocument = (document: Document, format?: "json" | "yaml" | undefined) => string;
type GetOdcsDocumentNode = (document: Document, path: string) => NativeJson;
type ProposeOdcsDocumentNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type ResolveOdcsReference = (document: Document, options: { reference: string; usage: "element" | "foreignKey"; }) => OdcsReferenceResult;
type InspectOdcsRelationships = (document: Document, options?: { maxRelationships?: number; }) => OdcsRelationshipReport;
type ProposeOdcsElementRename = (document: Document, options: { reference: string; name: string; }) => OdcsRenameResult;

export interface LinkmlOdcsNativeFamilyEngine {
 linkml:{
  import(fields:{source:string;id:string;format:'json'|'yaml';metamodelVersion?:string}):unknown;
  inspectPayload(fields:{payload:Json}):unknown;
  inspect(fields:{document:Document}):unknown; export(fields:{document:Document;format?:'json'|'yaml'}):unknown;
  getNode(fields:{document:Document;pointer:string}):unknown; editNode(fields:{document:Document;pointer:string;jsonText:string}):unknown;
  classSlots(fields:{document:Document;className:string}):unknown; slotValues(fields:{document:Document;className:string;slotName:string}):unknown;
  importContext(fields:{input:LinkmlImportContext}):unknown; importMerge(fields:{input:LinkmlImportContext;mode:'view'|'merge-imports'}):unknown;
 };
 odcs:{
  import(fields:{source:string;id:string;format:'json'|'yaml'}):unknown;
  inspectPayload(fields:{payload:Json}):unknown;
  inspect(fields:{document:Document}):unknown; export(fields:{document:Document;format?:'json'|'yaml'}):unknown;
  getNode(fields:{document:Document;pointer:string}):unknown; editNode(fields:{document:Document;pointer:string;jsonText:string}):unknown;
  resolveReference(fields:{document:Document;reference:string;usage:'element'|'foreignKey'}):unknown;
  relationships(fields:{document:Document;maxRelationships?:number}):unknown;
  renameElement(fields:{document:Document;reference:string;name:string}):unknown;
 }
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Preserve the established synchronous LinkML and ODCS APIs on the Rust wire path. */
export function createLinkmlOdcsRustDefault(engine:LinkmlOdcsNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('LINKML_')||native.code.startsWith('ODCS_')||native.code==='REQUEST'||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='JSON_SCHEMA_POINTER'||native.code.startsWith('NATIVE_YAML_')))
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  linkmlRegistry():Registry{return createRegistry().register(linkmlManifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.linkml.inspectPayload({payload})));},
  importLinkmlDocument(text:string,options:Parameters<ImportLinkmlDocument>[1]):ReturnType<ImportLinkmlDocument>{const {id,format,metamodelVersion}=options;return call(()=>engine.linkml.import({source:text,id,format,...(metamodelVersion===undefined?{}:{metamodelVersion})}) as ReturnType<ImportLinkmlDocument>);},
  inspectLinkmlDocument(document:Parameters<InspectLinkmlDocument>[0]):ReturnType<InspectLinkmlDocument>{return call(()=>engine.linkml.inspect({document}) as ReturnType<InspectLinkmlDocument>);},
  exportLinkmlDocument(document:Parameters<ExportLinkmlDocument>[0],format?:Parameters<ExportLinkmlDocument>[1]):ReturnType<ExportLinkmlDocument>{return call(()=>engine.linkml.export({document,...(format===undefined?{}:{format})}) as ReturnType<ExportLinkmlDocument>);},
  getLinkmlDocumentNode(document:Parameters<GetLinkmlDocumentNode>[0],path:Parameters<GetLinkmlDocumentNode>[1]):ReturnType<GetLinkmlDocumentNode>{return call(()=>engine.linkml.getNode({document,pointer:path}) as NativeJson as ReturnType<GetLinkmlDocumentNode>);},
  proposeLinkmlDocumentNodeEdit(document:Parameters<ProposeLinkmlDocumentNodeEdit>[0],path:Parameters<ProposeLinkmlDocumentNodeEdit>[1],text:Parameters<ProposeLinkmlDocumentNodeEdit>[2]):ReturnType<ProposeLinkmlDocumentNodeEdit>{return call(()=>engine.linkml.editNode({document,pointer:path,jsonText:text}) as ReturnType<ProposeLinkmlDocumentNodeEdit>);},
  inspectLinkmlImportContext(input:LinkmlImportContext):LinkmlImportReport{return call(()=>engine.linkml.importContext({input}) as LinkmlImportReport);},
  proposeLinkmlImportMerge(input:LinkmlImportContext,options:{mode:'view'|'merge-imports'}):LinkmlImportMergeReport{const {mode}=options;return call(()=>engine.linkml.importMerge({input,mode}) as LinkmlImportMergeReport);},
  inspectLinkmlClassSlots(document:Parameters<InspectLinkmlClassSlots>[0],className:string):LinkmlClassSlotsReport{return call(()=>engine.linkml.classSlots({document,className}) as LinkmlClassSlotsReport);},
  inspectLinkmlSlotValues(document:Parameters<InspectLinkmlSlotValues>[0],className:string,slotName:string):LinkmlSlotValuesReport{return call(()=>engine.linkml.slotValues({document,className,slotName}) as LinkmlSlotValuesReport);},
  importOdcsDocument(text:string,options:Parameters<ImportOdcsDocument>[1]):ReturnType<ImportOdcsDocument>{const {id,format}=options;return call(()=>engine.odcs.import({source:text,id,format}) as ReturnType<ImportOdcsDocument>);},
  odcsRegistry():Registry{return createRegistry().register(odcsManifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.odcs.inspectPayload({payload})));},
  inspectOdcsDocument(document:Parameters<InspectOdcsDocument>[0]):ReturnType<InspectOdcsDocument>{return call(()=>engine.odcs.inspect({document}) as ReturnType<InspectOdcsDocument>);},
  exportOdcsDocument(document:Parameters<ExportOdcsDocument>[0],format?:Parameters<ExportOdcsDocument>[1]):ReturnType<ExportOdcsDocument>{return call(()=>engine.odcs.export({document,...(format===undefined?{}:{format})}) as ReturnType<ExportOdcsDocument>);},
  getOdcsDocumentNode(document:Parameters<GetOdcsDocumentNode>[0],path:Parameters<GetOdcsDocumentNode>[1]):ReturnType<GetOdcsDocumentNode>{return call(()=>engine.odcs.getNode({document,pointer:path}) as NativeJson as ReturnType<GetOdcsDocumentNode>);},
  proposeOdcsDocumentNodeEdit(document:Parameters<ProposeOdcsDocumentNodeEdit>[0],path:Parameters<ProposeOdcsDocumentNodeEdit>[1],text:Parameters<ProposeOdcsDocumentNodeEdit>[2]):ReturnType<ProposeOdcsDocumentNodeEdit>{return call(()=>engine.odcs.editNode({document,pointer:path,jsonText:text}) as ReturnType<ProposeOdcsDocumentNodeEdit>);},
  resolveOdcsReference(document:Parameters<ResolveOdcsReference>[0],options:Parameters<ResolveOdcsReference>[1]):OdcsReferenceResult{const {reference,usage}=options;return call(()=>engine.odcs.resolveReference({document,reference,usage}) as OdcsReferenceResult);},
  inspectOdcsRelationships(document:Parameters<InspectOdcsRelationships>[0],options:Parameters<InspectOdcsRelationships>[1]={}):OdcsRelationshipReport{const {maxRelationships}=options;return call(()=>engine.odcs.relationships({document,...(maxRelationships===undefined?{}:{maxRelationships})}) as OdcsRelationshipReport);},
  proposeOdcsElementRename(document:Parameters<ProposeOdcsElementRename>[0],options:Parameters<ProposeOdcsElementRename>[1]):OdcsRenameResult{const {reference,name}=options;return call(()=>engine.odcs.renameElement({document,reference,name}) as OdcsRenameResult);},
 });
}
