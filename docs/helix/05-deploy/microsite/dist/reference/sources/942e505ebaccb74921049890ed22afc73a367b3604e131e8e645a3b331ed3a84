// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import schema from '../../spec/core/tablespec-facet-classification.schema.json';
import type {TABLESPEC_FACETS_EXTENSION} from './facets-tablespec-package';
export {TABLESPEC_FACETS_EXTENSION,tableSpecFacetsPackage} from './facets-tablespec-package';
export {default as tableSpecFacetClassificationSchema} from '../../spec/core/tablespec-facet-classification.schema.json';
export type TableSpecFacetProfile='declared-metadata'|'json-schema'|'pyspark-schema'|'gx-spark'|'gx-suite-spark'|'ingest-cast'|'unresolved';
export interface TableSpecFacetRequest {column:number;mode:'strict'|'report';profile:TableSpecFacetProfile;input:'raw'|'model-normalized';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;nativePath:string;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface TableSpecFacetClassification {
 operation:'classify-tablespec-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:TableSpecFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
