// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {DeltaParquetActions} from './parquet';
import type {DeltaCommit,DeltaReconciliation} from './reconcile';
export interface DeltaCheckpointPart {name:string;source:Document}
export interface DeltaMultipartRecovery {status:'blocked'|'reconciled';complete:false;version:string;partCount:number;parts:(DeltaCheckpointPart&{projection?:DeltaParquetActions})[];sources:DeltaCommit[];diagnostics:Diagnostic[];origins?:{line:number;part:number;row:number}[];recovery?:DeltaReconciliation}
