// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic} from '../../model/types';
import type {DeltaParquetActions} from './parquet';
import type {DeltaCommit,DeltaReconciliation} from './reconcile';
import type {DeltaSidecar,DeltaSidecarReconciliation} from './sidecars';
export interface DeltaParquetCheckpointRecovery {
 status:'blocked'|'reconciled';complete:false;spec:'v1'|'v2';checkpoint:DeltaCommit;sources:DeltaCommit[];sidecars:DeltaSidecar[];diagnostics:Diagnostic[];
 projection?:DeltaParquetActions;recovery?:DeltaReconciliation|DeltaSidecarReconciliation;
}
