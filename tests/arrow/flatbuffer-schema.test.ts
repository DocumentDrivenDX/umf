import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/arrow/flatbuffer-model.schema.json';
import inventory from '../../spec/extensions/arrow/flatbuffer-inventory.json';
const validator=createValidator(false);validator.addSchema(schema);
const check=(name:string)=>validator.compile({$ref:schema.$id+'#/$defs/'+name});
test('Arrow FlatBuffer vocabulary: all native definitions and fields are described',()=>{
 for(const d of inventory.definitions){const rule=(schema.$defs as any)[d.name];expect(rule).toBeDefined();
  if('fields' in d){expect(Object.keys(rule.properties)).toEqual(d.fields!.map(f=>f.name));expect(check(d.name)({})).toBe(!d.fields!.some(f=>f.required));}
  else if(d.kind==='enum')for(const m of d.members!)expect(check(d.name)(m.name)).toBe(true);
 }
});
test('Arrow FlatBuffer vocabulary: exact signed int64 bounds and spelling',()=>{
 const valid=check('Int64');for(const n of ['0','1','-1','9007199254740993','9223372036854775807','-9223372036854775808'])expect(valid(n)).toBe(true);
 for(const n of ['9223372036854775808','-9223372036854775809','10000000000000000000','-0','00','+1','1.0','1e3',1])expect(valid(n)).toBe(false);
 for(let i=0;i<1000;i++){const n=(BigInt(i)*9223372036854775807n)/999n;expect(valid(n.toString())).toBe(true);expect(valid((-n).toString())).toBe(true);}
});
test('Arrow FlatBuffer vocabulary: required fields, union tags and precise IDs',()=>{
 const valid=validator.compile(schema);
 expect(valid({rootType:'Schema',value:{endianness:'Big',features:['COMPRESSED_BODY'],fields:[{name:'x',type:{type:'Int',value:{bitWidth:64,is_signed:true}},dictionary:{id:'9223372036854775807'},custom_metadata:[{key:'repeat',value:'a'},{key:'repeat',value:'b'}]}]}})).toBe(true);
 expect(valid({rootType:'Message',value:{version:'V5',header:{type:'RecordBatch',value:{length:'3',nodes:[{length:'3',null_count:'1'}],buffers:[{offset:'0',length:'16'}],variadicBufferCounts:['2']}}}})).toBe(true);
 for(const value of [{rootType:'Tensor',value:{type:{type:'NONE'},shape:[],data:{offset:'0',length:'0'}}},{rootType:'Tensor',value:{}},{rootType:'Schema',value:{endianness:'Middle'}},{rootType:'Message',value:{header:{type:'Schema',value:{features:['NOT_KNOWN']}}}},{rootType:'Message',value:{bodyLength:9007199254740992}},{rootType:'Schema',value:{fields:[{type:{type:'Int',value:{bitWidth:'64'}}}]}}])expect(valid(value)).toBe(false);
});

import {importArrowFlatbufferModel,exportArrowFlatbufferModel,inspectArrowFlatbufferModel,readDocument,writeDocument} from '../../src';
test('Arrow FlatBuffer vocabulary: logical models round-trip without native wire claims',()=>{
 const samples=[{rootType:'Schema',value:{features:['COMPRESSED_BODY'],future:{keep:'yes'},custom_metadata:[{key:'x',value:'a'},{key:'x',value:'b'}]}},{rootType:'Message',value:{bodyLength:'9223372036854775807',header:{type:'NONE'}}},{rootType:'Footer',value:{recordBatches:[{offset:'9007199254740993',metaDataLength:8,bodyLength:'16'}]}},{rootType:'Tensor',value:{type:{type:'Int',value:{bitWidth:64}},shape:[{size:'3'}],data:{offset:'0',length:'24'}}},{rootType:'SparseTensor',value:{type:{type:'Int',value:{bitWidth:64}},shape:[],sparseIndex:{type:'SparseTensorIndexCOO',value:{indicesType:{bitWidth:32},indicesBuffer:{offset:'0',length:'0'}}},data:{offset:'0',length:'0'}}}];
 for(const sample of samples){const doc=importArrowFlatbufferModel(JSON.stringify(sample),{id:sample.rootType});expect(inspectArrowFlatbufferModel(doc).complete).toBe(false);for(const format of ['json','yaml'] as const)expect(JSON.parse(exportArrowFlatbufferModel(readDocument(writeDocument(doc,format),format)))).toEqual(sample);}
 const doc=importArrowFlatbufferModel('{"rootType":"Schema","value":{}}',{id:'future'});(doc.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any).future=true;expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>exportArrowFlatbufferModel(doc)).toThrow('Unknown representation');
});
