// SPDX-License-Identifier: MIT OR Apache-2.0
import type schema from '../../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json';
export {default as postgresqlKeyObservationsSchema} from '../../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json';
export {default as postgresqlKeyCatalogInspectionSchema} from '../../../spec/core/postgresql-key-catalog-inspection.schema.json';
export interface PostgresqlKeyCollation {schema:string;name:string;provider:string;deterministic:boolean;locale:string|null;version:string|null}
export interface PostgresqlKeyComponent {position:number;attribute:number;name:string|null;notNull:boolean|null;type:string|null;typeSchema:string|null;typeName:string|null;typeKind:string|null;operatorClass:string|null;collation:PostgresqlKeyCollation|null}
export interface PostgresqlKeyIndex {
 schema:string;table:string;relationKind:string;index:string;accessMethod:string;
 unique:boolean;primary:boolean;valid:boolean;ready:boolean;live:boolean;immediate:boolean;nullsNotDistinct:boolean;
 keyCount:number;attributeCount:number;predicate:string|null;expressions:string|null;definition:string;
 constraint:{name:string;kind:'p'|'u';validated:boolean;deferrable:boolean;deferred:boolean;definition:string}|null;
 parents:string[];children:string[];components:PostgresqlKeyComponent[];
}
