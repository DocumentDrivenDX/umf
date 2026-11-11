// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {LIMITS} from '../../model/json';
import type {SmithyAssemblyBackend,SmithyAssemblyResult} from './assembly';
import type {SmithySelectionBackend,SmithySelectionResult} from './selection';
import {UmfError} from '../../model/errors';
import type {Registry} from '../../registry/registry';
import {smithyPackage} from './package';

export interface SmithyNativeOperations {
  inspect(fields:{document:Document}):Validation;
  inspectPayload(fields:{payload:unknown}):Diagnostic[];
  importJson(fields:{source:string;id:string;dependencies?:{id:string;schema:string}[]}):Document;
  importSources(fields:{files:Record<string,string>;id:string}):Document;
  exportJson(fields:{document:Document}):string;
  exportSources(fields:{document:Document}):{files:Record<string,string>};
  exportBundle(fields:{document:Document}):{schema:string;dependencies:{id:string;schema:string}[];source:Document;diagnostics:Diagnostic[]};
  getNode(fields:{document:Document;path:string;dependencyId?:string}):NativeJson;
  editNode(fields:{document:Document;path:string;replacement:string;dependencyId?:string}):{document:Document;validation:Validation};
  editSource(fields:{document:Document;path:string;source:string}):{document:Document;validation:Validation};
  assembleSmithyDocument(document:Document,backend:SmithyAssemblyBackend,options:{id:string;signal?:AbortSignal}):Promise<SmithyAssemblyResult>;
  selectSmithyShapes(document:Document,backend:SmithySelectionBackend,selector:string,options:{id:string;signal?:AbortSignal}):Promise<SmithySelectionResult>;
}
export type SmithyBundleExport={schema:string;dependencies:{id:string;schema:string}[];source:Document;diagnostics:Diagnostic[]};
export type SmithyEditResult={document:Document;validation:Validation};
type NativeGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Same public Smithy API and backend callback contract, with Rust owning document semantics. */
export function createSmithyRustDefault(engine:SmithyNativeOperations,isNativeUmfCoreError:NativeGuard=()=>false,createRegistry:()=>Registry){
  const mapError=(error:unknown):never=>{
    if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
    const native=error as {code?:unknown;message?:unknown;path?:unknown};
    if(typeof native.code==='string'&&(native.code.startsWith('SMITHY_')||['REQUEST','LIMIT','JSON_SCHEMA_SYNTAX','JSON_SCHEMA_POINTER','NATIVE_JSON_REPRESENTATION'].includes(native.code)))
      throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
    throw error;
  };
  const call=<T>(operation:()=>unknown):T=>{
    try{return operation() as T;}
    catch(error){return mapError(error);}
  };
  const callAsync=async <T>(operation:()=>Promise<T>):Promise<T>=>{
    try{return await operation();}
    catch(error){return mapError(error);}
  };
  const inspectSmithyPayload=(payload:unknown):Diagnostic[]=>call(()=>engine.inspectPayload({payload}));
  const checkAssemblyArgs=(backend:SmithyAssemblyBackend,options:{id:string;signal?:AbortSignal})=>{
    if(!options||typeof options.id!=='string'||!options.id||Object.keys(options).some(k=>!['id','signal'].includes(k))||
       (options.signal!==undefined&&(!options.signal||typeof options.signal.aborted!=='boolean'||typeof options.signal.addEventListener!=='function'||typeof options.signal.removeEventListener!=='function'))||
       !backend||typeof backend.identity!=='string'||!backend.identity||typeof backend.assemble!=='function')
      throw new UmfError('SMITHY_ASSEMBLY_OPTIONS','Target model ID and a trusted identified assembly backend are required');
  };
  return Object.freeze({
    smithyRegistry():Registry{return createRegistry().register(smithyPackage as unknown as ExtensionPackage,inspectSmithyPayload);},
    inspectSmithy(document:Document):Validation{return call(()=>engine.inspect({document}));},
    importSmithyJson(source:string,options:{id:string;dependencies?:{id:string;schema:string}[]}):Document{return call(()=>engine.importJson({source,id:options.id,...(options.dependencies?{dependencies:options.dependencies}:{})}));},
    importSmithySources(input:{files:Record<string,string>},options:{id:string}):Document{return call(()=>engine.importSources({files:input.files,id:options.id}));},
    exportSmithyJson(document:Document):string{return call(()=>engine.exportJson({document}));},
    exportSmithySources(document:Document):{files:Record<string,string>}{return call(()=>engine.exportSources({document}));},
    exportSmithyBundle(document:Document):SmithyBundleExport{return call(()=>engine.exportBundle({document}));},
    getSmithyNode(document:Document,path:string,dependencyId?:string):NativeJson{return call(()=>engine.getNode({document,path,...(dependencyId===undefined?{}:{dependencyId})}));},
    proposeSmithyNodeEdit(document:Document,path:string,text:string,dependencyId?:string):SmithyEditResult{return call(()=>engine.editNode({document,path,replacement:text,...(dependencyId===undefined?{}:{dependencyId})}));},
    proposeSmithySourceEdit(document:Document,path:string,text:string):SmithyEditResult{return call(()=>engine.editSource({document,path,source:text}));},
    assembleSmithyDocument(document:Document,backend:SmithyAssemblyBackend,options:{id:string;signal?:AbortSignal}):Promise<SmithyAssemblyResult>{return callAsync(()=>{checkAssemblyArgs(backend,options);return engine.assembleSmithyDocument(document,backend,options);});},
    selectSmithyShapes(document:Document,backend:SmithySelectionBackend,selector:string,options:{id:string;signal?:AbortSignal}):Promise<SmithySelectionResult>{return callAsync(()=>{if(typeof selector!=='string'||!selector.trim()||selector.length>LIMITS.maxTextLength||typeof backend?.select!=='function')throw new UmfError('SMITHY_SELECTION_OPTIONS','A nonempty bounded selector and trusted Smithy selection backend are required');checkAssemblyArgs(backend,options);return engine.selectSmithyShapes(document,backend,selector,options);});},
  });
}
