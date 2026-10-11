import {test,expect} from 'bun:test';
import {runScalarOwnerCases} from '../tools/security/scalar-owner-cases';
test('original scalar owner preserves label role source context and refuses malformed inputs',()=>{const rows=runScalarOwnerCases();expect(rows.length).toBeGreaterThan(30);for(const row of rows)expect(row.passed).toBe(true)});
