// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import type {CoreKindDeclaration} from '../model/field-kind';
import schema from '../../spec/core/facets-avro-projection.schema.json';
export {default as facetsAvroProjectionSchema} from '../../spec/core/facets-avro-projection.schema.json';
const families={boolean:'boolean',int:'integer',long:'integer',float:'float',double:'float',bytes:'binary',string:'string',fixed:'binary','decimal-bytes':'decimal','decimal-fixed':'decimal',date:'date','time-millis':'time','time-micros':'time','timestamp-millis':'timestamp','timestamp-micros':'timestamp','local-timestamp-micros':'timestamp'} as const;
export interface FacetsAvroRequest {id:string;recordName:string;namespace:string;fieldName:string;nativeType:keyof typeof families;fixedName?:string;fixedSize?:number;mode:'strict'|'report';encoding:'native-type'|'metadata-only'|'carrier-only';profile:'declared-schema'|'apache-datum-writer'|'fastavro-schemaless-writer';obligation:'value-domain'|'exact-input';}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsAvroProjection {
 operation:'project-facets-avro';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsAvroRequest;target?:{format:'avro-schema-json';schema:string};nativeSchema?:string;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/fields/0/type';facets:CoreFacetPatch;encoding:FacetsAvroRequest['encoding'];profile:FacetsAvroRequest['profile'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
