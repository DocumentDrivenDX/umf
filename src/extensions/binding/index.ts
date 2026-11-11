// SPDX-License-Identifier: MIT OR Apache-2.0
export * from './bit128';
import type {BINDING_EXTENSION,stableBindingPackage,bindingPackage} from './package';
export {BINDING_EXTENSION,stableBindingPackage,bindingPackage} from './package';
import type {Document,Json} from '../../model/types';
export interface BindingElementRef {module:string;element:string}
export interface BindingFieldRef extends BindingElementRef {field?:string}
export interface BindingRelationshipRef {module:string;name:string}
export interface BindingElement extends BindingElementRef {partition?:string|null;table?:string}
export interface BindingField extends BindingFieldRef {storage:'column'|'embedded';column?:string;documentColumn?:string;path?:string[]}
export interface StableBindingRelationshipRef {module:string;id:string}
export interface StableBindingRelationship extends StableBindingRelationshipRef {storage:'edge'|'foreign_key'|'junction'|'inline'}
export interface BindingRelationship extends BindingRelationshipRef {storage:'edge'|'foreign_key'|'junction'|'inline'}
export type BindingIndexTarget={field:BindingFieldRef}|{documentPath:{field:BindingFieldRef;path:string[]}};
export interface BindingIndex {name:string;kind:'btree'|'hash'|'gin'|'gist'|'expression'|'partial'|'unique'|'clustering';on:BindingIndexTarget[];predicate?:{language:string;version:string;expression:string};unique:boolean;include?:BindingFieldRef[]}
export interface BindingPayload {
  profile:'umf-binding-1'|'umf-binding-2';
  logical:{documentId:string;coreVersion:string};
  target:{system:string;version:string;subset:string};
  elements:BindingElement[];
  fields:BindingField[];
  relationships:(BindingRelationship|StableBindingRelationship)[];
  indexes:BindingIndex[];
  [key:string]:unknown;
}
export interface BindingIndexOutcome {name:string;path:string;outcome:'exact'|'approximated'|'not-expressible'|'unknown';reason?:string}
export interface BindingIndexProjection {status:'projected'|'reported'|'blocked';source:Document;logical:Document;target:BindingPayload['target'];outcomes:BindingIndexOutcome[];candidate?:BindingIndex[]}
export interface BindingMigrationReceipt {
  profile:'umf-binding-migration-1';
  original:Document;
  logical:Document;
  migrated:Document;
  mappings:{path:string;original:BindingRelationship;stable:StableBindingRelationship}[];
}
export interface BindingMigrationResult {document:Document;receipt:BindingMigrationReceipt}
export interface BindingRollbackResult {
  document:Document;
  residuals:{path:string;reason:string;value:Json}[];
}
