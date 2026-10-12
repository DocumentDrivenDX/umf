import {copyJson} from '../model/json';
import {createValidator} from '../validation/schema';
export function generateDomainPackLoaderSchema() {
 const text={type:'string',minLength:1};
 const path={type:'string',pattern:'^(?!/)(?!.*(?:^|/)\\.\\.?/)[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$'};
 return {$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:domain-pack-loader:1.0.0',type:'object',
 required:['version','id','implementation_version','profile','runtime','entrypoint','configuration_schema','qualification','artifacts'],
 properties:{version:{const:'1.0.0'},id:{const:'umf.document-loader'},implementation_version:{const:'1.0.0'},profile:{enum:['court-documents','sec-filings','documents']},runtime:{const:'bun'},entrypoint:{const:'run.ts'},configuration_schema:{const:'inventory.schema.json'},qualification:text,artifacts:{type:'array',minItems:2,maxItems:32,items:{type:'object',required:['reference','sha256'],properties:{reference:path,sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},additionalProperties:true}}},additionalProperties:true} as const;
}
const validate=createValidator().compile(generateDomainPackLoaderSchema());
/** Admission only. This function neither invokes nor resolves a companion. */
export function inspectDomainPackLoader(input:unknown):{valid:boolean;complete:boolean;diagnostics:string[]} {
 try {
  const value=copyJson(input) as any;
  if(!validate(value))return {valid:false,complete:false,diagnostics:['Unsupported or malformed loader companion']};
  const refs=value.artifacts.map((a:any)=>a.reference);
  const diagnostics:string[]=[];
  if(new Set(refs).size!==refs.length)diagnostics.push('Duplicate loader artifact');
  if(!refs.includes(value.entrypoint)||!refs.includes(value.configuration_schema))diagnostics.push('Incomplete loader artifact closure');
  return {valid:!diagnostics.length,complete:!diagnostics.length,diagnostics};
 }catch{return {valid:false,complete:false,diagnostics:['Non-JSON loader companion']};}
}
