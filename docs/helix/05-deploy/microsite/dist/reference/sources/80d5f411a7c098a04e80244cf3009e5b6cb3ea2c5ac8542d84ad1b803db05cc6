import {copyJson,LIMITS} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import {createValidator} from '../../validation/schema';
import {assembleSmithyDocument,createSmithyJavaScriptBackend,type SmithyAssemblyBackend,type SmithyAssemblyResult} from './assembly';
import reportSchema from '../../../spec/extensions/smithy/native-selection.schema.json';
export interface SmithySelectionBackend extends SmithyAssemblyBackend {select(modelJson:string,selector:string,control?:{signal?:AbortSignal}):string|Promise<string>;}
export interface SmithySelectionResult {status:'selected'|'blocked';selector:string;assembly:SmithyAssemblyResult;shapeIds?:string[];issues:Diagnostic[];complete:false;}
const check=createValidator(false).compile(reportSchema);
/** Explicit native shape-set query. Variable environments are not returned by this API. */
export function createSmithyJavaScriptSelectionBackend(module:{assemble(sourcesJson:string):string;select(modelJson:string,selector:string,control?:{signal?:AbortSignal}):string}):SmithySelectionBackend{
 if(typeof module?.select!=='function')throw new UmfError('SMITHY_RUNTIME','Expected the installed Smithy selector runtime');
 return {...createSmithyJavaScriptBackend(module),select:(model,selector)=>module.select(model,selector)};
}
export async function selectSmithyShapes(document:Document,backend:SmithySelectionBackend,selector:string,options:{id:string;signal?:AbortSignal}):Promise<SmithySelectionResult>{
 if(typeof selector!=='string'||!selector.trim()||selector.length>LIMITS.maxTextLength||typeof backend?.select!=='function')throw new UmfError('SMITHY_SELECTION_OPTIONS','A nonempty bounded selector and trusted selector backend are required');
 const assembly=await assembleSmithyDocument(document,backend,options);
 const result:SmithySelectionResult={status:'blocked',selector,assembly,issues:[],complete:false};
 if(assembly.status!=='assembled')return result;
 try{
  if(options.signal?.aborted)throw new UmfError('SMITHY_SELECTION_CANCELLED','Selection was cancelled');
  const raw=await backend.select(assembly.nativeModel!,selector,options.signal?{signal:options.signal}:{});
  if(options.signal?.aborted)throw new UmfError('SMITHY_SELECTION_CANCELLED','Selection was cancelled');
  if(typeof raw!=='string'||raw.length>LIMITS.maxTextLength)throw new UmfError('SMITHY_SELECTION_RESPONSE','Expected bounded native selector JSON');
  const report=copyJson(JSON.parse(raw)) as unknown as {shapeIds:string[]};
  if(!check(report))throw new UmfError('SMITHY_SELECTION_RESPONSE',JSON.stringify(check.errors));
  result.shapeIds=report.shapeIds.sort();result.status='selected';
 }catch(error){result.issues.push({code:error instanceof UmfError?error.code:'SMITHY_SELECTION_FAILED',path:'',severity:'error',message:String(error)});}
 return result;
}
