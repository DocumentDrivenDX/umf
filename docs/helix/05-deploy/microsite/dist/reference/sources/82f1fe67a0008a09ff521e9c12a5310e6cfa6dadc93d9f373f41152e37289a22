// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKeyDeclaration,CoreRecordIdentity} from '../model/keys';
import schema from '../../spec/core/key-avro-projection.schema.json';
export {default as keyAvroProjectionSchema} from '../../spec/core/key-avro-projection.schema.json';
export interface KeyAvroRequest {
 id:string;record:CoreRecordIdentity;recordName:string;namespace:string;mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:'boolean'|'int'|'long'|'bytes'|'string'|'float'|'double'|'decimal-bytes'}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeyAvroProjection {
 operation:'project-keys-avro';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeyAvroRequest;binding:typeof binding;target?:Document;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePaths:string[];columns:string[];primary:boolean;origin:'authored';enforcement:'not-expressible';outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
