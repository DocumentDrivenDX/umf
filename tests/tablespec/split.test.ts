import {test,expect} from 'bun:test';
import {importTableSpecBundle,exportTableSpecBundle,exportTableSpec,editTableSpecColumn,editTableSpecTable,getTableSpecColumn,readDocument,writeDocument} from '../../src';
const files={
 'table.yaml':'version: "1.0"\ntable_name: t\nfuture: 9007199254740993\n',
 'columns/z.yaml':'column:\n  name: z\n  data_type: INTEGER\n  future: keep\n  derivation: {strategy: inline}\nderivation: {strategy: base_column}\nvalidations: []\nfutureSibling: true\n',
 'columns/a.yaml':'column: {name: a, data_type: VARCHAR, length: 80}\n',
 'expectations.yaml':'expectations: []\nfutureSuite: retained\n',
 'notes.txt':'opaque future file\n',
};
test('CONTRACT-030 split bundle preserves every file and derives ordered columns',()=>{
 const d=importTableSpecBundle(files,{id:'split'});
 expect(d.modules[0]!.elements.map(e=>e.name)).toEqual(['a','z']);
 for(const format of ['json','yaml'] as const)expect(exportTableSpecBundle(readDocument(writeDocument(d,format),format))).toEqual(files);
 expect(()=>exportTableSpec(d)).toThrow('split-file semantics');
 expect(getTableSpecColumn(d,1)).toMatchObject({members:{derivation:{members:{strategy:{value:'base_column'}}}}});
 const edited=editTableSpecColumn(d,1,{data_type:{kind:'string',value:'DECIMAL'},precision:{kind:'number',value:'18'},scale:{kind:'number',value:'4'},derivation:{kind:'object',members:{strategy:{kind:'string',value:'primary_key'}}}});
 const output=exportTableSpecBundle(edited);expect(exportTableSpecBundle(d)).toEqual(files);
 for(const p of Object.keys(files).filter(p=>p!=='columns/z.yaml'))expect(output[p]).toBe(files[p as keyof typeof files]);
 expect(JSON.parse(output['columns/z.yaml']!)).toMatchObject({futureSibling:true,validations:[],column:{future:'keep',derivation:{strategy:'inline'}},derivation:{strategy:'primary_key'}});
 expect(importTableSpecBundle(output,{id:'again'}).modules[0]!.elements[1]!.scalarType).toBe('decimal');
 for(const format of ['json','yaml'] as const)expect(exportTableSpecBundle(readDocument(writeDocument(edited,format),format))).toEqual(output);
});
test('CONTRACT-030 split bundle rejects ambiguous or unmapped changes',()=>{
 for(const path of ['../x','/absolute','columns/../x','columns\\x','./x'])expect(()=>importTableSpecBundle({...files,[path]:'x'},{id:'bad'})).toThrow('relative');
 expect(()=>importTableSpecBundle({'table.yaml':files['table.yaml']},{id:'bad'})).toThrow('at least one');
 expect(()=>importTableSpecBundle({...files,'columns/b.yaml':'column: {name: a, data_type: TEXT}'},{id:'bad'})).toThrow('Duplicate');
 const d=importTableSpecBundle(files,{id:'split'});
 expect(()=>editTableSpecTable(d,{columns:{kind:'array',items:[]}})).toThrow('cannot replace columns');
 expect(()=>editTableSpecTable(d,{version:{kind:'string',value:'2.0'}})).toThrow('version 1.0');
});
test('CONTRACT-030 filenames follow native Unicode code-point order',()=>{
 const d=importTableSpecBundle({'table.yaml':files['table.yaml'],'columns/𐀀.yaml':'column: {name: astral, data_type: INTEGER}','columns/\uE000.yaml':'column: {name: bmp, data_type: INTEGER}'},{id:'unicode'});
 expect(d.modules[0]!.elements.map(e=>e.name)).toEqual(['bmp','astral']);
});
