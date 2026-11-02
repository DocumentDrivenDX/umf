// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {CoreEvolutionPolicy} from '../model/evolution';
import {UmfError} from '../model/errors';

/** Low-level shared Rust operations; this binder is opt-in until full R8 parity closes. */
export interface CoreEvolutionRustEngine {
  inspectCoreEvolution(before: unknown, after: unknown, policy: unknown): unknown;
  verifyCoreEvolution(receipt: unknown, before: unknown, after: unknown, policy: unknown): unknown;
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;

function invoke<T>(operation:()=>T,isNativeUmfCoreError:NativeCoreErrorGuard):T {
  try { return operation(); }
  catch(error) {
    if(!isNativeUmfCoreError(error)) throw error;
    const value=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
    if(value?.name==='UmfCoreError'&&typeof value.code==='string'&&value.code.startsWith('CORE_EVOLUTION_')) {
      throw new UmfError(value.code,String(value.message??''),typeof value.path==='string'?value.path:'');
    }
    // Rust-only resource/control errors remain native errors until predecessor
    // ordering and public error-class parity are qualified.
    throw error;
  }
}

/** Candidate Rust route. It is deliberately not selected by either V4 root. */
export function bindCoreEvolutionRustCandidate(
  engine:CoreEvolutionRustEngine,
  isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,
) {
  return Object.freeze({
    inspectCoreEvolution(before:Document,after:Document,policy:CoreEvolutionPolicy) {
      return invoke(()=>engine.inspectCoreEvolution(before,after,policy),isNativeUmfCoreError);
    },
    verifyCoreEvolution(receipt:unknown,before:Document,after:Document,policy:CoreEvolutionPolicy) {
      return invoke(()=>engine.verifyCoreEvolution(receipt,before,after,policy),isNativeUmfCoreError);
    },
  });
}
