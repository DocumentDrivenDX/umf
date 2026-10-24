// SPDX-License-Identifier: MIT OR Apache-2.0
/** Regression coverage for CONTRACT-083's explicit legacy compatibility view. */
import {expect,test} from 'bun:test';
import {projectLakeviewToLegacyDashboard} from '../../src/adapters/lakeview';
import {elementKey} from '../../src/adapters/lakeview/project';

import {legacyIds as ids,legacyFixture as fixture,legacyNumericFixture as numericFixture,legacyMixedDefaults,legacySelectionFixture,legacyUnknownWidgetTypes,legacyUnknownFormats,legacyUnknownChannels,legacyFormatFixture,legacyChannelFixture} from './legacy-fixture';

function project(view:any){return projectLakeviewToLegacyDashboard(view,ids,{title:'Legacy view'});}
const filter=(result:ReturnType<typeof project>)=>result.elements.get(elementKey('page','filter')) as any;
const dataset=(result:ReturnType<typeof project>)=>result.elements.get(elementKey('data','dataset')) as any;

for(const name of ['constructor','toString','__proto__'])test('legacy field names are own data: '+name,()=>{
  const result=project(fixture(name));
  expect(result.issues).toEqual([]);
  expect(filter(result).targets[0].field).toBe(name);
  expect(Object.keys(dataset(result).fields)).toEqual([name]);
  expect(Object.hasOwn(dataset(result).fields,name)).toBe(true);
  expect(dataset(result).fields[name]).toEqual({role:'column'});
});

test('legacy field collision still refuses a real dataset measure',()=>{
  const view=fixture('constructor');
  view.datasets[0].columns=[{displayName:'constructor',expression:'SUM(column)'}];
  const result=project(view);
  expect(filter(result)).toBeUndefined();
  expect(result.issues.some(issue=>issue.code==='LAKEVIEW_FIELD_COLLISION')).toBe(true);
  expect(dataset(result).fields.constructor.role).toBe('measure');
});

for(const token of ['0.10000000000000001','9007199254740993','1e400','1'])test('legacy parsed numeric default is explicitly unverified: '+token,()=>{
  const result=project(numericFixture(token));
  expect(filter(result).default).toBeUndefined();
  expect(result.issues).toEqual([expect.objectContaining({
    code:'LAKEVIEW_FILTER_DEFAULT',classification:'unsupported',
    path:'/pages/0/layout/0/widget/spec/selection/defaultSelection/values',
  })]);
  expect(result.issues[0]!.detail).toContain('precision');
});

test('legacy numeric omission never projects a partial mixed selection',()=>{
  const result=project(numericFixture('0.10000000000000001',true));
  expect(filter(result).default).toBeUndefined();
  expect(result.issues).toHaveLength(1);
});

test('legacy string and boolean defaults remain representable',()=>{
  const view=fixture('column',{selection:{defaultSelection:{values:{dataType:'STRING',values:[{value:'chosen'},{value:true},{value:false}]}}}});
  const before=JSON.stringify(view),result=project(view);
  expect(filter(result).default).toEqual({values:['chosen',true,false]});
  expect(result.issues).toEqual([]);
  expect(JSON.stringify(view)).toBe(before);
});

for(const empty of [{},[]])test('legacy unknown empty container has an attributable loss report: '+JSON.stringify(empty),()=>{
  const result=project(fixture('column',{futureOption:empty}));
  expect(filter(result)).toBeDefined();
  expect(result.issues).toEqual([expect.objectContaining({
    code:'LAKEVIEW_UNMAPPED',classification:'unsupported',retainedInSource:true,
    path:'/pages/0/layout/0/widget/spec/futureOption',
  })]);
});

for(const example of legacyMixedDefaults)test('legacy numeric precision diagnosis precedes member admission: '+example.name,()=>{
  const result=project(legacySelectionFixture(example.values));
  expect(filter(result).default).toBeUndefined();
  expect(result.issues).toEqual([expect.objectContaining({
    code:'LAKEVIEW_FILTER_DEFAULT',classification:'unsupported',
    path:'/pages/0/layout/0/widget/spec/selection/defaultSelection/values',
  })]);
});

for(const widgetType of legacyUnknownWidgetTypes)test('legacy unknown widget discriminator refuses inherited/coerced controls: '+JSON.stringify(widgetType),()=>{
  const view=fixture('column',{widgetType}),before=JSON.stringify(view);
  const result=project(view);
  expect(filter(result)).toBeUndefined();
  expect(result.issues).toContainEqual(expect.objectContaining({
    code:'LAKEVIEW_WIDGET_TYPE',classification:'unsupported',retainedInSource:true,
    path:'/pages/0/layout/0/widget',
  }));
  expect(JSON.stringify(view)).toBe(before);
});

for(const type of legacyUnknownFormats)test('legacy unknown format discriminator is omitted with source loss: '+JSON.stringify(type),()=>{
  const view=legacyFormatFixture(type),before=JSON.stringify(view),result=project(view);
  expect(filter(result).encodings[0].format).toBeUndefined();
  expect(result.issues).toContainEqual(expect.objectContaining({
    code:'LAKEVIEW_UNMAPPED',classification:'unsupported',retainedInSource:true,
    path:'/pages/0/layout/0/widget/spec/encodings/columns/0/format',
  }));
  expect(JSON.stringify(view)).toBe(before);
});

for(const name of legacyUnknownChannels)test('legacy unknown encoding channel is omitted with source loss: '+name,()=>{
  const view=legacyChannelFixture(name),before=JSON.stringify(view),result=project(view);
  expect(filter(result).encodings).toEqual([{channel:'column',field:'column',aggregation:'none'}]);
  expect(result.issues).toContainEqual(expect.objectContaining({
    code:'LAKEVIEW_UNMAPPED',classification:'unsupported',retainedInSource:true,
    path:'/pages/0/layout/0/widget/spec/encodings/'+name,
  }));
  expect(JSON.stringify(view)).toBe(before);
});

test('legacy supported visual format and channel preserve their ordinary output',()=>{
  const result=project(legacyFormatFixture('number-percent'));
  expect(filter(result).encodings).toEqual([{channel:'column',field:'column',aggregation:'none',format:{kind:'percent'}}]);
  expect(result.issues).toEqual([]);
});
