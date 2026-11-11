// SPDX-License-Identifier: MIT OR Apache-2.0
import type {BindingFieldRef,BindingPayload} from '../extensions/binding';
import type {CoreKeyFieldReference} from '../validation/keys';
import type {Document,Diagnostic,Json} from '../model/types';

export interface SqlServerBindingResidual {path:string;reason:string;choice:unknown}
export interface SqlServerIndexProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;nativeArchive:Document;nativeSource:string;
  target:BindingPayload['target'];residuals:SqlServerBindingResidual[];candidate?:string;
}
export interface SqlServerPlannedColumn {schema:string;table:string;column:string;maxLength:number}
export interface SqlServerPlannedIndexProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;
  target:BindingPayload['target'];residuals:SqlServerBindingResidual[];candidate?:string;
}
export interface SqlServerFieldType extends BindingFieldRef {sqlType:string}
export interface SqlServerPartitionFamily {name:string;scheme:string;column:string}
export interface SqlServerTablePolicy {fieldTypes:SqlServerFieldType[];partitionFamilies:SqlServerPartitionFamily[]}
export interface SqlServerTableResidual {path:string;reason:string;choice:unknown}
export interface SqlServerTableMapping {sourcePath:string;target:string}
export interface SqlServerTableProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;policy:SqlServerTablePolicy;
  target:BindingPayload['target'];residuals:SqlServerTableResidual[];mappings:SqlServerTableMapping[];
  candidate?:string;nativeArchive?:Document;nativeSource?:string;
}
export interface SqlServerPhysicalPolicy {layout:SqlServerRelationshipLayoutPolicy;partitionFamilies:SqlServerPartitionFamily[]}
export interface SqlServerPhysicalProjection {
  operation:'project-binding-sqlserver';version:'1.0.0';status:'reported'|'blocked';logical:Document;binding:Document;
  policy:SqlServerPhysicalPolicy;lossPolicy:'strict'|'report';nativeSource?:string;nativeArchive?:Document;candidate?:string;
  residuals:{source:'logical'|'binding'|'policy'|'native';path:string;reason:string;value:Json}[];
  mappings:{sourcePath:string;target:string;kind:'table'|'column'|'key'|'relationship'|'index';outcome:'approximated'|'unknown'}[];
  diagnostics:Diagnostic[];
}
export interface SqlServerLayoutType {sqlType:string;nullable:boolean;collation:null|'Latin1_General_100_BIN2'}
export interface SqlServerLayoutField extends SqlServerLayoutType {coreField:CoreKeyFieldReference;boundField:BindingFieldRef;table:string;column:string}
export interface SqlServerLayoutKeyComponent extends SqlServerLayoutType {keyField:CoreKeyFieldReference;boundField:BindingFieldRef;column:string}
export interface SqlServerLayoutKey {record:CoreKeyFieldReference;key:string;table:string;constraint:string;components:SqlServerLayoutKeyComponent[]}
export interface SqlServerLayoutKeyRef extends CoreKeyFieldReference {key:string}
export interface SqlServerLayoutEndpointComponent extends SqlServerLayoutType {keyField:CoreKeyFieldReference;endpointField:BindingFieldRef;endpointColumn:string;carrierField?:BindingFieldRef;carrierColumn:string}
export interface SqlServerRelationshipLayout {
 relationship:{module:string;id:string};storage:'foreign_key'|'junction'|'edge';carrierTable:string;
 targetKey:SqlServerLayoutKeyRef;targetConstraint:string;targetComponents:SqlServerLayoutEndpointComponent[];
 sourceKey?:SqlServerLayoutKeyRef;sourceConstraint?:string;sourceComponents?:SqlServerLayoutEndpointComponent[];
 associationRecord?:CoreKeyFieldReference;associationKey?:SqlServerLayoutKeyRef;
 discriminator?:SqlServerLayoutType&{column:string;value:string};
}
export interface SqlServerRelationshipLayoutPolicy {profile:'sqlserver-relationship-layout-1';targetVersion:string;fieldLayouts:SqlServerLayoutField[];keyLayouts:SqlServerLayoutKey[];relationshipLayouts:SqlServerRelationshipLayout[]}
export interface SqlServerRelationshipLayoutResult {
 operation:'validate-sqlserver-relationship-layout';version:'1.0.0';status:'validated'|'reported'|'blocked';lossPolicy:'strict'|'report';
 logical:Document;binding:Document;policy:Json;diagnostics:Diagnostic[];
 residuals:{source:'logical'|'binding'|'policy';path:string;reason:string;value:Json}[];
 candidate?:SqlServerRelationshipLayoutPolicy;
}
