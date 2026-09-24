import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import pathSchema from '../../spec/extensions/shacl/path-schema.json';
import {importShaclTurtle,exportShaclTurtle,getShaclQuads,getShaclPropertyPath,evaluateShaclPropertyPath,proposeShaclQuadEdit,inspectShaclDocument,importRdfTurtle,importRdfTriG,getRdfQuads,readDocument,writeDocument} from '../../src';
const baseIRI='https://example.org/',iri=(s:string)=>({kind:'iri' as const,value:baseIRI+s}),options={id:'shapes',baseIRI};
const prefix='@prefix ex: <https://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . ';
test('US-028 graph preservation, all path operators and independent expected sets',async()=>{
 const source=await Bun.file('native/shacl/paths.ttl').text(),data=importRdfTurtle(await Bun.file('native/shacl/data.ttl').text(),{id:'data',baseIRI}),d=importShaclTurtle(source,options),snapshot=JSON.stringify(d),cases=(await Bun.file('fixtures/shacl/results.json').json()).results,oracle=await Bun.file('fixtures/shacl/oracle-results.json').json(),check=new Ajv2020({strict:false}).compile(pathSchema);
 expect(inspectShaclDocument(d).valid).toBe(true);expect(oracle.version).toBe('7.6.0');expect(oracle.results).toHaveLength(52);expect(oracle.results.every((r:any)=>r.equal)).toBe(true);expect(oracle.roundTrips).toEqual({json:true,yaml:true});expect(oracle.edit).toBe(true);
 for(const c of cases){const path=getShaclPropertyPath(d,iri(c.name));expect(check(path)).toBe(true);expect(path).toEqual(c.path);expect(evaluateShaclPropertyPath(d,iri(c.name),data,iri(c.focus))).toEqual(c.values);}
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);expect(exportShaclTurtle(restored)).toBe(source);const qs=getShaclQuads(restored),i=qs.findIndex(q=>q.predicate.value.endsWith('#minCount')),replacement=qs[i]!;expect(replacement.object.value).toBe('9007199254740993');replacement.object={kind:'literal',value:'2',datatype:'http://www.w3.org/2001/XMLSchema#integer'};const edit=proposeShaclQuadEdit(restored,i,replacement).document;expect(exportShaclTurtle(readDocument(writeDocument(edit,format),format))).toBe(await Bun.file('fixtures/shacl/edited.ttl').text());expect(exportShaclTurtle(restored)).toBe(source);}
 expect(JSON.stringify(d)).toBe(snapshot);
},30000);
test('US-028 malformed paths remain recoverable but cannot be evaluated',()=>{
 const cases=[
 'ex:s sh:path "literal" .',
 'ex:s sh:path ex:p, ex:q .',
 'ex:s sh:path (ex:p) .',
 'ex:s sh:path [sh:alternativePath (ex:p)] .',
 'ex:s sh:path _:p . _:p sh:inversePath _:p .',
 'ex:s sh:path _:a . _:a sh:inversePath _:b . _:b sh:zeroOrMorePath _:a .',
 'ex:s sh:path _:a . _:a rdf:first ex:p ; rdf:rest _:a .',
 'ex:s sh:path _:a . _:a rdf:first ex:p,ex:q ; rdf:rest (ex:q) .',
 'ex:s sh:path _:a . _:a rdf:first ex:p ; rdf:rest (ex:q),rdf:nil .',
 'ex:s sh:path [sh:inversePath ex:p ; ex:annotation "unknown"] .',
 'ex:s sh:path [sh:__proto__ ex:p] .',
 'ex:s sh:path (ex:p ex:q) . rdf:nil rdf:first ex:q .',
 'ex:s sh:path [sh:alternativePath ()] .',
 ];
 for(const text of cases){const d=importShaclTurtle(prefix+text,options);expect(exportShaclTurtle(d)).toBe(prefix+text);expect(()=>getShaclPropertyPath(d,iri('s'))).toThrow();}
 const named=importShaclTurtle(prefix+'ex:s sh:path _:a . _:a rdf:first ex:p ; rdf:rest ex:cell . ex:cell rdf:first ex:q ; rdf:rest rdf:nil .',options);expect(getShaclPropertyPath(named,iri('s'))).toEqual({kind:'sequence',paths:[{kind:'predicate',iri:baseIRI+'p'},{kind:'predicate',iri:baseIRI+'q'}]});
 const alt=importShaclTurtle(prefix+'ex:s sh:path [sh:alternativePath ex:cell] . ex:cell rdf:first ex:p ; rdf:rest (ex:q) .',options);expect(getShaclPropertyPath(alt,iri('s')).kind).toBe('alternative');
 const duplicate=importShaclTurtle(prefix+'ex:s sh:path _:a . _:a sh:inversePath ex:p . _:a sh:inversePath ex:p .',options);expect(getShaclPropertyPath(duplicate,iri('s')).kind).toBe('inverse');
});
test('US-028 unknown encoding, scopes, copied values and atomic rejection',()=>{
 const source=prefix+'ex:s sh:path [sh:inversePath ex:p] . ex:s ex:future "preserved" .',d=importShaclTurtle(source,options),snapshot=JSON.stringify(d);
 expect(()=>proposeShaclQuadEdit(d,999,getShaclQuads(d)[0]!)).toThrow();expect(()=>proposeShaclQuadEdit(d,0,{...getShaclQuads(d)[0]!,graph:iri('g')})).toThrow();expect(JSON.stringify(d)).toBe(snapshot);
 const unknown=structuredClone(d);(unknown.modules[0]!.elements[0]!.extensions['umf.shacl'] as any).future={meaning:'retain'};
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(unknown,format),format);expect(restored).toEqual(unknown);expect(()=>exportShaclTurtle(restored)).toThrow();expect(()=>getShaclPropertyPath(restored,iri('s'))).toThrow();}
 const data=importRdfTurtle(prefix+'_:local ex:p "value" .',{id:'data',baseIRI}),focus={kind:'literal' as const,value:'value',datatype:'http://www.w3.org/2001/XMLSchema#string'};
 const found=evaluateShaclPropertyPath(d,iri('s'),data,focus);expect(found).toEqual([getRdfQuads(data)[0]!.subject]);found[0]!.value='changed';expect(evaluateShaclPropertyPath(d,iri('s'),data,focus)).not.toEqual(found);
 const named=importRdfTriG(prefix+'ex:g {}',{id:'data',baseIRI});expect(()=>evaluateShaclPropertyPath(d,iri('s'),named,iri('a'))).toThrow();
 expect(()=>evaluateShaclPropertyPath(d,iri('s'),data,{kind:'iri',value:'bad iri'})).toThrow();
});
test('US-028 bounded recursive structure and expensive finite traversal fail without mutation',()=>{
 const deep=importShaclTurtle(prefix+'ex:s sh:path '+'[sh:inversePath '.repeat(130)+'ex:p'+']'.repeat(130)+' .',options),snapshot=JSON.stringify(deep);expect(()=>getShaclPropertyPath(deep,iri('s'))).toThrow('limit');expect(JSON.stringify(deep)).toBe(snapshot);
 const shapes=importShaclTurtle(prefix+'ex:s sh:path ('+Array(200).fill('ex:p').join(' ')+') .',options),data=importRdfTurtle(prefix+'ex:a ex:p ex:a . '+Array.from({length:5500},(_,i)=>'ex:n'+i+' ex:q ex:b .').join('\n'),{id:'large',baseIRI});
 expect(()=>evaluateShaclPropertyPath(shapes,iri('s'),data,iri('a'))).toThrow('limit');
},30000);
test('US-028 pinned official graph inventory and independent corpus evidence',async()=>{
 const {createHash}=await import('node:crypto'),manifest=await Bun.file('native/shacl/sources/manifest.json').json(),corpus=await Bun.file('fixtures/shacl/corpus-results.json').json(),oracle=await Bun.file('fixtures/shacl/corpus-oracle-results.json').json();
 expect(manifest.revision).toBe('fe6275b93fa4de7fc070d82ca8e14d633b2d25da');expect(manifest.files).toHaveLength(172);expect(corpus.revision).toBe(manifest.revision);expect(oracle.revision).toBe(manifest.revision);expect(corpus.cases).toHaveLength(150);expect(oracle.results).toHaveLength(150);
 for(const f of manifest.files)expect(createHash('sha256').update(new Uint8Array(await Bun.file('native/shacl/sources/'+f.path).arrayBuffer())).digest('hex')).toBe(f.sha256);
 let compiled=0;for(const c of corpus.cases){expect(c.path.includes('/tests/')).toBe(true);const source=await Bun.file(c.path).text();for(const e of c.exports)expect(await Bun.file(e.path).text()).toBe(source);for(const p of c.paths){expect(p.status).toBe('compiled');compiled++;}}
 expect(compiled).toBe(13);expect(oracle.results.every((r:any)=>r.formats.length===2&&r.formats.every((f:any)=>f.equal))).toBe(true);expect(oracle.results.flatMap((r:any)=>r.nativePaths)).toHaveLength(13);expect(oracle.results.flatMap((r:any)=>r.nativePaths).every((p:any)=>p.status==='compiled')).toBe(true);expect(oracle.claim).toContain('not validation report execution');
});
