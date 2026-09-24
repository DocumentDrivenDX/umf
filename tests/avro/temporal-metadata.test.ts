import {test,expect} from 'bun:test';
import {importAvroSchema,getAvroFieldMetadata,exportAvroSchema,editAvroNode,writeDocument,readDocument} from '../../src';

test('CONTRACT-007 temporal core classification requires exact annotation and carrier',async()=>{
 const cases=[];
 for(const prefix of ['timestamp-','local-timestamp-'])for(const unit of ['millis','micros','nanos']){
  const logical=prefix+unit;
  for(const [suffix,type,annotation,expected] of [
   ['valid','long',logical,'timestamp'],
   ...['\n','\r','\u2028','\u2029',' ','\u0000'].map((ending,i)=>['suffix'+i,'long',logical+ending,null]),
   ['array','long',[logical],null],['wrong-carrier','int',logical,null],
  ] as const){
   const native={type:'record',name:'Temporal',fields:[{name:'value',type:{type,logicalType:annotation},'future.field':{intent:'preserve'}}]},source=JSON.stringify(native);
   const doc=importAvroSchema(source,{id:logical+'-'+suffix});
   expect(getAvroFieldMetadata(doc)[0]!.element.scalarType??null).toBe(expected);
   expect(doc.modules.find(m=>m.id==='avro.fields')!.elements[0]!.scalarType??null).toBe(expected);
   const exports=[];
   for(const format of ['json','yaml'] as const){
    const back=readDocument(writeDocument(doc,format),format),recovered=exportAvroSchema(back);
    expect(getAvroFieldMetadata(back)).toEqual(getAvroFieldMetadata(doc));expect(JSON.parse(recovered)).toEqual(native);
    exports.push({format,native:recovered});
   }
   cases.push({id:doc.id,source,expected,exports});
  }
 }
 const source=importAvroSchema(JSON.stringify({type:'record',name:'Editable',fields:[{name:'value',type:{type:'long',logicalType:'timestamp-micros'}}]}),{id:'editable'});
 source.modules[1]!.elements[0]!['future.metadata']={retained:true};
 expect(()=>editAvroNode(source,'/fields/0/type/logicalType',JSON.stringify('timestamp-micros\n'))).toThrow('All present semantics');
 expect(source.modules[1]!.elements[0]!['future.metadata']).toEqual({retained:true});expect(source.modules[1]!.elements[0]!.scalarType).toBe('timestamp');
 await Bun.write('fixtures/avro/temporal-metadata.json',JSON.stringify({cases},null,2)+'\n');
},30000);
