import {decodeParquetValues,type ParquetTypedValue} from '../parquet/values';
import {deltaStatScalar} from './stat-scalar';
import {captureDeltaLog} from './log';
import {inspectDeltaActions} from './actions';
import grammar from '../../../spec/extensions/delta-log/action-schema.json';
import {renderTree,type NativeJson} from '../../model/native-json';
import type {Document,Diagnostic} from '../../model/types';
export interface DeltaScalarConversion {row:number;path:string;input:ParquetTypedValue;output:NativeJson}
export interface DeltaParquetActions {source:Document;status:'projected'|'blocked';complete:false;diagnostics:Diagnostic[];log?:Document;actions?:{row:number;action:string;value:NativeJson}[];omittedNullFields?:{row:number;path:string}[];scalarConversions?:DeltaScalarConversion[]}
/** Project representable checkpoint rows into Delta actions, retaining authoritative Parquet source. */
export function projectDeltaParquetActions(source:Document):DeltaParquetActions {
 const typed=decodeParquetValues(source),r:DeltaParquetActions={source:typed.source,status:'blocked',complete:false,diagnostics:[...typed.diagnostics]};if(typed.status!=='projected')return r;
 const definitions=grammar.properties as Record<string,any>,actions:{row:number;action:string;value:NativeJson}[]=[],omitted:{row:number;path:string}[]=[],conversions:DeltaScalarConversion[]=[];
 function convert(v:ParquetTypedValue,s:any,row:number,path:string):NativeJson{
  if(v===null)return {kind:'null'};if(s?.anyOf)s=s.anyOf.find((x:any)=>x.type!=='null');
  if(v.kind==='struct'){const members:Record<string,NativeJson>=Object.create(null),seen=new Set<string>();for(const f of v.fields){if(seen.has(f.name))throw Error('Duplicate struct field at '+path);seen.add(f.name);const child=s?.properties&&Object.hasOwn(s.properties,f.name)?s.properties[f.name]:undefined;if(f.value===null&&child&&!(s.required??[]).includes(f.name)){omitted.push({row,path:path+'/'+escapePointer(f.name)});continue;}members[f.name]=convert(f.value,child,row,path+'/'+escapePointer(f.name));}return {kind:'object',members};}
  if(v.kind==='map'){const members:Record<string,NativeJson>=Object.create(null);for(const e of v.entries){if(e.key?.kind!=='string')throw Error('Delta JSON map requires string keys at '+path);const key=e.key.value;if(Object.hasOwn(members,key))throw Error('Duplicate map key cannot be discarded at '+path);members[key]=convert(e.value,s?.additionalProperties,row,path+'/'+escapePointer(key));}return {kind:'object',members};}
  if(v.kind==='list')return {kind:'array',items:v.items.map((x,i)=>convert(x,s?.items,row,path+'/'+i))};
  if(v.kind==='bool')return {kind:'boolean',value:v.value};if(v.kind==='int'||v.kind==='uint')return {kind:'number',value:v.value};if(['string','enum','json'].includes(v.kind))return {kind:'string',value:(v as {value:string}).value};
  if(path.startsWith('/add/stats_parsed/')||path.startsWith('/add/partitionValues_parsed/')){const output=deltaStatScalar(v);if(output){conversions.push({row,path,input:v,output});return output;}}
  throw Error('Logical '+v.kind+' requires a Delta-specific conversion at '+path);
 }
 try{
  for(const [index,row] of typed.rows!.entries()){
   if(row?.kind!=='struct')throw Error('Checkpoint row must be a struct');if(new Set(row.fields.map(f=>f.name)).size!==row.fields.length)throw Error('Duplicate checkpoint action column');const populated=row.fields.filter(f=>f.value!==null);if(populated.length!==1)throw Error('Checkpoint row must contain exactly one non-null action');const f=populated[0]!,value=convert(f.value,Object.hasOwn(definitions,f.name)?definitions[f.name]:undefined,index+1,'/'+escapePointer(f.name));actions.push({row:index+1,action:f.name,value});
  }
  let text='';for(const a of actions){text+=renderTree({kind:'object',members:{[a.action]:a.value}})+'\n';if(text.length>1000000)throw Error('Projected log exceeds capture limit');}
  const log=captureDeltaLog(text,{id:source.id+'-delta-actions'}),checked=inspectDeltaActions(log);r.diagnostics.push(...checked.diagnostics);if(!checked.knownShapesValid){throw Error('Projected known Delta action shapes are invalid');}
  r.actions=actions;r.log=log;r.omittedNullFields=omitted;r.scalarConversions=conversions;r.status='projected';r.diagnostics.push({code:'DELTA_PARQUET_ACTION_VIEW',path:'',severity:'warning',message:'Non-null action columns projected; known optional null fields normalized to absence with recorded paths. Annotated statistics conversions retain typed inputs and exact JSON outputs in scalarConversions. Native source is retained. Checkpoint protocol/state validity remains separate'});
 }catch(e){r.diagnostics.push({code:'DELTA_PARQUET_CONVERSION',path:'',severity:'error',message:(e as Error).message});}return r;
}

function escapePointer(s:string):string{return s.replace(/~/g,'~0').replace(/\//g,'~1');}
