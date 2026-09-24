import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importOdcsDocument,exportOdcsDocument,inspectOdcsRelationships,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/odcs/relationship-schema.json';
const base='fixtures/odcs/relationships/',sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
test('US-023-AC5: relationship reports preserve source, atomic pairings and native shape discrepancies',async()=>{
 const corpus=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json(),check=createValidator(false).addSchema(core).compile(schema);
 expect(corpus.results).toHaveLength(9);expect(oracle.results.filter((r:any)=>r.nativeShapeValid)).toHaveLength(6);expect(sha(await Bun.file(corpus.upstreamPath).bytes())).toBe(corpus.upstreamSha256);expect(sha(await Bun.file('spec/extensions/odcs/native-3.2.0.json').bytes())).toBe(oracle.schemaSha256);
 for(const c of corpus.results){const raw=await Bun.file(base+c.id+'.json').text(),d=importOdcsDocument(raw,{id:c.id,format:'json'});expect(sha(raw)).toBe(c.sourceSha256);expect(sha(raw)).toBe(oracle.results.find((r:any)=>r.id===c.id).sha256);
 for(const f of ['json','yaml'] as const){const r=inspectOdcsRelationships(readDocument(writeDocument(d,f),f));expect(check(r)).toBe(true);expect(exportOdcsDocument(r.source)).toBe(raw);expect(r.status).toBe(c.expected);expect(r.complete).toBe(false);if(c.code)expect([...r.diagnostics,...r.relationships.flatMap(x=>x.diagnostics)].some(x=>x.code===c.code)).toBe(true);for(const row of r.relationships)if(row.status==='blocked')expect(row.pairs).toEqual([]);}
 expect(exportOdcsDocument(d)).toBe(raw);
 }
 const paired=inspectOdcsRelationships(importOdcsDocument(await Bun.file(base+'paired.json').text(),{id:'pairs',format:'json'}));expect(paired.relationships[0]!.pairs).toEqual([{fromPath:'/schema/2/properties/1',toPath:'/schema/1/properties/0'},{fromPath:'/schema/2/properties/2',toPath:'/schema/1/properties/2'}]);expect(paired.relationships[1]!.pairs).toEqual([{fromPath:'/schema/2/properties/1',toPath:'/schema/0/properties/0'}]);
},30000);
test('US-023-AC5: bounded traversal and unknown relationship semantics keep full source',async()=>{
 const raw=await Bun.file(base+'paired.json').text(),d=importOdcsDocument(raw,{id:'limited',format:'json'}),r=inspectOdcsRelationships(d,{maxRelationships:1});expect(r.status).toBe('blocked');expect(r.relationships).toHaveLength(1);expect(r.diagnostics.some(x=>x.code==='ODCS_RELATIONSHIP_LIMIT')).toBe(true);expect(exportOdcsDocument(r.source)).toBe(raw);r.source.id='changed';expect(d.id).toBe('limited');
 expect(()=>inspectOdcsRelationships(d,{maxRelationships:0})).toThrow();expect(()=>inspectOdcsRelationships(d,null as any)).toThrow();
 const bad=JSON.parse(raw);bad.schema[2].relationships[0].from=[];bad.schema[2].relationships[0].to=[];const empty=inspectOdcsRelationships(importOdcsDocument(JSON.stringify(bad),{id:'empty',format:'json'}));expect(empty.relationships[0]!.diagnostics.some(x=>x.code==='ODCS_RELATIONSHIP_ARITY')).toBe(true);
 bad.schema[2].relationships[0].from=Array(129).fill('orders.customer_id');bad.schema[2].relationships[0].to=Array(129).fill('customers.id');const wide=inspectOdcsRelationships(importOdcsDocument(JSON.stringify(bad),{id:'wide',format:'json'}));expect(wide.relationships[0]!.diagnostics.some(x=>x.code==='ODCS_RELATIONSHIP_LIMIT')).toBe(true);
});
