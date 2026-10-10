import type { Document, Diagnostic } from '../../model/types';
import { type DeltaParquetActions } from './parquet';
import { type DeltaCommit, type DeltaReconciliation } from './reconcile';
export interface DeltaCheckpointPart {
    name: string;
    source: Document;
}
export interface DeltaMultipartRecovery {
    status: 'blocked' | 'reconciled';
    complete: false;
    version: string;
    partCount: number;
    parts: (DeltaCheckpointPart & {
        projection?: DeltaParquetActions;
    })[];
    sources: DeltaCommit[];
    diagnostics: Diagnostic[];
    origins?: {
        line: number;
        part: number;
        row: number;
    }[];
    recovery?: DeltaReconciliation;
}
/** Explicit complete multipart checkpoint set, with Spark-style file-key clustering checks. */
export declare function reconcileDeltaMultipartCheckpoint(version: string, partCount: number, parts: DeltaCheckpointPart[], commits: DeltaCommit[]): DeltaMultipartRecovery;
