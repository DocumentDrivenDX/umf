import {importShaclTurtle,exportShaclTurtle,getShaclQuads,getShaclPropertyPath,evaluateShaclPropertyPath,proposeShaclQuadEdit,importRdfTurtle,writeDocument,readDocument} from '../src';
const source=await Bun.file('native/shacl/paths.ttl').text(),dataSource=await Bun.file('native/shacl/data.ttl').text(),baseIRI='https://example.org/';
const d=importShaclTurtle(source,{id:'shapes',baseIRI}),data=importRdfTurtle(dataSource,{id:'data',baseIRI}),results=[];
for(const name of ['predicate','inverse','sequence','alternative','star','plus','optional','inverseSequence','nested','doubleInverse','inverseStar','nullablePlus','sequenceWithAnnotation'])for(const focusName of ['a','b','d','missing']){
 const shape={kind:'iri' as const,value:baseIRI+name},focus={kind:'iri' as const,value:baseIRI+focusName};
 results.push({name,focus:focusName,path:getShaclPropertyPath(d,shape),values:evaluateShaclPropertyPath(d,shape,data,focus)});
}
for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);await Bun.write('fixtures/shacl/'+format+'.ttl',exportShaclTurtle(restored));}
const index=getShaclQuads(d).findIndex(q=>q.predicate.value==='http://www.w3.org/ns/shacl#minCount'),replacement=getShaclQuads(d)[index]!;replacement.object={kind:'literal',value:'2',datatype:'http://www.w3.org/2001/XMLSchema#integer'};
const edited=proposeShaclQuadEdit(d,index,replacement).document;await Bun.write('fixtures/shacl/edited.ttl',exportShaclTurtle(edited));
await Bun.write('fixtures/shacl/results.json',JSON.stringify({version:'SHACL 1.0 (2017)',baseIRI,results},null,2)+'\n');console.log({paths:13,cases:results.length});
