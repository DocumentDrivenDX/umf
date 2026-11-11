// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import schema from '../../spec/core/postgresql-key-classification.schema.json';
import type {POSTGRESQL_KEYS_EXTENSION} from './key-postgresql-package';
export {POSTGRESQL_KEYS_EXTENSION,postgresqlKeysPackage} from './key-postgresql-package';
export {default as postgresqlKeyClassificationSchema} from '../../spec/core/postgresql-key-classification.schema.json';
export interface PostgresqlKeyRequest {nativeSource:string;supplement:string;mode:'strict'|'report';profile:'captured-stored-values'}
export interface PostgresqlKeyObservation {
 identity:{schema:string;table:string;index:string};nativePath:string;fields:{module:string;element:string}[];primary:boolean;
 enforcement:'immediate-unique-nonnull'|'conditional'|'deferred'|'nullable'|'not-unique'|'unavailable'|'unknown';
 equality:'exact-on-representable-values'|'incompatible'|'unknown';authorIntent:'unknown';provenance:'inferred';scope:'relation-with-descendants';reasons:string[];
}
const binding=schema.properties.binding.const,recovery='Original native catalog and supplement retained; authored key intent is not inferred' as const;
export interface PostgresqlKeyClassification {
 operation:'classify-postgresql-keys';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';source:Document;target?:Document;request:PostgresqlKeyRequest;binding:typeof binding;observations:PostgresqlKeyObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
