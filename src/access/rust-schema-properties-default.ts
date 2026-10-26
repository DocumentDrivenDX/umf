// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreDefaultInput,CoreSchemaPropertyIdentity,CoreSchemaPropertyPatch,inspectCoreSchemaProperties,resolveCoreDefault} from '../model/schema-properties';
import type {CoreLiteral} from '../model/schema-literals';
import type {Document,Validation} from '../model/types';
type CoreSchemaPropertyInspection=ReturnType<typeof inspectCoreSchemaProperties>;
type CoreDefaultResolution=ReturnType<typeof resolveCoreDefault>;

/** Rust host-json operations selected by the default V4 root. */
export interface CoreSchemaPropertiesRustEngine {
 inspectCoreSchemaProperties(source:unknown,identity:unknown):unknown;
 declareCoreSchemaProperties(source:unknown,identity:unknown,patch:unknown):unknown;
 validateCoreFieldValue(source:unknown,identity:unknown,value:unknown):unknown;
 resolveCoreDefault(source:unknown,identity:unknown,state:unknown):unknown;
}

/** Keep the public schema-property signatures while forwarding original host values once. */
export function bindCoreSchemaPropertiesRust(engine:CoreSchemaPropertiesRustEngine) {
 return Object.freeze({
  inspectCoreSchemaProperties(source:Document,identity:CoreSchemaPropertyIdentity):CoreSchemaPropertyInspection {
   return engine.inspectCoreSchemaProperties(source,identity) as CoreSchemaPropertyInspection;
  },
  declareCoreSchemaProperties(source:Document,identity:CoreSchemaPropertyIdentity,patch:CoreSchemaPropertyPatch):Document {
   return engine.declareCoreSchemaProperties(source,identity,patch) as Document;
  },
  validateCoreFieldValue(source:Document,identity:{module:string;element:string},value:CoreLiteral):Validation {
   return engine.validateCoreFieldValue(source,identity,value) as Validation;
  },
  resolveCoreDefault(source:Document,identity:{module:string;element:string},state:CoreDefaultInput):CoreDefaultResolution {
   return engine.resolveCoreDefault(source,identity,state) as CoreDefaultResolution;
  },
 });
}
