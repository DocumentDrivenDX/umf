// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importArrowFlatbufferModel,exportSparkSchema,importSparkSchema,exportArrowFlatbufferModel,projectArrowToSpark,projectSparkToArrow} from '../../src/index-node-v4';

const arrow=(type:any)=>importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{fields:[{name:'id',nullable:false,...type}]}}),{id:'arrow-source'});
const spark=(type:any)=>importSparkSchema(JSON.stringify({type:'struct',fields:[{name:'id',type,nullable:false,metadata:{}}]}),{id:'spark-source'});

test('Node V4 Arrow/Spark projections own both directions, preserve source and report policy loss',()=>{
 const arrowSource=arrow({type:{type:'Int',value:{bitWidth:64,is_signed:true}}});
 const arrowBefore=exportArrowFlatbufferModel(arrowSource);
 const forward=projectArrowToSpark(arrowSource,{id:'spark-target',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});
 expect(forward.status).toBe('projected');expect(JSON.parse(exportSparkSchema(forward.target!)).fields[0].type).toBe('long');expect(exportArrowFlatbufferModel(forward.source)).toBe(arrowBefore);expect(exportArrowFlatbufferModel(arrowSource)).toBe(arrowBefore);
 const forwardLoss=projectArrowToSpark(arrow({type:{type:'LargeUtf8',value:{}}}),{id:'spark-large-string',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});
 expect(forwardLoss.status).toBe('projected');expect(forwardLoss.issues.some(issue=>issue.code==='ARROW_OFFSET_WIDTH_LOSS')).toBe(true);
 const unsupported=projectArrowToSpark(arrow({type:{type:'Int',value:{bitWidth:32,is_signed:false}}}),{id:'blocked',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});
 expect(unsupported.status).toBe('blocked');expect(unsupported.target).toBeUndefined();expect(unsupported.issues.some(issue=>issue.classification==='unsupported')).toBe(true);
 const reverseNormal=projectSparkToArrow(spark('long'),{id:'arrow-long',timestampUtc:true,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss'});
 expect(reverseNormal.status).toBe('projected');expect(JSON.parse(exportArrowFlatbufferModel(reverseNormal.target!)).value.header.value.fields[0].type.type).toBe('Int');
 const sparkSource=spark('timestamp');
 const sparkBefore=exportSparkSchema(sparkSource);
 const reverse=projectSparkToArrow(sparkSource,{id:'arrow-target',timestampUtc:false,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss'});
 expect(reverse.status).toBe('projected');expect(JSON.parse(exportArrowFlatbufferModel(reverse.target!)).value.header.value.fields[0].type.type).toBe('Timestamp');expect(reverse.issues.some(issue=>issue.code==='SPARK_TIMESTAMP_ZONE_LOSS')).toBe(true);expect(exportSparkSchema(reverse.source)).toBe(sparkBefore);expect(exportSparkSchema(sparkSource)).toBe(sparkBefore);
 const strict=projectSparkToArrow(spark('timestamp'),{id:'arrow-strict',timestampUtc:false,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();

 const opaqueSpark=importSparkSchema(JSON.stringify({type:'struct',fields:[{name:'x',type:{type:'udt',class:'NeverExecute',sqlType:'string'},nullable:true}]}),{id:'opaque-spark'});
 const opaqueResult=projectSparkToArrow(opaqueSpark,{id:'arrow-opaque',timestampUtc:true,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss'});
 expect(opaqueResult.status).toBe('blocked');expect(opaqueResult.target).toBeUndefined();expect(opaqueResult.issues.some(issue=>issue.classification==='unsupported')).toBe(true);

 const duplicateSpark=importSparkSchema(JSON.stringify({type:'struct',fields:[{name:'nested',type:{type:'struct',fields:[{name:'x',type:'integer'},{name:'x',type:'integer'}]}}]}),{id:'duplicate-spark'});
 expect(projectSparkToArrow(duplicateSpark,{id:'arrow-duplicates',timestampUtc:true,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss'}).status).toBe('blocked');

 const extensionArrow=importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{fields:[{name:'value',nullable:true,type:{type:'Utf8',value:{}},custom_metadata:[{key:'ARROW:extension:name',value:'uninterpreted'}]}]}}),{id:'arrow-extension'});
 const extensionBefore=exportArrowFlatbufferModel(extensionArrow);
 const extensionResult=projectArrowToSpark(extensionArrow,{id:'spark-extension',preferTimestampNtz:false,variant:'preserve-struct',lossPolicy:'allow-reported-loss'});
 expect(extensionResult.status).toBe('blocked');expect(extensionResult.target).toBeUndefined();expect(extensionResult.issues.some(issue=>issue.code==='ARROW_EXTENSION_UNINTERPRETED')).toBe(true);expect(exportArrowFlatbufferModel(extensionResult.source)).toBe(extensionBefore);expect(exportArrowFlatbufferModel(extensionArrow)).toBe(extensionBefore);

 const taggedVariant=importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{fields:[{name:'value',nullable:true,type:{type:'Struct_',value:{}},children:[{name:'value',type:{type:'Binary',value:{}},children:[]},{name:'metadata',type:{type:'Binary',value:{}},children:[],custom_metadata:[{key:'variant',value:'true'}]}]}]}}),{id:'arrow-variant'});
 expect(JSON.parse(exportSparkSchema(projectArrowToSpark(taggedVariant,{id:'spark-variant',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'}).target!)).fields[0].type).toBe('variant');
 expect(JSON.parse(exportSparkSchema(projectArrowToSpark(taggedVariant,{id:'spark-physical',preferTimestampNtz:true,variant:'preserve-struct',lossPolicy:'allow-reported-loss'}).target!)).fields[0].type.type).toBe('struct');
});
