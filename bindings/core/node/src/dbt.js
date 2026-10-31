import {UmfError} from './json-schema.js';

export const DBT_PROFILE = 'umf-r9-dbt-preservation/0.1.0';

/** Expose the opt-in bounded dbt preservation operations without changing TS defaults. */
const CONTROL_CODES = new Set(['RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE', 'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE']);
const copyFailures = new WeakSet();
const dbtHostErrors = new WeakSet();
export function isDbtHostError(error) {
  return error !== null && (typeof error === 'object' || typeof error === 'function') && dbtHostErrors.has(error);
}

function materialize(value, prototype, nativeMembers = false, nativeNodeChildren = false, work) {
  if (typeof value === 'string') { work?.(value.length + 1); return value; }
  if (Array.isArray(value)) {
    work?.(value.length + 1);
    const result = new Array(value.length);
    for (let index = 0; index < value.length; index++) {
      result[index] = materialize(value[index], prototype, nativeMembers, nativeNodeChildren, work);
    }
    return result;
  }
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  work?.(keys.length + 1);
  const result = Object.create(prototype);
  for (const key of keys) {
    work?.(key.length + 1);
    const isNativeMemberMap = nativeMembers && key === 'members'
      && Object.hasOwn(value, 'kind') && value.kind === 'object';
    Object.defineProperty(result, key, {
      value: materialize(value[key], isNativeMemberMap ? null : nativeNodeChildren ? Object.prototype : prototype,
        nativeMembers, isNativeMemberMap, work),
      enumerable: true, writable: true, configurable: true,
    });
  }
  return result;
}

function ordinary(value, work) { return materialize(value, Object.prototype, false, false, work); }
function copied(value, work) { return materialize(value, null, false, false, work); }

function materializeResult(operation, value, work) {
  if (operation.startsWith('import')) return materialize(value, Object.prototype, true, false, work);
  if (operation.startsWith('inspect') && operation !== 'inspectManifestGraph') return ordinary(value, work);
  if (operation === 'inspectManifestGraph') return ordinary(value, work);
  if (operation.startsWith('get')) return copied(value, work);
  if (operation.startsWith('edit')) {
    return {
      document: copied(value.document, work),
      validation: ordinary(value.validation, work),
    };
  }
  if (operation === 'selectManifestDependencies' || operation === 'finishManifestSelection') {
    return {source: copied(value.source, work), selection: ordinary(value.selection, work)};
  }
  return value;
}

/** Expose the bounded DBT operations with predecessor host admission and result prototypes. */
export function createDbtOperations(call, host = {}) {
  const run = (operation, fields, transaction) => call(operation, fields, transaction);
  const invoke = (operation, fields, transaction = {}) => materializeResult(operation, run(operation, fields, transaction), transaction.materializeWork);
  const copyDocument = (operation, document, mode = 'document', transaction) => {
    if (typeof host.copyJson !== 'function') return document;
    transaction ??= {};
    host.prepareTransaction?.(transaction);
    try { return host.copyJson(document, transaction); }
    catch (error) {
      if (!host.isHostJsonResponseError?.(error) || CONTROL_CODES.has(error?.code)) throw error;
      if (mode === 'inspect') {
        const failure = {code: error.code, path: error.path, message: error.message, severity: 'error'};
        copyFailures.add(failure);
        return failure;
      }
      if (mode === 'selection') throw error;
      const prefix = operation.includes('SemanticManifest') ? 'DBT_SEMANTIC_MANIFEST'
        : operation.includes('Artifact') ? 'DBT_ARTIFACT' : 'DBT_MANIFEST';
      const diagnostic = {code: error.code, path: error.path, message: error.message, severity: 'error'};
      const wrapped = new UmfError(`${prefix}_DOCUMENT`, JSON.stringify([diagnostic]));
      dbtHostErrors.add(wrapped);
      throw wrapped;
    }
  };
  const inspect = (operation, document) => {
    const transaction = {};
    const staged = copyDocument(operation, document, 'inspect', transaction);
    if (staged !== null && typeof staged === 'object' && copyFailures.has(staged)) {
      return {valid: false, complete: false, diagnostics: [staged]};
    }
    return invoke(operation, {document: staged}, transaction);
  };
  const importDocument = (operation, text, options) => {
    const id = options.id; // Deliberately read once before native source parsing.
    const transaction = {};
    // A non-JSON id is copied only after native source parsing, matching the
    // predecessor's parseNativeJson-before-document-validation order.
    if (id === undefined || typeof id === 'function' || typeof id === 'symbol'
        || typeof id === 'bigint' || (id !== null && typeof id === 'object')) {
      run('prepareImportText', {text}, transaction);
      const staged = copyDocument(operation, {id}, 'document', transaction);
      return invoke(operation, {text, options: {id: staged.id}}, transaction);
    }
    return invoke(operation, {text, options: {id}}, transaction);
  };
  const doc = (operation, document, mode = 'document', transaction) => copyDocument(operation, document, mode, transaction);
  const documentOperation = (operation, document, fields = {}, mode = 'document', transaction = {}) => {
    const staged = doc(operation, document, mode, transaction);
    return invoke(operation, {document: staged, ...fields}, transaction);
  };
  const prepareSelectionOptions = (options, transaction) => {
    if (options === null || typeof options !== 'object') {
      return run('prepareManifestSelectionRoots', {options: null}, transaction);
    }
    const bounds = run('prepareManifestSelectionBounds', {}, transaction);
    const invalidRoots = () => run('prepareManifestSelectionRoots', {options: {roots: null}}, transaction);
    if (!Array.isArray(options.roots)) return invalidRoots();
    if (options.roots.length < bounds.minimum) return invalidRoots();
    if (options.roots.length > bounds.maximum) return invalidRoots();
    if (options.roots.some(id => run('prepareManifestSelectionRootItem', {
      item: typeof id === 'string' ? id : null,
    }, transaction))) return invalidRoots();
    // Keep the predecessor's two reads of each supplied optional property.
    const includeMacros = options.includeMacros === undefined ? undefined : options.includeMacros;
    const maxDepth = options.maxDepth === undefined ? undefined : options.maxDepth;
    const maxNodes = options.maxNodes === undefined ? undefined : options.maxNodes;
    const projected = {};
    if (includeMacros !== undefined) projected.includeMacros = typeof includeMacros === 'boolean' ? includeMacros : null;
    if (maxDepth !== undefined) projected.maxDepth = typeof maxDepth === 'number' ? maxDepth : null;
    if (maxNodes !== undefined) projected.maxNodes = typeof maxNodes === 'number' ? maxNodes : null;
    return {settings: run('prepareManifestSelectionSettings', {options: projected}, transaction), bounds};
  };
  return Object.freeze({
    profile: DBT_PROFILE,
    capabilities: Object.freeze({profile: DBT_PROFILE, nativeJson: true, complete: false}),
    importDbtManifest(text, options) { return importDocument('importManifest', text, options); },
    exportDbtManifest(document) { return documentOperation('exportManifest', document); },
    inspectDbtManifest(document) { return inspect('inspectManifest', document); },
    getDbtManifestNode(document, path) { return documentOperation('getManifestNode', document, {path}); },
    proposeDbtManifestNodeEdit(document, path, text) { return documentOperation('editManifest', document, {path, text}); },
    importDbtArtifact(text, options) { return importDocument('importArtifact', text, options); },
    exportDbtArtifact(document) { return documentOperation('exportArtifact', document); },
    inspectDbtArtifact(document) { return inspect('inspectArtifact', document); },
    getDbtArtifactNode(document, path) { return documentOperation('getArtifactNode', document, {path}); },
    proposeDbtArtifactNodeEdit(document, path, text) { return documentOperation('editArtifact', document, {path, text}); },
    importDbtSemanticManifest(text, options) { return importDocument('importSemanticManifest', text, options); },
    exportDbtSemanticManifest(document) { return documentOperation('exportSemanticManifest', document); },
    inspectDbtSemanticManifest(document) { return inspect('inspectSemanticManifest', document); },
    getDbtSemanticManifestNode(document, path) { return documentOperation('getSemanticManifestNode', document, {path}); },
    proposeDbtSemanticManifestNodeEdit(document, path, text) { return documentOperation('editSemanticManifest', document, {path, text}); },
    inspectDbtManifestGraph(document) { return documentOperation('inspectManifestGraph', document); },
    selectDbtManifestDependencies(document, options) {
      const transaction = {};
      const {settings, bounds} = prepareSelectionOptions(options, transaction);
      const staged = copyDocument('selectManifestDependencies', document, 'selection', transaction);
      run('prepareManifestSelectionGraph', {document: staged}, transaction);
      const rootSource = options.roots;
      let yielded = 0;
      const boundedRoots = (function* () {
        for (const id of rootSource) {
          transaction.hostWork?.(typeof id === 'string' ? id.length + 1 : 1);
          if (++yielded > bounds.maximum) {
            const error = new UmfError('RESOURCE_LIMIT', 'DBT selection iterator exceeded bounded root limit');
            dbtHostErrors.add(error);
            throw error;
          }
          if (run('prepareManifestSelectionRootItem', {item: typeof id === 'string' ? id : null}, transaction)) {
            return run('prepareManifestSelectionRoots', {options: {roots: null}}, transaction);
          }
          yield id;
        }
      })();
      const roots = [...new Set(boundedRoots)];
      return invoke('finishManifestSelection', {document: staged, roots, options: settings}, transaction);
    },
  });
}
