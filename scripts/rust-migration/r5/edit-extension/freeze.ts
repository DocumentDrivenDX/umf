// SPDX-License-Identifier: MIT OR Apache-2.0
import { writeFileSync } from 'node:fs';
import { Registry, editExtension, type Document, type ExtensionPackage } from '../../../../src';

const source: Document = {
  umf: '0.10.0', id: 'fixture:domain',
  vocabularies: { 'urn:test:note': { version: '1.0.0' } },
  modules: [
    { id: 'm', namespace: 'm', elements: [{ id: 'e', extensions: { 'urn:test:note': { label: 'Buyer', opaque: { keep: [1, true] } } } }] },
    { id: 'other', namespace: 'other', elements: [{ id: 'e', extensions: { 'urn:test:note': { label: 'Contact' } } }] },
  ],
};
const pkg: ExtensionPackage = {
  id: 'urn:test:note', version: '1.0.0', coreVersion: '0.10.0',
  description: 'Synthetic fixture for the native edit transaction.',
  schema: { type: 'object', required: ['label'], properties: { label: { type: 'string' } }, additionalProperties: true },
  semantics: 'The label is descriptive text.',
  scopes: ['element'],
  capabilities: { validation: 'semantic', directions: [], evidence: [] },
};
const trace: string[] = [];
const registry = () => new Registry().register(pkg, payload => {
  trace.push(String((payload as { label?: unknown }).label));
  return [];
});
const error = (operation: () => unknown) => {
  try { operation(); return null; }
  catch (value) {
    const thrown = value as { code?: string; message?: string };
    return { code: thrown.code ?? null, message: thrown.message ?? String(value) };
  }
};
const copy = JSON.parse(JSON.stringify(source)) as Document;
const callbackTrace: string[] = [];
const success = editExtension(copy, registry(), 'm', 'e', 'urn:test:note', payload => {
  callbackTrace.push(String((payload as { label?: unknown }).label));
  return { ...(payload as object), edited: true };
});
const successValidationTrace = [...trace];
const surrogateSource = structuredClone(source) as Document;
surrogateSource.modules[0]!.id = '\ud800';
surrogateSource.modules[0]!.elements[0]!.id = '\ud800';
const surrogateSuccess = editExtension(surrogateSource, registry(), '\ud800', '\ud800', 'urn:test:note', payload => ({ ...(payload as object), surrogate: true }));
const unsafe = structuredClone(source) as Document;
(unsafe as unknown as Record<string, unknown>).unknownFuture = { retain: true };
const unsafeRefusal = error(() => editExtension(unsafe, registry(), 'm', 'e', 'urn:test:note', payload => payload));
const missingRefusal = error(() => editExtension(source, registry(), 'missing', 'e', 'urn:test:note', payload => payload));
trace.length = 0;
const invalidEdit = error(() => editExtension(source, registry(), 'm', 'e', 'urn:test:note', payload => ({ ...(payload as object), label: 3 })));
const invalidEditValidationTrace = [...trace];

const fixture = {
  source,
  extensionSchema: pkg.schema,
  success,
  surrogateSource,
  surrogateSuccess,
  updaterTrace: callbackTrace,
  validationTrace: successValidationTrace,
  unsafeRefusal,
  missingRefusal,
  invalidEdit,
  invalidEditValidationTrace,
};
writeFileSync(new URL('./frozen.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
