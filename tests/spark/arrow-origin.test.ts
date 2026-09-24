import {test,expect} from 'bun:test';
import {readDocument,projectArrowToSpark,exportSparkSchema} from '../../src';
test('US-017-AC7: Arrow-origin layouts match native recovery or block native incompatibility',async()=>{
 const base='fixtures/projections/arrow-spark/',report=await Bun.file(base+'native-results.json').json();expect(report.cases).toBe(33);let projected=0;
 for(const row of report.results){const source=readDocument(await Bun.file(base+row.id+'.umf.json').text(),'json');for(const r of row.recovery){const result=projectArrowToSpark(source,{id:row.id,preferTimestampNtz:r.preferTimestampNtz,variant:'spark-tagged-struct',lossPolicy:'allow-reported-loss'});expect(result.status).toBe(r.jvm==='accepted'?'projected':'blocked');if(result.target){expect(JSON.parse(exportSparkSchema(result.target))).toEqual(r.schema);expect(result.issues.some(i=>i.code==='ARROW_METADATA_LOSS')).toBe(true);if(['decimal32','decimal64','decimal256-small'].includes(row.id))expect(result.issues.some(i=>i.code==='ARROW_DECIMAL_WIDTH_LOSS')).toBe(true);projected++;}}}expect(projected).toBe(46);
},30000);
