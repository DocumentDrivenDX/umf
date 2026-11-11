// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import type {AvroTypeLocation} from './avro-cardinality-type';
import schema from '../../spec/core/avro-facet-classification.schema.json';
import type {AVRO_FACETS_EXTENSION,avroFacetsPackage} from './avro-facets-package';
export {AVRO_FACETS_EXTENSION,avroFacetsPackage} from './avro-facets-package';
export {default as avroFacetClassificationSchema} from '../../spec/core/avro-facet-classification.schema.json';
export interface AvroFacetRequest {location:AvroTypeLocation;nativeSource:string;dependencies?:{id:string;schema:string}[];identity:{module:string;element:string};mode:'strict'|'report';profile:'declared-schema'|'apache-datum-writer'|'fastavro-schemaless-writer'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration;}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;location:AvroTypeLocation;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string;}
interface Branch {location:AvroTypeLocation;declarationLocation:AvroTypeLocation;nativeFragment:NativeJson;declarationFragment:NativeJson;family:'integer'|'float'|'decimal'|'string'|'binary'|'null'|'unsupported';facets:CoreFacetPatch;interpretation:'declared'|'unknown'|'unsupported';enforcement:'unverified';}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface AvroFacetClassification {
 operation:'classify-avro-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:AvroFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;location:AvroTypeLocation;nativeFragment:NativeJson;facets:CoreFacetPatch;branches:Branch[];observations:Observation[]};
 residuals:{path:string;location:AvroTypeLocation;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
