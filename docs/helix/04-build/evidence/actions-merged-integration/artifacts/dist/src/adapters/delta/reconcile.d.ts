import { type NativeJson } from '../../model/native-json';
import type { Document, Diagnostic } from '../../model/types';
export interface DeltaCommit {
    version: string;
    source: Document;
}
export interface DeltaActionOccurrence {
    version: string;
    line: number;
    action: string;
    value: NativeJson;
}
export interface DeltaActionState {
    version: string;
    protocol: NativeJson;
    metaData: NativeJson;
    adds: NativeJson[];
    removes: NativeJson[];
    transactions: NativeJson[];
    domains: NativeJson[];
    commitInfo: NativeJson[];
    deferred: DeltaActionOccurrence[];
}
export interface DeltaReconciliation {
    status: 'blocked' | 'reconciled';
    complete: false;
    sources: DeltaCommit[];
    diagnostics: Diagnostic[];
    state?: DeltaActionState;
    checkpoint?: DeltaCommit;
}
/** Derives action state, never authorizes table reads/writes or expires tombstones. */
export declare function reconcileDeltaCommits(commits: DeltaCommit[]): DeltaReconciliation;
/** Explicit checkpoint action views; V2 is the default, unresolved sidecars block. */
export declare function reconcileDeltaCheckpoint(checkpoint: DeltaCommit, commits: DeltaCommit[], spec?: 'v1' | 'v2'): DeltaReconciliation;
