import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const AVRO_INSPECT_PROFILE = 'umf-r5-avro-inspect/0.1.0';
export const AVRO_DOCUMENT_INSPECT_PROFILE = 'umf-r5-avro-document-inspect/0.1.0';
export const AVRO_CANDIDATE_PROFILE = 'umf-r5-avro-candidate/0.1.0';

/** Build an opt-in Avro inspector over a Rust/WASM wire module. */
export function createAvroInspector(module, {controls = {}, ErrorType} = {}) {
  if (typeof module?.executeAvroInspectWire !== 'function' || typeof module?.avroInspectProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.avroInspectProfileVersion() !== AVRO_INSPECT_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const CoreError = ErrorType ?? defaultError();
  return Object.freeze({inspect(root, dependencies = []) {
    const bridge = makeControlBridge(controls);
    const work = bridge ? (amount) => {
      const refusal = bridge(amount);
      if (refusal) throw controlError(refusal, CoreError);
    } : undefined;
    work?.(1);
    if (!Array.isArray(dependencies)) throw new TypeError('Avro dependencies must be an array');
    if (dependencies.length > 100_000) throw new RangeError('Too many Avro dependencies');
    work?.(dependencies.length + 1);
    const request = {op: 'avro.schema.inspect', root, dependencies};
    const responseText = module.executeAvroInspectWire(encodeRequestWire(request, work), bridge);
    work?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new CoreError(failure.code, failure.message, failure.path);
    work?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), work);
  }});
}

/** Build the opt-in Rust document inspector over a WASM wire module. */
export function createAvroDocumentInspector(module, {controls = {}, ErrorType} = {}) {
  if (typeof module?.executeAvroDocumentInspectWire !== 'function' || typeof module?.avroDocumentInspectProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.avroDocumentInspectProfileVersion() !== AVRO_DOCUMENT_INSPECT_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const CoreError = ErrorType ?? defaultError();
  return Object.freeze({inspect(document) {
    const bridge = makeControlBridge(controls);
    const work = bridge ? amount => { const refusal = bridge(amount); if (refusal) throw controlError(refusal, CoreError); } : undefined;
    work?.(1);
    const request = {op: 'avro.document.inspect', document};
    const responseText = module.executeAvroDocumentInspectWire(encodeRequestWire(request, work), bridge);
    work?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new CoreError(failure.code, failure.message, failure.path);
    work?.(envelope.wire.length);
    const report = fromWire(JSON.parse(envelope.wire), work);
    if (!report || report.profile !== AVRO_DOCUMENT_INSPECT_PROFILE || !report.admission || typeof report.admission.valid !== 'boolean' || typeof report.admission.complete !== 'boolean' || !Array.isArray(report.admission.diagnostics) || !report.nativeInspection || !['not-run', 'inspected'].includes(report.nativeInspection.status) || (report.nativeInspection.status === 'inspected' && (typeof report.nativeInspection.valid !== 'boolean' || report.nativeInspection.complete !== false || !Array.isArray(report.nativeInspection.diagnostics)))) throw new CoreError('WIRE_FORMAT', 'Malformed Avro document inspection report');
    return report;
  }});
}

/** Build the opt-in proposal-only Avro edit surface over Rust/WASM. */
export function createAvroCandidateEditor(module, {controls = {}, ErrorType} = {}) {
  if (typeof module?.executeAvroCandidateWire !== 'function' || typeof module?.avroCandidateProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.avroCandidateProfileVersion() !== AVRO_CANDIDATE_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const CoreError = ErrorType ?? defaultError();
  return Object.freeze({proposeNodeEdit(document, path, replacementJson, dependencyId) {
    if (typeof path !== 'string') throw new TypeError('Avro candidate path must be a string');
    if (typeof replacementJson !== 'string') throw new TypeError('Avro replacement JSON must be a string');
    if (dependencyId !== undefined && typeof dependencyId !== 'string') throw new TypeError('Avro dependency ID must be a string');
    const bridge = makeControlBridge(controls);
    const work = bridge ? (amount) => {
      const refusal = bridge(amount);
      if (refusal) throw controlError(refusal, CoreError);
    } : undefined;
    work?.(1);
    const request = {op: 'avro.schema.proposeNodeEdit', document, path, replacementJson,
      ...(dependencyId === undefined ? {} : {dependencyId})};
    const responseText = module.executeAvroCandidateWire(encodeRequestWire(request, work), bridge);
    work?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new CoreError(failure.code, failure.message, failure.path);
    work?.(envelope.wire?.length ?? 1);
    const report = fromWire(JSON.parse(envelope.wire), work);
    if (!report || report.profile !== AVRO_CANDIDATE_PROFILE || report.status !== 'candidate') {
      throw new CoreError('WIRE_FORMAT', 'Malformed Avro candidate report');
    }
    return report;
  }});
}

function defaultError() {
  return class UmfCoreError extends Error {
    constructor(code, message, path = '') { super(message); this.name = 'UmfCoreError'; this.code = code; this.path = path; }
  };
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
      catch (error) { return reject('METER_FAILURE', String(error?.message ?? error)); }
    }
    try { if (controls.isCancelled?.()) return reject('CANCELLED', 'Operation cancelled by host'); }
    catch (error) { return reject('CANCELLATION_CHECK_FAILURE', String(error?.message ?? error)); }
    if (controls.deadlineMs !== undefined) {
      try {
        const now = controls.now?.();
        if (typeof now !== 'number' || !Number.isFinite(now)) return reject('CLOCK_CAPABILITY_REQUIRED', 'Host clock did not return a finite millisecond value');
        if (now > controls.deadlineMs) return reject('DEADLINE', 'Deadline elapsed');
      } catch (error) { return reject('CLOCK_CAPABILITY_REQUIRED', String(error?.message ?? error)); }
    }
    return '';
  };
}

function controlError(response, ErrorType) {
  const value = fromWire(JSON.parse(response));
  return new ErrorType(value.code, value.message);
}
