import {copyJson} from '../../model/json';
import {cloneTree,type NativeJson} from '../../model/native-json';
import type {Document,Diagnostic} from '../../model/types';
import {inspectDeltaActions} from './actions';
export interface DeltaCommit {version:string;source:Document}
export interface DeltaActionOccurrence {version:string;line:number;action:string;value:NativeJson}
export interface DeltaActionState {version:string;protocol:NativeJson;metaData:NativeJson;adds:NativeJson[];removes:NativeJson[];transactions:NativeJson[];domains:NativeJson[];commitInfo:NativeJson[];deferred:DeltaActionOccurrence[]}
export interface DeltaReconciliation {status:'blocked'|'reconciled';complete:false;sources:DeltaCommit[];diagnostics:Diagnostic[];state?:DeltaActionState;checkpoint?:DeltaCommit}
/** Derives action state, never authorizes table reads/writes or expires tombstones. */
export function reconcileDeltaCommits(commits:DeltaCommit[]):DeltaReconciliation{return replay(commits,false);}
/** Explicit checkpoint action views; V2 is the default, unresolved sidecars block. */
export function reconcileDeltaCheckpoint(checkpoint:DeltaCommit,commits:DeltaCommit[],spec:'v1'|'v2'='v2'):DeltaReconciliation{
 const r=replay([checkpoint,...commits],spec);r.checkpoint=r.sources.shift()!;
 for(const d of r.diagnostics)d.path=d.path.replace(/^\/sources\/(\d+)/,(_,i)=>Number(i)===0?'/checkpoint':'/sources/'+(Number(i)-1));return r;
}
function replay(commits:DeltaCommit[],checkpointMode:false|'v1'|'v2'):DeltaReconciliation{
 const sources=copyJson(commits) as unknown as DeltaCommit[],diagnostics:Diagnostic[]=[],result:DeltaReconciliation={status:'blocked',complete:false,sources,diagnostics};
 const issue=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
 if(checkpointMode!==false&&checkpointMode!=='v1'&&checkpointMode!=='v2'){issue('DELTA_CHECKPOINT_SPEC','','Expected v1 or v2 checkpoint spec');return result;}
 if(!commits.length){issue('DELTA_HISTORY_EMPTY','','A history must begin with version zero');return result;}
 if(commits.length>10000){issue('DELTA_HISTORY_LIMIT','','At most 10000 explicit commits can be reconciled');return result;}
 const first=commits[0]!.version;
 if(checkpointMode&&(!/^(0|[1-9]\d*)$/.test(first)||first.length>19||BigInt(first)>9223372036854775807n)){issue('DELTA_CHECKPOINT_VERSION','/sources/0/version','Expected a nonnegative signed-int64 checkpoint version');return result;}
 const start=checkpointMode?BigInt(first):0n;
 const histories:DeltaActionOccurrence[][]=[];
 for(const [i,c] of commits.entries()){
  if(!/^(0|[1-9]\d*)$/.test(c.version)||c.version.length>19||BigInt(c.version)!==start+BigInt(i)||BigInt(c.version)>9223372036854775807n){issue('DELTA_HISTORY_SEQUENCE','/sources/'+i+'/version',checkpointMode?'Require ascending contiguous versions after the checkpoint':'Require ascending contiguous versions beginning at zero');return result;}
  let r:ReturnType<typeof inspectDeltaActions>;try{r=inspectDeltaActions(c.source);}catch(e){issue('DELTA_HISTORY_SOURCE','/sources/'+i,(e as Error).message);return result;}
  for(const d of r.diagnostics)diagnostics.push({...d,path:'/sources/'+i+d.path});
  if(!r.knownShapesValid)return result;
  const actions:DeltaActionOccurrence[]=[];for(const l of r.lines){if(l.status==='blank'){issue('DELTA_HISTORY_BLANK','/sources/'+i+'/lines/'+(l.line-1),'Blank lines are outside the ordinary commit profile');continue;}if(l.status==='parsed'&&l.node?.kind==='object'&&l.action)actions.push({version:c.version,line:l.line,action:l.action,value:cloneTree(l.node.members[l.action]!)});}
  const isCheckpoint=checkpointMode&&i===0;
  if(isCheckpoint&&checkpointMode==='v2'){
   const markers=actions.filter(a=>a.action==='checkpointMetadata');if(markers.length!==1||markers[0]?.value.kind!=='object'||markers[0].value.members.version?.kind!=='number'||BigInt(markers[0].value.members.version.value)!==start)issue('DELTA_CHECKPOINT_METADATA','/sources/0','Exactly one checkpointMetadata must match the supplied version');
   const p=actions.find(a=>a.action==='protocol')?.value;const features=(k:string)=>p?.kind==='object'&&p.members[k]?.kind==='array'&&p.members[k].items.some(n=>n.kind==='string'&&n.value==='v2Checkpoint');
   if(!p||scalar(p,'minReaderVersion')!=='3'||scalar(p,'minWriterVersion')!=='7'||!features('readerFeatures')||!features('writerFeatures'))issue('DELTA_CHECKPOINT_PROTOCOL','/sources/0','V2 checkpoints require protocol 3/7 and both v2Checkpoint feature declarations');
  }
  const seen=new Set<string>();for(const a of actions){const at='/sources/'+i+'/lines/'+(a.line-1),v=a.value;
   if(isCheckpoint&&checkpointMode==='v1'&&['checkpointMetadata','sidecar'].includes(a.action)){issue('DELTA_CHECKPOINT_V1_ACTION',at,'V1 checkpoints cannot contain checkpointMetadata or sidecars');continue;}
   if(isCheckpoint&&a.action==='checkpointMetadata')continue;
   if(isCheckpoint&&a.action==='sidecar'){issue('DELTA_CHECKPOINT_SIDECAR_UNRESOLVED',at,'Parquet sidecars must be resolved before state can be reconstructed');continue;}
   if(isCheckpoint&&(['commitInfo','cdc'].includes(a.action)||(a.action==='domainMetadata'&&v.kind==='object'&&v.members.removed?.kind==='boolean'&&v.members.removed.value))){issue('DELTA_CHECKPOINT_FORBIDDEN_ACTION',at,'Checkpoint cannot contain provenance, CDC or removed domain actions');continue;}
   if(['sidecar','checkpointMetadata'].includes(a.action)){issue('DELTA_HISTORY_CHECKPOINT',at,'Checkpoint actions are not ordinary commit actions');continue;}
   let key:string|undefined;if(['protocol','metaData'].includes(a.action))key=a.action;
   else if(v.kind==='object'){const field={add:'path',remove:'path',txn:'appId',domainMetadata:'domain'}[a.action as 'add'];if(field)key=JSON.stringify([a.action,isCheckpoint&&a.action==='remove'?identity(v):scalar(v,field)]);}
   if(key){if(seen.has(key))issue('DELTA_HISTORY_DUPLICATE',at,'Duplicate action identity in one commit');seen.add(key);}
  }
  histories.push(actions);
 }
 if(diagnostics.some(d=>d.severity==='error'))return result;
 const adds=new Map<string,NativeJson>(),removes=new Map<string,NativeJson>(),transactions=new Map<string,NativeJson>(),domains=new Map<string,NativeJson>(),deferred:DeltaActionOccurrence[]=[];let protocol:NativeJson|undefined,metaData:NativeJson|undefined,commitInfo:NativeJson[]=[];
 for(const [i,actions] of histories.entries()){
  commitInfo=[];const newAdds=actions.filter(a=>a.action==='add'),newRemoves=actions.filter(a=>a.action==='remove');
  const removedKeys=new Set(newRemoves.map(a=>identity(a.value)));
  for(const a of newAdds){const key=identity(a.value),path=scalar(a.value,'path');if(removedKeys.has(key))issue('DELTA_HISTORY_FILE_CONFLICT','/sources/'+i,'Same logical file is both added and removed in one commit');const prior=adds.get(path);if(prior&&identity(prior)!==key&&!removedKeys.has(identity(prior)))issue('DELTA_HISTORY_DV_REPLACEMENT','/sources/'+i,'Changing a live file deletion vector requires removal of the prior logical file');}
  if(diagnostics.some(d=>d.severity==='error'))return result;
  for(const a of newRemoves){const key=identity(a.value),path=scalar(a.value,'path'),prior=adds.get(path);if(prior&&identity(prior)===key)adds.delete(path);removes.set(key,a.value);}
  for(const a of newAdds){adds.set(scalar(a.value,'path'),a.value);removes.delete(identity(a.value));}
  for(const a of actions){if(checkpointMode&&i===0&&a.action==='checkpointMetadata')continue;switch(a.action){case 'protocol':protocol=a.value;break;case 'metaData':metaData=a.value;break;case 'txn':transactions.set(scalar(a.value,'appId'),a.value);break;case 'domainMetadata':if(a.value.kind==='object'&&a.value.members.removed?.kind==='boolean'&&a.value.members.removed.value)domains.delete(scalar(a.value,'domain'));else domains.set(scalar(a.value,'domain'),a.value);break;case 'commitInfo':commitInfo.push(a.value);break;case 'add':case 'remove':break;default:deferred.push(a);}}
  if(!protocol||!metaData){issue('DELTA_HISTORY_INITIAL_CONTEXT','/sources/'+i,checkpointMode?'Checkpoint must establish protocol and metadata':'Version zero must establish protocol and metadata');return result;}
 }
 issue('DELTA_HISTORY_UNVERIFIED','','Action state only: feature requirements, encoded-path aliases, file contents, transaction legality and tombstone expiry remain unverified','warning');
 result.status='reconciled';result.state={version:commits.at(-1)!.version,protocol:protocol!,metaData:metaData!,adds:[...adds.values()],removes:[...removes.values()],transactions:[...transactions.values()],domains:[...domains.values()],commitInfo,deferred};return result;
}
function scalar(n:NativeJson,key:string):string{const v=n.kind==='object'?n.members[key]:undefined;if(v?.kind==='string'||v?.kind==='number')return v.value;throw Error('Validated action key missing');}
function identity(n:NativeJson):string{const path=scalar(n,'path'),dv=n.kind==='object'?n.members.deletionVector:undefined;if(!dv||dv.kind==='null')return JSON.stringify([path,null]);const offset=dv.kind==='object'?dv.members.offset:undefined;const id=scalar(dv,'storageType')+scalar(dv,'pathOrInlineDv')+(offset&&offset.kind!=='null'?'@'+BigInt(scalar(dv,'offset')).toString():'');return JSON.stringify([path,id]);}
