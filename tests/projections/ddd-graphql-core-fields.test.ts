import {expect,test} from 'bun:test';
import {exportGraphqlSchema,projectDddEntitiesToGraphql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-graphql-core-fields/case.json').json();
const project=(logical=fixture.logical,policy=fixture.policy,loss:'strict'|'report'='report')=>projectDddEntitiesToGraphql(logical as Document,policy,loss);

test('@covers US-049-AC3 @covers US-049-AC5 @covers US-049-AC6: core Field availability controls SDL wrappers',()=>{
  const strict=project(fixture.logical,fixture.policy,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=project();
  expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(24);
  expect(report.candidate).toContain('id: Int!');
  expect(report.candidate).toContain('details: String\n');
  expect(report.candidate).toContain('tags: [String!]');
  expect(report.residuals.some(x=>x.path.endsWith('/facets')&&x.reason.includes('SDL does not enforce'))).toBe(true);
  expect(report.residuals.some(x=>x.reason.includes('availability is unspecified'))).toBe(true);
  expect(report.mappings.some(x=>x.sourcePath==='/modules/0/elements/18'&&x.target==='Product.tags')).toBe(true);
  expect(exportGraphqlSchema(report.targetArchive!)).toBe(report.candidate!);
  expect(report.logical).toEqual(fixture.logical);expect(report.policy).toEqual(fixture.policy);
});

test('@covers US-049-AC3 @covers US-049-AC4: absent item availability remains a nullable item and a residual',()=>{
  const logical=structuredClone(fixture.logical);
  logical.modules[0].elements.find((x:any)=>x.id==='field_Product_tags_item').nullability='absent-allowed';
  const report=project(logical);
  expect(report.candidate).toContain('tags: [String]');
  expect(report.residuals.some(x=>x.reason.includes('Nullable GraphQL item'))).toBe(true);
});

test('@covers US-049-AC3: an unspecified core availability cannot borrow DDD one as SDL non-null',()=>{
  const logical=structuredClone(fixture.logical);
  logical.modules[0].elements.find((x:any)=>x.id==='field_Customer_name').nullability='unspecified';
  const report=project(logical);
  expect(report.candidate).toContain('name: String\n');
  expect(report.residuals.some(x=>x.reason.includes('does not justify SDL non-null'))).toBe(true);
});

test('@covers US-049-AC4: missing, conflicting and duplicate core pairings block before SDL',()=>{
  const missing=structuredClone(fixture.policy);delete missing.fields[0].coreField;
  expect(()=>project(fixture.logical,missing)).toThrow('one exact Field reference');
  const stale=structuredClone(fixture.policy);stale.fields[0].coreField.element='missing';
  expect(()=>project(fixture.logical,stale)).toThrow('exact Field');
  const duplicate=structuredClone(fixture.policy);duplicate.fields[1].coreField=duplicate.fields[0].coreField;
  expect(()=>project(fixture.logical,duplicate)).toThrow('silently bind two DDD fields');
  const conflict=structuredClone(fixture.logical);conflict.modules[0].elements.find((x:any)=>x.id==='field_Customer_name').scalarType='integer';
  expect(()=>project(conflict)).toThrow('conflicts with the DDD field');
  const availability=structuredClone(fixture.logical);availability.modules[0].elements.find((x:any)=>x.id==='field_Order_details').nullability='required';
  expect(()=>project(availability)).toThrow('availability assertions conflict');
  const noItem=structuredClone(fixture.logical);delete noItem.modules[0].elements.find((x:any)=>x.id==='field_Product_tags').itemType;
  expect(()=>project(noItem)).toThrow('explicit itemType');
  const nested=structuredClone(fixture.logical);nested.modules[0].elements.find((x:any)=>x.id==='field_Product_tags_item').cardinality='array';
  expect(()=>project(nested)).toThrow('Invalid or uninterpreted DDD model');
  const unknown=structuredClone(fixture.logical);unknown.modules[0].elements.find((x:any)=>x.id==='field_Order_status').futureFacet={value:1};
  expect(()=>project(unknown)).toThrow('uninterpreted content');
});

test('@covers US-049-AC3: the DDD-only profile cannot silently ignore a core pairing',()=>{
  const policy=structuredClone(fixture.policy);delete policy.sourceProfile;
  expect(()=>project(fixture.logical,policy)).toThrow('cannot ignore a core Field reference');
});
