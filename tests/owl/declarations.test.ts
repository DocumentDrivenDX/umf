import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {importOwlTurtle,exportOwlTurtle,getOwlDeclarations,getOwlQuads,proposeOwlQuadEdit,readDocument,writeDocument} from '../../src';
test('US-029 explicit declarations preserve roles, occurrences and unknown source through both formats',async()=>{
 const input=await Bun.file('native/owl/declarations.ttl').text(),doc=importOwlTurtle(input,{id:'decl',baseIRI:'https://example.org/',blankNodeScope:'decl-scope'});
 const ajv=new Ajv({strict:false});ajv.addSchema(await Bun.file('spec/core/schema.json').json());const check=ajv.compile(await Bun.file('spec/extensions/owl/declarations-schema.json').json());
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(doc,format),format),v=getOwlDeclarations(restored);
  expect(check(v)).toBe(true);expect(v.complete).toBe(false);expect(v.blankNodeScope).toBe('decl-scope');expect(v.declarations).toHaveLength(12);expect(v.anonymousTypeAssertions).toHaveLength(3);
  const shared=v.declarations.filter(d=>d.node.value==='https://example.org/Shared');expect(shared).toHaveLength(6);expect(new Set(shared.map(d=>d.kind)).size).toBe(6);
  expect(shared.find(d=>d.kind==='class')!.quadIndexes).toHaveLength(2);
  expect(v.declarations.every(d=>!['RdfsOnly','Opaque','UsedOnly','OtherUsedOnly','undeclaredProperty'].some(n=>d.node.value==='https://example.org/'+n))).toBe(true);
  for(const d of [...v.declarations,...v.anonymousTypeAssertions])for(const i of d.quadIndexes){expect(getOwlQuads(v.source)[i]!.subject).toEqual(d.node);}
  expect(exportOwlTurtle(v.source)).toBe(input);
  const order=v.declarations.find(d=>d.node.value==='https://example.org/Order')!,i=order.quadIndexes[0]!,qs=getOwlQuads(restored);
  const edited=proposeOwlQuadEdit(restored,i,{...qs[i]!,subject:{kind:'iri',value:'https://example.org/NewOrder'}}).document;
  expect(getOwlDeclarations(edited).declarations.some(d=>d.node.value==='https://example.org/NewOrder')).toBe(true);
  expect(getOwlDeclarations(edited).declarations.some(d=>d.node.value==='https://example.org/Order')).toBe(false);
  expect(exportOwlTurtle(restored)).toBe(input);
  v.declarations[0]!.node.value='urn:mutated';v.source.id='mutated';expect(getOwlDeclarations(restored).declarations[0]!.node.value).toBe('https://example.org/Shared');expect(restored.id).toBe('decl');
 }
 const unknown=structuredClone(doc);(unknown.modules[0]!.elements[0]!.extensions['umf.owl'] as any).future={retain:true};
 expect(readDocument(writeDocument(unknown,'yaml'),'yaml')).toEqual(unknown);expect(()=>getOwlDeclarations(unknown)).toThrow();
});
test('US-029 declaration corpus agrees with independent explicit RDF roles after recovery and edits',async()=>{
 const cases=(await Bun.file('fixtures/owl/declarations.json').json()).cases,oracle=(await Bun.file('fixtures/owl/declarations-oracle.json').json()).cases;expect(cases).toHaveLength(12);expect(oracle).toHaveLength(12);
 for(const [i,c] of cases.entries()){
  const original=importOwlTurtle(c.input,{id:c.file,baseIRI:'https://example.org/',blankNodeScope:'declarations'}),qs=getOwlQuads(original);
  const d=c.editIndex===null?original:proposeOwlQuadEdit(original,c.editIndex,{...qs[c.editIndex]!,subject:{kind:'iri',value:'https://example.org/EditedDeclaration'}}).document;
  const v=getOwlDeclarations(readDocument(writeDocument(d,c.format),c.format));expect(v).toEqual(c.view);expect(exportOwlTurtle(v.source)).toBe(c.text);expect(oracle[i].agrees).toBe(true);expect(oracle[i].editObserved).toBe(true);
  expect(oracle[i].named).toEqual(v.declarations.map(d=>[d.node.value,d.kind]).sort());expect(oracle[i].anonymousKinds).toEqual(v.anonymousTypeAssertions.map(d=>d.kind).sort());
 }
},20000);
