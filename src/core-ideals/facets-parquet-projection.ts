// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {ParquetFacetCarrier} from './parquet-facet-carrier';
import schema from '../../spec/core/facets-parquet-projection.schema.json';
export {default as facetsParquetProjectionSchema} from '../../spec/core/facets-parquet-projection.schema.json';
export interface FacetsParquetRequest {id:string;recordName:string;fieldName:string;nullable:boolean;fieldId?:number;carrier:ParquetFacetCarrier;mode:'strict'|'report';encoding:'native-type'|'metadata-only'|'carrier-only';profile:'declared-schema'|'pyarrow-21';obligation:'value-domain'|'exact-input';}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsParquetProjection {
 operation:'project-facets-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsParquetRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativeIndex:1;facets:CoreFacetPatch;encoding:FacetsParquetRequest['encoding'];profile:FacetsParquetRequest['profile'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
