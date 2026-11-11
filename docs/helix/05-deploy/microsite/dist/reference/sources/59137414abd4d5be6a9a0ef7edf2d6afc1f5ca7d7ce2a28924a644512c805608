// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import schema from '../../spec/core/parquet-facet-classification.schema.json';
import type {PARQUET_FACETS_EXTENSION} from './parquet-facets-package';
export {PARQUET_FACETS_EXTENSION,parquetFacetsPackage} from './parquet-facets-package';
export {default as parquetFacetClassificationSchema} from '../../spec/core/parquet-facet-classification.schema.json';
export interface ParquetFacetRequest {location:{index:number;scope:'present-non-null-leaf'};identity:{module:string;element:string};mode:'strict'|'report';profile:'declared-schema'|'pyarrow-safe-array-input'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration;}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;location:ParquetFacetRequest['location'];interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string;}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface ParquetFacetClassification {
 operation:'classify-parquet-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:ParquetFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;location:ParquetFacetRequest['location'];nativeFragment:Json;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;location:ParquetFacetRequest['location'];targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
