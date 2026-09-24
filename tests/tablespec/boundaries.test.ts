import {test,expect} from 'bun:test';
import {importTableSpec,importTableSpecBundle,exportTableSpecBundle,editTableSpecColumn,editTableSpecTable,writeDocument,readDocument} from '../../src';
test('CONTRACT-030 edit mappings reject non-JSON inputs without evaluating accessors or mutating source',()=>{
 const source=importTableSpec('{"version":"1.0","table_name":"t","columns":[{"name":"id","data_type":"INTEGER"}]}',{id:'guards',format:'json'}),before=writeDocument(source,'json');let invoked=0;
 const getter=Object.defineProperty({},'description',{enumerable:true,get(){invoked++;return {kind:'string',value:'lost'};}});
 const hidden=Object.defineProperty({},'description',{value:{kind:'string',value:'hidden'}});
 const symbol={[Symbol('meaning')]:{kind:'string',value:'hidden'}};
 const custom=Object.create({meaning:'inherited'});
 const inputs=[null,[],false,42,'',getter,hidden,symbol,custom];
 for(const input of inputs)for(const edit of [(changes:any)=>editTableSpecColumn(source,0,changes),(changes:any)=>editTableSpecTable(source,changes)])expect(()=>edit(input)).toThrow();
 expect(invoked).toBe(0);expect(writeDocument(source,'json')).toBe(before);
 const magic=JSON.parse('{"__proto__":{"kind":"string","value":"native"},"constructor":{"kind":"string","value":"also native"}}');
 const result=editTableSpecColumn(source,0,magic);expect(writeDocument(result,'json')).toContain('also native');expect(writeDocument(source,'json')).toBe(before);
});
test('CONTRACT-030 split column suffixes match native glob and preserve unmatched files',async()=>{
 const paths=['columns/a.yaml','columns/b.yaml\n','columns/c.yaml\r','columns/d.yaml\u2028','columns/e.yaml\u2029','columns/f.yaml ','columns/g\n.yaml'];
 const files:Record<string,string>={'table.yaml':'version: "1.0"\ntable_name: t\n'};
 paths.forEach((p,i)=>files[p]=`column: {name: c${i}, data_type: INTEGER}\n`);
 const document=importTableSpecBundle(files,{id:'suffixes'});
 expect(document.modules[0]!.elements.map(e=>e.name)).toEqual(['c0','c6']);
 expect(exportTableSpecBundle(document)).toEqual(files);
 for(const format of ['json','yaml'] as const)expect(exportTableSpecBundle(readDocument(writeDocument(document,format),format))).toEqual(files);
 for(const path of paths.slice(1,6))expect(()=>importTableSpecBundle({'table.yaml':files['table.yaml']!,[path]:files[path]!},{id:'no-columns'})).toThrow('at least one');
 await Bun.write('fixtures/tablespec/boundaries.json',JSON.stringify({paths,files,document,selected:['columns/a.yaml','columns/g\n.yaml']},null,2)+'\n');
});
