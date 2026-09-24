import {test, expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importRdfNQuads, exportRdfNQuads, getRdfQuads, importLinkmlDocument, exportLinkmlDocument, getLinkmlDocumentNode, readDocument, writeDocument} from '../../src';

const base='fixtures/relationship-native/';
const oracle=await Bun.file(base+'oracle-results.json').json();

test('CONTRACT-041: RDF domain and range remain native observations',async()=>{
 const raw=await Bun.file(base+'rdf-domain-range.nq').text();
 expect(createHash('sha256').update(raw).digest('hex')).toBe(oracle.sourceSha256.rdf);
 const document=importRdfNQuads(raw,{id:'relationship-native-rdf'});
 expect(getRdfQuads(document)).toHaveLength(oracle.rdf.quadCount);
 for(const format of ['json','yaml'] as const)
  expect(exportRdfNQuads(readDocument(writeDocument(document,format),format))).toBe(raw);
 expect('relationships' in document.modules[0]!).toBe(false);
 expect(oracle.classification).toBe('native-observation-only');
});

test('CONTRACT-041: LinkML slot and range remain native observations',async()=>{
 const raw=await Bun.file(base+'linkml-slot.yaml').text();
 expect(createHash('sha256').update(raw).digest('hex')).toBe(oracle.sourceSha256.linkml);
 const document=importLinkmlDocument(raw,{id:'relationship-native-linkml',format:'yaml'});
 expect(getLinkmlDocumentNode(document,'/slots/customer/range')).toEqual({kind:'string',value:oracle.linkml.range});
 expect(getLinkmlDocumentNode(document,'/slots/customer/multivalued')).toEqual({kind:'boolean',value:oracle.linkml.multivalued});
 for(const format of ['json','yaml'] as const)
  expect(exportLinkmlDocument(readDocument(writeDocument(document,format),format))).toBe(raw);
 expect('relationships' in document.modules[0]!).toBe(false);
 expect(oracle.classification).toBe('native-observation-only');
});
