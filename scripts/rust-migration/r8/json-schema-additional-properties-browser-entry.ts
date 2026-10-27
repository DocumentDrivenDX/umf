// SPDX-License-Identifier: MIT OR Apache-2.0
import {createJsonSchemaEngine} from '../../../bindings/core/wasm/index.js';
import {importJsonSchema as tsImport, inspectJsonSchema as tsInspect} from '../../../src/adapters/json-schema/index.ts';

const module = (globalThis as any).additionalPropertiesWasmModule;
const engine = createJsonSchemaEngine(module);
const dialect = 'https://json-schema.org/draft/2020-12/schema';
const baseUri = 'https://schemas.example.test/additional-properties.json';
function document(schema: string, id: string) {
  return {umf: '0.10.0', id, vocabularies: {'umf.json-schema': {version: '0.1.0'}}, modules: [{
    id: 'schema', namespace: baseUri, elements: [{id: 'schema', extensions: {'umf.json-schema': {
      dialect, baseUri, root: engine.parseNativeJson(schema), resources: {},
    }}}],
  }]};
}

(globalThis as any).additionalPropertiesBrowserResult = ([
  ['additional-properties-false', '{"type":"object","properties":{"known":{"type":"string"}},"additionalProperties":false}'],
  ['additional-properties-schema-valued', '{"type":"object","properties":{"known":{"type":"string"}},"additionalProperties":{"type":"integer","minimum":1}}'],
  ['nested-additional-properties-false', '{"type":"object","properties":{"child":{"type":"object","additionalProperties":false}}}'],
  ['nested-additional-properties-schema-valued', '{"type":"object","properties":{"child":{"type":"object","additionalProperties":{"type":"integer","minimum":1}}}}'],
  ['unsupported-schema-keyword-remains-incomplete', '{"type":"object","additionalProperties":{"pattern":"x"}}'],
] as const).map(([id, schema]) => {
  const checked = engine.inspectJsonSchema(document(schema, `urn:umf:r8:${id}`) as any);
  const predecessor = tsInspect(tsImport(schema, {id: `urn:umf:r8:${id}`, baseUri}));
  const summary = (value: any) => ({valid: value.valid, complete: value.complete, diagnostics: value.diagnostics.map(({code, path, severity}: any) => ({code, path, severity}))});
  return {id, rust: summary(checked), typescript: summary(predecessor)};
});
