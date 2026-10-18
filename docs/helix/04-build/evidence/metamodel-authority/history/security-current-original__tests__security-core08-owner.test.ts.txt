import {test,expect} from 'bun:test';
import {runCore08OwnerCases} from '../tools/security/core08-owner-cases';
test('versioned original0.8 source owners retain meaning and original0.7 receipts',()=>{const rows=runCore08OwnerCases();expect(rows.length).toBeGreaterThan(40);expect(rows.every(row=>row.passed)).toBe(true)});
