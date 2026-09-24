import {importOwlTurtle,exportOwlTurtle,getOwlListAxioms,getOwlQuads,proposeOwlQuadEdit,readDocument,writeDocument} from '../src';
const cases=[];
for(const file of ['list-axioms.ttl','authored.ttl','primer-corrected.ttl']){
 const input=await Bun.file('native/owl/'+file).text(),original=importOwlTurtle(input,{id:file,baseIRI:'https://example.org/',blankNodeScope:'lists'}),v=getOwlListAxioms(original);
 const editIndex=v.axioms[0]?.listQuadIndexes[0];if(editIndex===undefined)throw Error('Expected list axiom in '+file);
 const qs=getOwlQuads(original),edited=proposeOwlQuadEdit(original,editIndex,{...qs[editIndex]!,object:{kind:'iri',value:'https://example.org/EditedMember'}}).document;
 for(const variant of ['original','edited'] as const)for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(variant==='original'?original:edited,format),format),view=getOwlListAxioms(restored);
  if(exportOwlTurtle(original)!==input)throw Error('Source mutation');
  cases.push({file,variant,format,input,editIndex:variant==='edited'?editIndex:null,text:exportOwlTurtle(restored),view});
 }
}
await Bun.write('fixtures/owl/list-axioms.json',JSON.stringify({cases},null,2)+'\n');console.log({cases:cases.length});
