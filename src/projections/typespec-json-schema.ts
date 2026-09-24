import {copyJson} from '../model/json';
import {UmfError,type Document,type JsonObject} from '../model/types';
import {emitTypeSpecJsonSchema} from '../adapters/typespec/emission';
import {importJsonSchema,inspectJsonSchema} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface TypeSpecJsonSchemaPolicy {
 id:string;rootFile:string;retrievalBase:string;options:JsonObject;
 usage:'native-emission';lossPolicy:'strict'|'allow-reported-loss';
}
/** Materialize native output with its dependencies; no claim of source-domain equivalence. */
export async function projectTypeSpecToJsonSchema(source:Document,input:TypeSpecJsonSchemaPolicy){
 const policy=copyJson(input) as unknown as TypeSpecJsonSchemaPolicy;
 if(!policy||typeof policy!=='object'||Object.keys(policy).some(k=>!['id','rootFile','retrievalBase','options','usage','lossPolicy'].includes(k))||typeof policy.id!=='string'||!policy.id||typeof policy.rootFile!=='string'||!policy.rootFile||typeof policy.retrievalBase!=='string'||policy.usage!=='native-emission'||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||!policy.options||policy.options['file-type']!=='json')throw new UmfError('TYPESPEC_PROJECTION_POLICY','Explicit native-emission policy, JSON file type and root output file are required');
 let base:URL;try{base=new URL(policy.retrievalBase);if(!['http:','https:'].includes(base.protocol)||base.hash||base.search||!base.pathname.endsWith('/'))throw new Error();}catch{throw new UmfError('TYPESPEC_PROJECTION_POLICY','Retrieval base must be an absolute HTTP(S) directory without query or fragment');}
 const emission=await emitTypeSpecJsonSchema(source,{options:policy.options});
 const result:{status:'blocked'|'projected';source:Document;policy:TypeSpecJsonSchemaPolicy;complete:false;emission:typeof emission;issues:ProjectionIssue[];resources:{file:string;retrievalUri:string}[];target?:Document}={status:'blocked',source:copyJson(source) as unknown as Document,policy,complete:false,emission,issues:[],resources:[]};
 const issue=(code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path:'',code,classification,detail,retainedInSource:true});
 issue('TYPESPEC_UNREVIEWED_SEMANTICS','not-enforced','Native emission has no exhaustive per-concept fidelity audit. Source operations, decorators and runtime semantics are not guaranteed in target validation. This is not an instance converter.');
 issue('TYPESPEC_NUMERIC_PRECISION','representation-change','Pinned native emitter can round exact numeric literals; int64-strategy does not prevent this. Original source retains exact values.');
 issue('TYPESPEC_INT64_CONSTRAINTS','not-enforced','Pinned native emitter omits int64/uint64 bounds and string numeric syntax constraints. These are global risks, not per-source findings.');
 if(emission.status!=='emitted'){issue('TYPESPEC_EMISSION_UNAVAILABLE','unsupported','Native emission is '+emission.status);return result;}
 if(policy.lossPolicy==='strict')return result;
 if(!Object.hasOwn(emission.files,policy.rootFile)){issue('TYPESPEC_ROOT_UNAVAILABLE','unsupported','Selected root output file is absent');return result;}
 const resources:Record<string,string>=Object.create(null);let rootUri='';
 for(const [file,text]of Object.entries(emission.files)){
  // Encode file segments, never reinterpret generated filenames as URL query/fragment syntax.
  if(!file.endsWith('.json')||file.startsWith('/')||file.split('/').some(x=>!x||x==='.'||x==='..')){issue('TYPESPEC_OUTPUT_RESOURCE','unsupported','Output file cannot be registered as a JSON resource: '+file);return result;}
  const uri=new URL(file.split('/').map(encodeURIComponent).join('/'),base).href;
  result.resources.push({file,retrievalUri:uri});
  if(file===policy.rootFile)rootUri=uri;else resources[uri]=text;
 }
 try{
  const target=importJsonSchema(emission.files[policy.rootFile]!,{id:policy.id,baseUri:rootUri,resources});
  const inspection=inspectJsonSchema(target);
  for(const diagnostic of inspection.diagnostics)issue(diagnostic.code,diagnostic.severity==='error'?'unsupported':'not-enforced',diagnostic.message);
  if(!inspection.valid)return result;
  result.target=target;result.status='projected';
 }catch(error){issue('TYPESPEC_TARGET_INVALID','unsupported',String(error));}
 return result;
}
