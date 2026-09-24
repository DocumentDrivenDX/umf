import {test,expect} from 'bun:test';
import {importTableSpec,exportTableSpec,getTableSpecColumn,editTableSpecColumn,inspectTableSpec,readDocument,writeDocument} from '../../src';
test('CONTRACT-030 TableSpec ingestion exposes core scalars and preserves contextual and unknown native metadata',async()=>{
 const source=await Bun.file('native/tablespec/sources/examples/providers.yaml').text(),d=importTableSpec(source,{id:'providers',format:'yaml'});
 expect(d.modules[0]!.elements[0]!.scalarType).toBe('string');expect(inspectTableSpec(d).complete).toBe(false);
 for(const format of ['json','yaml'] as const)expect(exportTableSpec(readDocument(writeDocument(d,format),format))).toBe(source);
 const raw='{"version":"1.0","table_name":"types","future":{"large":9007199254740993},"columns":'+JSON.stringify(['BOOLEAN','INTEGER','DECIMAL','FLOAT','VARCHAR','TEXT','CHAR','DATE','DATETIME','TIMESTAMP','EMBEDDING','FUTURE'].map((data_type,i)=>({name:'c'+i,data_type,nullable:{sales:false,support:true},precision:38,scale:9,dimension:3,future:'keep'})))+'}';
 const doc=importTableSpec(raw,{id:'types',format:'json'});expect(doc.modules[0]!.elements.map(e=>e.scalarType)).toEqual(['boolean','integer','decimal','float','string','string','string','date','timestamp','timestamp',undefined,undefined]);
 for(const format of ['json','yaml'] as const)expect(exportTableSpec(readDocument(writeDocument(doc,format),format))).toBe(raw);
 const c=getTableSpecColumn(doc,0);expect(c.kind).toBe('object');if(c.kind==='object'){expect(c.members.nullable?.kind).toBe('object');c.members.future={kind:'string',value:'changed'};}expect(exportTableSpec(doc)).toBe(raw);
 const stale=structuredClone(doc);stale.modules[0]!.elements[0]!.scalarType='integer';expect(()=>exportTableSpec(stale)).toThrow('disagree');expect(()=>getTableSpecColumn(doc,-1)).toThrow();
 const unknown=structuredClone(doc);(unknown.extensions!['umf.tablespec'] as any).futureEncoding=true;expect(readDocument(writeDocument(unknown,'yaml'),'yaml')).toEqual(unknown);expect(()=>exportTableSpec(unknown)).toThrow('Unknown');
});
test('CONTRACT-030 copied native edits synchronize scalar metadata and retain unknown content',()=>{
 const input='{"version":"1.0","table_name":"t","future":9007199254740993,"columns":[{"name":"a","data_type":"INTEGER","future":true},{"name":"b","data_type":"TEXT"}]}';
 const original=importTableSpec(input,{id:'edit',format:'json'});
 original.vocabularies['future.example']={version:'1.0.0'};
 original.modules[0]!.elements[0]!.extensions={'future.example':{keep:true}};
 const edited=editTableSpecColumn(original,0,{name:{kind:'string',value:'renamed'},data_type:{kind:'string',value:'DECIMAL'},precision:{kind:'number',value:'18'},scale:{kind:'number',value:'4'}});
 expect(exportTableSpec(original)).toBe(input);expect(edited.modules[0]!.elements[0]!.scalarType).toBe('decimal');
 expect(edited.modules[0]!.elements[0]!.extensions).toEqual({'future.example':{keep:true}});
 for(const format of ['json','yaml'] as const){const output=exportTableSpec(readDocument(writeDocument(edited,format),format));expect(output).toContain('9007199254740993');expect(JSON.parse(output).columns[0]).toEqual({name:'renamed',data_type:'DECIMAL',future:true,precision:18,scale:4});}
 const unknown=editTableSpecColumn(edited,0,{data_type:{kind:'string',value:'FUTURE'}});expect(unknown.modules[0]!.elements[0]!.scalarType).toBeUndefined();
 expect(()=>editTableSpecColumn(original,0,{name:{kind:'string',value:'b'}})).toThrow('Duplicate');
 expect(()=>editTableSpecColumn(original,0,{data_type:{kind:'null'}})).toThrow();
 expect(()=>editTableSpecColumn(original,9,{})).toThrow();
});
