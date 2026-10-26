/** Public operation names for the opt-in CONTRACT-002 Rust binding. */
export const JSON_SCHEMA_PROFILE = 'umf-r5-json-schema/0.1.0';
export class UmfError extends Error {
  constructor(code, message, path = '') {
    super(message);
    this.name = 'UmfError';
    this.code = code;
    this.path = path;
  }
}
const CONTROL_FAILURE_CODES = new Set(['RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE', 'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE']);
export function jsonSchemaFailureError(failure, ControlError) {
  const ErrorType = CONTROL_FAILURE_CODES.has(failure.code) ? ControlError : UmfError;
  return new ErrorType(failure.code, failure.message, failure.path);
}
function resourceMap(entries, work) {
  work?.(entries.length + 1);
  const result = Object.create(null);
  for (const entry of entries) {
    work?.(entry.uri.length + 1);
    Object.defineProperty(result, entry.uri, {value: entry.source, enumerable: true, writable: true, configurable: true});
  }
  return result;
}
function orderedDiagnostics(items) {
  return items.map(({code, path, severity, message}) => ({code, path, severity, message}));
}
function requireSourcePointerType(pointer) {
  if (typeof pointer !== 'string') pointer.startsWith('/');
}
export function createJsonSchemaOperations(call, preflight) {
  const own = (value, key, required = true) => {
    if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError('JSON Schema options must be plain objects');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) { if (required) throw new TypeError(`Missing ${key}`); return undefined; }
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError(`JSON Schema ${key} must be an enumerable data property`);
    return descriptor.value;
  };
  return Object.freeze({
    importJsonSchema(source, options) {
      const admission = preflight();
      const id = own(options, 'id'); const baseUri = own(options, 'baseUri');
      const resources = own(options, 'resources', false) ?? Object.create(null);
      if (!resources || (Object.getPrototypeOf(resources) !== Object.prototype && Object.getPrototypeOf(resources) !== null)) throw new TypeError('JSON Schema resources must be a plain object');
      const entries = [];
      const keys = Reflect.ownKeys(resources);
      admission.work?.(keys.length + 1);
      for (const uri of keys) {
        if (typeof uri !== 'string') throw new TypeError('JSON Schema resource URI keys must be strings');
        admission.work?.(uri.length + 1);
        const item = own(resources, uri);
        entries.push({uri, source: item});
      }
      return call('importJsonSchema', {source, id, baseUri, resources: entries}, admission);
    },
    inspectJsonSchema(document) { const admission = preflight(); return call('inspectJsonSchema', {document}, admission); },
    exportJsonSchema(document) { const admission = preflight(); return call('exportJsonSchema', {document}, admission); },
    exportJsonSchemaResources(document) { const admission = preflight(); return resourceMap(call('exportJsonSchemaResources', {document}, admission), admission.work); },
    exportJsonSchemaBundle(document) { const admission = preflight(); const bundle = call('exportJsonSchemaBundle', {document}, admission); return {schema: bundle.root, resources: resourceMap(bundle.resources, admission.work), source: bundle.source, diagnostics: orderedDiagnostics(bundle.diagnostics)}; },
    getJsonSchemaNode(document, pointer) { const admission = preflight(); requireSourcePointerType(pointer); return call('getJsonSchemaNode', {document, pointer}, admission); },
    walkJsonSchema(document) { const admission = preflight(); return call('walkJsonSchema', {document}, admission); },
    parseNativeJson(source) { const admission = preflight(); return call('parseNativeJson', {source}, admission); },
    editJsonSchemaNode(document, pointer, replacement) { requireSourcePointerType(pointer); const admission = preflight(); return call('editJsonSchemaNode', {document, pointer, replacement}, admission); },
  });
}
