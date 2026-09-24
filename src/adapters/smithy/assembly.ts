import {copyJson,LIMITS} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import {createValidator} from '../../validation/schema';
import nativeReportSchema from '../../../spec/extensions/smithy/native-assembly.schema.json';
import {exportSmithyBundle,importSmithyJson,SMITHY_EXTENSION} from './index';
import {exportSmithySources} from './sources';
/** Trusted installed runtime. It must consume only the explicitly supplied files. */
export interface SmithyAssemblyBackend {identity:string;assemble(files:Record<string,string>,control?:{signal?:AbortSignal}):string|Promise<string>;}
export interface SmithyAssemblyEvent {id:string;severity:'SUPPRESSED'|'NOTE'|'WARNING'|'DANGER'|'ERROR';message:string;source?:{filename:string;line:number;column:number};shapeId?:string;}
export interface SmithyAssemblyResult {status:'assembled'|'blocked';compiler:string;source:Document;inputs:{file:string;dependencyId?:string}[];events:SmithyAssemblyEvent[];issues:Diagnostic[];complete:false;limitations:string[];model?:Document;nativeModel?:string;}
const check=createValidator(false).compile(nativeReportSchema);
/** Explicit opt-in adapter for the pinned generated JavaScript module, not arbitrary native code discovery. */
export function createSmithyJavaScriptBackend(module:{assemble(sourcesJson:string):string}):SmithyAssemblyBackend{
 if(typeof module?.assemble!=='function')throw new UmfError('SMITHY_RUNTIME','Expected the installed Smithy JavaScript assembly module');
 return {identity:'smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1',assemble:files=>module.assemble(JSON.stringify(files))};
}
export async function assembleSmithyDocument(document:Document,backend:SmithyAssemblyBackend,options:{id:string;signal?:AbortSignal}):Promise<SmithyAssemblyResult>{
 if(typeof options?.id!=='string'||!options.id||Object.keys(options).some(k=>!['id','signal'].includes(k))||typeof backend?.identity!=='string'||!backend.identity||typeof backend.assemble!=='function')throw new UmfError('SMITHY_ASSEMBLY_OPTIONS','Target model ID and a trusted identified assembly backend are required');
 if(options.signal!==undefined&&(!options.signal||typeof options.signal.aborted!=='boolean'||typeof options.signal.addEventListener!=='function'||typeof options.signal.removeEventListener!=='function'))throw new UmfError('SMITHY_ASSEMBLY_OPTIONS','Expected an AbortSignal');
 const source=copyJson(document) as unknown as Document;
 const files:Record<string,string>=Object.create(null);const inputs:SmithyAssemblyResult['inputs']=[];
 const profile=(source.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[SMITHY_EXTENSION] as any)?.profile;
 if(profile==='smithy-idl-sources'){
  for(const [file,text]of Object.entries(exportSmithySources(source).files)){files[file]=text;inputs.push({file});}
 }else{
  const bundle=exportSmithyBundle(source);files['root.json']=bundle.schema;inputs.push({file:'root.json'});
  bundle.dependencies.forEach((dep,i)=>{const file='dependency-'+i+'.json';files[file]=dep.schema;inputs.push({file,dependencyId:dep.id});});
 }
 const result:SmithyAssemblyResult={status:'blocked',compiler:backend.identity,source,inputs,events:[],issues:[],complete:false,limitations:['Native assembly normalizes model files, applies mixins and traits, and can omit source layout; retain the separate source document','Native serialization is not always idempotent for mixin member overrides; source provenance must be retained and effective model comparisons may differ from JSON identity','The pinned JavaScript port has explicit unsupported generic-superclass reflection; full custom-validator/runtime coverage is not certified','Assembly success does not establish cross-system projection equivalence or protocol execution behavior']};
 try{
  if(options.signal?.aborted)throw new UmfError('SMITHY_ASSEMBLY_CANCELLED','Assembly was cancelled before compilation');
  const raw=await backend.assemble(copyJson(files) as unknown as Record<string,string>,options.signal?{signal:options.signal}:{});
  if(options.signal?.aborted)throw new UmfError('SMITHY_ASSEMBLY_CANCELLED','Assembly was cancelled');
  if(typeof raw!=='string'||raw.length>LIMITS.maxTextLength)throw new UmfError('SMITHY_RUNTIME_RESPONSE','Runtime response must be bounded JSON text');
  const report=copyJson(JSON.parse(raw)) as unknown as {valid:boolean;events:SmithyAssemblyEvent[];modelJson?:string};
  if(!check(report))throw new UmfError('SMITHY_RUNTIME_RESPONSE',JSON.stringify(check.errors));
  result.events=report.events;
  if(!report.valid)return result;
  if(report.events.some(e=>e.severity==='ERROR'))throw new UmfError('SMITHY_RUNTIME_RESPONSE','Runtime claimed success with error events');
  const model=importSmithyJson(report.modelJson!,{id:options.id});
  result.model=model;result.nativeModel=report.modelJson!;result.status='assembled';
 }catch(error){result.issues.push({code:error instanceof UmfError?error.code:'SMITHY_ASSEMBLY_FAILED',path:'',severity:'error',message:String(error)});}
 return result;
}
