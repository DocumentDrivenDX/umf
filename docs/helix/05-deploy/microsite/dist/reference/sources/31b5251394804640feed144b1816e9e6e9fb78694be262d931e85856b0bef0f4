// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKeyDeclaration,CoreRecordIdentity} from '../model/keys';
import schema from '../../spec/core/key-tablespec-projection.schema.json';
export {default as keyTableSpecProjectionSchema} from '../../spec/core/key-tablespec-projection.schema.json';
export interface KeyTableSpecRequest {
 id:string;record:CoreRecordIdentity;tableName:string;mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'TEXT'|'VARCHAR'|'CHAR'|'FLOAT'|'DATE'|'DATETIME'|'TIMESTAMP'}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeyTableSpecProjection {
 operation:'project-keys-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeyTableSpecRequest;binding:typeof binding;target?:Document;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePath:string;columns:string[];primary:boolean;outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
