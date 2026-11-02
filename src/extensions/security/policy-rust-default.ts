// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';

type NativeError = {code?: unknown; message?: unknown; path?: unknown};
type Engine = {
  inspectSecurityPolicy(source: unknown, resolution?: unknown): unknown;
  requireSecurityInterpretation(source: unknown, resolution: unknown): unknown;
  securityPolicyDependencies(source: unknown, resolution: unknown): unknown;
  securityIdentityTransportDependencies(source: unknown, resolution: unknown): unknown;
};
function freeze(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function createSecurityPolicyRustDefault(engine: Engine, isNative: (error: unknown) => boolean) {
  const call = <T>(run: () => unknown): T => {
    try { return freeze(run()) as T; }
    catch (error) {
      if (!isNative(error)) throw error;
      const native=error as NativeError;
      if (typeof native.code==='string' && (native.code.startsWith('SECURITY_') || native.code.startsWith('LIMIT') || native.code==='REQUEST')) {
        throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
      }
      throw error;
    }
  };
  return Object.freeze({
    inspectSecurityPolicy(source: unknown, resolution?: unknown): ReturnType<typeof import('./policy').inspectSecurityPolicy> { return call(()=>engine.inspectSecurityPolicy(source,resolution)); },
    requireSecurityInterpretation(source: unknown,resolution: unknown): ReturnType<typeof import('./policy').requireSecurityInterpretation> { return call(()=>engine.requireSecurityInterpretation(source,resolution)); },
    securityPolicyDependencies(source: unknown,resolution: unknown): ReturnType<typeof import('./dependencies').securityPolicyDependencies> { return call(()=>engine.securityPolicyDependencies(source,resolution)); },
    securityIdentityTransportDependencies(source: unknown,resolution: unknown): ReturnType<typeof import('./dependencies').securityIdentityTransportDependencies> { return call(()=>engine.securityIdentityTransportDependencies(source,resolution)); },
  });
}
