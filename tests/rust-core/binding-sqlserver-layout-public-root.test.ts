// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {validateSqlServerRelationshipLayout,type Document} from '../../src/index-node-v4';
import {sqlServerPhysicalCases} from '../../scripts/binding/sqlserver-cases';

test('SQL Server relationship layout is natively validated and source-retained',()=>{
 const c=sqlServerPhysicalCases().find(x=>x.id==='keyed-association-and-fk')!;
 const before=JSON.stringify(c);
 const report=validateSqlServerRelationshipLayout(c.logical,c.binding,c.policy.layout,'report');
 expect(report.status).toBe('reported');expect(report.candidate).toEqual(c.policy.layout);expect(report.logical).toEqual(c.logical);expect(report.binding).toEqual(c.binding);expect(JSON.stringify(c)).toBe(before);
 expect(validateSqlServerRelationshipLayout(c.logical,c.binding,c.policy.layout,'strict').status).toBe('blocked');
 const invalid=structuredClone(c.policy.layout);invalid.relationshipLayouts[0]!.targetComponents[0]!.keyField.element='field_missing';
 expect(validateSqlServerRelationshipLayout(c.logical,c.binding,invalid,'report').status).toBe('blocked');
},30000);
