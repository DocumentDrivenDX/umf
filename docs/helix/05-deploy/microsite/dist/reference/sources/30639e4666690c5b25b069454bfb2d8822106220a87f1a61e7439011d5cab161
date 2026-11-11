// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic} from '../model/types';
import type {TableDeploymentBundle,TableDeploymentStep} from '../table-deployment/types';
import type {TableRef} from '../extensions/tables/types';

export type ReviewedChangeKind='drop-column'|'rename-column'|'change-column-type'|'tighten-not-null'|'relax-not-null'|'replace-check'|'replace-foreign-key'|'replace-index'|'replace-primary-key'|'change-policy'|'change-default'|'change-operation'|'change-operation-context';
export interface ReviewedChangeMarker {
 id:string;kind:ReviewedChangeKind;path:string;oldDigest:string;newDigest:string;conversion?:string;
}
export interface ReviewedChangeCandidate extends ReviewedChangeMarker {oldValue:unknown;newValue:unknown;oldPath?:string|null;newPath?:string|null}
export interface TableMigrationDiscoverySelector {version:'umf.table-migration-discovery/0.2'|'umf.table-migration-discovery/0.3'}

export type G04RecipeKind='numeric-exact'|'numeric-rescale'|'text-date'|'date-text'|'text-instant'|'instant-text'|'date-instant'|'instant-date'|'text-uuid'|'uuid-text'|'text-boolean'|'boolean-text';
export type G04Recipe={version:'umf.conversion-recipe/0.1';kind:G04RecipeKind;parameters:Record<string,unknown>};
export type G04Recovery={mode:'irreversible';reviewMarker:string}|{mode:'retained-originals';policy:{id:string;revision:string}}|{mode:'round-trip';proofProfile:string};
export interface G04ConversionSelection {table:string;field:{module:string;element:string};recipe:G04Recipe;nulls:'preserve';invalid:'abort';recovery:G04Recovery}
export interface G04ReviewMarker {id:string;kind:ReviewedChangeMarker['kind']|'conversion-effects';path:string;oldDigest:string;newDigest:string}
export interface G04MigrationOptions {version:'umf.table-migration-options/0.7';backfills:[];concurrentIndexes:[];reviewedChanges:G04ReviewMarker[];validations:[];conversions:G04ConversionSelection[]}
export interface G04DiscoverySelector {version:'umf.table-migration-discovery/0.4';conversionIntents:unknown[]}
export type G04ReviewedCandidate=Omit<ReviewedChangeCandidate,'kind'|'conversion'>&{kind:ReviewedChangeCandidate['kind']|'conversion-effects'};

export interface LegacyTableMigrationOptions {
 version:'umf.table-migration-options/0.1'|'umf.table-migration-options/0.2'|'umf.table-migration-options/0.3'|'umf.table-migration-options/0.4'|'umf.table-migration-options/0.5'|'umf.table-migration-options/0.6';
 backfills:{table:string;column:TableRef;operation:string;scopedRows:true}[];
 concurrentIndexes:{table:string;index:string}[];
 reviewedChanges?:ReviewedChangeMarker[];
 validations?:{table:string;constraint:string;kind:'check'|'foreignKey'}[];
}
export type TableMigrationOptions=LegacyTableMigrationOptions|G04MigrationOptions;
export interface MigrationReview {code:'SCOPED_BACKFILL'|'POLICY_CHANGE_REVIEW'|'IRREVERSIBLE_COLUMN_PURGE'|'IRREVERSIBLE_FIELD_CONVERSION';path:string;message:string}

export type MigrationPhaseTransaction='required'|'forbidden';
export type MigrationPhaseKind='transaction'|'backfill'|'backfill-tighten'|'backfill-add'|'default-change'|'field-replacement'|'field-conversion'|'concurrent-index'|'constraint-add'|'constraint-validation'|'seed';

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
}|{
 version:'umf.table-migration-execution/0.6';
 progressRelation:'umf_lifecycle_progress';
 ownerOnly:true;
 ingressProfile:'umf.table-generation-ingress/0.1';
 conversionProfile:'umf.checked-field-conversion/0.1';
 originalsProfile:'umf.pg-row-originals/0.1'|null;
};

export interface TableMigrationPhase {
 id:string;
 kind:MigrationPhaseKind;
 transaction:MigrationPhaseTransaction;
 steps:string[];
}

export interface TableMigrationRequest {
 id:string;predecessor:{id:string;digest:string}|null;
 previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options?:TableMigrationOptions;
}
export interface TableMigrationStep extends Omit<TableDeploymentStep,'transaction'|'kind'> {
 kind:TableDeploymentStep['kind']|'backfill'|'seed'|'conversion';transaction:'required'|'forbidden';operation?:string;constraintKind?:'check'|'foreignKey';seedSets?:string[];
 phaseOperation?:'backfill'|'tighten-not-null'|'add-column'|'target-check'|'install-default'|'change-default'|'drop-column'|'dependency-drop'|'dependency-add'|'capture-originals'|'convert-field'|'validate-conversion';phaseTarget?:{table:string;field:{module:string;element:string}};phaseDependency?:{table:string;kind:'check'|'foreignKey'|'index'|'key'|'policy'|'grant';id:string;sourcePath:string;meaningDigest:string};conversionBinding?:{profile:'umf.field-conversion-step/0.1';selectionIndex:number;intentDigest:string;beforeDomainDigest:string;afterDomainDigest:string};
 preconditions:{phase:'before-plan';kind:'empty-private-schema'|'installed-source-cohort';bundleDigest:string|null};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction'|'inspect-index';
}
type LegacyPhaseOperation=Exclude<NonNullable<TableMigrationStep['phaseOperation']>,'capture-originals'|'convert-field'|'validate-conversion'>;
export type LegacyTableMigrationStep=Omit<TableMigrationStep,'kind'|'phaseOperation'> & {kind:Exclude<TableMigrationStep['kind'],'conversion'>;phaseOperation?:LegacyPhaseOperation};
export interface TableMigrationPlan extends TableMigrationRequest {
 version:'umf.table-migration/0.1'|'umf.table-migration/0.2'|'umf.table-migration/0.3'|'umf.table-migration/0.4'|'umf.table-migration/0.5'|'umf.table-migration/0.6'|'umf.table-migration/0.7';canonicalization:'RFC8785';
 fromBundleDigest:string|null;toBundleDigest:string;steps:TableMigrationStep[];
 phases?:TableMigrationPhase[];executionProfile?:TableMigrationExecutionProfile;
 approvalProfile?:{version:'umf.table-migration-approval/0.1';relation:'umf_lifecycle_approvals';ownerOnly:true};
 seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};
 requiresApproval:true;nativeQualified:false;digest:string;review?:MigrationReview[];
}
export type TableMigrationResult={status:'compiled';plan:TableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
type LegacyMigrationVersion=Exclude<TableMigrationPlan['version'],'umf.table-migration/0.7'>;
export type LegacyTableMigrationPlan=Omit<TableMigrationPlan,'version'|'options'> & {version:LegacyMigrationVersion;options?:LegacyTableMigrationOptions};
export type G04TableMigrationPlan=Omit<TableMigrationPlan,'version'|'options'> & {version:'umf.table-migration/0.7';options:G04MigrationOptions};
export type LegacyTableMigrationResult={status:'compiled';plan:LegacyTableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
export type G04TableMigrationResult={status:'compiled';plan:G04TableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
