// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runRecordTypeOwnerCases} from '../tools/security/record-type-owner-cases';
test('exact-current type receipts verify consistency without issuer or native authority',()=>{const rows=runRecordTypeOwnerCases();expect(rows.length).toBeGreaterThan(45);for(const row of rows)expect(row.passed).toBe(true)});
