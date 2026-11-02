// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {SecurityCollectionResult} from './evaluate';

export interface SecurityReadHandle { readonly kind: 'registered-security-read' }
interface Session {
  registerSecurityRead(policy: unknown, resolution: unknown): number;
  evaluateSecurityRead(handle: number, cut: unknown, request: unknown): unknown;
}
interface Engine { createSession(): Session }

/** Opaque host handle backed by a Rust-owned immutable registration session. */
export class SecurityReadRegistration {
  readonly #session: Session;
  readonly #handles = new WeakMap<object, number>();
  readonly #isNativeError: (error: unknown) => boolean;

  constructor(engine: Engine, isNativeError: (error: unknown) => boolean) {
    this.#session = engine.createSession();
    this.#isNativeError = isNativeError;
  }

  #call<T>(operation: () => T): T {
    try { return operation(); }
    catch (error) {
      if (!this.#isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code === 'string' && (native.code.startsWith('SECURITY_') || native.code.startsWith('LIMIT') || native.code === 'REQUEST')) {
        throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
      }
      throw error;
    }
  }

  register(policy: unknown, resolution: unknown): SecurityReadHandle {
    const id = this.#call(() => this.#session.registerSecurityRead(policy, resolution));
    const handle = Object.freeze({kind: 'registered-security-read' as const});
    this.#handles.set(handle, id);
    return handle;
  }

  evaluate(handle: unknown, cut: unknown, request: unknown): SecurityCollectionResult {
    const id = handle !== null && typeof handle === 'object' ? this.#handles.get(handle) : undefined;
    if (id === undefined) return {status: 'refused', rows: []};
    return this.#call(() => this.#session.evaluateSecurityRead(id, cut, request)) as SecurityCollectionResult;
  }
}
