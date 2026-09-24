import {test,expect} from 'bun:test';
import {importOdcsDocument,exportOdcsDocument,resolveOdcsReference,proposeOdcsDocumentNodeEdit,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/odcs/reference-schema.json';
const base='fixtures/odcs/references/';
test('US-023-AC4: specification-derived local reference vectors preserve source and explicit boundaries',async()=>{
 const vectors=await Bun.file(base+'cases.json').json(),raw=await Bun.file(vectors.source).text(),d=importOdcsDocument(raw,{id:'refs',format:'yaml'}),check=createValidator(false).addSchema(core).compile(schema);
 for(const c of vectors.cases)for(const f of ['json','yaml'] as const){const r=resolveOdcsReference(readDocument(writeDocument(d,f),f),c);expect(check(r)).toBe(true);expect(exportOdcsDocument(r.source)).toBe(raw);expect(r.complete).toBe(false);if(c.target){expect(r.status).toBe('resolved');expect(r.target!.path).toBe(c.target);}else{expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();expect(r.diagnostics.some(x=>x.code===c.error)).toBe(true);}}
 expect(exportOdcsDocument(d)).toBe(raw);
});
test('US-023-AC4: stable IDs survive rename/reordering; duplicates and unknown versions block',()=>{
 const obj={apiVersion:'v3.2.0',schema:[{id:'urn:table:one',name:'first',properties:[{id:'address',name:'address',properties:[{id:'street',name:'street',future:{value:900}}]}]},{id:'second',name:'second',properties:[]}]};
 const d=importOdcsDocument(JSON.stringify(obj),{id:'identity',format:'json'}),options={reference:'schema/urn:table:one/properties/address/properties/street',usage:'foreignKey' as const};
 let r=resolveOdcsReference(d,options);expect(r.target!.path).toBe('/schema/0/properties/0/properties/0');
 const renamed=proposeOdcsDocumentNodeEdit(d,'/schema/0/properties/0/properties/0/name','"renamed"').document;
 expect(resolveOdcsReference(renamed,options).status).toBe('resolved');expect(resolveOdcsReference(renamed,{reference:'first.address.street',usage:'foreignKey'}).status).toBe('blocked');
 const reordered=proposeOdcsDocumentNodeEdit(d,'/schema',JSON.stringify([...obj.schema].reverse())).document;expect(resolveOdcsReference(reordered,options).target!.path).toBe('/schema/1/properties/0/properties/0');
 const duplicate=proposeOdcsDocumentNodeEdit(d,'/schema',JSON.stringify([obj.schema[0],obj.schema[0]])).document;expect(resolveOdcsReference(duplicate,options).diagnostics.some(x=>x.code==='ODCS_REFERENCE_AMBIGUOUS')).toBe(true);
 expect(resolveOdcsReference(proposeOdcsDocumentNodeEdit(d,'/apiVersion','"v3.1.0"').document,options).diagnostics.some(x=>x.code==='ODCS_REFERENCE_VERSION')).toBe(true);
 if(r.target!.node.kind==='object')r.target!.node.members={};r.source.id='changed';expect(exportOdcsDocument(d)).toBe(JSON.stringify(obj));expect(resolveOdcsReference(d,options).target!.node).not.toEqual(r.target!.node);
 expect(()=>resolveOdcsReference(d,{reference:'',usage:'element'})).toThrow();
});
