import {test,expect} from 'bun:test';
import {wellFormedIri,wellFormedLanguage} from '../../src/adapters/jsonld/rdf-terms';
test('US-026-AC15: RFC IRI components preserve valid spellings and reject malformed boundaries',()=>{
 for(const iri of ['urn:s','urn:','http://例え.テスト/é?q=𐀀#x','http://user:pass@example.org:80/a%20b','http://[::1]/','http://[2001:db8:0:0:0:0:192.0.2.1]/','http://[::ffff:192.0.2.1]/','http://[v1.test:host]/','file:///tmp/a','urn:x?\ue000','urn:x?\u{f0000}','urn:x/\u{10000}','urn:x/\u{e1000}'])expect(wellFormedIri(iri)).toBe(true);
 for(const iri of ['urn:x\n','relative','urn:x y','urn:x<>','urn:x##y','urn:x%','urn:x%G1','urn:x\\a','http://u@@host/','http://host:port/','http://[:::]/','http://[1:2:3:4:5:6:7:8::]/','http://[::ffff:192.00.2.1]/','http://[::1]tail/','http://[v1.]/','urn:x/\ud800','urn:x/\ue000','urn:x#\ue000','urn:x/\u{e0001}','urn:x/\ufffe','urn:x/\u{1fffe}'])expect(wellFormedIri(iri)).toBe(false);
});
test('US-026-AC15: BCP47 syntax handles private, grandfathered and duplicate subtags',()=>{
 for(const tag of ['en','EN-us','zh-Hant-TW','de-CH-1901','sl-rozaj-biske','en-a-aaa-b-bbb-x-p','x-private','i-klingon','sgn-BE-FR','zh-min','en-US-u-ca-gregory'])expect(wellFormedLanguage(tag)).toBe(true);
 for(const tag of ['en\n','a b','en_uk','','e','en-','x','en-a','en-1901-1901','en-a-foo-a-bar','en-abcdefghi','en--us'])expect(wellFormedLanguage(tag)).toBe(false);
});
