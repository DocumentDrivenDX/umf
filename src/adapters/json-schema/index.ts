// SPDX-License-Identifier: MIT OR Apache-2.0
import type {JSON_SCHEMA_DIALECT,JSON_SCHEMA_EXTENSION,jsonSchemaPackage} from './package';
export {JSON_SCHEMA_DIALECT,JSON_SCHEMA_EXTENSION,jsonSchemaPackage} from './package';
import type {pointer} from '../../model/types';
import type {parseNativeJson,NativeJson} from './tree';
export {parseNativeJson,type NativeJson} from './tree';
export interface JsonSchemaPayload {dialect:typeof JSON_SCHEMA_DIALECT;baseUri:string;root:NativeJson;resources:Record<string,NativeJson>}
export interface SchemaPosition {pointer:string;node:NativeJson}
