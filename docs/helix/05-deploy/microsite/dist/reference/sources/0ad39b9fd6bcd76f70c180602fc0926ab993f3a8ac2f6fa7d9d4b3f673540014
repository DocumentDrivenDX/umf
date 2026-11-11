// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import schema from '../../spec/core/postgresql-facet-classification.schema.json';
import type {POSTGRESQL_FACETS_EXTENSION} from './facets-postgresql-package';
export {POSTGRESQL_FACETS_EXTENSION,postgresqlFacetsPackage} from './facets-postgresql-package';
export {default as postgresqlFacetClassificationSchema} from '../../spec/core/postgresql-facet-classification.schema.json';
export type PostgresqlFacetProfile='stored-value'|'new-value'|'unresolved';
export interface PostgresqlFacetRequest {column:string;nativeSource:string;supplement:string;mode:'strict'|'report';profile:PostgresqlFacetProfile;datumFormat:'little-endian-datum64'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;nativePath:string;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface PostgresqlFacetClassification {
 operation:'classify-postgresql-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:PostgresqlFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
