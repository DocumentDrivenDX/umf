// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const ACTION_PLAN_PROFILE = 'umf.actions-plan-wire/1';

/** One Rust-owned Action Plan continuation session. This layer only encodes
 * closed operations; public Registry and selection callbacks live in the facade. */
export function createActionPlanSessionOperations(executeSessionWire, controlDispatcher, hostWork, nativeError = error => Object.assign(new Error(error.message), error)) {
  if (typeof executeSessionWire !== 'function') throw new TypeError('A Rust Action Plan session is required');
  const run = (op, fields = {}) => {
    const request = Object.create(null);
    for (const key of Object.keys(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(fields, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new TypeError('Action Plan arguments must be data properties');
      Object.defineProperty(request, key, {value: descriptor.value, enumerable: true, writable: true, configurable: true});
    }
    request.profile = ACTION_PLAN_PROFILE;
    request.op = `actions.${op}`;
    hostWork?.(1);
    const raw = executeSessionWire(encodeRequestWire(request, hostWork), controlDispatcher);
    hostWork?.(raw.length);
    const envelope = JSON.parse(raw), failure = resultError(envelope);
    if (failure) throw nativeError(failure);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  };
  return Object.freeze({run});
}
