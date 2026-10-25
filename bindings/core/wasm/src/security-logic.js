import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_LOGIC_PROFILE = 'umf.security-logic/1.0.0';

function ownData(object, name, optional = false) {
  if (!object || typeof object !== 'object' || Array.isArray(object) ||
      (Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null)) {
    throw new TypeError('Expected plain security logic options');
  }
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  if (!descriptor) {
    if (optional) return undefined;
    throw new TypeError(`Missing security logic property ${name}`);
  }
  if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError(`Security logic property ${name} must be an enumerable data property`);
  return descriptor.value;
}

function optionsControls(options) {
  const keys = Reflect.ownKeys(options);
  if (keys.some(key => key !== 'controls')) throw new TypeError('Unknown security logic option');
  const controls = ownData(options, 'controls', true) ?? Object.create(null);
  const allowed = ['maxWork', 'meter', 'isCancelled', 'now', 'deadlineMs'];
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(controls)) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw new TypeError('Unknown security logic control');
    result[key] = ownData(controls, key);
  }
  if (result.maxWork !== undefined && (!Number.isSafeInteger(result.maxWork) || result.maxWork < 0)) throw new TypeError('controls.maxWork must be a non-negative safe integer');
  if (result.deadlineMs !== undefined && (typeof result.deadlineMs !== 'number' || !Number.isFinite(result.deadlineMs))) throw new TypeError('controls.deadlineMs must be finite');
  for (const key of ['meter', 'isCancelled', 'now']) if (result[key] !== undefined && typeof result[key] !== 'function') throw new TypeError(`controls.${key} must be a function`);
  if (result.deadlineMs !== undefined && result.now === undefined) throw new TypeError('controls.now is required with controls.deadlineMs');
  return result;
}

function controlBridge(controls) {
  let charged = 0;
  return amount => {
    charged += amount;
    if (controls.maxWork !== undefined && charged > controls.maxWork) return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'RESOURCE_LIMIT', pathUnits: [], messageUnits: Array.from('Host work budget exceeded', c => c.charCodeAt(0))});
    try {
      controls.meter?.(amount);
      if (controls.isCancelled?.()) return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'CANCELLED', pathUnits: [], messageUnits: Array.from('Operation cancelled by host', c => c.charCodeAt(0))});
      if (controls.deadlineMs !== undefined) {
        const now = controls.now();
        if (!Number.isFinite(now)) return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'CLOCK_CAPABILITY_REQUIRED', pathUnits: [], messageUnits: Array.from('Host clock did not return a finite millisecond value', c => c.charCodeAt(0))});
        if (now > controls.deadlineMs) return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'DEADLINE', pathUnits: [], messageUnits: Array.from('Deadline elapsed', c => c.charCodeAt(0))});
      }
    } catch {
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'HOST_CONTROL', pathUnits: [], messageUnits: Array.from('Host control callback failed', c => c.charCodeAt(0))});
    }
    return '';
  };
}

function admissionWork(bridge, ErrorType) {
  if (!bridge) return undefined;
  return amount => {
    const response = bridge(amount);
    if (!response) return;
    const failure = resultError(JSON.parse(response));
    throw new ErrorType(failure.code, failure.message, failure.path);
  };
}

/** Create an opt-in Rust engine for already-evaluated CONTRACT-062 rules. */
export function createSecurityLogicEngine(execute, options = {}, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  const controls = optionsControls(options);
  function invoke(op, args) {
    const bridge = Object.keys(controls).length ? controlBridge(controls) : undefined;
    const wire = encodeRequestWire({profile: SECURITY_LOGIC_PROFILE, op, args}, admissionWork(bridge, ErrorType));
    const response = JSON.parse(execute(wire, bridge));
    const failure = resultError(response);
    if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
    return fromWire(JSON.parse(response.wire));
  }
  return Object.freeze({
    securityNot(value) { return invoke('securityNot', {value}); },
    securityAnd(values) { return invoke('securityAnd', {values}); },
    securityOr(values) { return invoke('securityOr', {values}); },
    composeSecurityRules(rules, protectedFields = []) { return invoke('composeSecurityRules', {rules, protectedFields}); },
  });
}
