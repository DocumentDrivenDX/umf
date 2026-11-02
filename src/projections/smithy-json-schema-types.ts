// SPDX-License-Identifier: MIT OR Apache-2.0
import type {SmithyAssemblyBackend,SmithyAssemblyResult} from '../adapters/smithy/assembly';
import type {Document} from '../model/types';
import type {ProjectionIssue} from './json-schema-protobuf';

export interface SmithyJsonSchemaBackend extends SmithyAssemblyBackend {
 converterIdentity:string;
 jsonSchema(modelJson:string,rootShape:string):string|Promise<string>;
 jsonSchemaForService?(modelJson:string,rootShape:string,serviceContext:string,addRootDefinition:boolean):string|Promise<string>;
 jsonSchemaWithRootDefinition?(modelJson:string,rootShape:string):string|Promise<string>;
}
export interface SmithyJsonSchemaPolicy {
 id:string;baseUri:string;rootShape:string;
 profile:'native-defaults-2020-12'|'native-root-definition-2020-12'|'native-service-context-2020-12';
 serviceContext?:string;usage:'native-emission';lossPolicy:'strict'|'allow-reported-loss';
}
export interface SmithyJsonSchemaProjection {
 status:'blocked'|'projected';source:Document;converter:string;assembly:SmithyAssemblyResult;
 policy:SmithyJsonSchemaPolicy;complete:false;issues:ProjectionIssue[];
 nativeSchema?:string;adaptedSchema?:string;target?:Document;
}
