import {test, expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importRdfNQuads, exportRdfNQuads, getRdfQuads, importLinkmlDocument, exportLinkmlDocument, getLinkmlDocumentNode, importTableSpec, exportTableSpec, getTableSpecTable, readDocument, writeDocument} from '../../src';
import {parseNativeJson} from '../../src/model/native-json';

const base='fixtures/relationship-native/';
const oracle=await Bun.file(base+'oracle-results.json').json();

test('CONTRACT-041: native observations retain browser recovery evidence',async()=>{
 const browser=await Bun.file(base+'browser-results.json').json();
 expect(browser.cases).toEqual(['rdf','linkml','tablespec']);
 expect(browser.recoveries).toBe(6);
 expect(browser.nodeGlobalsAbsent).toBe(true);
 expect(browser.sourceSha256).toEqual(oracle.sourceSha256);
});

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

test('CONTRACT-041: TableSpec foreign-key metadata stays a native observation',async()=>{
 const raw=await Bun.file(base+'tablespec-foreign-key.json').text();
 expect(createHash('sha256').update(raw).digest('hex')).toBe(oracle.sourceSha256.tablespec);
 const document=importTableSpec(raw,{id:'relationship-native-tablespec',format:'json'});
 const table=getTableSpecTable(document);
 expect(table.kind).toBe('object');
 if(table.kind!=='object')throw Error('Expected native table object');
 expect(table.members.relationships).toEqual(parseNativeJson(JSON.stringify({foreign_keys:[{
  column:oracle.tablespec.column,
  references_table:oracle.tablespec.referencesTable,
  references_column:oracle.tablespec.referencesColumn,
  confidence:oracle.tablespec.confidence
 }]})));
 for(const format of ['json','yaml'] as const)
  expect(exportTableSpec(readDocument(writeDocument(document,format),format))).toBe(raw);
 expect('relationships' in document.modules[0]!).toBe(false);
 expect(oracle.tablespec).toEqual({column:'customer_id',referencesTable:'customers',referencesColumn:'id',confidence:0.95});
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
