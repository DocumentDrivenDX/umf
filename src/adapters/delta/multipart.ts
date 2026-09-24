import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import type {Document,Diagnostic} from '../../model/types';
import {exportParquetCapture} from '../parquet';
import {projectDeltaParquetActions,type DeltaParquetActions} from './parquet';
import {captureDeltaLog} from './log';
import {reconcileDeltaCheckpoint,type DeltaCommit,type DeltaReconciliation} from './reconcile';
import {sparkStringHash} from './spark-hash';
export interface DeltaCheckpointPart {name:string;source:Document}
export interface DeltaMultipartRecovery {status:'blocked'|'reconciled';complete:false;version:string;partCount:number;parts:(DeltaCheckpointPart&{projection?:DeltaParquetActions})[];sources:DeltaCommit[];diagnostics:Diagnostic[];origins?:{line:number;part:number;row:number}[];recovery?:DeltaReconciliation}
/** Explicit complete multipart checkpoint set, with Spark-style file-key clustering checks. */
export function reconcileDeltaMultipartCheckpoint(version:string,partCount:number,parts:DeltaCheckpointPart[],commits:DeltaCommit[]):DeltaMultipartRecovery {
 copyJson(partCount);
 const r:DeltaMultipartRecovery={status:'blocked',complete:false,version,partCount,parts:copyJson(parts) as unknown as DeltaCheckpointPart[],sources:copyJson(commits) as unknown as DeltaCommit[],diagnostics:[]};
 try{
  if(!/^(0|[1-9]\d*)$/.test(version)||version.length>19||BigInt(version)>9223372036854775807n)throw Error('Expected signed-int64 checkpoint version');if(!Number.isInteger(partCount)||partCount<2||partCount>1000||parts.length!==partCount)throw Error('Require exactly 2..1000 declared parts');
  const ordinals=new Map<number,number>();let bytes=0;for(const [i,p] of r.parts.entries()){const m=/^(\d{20})\.checkpoint\.(\d{10})\.(\d{10})\.parquet$/.exec(p.name);if(!m||BigInt(m[1]!)!==BigInt(version)||Number(m[3])!==partCount)throw Error('Part filename does not match version/count');const ordinal=Number(m[2]);if(ordinal<1||ordinal>partCount||ordinals.has(ordinal))throw Error('Missing, duplicate or out-of-range part identity');ordinals.set(ordinal,i);bytes+=exportParquetCapture(p.source).length;if(bytes>16000000)throw Error('Multipart input exceeds 16 MB budget');}
  const all:{part:number;ordinal:number;row:number;action:string;value:NativeJson}[]=[],lines:string[]=[];let textUnits=0;
  for(let ordinal=1;ordinal<=partCount;ordinal++){const i=ordinals.get(ordinal)!;const p=r.parts[i]!,projection=projectDeltaParquetActions(p.source);p.projection=projection;r.diagnostics.push(...projection.diagnostics.map(d=>({...d,path:'/parts/'+i+'/projection'+d.path})));if(projection.status!=='projected')return r;for(const a of projection.actions!){const line=renderTree({kind:'object',members:{[a.action]:a.value}});textUnits+=line.length+1;if(textUnits>1000000||all.length>=10000)throw Error('Combined action limit exceeded');lines.push(line);all.push({...a,part:i,ordinal});}}
  const protocol=all.find(a=>a.action==='protocol')?.value,features=(key:string)=>protocol?.kind==='object'&&protocol.members[key]?.kind==='array'?protocol.members[key].items.filter(n=>n.kind==='string').map(n=>n.value):[];
  const reader=features('readerFeatures'),writer=features('writerFeatures');if(reader.includes('v2Checkpoint')||writer.includes('v2Checkpoint'))throw Error('v2Checkpoint forbids multipart checkpoints');const dv=reader.includes('deletionVectors')||writer.includes('deletionVectors');if(dv&&(!reader.includes('deletionVectors')||!writer.includes('deletionVectors')))throw Error('Deletion-vector feature declarations disagree');
  const scalar=(n:NativeJson,key:string)=>{const v=n.kind==='object'?n.members[key]:undefined;if(v?.kind!=='string'&&v?.kind!=='number')throw Error('Missing file identity');return v.value;};
  if(dv&&(!protocol||scalar(protocol,'minReaderVersion')!=='3'||scalar(protocol,'minWriterVersion')!=='7'))throw Error('Deletion vectors require protocol 3/7');
  for(const a of all){let path:string|null=null,dvId:string|null=null;if(a.action==='add'||a.action==='remove'){path=scalar(a.value,'path');const d=a.value.kind==='object'?a.value.members.deletionVector:undefined;if(d&&d.kind!=='null'){if(!dv)throw Error('Deletion vector requires declared feature');const offset=d.kind==='object'?d.members.offset:undefined;dvId=scalar(d,'storageType')+scalar(d,'pathOrInlineDv')+(offset&&offset.kind!=='null'?'@'+BigInt(scalar(d,'offset')).toString():'');}}else if(!['protocol','metaData','txn','domainMetadata'].includes(a.action))throw Error('Unsupported or forbidden multipart action: '+a.action);
   const hash=dv?sparkStringHash(dvId,sparkStringHash(path)):sparkStringHash(path),expected=((hash%partCount)+partCount)%partCount+1;if(expected!==a.ordinal)throw Error('Action violates Spark hash partitioning at part '+a.ordinal+' row '+a.row);
  }
  const recovery=reconcileDeltaCheckpoint({version,source:captureDeltaLog(lines.join('\n')+'\n',{id:'multipart-'+version})},r.sources,'v1');r.origins=all.map((a,i)=>({line:i+1,part:a.part,row:a.row}));r.recovery=recovery;r.diagnostics.push(...r.recovery.diagnostics.map(d=>({...d,path:'/recovery'+d.path})));r.status=r.recovery.status;
  r.diagnostics.push({code:'DELTA_MULTIPART_SCOPE',path:'',severity:'warning',message:'Complete explicit part identities and Spark 4.0.1 hash clustering checked. Concurrent-writer provenance, atomicity, file discovery, data-reader support and safe writes remain unverified'});
 }catch(e){r.diagnostics.push({code:'DELTA_MULTIPART_BLOCKED',path:'',severity:'error',message:(e as Error).message});}return r;
}
