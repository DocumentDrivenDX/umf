// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Cardinality} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreCardinalityDeclaration} from '../model/cardinality';
import schema from '../../spec/core/postgresql-cardinality-classification.schema.json';
import type {POSTGRESQL_CARDINALITY_EXTENSION} from './cardinality-postgresql-package';
export {POSTGRESQL_CARDINALITY_EXTENSION,postgresqlCardinalityPackage} from './cardinality-postgresql-package';
export {default as postgresqlCardinalityClassificationSchema} from '../../spec/core/postgresql-cardinality-classification.schema.json';
export interface PostgresqlCardinalityRequest {
 column:string;nativeSource:string;supplement:string;mode:'strict'|'report';profile:'stored-value'|'unresolved';author?:CoreCardinalityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
export interface PostgresqlCardinalityClassification {
 operation:'classify-postgresql-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'approximated'|'unknown'|'not-expressible';basis:'Explicit captured native type relationships; bounds, rank, item and execution semantics remain native'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
