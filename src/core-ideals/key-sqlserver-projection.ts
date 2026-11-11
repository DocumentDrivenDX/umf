// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKeyDeclaration,CoreRecordIdentity} from '../model/keys';
import type {sqlServerKeyCarriers as carriers,sqlServerKeySessionOptions} from './key-sqlserver-carriers';
import schema from '../../spec/core/key-sqlserver-projection.schema.json';
export {default as keySqlServerProjectionSchema} from '../../spec/core/key-sqlserver-projection.schema.json';
export interface KeySqlServerRequest {
 id:string;record:CoreRecordIdentity;namespace:string;tableName:string;scope:'new-table-stored-values';keyNames:{keyId:string;name:string}[];mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:keyof typeof carriers;nativeSize?:number;encoding?:{bytesColumn:string;lengthColumn:string}}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeySqlServerProjection {
 operation:'project-keys-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeySqlServerRequest;binding:typeof binding;requiredSessionOptions:typeof sqlServerKeySessionOptions;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePath:string;columns:string[];nativeColumns:string[];primary:boolean;constraintName:string;origin:'authored';enforcement:'primary-key-not-null'|'unique-not-null';equality:'exact-on-representable-values'|'unknown';outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
