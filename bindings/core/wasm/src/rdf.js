export const RDF_PROFILE = 'umf-r9-rdf-preservation/0.1.0';

/** Additive opt-in facade for the currently implemented Rust RDF kernels. */
export function createRdfOperations(call) {
  const run = (operation, fields) => call(operation, fields);
  return Object.freeze({
    profile: RDF_PROFILE,
    capabilities: Object.freeze({profile: RDF_PROFILE, rdf11: true, generalizedJson: true, complete: false}),
    inspectRdfDocument(document) { return run('inspect', {document}); },
    importRdfNQuads(source, options) { return run('importNQuads', {source, options}); },
    getRdfQuads(document) { return run('getQuads', {document}); },
    exportRdfNQuads(document, options = {}) { return run('exportNQuads', {document, options}); },
    proposeRdfQuadEdit(document, index, replacement) { return run('editQuad', {document, index, replacement}); },
    proposeRdfIriRename(document, options) { return run('renameIri', {document, options}); },
    importRdfTurtle(source, options) { return run('importTurtle', {source, options}); },
    exportRdfTurtle(document) { return run('exportTurtle', {document}); },
    getRdfNamedGraphs(document) { return run('getNamedGraphs', {document}); },
    importRdfTriG(source, options) { return run('importTriG', {source, options}); },
    exportRdfTriG(document) { return run('exportTriG', {document}); },
    proposeRdfDatasetMerge(documents, options) { return run('mergeDatasets', {documents, options}); },
    inspectGeneralizedRdfDocument(document) { return run('inspectGeneralized', {document}); },
    importGeneralizedRdfDataset(source, options) { return run('importGeneralizedDataset', {source, options}); },
    exportGeneralizedRdfDataset(document) { return run('exportGeneralizedDataset', {document}); },
    getGeneralizedRdfQuads(document) { return run('getGeneralizedQuads', {document}); },
    proposeGeneralizedRdfQuadEdit(document, index, replacement) { return run('editGeneralizedQuad', {document, index, replacement}); },
  });
}
