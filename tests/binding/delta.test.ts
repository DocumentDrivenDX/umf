import {expect,test} from 'bun:test';
import {captureDeltaLog,exportDeltaLog,inspectDeltaActions,projectBindingToDelta,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/delta/case.json').json();
const source=await Bun.file(fixture.native).text();
const native=captureDeltaLog(source,{id:'delta-native'});
const project=(binding=fixture.binding,policy:'strict'|'report'='strict')=>projectBindingToDelta(fixture.logical as Document,binding as Document,native,policy);

test('@covers US-046-AC6 @covers US-046-AC7 @covers US-047-AC6 @covers US-047-AC7: clustering action uses exact physical columns and preserves native source',()=>{
  const result=project();
  expect(result.status).toBe('projected');
  expect(result.residuals).toEqual([]);
  expect(exportDeltaLog(result.nativeArchive)).toBe(source);
  const action=JSON.parse(result.candidate!);
  expect(action.domainMetadata.domain).toBe('delta.clustering');
  expect(JSON.parse(action.domainMetadata.configuration).clusteringColumns).toEqual([{physicalName:['order_id']}]);
  expect(inspectDeltaActions(captureDeltaLog(result.candidate!,{id:'candidate'})).knownShapesValid).toBe(true);
});

test('@covers US-046-AC4 @covers US-046-AC5 @covers US-047-AC4 @covers US-047-AC5: strict blocks unsupported index and report retains it as residual',()=>{
  const binding=structuredClone(fixture.binding);
  binding.extensions['umf.binding'].indexes.push({name:'lookup',kind:'gin',on:[{field:{module:'data',element:'order_id'}}],unique:false});
  expect(project(binding).status).toBe('blocked');
  expect(project(binding).candidate).toBeUndefined();
  const report=project(binding,'report');
  expect(report.status).toBe('reported');
  expect(report.residuals[0]?.path).toContain('/indexes/1');
  expect(report.candidate).toBeDefined();
});

test('@covers US-046-AC3 @covers US-047-AC8: native partitioning and absent columns cannot silently become clustering',()=>{
  const binding=structuredClone(fixture.binding);
  binding.extensions['umf.binding'].fields[0].column='missing';
  expect(project(binding).status).toBe('blocked');
  expect(project(binding,'report').residuals.length).toBeGreaterThan(0);
});
