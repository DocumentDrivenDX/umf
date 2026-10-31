// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Diagnostic, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {deltaPackage, deltaTablePackage, deltaLogPackage} from './package';


import type {DeltaCommit, DeltaReconciliation} from './reconcile';
import type {DeltaLogLine} from './log';
import type {renameDeltaMappedField} from './rename';
import type {inspectDeltaActions} from './actions';

type NativeErrorGuard = (error: unknown) => boolean;
export interface DeltaNativeEngine {
  importSchema(source:string,id:string):Document; inspectSchema(document:Document):Validation; inspectSchemaPayload(payload:Json):Diagnostic[]; exportSchema(document:Document):string; getSchemaNode(document:Document,pointer:string):NativeJson; editSchemaNode(document:Document,pointer:string,replacement:string):{document:Document;validation:Validation};
  importTable(source:string,id:string):Document; inspectTable(document:Document):Validation; inspectTablePayload(payload:Json):Diagnostic[]; exportTable(document:Document):string; getTableNode(document:Document,pointer:string):NativeJson; getTableSchema(document:Document):Document; editTableNode(document:Document,pointer:string,replacement:string):{document:Document;validation:Validation}; renameMappedField(document:Document,options:Parameters<typeof renameDeltaMappedField>[1]):ReturnType<typeof renameDeltaMappedField>;
  capture(source:string,id:string):Document; export(document:Document):string; inspect(document:Document):{source:Document;complete:false;parsedAll:boolean;lines:DeltaLogLine[];diagnostics:Diagnostic[]}; inspectActions(document:Document):ReturnType<typeof inspectDeltaActions>; reconcileCommits(commits:DeltaCommit[]):DeltaReconciliation;
}
const CONTROL_CODES = new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDeltaRustDefault(engine:DeltaNativeEngine,isNativeError:NativeErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()) {
  const call=<T>(fn:()=>T):T=>{try{return fn();}catch(error){if(!isNativeError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL_CODES.has(e.code))throw error;const code=e.code;if(code==='REQUEST'||code==='JSON_SCHEMA_SYNTAX'||code.startsWith('DELTA_'))throw new UmfError(code,String(e.message??''),typeof e.path==='string'?e.path:'');throw error;}};
  const schemaInspectPayload=(p:Json)=>call(()=>engine.inspectSchemaPayload(p));
  const tableInspectPayload=(p:Json)=>call(()=>engine.inspectTablePayload(p));
  return Object.freeze({
    deltaRegistry():Registry{return createRegistry().register(deltaPackage,schemaInspectPayload);},
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
    renameDeltaMappedField(document:Document,options:Parameters<typeof renameDeltaMappedField>[1]){return call(()=>engine.renameMappedField(document,options));},
    getDeltaTableSchema(document:Document){return call(()=>engine.getTableSchema(document));},
    captureDeltaLog(text:string,options:{id:string}){return call(()=>engine.capture(text,options.id));},
    exportDeltaLog(document:Document){return call(()=>engine.export(document));},
    inspectDeltaLog(document:Document){return call(()=>engine.inspect(document));},
    inspectDeltaActions(document:Document){return call(()=>engine.inspectActions(document));},
    reconcileDeltaCommits(commits:DeltaCommit[]){return call(()=>engine.reconcileCommits(commits));},
  });
}
