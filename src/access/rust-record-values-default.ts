// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreRecordValueCheck,CoreRecordValueIdentity,CoreRecordFieldValue} from '../model/record-values';

export type CoreRecordValuesHostEngineV4={
 validateCoreRecordValues(source:unknown,identity:unknown,values:unknown):unknown;
};

/** Bind the already initialized Rust host-input route without changing its synchronous API. */
export function bindCoreRecordValuesRust(engine:CoreRecordValuesHostEngineV4):(
 source:unknown,identity:CoreRecordValueIdentity,values:CoreRecordFieldValue[]
)=>CoreRecordValueCheck {
 if(!engine||typeof engine.validateCoreRecordValues!=='function')throw new TypeError('Rust Record Values host-input engine is unavailable');
 return function validateCoreRecordValues(source,identity,values){
  return engine.validateCoreRecordValues(source,identity,values) as CoreRecordValueCheck;
 };
}
