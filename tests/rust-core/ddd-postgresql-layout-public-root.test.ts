// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {validatePostgresqlRelationshipLayout} from '../../src/index-node-v4';
import {postgresqlLayoutCase} from '../../scripts/relationship-postgresql-layout-cases';

test('DDD PostgreSQL relationship layout uses the native public route and retains all source inputs',()=>{
 const c=postgresqlLayoutCase(),before=structuredClone(c);
 const report=validatePostgresqlRelationshipLayout(c.logical,c.binding,c.policy,'report');
 expect(report.status).toBe('reported');expect(report.candidate).toEqual(c.policy);
 expect(report.logical).toEqual(c.logical);expect(report.binding).toEqual(c.binding);expect(report.policy).toEqual(c.policy);
 expect(c).toEqual(before);
 const strict=validatePostgresqlRelationshipLayout(c.logical,c.binding,c.policy,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
 const invalid=structuredClone(c.policy);invalid.keyLayouts[0]!.components[0]!.keyField.element='missing-field';
 const refused=validatePostgresqlRelationshipLayout(c.logical,c.binding,invalid,'report');
 expect(refused.status).toBe('blocked');expect(refused.diagnostics.some(d=>d.code==='POSTGRESQL_LAYOUT_ORDER'||d.code==='POSTGRESQL_LAYOUT_COMPONENT')).toBe(true);
});
