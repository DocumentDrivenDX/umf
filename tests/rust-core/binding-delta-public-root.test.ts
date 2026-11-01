import {expect,test} from 'bun:test';
import {captureDeltaLog,exportDeltaLog,projectBindingToDelta,type Document} from '../../src/index-node-v4';
const fixture=await Bun.file('fixtures/binding/delta/case.json').json();
const source=await Bun.file(fixture.native).text();
const native=captureDeltaLog(source,{id:'delta-native'});
const project=(binding=fixture.binding,policy:'strict'|'report'='strict')=>projectBindingToDelta(fixture.logical as Document,binding as Document,native,policy);
test('public Delta binding projection preserves source and proposes the native clustering action',()=>{
 const report=project();
 expect(report.status).toBe('projected');
 expect(report.residuals).toEqual([]);
 expect(exportDeltaLog(report.nativeArchive)).toBe(source);
 const action=JSON.parse(report.candidate!);
 expect(action.domainMetadata.domain).toBe('delta.clustering');
 expect(JSON.parse(action.domainMetadata.configuration).clusteringColumns).toEqual([{physicalName:['order_id']}]);
});
test('strict Delta binding projection refuses target decisions it cannot represent',()=>{
 const binding=structuredClone(fixture.binding);
 binding.extensions['umf.binding'].indexes.push({name:'lookup',kind:'gin',on:[{field:{module:'data',element:'order_id'}}],unique:false});
 const strict=project(binding);
 expect(strict.status).toBe('blocked');
 expect(strict.candidate).toBeUndefined();
 const report=project(binding,'report');
 expect(report.status).toBe('reported');
 expect(report.residuals.some((row:any)=>row.path.includes('/indexes/1'))).toBe(true);
 expect(exportDeltaLog(report.nativeArchive)).toBe(source);
});
