import {test,expect} from 'bun:test';
import {runCurrentCoreOwnerCases} from '../tools/security/current-core-owner-cases';
test('current source owners retain meaning and reject retired envelopes',()=>{const rows=runCurrentCoreOwnerCases();expect(rows.length).toBeGreaterThan(40);expect(rows.every(row=>row.passed)).toBe(true)});
