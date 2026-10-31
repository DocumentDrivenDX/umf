// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';

export interface CoreBit128FieldEngine {
  declareCoreBit128Field(source: unknown, identity: {module: string; element: string}, scalarType: 'bits128' | 'uuid'): unknown;
}
type BindingErrorGuard = (error: unknown) => boolean;

/** Present only branded Rust-binding failures as the public TypeScript error class. */
export function bindCoreBit128FieldRust(engine: CoreBit128FieldEngine, isBindingError: BindingErrorGuard = () => false) {
  return Object.freeze({declareCoreBit128Field(source: unknown, identity: {module: string; element: string}, scalarType: 'bits128' | 'uuid') {
    try { return engine.declareCoreBit128Field(source, identity, scalarType); }
    catch (error) {
      if (!isBindingError(error)) throw error;
      const candidate = error as {code: string; message: string; path?: string};
      throw new UmfError(candidate.code, candidate.message, candidate.path ?? '');
    }
  }});
}
