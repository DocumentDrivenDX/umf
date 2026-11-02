// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Entry} from '../schema-browser/types';
import type {PackToolsRequest,PackToolsResult} from '../../../../src/domain-packs/pack-tools-types';

export type PackToolsRuntime=(request:PackToolsRequest)=>PackToolsResult|Promise<PackToolsResult>;
export type PackTarget='ddl'|'orm'|'crud';
export interface PackToolsOptions {schema:string;package:string;targets:PackTarget[]}
export class PackToolsInputError extends Error {
 constructor(readonly code:string,message:string,readonly source=''){super(message);this.name='PackToolsInputError';}
}
export interface PackSourceRow {id:string;reference:string;format:string;schemaFormat:string;entry?:Entry}
export function packEntries(entries:readonly Entry[]){return entries.filter(entry=>entry.id.startsWith('pack:')&&typeof entry.text==='string').sort((a,b)=>a.title.localeCompare(b.title)||String(a.packVersion).localeCompare(String(b.packVersion)));}
export function packSources(pack:Entry,entries:readonly Entry[]):PackSourceRow[]{
 if(!pack.text)throw new PackToolsInputError('PACK_TOOLS_PACK_SOURCE','Pack manifest source is unavailable');
 let manifest:any;try{manifest=JSON.parse(pack.text);}catch{throw new PackToolsInputError('PACK_TOOLS_PACK_SOURCE','Pack manifest must be JSON');}
 if(typeof manifest.id!=='string'||typeof manifest.version!=='string'||!Array.isArray(manifest.schemas))throw new PackToolsInputError('PACK_TOOLS_PACK_PROFILE','Manifest identity and declared schemas are required');
 const own=entries.filter(e=>e.pack===manifest.id&&e.packVersion===manifest.version&&e.id.startsWith('schema:'));
 const ids=new Set<string>(),references=new Set<string>();
 return manifest.schemas.map((declaration:any)=>{
  if(!declaration||typeof declaration.id!=='string'||typeof declaration.reference!=='string'||typeof declaration.format!=='string')throw new PackToolsInputError('PACK_TOOLS_PACK_SCHEMA','Manifest contains an incomplete schema declaration');
  if(ids.has(declaration.id)||references.has(declaration.reference))throw new PackToolsInputError('PACK_TOOLS_PACK_SCHEMA','Manifest declares a duplicate schema ID or reference',declaration.id);ids.add(declaration.id);references.add(declaration.reference);
  const entry=own.find(e=>e.path===declaration.reference&&e.id===`schema:${manifest.id}@${manifest.version}:${declaration.id}`);
  return {id:declaration.id,reference:declaration.reference,format:entry?.format??'json',schemaFormat:declaration.format,...(entry?{entry}:{})};
 });
}
export function packToolsRequest(pack:Entry,entries:readonly Entry[],options:PackToolsOptions):PackToolsRequest{
 if(!pack.text)throw new PackToolsInputError('PACK_TOOLS_PACK_SOURCE','Pack manifest source is unavailable');
 let manifest:any;try{manifest=JSON.parse(pack.text);}catch{throw new PackToolsInputError('PACK_TOOLS_PACK_SOURCE','Pack manifest must be JSON');}
 if(typeof manifest.id!=='string'||typeof manifest.version!=='string'||!Array.isArray(manifest.schemas))throw new PackToolsInputError('PACK_TOOLS_PACK_PROFILE','Manifest identity and declared schemas are required');
 if(!options.schema||!options.package||!options.targets.length)throw new PackToolsInputError('PACK_TOOLS_OPTIONS','Choose a PostgreSQL schema, a Python package, and at least one output');
 const own=entries.filter(e=>e.pack===manifest.id&&e.packVersion===manifest.version&&e.id.startsWith('schema:'));
 const ids=new Set<string>(),references=new Set<string>();
 const sources=manifest.schemas.map((declaration:any)=>{
  if(!declaration||typeof declaration.id!=='string'||typeof declaration.reference!=='string'||typeof declaration.format!=='string')throw new PackToolsInputError('PACK_TOOLS_PACK_SCHEMA','Manifest contains an incomplete schema declaration');
  if(ids.has(declaration.id)||references.has(declaration.reference))throw new PackToolsInputError('PACK_TOOLS_PACK_SCHEMA','Manifest declares a duplicate schema ID or reference',declaration.id);ids.add(declaration.id);references.add(declaration.reference);
  const entry=own.find(e=>e.path===declaration.reference&&e.id===`schema:${manifest.id}@${manifest.version}:${declaration.id}`);
  if(!entry||typeof entry.text!=='string')throw new PackToolsInputError('PACK_TOOLS_SOURCE_UNAVAILABLE',`Declared source “${declaration.reference}” is missing from this catalog.`,declaration.id);
  return {id:declaration.id,path:declaration.reference,format:entry.format,schemaFormat:declaration.format,text:entry.text};
 });
 return {profile:'umf.pack-tools/1',pack:{id:manifest.id,version:manifest.version,text:pack.text},sources,options:{schema:options.schema,package:options.package},targets:[...options.targets]};
}
export async function runDomainPackTools(pack:Entry,entries:readonly Entry[],runtime:PackToolsRuntime,options:PackToolsOptions):Promise<PackToolsResult>{
 const request=packToolsRequest(pack,entries,options),result=await runtime(request);
 if(!result||result.profile!=='umf.pack-tools-result/1'||!['generated','partial','blocked'].includes(result.status)||result.pack?.id!==request.pack.id||result.pack?.version!==request.pack.version||!Array.isArray(result.files)||!Array.isArray(result.diagnostics)||!Array.isArray(result.coverage))throw new PackToolsInputError('PACK_TOOLS_RESPONSE','Rust pack-tools returned an invalid result profile.');
 const outputPaths=new Set<string>();for(const file of result.files){if(!file||typeof file.path!=='string'||file.path.startsWith('/')||file.path.includes('\\')||file.path.includes('\0')||file.path.split('/').some(part=>part==='..'||part==='')||typeof file.text!=='string'||!['ddl','orm','crud','source','report','readme'].includes(file.kind))throw new PackToolsInputError('PACK_TOOLS_RESPONSE','Rust pack-tools returned an unsafe or malformed output file.');if(outputPaths.has(file.path))throw new PackToolsInputError('PACK_TOOLS_RESPONSE','Rust pack-tools returned a duplicate output path.');outputPaths.add(file.path);}
 return result;
}
export function slug(value:string){return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'domain_pack';}
export function packDefaultOptions(title:string){const stem=slug(title);return {schema:/^[a-z_]/.test(stem)?stem:`_${stem}`,package:/^[a-z]/.test(stem)?stem:`pack_${stem}`};}
export function packSearchText(entry:Entry,entries:readonly Entry[]=[]){const sources=entries.filter(e=>e.pack===entry.pack&&e.packVersion===entry.packVersion).map(e=>`${e.title}\n${e.path}\n${e.text??''}`).join('\n');return `${entry.title}\n${entry.pack??''}\n${entry.packVersion??''}\n${entry.description??''}\n${entry.text??''}\n${sources}`.toLowerCase();}
