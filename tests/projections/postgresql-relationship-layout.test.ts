import {expect,test} from 'bun:test';
import {copyJson,validatePostgresqlRelationshipLayout} from '../../src';
import {postgresqlLayoutCase,postgresqlLayoutCases} from '../../scripts/relationship-postgresql-layout-cases';

test('@covers US-048-AC3 AC4 AC8: exact endpoint policy matrix validates atomically and retains every source',()=>{
 for(const row of postgresqlLayoutCases()){
  const before=copyJson(row),result=validatePostgresqlRelationshipLayout(row.logical,row.binding,row.policy,'report');
  expect(result.status!=='blocked',row.id+': '+JSON.stringify(result.diagnostics)).toBe(row.valid);
  expect('candidate'in result,row.id).toBe(row.valid);expect(copyJson(row)).toEqual(before);
  expect(result.logical).toEqual(row.logical);expect(result.binding).toEqual(row.binding);expect(result.policy).toEqual(copyJson(row.policy));
  const strict=validatePostgresqlRelationshipLayout(row.logical,row.binding,row.policy,'strict');expect(strict.status,row.id).toBe('blocked');expect('candidate'in strict).toBe(false);
  expect('nativeSource'in result).toBe(false);expect('targetArchive'in result).toBe(false);
 }
});
test('policy result copies retained sources and candidate; NULL composite is explicitly residualized',()=>{
 const row=postgresqlLayoutCases().find(c=>c.id==='nullable-composite')!,r=validatePostgresqlRelationshipLayout(row.logical,row.binding,row.policy,'report');
 expect(r.status).toBe('reported');expect(r.residuals.some(x=>x.reason.includes('MATCH SIMPLE'))).toBe(true);
 r.candidate!.fieldLayouts[0]!.column='changed';expect((r.policy as any).fieldLayouts[0].column).toBe('id');expect(row.policy.fieldLayouts[0]!.column).toBe('id');
});
test('reordered composite endpoint and extra maps refuse, including duplicated aliases',()=>{
 const f=postgresqlLayoutCases().find(c=>c.id==='nullable-composite')!;
 f.policy.relationshipLayouts[0]!.targetComponents.reverse();expect(validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report').status).toBe('blocked');
 const extra=postgresqlLayoutCase();extra.policy.fieldLayouts.push(structuredClone(extra.policy.fieldLayouts[0]!));expect(validatePostgresqlRelationshipLayout(extra.logical,extra.binding,extra.policy,'report').status).toBe('blocked');
});
test('public validator does not invoke hostile getters',()=>{
 const f=postgresqlLayoutCase();let calls=0;
 Object.defineProperty(f.policy,'relationshipLayouts',{enumerable:true,get(){calls++;throw Error('executed');}});
 expect(()=>validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report')).toThrow();expect(calls).toBe(0);
});

test('anonymous carrier cannot collide with backing Key or declared index relations',()=>{
 const f=postgresqlLayoutCases().find(c=>c.id==='anonymous-junction')!;
 for(const table of ['sales.pk_orders','sales.orders_btree']){f.policy.relationshipLayouts[1]!.carrierTable=table;const r=validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report');expect(r.status).toBe('blocked');expect(r.diagnostics.some(d=>d.code==='POSTGRESQL_LAYOUT_COLLISION')).toBe(true);}
});
test('unknown qualifier residual carries the exact pointed value and retains full source separately',()=>{
 const f=postgresqlLayoutCase();(f.logical.modules[0]!.relationships as any[])[0]['a/b~c']={uninterpreted:42};
 const r=validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report');
 expect(r.residuals.find(x=>x.path.endsWith('/a~1b~0c'))?.value).toEqual({uninterpreted:42});
});

test('canonical identifiers and SQL types reject terminal line separators',()=>{
 for(const suffix of ['\n','\r','\u2028','\u2029'])for(const slot of ['identifier','type'] as const){
  const f=postgresqlLayoutCase();if(slot==='identifier')f.policy.relationshipLayouts[0]!.targetConstraint+=suffix;else f.policy.fieldLayouts[0]!.sqlType='numeric(12,2)'+suffix;
  expect(validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report').status).toBe('blocked');
 }
});

test('published policy and complete result schemas reject partial success and candidate leakage',async()=>{
 const {createValidator}=await import('../../src/validation/schema'),v=createValidator(false);
 v.addSchema(await Bun.file('spec/core/relationship-document.schema.json').json());
 v.addSchema(await Bun.file('spec/projections/postgresql-relationship-layout.schema.json').json());
 const check=v.compile(await Bun.file('spec/projections/postgresql-relationship-layout-result.schema.json').json());
 const f=postgresqlLayoutCase(),r=validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report');expect(check(r),JSON.stringify(check.errors)).toBe(true);
 const strict=validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'strict');expect(check(strict),JSON.stringify(check.errors)).toBe(true);
 expect(check({...strict,candidate:r.candidate})).toBe(false);const missing={...r};delete missing.candidate;expect(check(missing)).toBe(false);
});
test('shared edge cannot switch unconditional FK endpoint identity with its discriminator',()=>{
 const f=postgresqlLayoutCases().find(c=>c.id==='edge')!,module=f.logical.modules[0]!,r=structuredClone((module.relationships as any[])[1]);
 r.id='another-edge';r.name='another';r.inverse='anotherInverse';r.target=[{module:'sales',element:'Customer',key:'pk'}];(module.relationships as any[]).push(r);
 const p=f.binding.extensions!['umf.binding'] as any;p.relationships.push({module:'sales',id:r.id,storage:'edge'});
 const l=structuredClone(f.policy.relationshipLayouts[1]!);l.relationship.id=r.id;l.targetKey.element='Customer';l.targetComponents[0]!.keyField.element='field_Customer_id';l.targetComponents[0]!.endpointField.element='Customer';l.sourceConstraint='fk_edge2_source';l.targetConstraint='fk_edge2_target';l.discriminator!.value='customer';f.policy.relationshipLayouts.push(l);
 const out=validatePostgresqlRelationshipLayout(f.logical,f.binding,f.policy,'report');expect(out.status).toBe('blocked');expect(out.diagnostics.some(d=>d.code==='POSTGRESQL_LAYOUT_EDGE_ENDPOINT')).toBe(true);
});
