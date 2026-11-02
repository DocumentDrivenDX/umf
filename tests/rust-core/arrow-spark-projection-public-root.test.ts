// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importArrowFlatbufferModel,exportSparkSchema,importSparkSchema,exportArrowFlatbufferModel,projectArrowToSpark,projectSparkToArrow} from '../../src/index-node-v4';

const arrow=(type:any)=>importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{fields:[{name:'id',nullable:false,...type}]}}),{id:'arrow-source'});
const spark=(type:any)=>importSparkSchema(JSON.stringify({type:'struct',fields:[{name:'id',type,nullable:false,metadata:{}}]}),{id:'spark-source'});

test('Node V4 Arrow/Spark projections own both directions, preserve source and report policy loss',()=>{
 const arrowSource=arrow({type:{type:'Int',value:{bitWidth:64,is_signed:true}}});
 const forward=projectArrowToSpark(arrowSource,{id:'spark-target',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});
 expect(forward.status).toBe('projected');expect(JSON.parse(exportSparkSchema(forward.target!)).fields[0].type).toBe('long');expect(exportArrowFlatbufferModel(forward.source)).toBe(exportArrowFlatbufferModel(arrowSource));
 const forwardLoss=projectArrowToSpark(arrow({type:{type:'LargeUtf8',value:{}}}),{id:'spark-large-string',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});
 expect(forwardLoss.status).toBe('projected');expect(forwardLoss.issues.some(issue=>issue.code==='ARROW_OFFSET_WIDTH_LOSS')).toBe(true);
 const unsupported=projectArrowToSpark(arrow({type:{type:'Int',value:{bitWidth:32,is_signed:false}}}),{id:'blocked',preferTimestampNtz:true,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});
 expect(unsupported.status).toBe('blocked');expect(unsupported.target).toBeUndefined();expect(unsupported.issues.some(issue=>issue.classification==='unsupported')).toBe(true);
 const reverseNormal=projectSparkToArrow(spark('long'),{id:'arrow-long',timestampUtc:true,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss'});
 expect(reverseNormal.status).toBe('projected');expect(JSON.parse(exportArrowFlatbufferModel(reverseNormal.target!)).value.header.value.fields[0].type.type).toBe('Int');
 const sparkSource=spark('timestamp');
 const reverse=projectSparkToArrow(sparkSource,{id:'arrow-target',timestampUtc:false,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'allow-reported-loss'});
 expect(reverse.status).toBe('projected');expect(JSON.parse(exportArrowFlatbufferModel(reverse.target!)).value.header.value.fields[0].type.type).toBe('Timestamp');expect(reverse.issues.some(issue=>issue.code==='SPARK_TIMESTAMP_ZONE_LOSS')).toBe(true);
 const strict=projectSparkToArrow(spark('timestamp'),{id:'arrow-strict',timestampUtc:false,largeTypes:false,rejectNestedDuplicates:true,lossPolicy:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
});
