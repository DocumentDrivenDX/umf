import {test,expect} from 'bun:test';
import {avroNativeSchema,importAvroSchema,exportAvroSchema,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
const check=createValidator(false).compile(avroNativeSchema);
test('CONTRACT-007 native syntax schema describes every schema constructor while retaining annotation limits',async()=>{
 const valid:any[]=['null','boolean','int','long','float','double','bytes','string','external.Name',{type:'string',future:{keep:true}},
 {type:'record',name:'a.Node',aliases:['formerly invalid name'],fields:[{name:'id',type:'long',default:0,order:'ascending'},{name:'next',type:['null','a.Node'],default:null}]},
 {type:'error',name:'Failure',fields:[{name:'message',type:'string'}]},
 {type:'enum',name:'Color',namespace:'',symbols:['RED','BLUE'],default:'RED'},
 {type:'fixed',name:'Digest',size:16},
 {type:'array',items:{type:'map',values:['null','double']}},
 {type:'bytes',logicalType:'decimal',precision:8,scale:2},
 {type:'long',logicalType:'future',qualifier:{unknown:true}},
 {type:'bytes',logicalType:'decimal',precision:0,scale:4},
 {type:'record',name:'R',fields:[{name:'x',type:'int',default:'wrong'}]},
 ['null',{type:'fixed',name:'A',size:1},{type:'fixed',name:'B',size:1}],[],{type:'fixed',name:'Zero',size:0}];
 const invalid:any[]=[null,true,42,{}, {type:'array'}, {type:'map'}, {type:'record',name:'R'}, {type:'fixed',name:'F',size:-1},{type:'fixed',name:'F',size:1.5},{type:'enum',name:'E',symbols:['A','A']},{type:'enum',name:'E',symbols:['bad-name']},{type:'record',name:'bad-name',fields:[]},{type:'record',name:'R',namespace:'a..b',fields:[]},{type:'record',name:'R',fields:[{name:'a',type:'int',order:'random'}]},[['int']],[ 'int',{type:'int'}],[{type:'array',items:'int'},{type:'array',items:'string'}],{type:'record',name:'R',fields:[{name:'a\n',type:'int'}]}];
 valid.push(['array',{type:'array',items:'int'}],['map',{type:'map',values:'int'}]);
 const corpus=await Bun.file('fixtures/avro/upstream/manifest.json').json();
 for(const file of corpus.files)valid.push(await Bun.file('fixtures/avro/upstream/'+file.path).json());
 const cases=[];
 for(const [expected,values] of [[true,valid],[false,invalid]] as const)for(const value of values){expect(check(value)).toBe(expected);cases.push({value,expected});}
 const recoveries=[];
 for(const value of valid){const source=JSON.stringify(value),document=importAvroSchema(source,{id:'native-syntax'});for(const format of ['json','yaml'] as const){const native=exportAvroSchema(readDocument(writeDocument(document,format),format));expect(check(JSON.parse(native))).toBe(true);expect(JSON.parse(native)).toEqual(value);recoveries.push({source,native,format});}}
 await Bun.write('fixtures/avro/native-schema.json',JSON.stringify({cases,recoveries},null,2)+'\n');
});
