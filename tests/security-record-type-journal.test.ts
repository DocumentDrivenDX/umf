// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runRecordTypeJournalCases} from '../tools/security/record-type-journal-cases';
test('explicit transition journal reconciles multiple typed Fields without issuer authority',()=>{const rows=runRecordTypeJournalCases();expect(rows.length).toBeGreaterThan(30);for(const row of rows)expect(row.passed).toBe(true)});
