// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../model/types';
import type {NativeJson} from '../model/native-json';
import {UmfError} from '../model/errors';
import {Registry} from '../registry/registry';
import linkmlManifest from '../../spec/extensions/linkml/package.json';
import odcsManifest from '../../spec/extensions/odcs/package.json';
import type {importLinkmlDocument,inspectLinkmlDocument,exportLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit} from './linkml';
import type {LinkmlImportContext,LinkmlImportReport,inspectLinkmlImportContext} from './linkml/imports';
import type {LinkmlImportMergeReport,proposeLinkmlImportMerge} from './linkml/merge';
import type {LinkmlClassSlotsReport,inspectLinkmlClassSlots} from './linkml/class-slots';
import type {LinkmlSlotValuesReport,inspectLinkmlSlotValues} from './linkml/slot-values';
import type {importOdcsDocument,inspectOdcsDocument,exportOdcsDocument,getOdcsDocumentNode,proposeOdcsDocumentNodeEdit} from './odcs';
import type {OdcsReferenceResult,resolveOdcsReference} from './odcs/references';
import type {OdcsRelationshipReport,inspectOdcsRelationships} from './odcs/relationships';
import type {OdcsRenameResult,proposeOdcsElementRename} from './odcs/rename';

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
export function createLinkmlOdcsRustDefault(engine:LinkmlOdcsNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()){
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
  importLinkmlDocument(text:string,options:Parameters<typeof importLinkmlDocument>[1]):ReturnType<typeof importLinkmlDocument>{const {id,format,metamodelVersion}=options;return call(()=>engine.linkml.import({source:text,id,format,...(metamodelVersion===undefined?{}:{metamodelVersion})}) as ReturnType<typeof importLinkmlDocument>);},
  inspectLinkmlDocument(document:Parameters<typeof inspectLinkmlDocument>[0]):ReturnType<typeof inspectLinkmlDocument>{return call(()=>engine.linkml.inspect({document}) as ReturnType<typeof inspectLinkmlDocument>);},
  exportLinkmlDocument(document:Parameters<typeof exportLinkmlDocument>[0],format?:Parameters<typeof exportLinkmlDocument>[1]):ReturnType<typeof exportLinkmlDocument>{return call(()=>engine.linkml.export({document,...(format===undefined?{}:{format})}) as ReturnType<typeof exportLinkmlDocument>);},
  getLinkmlDocumentNode(document:Parameters<typeof getLinkmlDocumentNode>[0],path:Parameters<typeof getLinkmlDocumentNode>[1]):ReturnType<typeof getLinkmlDocumentNode>{return call(()=>engine.linkml.getNode({document,pointer:path}) as NativeJson as ReturnType<typeof getLinkmlDocumentNode>);},
  proposeLinkmlDocumentNodeEdit(document:Parameters<typeof proposeLinkmlDocumentNodeEdit>[0],path:Parameters<typeof proposeLinkmlDocumentNodeEdit>[1],text:Parameters<typeof proposeLinkmlDocumentNodeEdit>[2]):ReturnType<typeof proposeLinkmlDocumentNodeEdit>{return call(()=>engine.linkml.editNode({document,pointer:path,jsonText:text}) as ReturnType<typeof proposeLinkmlDocumentNodeEdit>);},
  inspectLinkmlImportContext(input:LinkmlImportContext):LinkmlImportReport{return call(()=>engine.linkml.importContext({input}) as LinkmlImportReport);},
  proposeLinkmlImportMerge(input:LinkmlImportContext,options:{mode:'view'|'merge-imports'}):LinkmlImportMergeReport{const {mode}=options;return call(()=>engine.linkml.importMerge({input,mode}) as LinkmlImportMergeReport);},
  inspectLinkmlClassSlots(document:Parameters<typeof inspectLinkmlClassSlots>[0],className:string):LinkmlClassSlotsReport{return call(()=>engine.linkml.classSlots({document,className}) as LinkmlClassSlotsReport);},
  inspectLinkmlSlotValues(document:Parameters<typeof inspectLinkmlSlotValues>[0],className:string,slotName:string):LinkmlSlotValuesReport{return call(()=>engine.linkml.slotValues({document,className,slotName}) as LinkmlSlotValuesReport);},
  importOdcsDocument(text:string,options:Parameters<typeof importOdcsDocument>[1]):ReturnType<typeof importOdcsDocument>{const {id,format}=options;return call(()=>engine.odcs.import({source:text,id,format}) as ReturnType<typeof importOdcsDocument>);},
  odcsRegistry():Registry{return createRegistry().register(odcsManifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.odcs.inspectPayload({payload})));},
  inspectOdcsDocument(document:Parameters<typeof inspectOdcsDocument>[0]):ReturnType<typeof inspectOdcsDocument>{return call(()=>engine.odcs.inspect({document}) as ReturnType<typeof inspectOdcsDocument>);},
  exportOdcsDocument(document:Parameters<typeof exportOdcsDocument>[0],format?:Parameters<typeof exportOdcsDocument>[1]):ReturnType<typeof exportOdcsDocument>{return call(()=>engine.odcs.export({document,...(format===undefined?{}:{format})}) as ReturnType<typeof exportOdcsDocument>);},
  getOdcsDocumentNode(document:Parameters<typeof getOdcsDocumentNode>[0],path:Parameters<typeof getOdcsDocumentNode>[1]):ReturnType<typeof getOdcsDocumentNode>{return call(()=>engine.odcs.getNode({document,pointer:path}) as NativeJson as ReturnType<typeof getOdcsDocumentNode>);},
  proposeOdcsDocumentNodeEdit(document:Parameters<typeof proposeOdcsDocumentNodeEdit>[0],path:Parameters<typeof proposeOdcsDocumentNodeEdit>[1],text:Parameters<typeof proposeOdcsDocumentNodeEdit>[2]):ReturnType<typeof proposeOdcsDocumentNodeEdit>{return call(()=>engine.odcs.editNode({document,pointer:path,jsonText:text}) as ReturnType<typeof proposeOdcsDocumentNodeEdit>);},
  resolveOdcsReference(document:Parameters<typeof resolveOdcsReference>[0],options:Parameters<typeof resolveOdcsReference>[1]):OdcsReferenceResult{const {reference,usage}=options;return call(()=>engine.odcs.resolveReference({document,reference,usage}) as OdcsReferenceResult);},
  inspectOdcsRelationships(document:Parameters<typeof inspectOdcsRelationships>[0],options:Parameters<typeof inspectOdcsRelationships>[1]={}):OdcsRelationshipReport{const {maxRelationships}=options;return call(()=>engine.odcs.relationships({document,...(maxRelationships===undefined?{}:{maxRelationships})}) as OdcsRelationshipReport);},
  proposeOdcsElementRename(document:Parameters<typeof proposeOdcsElementRename>[0],options:Parameters<typeof proposeOdcsElementRename>[1]):OdcsRenameResult{const {reference,name}=options;return call(()=>engine.odcs.renameElement({document,reference,name}) as OdcsRenameResult);},
 });
}
