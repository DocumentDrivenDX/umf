import {test,expect} from 'bun:test';
import {importAvroSchema,getAvroFieldMetadata,exportAvroSchema,editAvroNode,writeDocument,readDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/avro/field-metadata.schema.json';
const types:any[]=['boolean','int','long','float','double','string','bytes',['null','long'],['int','long'],['int','string'],{type:'array',items:'int'},{type:'map',values:'string'},{type:'int',logicalType:'date'},{type:'int',logicalType:'time-millis'},{type:'long',logicalType:'time-micros'},{type:'long',logicalType:'timestamp-nanos'},{type:'long',logicalType:'local-timestamp-micros'},{type:'bytes',logicalType:'decimal',precision:18,scale:4},{type:'fixed',name:'D',size:4,logicalType:'decimal',precision:9,scale:2},'D',{type:'fixed',name:'Raw',size:4},{type:'enum',name:'E',symbols:['A','B']},{type:'bytes',logicalType:'future'},{type:'bytes',logicalType:'decimal',precision:2,scale:3},{type:'fixed',name:'BadDecimal',size:1,logicalType:'decimal',precision:3},'null'];
const expected=['boolean','integer','integer','float','float','string','binary','integer','integer',null,null,null,'date','time','time','timestamp','timestamp','decimal','decimal','decimal','binary','string',null,null,null,null];
test('CONTRACT-007 core scalar metadata retains Avro field semantics',async()=>{
 const source=JSON.stringify({type:'record',name:'Fields',namespace:'example',fields:types.map((type,i)=>({name:'f'+i,type,...(i===1?{default:2,doc:'reader default'}:{})}))});
 const doc=importAvroSchema(source,{id:'fields'}),view=getAvroFieldMetadata(doc);
 expect(createValidator().compile(schema)(view)).toBe(true);
 expect(view.map(f=>f.element.scalarType??null)).toEqual(expected);
 expect(doc.modules.find(m=>m.id==='avro.fields')!.elements).toEqual(view.map(f=>f.element));
 expect(view[1]!.nativeField).toMatchObject({members:{default:{value:'2'}}});
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(getAvroFieldMetadata(back)).toEqual(view);expect(JSON.parse(exportAvroSchema(back))).toEqual(JSON.parse(source));}
 view[1]!.element.scalarType='binary';expect(getAvroFieldMetadata(doc)[1]!.element.scalarType).toBe('integer');
 const stale=structuredClone(doc);stale.modules[1]!.elements[1]!.scalarType='binary';expect(()=>exportAvroSchema(stale)).toThrow('disagree');
 await Bun.write('fixtures/avro/field-metadata.json',JSON.stringify({source,expected,view:getAvroFieldMetadata(doc),exports:['json','yaml'].map(format=>({format,native:exportAvroSchema(readDocument(writeDocument(doc,format as 'json'|'yaml'),format as 'json'|'yaml'))}))},null,2)+'\n');
});
test('CONTRACT-007 nested records, namespaces and dependency fields retain source paths',()=>{
 const doc=importAvroSchema(JSON.stringify({type:'record',name:'Root',namespace:'a',fields:[{name:'child',type:{type:'record',name:'Inner',fields:[{name:'value',type:'int'},{name:'next',type:['null','Inner']}] }},{name:'foreign',type:'b.Token'}]}),{id:'nested',dependencies:[{id:'dep',schema:JSON.stringify({type:'fixed',name:'Token',namespace:'b',size:8})}]});
 const fields=getAvroFieldMetadata(doc);
 expect(fields.map(f=>[f.record,f.path,f.element.scalarType??null])).toEqual([['a.Root','/fields/0',null],['a.Inner','/fields/0/type/fields/0','integer'],['a.Inner','/fields/0/type/fields/1',null],['a.Root','/fields/1','binary']]);
 const edited=editAvroNode(doc,'/fields/0/type/fields/0/type','"string"');
 expect(edited.modules[1]!.elements[1]!.scalarType).toBe('string');expect(doc.modules[1]!.elements[1]!.scalarType).toBe('integer');
});
test('CONTRACT-007 edits cannot silently reassociate attached field metadata',()=>{
 const doc=importAvroSchema('{"type":"record","name":"R","fields":[{"name":"a","type":"int"},{"name":"b","type":"string"}]}',{id:'attached'});
 doc.modules[1]!.elements[0]!.references=[{role:'source',module:'schema',element:'schema'}];
 expect(()=>editAvroNode(doc,'/fields','[{"name":"b","type":"string"},{"name":"a","type":"int"}]')).toThrow('reassociation');
 expect(()=>editAvroNode(doc,'/fields','[]')).toThrow('discard attached');
 const edited=editAvroNode(doc,'/fields/0/type','"long"');expect(edited.modules[1]!.elements[0]!.references).toEqual(doc.modules[1]!.elements[0]!.references);
});
