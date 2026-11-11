// SPDX-License-Identifier: MIT OR Apache-2.0
import { encodeRequestWire, fromWire, resultError } from './wire.js';

export const SMITHY_SESSION_PROFILE = 'umf.smithy-native-wire/1';

/** Rust retains all documents, assembly results, and continuation state. This
 * helper invokes only the explicit assembler/selector provided by the caller. */
export function createSmithySessionOperations(executeSessionWire, hostWork, nativeError = e => Object.assign(new Error(e.message), e)) {
  if (typeof executeSessionWire !== 'function') throw new TypeError('A Rust Smithy session is required');
  const run = (op, fields = {}) => {
    const request = Object.create(null);
    for (const key of Object.keys(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(fields, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new TypeError('Smithy session fields must be data properties');
      Object.defineProperty(request, key, {value: descriptor.value, enumerable: true, writable: true, configurable: true});
    }
    request.profile = SMITHY_SESSION_PROFILE;
    request.op = `smithy.${op}`;
    hostWork?.(1);
    const text = executeSessionWire(encodeRequestWire(request, hostWork));
    hostWork?.(text.length);
    const envelope = JSON.parse(text), failure = resultError(envelope);
    if (failure) throw nativeError(failure);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  };
  const asyncStage = async (prepare, complete, fields, runHost, fail, signal) => {
    const prepared = run(prepare, fields), token = prepared.token;
    if (Object.prototype.hasOwnProperty.call(prepared, 'result')) return prepared.result;
    let response;
    try {
      response = await runHost(prepared.request, signal);
    } catch (error) {
      const allowed = fail === 'failAssembly'
        ? ['SMITHY_ASSEMBLY_FAILED','SMITHY_ASSEMBLY_CANCELLED','SMITHY_ASSEMBLY_TIMEOUT']
        : ['SMITHY_SELECTION_FAILED','SMITHY_SELECTION_CANCELLED','SMITHY_SELECTION_TIMEOUT'];
      const code = error?.name === 'AbortError'
        ? (fail === 'failAssembly' ? 'SMITHY_ASSEMBLY_CANCELLED' : 'SMITHY_SELECTION_CANCELLED')
        : allowed.includes(error?.code) ? error.code : undefined;
      try { return run(fail, {token, ...(code ? {code} : {}), message: String(error)}); }
      catch { try { run('cancel', {token}); } catch {} throw error; }
    }
    try { return run(complete, {token, response}); }
    catch (error) { try { run('cancel', {token}); } catch {} throw error; }
  };
  const assembleCall = async (document, backend, options) => {
    if (!options || typeof options !== 'object' || typeof options.id !== 'string' || !options.id ||
        Object.keys(options).some(k => !['id','signal'].includes(k)) ||
        (options.signal !== undefined && (!options.signal || typeof options.signal.aborted !== 'boolean' || typeof options.signal.addEventListener !== 'function' || typeof options.signal.removeEventListener !== 'function'))) {
      throw Object.assign(new Error('Target model ID and optional AbortSignal are required'), {code:'SMITHY_ASSEMBLY_OPTIONS'});
    }
    if (!backend || typeof backend.identity !== 'string' || !backend.identity || typeof backend.assemble !== 'function') throw new TypeError('An identified Smithy assembly backend is required');
    const completed = await asyncStage('prepareAssembly', 'completeAssembly', {document, id: options.id, identity: backend.identity}, async (request, signal) => {
      if (signal?.aborted) throw Object.assign(new Error('Assembly was cancelled'), {name:'AbortError'});
      const raw = await backend.assemble(request.files, signal ? {signal} : {});
      if (signal?.aborted) throw Object.assign(new Error('Assembly was cancelled'), {name:'AbortError'});
      if (typeof raw !== 'string') throw new TypeError('Smithy assembler must return JSON text');
      return JSON.parse(raw);
    }, 'failAssembly', options.signal);
    return completed;
  };
  const cancelAssembly = handle => { if (handle) { try { run('cancel', {token:handle}); } catch {} } };
  return Object.freeze({
    inspect: fields => run('inspect', fields),
    inspectPayload: fields => run('inspectPayload', fields),
    importJson: fields => run('importJson', fields),
    importSources: fields => run('importSources', fields),
    exportJson: fields => run('exportJson', fields),
    exportSources: fields => run('exportSources', fields),
    exportBundle: fields => run('exportBundle', fields),
    getNode: fields => run('getNode', fields),
    editNode: fields => run('editNode', fields),
    editSource: fields => run('editSource', fields),
    async assembleSmithyDocument(document, backend, options) {
      const completed = await assembleCall(document, backend, options);
      cancelAssembly(completed.assemblyToken);
      return completed.result;
    },
    async selectSmithyShapes(document, backend, selector, options) {
      const completed = await assembleCall(document, backend, options);
      try {
        const selected = await asyncStage('prepareSelection', 'completeSelection', {assemblyToken: completed.assemblyToken, selector}, async (request, signal) => {
          if (signal?.aborted) throw Object.assign(new Error('Selection was cancelled'), {name:'AbortError'});
          if (typeof backend.select !== 'function') throw new TypeError('An identified Smithy selector backend is required');
          const raw = await backend.select(request.modelJson, request.selector, signal ? {signal} : {});
          if (signal?.aborted) throw Object.assign(new Error('Selection was cancelled'), {name:'AbortError'});
          if (typeof raw !== 'string') throw new TypeError('Smithy selector must return JSON text');
          return JSON.parse(raw);
        }, 'failSelection', options.signal);
        if (selected.result) return selected.result;
        return selected;
      } catch (error) {
        cancelAssembly(completed.assemblyToken);
        throw error;
      }
    },
  });
}
