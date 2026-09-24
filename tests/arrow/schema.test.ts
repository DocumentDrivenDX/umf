import {test,expect} from 'bun:test';
import {importArrowSchema,exportArrowSchema,getArrowNode,proposeArrowNodeEdit,inspectArrow,readDocument,writeDocument} from '../../src';
const cases=await Bun.file('fixtures/arrow/schema-cases.json').json();
test('US-016-AC1: every authored Arrow schema survives exact UMF JSON/YAML round trips',()=>{
 for(const c of cases){const doc=importArrowSchema(JSON.stringify(c.input),{id:c.id});expect(inspectArrow(doc).complete).toBe(false);for(const format of ['json','yaml'] as const)expect(exportArrowSchema(readDocument(writeDocument(doc,format),format))).toBe(exportArrowSchema(doc));}
},20000);
test('US-016-AC2: duplicates, unknown fields/types and exact dictionary IDs stay authoritative',()=>{
 const text='{"fields":[{"name":"future","nullable":true,"type":{"name":"future_type","parameter":9007199254740993},"dictionary":{"id":9223372036854775807},"metadata":[{"key":"same","value":"first"},{"key":"same","value":"last"}]}],"extra":9007199254740993.1}';
 const doc=importArrowSchema(text,{id:'future'});expect(exportArrowSchema(doc)).toContain('9223372036854775807');expect(exportArrowSchema(doc)).toContain('9007199254740993.1');expect(inspectArrow(doc).diagnostics.some(d=>d.code==='ARROW_UNKNOWN_TYPE')).toBe(true);expect(inspectArrow(doc).diagnostics.some(d=>d.code==='ARROW_DUPLICATE_METADATA')).toBe(true);
 const edit=proposeArrowNodeEdit(doc,'/fields/0/name','"changed"');expect(getArrowNode(doc,'/fields/0/name')).toEqual({kind:'string',value:'future'});expect(getArrowNode(edit.document,'/fields/0/name')).toEqual({kind:'string',value:'changed'});expect(edit.validation.complete).toBe(false);
 expect(exportArrowSchema(readDocument(writeDocument(edit.document,'yaml'),'yaml'))).toBe(exportArrowSchema(edit.document));
 (doc.modules[0]!.elements[0]!.extensions['umf.arrow'] as any).future={keep:true};expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>exportArrowSchema(doc)).toThrow('Unknown representation');
});
test('US-016-AC3: known inconsistent shape parameters reject without claiming full native validation',()=>{
 for(const type of [{name:'int',bitWidth:7,isSigned:true},{name:'time',unit:'NANOSECOND',bitWidth:32},{name:'decimal',bitWidth:32,precision:20,scale:0},{name:'list'}])expect(()=>importArrowSchema(JSON.stringify({fields:[{name:'bad',nullable:true,type}]}),{id:'bad'})).toThrow();
});
test('US-016-AC3: maps and run-end child layouts retain their native distinctions',()=>{
 const leaf={name:'value',nullable:true,type:{name:'utf8'}};
 const map={fields:[{name:'map',nullable:true,type:{name:'map',keysSorted:false},children:[{name:'entries',nullable:false,type:{name:'struct'},children:[{...leaf,name:'key',nullable:false},leaf]}]}]};
 expect(inspectArrow(importArrowSchema(JSON.stringify(map),{id:'map'})).valid).toBe(true);
 map.fields[0]!.children[0]!.children[0]!.nullable=true;expect(()=>importArrowSchema(JSON.stringify(map),{id:'bad-map'})).toThrow();
 const run={fields:[{name:'runs',nullable:true,type:{name:'runendencoded'},children:[{name:'run_ends',nullable:false,type:{name:'int',bitWidth:16,isSigned:true}},leaf]}]};
 expect(inspectArrow(importArrowSchema(JSON.stringify(run),{id:'runs'})).valid).toBe(true);
 run.fields[0]!.children[0]!.nullable=true;expect(()=>importArrowSchema(JSON.stringify(run),{id:'bad-runs'})).toThrow();
});
test('US-016-AC3: dictionary IDs validate exact tokens rather than rounded host numbers',()=>{
 for(const id of ['9223372036854775807.5','9223372036854775808','1e10000'])expect(()=>importArrowSchema('{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":'+id+'}}]}',{id:'bad-id'})).toThrow();
 const doc=importArrowSchema('{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e3}}]}',{id:'scientific'});expect(exportArrowSchema(doc)).toContain('1e3');
});
