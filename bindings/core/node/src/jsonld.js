// SPDX-License-Identifier: MIT OR Apache-2.0

export const JSONLD_PROFILE = 'umf.jsonld-wire/1';

/** Public JSON-LD API backed only by the closed Rust family dispatcher. */
export function createJsonLdOperations(call) {
  if (typeof call !== 'function') throw new TypeError('A native JSON-LD operation dispatcher is required');
  const run = (operation, fields) => call(operation, fields);
  return Object.freeze({
    profile: JSONLD_PROFILE,
    capabilities: Object.freeze({profile: JSONLD_PROFILE, source: true, transformations: true, complete: false}),
    importJsonLdDocument(source, options) {
      return run('import', {...options, source});
    },
    inspectJsonLdDocument(document) { return run('validate', {document}); },
    exportJsonLdDocument(document) { return run('export', {document}); },
    getJsonLdNode(document, path) { return run('getNode', {document, pointer: path}); },
    proposeJsonLdNodeEdit(document, path, replacementJson) {
      return run('editNode', {document, pointer: path, replacementJson});
    },
    async proposeJsonLdExpansion(document, options) {
      return run('expand', {...options, document});
    },
    async proposeJsonLdFlatten(document, options) {
      return run('flatten', {...options, document});
    },
    async proposeJsonLdCompaction(document, options) {
      return run('compact', {...options, document});
    },
    async proposeJsonLdFraming(document, options) {
      return run('frame', {...options, document});
    },
    async proposeJsonLdToRdf(document, options) {
      return run('toRdf', {...options, document});
    },
    async proposeRdfToJsonLd(document, options) {
      return run('fromRdf', {...options, document});
    },
    async proposeGeneralizedRdfToJsonLd(document, options) {
      return run('fromGeneralizedRdf', {...options, document});
    },
  });
}
