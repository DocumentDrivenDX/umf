import {expect,test} from 'bun:test';
import {exportGraphqlSchema,projectDddEntitiesToGraphql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-graphql-entities/case.json').json();
const project=(logical=fixture.logical,policy=fixture.policy,loss:'strict'|'report'='report')=>projectDddEntitiesToGraphql(logical as Document,policy,loss);

test('@covers US-049-AC3 @covers US-049-AC5 @covers US-049-AC6: entity SDL, scalar wrappers and schema-mode import',()=>{
  const strict=project(fixture.logical,fixture.policy,'strict');expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=project();expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(22);
  expect(report.candidate?.match(/type (?:Order|Customer|Product|OrderProduct) \{/g)).toHaveLength(4);
  expect(report.candidate).toContain('type Query {\n  _umfSchema: Boolean');
  expect(report.candidate).toContain('tags: [String]');expect(report.candidate).toContain('details: String');
  expect(report.candidate).toContain('quantity: Decimal!');
  expect(report.candidate).not.toContain('resolver');expect(report.candidate).not.toContain('pageInfo');
  expect(exportGraphqlSchema(report.targetArchive!)).toBe(report.candidate!);
  expect(report.logical).toEqual(fixture.logical);
});

test('@covers US-049-AC5 @covers US-049-AC9: residuals retain root, identity, cardinality and scalar limits',()=>{
  const report=project();
  expect(report.residuals.some(x=>x.path==='/policy/root'&&x.reason.includes('no resolver'))).toBe(true);
  expect(report.residuals.some(x=>x.path==='/policy/scalars/decimal')).toBe(true);
  expect(report.residuals.some(x=>x.reason.includes('signed 32-bit'))).toBe(true);
  expect(report.residuals.some(x=>x.reason.includes('DDD many does not define GraphQL list'))).toBe(true);
  expect(report.residuals.filter(x=>x.path.endsWith('/identity'))).toHaveLength(4);
  expect(report.residuals.some(x=>x.reason.includes('bounded-context namespace'))).toBe(true);
});

test('@covers US-049-AC4: malformed names, unknown relationships and collisions block atomically',()=>{
  const root=structuredClone(fixture.policy);root.root.typeName='Order';expect(()=>project(fixture.logical,root)).toThrow();
  const names=structuredClone(fixture.policy);names.fields.find((x:any)=>x.field==='name')!.name='id';expect(()=>project(fixture.logical,names)).toThrow();
  const relationship=structuredClone(fixture.logical);relationship.modules[0].relationships=[];expect(()=>project(relationship)).toThrow();
  const unknown=structuredClone(fixture.logical);unknown.modules[0].elements[0].extensions['umf.ddd'].newMeaning=true;expect(()=>project(unknown)).toThrow();
  const unsafeScalar=structuredClone(fixture.policy);unsafeScalar.scalars.decimal='Float';expect(()=>project(fixture.logical,unsafeScalar)).toThrow();
  const stale=structuredClone(fixture.policy);stale.fields[0].field='missing';expect(()=>project(fixture.logical,stale)).toThrow();
});

test('@covers US-049-AC5: a DDD concept field never becomes a relationship',()=>{
  const logical=structuredClone(fixture.logical),policy=structuredClone(fixture.policy);
  logical.modules[0].elements[0].extensions['umf.ddd'].fields.customer={type:{kind:'concept',target:{module:'sales',element:'Customer'}},cardinality:'one'};
  policy.fields.push({module:'sales',element:'Order',field:'customer',name:'customer'});
  const report=project(logical,policy);
  expect(report.candidate).not.toContain('customer: Customer');
  expect(report.residuals.some(x=>x.reason.includes('Concept-valued field'))).toBe(true);
});

test('@covers US-049-AC9: opaque DDD invariant is retained without execution',()=>{
  const logical=structuredClone(fixture.logical);
  logical.modules[0].elements[0].extensions['umf.ddd'].invariants=[{id:'order-positive',scope:'definition',language:'urn:example:predicate',version:'1',expression:'amount > 0',references:[{module:'sales',element:'Order'}]}];
  const report=project(logical);
  expect(report.residuals.some(x=>x.path.endsWith('/invariants/0')&&x.reason.includes('not interpreted'))).toBe(true);
  expect(report.candidate).not.toContain('amount > 0');
});
