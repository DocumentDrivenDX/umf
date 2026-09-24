import {test,expect} from 'bun:test';
import {importDeltaSchema,exportDeltaSchema,inspectDelta,getDeltaNode,proposeDeltaNodeEdit,readDocument,writeDocument} from '../../src';
test('US-018-AC1: Delta source cases preserve exact schema through JSON/YAML',async()=>{
 const base='fixtures/delta/',cases=await Bun.file(base+'cases.json').json();expect(cases.length).toBe(39);
 for(const c of cases){const text=await Bun.file(base+c.id+'.json').text();if(['missing-field-defaults','array-missing-nullability'].includes(c.id)){expect(()=>importDeltaSchema(text,{id:c.id})).toThrow();continue;}const doc=importDeltaSchema(text,{id:c.id});expect(inspectDelta(doc).complete).toBe(false);for(const f of ['json','yaml'] as const)expect(exportDeltaSchema(readDocument(writeDocument(doc,f),f))).toBe(text);}
},15000);
test('US-018-AC2: unknown metadata and representation fields never disappear silently',async()=>{
 const text=await Bun.file('fixtures/delta/metadata-unknown.json').text(),doc=importDeltaSchema(text,{id:'exact'});expect(exportDeltaSchema(doc)).toContain('9223372036854775808');const copied=getDeltaNode(doc,'/fields/0/metadata');if(copied.kind==='object')copied.members.future={kind:'null'};expect(exportDeltaSchema(doc)).toBe(text);
 const payload=doc.modules[0]!.elements[0]!.extensions['umf.delta'] as any;payload.future={keep:true};expect(()=>exportDeltaSchema(doc)).toThrow('Unknown representation');expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);
});
test('US-018-AC3: edits are atomic and keep source; shape failure rejects candidate',async()=>{
 const text=await Bun.file('fixtures/delta/nested.json').text(),doc=importDeltaSchema(text,{id:'edit'}),result=proposeDeltaNodeEdit(doc,'/fields/0/type/fields/0/type','"long"');expect(exportDeltaSchema(doc)).toBe(text);expect(getDeltaNode(result.document,'/fields/0/type/fields/0/type')).toEqual({kind:'string',value:'long'});expect(()=>proposeDeltaNodeEdit(doc,'/fields/0/nullable','"false"')).toThrow();expect(exportDeltaSchema(doc)).toBe(text);
});
