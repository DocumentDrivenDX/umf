// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json,Document} from '../model/types';
import type {TablePolicy,TableRef} from '../extensions/tables/types';

export interface RowScopeViaBinding {
  /** Name used in source row_scope.via[].table. */
  name:string;
  /** Exact UMF table Record and relationship path from the protected Record. */
  record:TableRef;
  /** Exact source spelling bound by the host to these UMF Fields. */
  personColumnName:string;
  keyColumnName:string;
  /** Explicit source/current-row to related-row equality pair. */
  sourceField:TableRef;
  keyField:TableRef;
  /** Person identity field on the related association Record. */
  personField:TableRef;
}
export interface RowScopeBindingContext {
  record:TableRef;
  ownerColumns:Readonly<Record<string,TableRef>>;
  via:readonly RowScopeViaBinding[];
  /** Source group name to preapproved native-role alias. */
  groups?:Readonly<Record<string,string>>;
  /** Explicitly identifies a public reference table; open read requires this. */
  openReferenceRead?:boolean;
  /** Run canonical lifecycle/dependency admission against the host document. */
  admitPolicy:(policy:TablePolicy)=>readonly RowScopeDiagnostic[];
  lifecycleDocument?:Document;
  tableId?:string;
  deploymentConfiguration?:unknown;
}
export interface RowScopeDiagnostic {code:string;path:string;message:string}
export interface RowScopeResult {valid:boolean;source?:Json;policy?:TablePolicy;diagnostics:RowScopeDiagnostic[];sourceToOutput:Record<string,string[]>}
