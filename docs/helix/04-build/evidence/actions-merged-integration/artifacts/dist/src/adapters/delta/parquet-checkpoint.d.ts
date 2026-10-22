import type { Diagnostic } from '../../model/types';
import { type DeltaParquetActions } from './parquet';
import { type DeltaCommit, type DeltaReconciliation } from './reconcile';
import { type DeltaSidecar, type DeltaSidecarReconciliation } from './sidecars';
export interface DeltaParquetCheckpointRecovery {
    status: 'blocked' | 'reconciled';
    complete: false;
    spec: 'v1' | 'v2';
    checkpoint: DeltaCommit;
    sources: DeltaCommit[];
    sidecars: DeltaSidecar[];
    diagnostics: Diagnostic[];
    projection?: DeltaParquetActions;
    recovery?: DeltaReconciliation | DeltaSidecarReconciliation;
}
/** Recover one explicit Parquet checkpoint; naming discovery and multipart assembly are separate. */
export declare function reconcileDeltaParquetCheckpoint(checkpoint: DeltaCommit, commits: DeltaCommit[], spec: 'v1' | 'v2', sidecars?: DeltaSidecar[]): DeltaParquetCheckpointRecovery;
