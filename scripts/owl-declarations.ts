import {importOwlTurtle,exportOwlTurtle,getOwlDeclarations,getOwlQuads,proposeOwlQuadEdit,readDocument,writeDocument} from '../src';
const cases=[];
for(const file of ['declarations.ttl','authored.ttl','primer-corrected.ttl']){
 const input=await Bun.file('native/owl/'+file).text();
 const original=importOwlTurtle(input,{id:file,baseIRI:'https://example.org/',blankNodeScope:'declarations'});
 const first=getOwlDeclarations(original).declarations[0];if(!first)throw Error('Expected a declaration in '+file);
 const editIndex=first.quadIndexes[0]!,qs=getOwlQuads(original);
 const edited=proposeOwlQuadEdit(original,editIndex,{...qs[editIndex]!,subject:{kind:'iri',value:'https://example.org/EditedDeclaration'}}).document;
 for(const variant of ['original','edited'] as const)for(const format of ['json','yaml'] as const){
  const source=variant==='original'?original:edited,restored=readDocument(writeDocument(source,format),format),view=getOwlDeclarations(restored);
  if(exportOwlTurtle(original)!==input)throw Error('Original source mutated');
  cases.push({file,variant,format,input,editIndex:variant==='edited'?editIndex:null,text:exportOwlTurtle(restored),view});
 }
}
await Bun.write('fixtures/owl/declarations.json',JSON.stringify({scope:'Explicit RDF declaration roles; no OWL validity or entailment',cases},null,2)+'\n');
console.log({cases:cases.length});
