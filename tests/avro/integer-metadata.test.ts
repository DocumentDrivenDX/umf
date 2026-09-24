import {test,expect} from 'bun:test';
import {importAvroSchema,getAvroFieldMetadata,exportAvroSchema,proposeAvroNodeEdit,readDocument,writeDocument} from '../../src';
test('CONTRACT-007 decimal metadata never promotes rounded precision, scale or fixed size',async()=>{
 const cases=[];
 for(const key of ['precision','scale','size'])for(const token of ['1.0000000000000000001','1e-400','9007199254740993','-0','1.00e0']){
  const type={type:'fixed',name:'DecimalValue',size:4,logicalType:'decimal',precision:2,scale:1,[key]:'TOKEN'};
  const source=JSON.stringify({type:'record',name:'R',fields:[{name:'value',type},{name:'ref',type:'DecimalValue'},{name:'optional',type:['null','DecimalValue']}],future:'EXACT'}).replace('"TOKEN"',token).replace('"EXACT"','9007199254740993.123456789');
  const document=importAvroSchema(source,{id:key+token}),expected=token==='1.00e0'?['decimal','decimal','decimal']:[null,null,null];
  expect(getAvroFieldMetadata(document).map(f=>f.element.scalarType??null)).toEqual(expected);
  const exports=[];
  for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(document,format),format);expect(getAvroFieldMetadata(back).map(f=>f.element.scalarType??null)).toEqual(expected);const native=exportAvroSchema(back);expect(native).toContain(token);expect(native).toContain('9007199254740993.123456789');exports.push({format,native});}
  // Explicit candidate edits can carry unvalidated native qualifiers, but core
  // metadata must still remove a classification it can no longer substantiate.
  const edited=proposeAvroNodeEdit(document,'/fields/0/type/'+key,'1.0000000000000000001').document;
  expect(getAvroFieldMetadata(edited).every(f=>f.element.scalarType===undefined)).toBe(true);expect(getAvroFieldMetadata(document).map(f=>f.element.scalarType??null)).toEqual(expected);
  cases.push({source,document,expected,key,exports});
 }
 await Bun.write('fixtures/avro/integer-metadata.json',JSON.stringify({cases},null,2)+'\n');
});
