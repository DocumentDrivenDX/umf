// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runReferenceLinksOwnerCases} from '../tools/security/reference-links-owner-cases';
test('original reference links preserve qualified ordered occurrences without type promotion',()=>{const rows=runReferenceLinksOwnerCases();expect(rows.length).toBeGreaterThan(35);for(const row of rows)expect(row.passed).toBe(true)});
