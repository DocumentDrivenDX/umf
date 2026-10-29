// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableGrantEffectRow} from '../table-deployment/grants';

/** Private, identity-bound opt-in used only by the compiler-internal entrypoint. */
const CAPTURE_REQUESTS=new WeakSet<object>();
export function requestTableMigrationOperationCapture(value:object):void{CAPTURE_REQUESTS.add(value);}
export function hasTableMigrationOperationCapture(value:object):boolean{return CAPTURE_REQUESTS.has(value);}

/** Private per-step metadata attached at the typed renderer call site. */
export const TABLE_MIGRATION_OPERATION = Symbol('umf.table-migration.internal.operation');

export type TableMigrationOperationRole =
 | 'add-column'
 | 'backfill'
 | 'target-check'
 | 'install-default'
 | 'tighten-not-null'
 | 'change-default'
 | 'drop-column'
 | 'dependency-add'
 | 'dependency-drop'
 | 'policy-alter'
 | 'grant-add'
 | 'grant-revoke';

export type TableMigrationOperationSubject =
 | {type:'field';table:string;field:{module:string;element:string}}
 | {type:'dependency';table:string;kind:'check'|'foreignKey'|'index'|'key'|'policy'|'grant';id:string;sourcePath:string;meaningDigest:string}
 | {type:'policy-transition';table:string;sourcePath:string;beforeMeaningDigest:string;afterMeaningDigest:string}
 | {type:'grant-group';table:string;sourcePath:string;rendererStepId:string;rows:TableMigrationGrantRow[];meaningDigest:string;dependencyMeaningDigest?:string};

/** Complete typed physical grant rows represented by one renderer emission. */
export type TableMigrationGrantRow=TableGrantEffectRow;

export interface TableMigrationOperationTag {
 profile:'umf.table-migration-renderer-operation/0.1';
 role:TableMigrationOperationRole;
 sourcePath:string;
 subject:TableMigrationOperationSubject;
 rowOperationId?:string;
}

/** Shared typed constructor for renderer and G10's inert G02 projection. */
export function tableMigrationFieldOperationTag(role:TableMigrationOperationRole,sourcePath:string,table:string,field:{module:string;element:string},rowOperationId?:string):TableMigrationOperationTag{
 return {profile:'umf.table-migration-renderer-operation/0.1',role,sourcePath,subject:{type:'field',table,field:{module:field.module,element:field.element}},...(rowOperationId?{rowOperationId}:{})};
}

export interface TableMigrationOperationRecord extends TableMigrationOperationTag {
 stepId:string;
}

export function withTableMigrationOperation<T extends object>(value:T,tag:TableMigrationOperationTag):T{
 Object.defineProperty(value,TABLE_MIGRATION_OPERATION,{value:tag,enumerable:true,configurable:true});
 return value;
}
