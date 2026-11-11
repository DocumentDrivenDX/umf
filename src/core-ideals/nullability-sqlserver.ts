// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Nullability} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/sqlserver-nullability-classification.schema.json';
import {SQLSERVER_NULLABILITY_EXTENSION,sqlserverNullabilityPackage,sqlserverNullabilityClassificationSchema} from './nullability-sqlserver-package';
export {SQLSERVER_NULLABILITY_EXTENSION,sqlserverNullabilityPackage,sqlserverNullabilityClassificationSchema};
export {sqlserverNullabilityEvidenceSchema} from './nullability-sqlserver-package';
export interface SqlServerNullabilityRequest {
 column:string;nativeSource:string;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface SqlServerNullabilityClassification {
 operation:'classify-sqlserver-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:SqlServerNullabilityRequest['scope'];carrier:SqlServerNullabilityRequest['carrier'];basis:'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
