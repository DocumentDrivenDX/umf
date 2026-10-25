import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const JSON_NUMBER_PROFILE = 'umf-json-number/0.1';

function fault(code, message, path = '') {
  const error = new Error(message);
  error.name = code === 'NUMBER' ? 'UmfError' : 'UmfCoreError';
  error.code = code;
  error.path = path;
  return error;
}

function ownData(object, key, required = false) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) {
    if (required) throw new TypeError(`Missing ${key}`);
    return undefined;
  }
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`${key} must be an enumerable data property`);
  return descriptor.value;
}

function controlsFor(options) {
  if (!options || (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) throw new TypeError('Options must be a plain object');
  const allowed = ['profile', 'controls'];
  if (Reflect.ownKeys(options).some(key => typeof key !== 'string' || !allowed.includes(key))) throw new TypeError('Unknown JSON number option');
  const profile = ownData(options, 'profile') ?? 'cooperative';
  if (profile === 'hard-isolated') throw fault('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
  if (profile !== 'cooperative') throw new TypeError('Unknown resource profile');
  const supplied = ownData(options, 'controls') ?? Object.create(null);
  if (!supplied || (Object.getPrototypeOf(supplied) !== Object.prototype && Object.getPrototypeOf(supplied) !== null)) throw new TypeError('controls must be a plain object');
  const names = ['maxWork', 'meter', 'isCancelled', 'now', 'deadlineMs'];
  if (Reflect.ownKeys(supplied).some(key => typeof key !== 'string' || !names.includes(key))) throw new TypeError('Unknown JSON number control');
  const controls = Object.create(null);
  for (const name of names) controls[name] = ownData(supplied, name);
  if (controls.maxWork !== undefined && (!Number.isSafeInteger(controls.maxWork) || controls.maxWork < 0)) throw new TypeError('controls.maxWork must be a non-negative safe integer');
  if (controls.deadlineMs !== undefined && (typeof controls.deadlineMs !== 'number' || !Number.isFinite(controls.deadlineMs))) throw new TypeError('controls.deadlineMs must be finite');
  for (const name of ['meter', 'isCancelled', 'now']) if (controls[name] !== undefined && typeof controls[name] !== 'function') throw new TypeError(`controls.${name} must be a function`);
  if (controls.deadlineMs !== undefined && controls.now === undefined) throw new TypeError('controls.now is required with controls.deadlineMs');
  return controls;
}

function safeMessage(cause) {
  const descriptor = cause && (typeof cause === 'object' || typeof cause === 'function') ? Object.getOwnPropertyDescriptor(cause, 'message') : undefined;
  return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string' ? descriptor.value : 'Host callback failed';
}

function makeControlBridge(controls) {
  let charged = 0;
  const bridge = amount => {
    charged += amount;
    const refuse = (code, message) => encodeRequestWire({ok: false, code, message});
    if (controls.maxWork !== undefined && charged > controls.maxWork) return refuse('RESOURCE_LIMIT', 'Host work budget exceeded');
    try { if (amount > 0) controls.meter?.(amount); } catch (cause) { return refuse('METER_FAILURE', safeMessage(cause)); }
    try { if (controls.isCancelled?.()) return refuse('CANCELLED', 'Operation cancelled by host'); } catch (cause) { return refuse('CANCELLATION_CHECK_FAILURE', safeMessage(cause)); }
    if (controls.deadlineMs !== undefined) {
      try {
        const now = controls.now();
        if (typeof now !== 'number' || !Number.isFinite(now)) return refuse('CLOCK_CAPABILITY_REQUIRED', 'Host clock did not return a finite millisecond value');
        if (now > controls.deadlineMs) return refuse('DEADLINE', 'Deadline elapsed');
      } catch (cause) { return refuse('CLOCK_CAPABILITY_REQUIRED', safeMessage(cause)); }
    }
    return '';
  };
  bridge.beginOperation = () => { charged = 0; };
  return bridge;
}

function workWith(bridge) {
  return amount => {
    const response = bridge?.(amount);
    if (response) {
      const refusal = fromWire(JSON.parse(response));
      throw fault(refusal.code ?? 'RESOURCE_LIMIT', refusal.message ?? 'Host work budget exceeded');
    }
  };
}

/** Create the explicitly selected umf-json-number/0.1 operation over Rust. */
export function createJsonNumberEngine(invoke, options = {}) {
  if (typeof invoke !== 'function') throw new TypeError('Rust JSON number wire function is required');
  const controls = controlsFor(options);
  const active = Object.values(controls).some(value => value !== undefined);
  const bridge = active ? makeControlBridge(controls) : undefined;
  const work = workWith(bridge);
  return Object.freeze({
    assertExactJsonNumber(token) {
      if (typeof token !== 'string') throw new TypeError('token must be a string');
      bridge?.beginOperation();
      const request = encodeRequestWire({profile: JSON_NUMBER_PROFILE, op: 'assertExactJsonNumber', args: {token}}, work);
      const responseText = invoke(request, bridge);
      work(responseText.length);
      const response = JSON.parse(responseText);
      const failure = resultError(response);
      if (failure) throw fault(failure.code, failure.message, failure.path);
      work(response.wire.length);
      const result = fromWire(JSON.parse(response.wire), work);
      if (result !== null) throw fault('WIRE_FORMAT', 'JSON number operation returned an invalid result');
    },
  });
}
