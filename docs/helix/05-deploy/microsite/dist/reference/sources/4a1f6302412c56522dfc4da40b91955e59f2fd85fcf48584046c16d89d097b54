// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import schema from '../../spec/core/sqlserver-facet-classification.schema.json';
import type {SQLSERVER_FACETS_EXTENSION} from './facets-sqlserver-package';
export {SQLSERVER_FACETS_EXTENSION,sqlserverFacetsPackage,sqlserverFacetClassificationSchema} from './facets-sqlserver-package';
export interface SqlServerFacetRequest {column:string;nativeSource:string;identity:{module:string;element:string};mode:'strict'|'report';profile:'stored-value'|'ordinary-checked-write'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;nativePath:string;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface SqlServerFacetClassification {
 operation:'classify-sqlserver-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:SqlServerFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
