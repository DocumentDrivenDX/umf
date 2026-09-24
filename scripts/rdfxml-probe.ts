import {probeRdfXml,type Profile} from '../native/rdfxml/probe';
const start='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="https://example.org/" xml:base="https://example.org/base/">',end='</rdf:RDF>';
const cases=[
 {id:'simple',input:start+'<rdf:Description rdf:about="item"><ex:value rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">9007199254740993</ex:value></rdf:Description>'+end},
 {id:'collection',input:start+'<ex:Class rdf:about="C"><ex:members rdf:parseType="Collection"><rdf:Description rdf:about="a"/><rdf:Description rdf:about="b"/></ex:members></ex:Class>'+end},
 {id:'resource-language',input:start+'<rdf:Description rdf:nodeID="n"><ex:child rdf:parseType="Resource"><ex:label xml:lang="EN">雪</ex:label></ex:child></rdf:Description>'+end},
 {id:'xml-literal',input:start+'<rdf:Description rdf:about="item"><ex:value rdf:parseType="Literal"><ex:b ex:attr="a&amp;b">雪</ex:b></ex:value></rdf:Description>'+end},
 {id:'duplicate-id',input:start+'<rdf:Description rdf:ID="same"/><rdf:Description rdf:ID="same"/>'+end},
 {id:'undefined-entity',input:start+'<rdf:Description rdf:about="item"><ex:value>&absent;</ex:value></rdf:Description>'+end},
 {id:'unclosed-root',input:start+'<rdf:Description rdf:about="item"><ex:value>partial</ex:value></rdf:Description>'},
 {id:'unclosed-property',input:start+'<rdf:Description rdf:about="item"><ex:value>partial'},
 {id:'empty',input:''},
 {id:'trailing-junk',input:start+end+'junk'},
];
const profiles:Profile[]=['baseline','finalized','literal-namespaces'],results=[];
for(const c of cases)for(const profile of profiles)results.push({...c,profile,baseIRI:'https://example.org/base/',...await probeRdfXml(c.input,'https://example.org/base/',profile)});
await Bun.write('fixtures/rdfxml/probe.json',JSON.stringify({parser:'rdfxml-streaming-parser@3.3.0',scope:'Authored parser feasibility checks only; no UMF RDF/XML adapter or full conformance',results},null,2)+'\n');
console.log(results.map(r=>({id:r.id,profile:r.profile,accepted:r.accepted,emitted:r.emitted,error:r.error})));
