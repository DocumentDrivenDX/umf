// SPDX-License-Identifier: MIT OR Apache-2.0
import type {BindingFieldRef,BindingPayload} from '../extensions/binding';
import type {CoreKeyFieldReference} from '../validation/keys';
import type {Document,Diagnostic,Json} from '../model/types';

export interface DddPostgresqlFieldType extends BindingFieldRef {sqlType:string}
export interface DddPostgresqlListPartition {name:string;column:string;defaultTable:string}
export interface DddPostgresqlTablePolicy {fieldTypes:DddPostgresqlFieldType[];partitionFamilies:DddPostgresqlListPartition[]}
export interface DddPostgresqlTableResidual {path:string;reason:string;choice:unknown}
export interface DddPostgresqlTableMapping {sourcePath:string;target:string}
export interface DddPostgresqlTableProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;policy:DddPostgresqlTablePolicy;
  target:BindingPayload['target'];residuals:DddPostgresqlTableResidual[];mappings:DddPostgresqlTableMapping[];
  candidate?:string;targetArchive?:Document;
}
export interface DddPostgresqlPolicy {profile:'ddd-postgresql-1';version:'1.0.0';targetVersion:'17.4';mode:'strict'|'report';objectCheckNaming:'ck-table-column-object-v1';tablePolicy:DddPostgresqlTablePolicy;layoutPolicy:PostgresqlRelationshipLayoutPolicy}
export interface DddPostgresqlProjection {
 operation:'project-ddd-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;binding:Document;policy:DddPostgresqlPolicy;nativeVersion:'17.4';
 mappings:{source:'logical'|'binding'|'policy';path:string;statement:number;kind:'schema'|'table'|'column'|'embedded-check'|'partition'|'key'|'relationship'|'index';target:string;outcome:'exact'|'approximated'}[];
 residuals:{source:'logical'|'binding'|'policy';path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string}[];diagnostics:Diagnostic[];nativeSource?:string;targetArchive?:Document;
}
export interface PostgresqlLayoutType {sqlType:string;nullable:boolean;collation:null|'C'}
export interface PostgresqlLayoutField extends PostgresqlLayoutType {coreField:CoreKeyFieldReference;boundField:BindingFieldRef;table:string;column:string}
export interface PostgresqlLayoutKeyComponent extends PostgresqlLayoutType {keyField:CoreKeyFieldReference;boundField:BindingFieldRef;column:string}
export interface PostgresqlLayoutKey {record:CoreKeyFieldReference;key:string;table:string;constraint:string;components:PostgresqlLayoutKeyComponent[]}
export interface PostgresqlLayoutKeyRef extends CoreKeyFieldReference {key:string}
export interface PostgresqlLayoutEndpointComponent extends PostgresqlLayoutType {keyField:CoreKeyFieldReference;endpointField:BindingFieldRef;endpointColumn:string;carrierField?:BindingFieldRef;carrierColumn:string}
export interface PostgresqlRelationshipLayout {
 relationship:{module:string;id:string};storage:'foreign_key'|'junction'|'edge';carrierTable:string;
 targetKey:PostgresqlLayoutKeyRef;targetConstraint:string;targetComponents:PostgresqlLayoutEndpointComponent[];
 sourceKey?:PostgresqlLayoutKeyRef;sourceConstraint?:string;sourceComponents?:PostgresqlLayoutEndpointComponent[];
 associationRecord?:CoreKeyFieldReference;associationKey?:PostgresqlLayoutKeyRef;
 discriminator?:PostgresqlLayoutType&{column:string;value:string};
}
export interface PostgresqlRelationshipLayoutPolicy {profile:'postgresql-relationship-layout-1';targetVersion:string;fieldLayouts:PostgresqlLayoutField[];keyLayouts:PostgresqlLayoutKey[];relationshipLayouts:PostgresqlRelationshipLayout[]}
export interface PostgresqlRelationshipLayoutResult {
 operation:'validate-postgresql-relationship-layout';version:'1.0.0';status:'validated'|'reported'|'blocked';lossPolicy:'strict'|'report';
 logical:Document;binding:Document;policy:Json;diagnostics:Diagnostic[];
 residuals:{source:'logical'|'binding'|'policy';path:string;reason:string;value:Json}[];
 candidate?:PostgresqlRelationshipLayoutPolicy;
}
