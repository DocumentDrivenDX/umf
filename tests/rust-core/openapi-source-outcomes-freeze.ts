// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the complete predecessor outcomes that the source-only Rust candidate
// intends to preserve. Run from the repository root with Bun when qualification
// is authorized; this script intentionally writes only to stdout.
import {
  exportOpenapiBundle,
  exportOpenapiDocument,
  getOpenapiNode,
  importOpenapiDocument,
  inspectOpenapi,
  lookupOpenapiResource,
  proposeOpenapiEdit,
} from '../../src/adapters/openapi';
import { extractOpenapiSchema } from '../../src/adapters/openapi/extraction';
import { indexOpenapiSchemas, resolveOpenapiSchemaReference } from '../../src/adapters/openapi/scope';
import { resolveOpenapiDynamicReference } from '../../src/adapters/openapi/dynamic';
import { resolveOpenapiObjectReference } from '../../src/adapters/openapi/references';

const yaml = await Bun.file('fixtures/openapi/orders.yaml').text();
const document = importOpenapiDocument(yaml, { id: 'rust-openapi-source', format: 'yaml' });
const edited = proposeOpenapiEdit(document, '/info/title', '"Updated Orders"');
const resourceRoot = JSON.parse(await Bun.file('fixtures/openapi/resource-bundle-json.json').text()).original;
const bundleDocument = importOpenapiDocument(resourceRoot.schema, {
  id: 'rust-openapi-bundle-source',
  format: 'json',
  baseUri: resourceRoot.baseUri,
  resources: resourceRoot.resources.map((resource: { uri: string; text: string; format: 'json' | 'yaml' }) => resource),
});
const orders32 = await Bun.file('fixtures/openapi/orders-3.2.json').text();
const contextDocument = importOpenapiDocument(orders32, {
  id: 'rust-openapi-context-source', format: 'json', baseUri: 'https://example.test/orders.json',
});
const referenceDocument = importOpenapiDocument(JSON.stringify({
  openapi: '3.2.1', info: { title: 'References', version: '1' }, paths: {},
  components: { parameters: { P: { name: 'q', in: 'query', schema: { type: 'string' } } } },
  'x-use': { $ref: '#/components/parameters/P' },
}), { id: 'rust-openapi-reference-source', format: 'json', baseUri: 'https://example.test/references.json' });
const dynamicDocument = importOpenapiDocument(JSON.stringify({
  openapi: '3.2.1', info: { title: 'Dynamic', version: '1' }, paths: {},
  components: { schemas: { Tree: {
    $id: 'https://example.test/tree', $dynamicAnchor: 'node', type: 'object',
    properties: { children: { type: 'array', items: { $dynamicRef: '#node' } } },
  } } },
}), { id: 'rust-openapi-dynamic-source', format: 'json', baseUri: 'https://example.test/dynamic.json' });
const exactNumericDocument = importOpenapiDocument(
  '{"openapi":"3.2.1","info":{"title":"Exact","version":"1"},"paths":{},"components":{"schemas":{"N":{"minimum":9007199254740993}}}}',
  { id: 'rust-openapi-exact-number-source', format: 'json' },
);
const standaloneMetaDocument = importOpenapiDocument(JSON.stringify({
  openapi: '3.2.1', info: { title: 'Meta', version: '1' }, paths: {},
  components: { schemas: { RecursiveMeta: { $dynamicRef: '#meta' } } },
}), { id: 'rust-openapi-standalone-meta-source', format: 'json' });
const loneSurrogate = String.fromCharCode(0xd800);
const utf16Document = importOpenapiDocument(JSON.stringify({
  openapi: '3.2.1', info: { title: 'UTF-16', version: '1' }, paths: {},
  components: { schemas: { [loneSurrogate]: { type: 'string' } } },
}), { id: 'rust-openapi-utf16-source', format: 'json' });
const unrelatedModuleDocument = importOpenapiDocument(orders32, {
  id: 'rust-openapi-unrelated-module-source', format: 'json', baseUri: 'https://example.test/metadata.json',
});
unrelatedModuleDocument.modules.push({ id: 'unrelated', namespace: 'urn:unrelated:', elements: [] });

function captured(run: () => unknown) {
  try { return { ok: true, value: run() }; }
  catch (error) {
    const value = error as { code?: string; message?: string };
    return { ok: false, code: value.code ?? null, message: value.message ?? String(error) };
  }
}

const outcome = {
  source: {
    validation: inspectOpenapi(document),
    sameFormatExport: exportOpenapiDocument(document),
    convertedExport: exportOpenapiDocument(document, 'json'),
    copiedNode: getOpenapiNode(document, '/paths/~1orders~1{id}/get/operationId'),
    editedValidation: edited.validation,
    editedTitle: getOpenapiNode(edited.document, '/info/title'),
    editedBundle: exportOpenapiBundle(edited.document),
    invalidRoot: captured(() => importOpenapiDocument('{"openapi":3,"info":{},"paths":{}}', { id: 'invalid', format: 'json' })),
    missingPointer: captured(() => getOpenapiNode(document, '/not-present')),
    originalAfterEdit: exportOpenapiDocument(document),
  },
  bundle: {
    validation: inspectOpenapi(bundleDocument),
    exported: exportOpenapiBundle(bundleDocument),
    literalLookup: lookupOpenapiResource(bundleDocument, './Pet.json#/properties/id', resourceRoot.baseUri),
  },
  schemaContext: {
    extraction: extractOpenapiSchema(contextDocument, { pointer: '/components/schemas/Order' }),
    index: indexOpenapiSchemas(contextDocument),
    staticReference: resolveOpenapiSchemaReference(contextDocument, {
      pointer: '/paths/~1orders~1{id}/get/responses/200/content/application~1json/schema',
      reference: '#/components/schemas/Order',
    }),
  },
  typedReference: resolveOpenapiObjectReference(referenceDocument, {
    pointer: '/x-use', kind: 'parameter',
  }),
  dynamicReference: resolveOpenapiDynamicReference(dynamicDocument, {
    pointer: '/components/schemas/Tree/properties/children/items',
    evaluationScope: ['https://example.test/tree'],
  }),
  exactNumeric: {
    validation: inspectOpenapi(exactNumericDocument),
    sourceExport: exportOpenapiDocument(exactNumericDocument),
  },
  standaloneDynamicMeta: inspectOpenapi(standaloneMetaDocument),
  utf16Pointer: extractOpenapiSchema(utf16Document, { pointer: `/components/schemas/${loneSurrogate}` }),
  unrelatedMetadataEdit: captured(() => {
    const edited = proposeOpenapiEdit(unrelatedModuleDocument, '/info/title', '"Edited"');
    return edited.document.modules.map(module => module.id);
  }),
};

process.stdout.write(JSON.stringify(outcome) + '\n');
