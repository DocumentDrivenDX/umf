// SPDX-License-Identifier: MIT OR Apache-2.0
/** Regression coverage for CONTRACT-083's explicit legacy compatibility view. */
import {expect,test} from 'bun:test';
import {projectLakeviewToLegacyDashboard} from '../../src/adapters/lakeview';
import {elementKey} from '../../src/adapters/lakeview/project';

import {legacyIds as ids,legacyFixture as fixture,legacyNumericFixture as numericFixture} from './legacy-fixture';

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
