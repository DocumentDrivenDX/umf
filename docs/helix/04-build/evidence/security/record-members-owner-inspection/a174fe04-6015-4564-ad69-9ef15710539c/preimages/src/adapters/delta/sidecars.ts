import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import type {Document} from '../../model/types';
import {exportParquetCapture} from '../parquet';
import {captureDeltaLog} from './log';
import {inspectDeltaActions} from './actions';
import {projectDeltaParquetActions,type DeltaScalarConversion} from './parquet';
import {reconcileDeltaCheckpoint,type DeltaCommit,type DeltaReconciliation} from './reconcile';
export interface DeltaSidecar {path:string;source:Document}
export interface DeltaSidecarOrigin {line:number;checkpointLine:number;sidecar?:number;row?:number}
export interface DeltaSidecarReconciliation extends DeltaReconciliation {
 checkpoint:DeltaCommit;sidecars:DeltaSidecar[];
 derivedCheckpoint?:DeltaCommit;origins?:DeltaSidecarOrigin[];
 omittedNullFields?:{sidecar:number;row:number;path:string}[];scalarConversions?:(DeltaScalarConversion&{sidecar:number})[];
}
/** Exact caller-bound paths, no filesystem/network lookup or URI alias resolution. */
export function reconcileDeltaCheckpointSidecars(checkpoint:DeltaCommit,commits:DeltaCommit[],sidecars:DeltaSidecar[]):DeltaSidecarReconciliation {
 const r:DeltaSidecarReconciliation={status:'blocked',complete:false,checkpoint:copyJson(checkpoint) as unknown as DeltaCommit,sources:copyJson(commits) as unknown as DeltaCommit[],sidecars:copyJson(sidecars) as unknown as DeltaSidecar[],diagnostics:[]};
 const issue=(message:string,path='/checkpoint')=>r.diagnostics.push({code:'DELTA_SIDECAR_BINDING',path,severity:'error',message});
 try{
  if(sidecars.length>1000)throw Error('At most 1000 supplied sidecars');
  const inspected=inspectDeltaActions(r.checkpoint.source);r.diagnostics.push(...inspected.diagnostics.map(d=>({...d,path:'/checkpoint'+d.path})));if(!inspected.knownShapesValid)return r;
  const supplied=new Map<string,number>();for(const [i,s] of r.sidecars.entries()){if(supplied.has(s.path))throw Error('Duplicate supplied sidecar path');supplied.set(s.path,i);}
  const refs=new Set<string>(),origins:DeltaSidecarOrigin[]=[],omitted:{sidecar:number;row:number;path:string}[]=[],lines:string[]=[],conversions:(DeltaScalarConversion&{sidecar:number})[]=[];let size=0,bytesTotal=0,embedded=false;
  const append=(node:NativeJson,origin:Omit<DeltaSidecarOrigin,'line'>)=>{const text=renderTree(node);size+=text.length+1;if(size>1000000||lines.length>=10000)throw Error('Derived checkpoint exceeds JSONL limits');lines.push(text);origins.push({line:lines.length,...origin});};
  for(const l of inspected.lines){
   if(l.status!=='parsed'||l.node?.kind!=='object'||!l.action)throw Error('Checkpoint must contain parsed nonblank action lines');
   if(l.action!=='sidecar'){if(l.action==='add'||l.action==='remove')embedded=true;append(l.node,{checkpointLine:l.line});continue;}
   const value=l.node.members.sidecar!;if(value.kind!=='object')throw Error('Invalid sidecar action');const path=value.members.path,bytes=value.members.sizeInBytes;
   if(path?.kind!=='string'||bytes?.kind!=='number')throw Error('Invalid sidecar reference');if(refs.has(path.value))throw Error('Duplicate sidecar reference');refs.add(path.value);
   const index=supplied.get(path.value);if(index===undefined)throw Error('Missing supplied sidecar: '+path.value);const source=r.sidecars[index]!.source,raw=exportParquetCapture(source);bytesTotal+=raw.length;if(bytesTotal>16000000)throw Error('Supplied sidecars exceed 16 MB decode budget');if(BigInt(bytes.value)!==BigInt(raw.length))throw Error('Sidecar byte size does not match reference: '+path.value);
   const projected=projectDeltaParquetActions(source);r.diagnostics.push(...projected.diagnostics.map(d=>({...d,path:'/sidecars/'+index+d.path})));if(projected.status!=='projected')return r;
   for(const a of projected.actions!){if(a.action!=='add'&&a.action!=='remove')throw Error('Sidecars may contain only add/remove file actions');append({kind:'object',members:{[a.action]:a.value}},{checkpointLine:l.line,sidecar:index,row:a.row});}
   conversions.push(...projected.scalarConversions!.map(c=>({...c,sidecar:index})));
   omitted.push(...projected.omittedNullFields!.map(o=>({sidecar:index,...o})));
  }
  if(refs.size&&embedded)throw Error('Checkpoint cannot mix embedded and sidecar file actions');if(refs.size!==supplied.size)throw Error('Unreferenced supplied sidecar');
  const derived={version:r.checkpoint.version,source:captureDeltaLog(lines.join('\n')+'\n',{id:r.checkpoint.source.id+'-resolved'})};
  const replay=reconcileDeltaCheckpoint(derived,r.sources);r.diagnostics.push(...replay.diagnostics.map(d=>({...d,path:d.path.replace(/^\/checkpoint/,'/derivedCheckpoint')})));
  r.derivedCheckpoint=derived;r.origins=origins;r.omittedNullFields=omitted;r.scalarConversions=conversions;
  if(replay.status==='reconciled'){r.status='reconciled';r.state=replay.state!;}
  r.diagnostics.push({code:'DELTA_SIDECAR_SCOPE',path:'',severity:'warning',message:'Exact supplied reference strings and byte sizes checked; URI aliases, physical placement, modification times and data-reader feature support remain unverified. Original checkpoint and sidecars are authoritative'});
 }catch(e){issue((e as Error).message);}return r;
}
