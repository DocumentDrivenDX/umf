// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableRef} from '../extensions/tables';

/** Explicit source-selected native constraints whose validation is deferred. */
export interface MigrationValidationSelection {
 table:string;
 constraint:string;
 kind:'check'|'foreignKey';
}

/** Version 0.2 adds mixed-phase intent; 0.3 existing fills; 0.4 row expressions; 0.5 future defaults. */
export interface TableMigrationPhasesOptions {
 version:'umf.table-migration-options/0.2'|'umf.table-migration-options/0.3'|'umf.table-migration-options/0.4'|'umf.table-migration-options/0.5'|'umf.table-migration-options/0.6';
 backfills:{table:string;column:TableRef;operation:string;scopedRows:true}[];
 concurrentIndexes:{table:string;index:string}[];
 reviewedChanges:unknown[];
 validations:MigrationValidationSelection[];
}

export type MigrationPhaseTransaction='required'|'forbidden';
export type MigrationPhaseKind='transaction'|'backfill'|'backfill-tighten'|'backfill-add'|'default-change'|'field-replacement'|'concurrent-index'|'constraint-add'|'constraint-validation'|'seed';

/** Durable execution profile, bound by the enclosing migration plan digest. */
export type TableMigrationExecutionProfile={
 version:'umf.table-migration-execution/0.1'|'umf.table-migration-execution/0.2'|'umf.table-migration-execution/0.3'|'umf.table-migration-execution/0.4';
 progressRelation:'umf_lifecycle_progress';
 ownerOnly:true;
}|{
 version:'umf.table-migration-execution/0.5';
 progressRelation:'umf_lifecycle_progress';
 ownerOnly:true;
 ingressProfile:'umf.table-generation-ingress/0.1';
};
