import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const DOCUMENT_COMPARISON_PROFILE = 'umf.schema-comparison/1';

export function createDocumentComparisonOperations(executeWire, {snapshot, controls = {}, ErrorType} = {}) {
  if (typeof executeWire !== 'function') throw new TypeError('Document comparison executor is required');
  if (typeof snapshot !== 'function') throw new TypeError('A predecessor-compatible snapshot function is required');
  const CoreError = ErrorType ?? class extends Error { constructor(code, message, path = '') { super(message); Object.assign(this, {code, path}); } };
  return Object.freeze({
    compareDocuments(before, after) {
      // This sequence intentionally mirrors the predecessor. In particular,
      // after is untouched if the before snapshot refuses.
      const beforeSnapshot = snapshot(before);
      const afterSnapshot = snapshot(after);
      // Work accounting is invocation-scoped. A refusal must not poison a
      // later call on this engine, and maxWork must apply independently.
      const bridge = makeControlBridge(controls);
      const work = bridge ? (amount) => {
        const refusal = bridge(amount);
        if (refusal) throw controlError(refusal, CoreError);
      } : undefined;
      work?.(1);
      const request = {profile: DOCUMENT_COMPARISON_PROFILE, before: beforeSnapshot, after: afterSnapshot};
      const result = executeWire(encodeRequestWire(request, work), bridge);
      work?.(result.length);
      const envelope = typeof result === 'string' ? JSON.parse(result) : result;
      const failure = resultError(envelope);
      if (failure) throw new CoreError(failure.code, failure.message, failure.path);
      work?.(envelope.wire.length);
      const decoded = fromWire(JSON.parse(envelope.wire), work);
      if (!Array.isArray(decoded)) throw new TypeError('Malformed document comparison result');
      return decoded.map((change) => {
        work?.(1);
        if (!change || typeof change !== 'object' || Array.isArray(change)) throw new TypeError('Malformed document comparison record');
        const record = {};
        for (const [key, value] of Object.entries(change)) {
          work?.(key.length + 1);
          Object.defineProperty(record, key, {value, enumerable: true, writable: true, configurable: true});
        }
        return record;
      });
    },
  });
}

function makeControlBridge(controls) {
  if (!controls || !Object.keys(controls).some((key) => controls[key] !== undefined)) return undefined;
  let charged = 0;
  const reject = (code, message) => encodeRequestWire({ok: false, code, message});
  return (amount) => {
    charged += amount;
    if (controls.maxWork !== undefined && charged > controls.maxWork) return reject('RESOURCE_LIMIT', 'Host work budget exceeded');
    if (amount > 0) {
      try { controls.meter?.(amount); }
      catch (error) { return reject('METER_FAILURE', message(error)); }
    }
    try { if (controls.isCancelled?.()) return reject('CANCELLED', 'Operation cancelled by host'); }
    catch (error) { return reject('CANCELLATION_CHECK_FAILURE', message(error)); }
    if (controls.deadlineMs !== undefined) {
      try {
        const now = controls.now?.();
        if (typeof now !== 'number' || !Number.isFinite(now)) return reject('CLOCK_CAPABILITY_REQUIRED', 'Host clock did not return a finite millisecond value');
        if (now > controls.deadlineMs) return reject('DEADLINE', 'Deadline elapsed');
      } catch (error) { return reject('CLOCK_CAPABILITY_REQUIRED', message(error)); }
    }
    return '';
  };
}

function controlError(response, ErrorType) {
  const value = fromWire(JSON.parse(response));
  return new ErrorType(value.code, value.message);
}

function message(error) { return String(error?.message ?? error); }
