import {probeRdfXml,type Profile} from '../native/rdfxml/probe';
const start='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="https://example.org/" xmlns:p="urn:outer:" xml:base="https://example.org/base/"><rdf:Description rdf:about="item">',end='</rdf:Description></rdf:RDF>';
const fragments=[
 ['inherited-prefix','<ex:b ex:attr="a&amp;b">雪</ex:b>'],
 ['escaped-text','a&amp;b&lt;c&gt;d'],
 ['attribute-quotes','<b a="&quot;&amp;&lt;&#9;&#10;&#13;"/>'],
 ['cdata','<![CDATA[a<b&c]]>tail'],
 ['comments','before<!-- retained -->after'],
 ['processing-instruction','<?render mode="x"?><b/>'],
 ['rebound-prefix','<p:a xmlns:p="urn:inner:"><p:b/></p:a><p:c/>'],
 ['default-namespace','<a xmlns="urn:inner:"><b/><c xmlns=""><d/></c><e/></a>'],
 ['attribute-prefix','<b p:attr="v"/>'],
 ['explicit-unused-namespace','<b xmlns:q="urn:unused:"/>'],
 ['siblings','<p:a/><p:b/>'],
 ['nested-redeclaration','<p:a><p:b xmlns:p="urn:inner:"/><p:c/></p:a>'],
 ['carriage-return','a&#13;b'],
 ['empty-literal',''],
];
const cases=fragments.map(([id,fragment])=>({id: 'literal-'+id,input:start+'<ex:value rdf:parseType="Literal">'+fragment+'</ex:value>'+end}));
cases.push({id:'ordinary-cdata',input:start+'<ex:value>a<![CDATA[b]]>c</ex:value>'+end});
const results=[];for(const c of cases)for(const profile of ['finalized','literal-repair'] as Profile[])results.push({...c,profile,baseIRI:'https://example.org/base/',...await probeRdfXml(c.input,'https://example.org/base/',profile)});
// Preserve the original feasibility reports; the repair is a separate experiment.
for(const path of ['fixtures/rdfxml/probe.json','fixtures/rdfxml/corpus.json'])for(const c of (await Bun.file(path).json()).results.filter((r:any)=>r.profile==='finalized'))results.push({...c,profile:'literal-repair',...await probeRdfXml(c.input,c.baseIRI,'literal-repair')});
await Bun.write('fixtures/rdfxml/literals.json',JSON.stringify({parser:'rdfxml-streaming-parser@3.3.0 + experimental literal repair',scope:'Deterministic XML serialization with explicit and visibly used namespace bindings, not XML canonicalization or complete namespace-context capture',results},null,2)+'\n');console.log({runs:results.length});
