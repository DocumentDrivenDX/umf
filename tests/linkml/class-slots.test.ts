import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/linkml/class-slots-schema.json';
import {importLinkmlDocument,inspectLinkmlClassSlots,exportLinkmlDocument,readDocument,writeDocument} from '../../src';
const base='fixtures/linkml/class-slots/';
test('US-024-AC6: all pinned example/metamodel local memberships match native evidence',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).cases,oracle=(await Bun.file(base+'oracle-results.json').json()).results;
 const check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);let count=0,nativeCount=0;
 for(const c of cases){const raw=await Bun.file(c.path).text(),d=importLinkmlDocument(raw,{id:c.path,format:c.format}),native=oracle.find((x:any)=>x.path===c.path);
  for(const row of c.reports){const r=inspectLinkmlClassSlots(readDocument(writeDocument(d,row.format),row.format),row.report.className),{source,...report}=r;expect(report).toEqual(row.report);expect(check(r)).toBe(true);expect(exportLinkmlDocument(source)).toBe(raw);count++;
   if(native.comparison==='native'){const n=native.results.find((x:any)=>x.className===r.className&&x.format===row.format);if(n.comparison==='ordered-membership'){expect(r.ancestors).toEqual(n.ancestors);expect(r.slots.map(s=>s.name)).toEqual(n.slots);}else expect(r.status).toBe('blocked');nativeCount++;}
  }
 }
 expect(count).toBe(208);expect(nativeCount).toBe(206);expect(oracle.filter((x:any)=>x.comparison==='loader-rejected')).toHaveLength(1);
},60000);
test('US-024-AC6: repeated declarations retain pointers; usage is not membership; cycles terminate',async()=>{
 const raw=await Bun.file('native/linkml/examples/inheritance.json').text(),d=importLinkmlDocument(raw,{id:'inheritance',format:'json'}),r=inspectLinkmlClassSlots(d,'Child');
 expect(r.ancestors).toEqual(['Child','Mixin','Parent','Root','MixinBase']);expect(r.slots.map(s=>s.name)).not.toContain('not_a_member');
 expect(r.slots.find(s=>s.name==='child')!.declarations.map(x=>x.path)).toEqual(['/classes/Child/slots/0','/classes/Child/slots/2']);
 expect(r.slots.find(s=>s.name==='inline')!.declarations).toHaveLength(2);expect(inspectLinkmlClassSlots(d,'CycleA').ancestors).toEqual(['CycleA','CycleB']);expect(inspectLinkmlClassSlots(d,'Missing').slots).toEqual([]);
 r.source.id='changed';expect(d.id).toBe('inheritance');expect(exportLinkmlDocument(d)).toBe(raw);
});
test('US-024-AC6: malformed structure, future semantics and missing classes never appear resolved',()=>{
 for(const classes of [{C:{is_a:12}},{C:{mixins:'Parent'}},{C:{slots:'field'}},{C:{attributes:[]}},{C:{attributes:{x:{name:'other'}}}},{C:{name:'Other'}},{Other:{}}]){const d=importLinkmlDocument(JSON.stringify({id:'https://example.org/x',name:'x',classes}),{id:'x',format:'json'});expect(inspectLinkmlClassSlots(d,'C').status).toBe('blocked');}
 const d=importLinkmlDocument('{"id":"https://example.org/x","name":"x","classes":{"C":{}}}',{id:'x',format:'json',metamodelVersion:'future'});expect(inspectLinkmlClassSlots(d,'C').status).toBe('blocked');expect(()=>inspectLinkmlClassSlots(d,'')).toThrow();
});

test('US-024-AC6: unknown metadata and escaped declaration names remain intact',()=>{
 const raw=JSON.stringify({id:'https://example.org/x',name:'x',future:{shape:['uninterpreted']},classes:{'A/B':{attributes:{'x~y':{future:true}}}}}),d=importLinkmlDocument(raw,{id:'x',format:'json'}),r=inspectLinkmlClassSlots(d,'A/B');
 expect(r.slots[0]!.declarations[0]!.path).toBe('/classes/A~1B/attributes/x~0y');expect(exportLinkmlDocument(r.source)).toBe(raw);expect(r.complete).toBe(false);
});
