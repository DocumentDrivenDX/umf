import {test,expect} from 'bun:test';
import {importTableSpec,importTableSpecBundle,editTableSpecColumn,editTableSpecTable,exportTableSpec,exportTableSpecBundle,readDocument,writeDocument} from '../../src';
const string=(value:string)=>({kind:'string' as const,value});
test('CONTRACT-030 table edits repair native references and preserve monolithic/split sources',async()=>{
 const text='{"version":"1.0","table_name":"orders","description":"Original","primary_key":["id"],"context_column":"context","future":{"exact":9007199254740993},"columns":[{"name":"id","data_type":"INTEGER","nullable":false},{"name":"context","data_type":"TEXT","nullable":false}]}';
 const files={'table.yaml':'version: "1.0"\ntable_name: orders\ndescription: Original\nprimary_key: [id]\ncontext_column: context\nfuture: {exact: 9007199254740993}\ncolumns: [{name: shadowed, data_type: TEXT}]\n','columns/01-id.yaml':'column: {name: id, data_type: INTEGER, nullable: false}\nfutureSibling: retained\n','columns/02-context.yaml':'column: {name: context, data_type: TEXT, nullable: false}\n','notes.txt':'Keep exactly\n'},cases=[];
 for(const mode of ['monolithic','split'] as const){
  const source=mode==='monolithic'?importTableSpec(text,{id:mode,format:'json'}):importTableSpecBundle(files,{id:mode});source.modules[0]!['consumer.metadata']={keep:true};source.modules[0]!.elements[0]!['consumer.field']={keep:true};const original=structuredClone(source);
  const renamed=editTableSpecColumn(editTableSpecColumn(source,0,{name:string('order_id')}),1,{name:string('tenant')});
  const changes={table_name:string('renamed_orders'),description:string("Edited customer's orders — 注文"),primary_key:{kind:'array' as const,items:[string('order_id')]},context_column:string('tenant')};
  const edited=editTableSpecTable(renamed,changes);expect(source).toEqual(original);expect(edited.modules[0]!.namespace).toBe('renamed_orders');expect(edited.modules[0]!['consumer.metadata']).toEqual({keep:true});expect(edited.modules[0]!.elements[0]!['consumer.field']).toEqual({keep:true});
  const exports=[];for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(edited,format),format);expect(back).toEqual(edited);
   if(mode==='monolithic'){const native=exportTableSpec(back);expect(native).toContain('9007199254740993');exports.push({format,text:native});}
   else{const bundle=exportTableSpecBundle(back);expect(bundle['notes.txt']).toBe(files['notes.txt']);expect(JSON.parse(bundle['table.yaml']!).columns).toEqual([{name:'shadowed',data_type:'TEXT'}]);expect(bundle['table.yaml']).toContain('9007199254740993');expect(JSON.parse(bundle['columns/01-id.yaml']!).futureSibling).toBe('retained');expect(importTableSpecBundle(bundle,{id:'back'}).modules[0]!.namespace).toBe('renamed_orders');exports.push({format,files:bundle});}
  }
  cases.push({mode,source,renamed,edited,changes,input:mode==='monolithic'?{text}:{files},unrepaired:mode==='monolithic'?{text:exportTableSpec(renamed)}:{files:exportTableSpecBundle(renamed)},exports});
 }
 // Editing table metadata alone must not rewrite any column or auxiliary file.
 const source=importTableSpecBundle(files,{id:'table-only'}),output=exportTableSpecBundle(editTableSpecTable(source,{description:string('Table-only edit')}));
 for(const [path,text] of Object.entries(files))if(path!=='table.yaml')expect(output[path]).toBe(text);
 expect(exportTableSpecBundle(source)).toEqual(files);
 // Separate native-valid controls from the opaque-field preservation cases above.
 for(const mode of ['monolithic','split'] as const){
  const cleanText=text.replace('"future":{"exact":9007199254740993},',''),cleanFiles={...files,'table.yaml':files['table.yaml'].replace('future: {exact: 9007199254740993}\n','')};
  const source=mode==='monolithic'?importTableSpec(cleanText,{id:'known-'+mode,format:'json'}):importTableSpecBundle(cleanFiles,{id:'known-'+mode});
  const renamed=editTableSpecColumn(editTableSpecColumn(source,0,{name:string('order_id')}),1,{name:string('tenant')}),changes:Record<string,import('../../src/model/native-json').NativeJson>=cases[0]!.changes,edited=editTableSpecTable(renamed,changes);
  const exports=(['json','yaml'] as const).map(format=>{const back=readDocument(writeDocument(edited,format),format);expect(back).toEqual(edited);return mode==='monolithic'?{format,text:exportTableSpec(back)}:{format,files:exportTableSpecBundle(back)};});
  cases.push({mode,source,renamed,edited,changes,input:mode==='monolithic'?{text:cleanText}:{files:cleanFiles},unrepaired:mode==='monolithic'?{text:exportTableSpec(renamed)}:{files:exportTableSpecBundle(renamed)},exports});
 }
 await Bun.write('fixtures/tablespec/table-edits.json',JSON.stringify({cases,scope:'Copied metadata edits, not full native validation or reference discovery; shadowed split content remains preserved.'},null,2)+'\n');
});
test('CONTRACT-030 table edits cannot replace column identities or bypass encoding guards',()=>{
 const source=importTableSpec('{"version":"1.0","table_name":"t","columns":[{"name":"a","data_type":"TEXT"}]}',{id:'guards',format:'json'}),before=structuredClone(source);
 for(const changes of [{columns:{kind:'array',items:[]}},{version:string('2.0')},{table_name:{kind:'null'}},null,[]])expect(()=>editTableSpecTable(source,changes as any)).toThrow();
 expect(source).toEqual(before);const stale=structuredClone(source);stale.modules[0]!.namespace='wrong';expect(()=>editTableSpecTable(stale,{description:string('x')})).toThrow('disagree');
 const unknown=structuredClone(source);(unknown.extensions!['umf.tablespec'] as any).root.future={keep:true};expect(()=>editTableSpecTable(unknown,{description:string('x')})).toThrow('Unknown');
});
