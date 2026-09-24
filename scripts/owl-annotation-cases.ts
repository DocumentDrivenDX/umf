import {importOwlTurtle,getOwlAxiomAnnotations,writeDocument,readDocument,exportOwlTurtle} from '../src';
const p='@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix ex: <https://example.org/> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . ';
const cases=[
 {id:'blank-match',triple:'_:s ex:p _:o .',fields:'owl:annotatedSource _:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget _:o',roots:1,malformed:0},
 {id:'blank-different',triple:'_:s ex:p _:o .',fields:'owl:annotatedSource _:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget _:other',roots:0,malformed:0},
 {id:'language-case',triple:'ex:s ex:p "word"@EN .',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget "word"@en',roots:1,malformed:0},
 {id:'language-different',triple:'ex:s ex:p "word"@en .',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget "word"@de',roots:0,malformed:0},
 {id:'datatype-different',triple:'ex:s ex:p "1"^^xsd:integer .',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget "1"^^xsd:decimal',roots:0,malformed:0},
 {id:'lexical-different',triple:'ex:s ex:p "01"^^xsd:integer .',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget "1"^^xsd:integer',roots:0,malformed:0},
 {id:'duplicates',triple:'ex:s ex:p ex:o . ex:s ex:p ex:o .',fields:'owl:annotatedSource ex:s,ex:s ; owl:annotatedProperty ex:p,ex:p ; owl:annotatedTarget ex:o,ex:o',roots:1,malformed:0},
 {id:'source-missing',fields:'owl:annotatedProperty ex:p ; owl:annotatedTarget ex:o',roots:0,malformed:1},
 {id:'source-multiple',fields:'owl:annotatedSource ex:s,ex:t ; owl:annotatedProperty ex:p ; owl:annotatedTarget ex:o',roots:0,malformed:1},
 {id:'source-literal',fields:'owl:annotatedSource "s" ; owl:annotatedProperty ex:p ; owl:annotatedTarget ex:o',roots:0,malformed:1},
 {id:'property-blank',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty _:p ; owl:annotatedTarget ex:o',roots:0,malformed:1},
 {id:'property-multiple',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p,ex:q ; owl:annotatedTarget ex:o',roots:0,malformed:1},
 {id:'target-missing',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p',roots:0,malformed:1},
 {id:'target-multiple',fields:'owl:annotatedSource ex:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget ex:o,ex:other',roots:0,malformed:1},
 {id:'two-types',fields:'a owl:Annotation ; owl:annotatedSource ex:s ; owl:annotatedProperty ex:p ; owl:annotatedTarget ex:o',roots:0,malformed:1},
];
const results=[];
for(const c of cases){const raw=p+(c.triple??'ex:s ex:p ex:o .')+' _:axiom a owl:Axiom ; '+c.fields+' ; ex:note "keep" .';await Bun.write('native/owl/annotation-cases/'+c.id+'.ttl',raw+'\n');const doc=importOwlTurtle(raw,{id:c.id,baseIRI:'https://example.org/',blankNodeScope:c.id});for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format),v=getOwlAxiomAnnotations(restored,0);if(v.roots.length!==c.roots||v.malformed.length!==c.malformed||exportOwlTurtle(v.source)!==raw)throw Error(c.id+' differs');results.push({id:c.id,format,roots:v.roots.length,malformed:v.malformed.length,assertedOccurrences:v.records[0]?.assertedQuadIndexes.length??0,sourcePreserved:true});}}
await Bun.write('fixtures/owl/annotation-case-results.json',JSON.stringify(results,null,2)+'\n');console.log({cases:cases.length,recoveries:results.length});
