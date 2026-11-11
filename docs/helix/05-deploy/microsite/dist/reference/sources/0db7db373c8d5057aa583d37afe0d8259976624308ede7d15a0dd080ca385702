// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKeyDeclaration,CoreRecordIdentity} from '../model/keys';
import type {carriers} from './postgresql-syntax';
import schema from '../../spec/core/key-postgresql-projection.schema.json';
export {default as keyPostgresqlProjectionSchema} from '../../spec/core/key-postgresql-projection.schema.json';
export interface KeyPostgresqlRequest {
 id:string;record:CoreRecordIdentity;namespace:string;tableName:string;scope:'new-table-stored-values';keyNames:{keyId:string;name:string}[];mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:keyof typeof carriers}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeyPostgresqlProjection {
 operation:'project-keys-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeyPostgresqlRequest;binding:typeof binding;target?:Document;nativeSql?:string;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePath:string;columns:string[];primary:boolean;constraintName:string;origin:'authored';enforcement:'primary-key-not-null'|'unique-not-null';equality:'exact-on-representable-values'|'unknown';outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
