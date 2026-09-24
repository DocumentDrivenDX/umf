import {copyJson} from '../../model/json';
import type {Diagnostic} from '../../model/types';
import {projectDeltaParquetActions,type DeltaParquetActions} from './parquet';
import {reconcileDeltaCheckpoint,type DeltaCommit,type DeltaReconciliation} from './reconcile';
import {reconcileDeltaCheckpointSidecars,type DeltaSidecar,type DeltaSidecarReconciliation} from './sidecars';
export interface DeltaParquetCheckpointRecovery {
 status:'blocked'|'reconciled';complete:false;spec:'v1'|'v2';checkpoint:DeltaCommit;sources:DeltaCommit[];sidecars:DeltaSidecar[];diagnostics:Diagnostic[];
 projection?:DeltaParquetActions;recovery?:DeltaReconciliation|DeltaSidecarReconciliation;
}
/** Recover one explicit Parquet checkpoint; naming discovery and multipart assembly are separate. */
export function reconcileDeltaParquetCheckpoint(checkpoint:DeltaCommit,commits:DeltaCommit[],spec:'v1'|'v2',sidecars:DeltaSidecar[]=[]):DeltaParquetCheckpointRecovery {
 const r:DeltaParquetCheckpointRecovery={status:'blocked',complete:false,spec,checkpoint:copyJson(checkpoint) as unknown as DeltaCommit,sources:copyJson(commits) as unknown as DeltaCommit[],sidecars:copyJson(sidecars) as unknown as DeltaSidecar[],diagnostics:[]};
 const issue=(message:string)=>r.diagnostics.push({code:'DELTA_PARQUET_CHECKPOINT',path:'',severity:'error',message});
 if(spec!=='v1'&&spec!=='v2'){issue('Expected v1 or v2 checkpoint spec');return r;}if(spec==='v1'&&sidecars.length){issue('V1 checkpoints cannot use supplied sidecars');return r;}
 try{r.projection=projectDeltaParquetActions(r.checkpoint.source);r.diagnostics.push(...r.projection.diagnostics.map(d=>({...d,path:'/projection'+d.path})));if(r.projection.status!=='projected')return r;
  const derived={version:r.checkpoint.version,source:r.projection.log!};r.recovery=spec==='v1'?reconcileDeltaCheckpoint(derived,r.sources,'v1'):reconcileDeltaCheckpointSidecars(derived,r.sources,r.sidecars);
  r.diagnostics.push(...r.recovery.diagnostics.map(d=>({...d,path:'/recovery'+d.path})));r.status=r.recovery.status;
 }catch(e){issue((e as Error).message);}return r;
}
