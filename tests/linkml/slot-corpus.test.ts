import {test,expect} from 'bun:test';
import {importLinkmlDocument,inspectLinkmlClassSlots,inspectLinkmlSlotValues,exportLinkmlDocument,readDocument,writeDocument,getLinkmlDocumentNode} from '../../src';
import {parseNativeJson} from '../../src/model/native-json';
const base='fixtures/linkml/slot-corpus/';
test('US-024-AC8: pinned local scalar induction matches every comparable native query',async()=>{
 const oracle=await Bun.file(base+'oracle-results.json').json(),audit=await Bun.file(base+'results.json').json(),coverage=await Bun.file('fixtures/linkml/class-slots/results.json').json();
 expect(oracle.cases.map((c:any)=>c.path)).toEqual(coverage.cases.map((c:any)=>c.path));expect(oracle.cases).toHaveLength(20);
 const counts:Record<string,number>={};let rejected=0;
 for(const c of oracle.cases){const raw=await Bun.file(c.path).text(),format=c.path.endsWith('.json')?'json':'yaml',d=importLinkmlDocument(raw,{id:c.path,format}),json=readDocument(writeDocument(d,'json'),'json'),yaml=readDocument(writeDocument(d,'yaml'),'yaml');expect(yaml).toEqual(json);expect(exportLinkmlDocument(json)).toBe(raw);expect(exportLinkmlDocument(yaml)).toBe(raw);
  if(c.status==='loader-rejected'){rejected++;continue;}
  const classes=getLinkmlDocumentNode(d,'/classes');expect(classes.kind).toBe('object');if(classes.kind==='object'){const queried=new Set(c.queries.map((q:any)=>q.className));for(const name of Object.keys(classes.members)){const membership=inspectLinkmlClassSlots(d,name);if(membership.slots.length||membership.status==='blocked')expect(queried.has(name)).toBe(true);}}
  for(const q of c.queries){if(q.status==='membership-blocked'){expect(inspectLinkmlClassSlots(json,q.className).status).toBe('blocked');counts['membership-blocked']=(counts['membership-blocked']??0)+1;continue;}
   const r=inspectLinkmlSlotValues(json,q.className,q.slotName);expect(exportLinkmlDocument(r.source)).toBe(raw);if(q.status==='induction-blocked'){expect(r.status).toBe('blocked');expect(r.fields).toEqual({});counts['induction-blocked']=(counts['induction-blocked']??0)+1;continue;}
   expect(r.status).toBe('resolved');expect(r.fields).toEqual(Object.fromEntries(Object.entries(q.encodedFields).map(([k,v])=>[k,parseNativeJson(v as string)])));expect(r.complete).toBe(false);counts.compared=(counts.compared??0)+1;
  }
 }
 expect(rejected).toBe(1);expect(counts).toEqual({compared:310,'membership-blocked':24,'induction-blocked':13});expect(counts).toEqual(audit.counts);
},300000);
