// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreFacetDeclaration,CoreFacetPatch} from '../model/facets';
import type {CoreKindDeclaration} from '../model/field-kind';
const nativeCarriers={bit:'boolean',tinyint:'integer',smallint:'integer',int:'integer',bigint:'integer',decimal:'decimal',real:'float','float(53)':'float',nvarchar:'string',nchar:'string',varchar:'string',char:'string',varbinary:'binary',binary:'binary',date:'date','time(7)':'time','datetime2(7)':'timestamp','datetimeoffset(7)':'timestamp'} as const;
import schema from '../../spec/core/facets-sqlserver-projection.schema.json';
export {default as facetsSqlServerProjectionSchema} from '../../spec/core/facets-sqlserver-projection.schema.json';
export interface FacetsSqlServerRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof nativeCarriers;mode:'strict'|'report';encoding:'checked'|'type-modifier'|'carrier-only';obligation:'value-domain'|'exact-input'}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsSqlServerProjection {
 operation:'project-facets-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsSqlServerRequest;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/sql';facets:CoreFacetPatch;encoding:FacetsSqlServerRequest['encoding'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
