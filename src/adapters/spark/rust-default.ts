// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import type {renameSparkField} from './rename';
import {sparkPackage} from './package';

type Guard = (error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export interface SparkNativeEngine {
  spark: {
    import(fields:{source:string;id:string}):unknown;
    inspect(fields:{document:Document}):unknown;
    inspectPayload(fields:{payload:Json}):unknown;
    export(fields:{document:Document}):unknown;
    getNode(fields:{document:Document;pointer:string}):unknown;
    editNode(fields:{document:Document;pointer:string;replacement:string}):unknown;
    renameField(fields:{document:Document;options:Parameters<typeof renameSparkField>[1]}):unknown;
  };
}
/** Default-root wrappers over the closed native family dispatcher. */
export function createSparkRustDefault(engine:SparkNativeEngine,isNativeError:Guard=()=>false,createRegistry:()=>Registry=()=>new Registry()) {
  const call=<T>(run:()=>T):T=>{try{return run();}catch(error){if(!isNativeError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;const code=native.code;if(code==='REQUEST'||code.startsWith('SPARK_'))throw new UmfError(code,String(native.message??''),typeof native.path==='string'?native.path:'');throw error;}};
  return Object.freeze({
    sparkRegistry():Registry{return createRegistry().register(sparkPackage as unknown as ExtensionPackage,payload=>call(()=>engine.spark.inspectPayload({payload}) as Diagnostic[]));},
    inspectSpark(document:Document):Validation{return call(()=>engine.spark.inspect({document}) as Validation);},
    importSparkSchema(source:string,options:{id:string}):Document{return call(()=>engine.spark.import({source,id:options.id}) as Document);},
    exportSparkSchema(document:Document):string{return call(()=>engine.spark.export({document}) as string);},
    getSparkNode(document:Document,pointer:string):NativeJson{return call(()=>engine.spark.getNode({document,pointer}) as NativeJson);},
    proposeSparkNodeEdit(document:Document,pointer:string,replacement:string):{document:Document;validation:Validation}{return call(()=>engine.spark.editNode({document,pointer,replacement}) as {document:Document;validation:Validation});},
    renameSparkField(document:Document,options:Parameters<typeof renameSparkField>[1]):ReturnType<typeof renameSparkField>{return call(()=>engine.spark.renameField({document,options}) as ReturnType<typeof renameSparkField>);},
  });
}
