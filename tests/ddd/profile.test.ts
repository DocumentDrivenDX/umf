import {test,expect} from 'bun:test';
import {readDddDocument,writeDddDocument,inspectDdd,getDddDefinition,editDddDefinition,copyJson,type Document} from '../../src';
const input=await Bun.file('fixtures/ddd/sales.json').text();
const fresh=()=>JSON.parse(input) as Document;
const payload=(doc:Document,module:string,element:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===element)!.extensions['umf.ddd'] as any;
const understood=()=>{const doc=fresh();delete payload(doc,'sales','Order').invariants;return doc;};
test('US-005-AC1: complete DDD profile survives JSON/YAML with distinct contexts and opaque invariants',()=>{
 const doc=readDddDocument(input,'json');
 for(const format of ['json','yaml'] as const)expect(readDddDocument(writeDddDocument(doc,format),format)).toEqual(doc);
 expect(inspectDdd(doc).valid).toBe(true);expect(inspectDdd(doc).complete).toBe(false);
 expect(inspectDdd(doc).diagnostics.map(d=>d.code)).toEqual(['DDD_INVARIANT_OPAQUE']);
 expect(getDddDefinition(doc,'sales','Customer')).toEqual(getDddDefinition(doc,'support','Customer'));
 expect(doc.modules.map(m=>m.id)).toEqual(['sales','support','billing']);
 expect((doc.extensions!['umf.ddd'] as any).mappings[0].equivalence).toBe('partial');
 expect((doc.extensions!['umf.ddd'] as any).mappings[0].direction).toBe('source-to-target');
 const root=getDddDefinition(doc,'sales','Order') as any;root.identity.fields.push('not-an-id');
 expect((getDddDefinition(doc,'sales','Order') as any).identity.fields).toEqual(['order_id']);
});
test('US-005-AC2: semantic boundary corruptions fail independently of structural validity',()=>{
 const mutations:[string,(doc:Document)=>void][]=[
  ['DDD_IDENTITY',d=>payload(d,'sales','Order').identity.fields=['missing']],
  ['DDD_EQUALITY',d=>payload(d,'sales','Money').equality.fields=['amount']],
  ['DDD_REFERENCE',d=>payload(d,'sales','Order').fields.customer.type.target.element='missing'],
  ['DDD_BOUNDARY',d=>payload(d,'sales','Order').aggregate.members.push({module:'support',element:'Customer'})],
  ['DDD_BOUNDARY',d=>payload(d,'sales','Order').aggregate.members.push({module:'sales',element:'Order'})],
  ['DDD_OWNERSHIP',d=>payload(d,'sales','Customer').aggregate={members:[{module:'sales',element:'OrderLine'}]}],
  ['DDD_REPOSITORY',d=>payload(d,'sales','Orders').aggregate={module:'sales',element:'Money'}],
  ['DDD_INVARIANT',d=>payload(d,'sales','Order').invariants[0].references.push({module:'sales',element:'Customer'})],
  ['DDD_EVENT',d=>payload(d,'sales','OrderPlaced').emittedBy={module:'sales',element:'Money'}],
  ['DDD_MAPPING',d=>(d.extensions!['umf.ddd'] as any).mappings[0].limitations=[]],
  ['DDD_ACL',d=>(d.extensions!['umf.ddd'] as any).mappings[0].antiCorruptionLayer.ownerModule='billing'],
  ['DDD_TERM',d=>(d.modules[0]!.extensions!['umf.ddd'] as any).terms[0].concept.module='support']
 ];
 for(const[code,mutate]of mutations){const doc=fresh();mutate(doc);const checked=inspectDdd(doc);expect(checked.valid,code).toBe(false);expect(checked.diagnostics.some(d=>d.code===code),code).toBe(true);expect(()=>writeDddDocument(doc)).toThrow();}
});
test('US-005-AC3: unknown content and unproven equivalence survive but block conservative edits',()=>{
 const doc=understood();payload(doc,'sales','Money').future={opaque:[1,'x']};
 (doc.extensions!['umf.ddd'] as any).mappings[0].equivalence='asserted-equivalent';
 const returned=readDddDocument(writeDddDocument(doc));expect(returned).toEqual(doc);
 expect(inspectDdd(doc).diagnostics.map(d=>d.code)).toContain('DDD_UNKNOWN');
 expect(inspectDdd(doc).diagnostics.map(d=>d.code)).toContain('DDD_EQUIVALENCE_UNPROVEN');
 expect(()=>editDddDefinition(doc,'sales','Money',value=>value)).toThrow('validated');
 expect(()=>editDddDefinition(fresh(),'sales','Money',value=>value)).toThrow('validated');
});
test('US-005-AC4: fully understood semantic edits are atomic and do not change physical meaning',()=>{
 const doc=understood();expect(inspectDdd(doc).complete).toBe(true);
 const snapshot=copyJson(doc) as unknown as Document;
 const edited=editDddDefinition(doc,'sales','Money',value=>({...value,description:'Amount and currency form one equality value.'}));
 expect(doc).toEqual(snapshot);expect(getDddDefinition(edited,'sales','Money').description).toBe('Amount and currency form one equality value.');
 expect(()=>editDddDefinition(doc,'sales','Money',value=>({...value,equality:{fields:[]}}))).toThrow();
 expect(doc).toEqual(snapshot);
 expect(JSON.stringify(edited)).not.toContain('tableName');
});
