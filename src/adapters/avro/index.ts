// SPDX-License-Identifier: MIT OR Apache-2.0
export type {AvroFieldMetadata} from './metadata';
import type {AVRO_EXTENSION,avroPackage} from './package';
export {AVRO_EXTENSION, avroPackage, avroNativeSchema} from './package';
import type {Document,Validation} from '../../model/types';
import type {NativeJson} from '../json-schema/tree';
export interface AvroPayload {version:'1.12.0';root:NativeJson;dependencies?:{id:string;root:NativeJson}[];}
export interface AvroNodeEditProposal {
 status:'candidate';source:Document;document:Document;validation:Validation;
 edit:{path:string;dependencyId?:string;replacement:NativeJson};
}
