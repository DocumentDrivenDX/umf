import {test,expect} from 'bun:test';
import {importSparkSchema,exportSparkSchema,projectSparkToArrow,exportArrowFlatbufferModel,coreSchema,sparkArrowProjectionSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const validator=createValidator();validator.addSchema(coreSchema);const check=validator.compile(sparkArrowProjectionSchema);
const policy={id:'arrow',timestampUtc:true,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss' as const};
const source=(type:any,metadata:any={})=>importSparkSchema(JSON.stringify({type:'struct',fields:[{name:'x',type,nullable:true,metadata}]}),{id:'source'});
test('US-017-AC6: projection retains source and reports loss; strict policy blocks loss',()=>{
 const doc=source('string',{__COLLATIONS:{x:'spark.UTF8_LCASE'},n:7}),before=exportSparkSchema(doc),result=projectSparkToArrow(doc,policy);
 expect(check(result)).toBe(true);expect(result.status).toBe('projected');expect(result.complete).toBe(false);expect(result.issues.map(i=>i.code)).toEqual(['SPARK_COLLATION_LOSS','SPARK_METADATA_LOSS']);expect(exportSparkSchema(result.source)).toBe(before);expect(exportSparkSchema(doc)).toBe(before);
 const blocked=projectSparkToArrow(doc,{...policy,lossPolicy:'strict'});expect(check(blocked)).toBe(true);expect(blocked.status).toBe('blocked');expect(blocked.target).toBeUndefined();expect(projectSparkToArrow(source('integer'),{...policy,lossPolicy:'strict'}).status).toBe('projected');
});
test('US-017-AC6: unknown source properties and opaque UDT block; context stays explicit',()=>{
 for(const type of ['future',{type:'udt',class:'NeverExecute',sqlType:'string'},{type:'array',elementType:'string',containsNull:true,future:1}]){const result=projectSparkToArrow(source(type),policy);expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.issues.some(i=>i.classification==='unsupported')).toBe(true);}
 const doc=source('integer');doc.vocabularies.future={version:'0.1.0',meaning:'retained'};doc.extensions={future:{n:1}};const result=projectSparkToArrow(doc,policy);expect(result.issues.some(i=>i.code==='SPARK_DOCUMENT_CONTEXT')).toBe(true);expect(result.source.extensions).toEqual(doc.extensions);expect(result.issues.some(i=>i.path==='/vocabularies/future/meaning')).toBe(true);expect(projectSparkToArrow(doc,{...policy,lossPolicy:'strict'}).status).toBe('blocked');
});
test('US-017-AC6: native reference models match across the complete authored matrix',async()=>{
 const base='fixtures/projections/spark-arrow/',report=await Bun.file(base+'native-results.json').json();expect(report.results.length).toBe(232);
 for(const row of report.results){const doc=importSparkSchema(await Bun.file(base+row.case+'.spark.json').text(),{id:row.case}),result=projectSparkToArrow(doc,{...policy,timestampUtc:row.options.timestamp_utc,largeTypes:row.options.prefers_large_types,rejectNestedDuplicates:row.options.error_on_duplicated_field_names_in_struct});expect(result.status).toBe(row.status==='converted'?'projected':'blocked');
 if(result.target){const native=await Bun.file(base+row.id+'.umf.json').json();expect(JSON.parse(exportArrowFlatbufferModel(result.target))).toEqual(native.modules[0].elements[0].extensions['umf.arrow.flatbuffer'].model);}}
},60000);
