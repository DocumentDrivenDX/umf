import {test,expect} from 'bun:test';
import {importIcebergSchema,exportIcebergSchema,inspectIceberg,getIcebergNode,proposeIcebergNodeEdit,readDocument,writeDocument,ICEBERG_EXTENSION} from '../../src';
const base='fixtures/iceberg/',m=await Bun.file(base+'manifest.json').json();
test('US-020-AC1: recursive schema shapes and exact source tokens round trip in both UMF formats',async()=>{
 for(const c of m.cases){const raw=await Bun.file(c.path).text();if(!c.umfValid){expect(()=>importIcebergSchema(raw,{id:c.id})).toThrow();continue;}const d=importIcebergSchema(raw,{id:c.id});expect(inspectIceberg(d).valid).toBe(true);for(const f of ['json','yaml'] as const)expect(exportIcebergSchema(readDocument(writeDocument(d,f),f))).toBe(exportIcebergSchema(d));}
 const d=importIcebergSchema(await Bun.file(base+'exact-defaults.json').text(),{id:'exact'});expect(exportIcebergSchema(d)).toContain('9223372036854775807');expect(exportIcebergSchema(d)).toContain('9007199254740993');expect(exportIcebergSchema(d)).toContain('__proto__');expect(inspectIceberg(d).diagnostics.some(x=>x.code==='ICEBERG_UNKNOWN')).toBe(true);
});
test('US-020-AC2: unknown representation fields remain in UMF and cannot silently export',async()=>{
 const d=importIcebergSchema(await Bun.file(base+'nested.json').text(),{id:'unknown'}),p=d.modules[0]!.elements[0]!.extensions[ICEBERG_EXTENSION] as any;p.future={meaning:'retained'};for(const f of ['json','yaml'] as const){const roundtrip=readDocument(writeDocument(d,f),f);expect(roundtrip).toEqual(d);expect(()=>exportIcebergSchema(roundtrip)).toThrow();}
});
test('US-020-AC3: copied access and atomic nested edits preserve IDs and reject invalid candidates',async()=>{
 const d=importIcebergSchema(await Bun.file(base+'nested.json').text(),{id:'edit'}),raw=exportIcebergSchema(d),n=getIcebergNode(d,'/fields/1/type/fields/0/name');if(n.kind==='string')n.value='mutated';expect(exportIcebergSchema(d)).toBe(raw);const changed=proposeIcebergNodeEdit(d,'/fields/1/type/fields/0/name','"renamed"');expect(getIcebergNode(changed.document,'/fields/1/type/fields/0/id')).toEqual({kind:'number',value:'3'});expect(getIcebergNode(changed.document,'/identifier-field-ids')).toEqual(getIcebergNode(d,'/identifier-field-ids'));expect(exportIcebergSchema(d)).toBe(raw);expect(()=>proposeIcebergNodeEdit(d,'/fields/1/type/fields/0/id','1')).toThrow();expect(()=>proposeIcebergNodeEdit(d,'/fields/0/required','false')).toThrow();expect(exportIcebergSchema(d)).toBe(raw);
});
