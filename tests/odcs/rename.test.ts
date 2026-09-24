import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importOdcsDocument,exportOdcsDocument,proposeOdcsElementRename,inspectOdcsRelationships,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/odcs/rename-schema.json';
const base='fixtures/odcs/rename/',sha=(s:string)=>createHash('sha256').update(s).digest('hex');
test('US-023-AC6: renames preserve ordered endpoints and native evidence through both formats',async()=>{
 const raw=await Bun.file(base+'source.json').text(),d=importOdcsDocument(raw,{id:'rename',format:'json'}),vectors=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json(),check=createValidator(false).addSchema(core).compile(schema),pairs=(doc:typeof d)=>inspectOdcsRelationships(doc).relationships.map(r=>r.pairs),before=pairs(d);
 expect(sha(raw)).toBe(vectors.sourceSha256);expect(vectors.results).toHaveLength(4);expect(oracle.results).toHaveLength(8);
 for(const c of vectors.results){const r=proposeOdcsElementRename(d,c);expect(check(r)).toBe(true);expect(r.status).toBe('candidate');expect(r.complete).toBe(false);expect(r.changes).toEqual(c.changes);expect(r.changes.map(x=>x.path)).toEqual(c.paths);expect(r.diagnostics.some(x=>x.code==='ODCS_RENAME_CONTEXT')).toBe(true);
  for(const f of ['json','yaml'] as const){const candidate=readDocument(writeDocument(r.candidate!,f),f);expect(pairs(candidate)).toEqual(before);expect(sha(exportOdcsDocument(candidate,'json'))).toBe(oracle.results.find((x:any)=>x.id===c.id&&x.format===f).sha256);}
  expect(exportOdcsDocument(r.source)).toBe(raw);expect(exportOdcsDocument(d)).toBe(raw);
 }
},30000);
test('US-023-AC6: blocked rename is atomic and publishes neither candidate nor partial edits',async()=>{
 const raw=await Bun.file(base+'source.json').text(),d=importOdcsDocument(raw,{id:'blocked',format:'json'}),check=createValidator(false).addSchema(core).compile(schema);
 const collision=proposeOdcsElementRename(d,{reference:'schema/orders_obj/properties/order_customer_prop',name:'id'});expect(collision.status).toBe('blocked');expect(collision.candidate).toBeUndefined();expect(collision.changes).toEqual([]);expect(collision.diagnostics.some(x=>x.code==='ODCS_RENAME_COLLISION')).toBe(true);expect(check(collision)).toBe(true);
 const upstream=await Bun.file('native/odcs/sources/docs/examples/references/relationships.odcs.yaml').text(),original=importOdcsDocument(upstream,{id:'upstream',format:'yaml'}),missing=proposeOdcsElementRename(original,{reference:'schema/orders_obj',name:'purchases'});expect(missing.status).toBe('blocked');expect(missing.candidate).toBeUndefined();expect(missing.changes).toEqual([]);expect(exportOdcsDocument(missing.source)).toBe(upstream);expect(check(missing)).toBe(true);
 expect(()=>proposeOdcsElementRename(d,{reference:'schema/orders_obj',name:'has.dot'})).toThrow();expect(exportOdcsDocument(d)).toBe(raw);
 const unchanged=proposeOdcsElementRename(d,{reference:'schema/orders_obj',name:'orders'});expect(unchanged.changes).toEqual([]);expect(exportOdcsDocument(unchanged.candidate!)).toBe(raw);
});
