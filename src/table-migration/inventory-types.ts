// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Json} from '../model/types';
import type {TableRef} from '../extensions/tables/types';
import type {TableDeploymentBundle} from '../table-deployment/types';
import type {TableMigrationPlan} from './types';

interface InventoryTable {table:string;record:TableRef;schema:string;name:string;meaningDigest:string}
interface InventoryChange {kind:'create-table'|'remove-table';table:string;record:TableRef;beforePath:string|null;afterPath:string|null;beforeMeaningDigest:string;afterMeaningDigest:string}
type SeedLineageEntry={id:string;definitionDigest:string;originalSourceDigest:string;disposition:'retain-definition'|'apply-once'|'retire-definition';execution:'not-run'|'confirmed'};
interface PrefixFrame {profile:'umf.table-inventory-prefix/0.1';index:number;completedSteps:string[];tableStates:Json[];catalog:Record<string,Json[]>;metadata:{profile:'umf.table-inventory-metadata/0.1';state:'pristine'|'pending'|'published'};seedStates:Json[];digest:string}
/** Closed discovery-only selector. It deliberately has no review marker strings. */
export interface TableInventoryDiscoverySelector {
 version:'umf.table-inventory-discovery/0.1';
 tableIntents:TableInventoryDiscoveryIntent[];
 conversions:TableInventoryDiscoveryConversion[];
 retiredSeedSets:string[];
 retirements:TableInventoryRetirement[];
 restorations:TableInventoryRestoration[];
 archiveSources:TableInventoryArchiveSource[];
}
export type TableInventoryReference={module:string;element:string};
export type TableInventoryTableIntent=
 |{kind:'create';table:string;record:TableInventoryReference}
 |{kind:'remove';table:string;record:TableInventoryReference;disposition:{mode:'irreversible-purge';reviewMarker:string}};
export type TableInventoryDiscoveryIntent=
 |{kind:'create';table:string;record:TableInventoryReference}
 |{kind:'remove';table:string;record:TableInventoryReference;disposition:{mode:'irreversible-purge'}};
export type TableInventoryDiscoveryConversion=Omit<TableInventoryConversion,'recovery'> & {recovery:{mode:'irreversible'}|Exclude<TableInventoryConversion['recovery'],{mode:'irreversible'}>};
export interface TableInventoryConversion {table:string;field:TableInventoryReference;recipe:{version:'umf.conversion-recipe/0.1';kind:string;parameters:import('../model/types').JsonObject};nulls:'preserve';invalid:'abort';recovery:{mode:'irreversible';reviewMarker:string}|{mode:'retained-originals';policy:{id:string;revision:string}}|{mode:'round-trip';proofProfile:'umf.exact-integer-widening-roundtrip/0.1'}}
export interface TableInventoryRetirement {table:string;field:TableInventoryReference;retention:{policyId:string;policyRevision:number;minimumRetentionMs:number}}
export interface TableInventoryArchiveSource {digest:string;source:{format:'json';utf8:string}}
export interface TableInventoryRestoration {table:string;field:TableInventoryReference;archive:{profile:'umf.retired-field-archive-ref/0.1';providerId:string;archiveId:string;tableToken:string;targetCustody:import('../model/types').Json;retirementPlanDigest:string;retirementSourceDigest:string;fieldMeaningDigest:string};newInstances:{mode:'refuse'}|{mode:'null'}|{mode:'fill';expression:import('../model/types').Json}}
export type TableInventoryReviewedChangeKind='drop-column'|'rename-column'|'change-column-type'|'tighten-not-null'|'relax-not-null'|'replace-check'|'replace-foreign-key'|'replace-index'|'replace-primary-key'|'change-policy'|'change-default'|'change-operation'|'change-operation-context'|'create-table'|'remove-table'|'table-removal-effects'|'retire-seed-history'|'conversion-effects';
export interface TableInventoryMigrationMarker {id:string;kind:TableInventoryReviewedChangeKind;path:string;oldDigest:string;newDigest:string}
export interface TableInventoryMigrationOptions {
 version:'umf.table-inventory-migration-options/0.1';
 tableIntents:TableInventoryTableIntent[];
 backfills:{table:string;column:TableInventoryReference;operation:string;scopedRows:true}[];
 defaultChanges:{table:string;field:TableInventoryReference}[];
 conversions:TableInventoryConversion[];
 concurrentIndexes:{table:string;index:string}[];
 validations:{table:string;constraint:string;kind:'check'|'foreignKey'}[];
 reviewedChanges:TableInventoryMigrationMarker[];
 seedSets:string[];retiredSeedSets:string[];
 retirements:TableInventoryRetirement[];restorations:TableInventoryRestoration[];archiveSources:TableInventoryArchiveSource[];
}
export interface TableInventoryHistoryExecution {planDigest:string;entryDigest:string;seedOutcomes:TableInventorySeedOutcome[]}
export interface TableInventorySeedOutcome {id:string;definitionDigest:string;originalSourceDigest:string;execution:'confirmed';proof:{kind:'atomic-publication';entryDigest:string}|{kind:'phase';phaseId:string;phaseDigest:string;phaseReceiptDigest:string;entryDigest:string}}
export type TableInventoryHistoryPlan=TableInventoryMigrationPlan|TableMigrationPlan;
export interface TableInventorySourceHistory {profile:'umf.table-inventory-source-history/0.1';plans:TableInventoryHistoryPlan[];executions:TableInventoryHistoryExecution[]}
export interface TableInventoryMigrationRequest {id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:TableInventoryMigrationOptions;history:TableInventorySourceHistory}
export type TableInventoryTableReviewEffects=readonly ['new-physical-binding']|readonly ['ordinary-access-retired','stored-rows-irreversibly-purged','physical-binding-removed'];
export interface TableInventoryTableReview {
 profile:'umf.table-inventory-review/0.1';side:'previous'|'next';source:{format:'json';sha256:string};configuration:import('../model/types').Json;table:string;record:{module:string;element:string};meaning:import('../model/types').Json|null;intent:TableInventoryDiscoveryIntent;effects:TableInventoryTableReviewEffects;
}
export interface TableInventorySeedReview {
 profile:'umf.table-inventory-seed-retirement-review/0.1';side:'previous'|'next';source:{format:'json';sha256:string};configuration:import('../model/types').Json;id:string;definition:import('../model/types').Json;definitionDigest:string;originalSourceDigest:string;execution:'not-run'|'confirmed';retired:boolean;effects:readonly []|readonly ['original-definition-and-execution-retained-in-history','no-data-replay'];
}
export type TableInventoryReviewValue=TableInventoryTableReview|TableInventorySeedReview;
type TableInventoryCandidateBase=Omit<TableInventoryMigrationMarker,'kind'>;
type TableInventoryLegacyReviewKind=Exclude<TableInventoryReviewedChangeKind,'create-table'|'remove-table'|'table-removal-effects'|'retire-seed-history'|'conversion-effects'>;
export type TableInventoryReviewedChangeCandidate=
 |(TableInventoryCandidateBase&{kind:'create-table';oldValue:TableInventoryTableReview|null;newValue:TableInventoryTableReview;oldPath:null;newPath:string})
 |(TableInventoryCandidateBase&{kind:'remove-table'|'table-removal-effects';oldValue:TableInventoryTableReview;newValue:TableInventoryTableReview;oldPath:string;newPath:null})
 |(TableInventoryCandidateBase&{kind:'retire-seed-history';oldValue:TableInventorySeedReview;newValue:TableInventorySeedReview;oldPath:string;newPath:null})
 |(TableInventoryCandidateBase&{kind:TableInventoryLegacyReviewKind;oldValue:import('../model/types').Json|null;newValue:import('../model/types').Json|null;oldPath?:string|null;newPath?:string|null});

export interface TableInventoryMigrationStep {
 id:string;kind:'table'|'foreignKey'|'index'|'policy'|'grant'|'comment'|'backfill'|'seed'|'conversion'|'retirement'|'metadata';
 sourcePath:string;transaction:'required'|'forbidden';sql:string;operation:'create-table'|'remove-table'|'enable-rls'|'force-rls'|'add-column'|'drop-column'|'target-check'|'install-default'|'change-default'|'tighten-not-null'|'relax-not-null'|'rename-column'|'dependency-drop'|'dependency-add'|'apply-backfill'|'apply-seeds'|'capture-originals'|'convert-field'|'validate-conversion'|'capture-retired-values'|'retire-field'|'restore-field'|'validate-restoration'|'create-concurrent-index'|'add-not-valid'|'validate'|'set-comment'|'prepare-inventory-metadata'|'record-inventory-approval'|'publish-inventory';inventorySubject:Json;
 preconditions:{kind:'inventory-prefix';prefixDigest:string};expectedOutcome:{kind:'inventory-prefix';prefixDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction'|'inspect-index';
 dataBinding?:Json;seedSets?:string[];conversionBinding?:Json;retirementBinding?:Json;
}
export interface TableInventoryMigrationPhase {id:string;kind:'prepare'|'approval'|'transaction'|'backfill-add'|'backfill-tighten'|'field-replacement'|'field-conversion'|'field-retirement'|'field-restoration'|'concurrent-index'|'constraint-add'|'constraint-validation'|'seed'|'publication';transaction:'required'|'forbidden';steps:string[]}
export interface TableInventoryExecutionProfile {version:'umf.table-inventory-execution/0.1';progressRelation:'umf_lifecycle_inventory_progress';ownerOnly:true;ingressProfile:'umf.table-inventory-generation-ingress/0.1';inventoryProfile:'umf.table-inventory-prefix/0.1';initial:boolean;conversionProfile:string|null;originalsProfile:string|null;retirementProfile:string|null;retiredStoreProfile:string|null}
export interface TableInventoryPlanInventory {profile:'umf.table-inventory-delta/0.1';previousTables:InventoryTable[];nextTables:InventoryTable[];changes:InventoryChange[];seedLineage:SeedLineageEntry[]}
export interface TableInventoryMigrationPlan {
 version:'umf.table-inventory-migration/0.1';canonicalization:'RFC8785';id:string;
 predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;
 fromBundleDigest:string|null;toBundleDigest:string;steps:TableInventoryMigrationStep[];
 seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};phases:TableInventoryMigrationPhase[];
 executionProfile:TableInventoryExecutionProfile;approvalProfile:{version:'umf.table-migration-approval/0.1';relation:'umf_lifecycle_approvals';ownerOnly:true};options:TableInventoryMigrationOptions;review:TableInventoryReviewedChangeCandidate[];
 requiresApproval:true;nativeQualified:false;inventory:TableInventoryPlanInventory;prefixes:PrefixFrame[];
 historyBinding:{profile:'umf.table-inventory-source-history/0.1';count:number;digest:string};digest:string;
}
export type TableInventoryMigrationResult=
 |{status:'compiled';plan:TableInventoryMigrationPlan;diagnostics:[]}
 |{status:'blocked';diagnostics:Diagnostic[]};
