import { type NativeJson } from '../model/native-json';
/** Underlying carrier only; full native semantics/default/logical validation is deliberately separate. */
export declare function avroFieldAllowsNull(roots: NativeJson[], recordName: string, fieldName: string): boolean;
