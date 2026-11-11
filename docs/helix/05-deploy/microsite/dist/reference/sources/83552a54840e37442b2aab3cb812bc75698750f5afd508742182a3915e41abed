// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Nullability} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/postgresql-nullability-classification.schema.json';
import type {POSTGRESQL_NULLABILITY_EXTENSION} from './nullability-postgresql-package';
export {POSTGRESQL_NULLABILITY_EXTENSION,postgresqlNullabilityPackage} from './nullability-postgresql-package';
export {default as postgresqlNullabilityClassificationSchema} from '../../spec/core/postgresql-nullability-classification.schema.json';
export interface PostgresqlNullabilityRequest {
 column:string;nativeSource:string;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface PostgresqlNullabilityClassification {
 operation:'classify-postgresql-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:PostgresqlNullabilityRequest['scope'];carrier:PostgresqlNullabilityRequest['carrier'];basis:'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
