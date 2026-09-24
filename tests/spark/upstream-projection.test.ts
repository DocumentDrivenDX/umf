import {test,expect} from 'bun:test';
import {readDocument,projectArrowToSpark,exportSparkSchema,exportArrowFlatbufferModel} from '../../src';
test('US-017-AC7: complete pinned upstream IPC schema recovery agrees with native outcomes',async()=>{
 const base='fixtures/projections/arrow-spark-upstream/',report=await Bun.file(base+'native-results.json').json();expect(report.commit).toBe('9ff285c88565f0f6abc855918c6a342e70e4909c');expect(report.cases).toBe(182);let projected=0,blocked=0;
 for(const row of report.results){const source=readDocument(await Bun.file(base+row.path+'.umf.json').text(),'json'),before=exportArrowFlatbufferModel(source);for(const r of row.recovery){const result=projectArrowToSpark(source,{id:row.path,preferTimestampNtz:r.preferTimestampNtz,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});expect(result.status).toBe(r.jvm==='accepted'&&!/(generated_extension|generated_custom_metadata)\./.test(row.path)?'projected':'blocked');expect(exportArrowFlatbufferModel(result.source)).toBe(before);if(result.target){expect(JSON.parse(exportSparkSchema(result.target))).toEqual(r.schema);projected++;}else{expect(result.issues.some(i=>i.classification==='unsupported')).toBe(true);blocked++;}}}
 expect(projected).toBe(216);expect(blocked).toBe(148);
},120000);

test('US-017-AC7: extension semantic tags cannot be waived as generic metadata loss',async()=>{
 const {importArrowFlatbufferModel}=await import('../../src');
 for(const key of ['ARROW:extension:name','ARROW:extension:metadata']){const source=importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{fields:[{name:'value',nullable:true,type:{type:'Utf8',value:{}},custom_metadata:[{key,value:'uninterpreted'}]}]}}),{id:'extension'});const result=projectArrowToSpark(source,{id:'spark',preferTimestampNtz:false,variant:'preserve-struct',lossPolicy:'allow-reported-loss'});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.issues.some(i=>i.code==='ARROW_EXTENSION_UNINTERPRETED')).toBe(true);expect(exportArrowFlatbufferModel(result.source)).toBe(exportArrowFlatbufferModel(source));}
});
