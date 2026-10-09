import {generateDomainPackSchema} from './schema';
import {createValidator} from '../validation/schema';
import {copyJson} from '../model/json';
import {UmfError} from '../model/types';
const validate=createValidator().compile(generateDomainPackSchema());
/** Metadata admission only; this never resolves paths, executes code or fetches. */
function inspectDomainPackInternal(input:unknown):{valid:boolean;complete:boolean;diagnostics:string[]} {
 let pack:any;try{pack=copyJson(input);}catch(error){return {valid:false,complete:false,diagnostics:[String(error)]};}
 const diagnostics:string[]=[];
 if(!validate(copyJson(pack)))return {valid:false,complete:false,diagnostics:['Invalid canonical domain-pack metadata']};
 const schemas=pack.schemas??[],ids=schemas.map((s:any)=>s.id),sources=pack.sources??{};
 if(new Set(ids).size!==ids.length)diagnostics.push('Duplicate schema identity');
 for(const b of pack.source_bindings??[])if(!ids.includes(b.schema_id)||!Object.hasOwn(sources,b.source_id))diagnostics.push('Unresolved source binding');
 const profile=pack.execution_profile;
 if(Object.hasOwn(pack,'execution_profile')){
  if(!profile||typeof profile!=='object'||Array.isArray(profile))return {valid:false,complete:false,diagnostics:['Malformed execution profile']};
  const allowed=['version','targets','mode','scales','identity_columns','include_sources','qualification'];
  if(typeof profile!=='object'||Array.isArray(profile)||Object.keys(profile).some(k=>!allowed.includes(k)))diagnostics.push('Unsupported execution profile fields');
  if(profile.version!=='1.0.0')diagnostics.push('Unsupported execution profile version');
  if(!['fixed','scenario-replay'].includes(profile.mode))diagnostics.push('Unsupported execution profile mode');
  if(typeof profile.qualification!=='string'||!profile.qualification)diagnostics.push('Missing execution qualification');
  if(!profile.targets||typeof profile.targets!=='object'||Array.isArray(profile.targets)||!Object.keys(profile.targets).length)diagnostics.push('Missing schema targets');
  else for(const [target,selection] of Object.entries(profile.targets)){
   if(!['tabular','graph'].includes(target)||!Array.isArray(selection)||!selection.length||new Set(selection).size!==selection.length){diagnostics.push('Unsupported schema target');continue;}
   for(const id of selection){const s=schemas.find((s:any)=>s.id===id);if(!s||s.format!==(target==='tabular'?'tablespec':'umf'))diagnostics.push('Target schema format or identity mismatch');}
  }
  if(!Array.isArray(profile.include_sources)||new Set(profile.include_sources).size!==profile.include_sources.length||profile.include_sources.some((id:any)=>!Object.hasOwn(sources,id)))diagnostics.push('Unresolved source inclusion');
  if(profile.mode==='scenario-replay'){
   if(!profile.scales||typeof profile.scales!=='object'||Array.isArray(profile.scales)||!Object.keys(profile.scales).length||Object.values(profile.scales).some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000))diagnostics.push('Invalid scenario component scales');
   const selected=profile.targets?.tabular??[];
   if(!profile.identity_columns||typeof profile.identity_columns!=='object'||Array.isArray(profile.identity_columns)||Object.keys(profile.identity_columns).length!==selected.length||selected.some((id:string)=>!Array.isArray(profile.identity_columns[id])||!profile.identity_columns[id].length||new Set(profile.identity_columns[id]).size!==profile.identity_columns[id].length||profile.identity_columns[id].some((c:any)=>typeof c!=='string'||!c)))diagnostics.push('Invalid identity column mapping');
  }
 }
 return {valid:diagnostics.length===0,complete:diagnostics.length===0&&Boolean(profile),diagnostics};
}
export function requireDomainPackProfile(input:unknown){const result=inspectDomainPack(input);if(!result.valid)throw new UmfError('DOMAIN_PACK_PROFILE',result.diagnostics.join('; '));return result;}

export function inspectDomainPack(input:unknown):{valid:boolean;complete:boolean;diagnostics:string[]}{try{return inspectDomainPackInternal(input);}catch{return {valid:false,complete:false,diagnostics:['Malformed execution profile']};}}
