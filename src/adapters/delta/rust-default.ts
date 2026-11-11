// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Diagnostic, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {deltaPackage, deltaTablePackage, deltaLogPackage, deltaDefinitionPackage} from './package';

import type {DeltaCommit, DeltaReconciliation} from './reconcile';
import type {DeltaLogLine} from './log';

import type {DeltaDefinition,SparkDelta4TargetBinding,SparkDelta4DDLRealization} from './ddl';

import type {DeltaParquetCheckpointRecovery} from './parquet-checkpoint';
import type {DeltaSidecar, DeltaSidecarReconciliation} from './sidecars';
import type {DeltaParquetActions} from "./parquet";
import type {DeltaCheckpointPart,DeltaMultipartRecovery} from "./multipart";

type RenameDeltaMappedField = (source: Document, options: { fieldPointer: string; name: string; uninterpretedReferences: "preserve-and-report"; }) => { source: Document; document: Document; complete: false; partitionUpdates: { index: number; from: string; to: string; }[]; validation: Validation; diagnostics: Diagnostic[]; };
type InspectDeltaActions = (doc: Document) => { knownShapesValid: boolean; diagnostics: Diagnostic[]; source: Document; complete: false; parsedAll: boolean; lines: DeltaLogLine[]; };
type GenerateDeltaDDL = (input: Document) => { sql: string; definition: DeltaDefinition; schemaJson: string; qualification: string; };
type GenerateDeltaDDLBundle = (inputs: readonly Document[]) => { sql: string; tables: { documentId: string; sql: string; definition: DeltaDefinition; schemaJson: string; qualification: string; }[]; qualification: string; };
type ProjectDeltaParquetActions = (source: Document) => DeltaParquetActions;
type ReconcileDeltaMultipartCheckpoint = (version: string, partCount: number, parts: DeltaCheckpointPart[], commits: DeltaCommit[]) => DeltaMultipartRecovery;

type NativeErrorGuard = (error: unknown) => boolean;
export interface DeltaNativeEngine {
  importSchema(source:string,id:string):Document; inspectSchema(document:Document):Validation; inspectSchemaPayload(payload:Json):Diagnostic[]; exportSchema(document:Document):string; getSchemaNode(document:Document,pointer:string):NativeJson; editSchemaNode(document:Document,pointer:string,replacement:string):{document:Document;validation:Validation};
  importTable(source:string,id:string):Document; inspectTable(document:Document):Validation; inspectTablePayload(payload:Json):Diagnostic[]; exportTable(document:Document):string; getTableNode(document:Document,pointer:string):NativeJson; getTableSchema(document:Document):Document; editTableNode(document:Document,pointer:string,replacement:string):{document:Document;validation:Validation}; renameMappedField(document:Document,options:Parameters<RenameDeltaMappedField>[1]):ReturnType<RenameDeltaMappedField>;
  capture(source:string,id:string):Document; export(document:Document):string; inspect(document:Document):{source:Document;complete:false;parsedAll:boolean;lines:DeltaLogLine[];diagnostics:Diagnostic[]}; inspectActions(document:Document):ReturnType<InspectDeltaActions>; reconcileCommits(commits:DeltaCommit[]):DeltaReconciliation; reconcileCheckpoint(checkpoint:DeltaCommit,commits:DeltaCommit[],spec:'v1'|'v2'):DeltaReconciliation; reconcileCheckpointSidecars(checkpoint:DeltaCommit,commits:DeltaCommit[],sidecars:DeltaSidecar[]):DeltaSidecarReconciliation;
  inspectDefinitionPayload(payload:Json):Diagnostic[]; defineTable(source:string,definition:DeltaDefinition,id:string):Document; generateDdl(document:Document):ReturnType<GenerateDeltaDDL>; generateDdlBundle(documents:readonly Document[]):ReturnType<GenerateDeltaDDLBundle>; realizeSparkDelta4(document:Document,target:SparkDelta4TargetBinding):SparkDelta4DDLRealization;
  projectParquetActions(document:Document):ReturnType<ProjectDeltaParquetActions>;
  reconcileMultipart(version:string,partCount:number,parts:Parameters<ReconcileDeltaMultipartCheckpoint>[2],commits:Parameters<ReconcileDeltaMultipartCheckpoint>[3]):ReturnType<ReconcileDeltaMultipartCheckpoint>;
  reconcileParquetCheckpoint(checkpoint:DeltaCommit,commits:DeltaCommit[],spec:'v1'|'v2',sidecars:DeltaSidecar[]):DeltaParquetCheckpointRecovery;
}
const CONTROL_CODES = new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDeltaRustDefault(engine:DeltaNativeEngine,isNativeError:NativeErrorGuard=()=>false,createRegistry:()=>Registry) {
  const call=<T>(fn:()=>T):T=>{try{return fn();}catch(error){if(!isNativeError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL_CODES.has(e.code))throw error;const code=e.code;if(code==='REQUEST'||code==='JSON_SCHEMA_SYNTAX'||code.startsWith('DELTA_')||code.startsWith('PARQUET_'))throw new UmfError(code,String(e.message??''),typeof e.path==='string'?e.path:'');throw error;}};
  const schemaInspectPayload=(p:Json)=>call(()=>engine.inspectSchemaPayload(p));
  const tableInspectPayload=(p:Json)=>call(()=>engine.inspectTablePayload(p));
  const definitionInspectPayload=(p:Json)=>call(()=>engine.inspectDefinitionPayload(p));
  return Object.freeze({
    deltaRegistry():Registry{return createRegistry().register(deltaPackage,schemaInspectPayload).register(deltaDefinitionPackage,definitionInspectPayload);},
    deltaTableRegistry():Registry{return createRegistry().register(deltaTablePackage,tableInspectPayload);},
    deltaLogRegistry():Registry{return createRegistry().register(deltaLogPackage);},
    inspectDelta(document:Document){return call(()=>engine.inspectSchema(document));},
    importDeltaSchema(text:string,options:{id:string}){return call(()=>engine.importSchema(text,options.id));},
    exportDeltaSchema(document:Document){return call(()=>engine.exportSchema(document));},
    getDeltaNode(document:Document,path:string){return call(()=>engine.getSchemaNode(document,path));},
    proposeDeltaNodeEdit(document:Document,path:string,text:string){return call(()=>engine.editSchemaNode(document,path,text));},
    inspectDeltaTable(document:Document){return call(()=>engine.inspectTable(document));},
    importDeltaTable(text:string,options:{id:string}){return call(()=>engine.importTable(text,options.id));},
    exportDeltaTable(document:Document){return call(()=>engine.exportTable(document));},
    getDeltaTableNode(document:Document,path:string){return call(()=>engine.getTableNode(document,path));},
    proposeDeltaTableNodeEdit(document:Document,path:string,text:string){return call(()=>engine.editTableNode(document,path,text));},
    renameDeltaMappedField(document:Document,options:Parameters<RenameDeltaMappedField>[1]){return call(()=>engine.renameMappedField(document,options));},
    getDeltaTableSchema(document:Document){return call(()=>engine.getTableSchema(document));},
    captureDeltaLog(text:string,options:{id:string}){return call(()=>engine.capture(text,options.id));},
    exportDeltaLog(document:Document){return call(()=>engine.export(document));},
    inspectDeltaLog(document:Document){return call(()=>engine.inspect(document));},
    inspectDeltaActions(document:Document){return call(()=>engine.inspectActions(document));},
    reconcileDeltaCommits(commits:DeltaCommit[]){return call(()=>engine.reconcileCommits(commits));},
    reconcileDeltaCheckpoint(checkpoint:DeltaCommit,commits:DeltaCommit[],spec:'v1'|'v2'='v2'){return call(()=>engine.reconcileCheckpoint(checkpoint,commits,spec));},
    reconcileDeltaCheckpointSidecars(checkpoint:DeltaCommit,commits:DeltaCommit[],sidecars:DeltaSidecar[]){return call(()=>engine.reconcileCheckpointSidecars(checkpoint,commits,sidecars));},
    defineDeltaTable(source:string,definition:DeltaDefinition,options:{id:string}){return call(()=>engine.defineTable(source,definition,options.id));},
    generateDeltaDDL(document:Document){return call(()=>engine.generateDdl(document));},
    generateDeltaDDLBundle(documents:readonly Document[]){return call(()=>engine.generateDdlBundle(documents));},
    realizeSparkDelta4DDL(document:Document,target:SparkDelta4TargetBinding){return call(()=>engine.realizeSparkDelta4(document,target));},
    projectDeltaParquetActions(document:Document){return call(()=>engine.projectParquetActions(document));},
    reconcileDeltaMultipartCheckpoint(version:string,partCount:number,parts:Parameters<ReconcileDeltaMultipartCheckpoint>[2],commits:Parameters<ReconcileDeltaMultipartCheckpoint>[3]){return call(()=>engine.reconcileMultipart(version,partCount,parts,commits));},
    reconcileDeltaParquetCheckpoint(checkpoint:DeltaCommit,commits:DeltaCommit[],spec:'v1'|'v2',sidecars:DeltaSidecar[]=[]){return call(()=>engine.reconcileParquetCheckpoint(checkpoint,commits,spec,sidecars));},
  });
}
