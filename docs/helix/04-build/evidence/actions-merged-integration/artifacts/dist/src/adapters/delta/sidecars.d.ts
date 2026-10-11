import type { Document } from '../../model/types';
import { type DeltaScalarConversion } from './parquet';
import { type DeltaCommit, type DeltaReconciliation } from './reconcile';
export interface DeltaSidecar {
    path: string;
    source: Document;
}
export interface DeltaSidecarOrigin {
    line: number;
    checkpointLine: number;
    sidecar?: number;
    row?: number;
}
export interface DeltaSidecarReconciliation extends DeltaReconciliation {
    checkpoint: DeltaCommit;
    sidecars: DeltaSidecar[];
    derivedCheckpoint?: DeltaCommit;
    origins?: DeltaSidecarOrigin[];
    omittedNullFields?: {
        sidecar: number;
        row: number;
        path: string;
    }[];
    scalarConversions?: (DeltaScalarConversion & {
        sidecar: number;
    })[];
}
/** Exact caller-bound paths, no filesystem/network lookup or URI alias resolution. */
export declare function reconcileDeltaCheckpointSidecars(checkpoint: DeltaCommit, commits: DeltaCommit[], sidecars: DeltaSidecar[]): DeltaSidecarReconciliation;
