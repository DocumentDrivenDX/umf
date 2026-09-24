import {test,expect} from 'bun:test';
import {importArrowFlatbufferModel,exportArrowFlatbufferModel,projectArrowToSpark,exportSparkSchema,arrowSparkProjectionSchema,coreSchema,readDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(arrowSparkProjectionSchema);
const policy={id:'spark',preferTimestampNtz:true,variant:'spark-tagged-struct' as const,lossPolicy:'allow-reported-loss' as const};
const doc=(field:any)=>importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{fields:[{name:'x',nullable:true,...field}]}}),{id:'arrow'});
test('US-017-AC7: reverse projection reports nullability/layout losses and retains exact source',()=>{
 const source=doc({type:{type:'LargeList',value:{}},children:[{name:'item',type:{type:'Int',value:{bitWidth:64,is_signed:true}},children:[]}]}),before=exportArrowFlatbufferModel(source),result=projectArrowToSpark(source,policy);
 expect(check(result)).toBe(true);expect(result.status).toBe('projected');expect(result.issues.map(i=>i.code)).toEqual(['ARROW_LIST_LAYOUT_LOSS','ARROW_ELEMENT_NULLABILITY_LOSS','ARROW_CHILD_NAME_LOSS']);expect(JSON.parse(exportSparkSchema(result.target!)).fields[0].type.containsNull).toBe(true);expect(exportArrowFlatbufferModel(result.source)).toBe(before);expect(exportArrowFlatbufferModel(source)).toBe(before);
 const strict=projectArrowToSpark(source,{...policy,lossPolicy:'strict'});expect(check(strict)).toBe(true);expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
});
test('US-017-AC7: unsigned integers, unknown table fields and malformed maps block',()=>{
 for(const field of [{type:{type:'Int',value:{bitWidth:32}}},{type:{type:'Bool',value:{future:true}}},{type:{type:'Map',value:{}},children:[]}]){const result=projectArrowToSpark(doc(field),policy);expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();}
 expect(projectArrowToSpark(doc({type:{type:'Bool',value:{}}}),{...policy,lossPolicy:'strict'}).status).toBe('projected');
});
test('US-017-AC7: both timestamp recovery modes match all native reference recoveries',async()=>{
 const base='fixtures/projections/spark-arrow/',report=await Bun.file(base+'native-results.json').json();let count=0;
 for(const row of report.results){if(row.status!=='converted')continue;const source=readDocument(await Bun.file(base+row.id+'.umf.json').text(),'json');for(const recovery of row.recovery){const result=projectArrowToSpark(source,{...policy,preferTimestampNtz:recovery.prefer_timestamp_ntz});expect(result.status).toBe('projected');expect(JSON.parse(exportSparkSchema(result.target!))).toEqual(recovery.schema);count++;}}
 expect(count).toBe(376);
},60000);

test('US-017-AC7: variant recognition is explicit and cannot hide extra struct fields',()=>{
 const children=[{name:'value',type:{type:'Binary',value:{}},children:[]},{name:'metadata',type:{type:'Binary',value:{}},children:[],custom_metadata:[{key:'variant',value:'true'}]}];
 const source=doc({type:{type:'Struct_',value:{}},children});
 const tagged=projectArrowToSpark(source,policy);expect(JSON.parse(exportSparkSchema(tagged.target!)).fields[0].type).toBe('variant');
 const physical=projectArrowToSpark(source,{...policy,variant:'preserve-struct'});expect(JSON.parse(exportSparkSchema(physical.target!)).fields[0].type.type).toBe('struct');
 const extra=doc({type:{type:'Struct_',value:{}},children:[...children,{name:'extra',type:{type:'Bool',value:{}}}]});expect(projectArrowToSpark(extra,policy).status).toBe('blocked');
});
