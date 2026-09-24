import {expect,test} from 'bun:test';
import {exportSqlServerCatalog,projectBindingTablesToSqlServer,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/sqlserver-tables/case.json').json();
const project=(binding=fixture.binding,policy=fixture.policy,loss:'strict'|'report'='report')=>projectBindingTablesToSqlServer(fixture.logical as Document,binding as Document,policy,loss);

test('@covers US-046-AC2 @covers US-046-AC4 @covers US-046-AC5: explicit tables, partition family and embedded residual',()=>{
  const strict=project(fixture.binding,fixture.policy,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=project();
  expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(10);
  expect(report.residuals.some(x=>x.path==='/extensions/umf.binding/fields/2')).toBe(true);
  expect(report.residuals.some(x=>x.reason.includes('unbounded DDD integer'))).toBe(true);
  expect(report.residuals.some(x=>x.reason.includes('does not emit a primary or unique key'))).toBe(true);
  expect(report.candidate).toContain('CREATE TABLE [sales].[Items]');
  expect(report.candidate).toContain('[payload] nvarchar(max) NULL');
  expect(report.candidate).toContain('ISJSON([payload], OBJECT)=1');
  expect(report.candidate).toContain('ON [ps_umf_ship]([part])');
  expect(report.logical).toEqual(fixture.logical);expect(report.binding).toEqual(fixture.binding);
  expect(report.mappings.some(x=>x.target==='sales.Items.payload')).toBe(true);
});

test('@covers US-046-AC3: stale model, unknown binding content and unsafe type policy block',()=>{
  const stale=structuredClone(fixture.binding);stale.extensions['umf.binding'].logical.documentId='wrong';
  expect(()=>project(stale)).toThrow();
  const unknown=structuredClone(fixture.binding);unknown.extensions['umf.binding'].mystery={x:1};
  expect(()=>project(unknown)).toThrow();
  const policy=structuredClone(fixture.policy);policy.fieldTypes[0].sqlType='int); DROP TABLE [sales].[Items];--';
  const result=project(fixture.binding,policy);
  expect(result.residuals.some(x=>x.reason.includes('safe explicit SQL scalar'))).toBe(true);
  expect(result.candidate).not.toContain('DROP TABLE');
  const collision=structuredClone(fixture.binding);collision.extensions['umf.binding'].elements[1].table='sales.Items';
  expect(()=>project(collision)).toThrow();
});

test('@covers US-046-AC4 @covers US-046-AC5: missing partition policy and DDD identity remain residuals',()=>{
  const missing=structuredClone(fixture.policy);missing.partitionFamilies=[];
  const report=project(fixture.binding,missing);
  expect(report.status).toBe('reported');
  expect(report.residuals.some(x=>x.path.endsWith('/partition'))).toBe(true);
  expect(report.candidate).not.toContain('ON [ps_umf_ship]');
  const binding=structuredClone(fixture.binding);binding.extensions['umf.binding'].fields.splice(2,1);
  const element=fixture.logical.modules[0].elements[0].extensions['umf.ddd'];
  const logical=structuredClone(fixture.logical);logical.modules[0].elements[0].extensions['umf.ddd']={...element,fields:{id:element.fields.id,email:element.fields.email}};
  binding.extensions['umf.binding'].logical.documentId=logical.id;
  const strict=projectBindingTablesToSqlServer(logical as Document,binding as Document,fixture.policy,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  expect(strict.residuals.some(x=>x.reason.includes('does not emit a primary or unique key'))).toBe(true);
});

test('@covers US-046-AC3: document-column type and path conflicts block before native DDL',()=>{
  const wrong=structuredClone(fixture.binding);wrong.extensions['umf.binding'].fields[1].column='payload';
  expect(()=>project(wrong)).toThrow();
  const duplicate=structuredClone(fixture.binding),logical=structuredClone(fixture.logical);
  logical.modules[0].elements[0].extensions['umf.ddd'].fields.other={type:{kind:'scalar',name:'string'},cardinality:'optional'};
  duplicate.extensions['umf.binding'].fields.push({module:'sales',element:'Item',field:'other',storage:'embedded',documentColumn:'payload',path:['customer','region']});
  expect(()=>projectBindingTablesToSqlServer(logical as Document,duplicate as Document,fixture.policy,'report')).toThrow();
});

test('@covers US-046-AC6 @covers US-046-AC7: authored and native archives remain separate',async()=>{
  const nativeSource=await Bun.file('fixtures/binding/sqlserver-tables/catalog.json').text();
  const report=projectBindingTablesToSqlServer(fixture.logical as Document,fixture.binding as Document,fixture.policy,'report',nativeSource);
  expect(report.nativeSource).toBe(nativeSource);
  expect(report.binding).toEqual(fixture.binding);
  expect(JSON.parse(exportSqlServerCatalog(report.nativeArchive!))).toEqual(JSON.parse(nativeSource));
});
