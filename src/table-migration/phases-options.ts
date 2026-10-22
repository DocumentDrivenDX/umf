// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableRef} from '../extensions/tables';

/** Explicit source-selected native constraints whose validation is deferred. */
export interface MigrationValidationSelection {
 table:string;
 constraint:string;
 kind:'check'|'foreignKey';
}

/** Version 0.2 adds mixed-phase intent while retaining the 0.1 selections. */
export interface TableMigrationPhasesOptions {
 version:'umf.table-migration-options/0.2';
 backfills:{table:string;column:TableRef;operation:string;scopedRows:true}[];
 concurrentIndexes:{table:string;index:string}[];
 reviewedChanges:unknown[];
 validations:MigrationValidationSelection[];
}

export type MigrationPhaseTransaction='required'|'forbidden';
export type MigrationPhaseKind='transaction'|'backfill'|'concurrent-index'|'constraint-add'|'constraint-validation'|'seed';

/** Durable execution profile, bound by the enclosing migration plan digest. */
export interface TableMigrationExecutionProfile {
 version:'umf.table-migration-execution/0.1';
 progressRelation:'umf_lifecycle_progress';
 ownerOnly:true;
}
