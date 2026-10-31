// Private staged Node adapter. Host observations stay in this call stack; Rust
// receives only the values observed for the current source-ordered stage.
import {encodeWire, fromWire, resultError} from './wire.js';
import {jsonSchemaFailureError} from './json-schema.js';
import {finishJsonSchemaSourceObservation, stageJsonSchemaSource} from './json-schema-import-source.js';

export const JSON_SCHEMA_STAGED_IMPORT_PROFILE = 'umf-r8-json-schema-staged-node-private/0.1.0';

class ImportHostError extends Error {
  constructor(code, message) { super(message); this.name = 'UmfError'; this.code = code; this.path = ''; }
}

function uriError() {
  throw new ImportHostError('JSON_SCHEMA_URI', 'Retrieval URI must be absolute and fragment-free');
}
function ensureUri(uri) {
  try {
    const url = new URL(uri);
    if (url.hash || uri.includes('#')) throw new Error();
  } catch {
    uriError();
  }
}

/** Create an explicitly private staged import profile; it does not change the default route. */
export function createJsonSchemaStagedImportSession(addon) {
  if (typeof addon?.JsonSchemaImportSessionHandle !== 'function' || typeof addon?.jsonSchemaImportSessionProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.jsonSchemaImportSessionProfileVersion() !== JSON_SCHEMA_STAGED_IMPORT_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  return Object.freeze({
    importJsonSchema(source, options) {
      return runImport(source, options, false);
    },
    /** Private opt-in ToString-compatible source profile; default import stays string-only. */
    importJsonSchemaHostCoercion(source, options) {
      return runImport(source, options, true);
    },
  });

  function runImport(source, options, hostCoercion) {
      const session = new addon.JsonSchemaImportSessionHandle();
      const dispatch = (stage, fields = {}) => {
        const response = JSON.parse(session.executeStage(encodeWire({stage, ...fields})));
        const failure = resultError(response);
        if (failure) throw jsonSchemaFailureError(failure, ImportHostError);
        return fromWire(JSON.parse(response.wire));
      };

      // This order mirrors the direct TypeScript source. In particular,
      // Object.entries snapshots and invokes all resource getters before any
      // source is parsed, then each Rust resource stage completes in order.
      const firstBaseUri = options.baseUri;
      ensureUri(firstBaseUri);
      if (typeof firstBaseUri !== 'string') throw new TypeError('Staged JSON Schema import accepts a string baseUri');
      dispatch('begin', {firstBaseUri});

      const entries = Object.entries(options.resources || {});
      for (const [uri, resourceSource] of entries) {
        ensureUri(uri);
        if (!hostCoercion && typeof resourceSource !== 'string') throw new TypeError('Staged JSON Schema import accepts string resource sources only');
        const stagedResource = hostCoercion ? stageJsonSchemaSource(resourceSource) : {text: resourceSource, nonString: false};
        dispatch('resource', {uri, source: stagedResource.text});
        finishJsonSchemaSourceObservation(stagedResource);
      }

      const payloadBaseUri = options.baseUri;
      if (typeof payloadBaseUri !== 'string') throw new TypeError('Staged JSON Schema import accepts a string baseUri');
      dispatch('payloadBaseUri', {baseUri: payloadBaseUri});

      if (!hostCoercion && typeof source !== 'string') throw new TypeError('Staged JSON Schema import accepts a string root source');
      const stagedRoot = hostCoercion ? stageJsonSchemaSource(source) : {text: source, nonString: false};
      dispatch('root', {source: stagedRoot.text});
      finishJsonSchemaSourceObservation(stagedRoot);

      const id = options.id;
      if (typeof id !== 'string') throw new TypeError('Staged JSON Schema import accepts a string id');
      dispatch('id', {id});

      const namespace = options.baseUri;
      if (typeof namespace !== 'string') throw new TypeError('Staged JSON Schema import accepts a string namespace');
      dispatch('namespace', {baseUri: namespace});
      return dispatch('finish');
  }
}
