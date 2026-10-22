// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runRecordMembersOwnerCases} from '../tools/security/record-members-owner-cases';
test('original Record membership distinguishes absence empty order and unknown qualifiers',()=>{const rows=runRecordMembersOwnerCases();expect(rows.length).toBeGreaterThan(30);for(const row of rows)expect(row.passed).toBe(true)});
